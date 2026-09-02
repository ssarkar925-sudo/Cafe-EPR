"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  const searchParams = useSearchParams();
  const initialTab = searchParams?.get("tab") || "overview";
  const [tab, setTab] = useState<"overview" | "invoices" | "expenses" | "returns" | "business" | "accounts" | "quick">(() => {
    if (["overview", "invoices", "expenses", "returns", "business", "accounts", "quick"].includes(initialTab)) {
      return initialTab as any;
    }
    if (initialTab === "sales") return "invoices";
    if (initialTab === "services") return "business";
    if (initialTab === "treasury") return "accounts";
    return "overview";
  });
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
      income: validTxns.reduce(
        (s, t) =>
          s +
          (t.service_type === "dmt"
            ? Number(t.service_fee) - Number(t.portal_commission)
            : Number(t.service_fee) + Number(t.portal_commission)),
        0
      ),
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
    {
      label: "Sales",
      value: totalSales,
      icon: "M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v9",
      grad: "from-emerald-500 to-teal-600",
      sub: `${validInvoices.length} invoices`,
      onClick: () => setTab("invoices"),
    },
    {
      label: "Collected",
      value: totalPaid,
      icon: "M20 6 9 17l-5-5",
      grad: "from-blue-500 to-indigo-600",
      sub: `${inr(totalSales - totalPaid)} outstanding`,
      onClick: () => setTab("accounts"),
    },
    {
      label: "Returns",
      value: totalReturns,
      icon: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
      grad: "from-amber-500 to-orange-600",
      sub: `${validReturns.length} returns`,
      onClick: () => setTab("returns"),
    },
    {
      label: "Expenses",
      value: totalExpenses,
      icon: "M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5",
      grad: "from-rose-500 to-pink-600",
      sub: `${activeExpenses.length} entries`,
      onClick: () => setTab("expenses"),
    },
    {
      label: "Quick Sales",
      value: quickSummary.amount,
      icon: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z",
      grad: "from-teal-500 to-emerald-600",
      sub: `${quickSummary.count} sales · ${inr(quickSummary.amount - quickSummary.cost)} margin`,
      onClick: () => setTab("quick"),
    },
    {
      label: "Net Profit",
      value: net,
      icon: "M3 3v18h18M7 14l4-4 3 3 5-6",
      grad: net >= 0 ? "from-violet-500 to-purple-600" : "from-rose-500 to-red-600",
      sub: "Sales + quick margin + business income − returns − expenses",
      onClick: () => setTab("business"),
    },
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
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8" id="reports-studio-view">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
              Master Ledger Register
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {range.from === "2000-01-01" ? "All-time history" : `${range.from} to ${range.to}`}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
            Reports Studio
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Filtered operational ledger across {validInvoices.length} invoices, {validQuick.length} quick sales, {validTxns.length} service transactions &amp; {activeExpenses.length} expense entries.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/reports/profit-loss"
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <span>P&amp;L Statement</span>
          </Link>
          <Link
            href="/reports/tax-preparation"
            className="flex items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-700 shadow-2xs transition hover:bg-purple-100 dark:border-purple-900/40 dark:bg-purple-950/30 dark:text-purple-300"
          >
            <span>CA Tax Prep / ITR</span>
          </Link>
          <Link
            href="/reports/gst"
            className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 shadow-2xs transition hover:bg-indigo-100 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-300"
          >
            <span>GST (GSTR-1/3B)</span>
          </Link>
          <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-1 text-xs dark:border-white/10 dark:bg-slate-800">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`rounded-lg px-2.5 py-1.5 font-semibold transition ${
                  period === p.key
                    ? "bg-white text-slate-950 shadow-xs dark:bg-slate-900 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex gap-1.5 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100/80 p-1 dark:border-white/10 dark:bg-slate-800/60">
        {tabBtn("overview", "Overview Summary")}
        {tabBtn("invoices", `Invoices (${validInvoices.length})`)}
        {tabBtn("expenses", `Expenses (${activeExpenses.length})`)}
        {tabBtn("returns", `Returns (${validReturns.length})`)}
        {tabBtn("business", `Digital Services (${validTxns.length})`)}
        {tabBtn("accounts", "Payment Accounts")}
        {tabBtn("quick", `Quick POS (${validQuick.length})`)}
      </div>

      {tab === "overview" && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {KPI_CARDS.map((c) => (
              <div
                key={c.label}
                onClick={c.onClick}
                className="group relative cursor-pointer rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-xs dark:border-white/10 dark:bg-slate-900 dark:hover:border-blue-700"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{c.label}</p>
                </div>
                <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-950 dark:text-white tabular-nums">{inr(c.value)}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{c.sub}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-slate-950 dark:text-white">Daily Invoiced Sales Trend</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Total volume in selected period</p>
                </div>
                <span className="font-mono text-sm font-bold text-slate-950 dark:text-white tabular-nums">{inr(totalSales)}</span>
              </div>
              <div className="mt-6 flex h-44 items-end gap-1 sm:gap-1.5">
                {dayTotals.map((d) => (
                  <div key={d.date} className="group flex h-full flex-1 flex-col items-center justify-end" title={`${d.date}: ${inr(d.total)}`}>
                    <div
                      style={{ height: `${Math.max((d.total / dayMax) * 100, d.total > 0 ? 6 : 2)}%` }}
                      className={`w-full rounded-t-sm transition-all ${
                        d.total > 0
                          ? "bg-blue-600 group-hover:bg-blue-500 dark:bg-blue-500 dark:group-hover:bg-blue-400"
                          : "bg-slate-100 dark:bg-slate-800"
                      }`}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-slate-950 dark:text-white">Top Invoiced Items</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">By gross revenue</p>
                </div>
                <button
                  onClick={() =>
                    downloadCsv("top-products.csv", ["Product", "Qty", "Revenue"], topProducts.map((p) => [p.name, p.qty, p.amount]))
                  }
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Export CSV
                </button>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-white/5 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">Product / Service</th>
                      <th className="px-3 py-2 text-right font-medium">Qty</th>
                      <th className="px-3 py-2 text-right font-medium">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {topProducts.map((p) => (
                      <tr key={p.name}>
                        <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-white">{p.name}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">{p.qty}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-950 dark:text-white tabular-nums">{inr(p.amount)}</td>
                      </tr>
                    ))}
                    {topProducts.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-6 text-center text-slate-500 dark:text-slate-400">
                          No product sales in this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-slate-950 dark:text-white">Payments by Instrument</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Total collected: {inr(totalPaid)}</p>
                </div>
                <button
                  onClick={() =>
                    downloadCsv("payments-method.csv", ["Method", "Amount"], methodTotals.map(([m, amt]) => [m, amt]))
                  }
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Export CSV
                </button>
              </div>
              <div className="mt-4 space-y-3.5">
                {methodTotals.map(([m, amt]) => {
                  const pct = totalPaid > 0 ? (amt / totalPaid) * 100 : 0;
                  return (
                    <div key={m}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold uppercase text-slate-700 dark:text-slate-300">{m}</span>
                        <span className="font-mono font-bold text-slate-950 dark:text-white tabular-nums">{inr(amt)} ({pct.toFixed(1)}%)</span>
                      </div>
                      <div className="mt-1.5 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-2 rounded-full bg-blue-600 dark:bg-blue-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {methodTotals.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No payments in period.</p>}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-slate-950 dark:text-white">Customer Receivables &amp; Dues</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Active credit accounts</p>
                </div>
                <button
                  onClick={() => downloadCsv("customer-dues.csv", ["Customer", "Balance"], dues.map((d) => [d.name, d.balance]))}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Export CSV
                </button>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-white/5 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">Customer</th>
                      <th className="px-3 py-2 text-right font-medium">Balance Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {dues.map((c) => (
                      <tr key={c.id}>
                        <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-white">{c.name}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-rose-600 dark:text-rose-400 tabular-nums">{inr(c.balance)}</td>
                      </tr>
                    ))}
                    {dues.length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-3 py-6 text-center text-slate-500 dark:text-slate-400">
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
        <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold text-slate-950 dark:text-white">Invoiced Sales Register</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Showing {recentInvoices.length} invoices matching date criteria</p>
            </div>
            <button
              onClick={() =>
                downloadCsv(
                  "invoices.csv",
                  ["Invoice", "Customer", "Date", "Total", "Paid", "Due", "Status"],
                  recentInvoices.map((i) => [i.invoice_number, i.customers?.name ?? "-", i.invoice_date, i.total, i.paid, i.due, i.status])
                )
              }
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
            >
              Export Register (CSV)
            </button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-white/5 dark:text-slate-400">
                <tr>
                  <th className="px-3.5 py-2.5 font-medium">Invoice #</th>
                  <th className="px-3.5 py-2.5 font-medium">Customer</th>
                  <th className="px-3.5 py-2.5 font-medium">Date</th>
                  <th className="px-3.5 py-2.5 text-right font-medium">Total</th>
                  <th className="px-3.5 py-2.5 text-right font-medium">Paid</th>
                  <th className="px-3.5 py-2.5 text-right font-medium">Due</th>
                  <th className="px-3.5 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {recentInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                    <td className="px-3.5 py-2.5 font-mono text-xs font-bold text-blue-600 dark:text-blue-400">{inv.invoice_number}</td>
                    <td className="px-3.5 py-2.5 font-medium text-slate-800 dark:text-slate-200">{inv.customers?.name ?? "Walk-in Customer"}</td>
                    <td className="px-3.5 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">{inv.invoice_date}</td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-950 dark:text-white tabular-nums">{inr(Number(inv.total))}</td>
                    <td className="px-3.5 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">{inr(Number(inv.paid))}</td>
                    <td className="px-3.5 py-2.5 text-right font-mono text-rose-600 dark:text-rose-400 tabular-nums">{inr(Number(inv.due))}</td>
                    <td className="px-3.5 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_PILL[inv.status] || "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"}`}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {recentInvoices.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3.5 py-8 text-center text-slate-500 dark:text-slate-400">
                      No invoices found for the selected date period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "expenses" && (
        <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold text-slate-950 dark:text-white">Operating Expenses Register</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Total expenses: {inr(totalExpenses)}</p>
            </div>
            <button
              onClick={() =>
                downloadCsv(
                  "expenses.csv",
                  ["Date", "Category", "Amount", "Note", "Status"],
                  recentExpenses.map((e) => [e.expense_date, e.category, e.amount, e.note ?? "-", e.status])
                )
              }
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
            >
              Export Expenses (CSV)
            </button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-white/5 dark:text-slate-400">
                <tr>
                  <th className="px-3.5 py-2.5 font-medium">Date</th>
                  <th className="px-3.5 py-2.5 font-medium">Category</th>
                  <th className="px-3.5 py-2.5 font-medium">Description / Note</th>
                  <th className="px-3.5 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-3.5 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {recentExpenses.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                    <td className="px-3.5 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">{e.expense_date}</td>
                    <td className="px-3.5 py-2.5 font-semibold capitalize text-slate-900 dark:text-white">{e.category}</td>
                    <td className="px-3.5 py-2.5 text-slate-600 dark:text-slate-400">{e.note || "—"}</td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold text-rose-600 dark:text-rose-400 tabular-nums">{inr(Number(e.amount))}</td>
                    <td className="px-3.5 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${e.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-slate-200 text-slate-600"}`}>
                        {e.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {recentExpenses.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3.5 py-8 text-center text-slate-500 dark:text-slate-400">
                      No operating expenses recorded in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "returns" && (
        <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold text-slate-950 dark:text-white">Customer Returns &amp; Credit Notes</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Total returns: {inr(totalReturns)}</p>
            </div>
            <button
              onClick={() =>
                downloadCsv(
                  "returns.csv",
                  ["Return #", "Invoice", "Date", "Subtotal", "Refund", "Status"],
                  recentReturns.map((r) => [r.return_number, r.invoices?.invoice_number ?? "-", r.return_date, r.subtotal, r.refund, r.status])
                )
              }
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
            >
              Export Returns (CSV)
            </button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-white/5 dark:text-slate-400">
                <tr>
                  <th className="px-3.5 py-2.5 font-medium">Return Voucher #</th>
                  <th className="px-3.5 py-2.5 font-medium">Original Invoice</th>
                  <th className="px-3.5 py-2.5 font-medium">Date</th>
                  <th className="px-3.5 py-2.5 text-right font-medium">Subtotal</th>
                  <th className="px-3.5 py-2.5 text-right font-medium">Refund Amount</th>
                  <th className="px-3.5 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {recentReturns.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                    <td className="px-3.5 py-2.5 font-mono text-xs font-bold text-amber-600 dark:text-amber-400">{r.return_number}</td>
                    <td className="px-3.5 py-2.5 font-mono text-xs text-blue-600 dark:text-blue-400">{r.invoices?.invoice_number ?? "—"}</td>
                    <td className="px-3.5 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">{r.return_date}</td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-950 dark:text-white tabular-nums">{inr(Number(r.subtotal))}</td>
                    <td className="px-3.5 py-2.5 text-right font-mono text-rose-600 dark:text-rose-400 tabular-nums">{inr(Number(r.refund))}</td>
                    <td className="px-3.5 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${r.status === "completed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-slate-200 text-slate-600"}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {recentReturns.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3.5 py-8 text-center text-slate-500 dark:text-slate-400">
                      No customer returns recorded in this period.
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
          <div className="mt-6 grid grid-cols-2 gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: "Transactions", value: String(txnSummary.count), sub: `${validTxns.length} successful` },
              { label: "Principal Volume", value: inr(txnSummary.principal), sub: "AEPS / DMT / UPI volume" },
              { label: "Customer Fees", value: inr(txnSummary.fees), sub: "Service fee charged" },
              { label: "Portal Commission", value: inr(txnSummary.commission), sub: "Biller / Portal margin" },
              { label: "Net Shop Income", value: inr(txnSummary.income), sub: "Fees + Commissions" },
            ].map((c) => (
              <div key={c.label} className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{c.label}</p>
                <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-950 dark:text-white tabular-nums">{c.value}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{c.sub}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-bold text-slate-950 dark:text-white">AEPS / DMT / UPI / Bill Pay Register</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">All successful business service transactions</p>
              </div>
              <button
                onClick={() =>
                  downloadCsv(
                    "business-transactions.csv",
                    ["Tr. No", "Service", "Date", "Customer Mobile", "Reference", "Amount", "Service Fee", "Commission", "Status"],
                    validTxns.map((t) => [t.transaction_number, t.service_type.toUpperCase(), t.transaction_date, t.customer_mobile ?? "-", t.reference ?? "-", t.amount, t.service_fee, t.portal_commission, t.status])
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
              >
                Export Services (CSV)
              </button>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-white/5 dark:text-slate-400">
                  <tr>
                    <th className="px-3.5 py-2.5 font-medium">Txn Number</th>
                    <th className="px-3.5 py-2.5 font-medium">Service</th>
                    <th className="px-3.5 py-2.5 font-medium">Date</th>
                    <th className="px-3.5 py-2.5 font-medium">Customer</th>
                    <th className="px-3.5 py-2.5 font-medium">Reference</th>
                    <th className="px-3.5 py-2.5 text-right font-medium">Principal</th>
                    <th className="px-3.5 py-2.5 text-right font-medium">Fee</th>
                    <th className="px-3.5 py-2.5 text-right font-medium">Commission</th>
                    <th className="px-3.5 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {validTxns.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                      <td className="px-3.5 py-2.5 font-mono text-xs font-bold text-blue-600 dark:text-blue-400">{t.transaction_number}</td>
                      <td className="px-3.5 py-2.5">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold uppercase text-slate-700 dark:bg-slate-800 dark:text-slate-300">{t.service_type}</span>
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">{t.transaction_date}</td>
                      <td className="px-3.5 py-2.5 text-slate-700 dark:text-slate-300">{t.customer_mobile || "—"}</td>
                      <td className="px-3.5 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">{t.reference || "—"}</td>
                      <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-950 dark:text-white tabular-nums">{inr(Number(t.amount))}</td>
                      <td className="px-3.5 py-2.5 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">{inr(Number(t.service_fee))}</td>
                      <td className="px-3.5 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">{inr(Number(t.portal_commission))}</td>
                      <td className="px-3.5 py-2.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${TX_STATUS_PILL[t.status] || "bg-slate-100 text-slate-600"}`}>
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {validTxns.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-3.5 py-8 text-center text-slate-500 dark:text-slate-400">
                        No service transactions in this period.
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
        <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-950 dark:text-white">Payment Instruments &amp; Accounts Ledger</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inflow collections across cash drawer, bank accounts, QR terminals and digital wallets
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-slate-950 dark:text-white tabular-nums">
                Total Inflows: {inr(instrumentTotals.reduce((s, r) => s + r.in, 0))}
              </span>
              <button
                onClick={() =>
                  downloadCsv(
                    "payment-accounts.csv",
                    ["Account", "Type", "Received"],
                    instrumentTotals.map((r) => [r.name, INSTRUMENT_LABEL[r.type] ?? r.type, r.in])
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
              >
                Export Accounts (CSV)
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-white/5 dark:text-slate-400">
                <tr>
                  <th className="px-3.5 py-2.5 font-medium">Instrument / Account</th>
                  <th className="px-3.5 py-2.5 font-medium">Type</th>
                  <th className="px-3.5 py-2.5 text-right font-medium">Total Received Inflow</th>
                  <th className="w-8 px-3.5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
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
                        className="cursor-pointer hover:bg-slate-50/50 dark:hover:bg-white/5"
                      >
                        <td className="px-3.5 py-2.5 font-bold text-slate-900 dark:text-white">{r.name}</td>
                        <td className="px-3.5 py-2.5">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold capitalize text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {INSTRUMENT_LABEL[r.type] ?? r.type}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-950 dark:text-white tabular-nums">{inr(r.in)}</td>
                        <td className="px-3.5 py-2.5 text-right text-slate-400">{open ? "−" : "+"}</td>
                      </tr>
                      {open && (
                        <tr className="bg-slate-50/70 dark:bg-slate-800/40">
                          <td colSpan={4} className="px-4 py-3">
                            {detail.length === 0 ? (
                              <p className="text-xs text-slate-400">No entries in this period.</p>
                            ) : (
                              <ul className="divide-y divide-slate-200/50 dark:divide-white/5">
                                {detail.map((ce) => (
                                  <li key={ce.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                                    <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-300">
                                      <span className="font-mono font-semibold">{ce.entry_date}</span>
                                      {" · "}
                                      {ce.description || ce.method}
                                    </span>
                                    <span className="shrink-0 font-mono font-bold text-slate-950 dark:text-white tabular-nums">{inr(Number(ce.amount))}</span>
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
                    <td colSpan={4} className="px-3.5 py-8 text-center text-slate-500 dark:text-slate-400">
                      No collections recorded in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "quick" && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Quick POS Sales", value: String(quickSummary.count), sub: `${validQuick.length} sales in period` },
              { label: "Collected Amount", value: inr(quickSummary.amount), sub: "Gross counter turnover" },
              { label: "Direct POS Cost", value: inr(quickSummary.cost), sub: "Item acquisition cost" },
              { label: "Gross POS Margin", value: inr(quickSummary.amount - quickSummary.cost), sub: "Amount − Cost" },
            ].map((c) => (
              <div key={c.label} className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{c.label}</p>
                <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-950 dark:text-white tabular-nums">{c.value}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{c.sub}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-slate-950 dark:text-white">Quick Sales by Instrument</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Total: {inr(quickSummary.amount)}</p>
                </div>
              </div>
              <div className="mt-4 space-y-3.5">
                {quickSummary.byMethod.map(([m, amt]) => {
                  const pct = quickSummary.amount > 0 ? (amt / quickSummary.amount) * 100 : 0;
                  return (
                    <div key={m}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold uppercase text-slate-700 dark:text-slate-300">{INSTRUMENT_LABEL[m] ?? m}</span>
                        <span className="font-mono font-bold text-slate-950 dark:text-white tabular-nums">{inr(amt)} ({pct.toFixed(1)}%)</span>
                      </div>
                      <div className="mt-1.5 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-2 rounded-full bg-emerald-600 dark:bg-emerald-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {quickSummary.byMethod.length === 0 && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No quick sales recorded.</p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-slate-950 dark:text-white">Quick POS Counter Register</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Recent over-the-counter slips</p>
                </div>
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
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Export CSV
                </button>
              </div>
              <div className="mt-4 max-h-80 overflow-x-auto overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">Slip #</th>
                      <th className="px-3 py-2 font-medium">Item Description</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                      <th className="px-3 py-2 text-right font-medium">Margin</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {validQuick.slice(0, 50).map((q) => (
                      <tr key={q.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                        <td className="px-3 py-2 font-mono text-xs font-bold text-teal-600 dark:text-teal-400">{q.sale_number}</td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                          <span className="block max-w-[180px] truncate font-medium text-slate-900 dark:text-white">
                            {q.item_name ?? q.products?.name ?? q.services?.name ?? "Sale (general)"}
                          </span>
                          <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                            {q.sale_date} · {q.customers?.name ?? "Walk-in"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-slate-950 dark:text-white tabular-nums">{inr(Number(q.amount))}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {inr(Number(q.amount) - Number(q.cost))}
                        </td>
                        <td className="px-3 py-2">
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold capitalize text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            {q.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {validQuick.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-slate-500 dark:text-slate-400">
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

      <div className="mt-8 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-600 dark:text-slate-400">
          <Link href="/reports/profit-loss" className="text-blue-600 hover:underline dark:text-blue-400">
            Profit &amp; Loss Statement →
          </Link>
          <Link href="/reports/cash-bank" className="text-blue-600 hover:underline dark:text-blue-400">
            Cash &amp; Bank Reconciliation →
          </Link>
          <Link href="/reports/transaction-audit" className="text-blue-600 hover:underline dark:text-blue-400">
            Transaction GL Audit →
          </Link>
        </div>
        <button
          onClick={() => window.print()}
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          Print Formal Report
        </button>
      </div>
    </div>
  );
}
