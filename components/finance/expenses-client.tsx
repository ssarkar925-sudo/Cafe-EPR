"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
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
  profiles: { full_name: string } | null;
};

function categoryColor(name: string) {
  const palettes = [
    "bg-blue-100 text-blue-700",
    "bg-violet-100 text-violet-700",
    "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
    "bg-cyan-100 text-cyan-700",
    "bg-fuchsia-100 text-fuchsia-700",
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
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "cancelled">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [modal, setModal] = useState(false);
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
      .slice(0, 5);
  }, [filtered]);

  async function addExpense(input: {
    expense_date: string;
    category: string;
    amount: number;
    note: string;
    source: string;
  }) {
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
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Expenses</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Shop spending with an automatic cash-book entry for every record.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/5"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            CSV
          </button>
          <button
            onClick={() => setModal(true)}
            className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add Expense
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="This Month"
          value={inr(summary.monthTotal)}
          sub="Active expenses only"
          icon="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
          grad="from-blue-500 to-indigo-600"
        />
        <StatCard
          label="Active Spend"
          value={inr(summary.activeTotal)}
          sub={`${summary.activeCount} expenses`}
          icon="M12 3v18M8 7h7a2 2 0 0 1 0 4H9a2 2 0 0 0 0 4h7"
          grad="from-rose-500 to-pink-600"
        />
        <StatCard
          label="Cancelled"
          value={inr(summary.cancelledTotal)}
          sub="Reversed to cash"
          icon="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"
          grad="from-slate-500 to-slate-600"
        />
        <StatCard
          label="Average / Active"
          value={summary.activeCount ? inr(Math.round(summary.activeTotal / summary.activeCount)) : "₹0"}
          sub="Per expense record"
          icon="M3 7v6h6M3.5 13a9 9 0 1 0 0-6"
          grad="from-violet-500 to-purple-600"
        />
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
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
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl bg-slate-100 p-1 text-xs dark:bg-white/5">
              {(["all", "active", "cancelled"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`rounded-lg px-3 py-1.5 font-medium capitalize transition ${
                    status === s ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white" : "text-slate-500"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
            <span className="text-xs text-slate-400">to</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
            <CompactToggle value={compact} onChange={setCompact} storageKey="sccomm-expenses-compact" />
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-white/10">
        <table className={`w-full text-left text-sm ${compact ? "rows-compact" : ""}`}>
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 dark:border-white/10">
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Category</th>
              <th className="px-5 py-3 font-medium">Note</th>
              <th className="px-5 py-3 text-right font-medium">Amount</th>
              <th className="px-5 py-3 font-medium">By</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} className={`border-b border-slate-100 transition last:border-0 hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5 ${e.status === "cancelled" ? "opacity-60" : ""}`}>
                <td className="px-5 py-3 text-slate-500">{e.expense_date}</td>
                <td className="px-5 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${categoryColor(e.category)}`}>{e.category}</span>
                </td>
                <td className="cell-sub px-5 py-3 text-slate-700 dark:text-slate-300">{e.note || "-"}</td>
                <td className="px-5 py-3 text-right font-semibold text-slate-900 dark:text-white">{inr(e.amount)}</td>
                <td className="cell-sub px-5 py-3 text-slate-700 dark:text-slate-300">{e.profiles?.full_name || "-"}</td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      e.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {e.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  {e.status === "active" && (
                    <button
                      onClick={() => cancelExpense(e.id)}
                      disabled={busyId === e.id}
                      className="rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-500/30 dark:bg-transparent dark:hover:bg-rose-500/10"
                    >
                      {busyId === e.id ? "…" : "Cancel"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                  No expenses match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {topCategories.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Top categories in view</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {topCategories.map(([name, amt], i) => (
              <div key={name} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 dark:border-white/5 dark:bg-white/5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white dark:bg-white dark:text-slate-900">
                  {i + 1}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${categoryColor(name)}`}>{name}</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{inr(amt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {modal && <ExpenseFormModal instruments={instruments} onClose={() => setModal(false)} onSave={addExpense} />}
      {toastView}
    </div>
  );
}