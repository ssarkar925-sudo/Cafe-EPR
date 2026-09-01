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
  cogs?: string | number;
  source?: string;
};

type SortKey = "date" | "transaction" | "service" | "principal" | "income";
type Mark = "" | "reviewed" | "verified" | "follow-up" | "reconciled" | "attention";

const SERVICE_LABELS: Record<string, string> = {
  aeps: "AEPS Cash Out",
  dmt: "Money Transfer (DMT)",
  upi: "UPI Collections",
  recharge: "Recharge / Google Play",
  google_play_recharge: "Google Play Recharge",
  google_play: "Google Play Recharge",
  bill_payment: "Bill Payment",
  utility_bill: "Utility Bill",
  pos_sale: "POS Quick Sales",
  pos_invoice: "POS Invoices",
};

const label = (service: string) => SERVICE_LABELS[service] ?? service.replaceAll("_", " ");

function getRowIncome(r: { service_type: string; amount: number | string; fee: number; commission: number; portalCharge: number }) {
  if (r.service_type === "pos_invoice" || r.service_type === "pos_sale") {
    return Number(r.amount) || 0;
  }
  return (r.fee || 0) + (r.portalCharge || 0) + (r.commission || 0);
}

export default function IncomeReportClient({ rows, from, to }: { rows: Row[]; from: string; to: string }) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [serviceFilter, setServiceFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [markFilter, setMarkFilter] = useState<"all" | Mark>("all");

  const incomeRows = useMemo(() => rows.map((r) => ({
    ...r,
    fee: Number(r.service_fee) || 0,
    commission: Number(r.portal_commission) || 0,
    portalCharge: Number(r.portal_charge) || 0,
    cost: Number(r.cogs) || 0,
  })), [rows]);

  const serviceOptions = useMemo(() => Array.from(new Set(incomeRows.map((r) => r.service_type))).sort((a, b) => label(a).localeCompare(label(b))), [incomeRows]);

  const filteredRows = useMemo(() => incomeRows.filter((r) =>
    (serviceFilter === "all" || r.service_type === serviceFilter) &&
    (markFilter === "all" || (marks[r.transaction_number] || "") === markFilter)
  ), [incomeRows, serviceFilter, markFilter, marks]);

  const visibleRows = useMemo(() => [...filteredRows].sort((a, b) => {
    let result = 0;
    if (sortKey === "date") result = `${a.transaction_date}${a.created_at}`.localeCompare(`${b.transaction_date}${b.created_at}`);
    if (sortKey === "transaction") result = a.transaction_number.localeCompare(b.transaction_number);
    if (sortKey === "service") result = label(a.service_type).localeCompare(label(b.service_type));
    if (sortKey === "principal") result = Number(a.amount) - Number(b.amount);
    if (sortKey === "income") result = getRowIncome(a) - getRowIncome(b);
    return sortAsc ? result : -result;
  }), [filteredRows, sortKey, sortAsc]);

  const selectedVisibleRows = visibleRows.filter((r) => selected.includes(r.transaction_number));
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((r) => selected.includes(r.transaction_number));

  // Service breakdown totals
  const serviceTotals = useMemo(() => {
    const map = new Map<string, { income: number; count: number; volume: number }>();
    for (const r of filteredRows) {
      const name = label(r.service_type);
      const inc = getRowIncome(r);
      const prev = map.get(name) ?? { income: 0, count: 0, volume: 0 };
      map.set(name, {
        income: prev.income + inc,
        count: prev.count + 1,
        volume: prev.volume + (Number(r.amount) || 0),
      });
    }
    return Array.from(map.entries()).sort((a, b) => b[1].income - a[1].income);
  }, [filteredRows]);

  // 1. Service transactions (AEPS, DMT, UPI, Bill Payment, Recharge, etc.)
  const serviceRows = filteredRows.filter((r) => r.service_type !== "pos_sale" && r.service_type !== "pos_invoice");
  const serviceFees = serviceRows.reduce((s, r) => s + r.fee + r.portalCharge, 0);
  const commissions = serviceRows.reduce((s, r) => s + r.commission, 0);
  const serviceIncome = serviceFees + commissions;

  // 2. POS transactions (Invoices & Quick Sales)
  const posInvoiceRows = filteredRows.filter((r) => r.service_type === "pos_invoice");
  const posQuickRows = filteredRows.filter((r) => r.service_type === "pos_sale");
  const posInvoiceRevenue = posInvoiceRows.reduce((s, r) => s + Number(r.amount), 0);
  const posQuickRevenue = posQuickRows.reduce((s, r) => s + Number(r.amount), 0);
  const posRevenue = posInvoiceRevenue + posQuickRevenue;
  const posCogs = posQuickRows.reduce((s, r) => s + Number(r.cost), 0);
  const posGrossProfit = posQuickRevenue - posCogs;

  // 3. Total Income (POS Revenue + Service Income)
  const totalIncome = posRevenue + serviceIncome;

  // 4. Principal / Gross Volume
  const principal = filteredRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const exportCsv = () => {
    const header = [
      "Date",
      "Transaction",
      "Service",
      "Source",
      "Principal / Sales",
      "COGS",
      "Service Fee",
      "Portal Charge",
      "Commission",
      "Income / Revenue",
      "Mark",
    ];
    const body = filteredRows.map((r) => {
      const isPos = r.service_type === "pos_sale" || r.service_type === "pos_invoice";
      const isQuickPos = r.service_type === "pos_sale";
      const income = getRowIncome(r);
      return [
        r.transaction_date,
        r.transaction_number,
        label(r.service_type),
        r.source || "Service",
        Number(r.amount) || 0,
        isQuickPos ? r.cost : "",
        isPos ? "" : r.fee,
        isPos ? "" : r.portalCharge,
        isPos ? "" : r.commission,
        income,
        marks[r.transaction_number] || "",
      ];
    });
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
  const toggleAll = () => setSelected((prev) => allVisibleSelected ? prev.filter((id) => !visibleRows.some((r) => r.transaction_number === id)) : Array.from(new Set([...prev, ...visibleRows.map((r) => r.transaction_number)])));
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
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Financial reporting</div>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 dark:text-white">Income Breakdown</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Comprehensive revenue from POS sales, service fees, and partner commissions.</p>
        </div>
        <button onClick={exportCsv} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 transition">
          📥 Export CSV
        </button>
      </div>

      {/* Date & Filter Bar */}
      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          From
          <input name="from" type="date" defaultValue={from} className="mt-1 block rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-950" />
        </label>
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          To
          <input name="to" type="date" defaultValue={to} className="mt-1 block rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-950" />
        </label>
        <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition">
          Apply Range
        </button>
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 ml-auto">
          Service Type
          <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} className="mt-1 block min-w-56 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-950 font-medium">
            <option value="all">All Services &amp; Sales</option>
            {serviceOptions.map((service) => (
              <option key={service} value={service}>{label(service)}</option>
            ))}
          </select>
        </label>
      </form>

      {/* Primary KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. Total Income (Hero KPI) */}
        <div className="rounded-2xl border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-5 shadow-sm dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Total Income</div>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Net Revenue</span>
          </div>
          <div className="mt-2 text-3xl font-black text-emerald-950 dark:text-white">{inr(totalIncome)}</div>
          <div className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-400/80 font-medium">POS Sales + Service Income</div>
        </div>

        {/* 2. POS Sales / Revenue */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">POS Revenue</div>
            <span className="text-[11px] font-bold text-blue-600">{posInvoiceRows.length + posQuickRows.length} orders</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{inr(posRevenue)}</div>
          <div className="mt-1 text-xs text-slate-500">Invoices: {inr(posInvoiceRevenue)} · Quick: {inr(posQuickRevenue)}</div>
        </div>

        {/* 3. Service Income (Fees + Commissions) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Service Income</div>
            <span className="text-[11px] font-bold text-indigo-600">{serviceRows.length} txns</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{inr(serviceIncome)}</div>
          <div className="mt-1 text-xs text-slate-500">Fees: {inr(serviceFees)} · Comm: {inr(commissions)}</div>
        </div>

        {/* 4. Quick Sale Gross Profit */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Quick Sale Gross Profit</div>
            {posCogs > 0 && <span className="text-[10px] font-bold text-amber-600">COGS: {inr(posCogs)}</span>}
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{inr(posGrossProfit)}</div>
          <div className="mt-1 text-xs text-slate-500">Quick Sales ({inr(posQuickRevenue)}) − COGS ({inr(posCogs)})</div>
        </div>
      </div>

      {/* Secondary Metric Strip */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-white/5 dark:bg-slate-900/50">
          <div className="text-[11px] font-semibold text-slate-500 uppercase">Service &amp; Convenience Fees</div>
          <div className="mt-1 text-base font-bold text-slate-900 dark:text-white">{inr(serviceFees)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-white/5 dark:bg-slate-900/50">
          <div className="text-[11px] font-semibold text-slate-500 uppercase">Partner Commissions</div>
          <div className="mt-1 text-base font-bold text-slate-900 dark:text-white">{inr(commissions)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-white/5 dark:bg-slate-900/50">
          <div className="text-[11px] font-semibold text-slate-500 uppercase">Gross Volume / Principal</div>
          <div className="mt-1 text-base font-bold text-slate-900 dark:text-white">{inr(principal)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-white/5 dark:bg-slate-900/50">
          <div className="text-[11px] font-semibold text-slate-500 uppercase">Total Transactions &amp; Sales</div>
          <div className="mt-1 text-base font-bold text-slate-900 dark:text-white">{filteredRows.length}</div>
        </div>
      </div>

      {/* Income by Service Breakdown */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900 overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4 font-bold flex items-center justify-between dark:border-white/10">
          <span>Income by Stream</span>
          <span className="text-xs font-semibold text-slate-500">Total: {inr(totalIncome)}</span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-white/5">
          {serviceTotals.map(([name, data]) => (
            <div key={name} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
              <div>
                <span className="font-semibold text-slate-900 dark:text-white">{name}</span>
                <span className="ml-2 text-xs text-slate-400">({data.count} txns · Vol: {inr(data.volume)})</span>
              </div>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">{inr(data.income)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Report Controls */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <span className="text-sm font-semibold">Report controls</span>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-950">
          <option value="date">Date</option>
          <option value="transaction">Transaction</option>
          <option value="service">Service</option>
          <option value="principal">Principal / Sales</option>
          <option value="income">Income / Revenue</option>
        </select>
        <button type="button" onClick={() => setSortAsc((v) => !v)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-white/10">
          {sortAsc ? "↑ Ascending" : "↓ Descending"}
        </button>
        <select value={markFilter} onChange={(e) => setMarkFilter(e.target.value as "all" | Mark)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-950">
          <option value="all">All marks</option>
          <option value="reviewed">Reviewed</option>
          <option value="verified">Verified</option>
          <option value="follow-up">Follow-up</option>
          <option value="reconciled">Reconciled</option>
          <option value="attention">Needs Attention</option>
        </select>
        <span className="ml-auto text-sm text-slate-500">{selected.length} selected</span>
        <select defaultValue="" onChange={(e) => { markSelected(e.target.value as Mark); e.currentTarget.value = ""; }} disabled={selectedVisibleRows.length === 0} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50 dark:border-white/10 dark:bg-slate-950">
          <option value="">Mark selected…</option>
          <option value="reviewed">Reviewed</option>
          <option value="verified">Verified</option>
          <option value="follow-up">Follow-up</option>
          <option value="reconciled">Reconciled</option>
          <option value="attention">Needs Attention</option>
        </select>
        <button type="button" onClick={clearMarks} disabled={selectedVisibleRows.length === 0} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50 dark:border-white/10">
          Clear marks
        </button>
      </div>

      {/* Data Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02]">
              <th className="w-10 px-4 py-3"><input aria-label="Select all visible rows" type="checkbox" checked={allVisibleSelected} onChange={toggleAll} /></th>
              {["Date", "Transaction", "Service", "Source", "Principal / Sales", "COGS", "Fee", "Portal Charge", "Commission", "Income / Revenue", "Mark"].map((h) => (
                <th key={h} className="px-4 py-3 font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => {
              const mark = marks[r.transaction_number] || "";
              const isPosInvoice = r.service_type === "pos_invoice";
              const isQuickPos = r.service_type === "pos_sale";
              const isPos = isPosInvoice || isQuickPos;
              const rowIncome = getRowIncome(r);

              return (
                <tr key={r.transaction_number} className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                  <td className="px-4 py-3"><input aria-label={`Select ${r.transaction_number}`} type="checkbox" checked={selected.includes(r.transaction_number)} onChange={() => toggleOne(r.transaction_number)} /></td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.transaction_date}</td>
                  <td className="px-4 py-3 font-medium font-mono text-xs text-slate-900 dark:text-white">{r.transaction_number}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-semibold ${isPosInvoice ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" : isQuickPos ? "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300"}`}>
                      {label(r.service_type)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{r.source || "Service"}</td>
                  <td className="px-4 py-3 font-mono font-semibold">{inr(Number(r.amount))}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{isQuickPos ? inr(Number(r.cost)) : "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{isPos ? "—" : (r.fee > 0 ? inr(r.fee) : "—")}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{isPos ? "—" : (r.portalCharge > 0 ? inr(r.portalCharge) : "—")}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{isPos ? "—" : (r.commission > 0 ? inr(r.commission) : "—")}</td>
                  <td className="px-4 py-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">{inr(rowIncome)}</td>
                  <td className="px-4 py-3">
                    <span className={mark ? "inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "text-slate-400"}>
                      {mark || "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr><td colSpan={12} className="px-4 py-10 text-center text-slate-500">No report rows match the selected filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        POS Invoice revenue reflects completed invoice totals. POS Quick Sales show gross sales with separate COGS. Service transactions calculate realized income from fees, portal charges, and partner commissions (excluding customer principal).
      </p>
    </div>
  );
}
