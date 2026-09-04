"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { inr } from "@/lib/format";
import { useRealtime } from "@/lib/supabase/realtime";
import SearchableSelect from "@/components/ui/searchable-select";
import StatCard from "@/components/ui/stat-card";
import CompactToggle from "@/components/ui/compact-toggle";
import { useToast } from "@/components/ui/use-toast";
import { downloadCsv } from "@/components/ui/csv";

export type CashEntry = {
  id: string;
  entry_date: string;
  method: string;
  direction: string;
  amount: number | string;
  description: string | null;
  created_at: string;
  payment_instruments: { name: string; type: string } | null;
};

const METHOD_COLOR: Record<string, string> = {
  cash: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40",
  upi: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300 border-violet-200 dark:border-violet-800/40",
  card: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800/40",
  bank: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300 border-sky-200 dark:border-sky-800/40",
  wallet: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800/40",
  dmt: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950/50 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-800/40",
  aeps: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200 dark:border-rose-800/40",
  debit_card: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/40",
  credit_card: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800/40",
};

function getOriginBadge(e: CashEntry) {
  const d = (e.description ?? "").toLowerCase();
  if (d.includes("quick sale") || d.includes("qs-")) return "Quick Sale";
  if (d.includes("sale") || d.includes("invoice")) return "POS Sale";
  if (d.includes("aeps") && (d.includes("payout") || e.direction === "out")) return "AEPS Payout";
  if (d.includes("aeps") && d.includes("fee")) return "AEPS Fee";
  if (d.includes("dmt") && (d.includes("transfer") || d.includes("debited") || e.direction === "out")) return "DMT Out";
  if (d.includes("dmt")) return "DMT In";
  if (d.includes("upi") && (d.includes("payout") || e.direction === "out")) return "UPI Cash Out";
  if (d.includes("upi") || d.includes("qr")) return "UPI QR";
  if (d.includes("recharge") || d.includes("rcg")) return "Recharge";
  if (d.includes("settlement")) return "Settlement";
  if (d.includes("expense")) return "Expense";
  if (d.includes("advance")) return "Advance";
  if (d.includes("due")) return "Due Collected";
  if (d.includes("refund") || d.includes("return")) return "Refund";
  return "General";
}

export default function CashbookClient({
  initialEntries,
  instruments,
}: {
  initialEntries: CashEntry[];
  instruments: { id: string; name: string; type: string }[];
}) {
  useRealtime(["cash_entries", "payments", "transactions", "expenses", "settlements"]);

  const [method, setMethod] = useState("all");
  const [account, setAccount] = useState("all");
  const [direction, setDirection] = useState<"all" | "in" | "out">("all");
  const [scope, setScope] = useState<"all" | "cash" | "bank" | "digital">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [preset, setPreset] = useState("all");
  const [q, setQ] = useState("");
  const [compact, setCompact] = useState(false);
  const { showToast, toastView } = useToast();

  const today = new Date().toISOString().slice(0, 10);

  function applyPreset(p: string) {
    setPreset(p);
    const now = new Date();
    if (p === "today") {
      setFrom(today); setTo(today);
    } else if (p === "7d") {
      setFrom(new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10)); setTo(today);
    } else if (p === "month") {
      setFrom(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`); setTo(today);
    } else {
      setFrom(""); setTo("");
    }
  }

  function clearFilters() {
    setMethod("all"); setAccount("all"); setDirection("all"); setScope("all");
    setFrom(""); setTo(""); setPreset("all"); setQ("");
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return initialEntries.filter((e) => {
      if (scope === "cash" && e.method !== "cash") return false;
      if (scope === "bank" && !["bank", "debit_card"].includes(e.method)) return false;
      if (scope === "digital" && ["cash", "bank", "debit_card"].includes(e.method)) return false;
      if (method !== "all" && e.method !== method) return false;
      if (account !== "all" && (e.payment_instruments?.name ?? "Unassigned") !== account) return false;
      if (direction !== "all" && e.direction !== direction) return false;
      if (from && e.entry_date < from) return false;
      if (to && e.entry_date > to) return false;
      if (needle && !(e.description ?? "").toLowerCase().includes(needle) && !e.method.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [initialEntries, scope, method, account, direction, from, to, q]);

  const totals = useMemo(() => {
    let balance = 0;
    const rows = filtered.map((e) => {
      balance += e.direction === "in" ? Number(e.amount) : -Number(e.amount);
      return { ...e, balance };
    });
    const totalIn = filtered.filter((e) => e.direction === "in").reduce((s, e) => s + Number(e.amount), 0);
    const totalOut = filtered.filter((e) => e.direction === "out").reduce((s, e) => s + Number(e.amount), 0);
    return { rows, totalIn, totalOut, net: totalIn - totalOut };
  }, [filtered]);

  const channelStats = useMemo(() => {
    const period = initialEntries.filter((e) => (!from || e.entry_date >= from) && (!to || e.entry_date <= to));
    const stats = (items: CashEntry[]) => {
      const inAmt = items.filter((e) => e.direction === "in").reduce((s, e) => s + Number(e.amount), 0);
      const outAmt = items.filter((e) => e.direction === "out").reduce((s, e) => s + Number(e.amount), 0);
      return { inAmt, outAmt, balance: inAmt - outAmt, count: items.length };
    };
    return {
      cash: stats(period.filter((e) => e.method === "cash")),
      bank: stats(period.filter((e) => ["bank", "debit_card"].includes(e.method))),
      digital: stats(period.filter((e) => !["cash", "bank", "debit_card"].includes(e.method))),
    };
  }, [initialEntries, from, to]);

  function exportCsv() {
    downloadCsv(
      `cashbook-${today}.csv`,
      ["Date", "Description", "Method", "Direction", "Amount", "Balance"],
      totals.rows.map((e) => [e.entry_date, e.description ?? "-", e.method.toUpperCase(), e.direction, Number(e.amount), e.balance])
    );
    showToast("success", `Exported ${totals.rows.length} entries to CSV`);
  }

  const inputClass = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200";

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header & Accounting Sub-navigation */}
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-black uppercase tracking-wider text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                Counter Cash Control
              </span>
              <span className="text-xs text-slate-400">· Physical Drawer Flow</span>
            </div>
            <h1 className="mt-1.5 text-2xl font-black text-slate-900 dark:text-white">
              Daily Cash Book &amp; Counter Movement
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
              Live physical money movements across drawer cash, counter collections, POS receipts, DMT payouts, AEPS disbursements, and shop expenses.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={exportCsv}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-extrabold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/5 active:scale-[0.98]"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              Export CSV
            </button>
            <Link
              href="/finance/day-close"
              className="btn-3d-tactile-primary flex items-center gap-2 px-5 py-2.5 text-xs font-black shadow-sm"
            >
              Day Close &amp; Handover →
            </Link>
          </div>
        </div>

        {/* Cross-Link Navigation Pills */}
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 dark:border-white/5">
          <span className="text-xs font-bold text-slate-400">Jump to:</span>
          <span className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-black text-white shadow-xs">
            💵 Counter Cashbook
          </span>
          <Link
            href="/finance/journal"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
          >
            📖 Double-Entry Journal →
          </Link>
          <Link
            href="/finance/general-ledger"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
          >
            🏛️ General Ledger →
          </Link>
          <Link
            href="/finance/accounts"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
          >
            💳 Treasury Accounts →
          </Link>
        </div>
      </header>

      {/* Primary KPI Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: "Total Inflow",
            value: inr(totals.totalIn),
            sub: `${filtered.filter((e) => e.direction === "in").length} receipts`,
            icon: "M12 15V3m0 12 4-4m-4 4-4-4",
            glow: "card-glow-emerald",
            grad: "from-emerald-500 to-teal-600",
            valColor: "text-emerald-700 dark:text-emerald-300",
            active: direction === "in",
            onClick: () => setDirection(direction === "in" ? "all" : "in"),
          },
          {
            label: "Total Outflow",
            value: inr(totals.totalOut),
            sub: `${filtered.filter((e) => e.direction === "out").length} payouts`,
            icon: "M12 3v12m0 0 4-4m-4 4-4-4",
            glow: "card-glow-rose",
            grad: "from-rose-500 to-pink-600",
            valColor: "text-rose-700 dark:text-rose-300",
            active: direction === "out",
            onClick: () => setDirection(direction === "out" ? "all" : "out"),
          },
          {
            label: "Net Flow Position",
            value: inr(totals.net),
            sub: totals.net < 0 ? "Net drawer outflow" : "Net drawer surplus",
            icon: "M12 3v18M8 7h7a2 2 0 0 1 0 4H9a2 2 0 0 0 0 4h7",
            glow: totals.net < 0 ? "card-glow-amber" : "card-glow-cyan",
            grad: totals.net < 0 ? "from-amber-500 to-orange-600" : "from-cyan-500 to-blue-600",
            valColor: totals.net < 0 ? "text-amber-700 dark:text-amber-300" : "text-cyan-700 dark:text-cyan-300",
            active: false,
            onClick: () => setDirection("all"),
          },
          {
            label: "Active Filter Scope",
            value: `${filtered.length} Entries`,
            sub: `${inr(totals.totalIn)} in · ${inr(totals.totalOut)} out`,
            icon: "M8 2v4M16 2v4M3 10h18",
            glow: "card-glow-indigo",
            grad: "from-indigo-500 to-purple-600",
            valColor: "text-indigo-700 dark:text-indigo-300",
            active: false,
            onClick: clearFilters,
          },
        ].map((card) => (
          <div
            key={card.label}
            onClick={card.onClick}
            className={`bento-surface relative cursor-pointer overflow-hidden rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5 ${card.glow} ${
              card.active ? "ring-2 ring-blue-500" : ""
            }`}
          >
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.grad}`} />
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{card.label}</span>
              <div className={`icon-box-3d flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br ${card.grad} text-white shadow-sm`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d={card.icon} />
                </svg>
              </div>
            </div>
            <div className={`mt-2 font-mono text-2xl font-black ${card.valColor}`}>{card.value}</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Scope Channel Breakdown */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {([
          ["cash", "💵", "Physical Cash Drawer", channelStats.cash, "Physical Till & Drawer Cash", "card-glow-emerald"],
          ["bank", "🏦", "Bank Channels", channelStats.bank, "Net Banking, IMPS & Debit", "card-glow-cyan"],
          ["digital", "📱", "Digital & UPI Channels", channelStats.digital, "UPI QR, AEPS & Portals", "card-glow-indigo"],
        ] as const).map(([key, icon, label, stat, subtitle, glow]) => (
          <button
            key={key}
            type="button"
            onClick={() => setScope(key)}
            className={`bento-surface relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
              scope === key
                ? `${glow} border-blue-500 ring-2 ring-blue-500/40 bg-blue-50/50 dark:bg-blue-950/20`
                : "border-slate-200/80 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-slate-900"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-900 dark:text-white">{icon} {label}</span>
              <span className="font-mono text-xs font-black text-slate-900 dark:text-white">{inr(stat.balance)}</span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400">{subtitle}</p>
            <div className="mt-3 flex justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500 dark:border-white/5">
              <span>In: <strong className="font-mono text-emerald-600 dark:text-emerald-400">+{inr(stat.inAmt)}</strong></span>
              <span>Out: <strong className="font-mono text-rose-600 dark:text-rose-400">-{inr(stat.outAmt)}</strong></span>
              <span className="font-bold">{stat.count} txns</span>
            </div>
          </button>
        ))}
      </div>

      {/* Filter and Query Tooling */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search description, DMT, AEPS, Settlement, Invoice, or method…"
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:text-white"
          />
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl bg-slate-100 p-1 text-xs dark:bg-white/5">
              {(["all", "in", "out"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDirection(d)}
                  className={`rounded-lg px-3 py-1.5 font-bold capitalize transition ${
                    direction === d
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                      : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
                  }`}
                >
                  {d === "all" ? "All Flows" : d === "in" ? "↑ Inflow" : "↓ Outflow"}
                </button>
              ))}
            </div>
            <SearchableSelect
              value={method}
              onChange={setMethod}
              options={[
                { value: "all", label: "All methods" },
                { value: "cash", label: "Cash" },
                { value: "upi", label: "UPI" },
                { value: "card", label: "Card" },
                { value: "bank", label: "Bank" },
                { value: "wallet", label: "Wallet" },
                { value: "dmt", label: "DMT" },
                { value: "aeps", label: "AEPS" },
                { value: "debit_card", label: "Debit Card" },
                { value: "credit_card", label: "Credit Card" },
              ]}
              searchPlaceholder="Search method…"
              className="w-40"
            />
            <SearchableSelect
              value={account}
              onChange={setAccount}
              options={[
                { value: "all", label: "All accounts" },
                ...instruments.map((i) => ({ value: i.name, label: i.name })),
              ]}
              searchPlaceholder="Search account…"
              className="w-44"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-white/5">
          <div className="flex rounded-xl bg-slate-100 p-0.5 text-xs dark:bg-white/5">
            {(["today", "7d", "month", "all"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => applyPreset(p)}
                className={`rounded-lg px-3 py-1.5 font-bold transition ${
                  preset === p
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
                }`}
              >
                {p === "today" ? "Today" : p === "7d" ? "Last 7 days" : p === "month" ? "This month" : "All time"}
              </button>
            ))}
          </div>
          <input type="date" value={from} onChange={(e) => { setPreset("all"); setFrom(e.target.value); }} className={inputClass} />
          <span className="text-xs font-bold text-slate-400">to</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => { setPreset("all"); setTo(e.target.value); }} className={inputClass} />
          <CompactToggle value={compact} onChange={setCompact} storageKey="sccomm-cashbook-compact" />
          <button
            type="button"
            onClick={clearFilters}
            className="ml-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
          >
            Clear filters
          </button>
        </div>
      </div>

      {/* Cash Flow Table */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-6 py-4 dark:border-white/10">
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Counter Cash Log</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Chronological cash desk receipts and disbursements with running balance tracking.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className={`w-full text-left text-sm ${compact ? "rows-compact" : ""}`}>
            <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:bg-white/[0.03]">
              <tr>
                <th className="px-5 py-3.5">Date</th>
                <th className="px-5 py-3.5">Origin &amp; Description</th>
                <th className="px-5 py-3.5">Channel / Account</th>
                <th className="px-5 py-3.5 text-right">Inflow (+)</th>
                <th className="px-5 py-3.5 text-right">Outflow (−)</th>
                <th className="px-5 py-3.5 text-right">Running Position</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {[...totals.rows].reverse().map((e) => (
                <tr key={e.id} className="transition hover:bg-slate-50/60 dark:hover:bg-white/[0.02]">
                  <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                    {e.entry_date}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="mr-2 inline-flex rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase text-slate-700 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300">
                      {getOriginBadge(e)}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {e.description || "—"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold ${METHOD_COLOR[e.method] || "bg-slate-100 text-slate-600"}`}>
                      {e.method.toUpperCase()}
                    </span>
                    {e.payment_instruments?.name && (
                      <span className="ml-2 font-medium text-xs text-slate-500 dark:text-slate-400">
                        🏦 {e.payment_instruments.name}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {e.direction === "in" ? `+${inr(e.amount)}` : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                    {e.direction === "out" ? `-${inr(e.amount)}` : "—"}
                  </td>
                  <td className={`px-5 py-3.5 text-right font-mono font-black ${e.balance < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-white"}`}>
                    {inr(e.balance)}
                  </td>
                </tr>
              ))}
              {totals.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center text-sm text-slate-400">
                    No cash entries match your filters.
                  </td>
                </tr>
              )}
            </tbody>
            {totals.rows.length > 0 && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]">
                <tr>
                  <td colSpan={3} className="px-5 py-3.5 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Totals for {totals.rows.length} Entries
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-sm font-black text-emerald-600 dark:text-emerald-400">
                    +{inr(totals.totalIn)}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-sm font-black text-rose-600 dark:text-rose-400">
                    -{inr(totals.totalOut)}
                  </td>
                  <td className={`px-5 py-3.5 text-right font-mono text-sm font-black ${totals.net < 0 ? "text-rose-600" : "text-slate-900 dark:text-white"}`}>
                    {inr(totals.net)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      {toastView}
    </div>
  );
}

