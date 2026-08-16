"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Customer } from "./customers-client";

function inr(n: number | string) {
  return (
    "₹" +
    Number(n).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export default function AdvanceModal({
  open,
  mode,
  customer,
  onClose,
  onDone,
}: {
  open: boolean;
  mode: "record" | "return";
  customer: Customer;
  onClose: () => void;
  onDone: (balance: number) => void;
}) {
  const supabase = createClient();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const isReturn = mode === "return";
  const advance = Number(customer.balance) < 0 ? Math.abs(Number(customer.balance)) : 0;
  const canReturn = isReturn && advance > 0;

  async function submit() {
    setError(null);
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setError("Enter a valid amount greater than zero.");
      return;
    }
    if (!date) {
      setError("Select a date.");
      return;
    }
    setSaving(true);
    const { data, error: rpcError } = await supabase.rpc(
      isReturn ? "return_advance" : "record_advance",
      {
        p_customer_id: customer.id,
        p_amount: amt,
        p_entry_date: date,
        p_note: note.trim() || null,
      }
    );
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    onDone(Number((data as { balance: number }).balance));
  }

  const inputClass =
    "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#020617]/70 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {isReturn ? "Return Advance" : "Record Advance"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {customer.name} · {isReturn ? "advance available" : "cash received from customer"}
            </p>
          </div>
          <div
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
              Number(customer.balance) < 0
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {isReturn ? `Available ${inr(advance)}` : `Balance ${inr(customer.balance)}`}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Amount *</label>
            <input
              autoFocus
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Date *</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Note</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={isReturn ? "e.g. Refund to customer" : "e.g. Advance for future orders"}
              className={inputClass}
            />
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-600">
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || (isReturn && !canReturn)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : isReturn ? "Return advance" : "Record advance"}
          </button>
        </div>
      </div>
    </div>
  );
}