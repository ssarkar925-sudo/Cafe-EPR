"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/lib/supabase/realtime";
import { inr } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import SettlementFormModal, { SETTLEMENT_TYPES, POOL_LABEL } from "./settlement-form-modal";
import ReasonModal from "@/components/business/business-reason-modal";
import SearchableSelect from "@/components/ui/searchable-select";

export type SettlementRow = {
  id: string;
  settlement_number: string;
  settlement_type: string;
  settlement_date: string;
  from_pool: string;
  to_pool: string;
  direction: string | null;
  amount: number | string;
  reference: string | null;
  remarks: string | null;
  status: string;
  created_at: string;
  profiles: { full_name: string | null } | null;
};

export type SettlementSummary = {
  cash: number;
  bank: number;
  wallet: number;
  dmt: number;
  aeps: number;
  upi_qr: number;
  count: number;
};

const TYPE_META = Object.fromEntries(
  SETTLEMENT_TYPES.map((t) => [
    t.value,
    { label: t.label, from: t.from, to: t.to, grad: t.grad },
  ])
);

const STATUS_PILL: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700",
  reversed: "bg-slate-200 text-slate-600",
};

const ICONS = {
  bank: "M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01",
  cash: "M2 8h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Zm10-3V5H4a2 2 0 0 0-2 2M14 13h.01",
  wallet: "M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2M3 10h18M16 15h2",
  dmt: "M22 2 11 13M22 2 15 22l-4-9-9-4z",
  aeps: "M4 10h16M4 14h16M6 18V7m4 11V7m4 11V7m4 11V7M2 7l10-5 10 5z",
  qr: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14h1M14 20h1M20 20h1",
  arrow: "M5 12h14M13 5l7 7-7 7",
  plus: "M12 5v14M5 12h14",
  reverse: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  search: "M11 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM21 21l-4.35-4.35",
};

const POOL_CARDS = [
  { key: "cash", label: "Cash in Hand", icon: ICONS.cash, grad: "from-indigo-500 to-violet-600" },
  { key: "bank", label: "Bank Balance", icon: ICONS.bank, grad: "from-blue-500 to-indigo-600" },
  { key: "wallet", label: "Wallet Balance", icon: ICONS.wallet, grad: "from-emerald-500 to-teal-600" },
  { key: "dmt", label: "DMT Float", icon: ICONS.dmt, grad: "from-violet-500 to-purple-600" },
  { key: "aeps", label: "AEPS Float", icon: ICONS.aeps, grad: "from-amber-500 to-orange-600" },
  { key: "upi_qr", label: "UPI QR", icon: ICONS.qr, grad: "from-rose-500 to-pink-600" },
];

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-5 w-5"}
    >
      <path d={d} />
    </svg>
  );
}

const inputClass =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

function fmtDate(d: string) {
  if (!d) return "-";
  const dt = new Date(d + (d.length === 10 ? "T00:00:00" : ""));
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function SettlementsClient({
  initialSettlements,
  initialSummary,
}: {
  initialSettlements: SettlementRow[];
  initialSummary: SettlementSummary | null;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<SettlementRow[]>(initialSettlements);
  const [summary, setSummary] = useState<SettlementSummary | null>(initialSummary);
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<SettlementRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useRealtime(["settlements", "cash_entries"]);

  useEffect(() => {
    setRows(initialSettlements);
    setSummary(initialSummary);
  }, [initialSettlements, initialSummary]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (type !== "all" && r.settlement_type !== type) return false;
      if (status !== "all" && r.status !== status) return false;
      if (from && r.settlement_date < from) return false;
      if (to && r.settlement_date > to) return false;
      if (needle) {
        const hay = `${r.settlement_number} ${r.reference ?? ""} ${r.remarks ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, type, status, from, to, query]);

  const refresh = async () => {
    const supabase = createClient();
    const [{ data }, { data: sum }] = await Promise.all([
      supabase
        .from("settlements")
        .select("id, settlement_number, settlement_type, settlement_date, from_pool, to_pool, direction, amount, reference, remarks, status, created_at, profiles(full_name)")
        .order("settlement_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase.rpc("get_settlement_summary"),
    ]);
    const mapped = (data ?? []).map((r: any) => ({
      ...r,
      profiles: r.profiles?.[0] ?? null,
    }));
    setRows(mapped as SettlementRow[]);
    setSummary((sum as SettlementSummary | null) ?? null);
  };

  const create = async (payload: {
    p_settlement_type: string;
    p_settlement_date: string;
    p_amount: number;
    p_reference: string;
    p_remarks: string;
    p_direction: string;
  }) => {
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_settlement", payload);
    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    logAudit({
      action: "create",
      entity: "settlement",
      entity_id: (data as any)?.id,
      description: `Recorded settlement ${(data as any)?.settlement_number}`,
      details: payload,
    });
    setShowForm(false);
    await refresh();
    router.refresh();
  };

  const reverse = async () => {
    if (!reverseTarget) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("reverse_settlement", {
      p_settlement_id: reverseTarget.id,
      p_reason: reason.trim(),
    });
    setBusy(false);
    if (error) {
      alert(error.message);
      setReverseTarget(null);
      setReason("");
      return;
    }
    logAudit({
      action: "reverse",
      entity: "settlement",
      entity_id: reverseTarget.id,
      description: `Reversed settlement ${reverseTarget.settlement_number}`,
    });
    setReverseTarget(null);
    setReason("");
    await refresh();
    router.refresh();
  };

  const exportCsv = () => {
    const head = "Number,Type,Date,From,To,Reference,Amount,Status";
    const lines = filtered.map((r) => {
      const meta = TYPE_META[r.settlement_type];
      return [
        r.settlement_number,
        `"${meta?.label ?? r.settlement_type}"`,
        r.settlement_date,
        POOL_LABEL[r.from_pool],
        POOL_LABEL[r.to_pool],
        `"${(r.reference ?? "").replace(/"/g, '""')}"`,
        Number(r.amount).toFixed(2),
        r.status,
      ].join(",");
    });
    const blob = new Blob(["\uFEFF" + [head, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `settlements-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Settlements</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Fund movements between cash, bank &amp; wallets · {summary?.count ?? 0} recorded
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Export CSV
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:from-blue-700 hover:to-indigo-700"
          >
            <Icon d={ICONS.plus} className="h-4 w-4" />
            New Settlement
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {POOL_CARDS.map((c) => (
          <div
            key={c.key}
            className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${c.grad}`} />
            <div className="flex items-center gap-2">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${c.grad} text-white shadow`}
              >
                <Icon d={c.icon} className="h-4 w-4" />
              </span>
              <p className="text-xs font-medium text-slate-500">{c.label}</p>
            </div>
            <p className="mt-3 text-lg font-bold text-slate-900">
              {inr((summary as any)?.[c.key] ?? 0)}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Icon
            d={ICONS.search}
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search number / reference…"
            className={`${inputClass} pl-9`}
          />
        </div>
        <SearchableSelect
          value={type}
          onChange={setType}
          options={[{ value: "all", label: "All types" }, ...SETTLEMENT_TYPES]}
          searchPlaceholder="Search type…"
          className="w-52"
        />
        <SearchableSelect
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "All statuses" },
            { value: "success", label: "Success" },
            { value: "reversed", label: "Reversed" },
          ]}
          searchPlaceholder="Search status…"
          className="w-44"
        />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
        <span className="text-sm text-slate-400">to</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
        <span className="text-sm text-slate-500">{filtered.length} settlements</span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-4 py-3 font-medium">Number</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Reference</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
              <th className="px-4 py-3 text-center font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Recorded by</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const meta = TYPE_META[r.settlement_type];
              return (
                <tr key={r.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5 font-semibold text-slate-900">
                    {r.settlement_number}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r ${meta?.grad ?? "from-slate-400 to-slate-500"} px-2.5 py-1 text-xs font-semibold text-white`}
                    >
                      <Icon d={ICONS.arrow} className="h-3 w-3" />
                      {POOL_LABEL[r.from_pool]} → {POOL_LABEL[r.to_pool]}
                    </span>
                    <p className="mt-1 text-xs text-slate-500">{meta?.label}</p>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{fmtDate(r.settlement_date)}</td>
                  <td className="px-4 py-2.5 text-slate-500">{r.reference || "-"}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-900">
                    {inr(r.amount)}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span
                      className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${
                        STATUS_PILL[r.status] ?? "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {r.profiles?.full_name || "-"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {r.status === "success" && (
                      <button
                        onClick={() => setReverseTarget(r)}
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
                      >
                        <Icon d={ICONS.reverse} className="h-3.5 w-3.5" />
                        Reverse
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                  No settlements match. Record your first fund movement.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <SettlementFormModal
        open={showForm}
        busy={saving}
        onClose={() => setShowForm(false)}
        onSave={create}
      />

      {reverseTarget && (
        <ReasonModal
          title="Reverse settlement"
          note={`This will reverse ${reverseTarget.settlement_number} and post an opposite cash entry. This action cannot be undone.`}
          confirmLabel="Reverse settlement"
          busy={busy}
          reason={reason}
          setReason={setReason}
          onClose={() => {
            setReverseTarget(null);
            setReason("");
          }}
          onConfirm={reverse}
        />
      )}
    </div>
  );
}
