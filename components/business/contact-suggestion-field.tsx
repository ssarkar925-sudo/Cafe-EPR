"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CustomerRow, Txn } from "./business-client";

/** Row shape of public.saved_contacts (see supabase/saved-contacts.sql) */
type SavedContactRow = {
  kind: ContactMode;
  name: string | null;
  mobile: string | null;
  bank: string | null;
  ifsc: string | null;
  account_number: string | null;
  upi_id: string | null;
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContactMode = "sender" | "beneficiary" | "upi_receiver";

export type ContactSuggestion = {
  label: string;
  sublabel?: string;
  /** Number of recent transactions — used as sort key (most used first) */
  count: number;
  // sender fields
  sender_name?: string;
  sender_mobile?: string;
  // beneficiary fields
  beneficiary_name?: string;
  beneficiary_mobile?: string;
  beneficiary_bank?: string;
  beneficiary_ifsc?: string;
  beneficiary_account?: string;
  // upi_receiver fields
  upi_id?: string;
  receiver_name?: string;
};

// ─── Suggestion builders ───────────────────────────────────────────────────────

function buildSenderSuggestions(
  txns: Txn[],
  customers: CustomerRow[]
): ContactSuggestion[] {
  // Group DMT transactions by normalised sender key
  const map = new Map<string, ContactSuggestion>();

  for (const t of txns) {
    if (t.service_type !== "dmt") continue;
    const name = t.sender_name?.trim();
    if (!name) continue;
    const mobile = t.sender_mobile?.trim() ?? "";
    const key = `${name.toLowerCase()}|${mobile}`;
    if (map.has(key)) {
      map.get(key)!.count++;
    } else {
      map.set(key, {
        label: name,
        sublabel: mobile || undefined,
        count: 1,
        sender_name: name,
        sender_mobile: mobile || undefined,
      });
    }
  }

  // Also surface customers who share a phone with a sender
  for (const c of customers) {
    if (!c.phone) continue;
    for (const s of map.values()) {
      if (s.sender_mobile === c.phone && !s.sublabel?.includes(c.name)) {
        s.sublabel = `${c.name} · ${c.phone}`;
      }
    }
  }

  return [...map.values()].sort((a, b) => b.count - a.count);
}

function buildBeneficiarySuggestions(txns: Txn[]): ContactSuggestion[] {
  const map = new Map<string, ContactSuggestion>();

  for (const t of txns) {
    if (t.service_type !== "dmt" || t.transfer_method !== "bank_account") continue;
    const acc = t.beneficiary_account?.trim();
    const ifsc = t.beneficiary_ifsc?.trim();
    if (!acc && !ifsc) continue;
    const key = `${ifsc ?? ""}|${acc ?? ""}`;
    if (map.has(key)) {
      map.get(key)!.count++;
    } else {
      const name = t.beneficiary_name?.trim();
      const mobile = t.beneficiary_mobile?.trim();
      const bank = t.beneficiary_bank?.trim();
      const parts: string[] = [];
      if (name) parts.push(name);
      if (bank) parts.push(bank);
      if (acc) parts.push(`A/C …${acc.slice(-4)}`);
      map.set(key, {
        label: parts[0] ?? acc ?? ifsc ?? "Unknown",
        sublabel: parts.slice(1).join(" · ") || undefined,
        count: 1,
        beneficiary_name: name || undefined,
        beneficiary_mobile: mobile || undefined,
        beneficiary_bank: bank || undefined,
        beneficiary_ifsc: ifsc || undefined,
        beneficiary_account: acc || undefined,
      });
    }
  }

  return [...map.values()].sort((a, b) => b.count - a.count);
}

function buildUpiReceiverSuggestions(txns: Txn[]): ContactSuggestion[] {
  const map = new Map<string, ContactSuggestion>();

  for (const t of txns) {
    const upiId = t.upi_id?.trim();
    if (!upiId) continue;
    // Include UPI transactions AND DMT UPI-method transfers
    if (t.service_type !== "upi" && t.service_type !== "dmt") continue;
    const key = upiId.toLowerCase();
    if (map.has(key)) {
      map.get(key)!.count++;
    } else {
      // Use stored receiver_name if available — never fabricate from UPI ID
      const rname = (t as any).receiver_name?.trim() ?? null;
      map.set(key, {
        label: rname ?? upiId,
        sublabel: rname ? upiId : undefined,
        count: 1,
        upi_id: upiId,
        receiver_name: rname ?? undefined,
      });
    }
  }

  return [...map.values()].sort((a, b) => b.count - a.count);
}

function savedToSuggestion(r: SavedContactRow): ContactSuggestion {
  switch (r.kind) {
    case "sender":
      return {
        label: r.name ?? r.mobile ?? "Saved sender",
        sublabel: r.mobile ?? undefined,
        count: 0,
        sender_name: r.name ?? undefined,
        sender_mobile: r.mobile ?? undefined,
      };
    case "beneficiary": {
      const parts: string[] = [];
      if (r.bank) parts.push(r.bank);
      if (r.account_number) parts.push(`A/C …${r.account_number.slice(-4)}`);
      return {
        label: r.name ?? r.account_number ?? "Saved beneficiary",
        sublabel: parts.join(" · ") || undefined,
        count: 0,
        beneficiary_name: r.name ?? undefined,
        beneficiary_mobile: r.mobile ?? undefined,
        beneficiary_bank: r.bank ?? undefined,
        beneficiary_ifsc: r.ifsc ?? undefined,
        beneficiary_account: r.account_number ?? undefined,
      };
    }
    default:
      // upi_receiver — show stored UPI ID only; name only if it was explicitly saved
      return {
        label: r.name ?? r.upi_id ?? "Saved receiver",
        sublabel: r.name ? (r.upi_id ?? undefined) : undefined,
        count: 0,
        upi_id: r.upi_id ?? undefined,
        receiver_name: r.name ?? undefined,
      };
  }
}

/** Stable dedupe identity per mode — a saved row matching a recent txn is hidden. */
function suggestionKey(mode: ContactMode, s: ContactSuggestion): string {
  if (mode === "sender") return `${(s.sender_name ?? s.label).toLowerCase()}|${s.sender_mobile ?? ""}`;
  if (mode === "beneficiary") return `${s.beneficiary_ifsc ?? ""}|${s.beneficiary_account ?? ""}`.toLowerCase();
  return (s.upi_id ?? s.label).toLowerCase();
}

// ─── Component ────────────────────────────────────────────────────────────────

const PLACEHOLDER: Record<ContactMode, string> = {
  sender: "Search recent senders…",
  beneficiary: "Search recent beneficiaries…",
  upi_receiver: "Search recent UPI receivers…",
};

const EMPTY_MSG: Record<ContactMode, string> = {
  sender: "No recent senders found",
  beneficiary: "No recent beneficiaries found",
  upi_receiver: "No recent UPI receivers found",
};

export default function ContactSuggestionField({
  mode,
  txns,
  customers = [],
  onSelect,
  className,
}: {
  mode: ContactMode;
  txns: Txn[];
  customers?: CustomerRow[];
  onSelect: (contact: ContactSuggestion) => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<ContactSuggestion[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch explicitly saved contacts for this mode (opt-in contact book).
  // Failures are silent — recents still work if the table is missing.
  useEffect(() => {
    let cancelled = false;
    createClient()
      .from("saved_contacts")
      .select("kind, name, mobile, bank, ifsc, account_number, upi_id")
      .eq("kind", mode)
      .order("updated_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setSaved((data as SavedContactRow[]).map(savedToSuggestion));
      });
    return () => { cancelled = true; };
  }, [mode]);

  // Priority: recent transactions (usage-sorted) first, then saved contacts.
  const suggestions = useMemo(() => {
    const recents =
      mode === "sender"
        ? buildSenderSuggestions(txns, customers)
        : mode === "beneficiary"
          ? buildBeneficiarySuggestions(txns)
          : buildUpiReceiverSuggestions(txns);
    const seen = new Set(recents.map((s) => suggestionKey(mode, s)));
    return [...recents, ...saved.filter((s) => !seen.has(suggestionKey(mode, s)))];
  }, [mode, txns, customers, saved]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suggestions.slice(0, 8);
    return suggestions
      .filter(
        (s) =>
          s.label.toLowerCase().includes(q) ||
          (s.sublabel ?? "").toLowerCase().includes(q) ||
          (s.sender_mobile ?? "").includes(q) ||
          (s.beneficiary_account ?? "").includes(q) ||
          (s.beneficiary_ifsc ?? "").toLowerCase().includes(q) ||
          (s.upi_id ?? "").toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [query, suggestions]);

  function handleSelect(s: ContactSuggestion) {
    onSelect(s);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  function handleBlur(e: React.FocusEvent) {
    // Close only when focus leaves the entire container
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setOpen(false);
    }
  }

  if (suggestions.length === 0) return null;

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`} onBlur={handleBlur}>
      <div className="relative">
        {/* Search icon */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder={PLACEHOLDER[mode]}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className="w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 py-1.5 pl-8 pr-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-200 dark:focus:bg-slate-800"
        />
        {query && (
          <button
            tabIndex={-1}
            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            aria-label="Clear search"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
          {filtered.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-slate-400">{EMPTY_MSG[mode]}</p>
          ) : (
            <ul className="max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((s, i) => (
                <li key={i}>
                  <button
                    type="button"
                    tabIndex={0}
                    onClick={() => handleSelect(s)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    {/* Icon */}
                    <span className="mt-0.5 text-base">
                      {mode === "sender" ? "👤" : mode === "beneficiary" ? "🏦" : "📲"}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate font-medium text-slate-800 dark:text-slate-100">
                        {s.label}
                      </span>
                      {s.sublabel && (
                        <span className="block truncate text-[11px] text-slate-400">
                          {s.sublabel}
                        </span>
                      )}
                    </span>
                    {s.count > 1 && (
                      <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                        ×{s.count}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
