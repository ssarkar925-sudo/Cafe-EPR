"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRealtime } from "@/lib/supabase/realtime";

type Inv = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total: string;
  paid: string;
  due: string;
  status: string;
  customers: { name: string | null } | null;
  created_at: string;
};
type Pay = { method: string; amount: string; received_at: string };
type Cash = { method: string; direction: string; amount: string; entry_date: string };
type Exp = { expense_date: string; amount: string; status: string };
type Stock = { id: string; name: string; stock_qty: number; reorder_level: number };
type TopRow = {
  invoice_date: string;
  invoice_items: { product_id: string | null; amount: string; products: { name: string | null } | null }[];
};

type Pnl = {
  revenue: number;
  returns: number;
  cogs: number;
  commission_income: number;
  expenses: number;
  net_revenue: number;
  gross_profit: number;
  net_profit: number;
  invoice_count: number;
};

function inr(n: number) {
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const DAY = 86400000;

function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

const STATUS_PILL: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-700",
  unpaid: "bg-rose-100 text-rose-700",
  cancelled: "bg-slate-200 text-slate-600",
};

const METHOD_COLOR: Record<string, string> = {
  cash: "#059669",
  upi: "#2563eb",
  card: "#7c3aed",
};

function Icon({ path, className }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className || "h-5 w-5"}>
      <path d={path} />
    </svg>
  );
}

const ICONS = {
  rupee: "M6 3h12M6 8h12M6 13h8a4 4 0 0 0 0-8H6v17",
  receipt: "M6 2h12a1 1 0 0 1 1 1v18l-2.5-1.5L14 21l-2.5-1.5L9 21l-2.5-1.5L5 21V3a1 1 0 0 1 1-1Z",
  wallet: "M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2M3 10h18M16 15h2",
  clock: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  alert: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  users: "M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  box: "M21 8 12 3 3 8m18 0v8l-9 5-9-5V8m18 0-9 5m0 0L3 8m9 5v8",
  trend: "M23 6l-9.5 9.5-5-5L1 18M17 6h6v6",
  arrowUp: "M12 19V5M5 12l7-7 7 7",
  arrowDown: "M12 5v14M19 12l-7 7-7-7",
  sparkle: "M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8",
};

const KPI_CARDS = [
  { key: "salesToday", label: "Sales Today", icon: ICONS.rupee, gradient: "from-emerald-500 to-teal-600" },
  { key: "invoicesToday", label: "Invoices Today", icon: ICONS.receipt, gradient: "from-blue-500 to-indigo-600" },
  { key: "cashInHand", label: "Cash in Hand", icon: ICONS.wallet, gradient: "from-indigo-500 to-violet-600" },
  { key: "netProfit", label: "Net Profit (Month)", icon: ICONS.trend, gradient: "from-emerald-500 to-teal-600" },
  { key: "receivables", label: "Receivables", icon: ICONS.clock, gradient: "from-rose-500 to-pink-600" },
];

export default function DashboardClient({
  name,
  avatarUrl,
  customers,
  products,
  services,
  invoices,
  payments,
  cashEntries,
  expenses,
  stock,
  topRows,
  pnl,
  today,
}: {
  name: string;
  avatarUrl: string | null;
  customers: number;
  products: number;
  services: number;
  invoices: Inv[];
  payments: Pay[];
  cashEntries: Cash[];
  expenses: Exp[];
  stock: Stock[];
  topRows: TopRow[];
  pnl: Pnl | null;
  today: string;
}) {
  useRealtime([
    "invoices",
    "invoice_items",
    "payments",
    "products",
    "customers",
    "services",
    "cash_entries",
    "expenses",
    "transactions",
  ]);

  const [period, setPeriod] = useState(7);

  const open = useMemo(() => invoices.filter((i) => i.status !== "cancelled"), [invoices]);
  const salesToday = useMemo(
    () => open.filter((i) => i.invoice_date === today).reduce((s, i) => s + Number(i.total), 0),
    [open, today]
  );
  const invoicesToday = useMemo(() => open.filter((i) => i.invoice_date === today).length, [open, today]);
  const yesterdayKey = dateKey(new Date(Date.now() - DAY));
  const yesterday = useMemo(
    () => open.filter((i) => i.invoice_date === yesterdayKey).reduce((s, i) => s + Number(i.total), 0),
    [open, yesterdayKey]
  );
  const trend = yesterday > 0 ? Math.round(((salesToday - yesterday) / yesterday) * 100) : null;

  const cashInHand = useMemo(
    () =>
      cashEntries
        .filter((c) => c.method === "cash")
        .reduce((s, c) => s + (c.direction === "in" ? Number(c.amount) : -Number(c.amount)), 0),
    [cashEntries]
  );

  const receivables = useMemo(
    () =>
      invoices
        .filter((i) => i.status === "unpaid" || i.status === "partial")
        .reduce((s, i) => s + Number(i.due), 0),
    [invoices]
  );

  const expensesToday = useMemo(
    () => expenses.filter((e) => e.status === "active" && e.expense_date === today).reduce((s, e) => s + Number(e.amount), 0),
    [expenses, today]
  );

  const lowStock = useMemo(() => stock.filter((p) => Number(p.stock_qty) <= Number(p.reorder_level)), [stock]);

  const chart = useMemo(() => {
    const end = new Date(Date.now());
    const days: { date: string; value: number }[] = [];
    for (let i = period - 1; i >= 0; i--) {
      const d = new Date(end.getTime() - i * DAY);
      const key = dateKey(d);
      days.push({ date: key, value: 0 });
    }
    const map = new Map<string, number>();
    for (const inv of open) {
      const v = map.get(inv.invoice_date) ?? 0;
      map.set(inv.invoice_date, v + Number(inv.total));
    }
    return days.map((d) => ({ ...d, value: map.get(d.date) ?? 0 }));
  }, [period, open]);

  const maxChart = Math.max(...chart.map((c) => c.value), 1);

  const methods = useMemo(() => {
    const cutoff = new Date(Date.now() - period * DAY).toISOString();
    const within = payments.filter((p) => p.received_at >= cutoff);
    const agg: Record<string, number> = {};
    for (const p of within) agg[p.method] = (agg[p.method] ?? 0) + Number(p.amount);
    const order = ["cash", "upi", "card"];
    return order.filter((m) => agg[m]).map((m) => ({ method: m, value: agg[m] }));
  }, [payments, period]);
  const totalPaid = methods.reduce((s, m) => s + m.value, 0);

  const topProducts = useMemo(() => {
    const agg: Record<string, number> = {};
    for (const row of topRows) {
      for (const it of row.invoice_items ?? []) {
        const nm = it.products?.name || "Item";
        agg[nm] = (agg[nm] ?? 0) + Number(it.amount);
      }
    }
    return Object.entries(agg)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [topRows]);

  const recent = invoices.slice(0, 6);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateStr = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const kpiValues: Record<string, { value: string; sub: React.ReactNode }> = {
    salesToday: {
      value: inr(salesToday),
      sub: trend === null ? (
        <span className="text-slate-400">No sales yesterday for comparison</span>
      ) : trend >= 0 ? (
        <span className="inline-flex items-center gap-1 text-emerald-600">
          <Icon path={ICONS.arrowUp} className="h-3 w-3" /> {trend}% vs yesterday
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-rose-500">
          <Icon path={ICONS.arrowDown} className="h-3 w-3" /> {Math.abs(trend)}% vs yesterday
        </span>
      ),
    },
    invoicesToday: { value: String(invoicesToday), sub: <span className="text-slate-400">{today}</span> },
    cashInHand: { value: inr(cashInHand), sub: <span className="text-slate-400">Cash balance (all time)</span> },
    netProfit: {
      value: inr(pnl?.net_profit ?? 0),
      sub:
        pnl && pnl.net_profit >= 0 ? (
          <span className="inline-flex items-center gap-1 text-emerald-600">
            <Icon path={ICONS.arrowUp} className="h-3 w-3" /> This month
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-rose-500">
            <Icon path={ICONS.arrowDown} className="h-3 w-3" /> This month
          </span>
        ),
    },
    receivables: { value: inr(receivables), sub: <span className="text-slate-400">Unpaid + partial invoices</span> },
  };

  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const segments = methods.map((m) => {
    const frac = totalPaid > 0 ? m.value / totalPaid : 0;
    const seg = { ...m, dash: frac * C, offset };
    offset += frac * C;
    return seg;
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-600">{dateStr}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {greeting}, {name} 👋
          </h1>
          <p className="mt-1 text-sm text-slate-500">Here's what's happening at your shop today.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-12 w-12 rounded-2xl object-cover shadow-sm ring-2 ring-slate-100" />
          )}
          <Link
            href="/pos"
            className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
          >
            New Sale
          </Link>
          <Link
            href="/customers"
            className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Add Customer
          </Link>
          <Link
            href="/finance/expenses"
            className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Record Expense
          </Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {KPI_CARDS.map((c) => (
          <div key={c.key} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${c.gradient}`} />
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">{c.label}</p>
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${c.gradient} text-white shadow-sm`}>
                <Icon path={c.icon} className="h-4.5 w-4.5" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{kpiValues[c.key].value}</p>
            <div className="mt-1 text-xs">{kpiValues[c.key].sub}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Revenue</h2>
              <p className="text-xs text-slate-400">Sales (paid + partial invoices) per day</p>
            </div>
            <div className="flex rounded-lg border border-slate-200 p-0.5">
              {[7, 14, 30].map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                    period === p ? "bg-[#0f172a] text-white" : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {p}D
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5 flex h-44 items-end gap-1.5 sm:gap-2">
            {chart.map((d, i) => (
              <div key={d.date} className="group flex h-full flex-1 flex-col items-center justify-end">
                <div
                  style={{ height: `${Math.max((d.value / maxChart) * 100, d.value > 0 ? 4 : 1.5)}%` }}
                  className={`w-full rounded-t-md transition-all ${
                    d.date === today
                      ? "bg-gradient-to-t from-blue-600 to-indigo-400"
                      : "bg-gradient-to-t from-slate-300 to-slate-200 group-hover:from-blue-500 group-hover:to-blue-300"
                  }`}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5 sm:gap-2">
            {chart.map((d) => (
              <div key={d.date} className="flex-1 text-center">
                <p className="hidden text-[10px] text-slate-400 sm:block">
                  {new Date(d.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-blue-600" /> Today
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-slate-300" /> Past days
            </span>
            <span className="ml-auto font-medium text-slate-600">
              {inr(chart.reduce((s, c) => s + c.value, 0))} in {period} days
            </span>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">Payments</h2>
          <p className="text-xs text-slate-400">Split by method ({period} days)</p>
          {methods.length > 0 ? (
            <div className="mt-4 flex items-center gap-5">
              <svg viewBox="0 0 120 120" className="h-36 w-36 shrink-0 -rotate-90">
                <circle cx="60" cy="60" r={R} fill="none" stroke="#f1f5f9" strokeWidth="14" />
                {segments.map((s) => (
                  <circle
                    key={s.method}
                    cx="60"
                    cy="60"
                    r={R}
                    fill="none"
                    stroke={METHOD_COLOR[s.method]}
                    strokeWidth="14"
                    strokeDasharray={`${s.dash} ${C - s.dash}`}
                    strokeDashoffset={-s.offset}
                  />
                ))}
              </svg>
              <div className="space-y-2.5">
                {methods.map((m) => (
                  <div key={m.method} className="flex items-center justify-between gap-6 text-sm">
                    <span className="inline-flex items-center gap-2 text-slate-600">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: METHOD_COLOR[m.method] }} />
                      <span className="capitalize">{m.method}</span>
                    </span>
                    <span className="font-medium text-slate-900">{inr(m.value)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-6 border-t border-slate-100 pt-2 text-sm">
                  <span className="text-slate-400">Total</span>
                  <span className="font-semibold text-slate-900">{inr(totalPaid)}</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">No payments recorded yet.</p>
          )}
        </section>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Profit &amp; Loss</h2>
            <p className="text-xs text-slate-400">This month · {pnl?.invoice_count ?? 0} invoices</p>
          </div>
          <Link href="/finance/pnl" className="text-sm font-medium text-blue-600 hover:text-blue-700">
            Full report →
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <PnlTile label="Net Revenue" value={pnl?.net_revenue ?? 0} tone="slate" />
          <PnlTile label="COGS" value={pnl?.cogs ?? 0} tone="amber" />
          <PnlTile label="Gross Profit" value={pnl?.gross_profit ?? 0} tone={pnl && pnl.gross_profit >= 0 ? "emerald" : "rose"} />
          <PnlTile label="Commission" value={pnl?.commission_income ?? 0} tone="violet" />
          <PnlTile label="Expenses" value={pnl?.expenses ?? 0} tone="rose" />
          <PnlTile label="Net Profit" value={pnl?.net_profit ?? 0} tone={pnl && pnl.net_profit >= 0 ? "emerald" : "rose"} strong />
        </div>
        {pnl && (
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
              style={{ width: `${pnl.net_revenue > 0 ? Math.max(2, Math.min(100, (pnl.net_profit / pnl.net_revenue) * 100)) : 0}%` }}
            />
          </div>
        )}
        {pnl && (
          <p className="mt-2 text-xs text-slate-400">
            Net margin:{" "}
            <span className={pnl.net_profit >= 0 ? "font-medium text-emerald-600" : "font-medium text-rose-600"}>
              {pnl.net_revenue > 0 ? ((pnl.net_profit / pnl.net_revenue) * 100).toFixed(1) : "0.0"}%
            </span>
          </p>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Recent Invoices</h2>
              <p className="text-xs text-slate-400">Latest {recent.length} by date</p>
            </div>
            <Link href="/invoices" className="text-sm font-medium text-blue-600 hover:text-blue-700">
              View all →
            </Link>
          </div>
          {recent.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-4 font-medium">Invoice</th>
                    <th className="py-2 pr-4 font-medium">Customer</th>
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 text-right font-medium">Total</th>
                    <th className="py-2 pr-4 text-right font-medium">Due</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((inv) => (
                    <tr key={inv.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2.5 pr-4 font-mono text-xs font-medium text-blue-700">{inv.invoice_number}</td>
                      <td className="py-2.5 pr-4 text-slate-700">{inv.customers?.name ?? "-"}</td>
                      <td className="py-2.5 pr-4 text-slate-500">{inv.invoice_date}</td>
                      <td className="py-2.5 pr-4 text-right font-medium text-slate-900">{inr(Number(inv.total))}</td>
                      <td className="py-2.5 pr-4 text-right text-slate-500">{inr(Number(inv.due))}</td>
                      <td className="py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_PILL[inv.status] || "bg-slate-100 text-slate-600"}`}>
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">No invoices yet. Head to POS to make your first sale.</p>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">Inventory Alerts</h2>
                <p className="text-xs text-slate-400">{lowStock.length} low or out of stock</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                <Icon path={ICONS.alert} className="h-4.5 w-4.5" />
              </div>
            </div>
            {lowStock.length > 0 ? (
              <ul className="mt-4 space-y-2.5">
                {lowStock.slice(0, 6).map((p) => {
                  const out = Number(p.stock_qty) <= 0;
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm text-slate-700">{p.name}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${out ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                        {out ? "Out" : `${p.stock_qty} left`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-slate-500">All stock levels are fine.</p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">Top Products</h2>
                <p className="text-xs text-slate-400">By sales value, last 7 days</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                <Icon path={ICONS.sparkle} className="h-4.5 w-4.5" />
              </div>
            </div>
            {topProducts.length > 0 ? (
              <ul className="mt-4 space-y-2.5">
                {topProducts.map((p, i) => (
                  <li key={p.name} className="flex items-center gap-3">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${i === 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                      {i + 1}
                    </span>
                    <span className="truncate flex-1 text-sm text-slate-700">{p.name}</span>
                    <span className="text-sm font-medium text-slate-900">{inr(p.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-slate-500">No sales yet this week.</p>
            )}
          </section>

          <section className="grid grid-cols-2 gap-4">
            {[
              { label: "Customers", value: customers, icon: ICONS.users, grad: "from-blue-500 to-cyan-500" },
              { label: "Products", value: products, icon: ICONS.box, grad: "from-violet-500 to-purple-500" },
              { label: "Services", value: services, icon: ICONS.sparkle, grad: "from-fuchsia-500 to-pink-500" },
              { label: "Expenses Today", value: inr(expensesToday), icon: ICONS.rupee, grad: "from-amber-500 to-orange-500" },
            ].map((s) => (
              <Link
                key={s.label}
                href={s.label === "Customers" ? "/customers" : s.label === "Products" ? "/catalog/products" : s.label === "Services" ? "/catalog/services" : "/finance/expenses"}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${s.grad} text-white`}>
                  <Icon path={s.icon} className="h-4.5 w-4.5" />
                </div>
                <p className="mt-3 text-lg font-bold text-slate-900">{s.value}</p>
                <p className="text-xs text-slate-400">{s.label}</p>
              </Link>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

function PnlTile({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: number;
  tone: "slate" | "amber" | "emerald" | "rose" | "violet";
  strong?: boolean;
}) {
  const colors = {
    slate: "text-slate-900",
    amber: "text-amber-600",
    emerald: "text-emerald-600",
    rose: "text-rose-600",
    violet: "text-violet-600",
  }[tone];
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 truncate text-lg font-bold ${colors} ${strong ? "" : ""}`}>
        {inr(value)}
      </p>
    </div>
  );
}
