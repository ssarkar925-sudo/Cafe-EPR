"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { HUBS } from "@/lib/navigation/hub-navigation";

type Result = {
  type: string;
  title: string;
  subtitle?: string;
  href: string;
};

// Navigation search is derived from the canonical Hub registry. This prevents
// a second, drifting list of application pages from becoming another source
// of truth. HUBS owns navigation; search only indexes it.
const STATIC_PAGES = HUBS.flatMap((hub) =>
  hub.modules.flatMap((module) =>
    module.items.map((item) => ({
      title: item.label,
      subtitle: `${hub.label} · ${module.label} · ${item.description}`,
      href: item.href,
      keywords: [
        hub.id,
        hub.label,
        module.id,
        module.label,
        item.label,
        item.description,
      ],
    })),
  ),
);

export default function GlobalSearch({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const supabaseRef = useMemo(() => supabase, [supabase]);

  useEffect(() => {
    if (open) {
      setQ("");
      setResults([]);
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const needle = q.trim().toLowerCase();
    if (!needle) {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const out: Result[] = [];

      // 1. Search canonical Hub pages.
      for (const page of STATIC_PAGES) {
        if (
          page.title.toLowerCase().includes(needle) ||
          page.subtitle.toLowerCase().includes(needle) ||
          page.keywords.some((k) => k.toLowerCase().includes(needle))
        ) {
          out.push({
            type: "Navigation",
            title: page.title,
            subtitle: page.subtitle,
            href: page.href,
          });
        }
      }

      const ilike = `%${needle}%`;

      const [cust, prods, servs, invs] = await Promise.all([
        supabaseRef
          .from("customers")
          .select("id, name, code, phone, email")
          .or(`name.ilike.${ilike},phone.ilike.${ilike},email.ilike.${ilike}`)
          .limit(5),
        supabaseRef
          .from("products")
          .select("id, name, code")
          .eq("is_active", true)
          .ilike("name", ilike)
          .limit(5),
        supabaseRef
          .from("services")
          .select("id, name")
          .eq("is_active", true)
          .ilike("name", ilike)
          .limit(5),
        supabaseRef
          .from("invoices")
          .select("id, invoice_number, customers(name), total")
          .ilike("invoice_number", ilike)
          .limit(5),
      ]);

      if (cancelled) return;

      for (const c of cust.data ?? [])
        out.push({
          type: "Customer",
          title: c.name as string,
          subtitle: `${c.code ?? ""}${c.phone ? " · " + c.phone : ""}`.trim(),
          href: `/customers/${c.id}`,
        });
      for (const p of prods.data ?? [])
        out.push({
          type: "Product",
          title: p.name as string,
          subtitle: (p.code as string) ?? "",
          href: `/catalog/products?q=${encodeURIComponent(p.name as string)}`,
        });
      for (const s of servs.data ?? [])
        out.push({
          type: "Service",
          title: s.name as string,
          subtitle: undefined,
          href: "/catalog/services",
        });
      for (const i of invs.data ?? [])
        out.push({
          type: "Invoice",
          title: i.invoice_number as string,
          subtitle: `${(i as any).customers?.name ?? "Walk-in"} · ${inr(Number(i.total))}`,
          href: `/invoices?q=${encodeURIComponent(i.invoice_number as string)}`,
        });

      setResults(out);
      setSelected(0);
      setLoading(false);
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, open, supabaseRef]);

  function go(idx: number) {
    const r = results[idx];
    if (!r) return;
    onClose();
    setQ("");
    window.location.href = r.href;
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        go(selected);
      } else if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, selected]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 p-4 pt-20 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[#0f172a] text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <svg
            className="h-5 w-5 text-slate-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search hubs, modules, customers, invoices, products..."
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-400 outline-none"
          />
          {loading && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-blue-500" />
          )}
          <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
            ESC
          </kbd>
        </div>

        {results.length > 0 ? (
          <ul className="max-h-96 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-white/10">
            {results.map((r, idx) => {
              const active = idx === selected;
              return (
                <li key={r.type + r.href + r.title}>
                  <button
                    type="button"
                    onClick={() => go(idx)}
                    onMouseEnter={() => setSelected(idx)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition ${
                      active ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider ${
                            active
                              ? "bg-white/20 text-white"
                              : "bg-white/10 text-slate-400"
                          }`}
                        >
                          {r.type}
                        </span>
                        <span className="truncate font-semibold">{r.title}</span>
                      </div>
                      {r.subtitle && (
                        <p
                          className={`truncate text-[11px] mt-0.5 ${
                            active ? "text-blue-100" : "text-slate-400"
                          }`}
                        >
                          {r.subtitle}
                        </p>
                      )}
                    </div>
                    <span className="text-[11px] opacity-60">↵</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : q.trim() && !loading ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No matching hubs, modules, customers, or products found for &ldquo;{q}&rdquo;.
          </div>
        ) : (
          <div className="p-4 text-xs text-slate-400">
            <p className="font-bold uppercase tracking-wider text-[10px] text-slate-500 mb-2">
              Popular Quick Jumps
            </p>
            <div className="grid grid-cols-2 gap-1.5 text-slate-300">
              <button onClick={() => { onClose(); window.location.href = "/ai/self-audit"; }} className="text-left rounded-lg p-1.5 hover:bg-white/5 hover:text-white">
                🔍 Financial Self-Audit
              </button>
              <button onClick={() => { onClose(); window.location.href = "/reports/tax-preparation"; }} className="text-left rounded-lg p-1.5 hover:bg-white/5 hover:text-white">
                📑 Tax Preparation / ITR
              </button>
              <button onClick={() => { onClose(); window.location.href = "/reports/gst"; }} className="text-left rounded-lg p-1.5 hover:bg-white/5 hover:text-white">
                🏛️ GST Reports
              </button>
              <button onClick={() => { onClose(); window.location.href = "/finance/cashbook"; }} className="text-left rounded-lg p-1.5 hover:bg-white/5 hover:text-white">
                💵 Daily Cash Book
              </button>
              <button onClick={() => { onClose(); window.location.href = "/finance/day-close"; }} className="text-left rounded-lg p-1.5 hover:bg-white/5 hover:text-white">
                🔒 Day Close &amp; Rollover
              </button>
              <button onClick={() => { onClose(); window.location.href = "/security"; }} className="text-left rounded-lg p-1.5 hover:bg-white/5 hover:text-white">
                🛡️ Security Center
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
