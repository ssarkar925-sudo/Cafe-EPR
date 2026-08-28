"use client";

import { useMemo, useState } from "react";
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
  cash: "bg-emerald-100 text-emerald-700",
  upi: "bg-violet-100 text-violet-700",
  card: "bg-blue-100 text-blue-700",
  bank: "bg-sky-100 text-sky-700",
  wallet: "bg-amber-100 text-amber-700",
  dmt: "bg-fuchsia-100 text-fuchsia-700",
  aeps: "bg-rose-100 text-rose-700",
  debit_card: "bg-indigo-100 text-indigo-700",
  credit_card: "bg-cyan-100 text-cyan-700",
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
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Cash Book &amp; Financial Ledger</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Unified money trail across Cash Drawer, Bank Accounts, UPI/Digital, POS, DMT, AEPS, Recharge &amp; Expenses.</p>
        </div>
        <button onClick={exportCsv} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-700 dark:bg-white dark:text-slate-900">Export CSV</button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Inflow" value={inr(totals.totalIn)} sub={`${filtered.filter((e) => e.direction === "in").length} receipts`} icon="M12 15V3m0 12 4-4m-4 4-4-4" grad="from-emerald-500 to-teal-600" onClick={() => setDirection(direction === "in" ? "all" : "in")} />
        <StatCard label="Total Outflow" value={inr(totals.totalOut)} sub={`${filtered.filter((e) => e.direction === "out").length} payouts`} icon="M12 3v12m0 0 4-4m-4 4-4-4" grad="from-rose-500 to-pink-600" onClick={() => setDirection(direction === "out" ? "all" : "out")} />
        <StatCard label="Closing Net Position" value={inr(totals.net)} sub={totals.net < 0 ? "Net outflow position" : "Net inflow / surplus"} icon="M12 3v18M8 7h7a2 2 0 0 1 0 4H9a2 2 0 0 0 0 4h7" grad={totals.net < 0 ? "from-rose-500 to-orange-600" : "from-blue-500 to-indigo-600"} onClick={() => setDirection("all")} />
        <StatCard label="All Channels" value={`${filtered.length} Entries`} sub={`${inr(totals.totalIn)} in · ${inr(totals.totalOut)} out`} icon="M8 2v4M16 2v4M3 10h18" grad="from-violet-500 to-purple-600" onClick={clearFilters} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {([
          ["cash", "💵", "Physical Cash Drawer", channelStats.cash],
          ["bank", "🏦", "Bank Channels", channelStats.bank],
          ["digital", "📱", "Digital & UPI Channels", channelStats.digital],
        ] as const).map(([key, icon, label, stat]) => (
          <button key={key} type="button" onClick={() => setScope(key)} className={`rounded-2xl border p-3.5 text-left transition ${scope === key ? "border-blue-500 bg-blue-50/50 dark:border-blue-500/50 dark:bg-blue-950/20" : "border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-slate-900"}`}>
            <div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-900 dark:text-white">{icon} {label}</span><span className="text-xs font-bold text-slate-700 dark:text-slate-200">{inr(stat.balance)}</span></div>
            <div className="mt-2 flex justify-between text-[11px] text-slate-500"><span>In: <strong className="text-emerald-600">+{inr(stat.inAmt)}</strong></span><span>Out: <strong className="text-rose-600">-{inr(stat.outAmt)}</strong></span><span>{stat.count} txns</span></div>
          </button>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search description, DMT, AEPS, Settlement, Invoice, or method…" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900" />
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl bg-slate-100 p-1 text-xs dark:bg-white/5">
              {(["all", "in", "out"] as const).map((d) => <button key={d} type="button" onClick={() => setDirection(d)} className={`rounded-lg px-3 py-1.5 font-medium capitalize ${direction === d ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white" : "text-slate-500"}`}>{d}</button>)}
            </div>
            <SearchableSelect value={method} onChange={setMethod} options={[{ value: "all", label: "All methods" }, { value: "cash", label: "Cash" }, { value: "upi", label: "UPI" }, { value: "card", label: "Card" }, { value: "bank", label: "Bank" }, { value: "wallet", label: "Wallet" }, { value: "dmt", label: "DMT" }, { value: "aeps", label: "AEPS" }, { value: "debit_card", label: "Debit Card" }, { value: "credit_card", label: "Credit Card" }]} searchPlaceholder="Search method…" className="w-40" />
            <SearchableSelect value={account} onChange={setAccount} options={[{ value: "all", label: "All accounts" }, ...instruments.map((i) => ({ value: i.name, label: i.name }))]} searchPlaceholder="Search account…" className="w-44" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-0.5 text-xs dark:bg-white/5">
            {(["today", "7d", "month", "all"] as const).map((p) => <button key={p} type="button" onClick={() => applyPreset(p)} className={`rounded-lg px-3 py-1.5 font-medium ${preset === p ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white" : "text-slate-500"}`}>{p === "today" ? "Today" : p === "7d" ? "Last 7 days" : p === "month" ? "This month" : "All time"}</button>)}
          </div>
          <input type="date" value={from} onChange={(e) => { setPreset("all"); setFrom(e.target.value); }} className={inputClass} />
          <span className="text-xs text-slate-400">to</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => { setPreset("all"); setTo(e.target.value); }} className={inputClass} />
          <CompactToggle value={compact} onChange={setCompact} storageKey="sccomm-cashbook-compact" />
          <button type="button" onClick={clearFilters} className="ml-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">Clear filters</button>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-white/10">
        <table className={`w-full text-left text-sm ${compact ? "rows-compact" : ""}`}>
          <thead><tr className="border-b border-slate-200 text-slate-500 dark:border-white/10"><th className="px-5 py-3 font-medium">Date</th><th className="px-5 py-3 font-medium">Origin &amp; Description</th><th className="px-5 py-3 font-medium">Channel / Method</th><th className="px-5 py-3 text-right font-medium">In</th><th className="px-5 py-3 text-right font-medium">Out</th><th className="px-5 py-3 text-right font-medium">Balance</th></tr></thead>
          <tbody>
            {[...totals.rows].reverse().map((e) => (
              <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5">
                <td className="px-5 py-3 text-slate-500">{e.entry_date}</td>
                <td className="px-5 py-3"><span className="mr-2 inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{getOriginBadge(e)}</span><span className="text-slate-900 dark:text-white">{e.description || "-"}</span></td>
                <td className="px-5 py-3"><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${METHOD_COLOR[e.method] || "bg-slate-100 text-slate-600"}`}>{e.method.toUpperCase()}</span>{e.payment_instruments?.name && <span className="ml-1.5 text-[11px] text-slate-400">🏦 {e.payment_instruments.name}</span>}</td>
                <td className="px-5 py-3 text-right font-medium text-emerald-600">{e.direction === "in" ? `+${inr(e.amount)}` : ""}</td>
                <td className="px-5 py-3 text-right font-medium text-rose-600">{e.direction === "out" ? `-${inr(e.amount)}` : ""}</td>
                <td className={`px-5 py-3 text-right font-semibold ${e.balance < 0 ? "text-rose-600" : "text-slate-900 dark:text-white"}`}>{inr(e.balance)}</td>
              </tr>
            ))}
            {totals.rows.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">No cash entries match your filters.</td></tr>}
          </tbody>
        </table>
      </div>
      {toastView}
    </div>
  );
}
