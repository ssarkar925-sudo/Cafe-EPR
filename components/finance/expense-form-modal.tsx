"use client";

import { useState } from "react";
import Modal from "@/components/ui/modal";

export default function ExpenseFormModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (input: {
    expense_date: string;
    category: string;
    amount: number;
    note: string;
  }) => Promise<void>;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState("general");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSave({
      expense_date: date,
      category,
      amount: Number(amount) || 0,
      note,
    });
    setSaving(false);
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";
  const labelClass = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <Modal
      as="form"
      onSubmit={submit}
      onClose={onClose}
      title="Add Expense"
      subtitle="Record a cash outflow from the shop"
      icon="M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5"
      accent="rose"
      size="md"
      footer={
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Add expense"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Date *</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Amount (₹) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label className={labelClass}>Category *</label>
          <input
            required
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Note</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
    </Modal>
  );
}