"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import SearchableSelect from "@/components/ui/searchable-select";
import StatCard from "@/components/ui/stat-card";
import CompactToggle from "@/components/ui/compact-toggle";
import { useToast } from "@/components/ui/use-toast";
import { downloadCsv } from "@/components/ui/csv";

export type LedgerCustomer = {
  id: string;
  name: string;
  code: string | null;
  balance: number | string;
};

type LedgerRow = {
  id: string;
  entry_date: string;
  type: string;
  description: string | null;
  debit: number | string;
  credit: number | string;
  balance_after: number | string;
  created_at: string;
};

const TYPE_COLOR: Record<string, string> = {
  invoice: "bg-blue-100 text-blue-700",
  payment: "bg-emerald-100 text-emerald-700",
  return: "bg-amber-100 text-amber-700",
  advance: "bg-violet-100 text-violet-700",
  adjustment: "bg-rose-100 text-rose-700",
};

export default function LedgerClient({ customers }: { customers: LedgerCustomer[] }) {
  const supabase = createClient();
  const [customerId, setCustomerId] = useState<string>(customers[0]?.id ?? "");
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [compact, setCompact] = useState(false);
  const { showToast, toastView } = useToast();

  useEffect(() => {
    if (!customerId) {
      setRows([]);
      return;
    }
    setLoading(true);
    supabase
      .from("customer_ledger")
      .select("*")
      .eq("customer_id", customerId)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setRows((data ?? []) as LedgerRow[]);
        setLoading(false);
      });
  }, [customerId, supabase]);

  const selected = customers.find((c) => c.id === customerId);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        (r.description ?? "").toLowerCase().includes(needle) ||
        r.type.toLowerCase().includes(needle)
    );
  }, [rows, q]);

  const summary = useMemo(() => {
    const debit = filtered.reduce((s, r) => s + Number(r.debit), 0);
    const credit = filtered.reduce((s, r) => s + Number(r.credit), 0);
    const closing = filtered.length ? Number(filtered[0].balance_after) : 0;
    return { debit, credit, closing };
  }, [filtered]);

  function exportCsv() {
    downloadCsv(
      `ledger-${(selected?.code ?? customerId).replace(/[^a-z0-9-]/gi, "")}-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Date", "Type", "Description", "Debit", "Credit", "Balance"],
      filtered.map((r) => [r.entry_date, r.type, r.description ?? "-", Number(r.debit), Number(r.credit), Number(r.balance_after)])
    );
    showToast("success", `Exported ${filtered.length} ledger entries for ${selected?.name ?? "customer"}`);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Customer Ledger</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Running statement for one customer — invoices, payments, returns and advances.
          </p>
        </div>
        <button
          onClick={exportCsv}
          className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
          Export CSV
        </button>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchableSelect
            value={customerId}
            onChange={setCustomerId}
            options={customers.map((c) => ({ value: c.id, label: `${c.name} (${c.code ?? "-"})` }))}
            placeholder="Select customer…"
            searchPlaceholder="Search customer…"
            showClear={false}
            className="w-full max-w-sm"
          />
          <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 dark:bg-white/5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Balance</span>
            <span className={`text-sm font-bold ${Number(selected?.balance ?? 0) > 0 ? "text-rose-600" : "text-emerald-600"}`}>
              {inr(selected?.balance ?? 0)}
            </span>
            <span className="text-[11px] text-slate-400">{Number(selected?.balance ?? 0) > 0 ? "payable" : "in credit"}</span>
          </div>
          <CompactToggle value={compact} onChange={setCompact} storageKey="sccomm-ledger-compact" />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total Debited"
          value={inr(summary.debit)}
          sub="Sales & advances billed"
          icon="M12 15V3m0 12 4-4m-4 4-4-4M3 17v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2"
          grad="from-rose-500 to-pink-600"
        />
        <StatCard
          label="Total Credited"
          value={inr(summary.credit)}
          sub="Payments received"
          icon="M12 3v12m0 0 4-4m-4 4-4-4M3 17v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2"
          grad="from-emerald-500 to-teal-600"
        />
        <StatCard
          label="Closing Balance"
          value={inr(summary.closing)}
          sub="After last entry"
          icon="M12 3v18M8 7h7a2 2 0 0 1 0 4H9a2 2 0 0 0 0 4h7"
          grad="from-blue-500 to-indigo-600"
        />
        <StatCard
          label="Entries"
          value={String(filtered.length)}
          sub={`${filtered.length} of ${rows.length} rows`}
          icon="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
          grad="from-violet-500 to-purple-600"
        />
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search description or type…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900"
          />
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-white/10">
        <table className={`w-full text-left text-sm ${compact ? "rows-compact" : ""}`}>
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 dark:border-white/10">
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 font-medium">Description</th>
              <th className="px-5 py-3 text-right font-medium">Debit</th>
              <th className="px-5 py-3 text-right font-medium">Credit</th>
              <th className="px-5 py-3 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-slate-500">
                  {rows.length === 0 ? "No ledger entries yet for this customer." : "No entries match your search."}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 transition last:border-0 hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5">
                <td className="px-5 py-3 text-slate-500">{r.entry_date}</td>
                <td className="px-5 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${TYPE_COLOR[r.type] || "bg-slate-100 text-slate-600"}`}>
                    {r.type}
                  </span>
                </td>
                <td className="px-5 py-3 text-slate-900 dark:text-white">{r.description || "-"}</td>
                <td className="px-5 py-3 text-right font-medium text-rose-600">{Number(r.debit) > 0 ? inr(r.debit) : ""}</td>
                <td className="px-5 py-3 text-right font-medium text-emerald-600">{Number(r.credit) > 0 ? inr(r.credit) : ""}</td>
                <td className={`px-5 py-3 text-right font-semibold ${Number(r.balance_after) > 0 ? "text-slate-900 dark:text-white" : "text-emerald-600"}`}>
                  {inr(r.balance_after)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {toastView}
    </div>
  );
}