"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import ExpenseFormModal from "./expense-form-modal";

export type Expense = {
  id: string;
  expense_date: string;
  category: string;
  amount: number | string;
  note: string | null;
  status: string;
  profiles: { full_name: string } | null;
};

export default function ExpensesClient({
  initialExpenses,
}: {
  initialExpenses: Expense[];
}) {
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "cancelled">("all");
  const [modal, setModal] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const supabase = createClient();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return expenses.filter((e) => {
      if (status === "active" && e.status !== "active") return false;
      if (status === "cancelled" && e.status !== "cancelled") return false;
      if (!needle) return true;
      return (
        e.category.toLowerCase().includes(needle) ||
        (e.note ?? "").toLowerCase().includes(needle)
      );
    });
  }, [expenses, q, status]);

  async function addExpense(input: {
    expense_date: string;
    category: string;
    amount: number;
    note: string;
  }) {
    const { data, error } = await supabase.rpc("add_expense", {
      p_expense_date: input.expense_date,
      p_category: input.category,
      p_amount: input.amount,
      p_note: input.note,
    });
    if (error) {
      alert(error.message);
      return;
    }
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
    logAudit({
      action: "create",
      entity: "expense",
      entity_id: row.id,
      description: `Expense added: ${input.category} ${inr(input.amount)}`,
      details: { category: input.category, amount: input.amount, note: input.note },
    });
  }

  async function cancelExpense(id: string) {
    setBusyId(id);
    const { data, error } = await supabase.rpc("cancel_expense", {
      p_expense_id: id,
    });
    setBusyId(null);
    if (error) {
      alert(error.message);
      return;
    }
    setExpenses((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status: "cancelled" } : e))
    );
    logAudit({ action: "cancel", entity: "expense", entity_id: id, description: "Expense cancelled" });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Expenses</h1>
        <button
          onClick={() => setModal(true)}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          Add Expense
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search category or note..."
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
        <div className="flex rounded-lg bg-slate-100 p-1 text-sm">
          {(["all", "active", "cancelled"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-md px-3 py-1 ${
                status === s
                  ? "bg-white font-medium text-slate-900 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <span className="text-sm text-slate-500">{filtered.length} expenses</span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Note</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">By</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-500">{e.expense_date}</td>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {e.category}
                </td>
                <td className="px-4 py-3 text-slate-700">{e.note || "-"}</td>
                <td className="px-4 py-3 text-slate-900">{inr(e.amount)}</td>
                <td className="px-4 py-3 text-slate-700">
                  {e.profiles?.full_name || "-"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      e.status === "active"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {e.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {e.status === "active" && (
                    <button
                      onClick={() => cancelExpense(e.id)}
                      disabled={busyId === e.id}
                      className="text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      {busyId === e.id ? "..." : "Cancel"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No expenses found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <ExpenseFormModal
          onClose={() => setModal(false)}
          onSave={addExpense}
        />
      )}
    </div>
  );
}
