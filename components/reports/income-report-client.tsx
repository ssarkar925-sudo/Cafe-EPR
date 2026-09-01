"use client";

import { useMemo, useState } from "react";
import { inr } from "@/lib/format";

type Row = {
  transaction_number: string;
  service_type: string;
  amount: string | number;
  service_fee: string | number;
  portal_charge: string | number;
  portal_commission: string | number;
  status: string;
  transaction_date: string;
  created_at: string;
};

type SortKey = "date" | "transaction" | "service" | "principal" | "income";
type Mark = "" | "reviewed" | "verified" | "follow-up" | "reconciled" | "attention";

const SERVICE_LABELS: Record<string, string> = {
  aeps: "AEPS",
  dmt: "DMT",
  upi: "UPI",
  recharge: "Recharge / Google Play",
  google_play_recharge: "Google Play Recharge",
  google_play: "Google Play Recharge",
  bill_payment: "Bill Payment",
  utility_bill: "Bill Payment",
};

const label = (service: string) => SERVICE_LABELS[service] ?? service.replaceAll("_", " ");

export default function IncomeReportClient({ rows, from, to }: { rows: Row[]; from: string; to: string }) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [markFilter, setMarkFilter] = useState<"all" | Mark>("all");

  const incomeRows = useMemo(() => rows.map((r) => ({
    ...r,
    fee: Number(r.service_fee) || 0,
    commission: Number(r.portal_commission) || 0,
    portalCharge: Number(r.portal_charge) || 0,
  })), [rows]);

  const visibleRows = useMemo(() => {
    const filtered = incomeRows.filter((r) => markFilter === "all" || (marks[r.transaction_number] || "") === markFilter);
    return [...filtered].sort((a, b) => {
      let result = 0;
      if (sortKey === "date") result = `${a.transaction_date}${a.created_at}`.localeCompare(`${b.transaction_date}${b.created_at}`);
      if (sortKey === "transaction") result = a.transaction_number.localeCompare(b.transaction_number);
      if (sortKey === "service") result = label(a.service_type).localeCompare(label(b.service_type));
      if (sortKey === "principal") result = Number(a.amount) - Number(b.amount);
      if (sortKey === "income") result = (a.fee + a.portalCharge + a.commission) - (b.fee + b.portalCharge + b.commission);
      return sortAsc ? result : -result;
    });
  }, [incomeRows, markFilter, marks, sortKey, sortAsc]);

  const selectedVisibleRows = visibleRows.filter((r) => selected.includes(r.transaction_number));
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((r) => selected.includes(r.transaction_number));

  const serviceTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of incomeRows) {
      const name = label(r.service_type);
      map.set(name, (map.get(name) ?? 0) + r.fee + r.commission + r.portalCharge);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [incomeRows]);

  const serviceFees = incomeRows.reduce((s, r) => s + r.fee + r.portalCharge, 0);
  const commissions = incomeRows.reduce((s, r) => s + r.commission, 0);
  const totalIncome = serviceFees + commissions;
  const principal = incomeRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const exportCsv = () => {
    const header = ["Date", "Transaction", "Service", "Principal", "Service Fee", "Portal Charge", "Commission", "Income Credit", "Mark"];
    const body = incomeRows.map((r) => [r.transaction_date, r.transaction_number, label(r.service_type), Number(r.amount), r.fee, r.portalCharge, r.commission, r.fee + r.portalCharge + r.commission, marks[r.transaction_number] || ""]);
    const csv = [header, ...body].map((line) => line.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cafe-erp-income-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleOne = (id: string) => setSelected((prev) => prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]);
  const toggleAll = () => setSelected((prev) => {
    if (allVisibleSelected) return prev.filter((id) => !visibleRows.some((r) => r.transaction_number === id));
    return Array.from(new Set([...prev, ...visibleRows.map((r) => r.transaction_number)]));
  });
  const markSelected = (mark: Mark) => {
    if (!mark || selectedVisibleRows.length === 0) return;
    setMarks((prev) => {
      const next = { ...prev };
      selectedVisibleRows.forEach((r) => { next[r.transaction_number] = mark; });
      return next;
    });
  };
  const clearMarks = () => {
    if (selectedVisibleRows.length === 0) return;
    setMarks((prev) => {
      const next = { ...prev };
      selectedVisibleRows.forEach((r) => { delete next[r.transaction_number]; });
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Financial reporting</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">Income Breakdown</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Posted income from service fees, portal charges and commission income.</p>
        </div>
        <button onClick={exportCsv} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">Export CSV</button>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">From<input name="from" type="date" defaultValue={from} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-white/10 dark:bg-slate-950" /></label>
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">To<input name="to" type="date" defaultValue={to} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-white/10 dark:bg-slate-950" /></label>
        <button className="rounded-lg border border-slate-300 px-4 py-2 font-semibold dark:border-white/10">Apply</button>
      </form>

      <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-5">
        {[["Transactions", String(incomeRows.length)], ["Principal processed", inr(principal)], ["Service / fee income", inr(serviceFees)], ["Commission income", inr(commissions)], ["Total income", inr(totalIncome)]].map(([k,v]) => (
          <div key={k} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{k}</div><div className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{v}</div></div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 font-semibold dark:border-white/10">Income by service</div>
        <div className="divide-y divide-slate-100 dark:divide-white/5">{serviceTotals.map(([name, value]) => <div key={name} className="flex items-center justify-between px-5 py-3 text-sm"><span>{name}</span><span className="font-semibold">{inr(value)}</span></div>)}</div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <span className="text-sm font-semibold">Report controls</span>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-950">
          <option value="date">Date</option><option value="transaction">Transaction</option><option value="service">Service</option><option value="principal">Principal</option><option value="income">Income</option>
        </select>
        <button type="button" onClick={() => setSortAsc((v) => !v)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-white/10">{sortAsc ? "↑ Ascending" : "↓ Descending"}</button>
        <select value={markFilter} onChange={(e) => setMarkFilter(e.target.value as "all" | Mark)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-950">
          <option value="all">All marks</option><option value="reviewed">Reviewed</option><option value="verified">Verified</option><option value="follow-up">Follow-up</option><option value="reconciled">Reconciled</option><option value="attention">Needs Attention</option>
        </select>
        <span className="ml-auto text-sm text-slate-500">{selected.length} selected</span>
        <select defaultValue="" onChange={(e) => { markSelected(e.target.value as Mark); e.currentTarget.value = ""; }} disabled={selectedVisibleRows.length === 0} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50 dark:border-white/10 dark:bg-slate-950">
          <option value="">Mark selected…</option><option value="reviewed">Reviewed</option><option value="verified">Verified</option><option value="follow-up">Follow-up</option><option value="reconciled">Reconciled</option><option value="attention">Needs Attention</option>
        </select>
        <button type="button" onClick={clearMarks} disabled={selectedVisibleRows.length === 0} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50 dark:border-white/10">Clear marks</button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <table className="min-w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left dark:border-white/10">
            <th className="w-10 px-4 py-3"><input aria-label="Select all visible rows" type="checkbox" checked={allVisibleSelected} onChange={toggleAll} /></th>
            {["Date","Transaction","Service","Principal","Fee","Portal Charge","Commission","Income","Mark"].map(h => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}
          </tr></thead>
          <tbody>
            {visibleRows.map(r => {
              const mark = marks[r.transaction_number] || "";
              return <tr key={r.transaction_number} className="border-b border-slate-100 dark:border-white/5">
                <td className="px-4 py-3"><input aria-label={`Select ${r.transaction_number}`} type="checkbox" checked={selected.includes(r.transaction_number)} onChange={() => toggleOne(r.transaction_number)} /></td>
                <td className="px-4 py-3">{r.transaction_date}</td><td className="px-4 py-3 font-medium">{r.transaction_number}</td><td className="px-4 py-3">{label(r.service_type)}</td><td className="px-4 py-3">{inr(Number(r.amount))}</td><td className="px-4 py-3">{inr(r.fee)}</td><td className="px-4 py-3">{inr(r.portalCharge)}</td><td className="px-4 py-3">{inr(r.commission)}</td><td className="px-4 py-3 font-semibold">{inr(r.fee+r.portalCharge+r.commission)}</td>
                <td className="px-4 py-3"><span className={mark ? "inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700" : "text-slate-400"}>{mark || "—"}</span></td>
              </tr>;
            })}
            {visibleRows.length === 0 && <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-500">No report rows match the selected filter.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">Selection and review marks are report-only controls; they do not modify financial journal entries.</p>
    </div>
  );
}
