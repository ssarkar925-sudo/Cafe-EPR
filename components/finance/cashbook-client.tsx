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
  if (d.includes("quick sale") || d.includes("qs-")) return { label: "Quick Sale", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" };
  if (d.includes("sale inv-") || d.includes("sale") || d.includes("invoice")) return { label: "POS Sale", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" };
  if (d.includes("aeps") && (d.includes("payout") || e.direction === "out")) return { label: "AEPS Payout", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" };
  if (d.includes("aeps") && d.includes("fee")) return { label: "AEPS Fee", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" };
  if (d.includes("dmt") && (d.includes("transfer") || d.includes("debited") || e.direction === "out")) return { label: "DMT Out (Bank)", color: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400" };
  if (d.includes("dmt") && (d.includes("collected") || e.direction === "in")) return { label: "DMT In (Customer)", color: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400" };
  if (d.includes("upi") && (d.includes("payout") || e.direction === "out")) return { label: "UPI Cash Out", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" };
  if (d.includes("upi") && (d.includes("received") || d.includes("qr") || e.direction === "in")) return { label: "UPI QR In", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" };
  if (d.includes("recharge") || d.includes("rcg")) return { label: "Recharge", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" };
  if (d.includes("settlement")) return { label: "Settlement", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" };
  if (d.includes("expense")) return { label: "Expense", color: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" };
  if (d.includes("advance")) return { label: "Advance", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" };
  if (d.includes("previous due") || d.includes("due")) return { label: "Due Collected", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" };
  if (d.includes("refund") || d.includes("return")) return { label: "Refund", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" };
  return { label: "General", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" };
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
      setFrom(today);
      setTo(today);
    } else if (p === "7d") {
      setFrom(new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10));
      setTo(today);
    } else if (p === "month") {
      setFrom(now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-01");
      setTo(today);
    } else {
      setFrom("");
      setTo("");
    }
  }

  function clearFilters() {
    setMethod("all");
    setAccount("all");
    setDirection("all");
    setScope("all");
    setFrom("");
    setTo("");
    setPreset("all");
    setQ("");
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
      if (needle && !(e.description ?? "").toLowerCase().includes(needle) && !e.method.includes(needle)) return false;
      return true;
    });
  }, [initialEntries, scope, method, account, direction, from, to, q]);

  const channelStats = useMemo(() => {
    const inDate = (e: CashEntry) => {
      if (from && e.entry_date < from) return false;
      if (to && e.entry_date > to) return false;
      return true;
    };
    const periodEntries = initialEntries.filter(inDate);

    const cashEntries = periodEntries.filter((e) => e.method === "cash");
    const cashIn = cashEntries.filter((e) => e.direction === "in").reduce((s, e) => s + Number(e.amount), 0);
    const cashOut = cashEntries.filter((e) => e.direction === "out").reduce((s, e) => s + Number(e.amount), 0);

    const bankEntries = periodEntries.filter((e) => ["bank", "debit_card"].includes(e.method));
    const bankIn = bankEntries.filter((e) => e.direction === "in").reduce((s, e) => s + Number(e.amount), 0);
    const bankOut = bankEntries.filter((e) => e.direction === "out").reduce((s, e) => s + Number(e.amount), 0);

    const digiEntries = periodEntries.filter((e) => !["cash", "bank", "debit_card"].includes(e.method));
    const digiIn = digiEntries.filter((e) => e.direction === "in").reduce((s, e) => s + Number(e.amount), 0);
    const digiOut = digiEntries.filter((e) => e.direction === "out").reduce((s, e) => s + Number(e.amount), 0);

    return {
      cash: { inAmt: cashIn, outAmt: cashOut, balance: cashIn - cashOut, count: cashEntries.length },
      bank: { inAmt: bankIn, outAmt: bankOut, balance: bankIn - bankOut, count: bankEntries.length },
      digital: { inAmt: digiIn, outAmt: digiOut, balance: digiIn - digiOut, count: digiEntries.length },
    };
  }, [initialEntries, from, to]);

  const totals = useMemo(() => {
    let balance = 0;
    const rows = filtered.map((e) => {
      const delta = e.direction === "in" ? Number(e.amount) : -Number(e.amount);
      balance += delta;
      return { ...e, balance };
    });
    const totalIn = filtered.filter((e) => e.direction === "in").reduce((s, e) => s + Number(e.amount), 0);
    const totalOut = filtered.filter((e) => e.direction === "out").reduce((s, e) => s + Number(e.amount), 0);
    return { rows, totalIn, totalOut };
  }, [filtered]);

  const net = totals.totalIn - totals.totalOut;

  function exportCsv() {
    downloadCsv(
      `cashbook-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Date", "Description", "Method", "Direction", "Amount", "Balance"],
      totals.rows.map((e) => [e.entry_date, e.description ?? "-", e.method.toUpperCase(), e.direction, Number(e.amount), e.balance])
    );
    showToast("success", `Exported ${totals.rows.length} entries to CSV`);
  }

  const inputClass =
    "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Cash Book &amp; Financial Ledger</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Unified money trail across Cash Drawer, Bank Accounts, UPI/Digital, POS, DMT, AEPS, Recharge &amp; Expenses.
          </p>
        </div>
        <button
          onClick={exportCsv}
          className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
          Export CSV
        </button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total Inflow (Cashbook In)"
          value={inr(totals.totalIn)}
          sub={`${filtered.filter((e) => e.direction === "in").length} receipts / collections`}
          icon="M12 15V3m0 12 4-4m-4 4-4-4M3 17v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2"
          grad="from-emerald-500 to-teal-600"
          onClick={() => setDirection(direction === "in" ? "all" : "in")}
        />
        <StatCard
          label="Total Outflow (Cashbook Out)"
          value={inr(totals.totalOut)}
          sub={`${filtered.filter((e) => e.direction === "out").length} payouts / transfers`}
          icon="M12 3v12m0 0 4-4m-4 4-4-4M3 17v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2"
          grad="from-rose-500 to-pink-600"
          onClick={() => setDirection(direction === "out" ? "all" : "out")}
        />
        <StatCard
          label="Closing Net Position"
          value={inr(net)}
          sub={net < 0 ? "Net outflow position" : "Net inflow / surplus"}
          icon="M12 3v18M8 7h7a2 2 0 0 1 0 4H9a2 2 0 0 0 0 4h7"
          grad={net < 0 ? "from-rose-500 to-orange-600" : "from-blue-500 to-indigo-600"}
          onClick={() => setDirection("all")}
        />
        <StatCard
          label={scope === "all" ? "All Channels" : scope === "cash" ? "💵 Cash Drawer" : scope === "bank" ? "🏦 Bank Channels" : "📱 Digital & UPI"}
          value={String(filtered.length) + " Entries"}
          sub={`${totals.totalIn > 0 ? inr(totals.totalIn) : "₹0"} in · ${totals.totalOut > 0 ? inr(totals.totalOut) : "₹0"} out`}
          icon="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
          grad="from-violet-500 to-purple-600"
          onClick={clearFilters}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div
          onClick={() => setScope("cash")}
          className={`cursor-pointer rounded-2xl border p-3.5 transition ${scope === "cash" ? "border-emerald-500 bg-emerald-50/50 dark:border-emerald-500/50 dark:bg-emerald-950/20 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-slate-900"}`}
        >
          <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white"><span>💵</span> Physical Cash Drawer</span><span className={`text-xs font-bold ${channelStats.cash.balance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{inr(channelStats.cash.balance)}</span></div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500"><span>In: <strong className="text-emerald-600">+{inr(channelStats.cash.inAmt)}</strong></span><span>Out: <strong className="text-rose-600">-{inr(channelStats.cash.outAmt)}</strong></span><span>{channelStats.cash.count} txns</span></div>
        </div>
        <div
          onClick={() => setScope("bank")}
          className={`cursor-pointer rounded-2xl border p-3.5 transition ${scope === "bank" ? "border-sky-500 bg-sky-50/50 dark:border-sky-500/50 dark:bg-sky-950/20 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-slate-900"}`}
        >
          <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white"><span>🏦</span> Bank Channels</span><span className={`text-xs font-bold ${channelStats.bank.balance >= 0 ? "text-sky-600" : "text-rose-600"}`}>{inr(channelStats.bank.balance)}</span></div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500"><span>In: <strong className="text-emerald-600">+{inr(channelStats.bank.inAmt)}</strong></span><span>Out: <strong className="text-rose-600">-{inr(channelStats.bank.outAmt)}</strong></span><span>{channelStats.bank.count} txns</span></div>
        </div>
        <div
          onClick={() => setScope("digital")}
          className={`cursor-pointer rounded-2xl border p-3.5 transition ${scope === "digital" ? "border-violet-500 bg-violet-50/50 dark:border-violet-500/50 dark:bg-violet-950/20 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-slate-900"}`}
        >
          <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white"><span>📱</span> Digital &amp; UPI Channels</span><span className={`text-xs font-bold ${channelStats.digital.balance >= 0 ? "text-violet-600" : "text-rose-600"}`}>{inr(channelStats.digital.balance)}</span></div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500"><span>In: <strong className="text-emerald-600">+{inr(channelStats.digital.inAmt)}</strong></span><span>Out: <strong className="text-rose-600">-{inr(channelStats.digital.outAmt)}</strong></span><span>{channelStats.digital.count} txns</span></div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative min-w-[220px] flex-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search description, DMT, AEPS, Settlement, Invoice, or method…" className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl bg-slate-100 p-1 text-xs dark:bg-white/5">{(["all", "in", "out"] as const).map((d) => <button key={d} onClick={() => setDirection(d)} className={`rounded-lg px-3 py-1.5 font-medium capitalize transition ${direction === d ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white" : "text-slate-500"}`}>{d}</button>)}</div>
            <SearchableSelect value={method} onChange={setMethod} options={[{ value: "all", label: "All methods" }, { value: "cash", label: "Cash" }, { value: "upi", label: "UPI" }, { value: "card", label: "Card" }, { value: "bank", label: "Bank" }, { value: "wallet", label: "Wallet" }, { value: "dmt", label: "DMT" }, { value: "aeps", label: "AEPS" }, { value: "debit_card", label: "Debit Card" }, { value: "credit_card", label: "Credit Card" }]} searchPlaceholder="Search method…" className="w-40" />
            <SearchableSelect value={account} onChange={setAccount} options={[{ value: "all", label: "All accounts" }, ...instruments.map((i) => ({ value: i.name, label: i.name }))]} searchPlaceholder="Search account…" className="w-44" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-0.5 text-xs dark:bg-white/5">{(["today", "7d", "month", "all"] as const).map((p) => <button key={p} onClick={() => applyPreset(p)} className={`rounded-lg px-3 py-1.5 font-medium transition ${preset === p ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white" : "text-slate-500"}`}>{p === "today" ? "Today" : p === "7d" ? "Last 7 days" : p === "month" ? "This month" : "All time"}</button>)}</div>
          <input type="date" value={from} onChange={(e) => { setPreset("all"); setFrom(e.target.value); }} className={inputClass} />
          <span className="text-xs text-slate-400">to</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => { setPreset("all"); setTo(e.target.value); }} className={inputClass} />
          <CompactToggle value={compact} onChange={setCompact} storageKey="sccomm-cashbook-compact" />
          <button type="button" onClick={clearFilters} className="ml-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5">Clear filters</button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-white/10">
        <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-semibold dark:bg-white/5">
          <button type="button" onClick={() => setScope("all")} className={`rounded-lg px-3.5 py-1.5 transition ${scope === "all" ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white" : "text-slate-500 hover:text-slate-700"}`}>All Channels ({initialEntries.length})</button>
          <button type="button" onClick={() => setScope("cash")} className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 transition ${scope === "cash" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}><span>💵</span> Physical Cash Drawer <span className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] ${scope === "cash" ? "bg-emerald-700 text-white" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"}`}>{inr(channelStats.cash.balance)}</span></button>
          <button type="button" onClick={() => setScope("bank")} className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 transition ${scope === "bank" ? "bg-sky-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}><span>🏦</span> Bank Accounts <span className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] ${scope === "bank" ? "bg-sky-700 text-white" : "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"}`}>{inr(channelStats.bank.balance)}</span></button>
          <button type="button" onClick={() => setScope("digital")} className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 transition ${scope === "digital" ? "bg-violet-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}><span>📱</span> Digital &amp; UPI <span className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] ${scope === "digital" ? "bg-violet-700 text-white" : "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300`}>{inr(channelStats.digital.balance)}</span></button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-white/10">
        <table className={`w-full text-left text-sm ${compact ? "rows-compact" : ""}`}>
          <thead><tr className="border-b border-slate-200 text-slate-500 dark:border-white/10"><th className="px-5 py-3 font-medium">Date</th><th className="px-5 py-3 font-medium">Origin &amp; Description</th><th className="px-5 py-3 font-medium">Channel / Method</th><th className="px-5 py-3 text-right font-medium">In</th><th className="px-5 py-3 text-right font-medium">Out</th><th className="px-5 py-3 text-right font-medium">Balance</th></tr></thead>
          <tbody>
            {[...totals.rows].reverse().map((e) => { const badge = getOriginBadge(e); return <tr key={e.id} className="border-b border-slate-100 transition last:border-0 hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5"><td className="px-5 py-3 text-slate-500">{e.entry_date}</td><td className="px-5 py-3"><div className="flex items-center gap-2"><span className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${badge.color}`}>{badge.label}</span><span className="text-slate-900 dark:text-white">{e.description || "-"}</span></div></td><td className="px-5 py-3"><span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${METHOD_COLOR[e.method] || "bg-slate-100 text-slate-600"}`}>{e.method.toUpperCase()}</span>{e.payment_instruments?.name && <span className="cell-sub ml-1.5 text-[11px] text-slate-400 font-medium">🏦 {e.payment_instruments.name}</span>}</td><td className="px-5 py-3 text-right font-medium text-emerald-600">{e.direction === "in" ? `+${inr(e.amount)}` : ""}</td><td className="px-5 py-3 text-right font-medium text-rose-600">{e.direction === "out" ? `-${inr(e.amount)}` : ""}</td><td className={`px-5 py-3 text-right font-semibold ${e.balance < 0 ? "text-rose-600" : "text-slate-900 dark:text-white"}`}>{inr(e.balance)}</td></tr>; })}
            {totals.rows.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">No cash entries match your filters.</td></tr>}
          </tbody>
        </table>
      </div>
      {toastView}
    </div>
  );
}
