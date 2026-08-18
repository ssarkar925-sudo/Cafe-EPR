"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/lib/supabase/realtime";
import { inr } from "@/lib/format";
import StatCard from "@/components/ui/stat-card";
import { useToast } from "@/components/ui/use-toast";
import { downloadCsv } from "@/components/ui/csv";

export type Pnl = {
  revenue: number;
  returns: number;
  cogs: number;
  commission_income: number;
  expenses: number;
  net_revenue: number;
  gross_profit: number;
  net_profit: number;
  invoice_count: number;
  monthly: { month: string; revenue: number; cogs: number; expenses: number; commission: number; net: number }[];
  categories: { category: string; amount: number; count: number }[];
  top_products: { name: string; revenue: number; cogs: number; profit: number; invoices: number }[];
};

const PERIODS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 Days" },
  { key: "30d", label: "30 Days" },
  { key: "month", label: "This Month" },
  { key: "year", label: "This Year" },
  { key: "all", label: "All" },
] as const;

type PeriodKey = (typeof PERIODS)[number]["key"];

function periodRange(key: PeriodKey): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const start = (d: Date) => d.toISOString().slice(0, 10);
  switch (key) {
    case "today":
      return { from: to, to };
    case "7d":
      return { from: start(new Date(now.getTime() - 6 * 86400000)), to };
    case "30d":
      return { from: start(new Date(now.getTime() - 29 * 86400000)), to };
    case "month":
      return { from: start(new Date(now.getFullYear(), now.getMonth(), 1)), to };
    case "year":
      return { from: `${now.getFullYear()}-01-01`, to };
    case "all":
      return { from: "2000-01-01", to };
  }
}

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function PnlClient({
  initialPnl,
  defaultFrom,
  defaultTo,
}: {
  initialPnl: Pnl | null;
  defaultFrom: string;
  defaultTo: string;
}) {
  const supabase = useMemoCreateClient();
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [pnl, setPnl] = useState<Pnl | null>(initialPnl);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [custom, setCustom] = useState(false);
  const { showToast, toastView } = useToast();

  useRealtime([
    "invoices",
    "invoice_items",
    "returns",
    "return_items",
    "expenses",
    "transactions",
    "products",
    "services",
  ]);

  const load = useCallback(
    async (f: string, t: string) => {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_pnl", {
        p_from: f,
        p_to: t,
      });
      if (!error) setPnl(data as Pnl);
      setLoading(false);
    },
    [supabase]
  );

  useEffect(() => {
    if (custom) return;
    const { from: f, to: t } = periodRange(period);
    setFrom(f);
    setTo(t);
    load(f, t);
  }, [period, custom, load]);

  const applyCustom = () => {
    if (from && to && from <= to) {
      setCustom(true);
      load(from, to);
    }
  };

  const maxMonthlyNet = Math.max(
    1,
    ...(pnl?.monthly ?? []).map((m) => Math.abs(m.net))
  );

  function exportStatement() {
    downloadCsv(
      `pnl-${from}-to-${to}.csv`,
      ["Line", "Amount"],
      [
        ["Revenue", Number(pnl?.revenue ?? 0)],
        ["Returns", -Number(pnl?.returns ?? 0)],
        ["Net Revenue", Number(pnl?.net_revenue ?? 0)],
        ["COGS", -Number(pnl?.cogs ?? 0)],
        ["Gross Profit", Number(pnl?.gross_profit ?? 0)],
        ["Commission Income", Number(pnl?.commission_income ?? 0)],
        ["Expenses", -Number(pnl?.expenses ?? 0)],
        ["Net Profit", Number(pnl?.net_profit ?? 0)],
      ]
    );
    showToast("success", `P&L statement ${from} → ${to} exported`);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Profit &amp; Loss
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {from} to {to} · {pnl?.invoice_count ?? 0} invoices
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportStatement}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/5"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            Export
          </button>
          <div className="flex rounded-xl bg-slate-100 p-1 text-xs dark:bg-white/5">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => {
                  setCustom(false);
                  setPeriod(p.key);
                }}
                className={`rounded-lg px-3 py-1.5 font-medium transition ${
                  period === p.key && !custom
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                    : "text-slate-500"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
        />
        <span className="text-sm text-slate-400">to</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
        />
        <button
          onClick={applyCustom}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          Apply
        </button>
        {loading && <span className="text-sm text-slate-400">Loading…</span>}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Net Revenue"
          value={inr(pnl?.net_revenue ?? 0)}
          sub={pnl ? `${inr(pnl.revenue)} gross − ${inr(pnl.returns)} returns` : ""}
          icon="M6 3h12M6 8h12M6 13h8a4 4 0 0 0 0-8H6v17"
          grad="from-blue-500 to-indigo-600"
        />
        <StatCard
          label="COGS"
          value={inr(pnl?.cogs ?? 0)}
          sub="Cost of goods & services sold"
          icon="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z M3.3 7 12 12l8.7-5M12 22V12"
          grad="from-amber-500 to-orange-600"
        />
        <StatCard
          label="Gross Profit"
          value={inr(pnl?.gross_profit ?? 0)}
          sub={pnl ? margin(pnl.net_revenue, pnl.cogs) : ""}
          icon="M23 6l-9.5 9.5-5-5L1 18M17 6h6v6"
          grad={pnl && pnl.gross_profit >= 0 ? "from-emerald-500 to-teal-600" : "from-rose-500 to-pink-600"}
          valueClass={pnl && pnl.gross_profit >= 0 ? "text-emerald-600" : "text-rose-600"}
        />
        <StatCard
          label="Net Profit"
          value={inr(pnl?.net_profit ?? 0)}
          sub={pnl ? `After ${inr(pnl.expenses)} expenses + ${inr(pnl.commission_income)} commission` : ""}
          icon="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2M3 10h18M16 15h2"
          grad={pnl && pnl.net_profit >= 0 ? "from-violet-500 to-purple-600" : "from-rose-500 to-pink-600"}
          valueClass={pnl && pnl.net_profit >= 0 ? "text-violet-600" : "text-rose-600"}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Monthly Performance
            </h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              {period.toUpperCase()}
            </span>
          </div>
          {pnl?.monthly && pnl.monthly.length > 0 ? (
            <div className="mt-5 flex h-48 items-end gap-2">
              {pnl.monthly.map((m) => (
                <div
                  key={m.month}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <span
                    className={`text-[10px] font-medium ${
                      m.net >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {compact(m.net)}
                  </span>
                  <div
                    className={`w-full rounded-t-md ${
                      m.net >= 0
                        ? "bg-gradient-to-t from-emerald-500 to-teal-400"
                        : "bg-gradient-to-t from-rose-500 to-pink-400"
                    }`}
                    style={{
                      height: `${Math.max(
                        4,
                        (Math.abs(m.net) / maxMonthlyNet) * 100
                      )}%`,
                    }}
                  />
                  <span className="text-[10px] text-slate-500">
                    {monthNames[Number(m.month.slice(5)) - 1]}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-8 text-center text-sm text-slate-500">
              No data for this period.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Statement
          </h2>
          <div className="mt-4 space-y-2.5 text-sm">
            <StatementRow label="Revenue" value={pnl?.revenue ?? 0} tone="emerald" />
            <StatementRow label="Less: Returns / Refunds" value={-(pnl?.returns ?? 0)} tone="rose" />
            <StatementRow label="Net Revenue" value={pnl?.net_revenue ?? 0} tone="slate" strong />
            <StatementRow label="Less: COGS" value={-(pnl?.cogs ?? 0)} tone="amber" />
            <StatementRow label="Gross Profit" value={pnl?.gross_profit ?? 0} tone="slate" strong />
            <StatementRow label="Commission Income" value={pnl?.commission_income ?? 0} tone="emerald" />
            <StatementRow label="Less: Expenses" value={-(pnl?.expenses ?? 0)} tone="rose" />
            <div className="border-t border-slate-200 pt-2.5">
              <StatementRow
                label="Net Profit"
                value={pnl?.net_profit ?? 0}
                tone={pnl && pnl.net_profit >= 0 ? "blue" : "rose"}
                strong
                large
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Top Products by Profit
          </h2>
          <div className="mt-4 space-y-3">
            {pnl?.top_products && pnl.top_products.length > 0 ? (
              pnl.top_products.map((p) => (
                <div
                  key={p.name}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {p.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {inr(p.revenue)} rev · {inr(p.cogs)} cost · {p.invoices}{" "}
                      invoice{p.invoices === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      p.profit >= 0
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {p.profit >= 0 ? "+" : ""}
                    {inr(p.profit)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No sales in this period.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Expenses by Category
          </h2>
          {pnl?.categories && pnl.categories.length > 0 ? (
            <div className="mt-4 space-y-3">
              {pnl.categories.map((c) => {
                const pct = (c.amount / (pnl?.expenses || 1)) * 100;
                return (
                  <div key={c.category}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-900 capitalize">
                        {c.category}
                      </span>
                      <span className="text-slate-600">
                        {inr(c.amount)}{" "}
                        <span className="text-xs text-slate-400">
                          · {c.count}
                        </span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-gradient-to-r from-rose-400 to-orange-400"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              No expenses in this period.
            </p>
          )}
        </div>
      </div>
      {toastView}
    </div>
  );
}

function useMemoCreateClient() {
  const [supabase] = useState(() => createClient());
  return supabase;
}

function StatementRow({
  label,
  value,
  tone,
  strong,
  large,
}: {
  label: string;
  value: number;
  tone: "slate" | "emerald" | "rose" | "amber" | "blue";
  strong?: boolean;
  large?: boolean;
}) {
  const color = {
    slate: "text-slate-900",
    emerald: "text-emerald-600",
    rose: "text-rose-600",
    amber: "text-amber-600",
    blue: "text-blue-600",
  }[tone];
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={strong ? "font-semibold text-slate-900" : "text-slate-500"}>
        {label}
      </span>
      <span
        className={`${color} ${
          strong ? "font-semibold" : "font-medium"
        } ${large ? "text-lg" : ""}`}
      >
        {inr(value)}
      </span>
    </div>
  );
}

function margin(rev: number, cogs: number) {
  if (!rev) return "No revenue";
  const m = ((rev - cogs) / rev) * 100;
  return `Margin ${m.toFixed(1)}%`;
}

function compact(n: number) {
  const abs = Math.abs(n);
  if (abs >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}
