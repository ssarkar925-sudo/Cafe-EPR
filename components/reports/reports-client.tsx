"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRealtime } from "@/lib/supabase/realtime";
import { inr } from "@/lib/format";

type Inv = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total: string;
  paid: string;
  due: string;
  status: string;
  customers: { name: string | null } | null;
};
type Item = { qty: string; amount: string; products: { name: string } | null; services: { name: string } | null };
type Pay = { method: string; amount: string; received_at: string; invoices: { invoice_number: string } | null };
type Due = { id: string; name: string; balance: string };
type Exp = { id: string; expense_date: string; category: string; amount: string; note: string | null; status: string };
type Ret = { id: string; return_number: string; return_date: string; subtotal: string; refund: string; status: string; invoices: { invoice_number: string } | null };

const STATUS_PILL: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-700",
  unpaid: "bg-rose-100 text-rose-700",
  cancelled: "bg-slate-200 text-slate-600",
};

const PERIODS = [
  { key: "7d", label: "7 Days", days: 7 },
  { key: "30d", label: "30 Days", days: 30 },
  { key: "90d", label: "90 Days", days: 90 },
  { key: "all", label: "All", days: 0 },
] as const;

export default function ReportsClient({
  invoices,
  items,
  payments,
  dues,
  expenses,
  returns,
}: {
  invoices: Inv[];
  items: Item[];
  payments: Pay[];
  dues: Due[];
  expenses: Exp[];
  returns: Ret[];
}) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["key"]>("30d");
  const [tab, setTab] = useState<"overview" | "invoices" | "expenses" | "returns">("overview");

  useRealtime([
    "invoices",
    "invoice_items",
    "payments",
    "expenses",
    "returns",
    "return_items",
    "customers",
  ]);

  const range = useMemo(() => {
    const p = PERIODS.find((x) => x.key === period)!;
    if (p.days === 0) return { from: "2000-01-01", to: "2100-01-01" };
    const now = new Date();
    return {
      from: new Date(now.getTime() - (p.days - 1) * 86400000).toISOString().slice(0, 10),
      to: now.toISOString().slice(0, 10),
    };
  }, [period]);

  const validInvoices = useMemo(
    () => invoices.filter((i) => i.status !== "cancelled" && i.invoice_date >= range.from && i.invoice_date <= range.to),
    [invoices, range]
  );
  const activeExpenses = useMemo(
    () => expenses.filter((e) => e.status === "active" && e.expense_date >= range.from && e.expense_date <= range.to),
    [expenses, range]
  );
  const validReturns = useMemo(
    () => returns.filter((r) => r.status === "completed" && r.return_date >= range.from && r.return_date <= range.to),
    [returns, range]
  );

  const totalSales = validInvoices.reduce((s, i) => s + Number(i.total), 0);
  const totalPaid = validInvoices.reduce((s, i) => s + Number(i.paid), 0);
  const totalExpenses = activeExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalReturns = validReturns.reduce((s, r) => s + Number(r.subtotal), 0);
  const net = totalSales - totalReturns - totalExpenses;

  const dayTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of validInvoices) map.set(i.invoice_date, (map.get(i.invoice_date) ?? 0) + Number(i.total));
    const p = PERIODS.find((x) => x.key === period)!;
    if (p.days === 0) {
      return Array.from(map.entries())
        .map(([date, total]) => ({ date, total }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-30);
    }
    const now = new Date();
    const days: { date: string; total: number }[] = [];
    for (let i = p.days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, total: map.get(key) ?? 0 });
    }
    return days;
  }, [validInvoices, period]);
  const dayMax = Math.max(1, ...dayTotals.map((d) => d.total));

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; amount: number }>();
    for (const it of items) {
      const name = it.products?.name ?? it.services?.name ?? null;
      if (!name) continue;
      const cur = map.get(name) ?? { name, qty: 0, amount: 0 };
      cur.qty += Number(it.qty);
      cur.amount += Number(it.amount);
      map.set(name, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount).slice(0, 10);
  }, [items]);

  const methodTotals = useMemo(() => {
    const map = new Map<string, number>();
    const now = new Date();
    const p = PERIODS.find((x) => x.key === period)!;
    const cutoff = p.days === 0 ? new Date(0) : new Date(now.getTime() - p.days * 86400000);
    for (const pay of payments) {
      if (p.days > 0 && new Date(pay.received_at) < cutoff) continue;
      map.set(pay.method, (map.get(pay.method) ?? 0) + Number(pay.amount));
    }
    return Array.from(map.entries());
  }, [payments, period]);

  function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const KPI_CARDS = [
    { label: "Sales", value: totalSales, icon: "M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v9", grad: "from-emerald-500 to-teal-600", sub: `${validInvoices.length} invoices` },
    { label: "Collected", value: totalPaid, icon: "M20 6 9 17l-5-5", grad: "from-blue-500 to-indigo-600", sub: `${inr(totalSales - totalPaid)} outstanding` },
    { label: "Returns", value: totalReturns, icon: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5", grad: "from-amber-500 to-orange-600", sub: `${validReturns.length} returns` },
    { label: "Expenses", value: totalExpenses, icon: "M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5", grad: "from-rose-500 to-pink-600", sub: `${activeExpenses.length} entries` },
    { label: "Net", value: net, icon: "M3 3v18h18M7 14l4-4 3 3 5-6", grad: net >= 0 ? "from-violet-500 to-purple-600" : "from-rose-500 to-red-600", sub: "Sales − returns − expenses" },
  ];

  const recentInvoices = invoices.filter((i) => i.status !== "cancelled").slice(0, 8);
  const recentPayments = payments.slice(0, 8);
  const recentExpenses = activeExpenses.slice(0, 8);
  const recentReturns = returns.filter((r) => r.status === "completed").slice(0, 8);

  const tabBtn = (key: typeof tab, label: string) => (
    <button
      onClick={() => setTab(key)}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        tab === key ? "bg-[#0f172a] text-white shadow-sm" : "text-slate-500 hover:text-slate-900"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
          <p className="text-sm text-slate-500">
            {range.from === "2000-01-01" ? "All time" : `${range.from} to ${range.to}`} · {validInvoices.length} invoices
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-1 text-sm">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`rounded-lg px-3 py-1.5 font-medium transition ${
                  period === p.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex gap-1 rounded-xl bg-slate-100 p-1">
        {tabBtn("overview", "Overview")}
        {tabBtn("invoices", "Invoices")}
        {tabBtn("expenses", "Expenses")}
        {tabBtn("returns", "Returns")}
      </div>

      {tab === "overview" && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
            {KPI_CARDS.map((c) => (
              <div key={c.label} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${c.grad}`} />
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-500">{c.label}</p>
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${c.grad} text-white`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
                      <path d={c.icon} />
                    </svg>
                  </div>
                </div>
                <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{inr(c.value)}</p>
                <p className="mt-1 text-xs text-slate-400">{c.sub}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">Sales by Day</h2>
                <span className="text-sm font-medium text-slate-600">{inr(totalSales)}</span>
              </div>
              <div className="mt-5 flex h-44 items-end gap-1 sm:gap-1.5">
                {dayTotals.map((d) => (
                  <div key={d.date} className="group flex h-full flex-1 flex-col items-center justify-end" title={`${d.date}: ${inr(d.total)}`}>
                    <div
                      style={{ height: `${Math.max((d.total / dayMax) * 100, d.total > 0 ? 4 : 1.5)}%` }}
                      className={`w-full rounded-t-md transition-all ${
                        d.total > 0
                          ? "bg-gradient-to-t from-blue-600 to-indigo-400 group-hover:from-blue-500 group-hover:to-indigo-300"
                          : "bg-slate-200"
                      }`}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">Top Products</h2>
                <button
                  onClick={() =>
                    downloadCsv("top-products.csv", ["Product", "Qty", "Revenue"], topProducts.map((p) => [p.name, p.qty, p.amount]))
                  }
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Download CSV
                </button>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-4 font-medium">Product</th>
                      <th className="py-2 pr-4 font-medium">Qty</th>
                      <th className="py-2 font-medium">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((p) => (
                      <tr key={p.name} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 pr-4 text-slate-900">{p.name}</td>
                        <td className="py-2 pr-4 text-slate-700">{p.qty}</td>
                        <td className="py-2 text-slate-900">{inr(p.amount)}</td>
                      </tr>
                    ))}
                    {topProducts.length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-6 text-center text-slate-500">
                          No product sales yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">Payments by Method</h2>
                <button
                  onClick={() =>
                    downloadCsv("payments-method.csv", ["Method", "Amount"], methodTotals.map(([m, amt]) => [m, amt]))
                  }
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Download CSV
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {methodTotals.map(([m, amt]) => {
                  const pct = totalPaid > 0 ? (amt / totalPaid) * 100 : 0;
                  return (
                    <div key={m}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium uppercase text-slate-700">{m}</span>
                        <span className="text-slate-900">{inr(amt)}</span>
                      </div>
                      <div className="mt-1.5 h-2 rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-indigo-400"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {methodTotals.length === 0 && <p className="text-sm text-slate-500">No payments yet.</p>}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">Customer Dues</h2>
                <button
                  onClick={() => downloadCsv("customer-dues.csv", ["Customer", "Balance"], dues.map((d) => [d.name, d.balance]))}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Download CSV
                </button>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-4 font-medium">Customer</th>
                      <th className="py-2 font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dues.map((c) => (
                      <tr key={c.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 pr-4 text-slate-900">{c.name}</td>
                        <td className="py-2 text-red-600">{inr(c.balance)}</td>
                      </tr>
                    ))}
                    {dues.length === 0 && (
                      <tr>
                        <td colSpan={2} className="py-6 text-center text-slate-500">
                          No outstanding dues.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}

      {tab === "invoices" && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Invoice History</h2>
              <p className="text-xs text-slate-400">Newest first</p>
            </div>
            <button
              onClick={() =>
                downloadCsv(
                  "invoices.csv",
                  ["Invoice", "Customer", "Date", "Total", "Paid", "Due", "Status"],
                  recentInvoices.map((i) => [i.invoice_number, i.customers?.name ?? "-", i.invoice_date, i.total, i.paid, i.due, i.status])
                )
              }
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700"
            >
              Download CSV
            </button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4 font-medium">Invoice</th>
                  <th className="py-2 pr-4 font-medium">Customer</th>
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 text-right font-medium">Total</th>
                  <th className="py-2 pr-4 text-right font-medium">Paid</th>
                  <th className="py-2 pr-4 text-right font-medium">Due</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2.5 pr-4 font-mono text-xs font-medium text-blue-700">{inv.invoice_number}</td>
                    <td className="py-2.5 pr-4 text-slate-700">{inv.customers?.name ?? "-"}</td>
                    <td className="py-2.5 pr-4 text-slate-500">{inv.invoice_date}</td>
                    <td className="py-2.5 pr-4 text-right font-medium text-slate-900">{inr(Number(inv.total))}</td>
                    <td className="py-2.5 pr-4 text-right text-slate-700">{inr(Number(inv.paid))}</td>
                    <td className="py-2.5 pr-4 text-right text-slate-500">{inr(Number(inv.due))}</td>
                    <td className="py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_PILL[inv.status] || "bg-slate-100 text-slate-600"}`}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {recentInvoices.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      No invoices yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "expenses" && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Expense History</h2>
              <p className="text-xs text-slate-400">Newest first</p>
            </div>
            <button
              onClick={() =>
                downloadCsv(
                  "expenses.csv",
                  ["Date", "Category", "Amount", "Note", "Status"],
                  recentExpenses.map((e) => [e.expense_date, e.category, e.amount, e.note ?? "-", e.status])
                )
              }
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700"
            >
              Download CSV
            </button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Category</th>
                  <th className="py-2 pr-4 font-medium">Note</th>
                  <th className="py-2 pr-4 text-right font-medium">Amount</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentExpenses.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2.5 pr-4 text-slate-500">{e.expense_date}</td>
                    <td className="py-2.5 pr-4 capitalize text-slate-900">{e.category}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{e.note || "-"}</td>
                    <td className="py-2.5 pr-4 text-right font-medium text-slate-900">{inr(Number(e.amount))}</td>
                    <td className="py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${e.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                        {e.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {recentExpenses.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      No expenses in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "returns" && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Return History</h2>
              <p className="text-xs text-slate-400">Newest first</p>
            </div>
            <button
              onClick={() =>
                downloadCsv(
                  "returns.csv",
                  ["Return #", "Invoice", "Date", "Subtotal", "Refund", "Status"],
                  recentReturns.map((r) => [r.return_number, r.invoices?.invoice_number ?? "-", r.return_date, r.subtotal, r.refund, r.status])
                )
              }
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700"
            >
              Download CSV
            </button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4 font-medium">Return #</th>
                  <th className="py-2 pr-4 font-medium">Invoice</th>
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 text-right font-medium">Subtotal</th>
                  <th className="py-2 pr-4 text-right font-medium">Refund</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentReturns.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2.5 pr-4 font-mono text-xs font-medium text-amber-700">{r.return_number}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-blue-700">{r.invoices?.invoice_number ?? "-"}</td>
                    <td className="py-2.5 pr-4 text-slate-500">{r.return_date}</td>
                    <td className="py-2.5 pr-4 text-right font-medium text-slate-900">{inr(Number(r.subtotal))}</td>
                    <td className="py-2.5 pr-4 text-right text-slate-700">{inr(Number(r.refund))}</td>
                    <td className="py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${r.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {recentReturns.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No returns yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="flex gap-4 text-sm text-slate-500">
          <Link href="/finance/pnl" className="font-medium text-blue-600 hover:text-blue-700">
            Profit &amp; Loss →
          </Link>
          <Link href="/finance/cashbook" className="font-medium text-blue-600 hover:text-blue-700">
            Cash Book →
          </Link>
        </div>
        <button
          onClick={() => window.print()}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Print report
        </button>
      </div>
    </div>
  );
}
