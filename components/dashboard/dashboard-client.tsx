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
type Tx = {
  id: string;
  transaction_number: string;
  service_type: string;
  direction: string;
  transaction_date: string;
  amount: string;
  service_fee: string;
  portal_commission: string;
  status: string;
  customer_mobile: string | null;
  customers: { name: string | null } | null;
};
type Debtor = { name: string; balance: string };

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
  categories: { category: string; amount: number; count: number }[];
};

type Settlement = {
  cash: number;
  bank: number;
  wallet: number;
  dmt: number;
  aeps: number;
  upi_qr: number;
  count: number;
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

const TX_STATUS_PILL: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  failed: "bg-rose-100 text-rose-700",
  reversed: "bg-slate-200 text-slate-600",
  deleted: "bg-rose-100 text-rose-700",
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
  bank: "M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01",
  clock: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  alert: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  users: "M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  box: "M21 8 12 3 3 8m18 0v8l-9 5-9-5V8m18 0-9 5m0 0L3 8m9 5v8",
  trend: "M23 6l-9.5 9.5-5-5L1 18M17 6h6v6",
  arrowUp: "M12 19V5M5 12l7-7 7 7",
  arrowDown: "M12 5v14M19 12l-7 7-7-7",
  sparkle: "M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8",
  coins: "M8 9l4-4 8 4-8 4-4-4ZM8 9v6m0 0 4 4 8-4-4-4m-4 4V9m8 0v6",
  percent: "M19 5 5 19M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm11 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  minus: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm5-10H7",
  flow: "M8 3v12m0 0-4-4m4 4 4-4M16 21V9m0 0-4 4m4-4 4 4",
  send: "M22 2 11 13M22 2 15 22l-4-9-9-4z",
  card: "M4 10h16M4 14h16M6 18V7m4 11V7m4 11V7m4 11V7M2 7l10-5 10 5z",
  qr: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14h1M14 20h1M20 20h1",
  bolt: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z",
};

const HERO_CARDS = [
  { key: "salesToday", label: "Sales Today", icon: ICONS.rupee, gradient: "from-emerald-500 to-teal-600", href: "/invoices" },
  { key: "quickToday", label: "Quick Sales Today", icon: ICONS.bolt, gradient: "from-teal-500 to-emerald-600", href: "/pos?mode=quick" },
  { key: "businessToday", label: "Business Income", icon: ICONS.coins, gradient: "from-violet-500 to-purple-600", href: "/business/upi" },
  { key: "expensesToday", label: "Expenses Today", icon: ICONS.minus, gradient: "from-rose-500 to-pink-600", href: "/finance/expenses" },
  { key: "cashFlowToday", label: "Cash Flow Today", icon: ICONS.flow, gradient: "from-blue-500 to-indigo-600", href: "/finance/cashbook" },
  { key: "netToday", label: "Net Today", icon: ICONS.trend, gradient: "from-emerald-500 to-teal-600", href: "/finance/pnl" },
];

const MONEY_CARDS = [
  { key: "cash", label: "Cash in Hand", icon: ICONS.wallet, gradient: "from-indigo-500 to-violet-600", href: "/finance/cashbook" },
  { key: "bank", label: "Cash in Bank", icon: ICONS.bank, gradient: "from-blue-500 to-indigo-600", href: "/finance/settlements" },
  { key: "wallet", label: "Cash in Wallet", icon: ICONS.wallet, gradient: "from-emerald-500 to-teal-600", href: "/finance/settlements" },
  { key: "dmt", label: "DMT Float", icon: ICONS.send, gradient: "from-violet-500 to-purple-600", href: "/business/dmt" },
  { key: "aeps", label: "AEPS Float", icon: ICONS.card, gradient: "from-amber-500 to-orange-600", href: "/business/aeps" },
  { key: "upi_qr", label: "UPI QR", icon: ICONS.qr, gradient: "from-rose-500 to-pink-600", href: "/business/upi" },
];

const SERVICE_META: Record<string, { label: string; grad: string; icon: string }> = {
  aeps: { label: "AEPS", grad: "from-blue-500 to-cyan-400", icon: ICONS.card },
  dmt: { label: "DMT", grad: "from-violet-500 to-purple-500", icon: ICONS.send },
  upi: { label: "UPI", grad: "from-rose-500 to-pink-500", icon: ICONS.qr },
};

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
  settlement,
  receivables,
  transactions,
  topDebtors,
  quickTodayCount = 0,
  quickTodayAmount = 0,
  quickTodayMargin = 0,
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
  settlement: Settlement | null;
  receivables: number;
  transactions: Tx[];
  topDebtors: Debtor[];
  quickTodayCount: number;
  quickTodayAmount: number;
  quickTodayMargin: number;
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
    "settlements",
  ]);

  const [period, setPeriod] = useState(7);
  const monthFrom = today.slice(0, 8) + "01";

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

  const mtdSales = useMemo(
    () => open.filter((i) => i.invoice_date >= monthFrom).reduce((s, i) => s + Number(i.total), 0),
    [open, monthFrom]
  );

  const cashInHand = useMemo(
    () =>
      cashEntries
        .filter((c) => c.method === "cash")
        .reduce((s, c) => s + (c.direction === "in" ? Number(c.amount) : -Number(c.amount)), 0),
    [cashEntries]
  );

  const expensesToday = useMemo(
    () => expenses.filter((e) => e.status === "active" && e.expense_date === today).reduce((s, e) => s + Number(e.amount), 0),
    [expenses, today]
  );
  const mtdExpenses = useMemo(
    () => expenses.filter((e) => e.status === "active" && e.expense_date >= monthFrom).reduce((s, e) => s + Number(e.amount), 0),
    [expenses, monthFrom]
  );

  const cashFlowToday = useMemo(
    () =>
      cashEntries
        .filter((c) => c.entry_date === today)
        .reduce((s, c) => s + (c.direction === "in" ? Number(c.amount) : -Number(c.amount)), 0),
    [cashEntries, today]
  );

  const txnsToday = useMemo(
    () => transactions.filter((t) => t.status === "success" && t.transaction_date === today),
    [transactions, today]
  );
  const txnsMTD = useMemo(
    () => transactions.filter((t) => t.status === "success" && t.transaction_date >= monthFrom),
    [transactions, monthFrom]
  );

  const bizAgg = (rows: Tx[]) =>
    rows.reduce(
      (s, t) => ({
        count: s.count + 1,
        volume: s.volume + Number(t.amount),
        fees: s.fees + Number(t.service_fee),
        commission: s.commission + Number(t.portal_commission),
      }),
      { count: 0, volume: 0, fees: 0, commission: 0 }
    );

  const businessToday = useMemo(() => {
    const a = bizAgg(txnsToday);
    return { ...a, income: a.fees + a.commission };
  }, [txnsToday]);
  const businessMTD = useMemo(() => {
    const a = bizAgg(txnsMTD);
    return { ...a, income: a.fees + a.commission };
  }, [txnsMTD]);

  const perService = useMemo(
    () =>
      ["aeps", "dmt", "upi"].map((svc) => {
        const todayRows = txnsToday.filter((t) => t.service_type === svc);
        const mtdRows = txnsMTD.filter((t) => t.service_type === svc);
        const t = bizAgg(todayRows);
        const m = bizAgg(mtdRows);
        return {
          service: svc,
          todayCount: t.count,
          todayIncome: t.fees + t.commission,
          todayVolume: t.volume,
          mtdIncome: m.fees + m.commission,
          mtdCount: m.count,
        };
      }),
    [txnsToday, txnsMTD]
  );

  const recentBiz = useMemo(
    () => transactions.filter((t) => t.status === "success").slice(0, 5),
    [transactions]
  );

  const netToday = salesToday + businessToday.income - expensesToday;

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

  const heroValues: Record<string, { value: string; sub: React.ReactNode }> = {
    salesToday: {
      value: inr(salesToday),
      sub:
        trend === null ? (
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
    quickToday: {
      value: inr(quickTodayAmount),
      sub: <span className="text-slate-400">{quickTodayCount} quick sale{quickTodayCount === 1 ? "" : "s"} · margin {inr(quickTodayMargin)}</span>,
    },
    businessToday: {
      value: inr(businessToday.income),
      sub: <span className="text-slate-400">{businessToday.count} AEPS/DMT/UPI · MTD {inr(businessMTD.income)}</span>,
    },
    expensesToday: {
      value: inr(expensesToday),
      sub: <span className="text-slate-400">MTD {inr(mtdExpenses)}</span>,
    },
    cashFlowToday: {
      value: inr(cashFlowToday),
      sub: <span className="text-slate-400">{cashFlowToday >= 0 ? "Money in today" : "Money out today"}</span>,
    },
    netToday: {
      value: inr(netToday),
      sub: <span className="text-slate-400">Sales + Business − Expenses</span>,
    },
  };

  const mtd = [
    { label: "Sales (MTD)", value: inr(mtdSales), href: "/invoices" },
    { label: "Business Income (MTD)", value: inr(businessMTD.income), href: "/business/upi" },
    { label: "Expenses (MTD)", value: inr(mtdExpenses), href: "/finance/expenses" },
    {
      label: "Net Profit (MTD)",
      value: inr(pnl?.net_profit ?? 0),
      tone: pnl && pnl.net_profit >= 0 ? "text-emerald-600" : "text-rose-600",
      href: "/finance/pnl",
    },
  ];

  const moneyValues: Record<string, number> = {
    cash: cashInHand,
    bank: settlement?.bank ?? 0,
    wallet: settlement?.wallet ?? 0,
    dmt: settlement?.dmt ?? 0,
    aeps: settlement?.aeps ?? 0,
    upi_qr: settlement?.upi_qr ?? 0,
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

  const BIZ_CARDS = [
    { key: "count", label: "Transactions Today", value: String(businessToday.count), sub: `MTD ${businessMTD.count}`, icon: ICONS.receipt, grad: "from-blue-500 to-indigo-600", href: "/business/upi" },
    { key: "volume", label: "Volume Today", value: inr(businessToday.volume), sub: `MTD ${inr(businessMTD.volume)}`, icon: ICONS.rupee, grad: "from-emerald-500 to-teal-600", href: "/business/upi" },
    { key: "fees", label: "Customer Fees Today", value: inr(businessToday.fees), sub: `MTD ${inr(businessMTD.fees)}`, icon: ICONS.coins, grad: "from-amber-500 to-orange-600", href: "/business/upi" },
    { key: "income", label: "Shop Income Today", value: inr(businessToday.income), sub: `MTD ${inr(businessMTD.income)}`, icon: ICONS.trend, grad: "from-violet-500 to-purple-600", href: "/business/upi" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-600">{dateStr}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {greeting}, {name} 👋
          </h1>
          <p className="mt-1 text-sm text-slate-500">Here's the complete health of your shop today.</p>
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
            href="/finance/expenses"
            className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Record Expense
          </Link>
        </div>
      </div>

      {/* Today's Pulse */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {HERO_CARDS.map((c) => (
          <Link key={c.key} href={c.href} className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${c.gradient}`} />
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">{c.label}</p>
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${c.gradient} text-white shadow-sm`}>
                <Icon path={c.icon} className="h-4.5 w-4.5" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{heroValues[c.key].value}</p>
            <div className="mt-1 text-xs">{heroValues[c.key].sub}</div>
          </Link>
        ))}
      </div>

      {/* Month-to-date strip */}
      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 shadow-sm lg:grid-cols-4">
        {mtd.map((m) => (
          <Link key={m.label} href={m.href} className="group bg-white p-4 transition hover:bg-slate-50">
            <p className="text-xs font-medium text-slate-500">{m.label}</p>
            <p className={`mt-1 text-lg font-bold ${m.tone ?? "text-slate-900"}`}>{m.value}</p>
          </Link>
        ))}
      </div>

      {/* Money Position */}
      <div className="mt-8 flex items-end justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Money Position</h2>
          <p className="text-xs text-slate-400">Where your money sits right now · receivables {inr(receivables)}</p>
        </div>
        <Link href="/finance/settlements" className="text-sm font-medium text-blue-600 hover:text-blue-700">
          Settlements →
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {MONEY_CARDS.map((c) => (
          <Link key={c.key} href={c.href} className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${c.gradient}`} />
            <div className="flex items-center gap-2">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${c.gradient} text-white shadow`}>
                <Icon path={c.icon} className="h-4 w-4" />
              </span>
              <p className="text-xs font-medium text-slate-500">{c.label}</p>
            </div>
            <p className="mt-3 text-lg font-bold text-slate-900">{inr(moneyValues[c.key])}</p>
          </Link>
        ))}
      </div>

      {/* Business — AEPS / DMT / UPI */}
      <div className="mt-8 flex items-end justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Business — AEPS / DMT / UPI</h2>
          <p className="text-xs text-slate-400">Agent banking &amp; remittance income, tracked separately from POS sales</p>
        </div>
        <Link href="/business/aeps" className="text-sm font-medium text-blue-600 hover:text-blue-700">
          All business →
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {BIZ_CARDS.map((c) => (
              <Link key={c.key} href={c.href} className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${c.grad}`} />
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-500">{c.label}</p>
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${c.grad} text-white shadow`}>
                    <Icon path={c.icon} className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-2 text-xl font-bold text-slate-900">{c.value}</p>
                <p className="text-[11px] text-slate-400">{c.sub}</p>
              </Link>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {perService.map((s) => {
              const meta = SERVICE_META[s.service];
              return (
                <Link key={s.service} href={`/business/${s.service}`} className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${meta.grad} text-white`}>
                        <Icon path={meta.icon} className="h-3.5 w-3.5" />
                      </span>
                      {meta.label}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {s.todayCount} today
                    </span>
                  </div>
                  <p className="mt-3 text-lg font-bold text-slate-900">{inr(s.todayIncome)}</p>
                  <p className="text-[11px] text-slate-400">
                    Volume {inr(s.todayVolume)} · MTD {inr(s.mtdIncome)} ({s.mtdCount})
                  </p>
                </Link>
              );
            })}
          </div>
        </div>

        <Link href="/business/upi" className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">Recent Business</h3>
              <p className="text-xs text-slate-400">Latest successful transactions</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
              <Icon path={ICONS.coins} className="h-4.5 w-4.5" />
            </div>
          </div>
          {recentBiz.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {recentBiz.map((t) => {
                const meta = SERVICE_META[t.service_type] ?? SERVICE_META.upi;
                return (
                  <li key={t.id} className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${meta.grad} text-white`}>
                        <Icon path={meta.icon} className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs font-medium text-blue-700">{t.transaction_number}</p>
                        <p className="truncate text-xs text-slate-400">
                          {t.customers?.name || t.customer_mobile || "Walk-in"} · {t.transaction_date}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-slate-900">{inr(Number(t.amount))}</p>
                      <p className="text-[11px] text-emerald-600">+{inr(Number(t.service_fee) + Number(t.portal_commission))}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate-500">No business transactions yet.</p>
          )}
        </Link>
      </div>

      {/* Charts */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Link href="/invoices" className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Revenue</h2>
              <p className="text-xs text-slate-400">Sales (paid + partial invoices) per day</p>
            </div>
            <div className="flex rounded-lg border border-slate-200 p-0.5">
              {[7, 14, 30].map((p) => (
                <button
                  key={p}
                  onClick={(e) => {
                    e.preventDefault();
                    setPeriod(p);
                  }}
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
        </Link>

        <Link href="/finance/ledger" className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
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
        </Link>
      </div>

      {/* P&L */}
      <Link href="/finance/pnl" className="group mt-6 block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Profit &amp; Loss</h2>
            <p className="text-xs text-slate-400">This month · {pnl?.invoice_count ?? 0} invoices</p>
          </div>
          <span className="text-sm font-medium text-blue-600">Full report →</span>
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
      </Link>

      {/* Bottom */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Link href="/invoices" className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Recent Invoices</h2>
              <p className="text-xs text-slate-400">Latest {recent.length} by date</p>
            </div>
            <span className="text-sm font-medium text-blue-600">View all →</span>
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
        </Link>

        <div className="space-y-6">
          <Link href="/finance/ledger" className="group block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">Top Debtors</h2>
                <p className="text-xs text-slate-400">Customers who owe you most</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                <Icon path={ICONS.clock} className="h-4.5 w-4.5" />
              </div>
            </div>
            {topDebtors.length > 0 ? (
              <ul className="mt-4 space-y-2.5">
                {topDebtors.map((d) => (
                  <li key={d.name} className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm text-slate-700">{d.name}</span>
                    <span className="shrink-0 font-medium text-rose-600">{inr(Number(d.balance))}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-slate-500">No outstanding dues. Great job!</p>
            )}
          </Link>

          <Link href="/catalog/products" className="group block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
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
          </Link>

          <Link href="/catalog/products" className="group block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
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
          </Link>

          {pnl && pnl.categories.length > 0 && (
            <Link href="/finance/expenses" className="group block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-slate-900">Expenses by Category</h2>
                  <p className="text-xs text-slate-400">This month</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                  <Icon path={ICONS.minus} className="h-4.5 w-4.5" />
                </div>
              </div>
              <ul className="mt-4 space-y-2.5">
                {pnl.categories.slice(0, 5).map((c) => (
                  <li key={c.category} className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm capitalize text-slate-700">{c.category}</span>
                    <span className="font-medium text-slate-900">{inr(c.amount)}</span>
                  </li>
                ))}
              </ul>
            </Link>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Customers", value: customers, icon: ICONS.users, grad: "from-blue-500 to-cyan-500", href: "/customers" },
          { label: "Products", value: products, icon: ICONS.box, grad: "from-violet-500 to-purple-500", href: "/catalog/products" },
          { label: "Services", value: services, icon: ICONS.sparkle, grad: "from-fuchsia-500 to-pink-500", href: "/catalog/services" },
          { label: "Receivables", value: inr(receivables), icon: ICONS.clock, grad: "from-rose-500 to-pink-600", href: "/finance/ledger" },
        ].map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${s.grad} text-white`}>
              <Icon path={s.icon} className="h-4.5 w-4.5" />
            </div>
            <p className="mt-3 text-lg font-bold text-slate-900">{s.value}</p>
            <p className="text-xs text-slate-400">{s.label}</p>
          </Link>
        ))}
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
      <p className={`mt-1 truncate text-lg font-bold ${colors} ${strong ? "" : ""}`}>{inr(value)}</p>
    </div>
  );
}
