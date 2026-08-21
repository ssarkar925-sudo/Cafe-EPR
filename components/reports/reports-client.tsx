"use client";

import { Fragment, useMemo, useState } from "react";
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
type Item = { qty: string; amount: string; invoices: { invoice_date: string } | null; products: { name: string } | null; services: { name: string } | null };
type Pay = { method: string; amount: string; received_at: string; invoices: { invoice_number: string } | null };
type Due = { id: string; name: string; balance: string };
type Exp = { id: string; expense_date: string; category: string; amount: string; note: string | null; status: string };
type Ret = { id: string; return_number: string; return_date: string; subtotal: string; refund: string; status: string; invoices: { invoice_number: string; status: string } | null };
type Tx = { id: string; transaction_number: string; service_type: string; direction: string; transaction_date: string; customer_mobile: string | null; reference: string | null; amount: string; service_fee: string; portal_commission: string; status: string };
type Inst = { id: string; name: string; type: string; is_active: boolean };
type CashEntry = {
  id: string;
  entry_date: string;
  method: string;
  direction: string;
  amount: string;
  description: string | null;
  payment_instruments: { name: string; type: string } | null;
};
type Quick = {
  id: string;
  sale_number: string;
  sale_date: string;
  item_name: string | null;
  amount: string;
  cost: string;
  change_due: string;
  payments: { method: string; amount: number; instrument_id?: string | null }[];
  status: string;
  customers: { name: string } | null;
  products: { name: string } | null;
  services: { name: string } | null;
};

const INSTRUMENT_LABEL: Record<string, string> = {
  cash: "Cash",
  bank: "Bank",
  upi: "UPI",
  wallet: "Wallet",
  debit_card: "Debit Card",
  credit_card: "Credit Card",
};

const STATUS_PILL: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-700",
  unpaid: "bg-rose-100 text-rose-700",
  cancelled: "bg-slate-200 text-slate-600",
};

const TX_STATUS_PILL: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  failed: "bg-rose-100 text-rose-700",
  reversed: "bg-slate-200 text-slate-600",
  deleted: "bg-rose-100 text-rose-700",
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
  transactions,
  instruments,
  cashEntries,
  quickSales,
}: {
  invoices: Inv[];
  items: Item[];
  payments: Pay[];
  dues: Due[];
  expenses: Exp[];
  returns: Ret[];
  transactions: Tx[];
  instruments: Inst[];
  cashEntries: CashEntry[];
  quickSales: Quick[];
}) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["key"]>("30d");
  const [tab, setTab] = useState<"overview" | "invoices" | "expenses" | "returns" | "business" | "accounts" | "quick">("overview");
  const [openInst, setOpenInst] = useState<string | null>(null);

  useRealtime([
    "invoices",
    "invoice_items",
    "payments",
    "expenses",
    "returns",
    "return_items",
    "customers",
    "transactions",
    "quick_sales",
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
    () =>
      returns.filter((r) => r.status === "completed" && r.return_date >= range.from && r.return_date <= range.to),
    [returns, range]
  );

  const totalSales = validInvoices.reduce((s, i) => s + Number(i.total), 0);
  const totalPaid = validInvoices.reduce((s, i) => s + Number(i.paid), 0);
  const totalExpenses = activeExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalReturns = validReturns.reduce((s, r) => s + Number(r.subtotal), 0);

  const validQuick = useMemo(
    () => quickSales.filter((q) => q.status === "active" && q.sale_date >= range.from && q.sale_date <= range.to),
    [quickSales, range]
  );
  const quickSummary = useMemo(() => {
    const byMethod = new Map<string, number>();
    for (const q of validQuick) {
      for (const p of q.payments ?? []) {
        byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + (Number(p.amount) || 0));
      }
    }
    return {
      count: validQuick.length,
      amount: validQuick.reduce((s, q) => s + Number(q.amount), 0),
      cost: validQuick.reduce((s, q) => s + Number(q.cost), 0),
      byMethod: Array.from(byMethod.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [validQuick]);

  const validTxns = useMemo(
    () =>
      transactions.filter(
        (t) => t.status === "success" && t.transaction_date >= range.from && t.transaction_date <= range.to
      ),
    [transactions, range]
  );
  const txnSummary = useMemo(() => {
    return {
      count: validTxns.length,
      principal: validTxns.reduce((s, t) => s + Number(t.amount), 0),
      fees: validTxns.reduce((s, t) => s + Number(t.service_fee), 0),
      commission: validTxns.reduce((s, t) => s + Number(t.portal_commission), 0),
      income: validTxns.reduce((s, t) => s + Number(t.service_fee) + Number(t.portal_commission), 0),
    };
  }, [validTxns]);

  const net = totalSales - totalReturns - totalExpenses + quickSummary.amount - quickSummary.cost + txnSummary.income;

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
      const date = it.invoices?.invoice_date;
      if (!date || date < range.from || date > range.to) continue;
      const cur = map.get(name) ?? { name, qty: 0, amount: 0 };
      cur.qty += Number(it.qty);
      cur.amount += Number(it.amount);
      map.set(name, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount).slice(0, 10);
  }, [items, range]);

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

  const instrumentTotals = useMemo(() => {
    const map = new Map<string, { name: string; type: string; in: number }>();
    for (const ce of cashEntries) {
      if (ce.entry_date < range.from || ce.entry_date > range.to) continue;
      if (ce.direction !== "in") continue;
      const name = ce.payment_instruments?.name ?? "Counter Cash";
      const cur = map.get(name) ?? { name, type: ce.payment_instruments?.type ?? "cash", in: 0 };
      cur.in += Number(ce.amount);
      map.set(name, cur);
    }
    const rows = Array.from(map.values()).sort((a, b) => b.in - a.in);
    const zero = instruments
      .filter((i) => i.is_active && !rows.some((r) => r.name === i.name))
      .map((i) => ({ name: i.name, type: i.type, in: 0 }));
    return [...rows, ...zero];
  }, [cashEntries, instruments, range]);

  const KPI_CARDS = [
    { label: "Sales", value: totalSales, icon: "M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v9", grad: "from-emerald-500 to-teal-600", sub: `${validInvoices.length} invoices` },
    { label: "Collected", value: totalPaid, icon: "M20 6 9 17l-5-5", grad: "from-blue-500 to-indigo-600", sub: `${inr(totalSales - totalPaid)} outstanding` },
    { label: "Returns", value: totalReturns, icon: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5", grad: "from-amber-500 to-orange-600", sub: `${validReturns.length} returns` },
    { label: "Expenses", value: totalExpenses, icon: "M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5", grad: "from-rose-500 to-pink-600", sub: `${activeExpenses.length} entries` },
    { label: "Quick Sales", value: quickSummary.amount, icon: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z", grad: "from-teal-500 to-emerald-600", sub: `${quickSummary.count} sales · ${inr(quickSummary.amount - quickSummary.cost)} margin` },
    { label: "Net Profit", value: net, icon: "M3 3v18h18M7 14l4-4 3 3 5-6", grad: net >= 0 ? "from-violet-500 to-purple-600" : "from-rose-500 to-red-600", sub: "Sales + quick margin + business income − returns − expenses" },
  ];

  const recentInvoices = invoices.filter((i) => i.status !== "cancelled" && i.invoice_date >= range.from && i.invoice_date <= range.to).slice(0, 8);
  const recentPayments = payments.slice(0, 8);
  const recentExpenses = activeExpenses.slice(0, 8);
  const recentReturns = returns.filter((r) => r.status === "completed" && r.return_date >= range.from && r.return_date <= range.to).slice(0, 8);

  const tabBtn = (key: typeof tab, label: string) => (
    <button
      onClick={() => setTab(key)}
      className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
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

      <div className="mt-6 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
        {tabBtn("overview", "Overview")}
        {tabBtn("invoices", "Invoices")}
        {tabBtn("expenses", "Expenses")}
        {tabBtn("returns", "Returns")}
        {tabBtn("business", "Business")}
        {tabBtn("accounts", "Accounts")}
        {tabBtn("quick", "Quick Sales")}
      </div>

      {tab === "overview" && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
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

      {tab === "business" && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
            {[
              { label: "Transactions", value: txnSummary.count, icon: "M6 2h12a1 1 0 0 1 1 1v18l-2.5-1.5L14 21l-2.5-1.5L9 21l-2.5-1.5L5 21V3a1 1 0 0 1 1-1Z", grad: "from-blue-500 to-indigo-600", sub: `${validTxns.length} successful` },
              { label: "Principal", value: txnSummary.principal, icon: "M6 3h12M6 8h12M6 13h8a4 4 0 0 0 0-8H6v17", grad: "from-emerald-500 to-teal-600", sub: "AEPS / DMT / UPI amount" },
              { label: "Customer Fees", value: txnSummary.fees, icon: "M8 9l4-4 8 4-8 4-4-4ZM8 9v6m0 0 4 4 8-4-4-4m-4 4V9m8 0v6", grad: "from-amber-500 to-orange-600", sub: "Service fee charged" },
              { label: "Commission", value: txnSummary.commission, icon: "M19 5 5 19M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm11 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z", grad: "from-violet-500 to-purple-600", sub: "Portal commission" },
              { label: "Shop Income", value: txnSummary.income, icon: "M23 6l-9.5 9.5-5-5L1 18M17 6h6v6", grad: txnSummary.income >= 0 ? "from-emerald-500 to-teal-600" : "from-rose-500 to-red-600", sub: "Fees + Commission" },
            ].map((c) => (
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
                <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                  {c.label === "Transactions" ? String(c.value) : inr(c.value)}
                </p>
                <p className="mt-1 text-xs text-slate-400">{c.sub}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">AEPS / DMT / UPI Transactions</h2>
                <p className="text-xs text-slate-400">Successful transactions in period, newest first</p>
              </div>
              <button
                onClick={() =>
                  downloadCsv(
                    "business-transactions.csv",
                    ["Tr. No", "Service", "Date", "Customer Mobile", "Reference", "Amount", "Service Fee", "Commission", "Status"],
                    validTxns.map((t) => [t.transaction_number, t.service_type.toUpperCase(), t.transaction_date, t.customer_mobile ?? "-", t.reference ?? "-", t.amount, t.service_fee, t.portal_commission, t.status])
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
                    <th className="py-2 pr-4 font-medium">Transaction</th>
                    <th className="py-2 pr-4 font-medium">Service</th>
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Customer</th>
                    <th className="py-2 pr-4 font-medium">Reference</th>
                    <th className="py-2 pr-4 text-right font-medium">Amount</th>
                    <th className="py-2 pr-4 text-right font-medium">Fee</th>
                    <th className="py-2 pr-4 text-right font-medium">Commission</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {validTxns.map((t) => (
                    <tr key={t.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2.5 pr-4 font-mono text-xs font-medium text-blue-700">{t.transaction_number}</td>
                      <td className="py-2.5 pr-4">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase text-slate-700">{t.service_type}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-slate-500">{t.transaction_date}</td>
                      <td className="py-2.5 pr-4 text-slate-700">{t.customer_mobile || "-"}</td>
                      <td className="py-2.5 pr-4 text-slate-500">{t.reference || "-"}</td>
                      <td className="py-2.5 pr-4 text-right font-medium text-slate-900">{inr(Number(t.amount))}</td>
                      <td className="py-2.5 pr-4 text-right text-slate-700">{inr(Number(t.service_fee))}</td>
                      <td className="py-2.5 pr-4 text-right text-slate-700">{inr(Number(t.portal_commission))}</td>
                      <td className="py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${TX_STATUS_PILL[t.status] || "bg-slate-100 text-slate-600"}`}>
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {validTxns.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500">
                        No AEPS / DMT / UPI transactions in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === "accounts" && (
        <>
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-900">Payments by Account</h2>
                <p className="text-xs text-slate-400">
                  Cash, bank, UPI, wallet and card collections in period — each named instrument separately
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-900">
                  {inr(instrumentTotals.reduce((s, r) => s + r.in, 0))}
                </span>
                <button
                  onClick={() =>
                    downloadCsv(
                      "payment-accounts.csv",
                      ["Account", "Type", "Received"],
                      instrumentTotals.map((r) => [r.name, INSTRUMENT_LABEL[r.type] ?? r.type, r.in])
                    )
                  }
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700"
                >
                  Download CSV
                </button>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-4 font-medium">Account</th>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 text-right font-medium">Received</th>
                    <th className="w-8 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {instrumentTotals.map((r) => {
                    const open = openInst === r.name;
                    const detail = cashEntries.filter(
                      (ce) =>
                        (ce.payment_instruments?.name ?? "Counter Cash") === r.name &&
                        ce.direction === "in" &&
                        ce.entry_date >= range.from &&
                        ce.entry_date <= range.to
                    );
                    return (
                      <Fragment key={r.name}>
                        <tr
                          onClick={() => setOpenInst(open ? null : r.name)}
                          className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                        >
                          <td className="py-2.5 pr-4 font-medium text-slate-900">{r.name}</td>
                          <td className="py-2.5 pr-4">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-600">
                              {INSTRUMENT_LABEL[r.type] ?? r.type}
                            </span>
                          </td>
                          <td className="py-2.5 pr-4 text-right font-semibold text-slate-900">{inr(r.in)}</td>
                          <td className="py-2.5 text-right text-slate-400">{open ? "−" : "+"}</td>
                        </tr>
                        {open && (
                          <tr className="border-b border-slate-100 bg-slate-50/60">
                            <td colSpan={4} className="px-4 py-3">
                              {detail.length === 0 ? (
                                <p className="text-sm text-slate-400">No entries in this period.</p>
                              ) : (
                                <ul className="divide-y divide-slate-100">
                                  {detail.map((ce) => (
                                    <li key={ce.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                                      <span className="min-w-0 flex-1 truncate text-slate-600">
                                        <span className="font-medium text-slate-800">{ce.entry_date}</span>
                                        {" · "}
                                        {ce.description || ce.method}
                                      </span>
                                      <span className="shrink-0 font-semibold text-slate-900">{inr(Number(ce.amount))}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {instrumentTotals.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-500">
                        No collections in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === "quick" && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: "Quick Sales", value: quickSummary.count, icon: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z", grad: "from-teal-500 to-emerald-600", sub: `${validQuick.length} in period` },
              { label: "Collected", value: quickSummary.amount, icon: "M20 6 9 17l-5-5", grad: "from-blue-500 to-indigo-600", sub: "What customers paid" },
              { label: "Cost", value: quickSummary.cost, icon: "M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5", grad: "from-amber-500 to-orange-600", sub: "Net cost you paid" },
              { label: "Margin", value: quickSummary.amount - quickSummary.cost, icon: "M3 3v18h18M7 14l4-4 3 3 5-6", grad: "from-emerald-500 to-teal-600", sub: "Amount − Cost" },
            ].map((c) => (
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
                <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                  {c.label === "Quick Sales" ? String(c.value) : inr(c.value)}
                </p>
                <p className="mt-1 text-xs text-slate-400">{c.sub}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">Collected by Method</h2>
                <span className="text-sm font-medium text-slate-600">{inr(quickSummary.amount)}</span>
              </div>
              <div className="mt-4 space-y-3">
                {quickSummary.byMethod.map(([m, amt]) => {
                  const pct = quickSummary.amount > 0 ? (amt / quickSummary.amount) * 100 : 0;
                  return (
                    <div key={m}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium uppercase text-slate-700">{INSTRUMENT_LABEL[m] ?? m}</span>
                        <span className="text-slate-900">{inr(amt)}</span>
                      </div>
                      <div className="mt-1.5 h-2 rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-teal-500 to-emerald-400"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {quickSummary.byMethod.length === 0 && (
                  <p className="text-sm text-slate-500">No quick sales yet.</p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">Recent Quick Sales</h2>
                <button
                  onClick={() =>
                    downloadCsv(
                      "quick-sales.csv",
                      ["Sale #", "Date", "Item", "Customer", "Amount", "Cost", "Margin", "Status"],
                      validQuick.map((q) => [
                        q.sale_number,
                        q.sale_date,
                        q.item_name ?? q.products?.name ?? q.services?.name ?? "Sale (general)",
                        q.customers?.name ?? "Walk-in",
                        q.amount,
                        q.cost,
                        Number(q.amount) - Number(q.cost),
                        q.status,
                      ])
                    )
                  }
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700"
                >
                  Download CSV
                </button>
              </div>
              <div className="mt-4 max-h-80 overflow-x-auto overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-4 font-medium">Sale #</th>
                      <th className="py-2 pr-4 font-medium">Item</th>
                      <th className="py-2 pr-4 text-right font-medium">Amount</th>
                      <th className="py-2 pr-4 text-right font-medium">Margin</th>
                      <th className="py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validQuick.slice(0, 50).map((q) => (
                      <tr key={q.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-2.5 pr-4 font-mono text-xs font-medium text-teal-700">{q.sale_number}</td>
                        <td className="py-2.5 pr-4 text-slate-700">
                          <span className="block max-w-[180px] truncate">
                            {q.item_name ?? q.products?.name ?? q.services?.name ?? "Sale (general)"}
                          </span>
                          <span className="block text-xs text-slate-400">
                            {q.sale_date} · {q.customers?.name ?? "Walk-in"}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-right font-medium text-slate-900">{inr(Number(q.amount))}</td>
                        <td className="py-2.5 pr-4 text-right font-semibold text-emerald-600">
                          {inr(Number(q.amount) - Number(q.cost))}
                        </td>
                        <td className="py-2.5">
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium capitalize text-emerald-700">
                            {q.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {validQuick.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          No quick sales in this period.
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
