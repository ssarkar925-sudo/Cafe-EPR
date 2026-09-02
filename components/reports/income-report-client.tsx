"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { inr } from "@/lib/format";
import {
  ChevronRight,
  TrendingUp,
  Download,
  Receipt,
  Layers,
  Percent,
  CheckCircle2,
  Filter,
  ArrowUpDown,
  FileSpreadsheet,
} from "lucide-react";

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
    <div className="space-y-6 pb-12" id="income-report">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-white/10 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <Link href="/reports" className="hover:text-blue-600 dark:hover:text-blue-400">
              Reports &amp; Tax Hub
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-bold text-slate-900 dark:text-white">Income Breakdown</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl dark:text-white">
            Income &amp; Revenue Breakdown
          </h1>
          <p className="mt-1 text-xs text-slate-600 sm:text-sm dark:text-slate-400">
            Comprehensive revenue attribution from POS retail sales, service convenience fees, and partner commissions.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-blue-500"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>
          <Link
            href="/reports/profit-loss"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>P&amp;L Statement</span>
          </Link>
        </div>
      </div>

      {/* Date & Filter Bar */}
      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
        <div>
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">From Date</label>
          <input
            name="from"
            type="date"
            defaultValue={from}
            className="mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs dark:border-white/10 dark:bg-slate-950 dark:text-white"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">To Date</label>
          <input
            name="to"
            type="date"
            defaultValue={to}
            className="mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs dark:border-white/10 dark:bg-slate-950 dark:text-white"
          />
        </div>
        <button
          type="submit"
          className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
        >
          Apply Range
        </button>

        <div className="ml-auto">
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Service Filter</label>
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="mt-1 block min-w-[200px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 shadow-2xs dark:border-white/10 dark:bg-slate-950 dark:text-white"
          >
            <option value="all">All Services &amp; Sales</option>
            {serviceOptions.map((service) => (
              <option key={service} value={service}>
                {label(service)}
              </option>
            ))}
          </select>
        </div>
      </form>

      {/* Primary KPI Grid */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Income */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4.5 shadow-2xs dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
              Total Realized Income
            </span>
            <span className="rounded-md bg-emerald-100 p-1 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
              <TrendingUp className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-emerald-950 dark:text-white tabular-nums">
            {inr(totalIncome)}
          </div>
          <div className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
            POS Retail Sales + Service Fees + Commission
          </div>
        </div>

        {/* POS Revenue */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              POS Retail Revenue
            </span>
            <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">
              {posInvoiceRows.length + posQuickRows.length} orders
            </span>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-950 dark:text-white tabular-nums">
            {inr(posRevenue)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Invoices: {inr(posInvoiceRevenue)} &bull; Quick: {inr(posQuickRevenue)}
          </div>
        </div>

        {/* Service Income */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Service Fee &amp; Commission
            </span>
            <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
              {serviceRows.length} txns
            </span>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-950 dark:text-white tabular-nums">
            {inr(serviceIncome)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Fees: {inr(serviceFees)} &bull; Comm: {inr(commissions)}
          </div>
        </div>

        {/* Quick Sale Profit */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Gross Principal Volume
            </span>
            <span className="text-[11px] font-bold text-slate-500">
              {filteredRows.length} rows
            </span>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-950 dark:text-white tabular-nums">
            {inr(principal)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Gross customer volume &amp; pass-through
          </div>
        </div>
      </div>

      {/* Income by Service Breakdown */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <h2 className="text-sm font-bold text-slate-950 dark:text-white">Income by Revenue Stream</h2>
          <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            Total: {inr(totalIncome)}
          </span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-white/5">
          {serviceTotals.map(([name, data]) => (
            <div
              key={name}
              className="flex items-center justify-between px-5 py-3 text-sm hover:bg-slate-50/50 dark:hover:bg-white/[0.02]"
            >
              <div>
                <span className="font-semibold text-slate-900 dark:text-white">{name}</span>
                <span className="ml-2 font-mono text-xs text-slate-400 tabular-nums">
                  ({data.count} txns &bull; Vol: {inr(data.volume)})
                </span>
              </div>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {inr(data.income)}
              </span>
            </div>
          ))}
          {serviceTotals.length === 0 && (
            <div className="p-8 text-center text-xs text-slate-500">No income streams recorded for the selected range.</div>
          )}
        </div>
      </div>

      {/* Report Audit Controls */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Sort &amp; Review:</span>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 shadow-2xs dark:border-white/10 dark:bg-slate-950 dark:text-white"
        >
          <option value="date">Date</option>
          <option value="transaction">Transaction #</option>
          <option value="service">Service</option>
          <option value="principal">Principal / Sales</option>
          <option value="income">Income / Revenue</option>
        </select>
        <button
          type="button"
          onClick={() => setSortAsc((v) => !v)}
          className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-950 dark:text-slate-300"
        >
          {sortAsc ? "↑ Ascending" : "↓ Descending"}
        </button>
        <select
          value={markFilter}
          onChange={(e) => setMarkFilter(e.target.value as "all" | Mark)}
          className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 shadow-2xs dark:border-white/10 dark:bg-slate-950 dark:text-white"
        >
          <option value="all">All Marks</option>
          <option value="reviewed">Reviewed</option>
          <option value="verified">Verified</option>
          <option value="follow-up">Follow-up</option>
          <option value="reconciled">Reconciled</option>
          <option value="attention">Needs Attention</option>
        </select>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-500">{selected.length} selected</span>
          <select
            defaultValue=""
            onChange={(e) => {
              markSelected(e.target.value as Mark);
              e.currentTarget.value = "";
            }}
            disabled={selectedVisibleRows.length === 0}
            className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 shadow-2xs disabled:opacity-50 dark:border-white/10 dark:bg-slate-950 dark:text-white"
          >
            <option value="">Set Audit Tag…</option>
            <option value="reviewed">Reviewed</option>
            <option value="verified">Verified</option>
            <option value="follow-up">Follow-up</option>
            <option value="reconciled">Reconciled</option>
            <option value="attention">Needs Attention</option>
          </select>
          <button
            type="button"
            onClick={clearMarks}
            disabled={selectedVisibleRows.length === 0}
            className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-950 dark:text-slate-300"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Granular Entries Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-2xs dark:border-white/10 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-white/5 dark:text-slate-400">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  aria-label="Select all visible rows"
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAll}
                  className="rounded border-slate-300 text-blue-600 focus:ring-0"
                />
              </th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Txn / Invoice #</th>
              <th className="px-4 py-3 font-medium">Service Type</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 text-right font-medium">Principal / Sales</th>
              <th className="px-4 py-3 text-right font-medium">COGS</th>
              <th className="px-4 py-3 text-right font-medium">Fee</th>
              <th className="px-4 py-3 text-right font-medium">Commission</th>
              <th className="px-4 py-3 text-right font-medium">Realized Income</th>
              <th className="px-4 py-3 font-medium">Audit Tag</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            {visibleRows.map((r) => {
              const mark = marks[r.transaction_number] || "";
              const isPosInvoice = r.service_type === "pos_invoice";
              const isQuickPos = r.service_type === "pos_sale";
              const isPos = isPosInvoice || isQuickPos;
              const rowIncome = getRowIncome(r);

              return (
                <tr key={r.transaction_number} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                  <td className="px-4 py-3">
                    <input
                      aria-label={`Select ${r.transaction_number}`}
                      type="checkbox"
                      checked={selected.includes(r.transaction_number)}
                      onChange={() => toggleOne(r.transaction_number)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-0"
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{r.transaction_date}</td>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-slate-900 dark:text-white">
                    {r.transaction_number}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${
                        isPosInvoice
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                          : isQuickPos
                          ? "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                          : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300"
                      }`}
                    >
                      {label(r.service_type)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{r.source || "Service"}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-slate-950 dark:text-white tabular-nums">
                    {inr(Number(r.amount))}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-slate-500 tabular-nums">
                    {isQuickPos ? inr(Number(r.cost)) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                    {isPos ? "—" : r.fee > 0 ? inr(r.fee) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {isPos ? "—" : r.commission > 0 ? inr(r.commission) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {inr(rowIncome)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        mark
                          ? "inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "text-slate-400"
                      }
                    >
                      {mark || "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                  No records match the active filter criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
