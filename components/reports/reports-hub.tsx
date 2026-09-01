"use client";

import Link from "next/link";
import { useMemo } from "react";
import { inr } from "@/lib/format";

type Invoice = { total: string | number; paid: string | number; due: string | number; status: string };
type Expense = { amount: string | number; status: string };
type ReturnRow = { subtotal: string | number; refund: string | number };

type Props = { invoices: Invoice[]; expenses: Expense[]; returns: ReturnRow[] };

export default function ReportsHub({ invoices, expenses, returns }: Props) {
  const metrics = useMemo(() => {
    const sales = invoices.reduce((s, x) => s + (Number(x.total) || 0), 0);
    const collected = invoices.reduce((s, x) => s + (Number(x.paid) || 0), 0);
    const outstanding = invoices.reduce((s, x) => s + (Number(x.due) || 0), 0);
    const expense = expenses.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const returned = returns.reduce((s, x) => s + (Number(x.subtotal) || 0), 0);
    return { sales, collected, outstanding, expense, returned, net: sales - returned - expense };
  }, [invoices, expenses, returns]);

  const cards = [
    ["Gross sales", inr(metrics.sales), "Invoice revenue"],
    ["Collected", inr(metrics.collected), "Payments received"],
    ["Outstanding", inr(metrics.outstanding), "Customer dues"],
    ["Net after returns & expenses", inr(metrics.net), "Operational view"],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Business intelligence</div><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">Reports Command Center</h1><p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">A management snapshot across sales, income, profit, collections, dues, returns and operating expenses.</p></div>
        <Link href="/reports" className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700">Open full reports →</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map(([label,value,sub]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div><div className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{value}</div><div className="mt-1 text-xs text-slate-400">{sub}</div></div>)}</div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {[
          ["Income Breakdown", "Service fees, portal charges, commission and POS income", "/reports/income"],
          ["Profit & Loss", "Revenue, returns, POS COGS, service income and expenses", "/reports/profit-loss"],
          ["Sales & GST", "Revenue, tax and invoice trends", "/reports/sales"],
          ["Finance", "Collections, dues and expenses", "/reports/finance"],
          ["Cash & Bank Reconciliation", "Recorded cash and payment-instrument movement, filters and exception review", "/reports/cash-bank"],
          ["Inventory", "Stock movement and valuation", "/reports/inventory"],
          ["Returns", `${returns.length} return documents · ${inr(metrics.returned)} value`, "/returns"],
        ].map(([title,desc,href]) => <Link key={title} href={href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md dark:border-white/10 dark:bg-slate-900"><div className="flex items-center justify-between"><h2 className="font-semibold text-slate-950 dark:text-white">{title}</h2><span className="text-slate-400 transition group-hover:translate-x-1">→</span></div><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{desc}</p></Link>)}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm dark:border-white/10"><div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div><div className="text-xs font-bold uppercase tracking-wider text-slate-400">Management workflow</div><h2 className="mt-1 text-xl font-bold">Turn numbers into action</h2><p className="mt-1 text-sm text-slate-400">Use the detailed financial reports when a KPI needs investigation.</p></div><div className="flex flex-wrap gap-2"><Link href="/reports/income" className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15">Income</Link><Link href="/reports/profit-loss" className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15">P&amp;L</Link><Link href="/reports/gst" className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15">GST</Link><Link href="/reports/sales" className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15">Sales</Link><Link href="/reports/inventory" className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15">Inventory</Link><Link href="/reports/finance" className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15">Finance</Link><Link href="/reports/cash-bank" className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15">Cash &amp; Bank</Link></div></div></div>
    </div>
  );
}
