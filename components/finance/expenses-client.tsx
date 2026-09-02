"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { useRealtime } from "@/lib/supabase/realtime";
import { logAudit } from "@/lib/audit";
import ExpenseFormModal, { type ExpenseSource } from "./expense-form-modal";
import StatCard from "@/components/ui/stat-card";
import CompactToggle from "@/components/ui/compact-toggle";
import { useToast } from "@/components/ui/use-toast";
import { downloadCsv } from "@/components/ui/csv";

export type Expense = {
  id: string;
  expense_date: string;
  category: string;
  amount: number | string;
  note: string | null;
  status: string;
  source?: string;
  profiles: { full_name: string } | null;
};

function categoryColor(name: string) {
  const palettes = [
    "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800/40",
    "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300 border-violet-200 dark:border-violet-800/40",
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40",
    "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800/40",
    "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200 dark:border-rose-800/40",
    "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800/40",
    "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950/50 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-800/40",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palettes[h % palettes.length];
}

export default function ExpensesClient({
  initialExpenses,
  instruments = [],
}: {
  initialExpenses: Expense[];
  instruments?: ExpenseSource[];
}) {
  useRealtime(["expenses", "cash_entries", "payment_instruments"]);

  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "cancelled">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [modal, setModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Expense | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const { showToast, toastView } = useToast();

  const supabase = createClient();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return expenses.filter((e) => {
      if (status === "active" && e.status !== "active") return false;
      if (status === "cancelled" && e.status !== "cancelled") return false;
      if (from && e.expense_date < from) return false;
      if (to && e.expense_date > to) return false;
      if (!needle) return true;
      return e.category.toLowerCase().includes(needle) || (e.note ?? "").toLowerCase().includes(needle);
    });
  }, [expenses, q, status, from, to]);

  const summary = useMemo(() => {
    let activeTotal = 0,
      activeCount = 0,
      cancelledTotal = 0,
      monthTotal = 0;
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    for (const e of expenses) {
      const amt = Number(e.amount) || 0;
      if (e.status === "cancelled") cancelledTotal += amt;
      else {
        activeTotal += amt;
        activeCount++;
        if ((e.expense_date ?? "").slice(0, 7) === thisMonth) monthTotal += amt;
      }
    }
    return { activeTotal, activeCount, cancelledTotal, monthTotal };
  }, [expenses]);

  const topCategories = useMemo(() => {
    const map = new Map<string, number>();
    filtered
      .filter((e) => e.status === "active")
      .forEach((e) => map.set(e.category, (map.get(e.category) ?? 0) + Number(e.amount)));
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [filtered]);

  async function saveExpense(input: {
    id?: string;
    expense_date: string;
    category: string;
    amount: number | string;
    note: string | null;
    source: string;
  }) {
    if (input.id) {
      const { error } = await supabase.rpc("update_expense", {
        p_expense_id: input.id,
        p_expense_date: input.expense_date,
        p_category: input.category,
        p_amount: input.amount,
        p_note: input.note,
        p_instrument_id: input.source || null,
        p_method: input.source ? null : "cash",
      });
      if (error) {
        showToast("error", error.message);
        return;
      }
      setExpenses((prev) =>
        prev.map((e) =>
          e.id === input.id
            ? { ...e, expense_date: input.expense_date, category: input.category, amount: input.amount, note: input.note, source: input.source }
            : e
        )
      );
      setModal(false);
      setEditTarget(null);
      showToast("success", `Expense updated — ${input.category} ${inr(input.amount)}`);
      logAudit({
        action: "update",
        entity: "expense",
        entity_id: input.id,
        description: `Expense updated: ${input.category} ${inr(input.amount)}`,
        details: { category: input.category, amount: input.amount, note: input.note, source: input.source },
      });
      return;
    }

    const { data, error } = await supabase.rpc("add_expense", {
      p_expense_date: input.expense_date,
      p_category: input.category,
      p_amount: input.amount,
      p_note: input.note,
      p_instrument_id: input.source || null,
      p_method: input.source ? null : "cash",
    });
    if (error) {
      showToast("error", error.message);
      return;
    }
    const sourceName = input.source
      ? instruments.find((i) => i.id === input.source)?.name
      : "Cash";
    const row = {
      id: (data as { id: string }).id,
      expense_date: input.expense_date,
      category: input.category,
      amount: input.amount,
      note: input.note,
      status: "active",
      source: input.source,
      profiles: null,
    } as Expense;
    setExpenses((prev) => [row, ...prev]);
    setModal(false);
    showToast("success", `Expense added — ${input.category} ${inr(input.amount)} (${sourceName})`);
    logAudit({
      action: "create",
      entity: "expense",
      entity_id: row.id,
      description: `Expense added: ${input.category} ${inr(input.amount)} from ${sourceName}`,
      details: { category: input.category, amount: input.amount, note: input.note, source: input.source },
    });
  }

  function startEdit(e: Expense) {
    setEditTarget(e);
    setModal(true);
  }

  async function cancelExpense(id: string) {
    setBusyId(id);
    const { error } = await supabase.rpc("cancel_expense", { p_expense_id: id });
    setBusyId(null);
    if (error) {
      showToast("error", error.message);
      return;
    }
    setExpenses((prev) => prev.map((e) => (e.id === id ? { ...e, status: "cancelled" } : e)));
    showToast("info", "Expense cancelled and cash reversed");
    logAudit({ action: "cancel", entity: "expense", entity_id: id, description: "Expense cancelled" });
  }

  function exportCsv() {
    downloadCsv(
      `expenses-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Date", "Category", "Note", "Amount", "By", "Status"],
      filtered.map((e) => [e.expense_date, e.category, e.note ?? "-", Number(e.amount), e.profiles?.full_name ?? "-", e.status])
    );
    showToast("success", `Exported ${filtered.length} expenses to CSV`);
  }

  const inputClass =
    "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200";

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header & Sub-navigation */}
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-black uppercase tracking-wider text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                Operating Cost Control
              </span>
              <span className="text-xs text-slate-400">· Automated Cash Book Integration</span>
            </div>
            <h1 className="mt-1.5 text-2xl font-black text-slate-900 dark:text-white">
              Operating Expenses &amp; Cost Vouchers
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
              Track store operating expenses with automatic synchronized disbursements posted directly to the cash drawer or source bank account.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={exportCsv}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/5"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              Export CSV
            </button>
            <button
              onClick={() => {
                setEditTarget(null);
                setModal(true);
              }}
              className="btn-3d-tactile-primary flex items-center gap-2 px-5 py-2.5 text-xs font-black shadow-sm"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-4 w-4">
                <path d="M12 5v14M5 12h14" />
              </svg>
              + Record Expense Voucher
            </button>
          </div>
        </div>

        {/* Cross-Link Navigation Pills */}
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 dark:border-white/5">
          <span className="text-xs font-bold text-slate-400">Jump to:</span>
          <Link
            href="/finance/cashbook"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
          >
            💵 Counter Cashbook →
          </Link>
          <span className="rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-black text-white">
            🧾 Expense Management
          </span>
          <Link
            href="/finance/ledger"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
          >
            👥 Customer Due Khata →
          </Link>
          <Link
            href="/finance/pnl"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
          >
            📊 P&amp;L Report →
          </Link>
        </div>
      </header>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="This Month Spend"
          value={inr(summary.monthTotal)}
          sub="Active expenses only"
          icon="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
          grad="from-blue-500 to-indigo-600"
          onClick={() => setStatus("active")}
        />
        <StatCard
          label="Active Spend"
          value={inr(summary.activeTotal)}
          sub={`${summary.activeCount} active expense lines`}
          icon="M12 3v18M8 7h7a2 2 0 0 1 0 4H9a2 2 0 0 0 0 4h7"
          grad="from-rose-500 to-pink-600"
          onClick={() => setStatus("active")}
        />
        <StatCard
          label="Cancelled &amp; Reversed"
          value={inr(summary.cancelledTotal)}
          sub="Recredited to cash drawer"
          icon="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"
          grad="from-slate-500 to-slate-600"
          onClick={() => setStatus("cancelled")}
        />
        <StatCard
          label="Average Expense Ticket"
          value={summary.activeCount ? inr(Math.round(summary.activeTotal / summary.activeCount)) : "₹0"}
          sub="Per recorded voucher"
          icon="M3 7v6h6M3.5 13a9 9 0 1 0 0-6"
          grad="from-violet-500 to-purple-600"
          onClick={() => setStatus("all")}
        />
      </div>

      {/* Top Category Distribution */}
      {topCategories.length > 0 && (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Active Category Allocation (Top in View)
            </h3>
            <span className="font-mono text-xs font-bold text-slate-400">
              Total: {inr(summary.activeTotal)}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {topCategories.map(([name, amt], i) => {
              const pct = summary.activeTotal > 0 ? Math.round((amt / summary.activeTotal) * 100) : 0;
              return (
                <div
                  key={name}
                  className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-3.5 py-2 dark:border-white/5 dark:bg-white/5"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-black text-white dark:bg-white dark:text-slate-900">
                    {i + 1}
                  </span>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${categoryColor(name)}`}>
                    {name}
                  </span>
                  <span className="font-mono text-sm font-black text-slate-900 dark:text-white">
                    {inr(amt)}
                  </span>
                  <span className="font-mono text-xs text-slate-400">({pct}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative min-w-[220px] flex-1">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search category or note…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:text-white"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl bg-slate-100 p-1 text-xs dark:bg-white/5">
              {(["all", "active", "cancelled"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`rounded-lg px-3 py-1.5 font-bold capitalize transition ${
                    status === s ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white" : "text-slate-500"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
            <span className="text-xs font-bold text-slate-400">to</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
            <CompactToggle value={compact} onChange={setCompact} storageKey="sccomm-expenses-compact" />
            {(q || status !== "all" || from || to) && (
              <button
                onClick={() => { setQ(""); setStatus("all"); setFrom(""); setTo(""); }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-6 py-4 dark:border-white/10">
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Expense Register</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Chronological expense vouchers with audit history and cash reversal support.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className={`w-full text-left text-sm ${compact ? "rows-compact" : ""}`}>
            <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:bg-white/[0.03]">
              <tr>
                <th className="px-5 py-3.5">Date</th>
                <th className="px-5 py-3.5">Category</th>
                <th className="px-5 py-3.5">Narrative Note</th>
                <th className="px-5 py-3.5 text-right">Amount (₹)</th>
                <th className="px-5 py-3.5">Logged By</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filtered.map((e) => (
                <tr
                  key={e.id}
                  className={`transition hover:bg-slate-50/60 dark:hover:bg-white/[0.02] ${
                    e.status === "cancelled" ? "opacity-50" : ""
                  }`}
                >
                  <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                    {e.expense_date}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold ${categoryColor(e.category)}`}>
                      {e.category}
                    </span>
                  </td>
                  <td className="max-w-[240px] truncate px-5 py-3.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                    {e.note || "—"}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono font-black text-slate-900 dark:text-white">
                    {inr(e.amount)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                    {e.profiles?.full_name || "—"}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        e.status === "active"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                          : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                    >
                      {e.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {e.status === "active" && (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => startEdit(e)}
                          className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/5"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => cancelExpense(e.id)}
                          disabled={busyId === e.id}
                          className="rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 shadow-xs transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-800/40 dark:bg-rose-950/40 dark:text-rose-300"
                        >
                          {busyId === e.id ? "…" : "Cancel & Reverse"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-sm text-slate-400">
                    No expenses match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <ExpenseFormModal
          instruments={instruments}
          onClose={() => {
            setModal(false);
            setEditTarget(null);
          }}
          onSave={saveExpense}
          initial={editTarget ?? undefined}
        />
      )}
      {toastView}
    </div>
  );
}
