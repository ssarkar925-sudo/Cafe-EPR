"use client";

import { useMemo } from "react";
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

const label = (service: string) => ({
  aeps: "AEPS",
  dmt: "DMT",
  upi: "UPI",
  recharge: "Recharge / Google Play",
  google_play_recharge: "Google Play Recharge",
  google_play: "Google Play Recharge",
  bill_payment: "Bill Payment",
  utility_bill: "Bill Payment",
}.service as Record<string, string>)[service] ?? service.replaceAll("_", " ");

export default function IncomeReportClient({ rows, from, to }: { rows: Row[]; from: string; to: string }) {
  const incomeRows = useMemo(() => rows.map((r) => ({
    ...r,
    fee: Number(r.service_fee) || 0,
    commission: Number(r.portal_commission) || 0,
    portalCharge: Number(r.portal_charge) || 0,
  })), [rows]);

  const serviceTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of incomeRows) map.set(label(r.service_type), (map.get(label(r.service_type)) ?? 0) + r.fee + r.commission + r.portalCharge);
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [incomeRows]);

  const serviceFees = incomeRows.reduce((s, r) => s + r.fee + r.portalCharge, 0);
  const commissions = incomeRows.reduce((s, r) => s + r.commission, 0);
  const totalIncome = serviceFees + commissions;
  const principal = incomeRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const exportCsv = () => {
    const header = ["Date", "Transaction", "Service", "Principal", "Service Fee", "Portal Charge", "Commission", "Income Credit"];
    const body = incomeRows.map((r) => [r.transaction_date, r.transaction_number, label(r.service_type), Number(r.amount), r.fee, r.portalCharge, r.commission, r.fee + r.portalCharge + r.commission]);
    const csv = [header, ...body].map((line) => line.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cafe-erp-income-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

      <div className="grid gap-4 md:grid-cols-4">
        {[["Transactions", String(incomeRows.length)], ["Principal processed", inr(principal)], ["Service / fee income", inr(serviceFees)], ["Commission income", inr(commissions)], ["Total income", inr(totalIncome)]].map(([k,v]) => (
          <div key={k} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{k}</div><div className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{v}</div></div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 font-semibold dark:border-white/10">Income by service</div>
        <div className="divide-y divide-slate-100 dark:divide-white/5">{serviceTotals.map(([name, value]) => <div key={name} className="flex items-center justify-between px-5 py-3 text-sm"><span>{name}</span><span className="font-semibold">{inr(value)}</span></div>)}</div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <table className="min-w-full text-sm"><thead><tr className="border-b border-slate-200 text-left dark:border-white/10">{["Date","Transaction","Service","Principal","Fee","Portal Charge","Commission","Income"].map(h => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead><tbody>{incomeRows.map(r => <tr key={r.transaction_number} className="border-b border-slate-100 dark:border-white/5"><td className="px-4 py-3">{r.transaction_date}</td><td className="px-4 py-3 font-medium">{r.transaction_number}</td><td className="px-4 py-3">{label(r.service_type)}</td><td className="px-4 py-3">{inr(Number(r.amount))}</td><td className="px-4 py-3">{inr(r.fee)}</td><td className="px-4 py-3">{inr(r.portalCharge)}</td><td className="px-4 py-3">{inr(r.commission)}</td><td className="px-4 py-3 font-semibold">{inr(r.fee+r.portalCharge+r.commission)}</td></tr>)}</tbody></table>
      </div>
    </div>
  );
}
