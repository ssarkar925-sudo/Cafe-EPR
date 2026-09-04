"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/ui/modal";
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
    "w-full rounded-xl border border-slate-200/90 bg-white/90 px-3.5 py-2.5 text-xs font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-white";

  return (
    <Modal
      onClose={onClose}
      title={isReturn ? "Return Advance" : "Record Customer Advance"}
      subtitle={
        <>
          {customer.name} · {isReturn ? "customer advance return payout" : "cash received in advance from customer"}
        </>
      }
      icon={isReturn ? "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" : "M5 12h14M12 5l7 7-7 7"}
      accent={isReturn ? "amber" : "emerald"}
      size="sm"
      headerRight={
        <div
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs font-bold ${
            Number(customer.balance) < 0
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${Number(customer.balance) < 0 ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
          {isReturn ? `Available ${inr(advance)}` : `Balance ${inr(customer.balance)}`}
        </div>
      }
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="btn-3d-tactile-secondary rounded-xl px-4 py-2 text-xs font-bold"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || (isReturn && !canReturn)}
            className={`${
              isReturn ? "btn-3d-tactile-primary" : "btn-3d-tactile-emerald"
            } rounded-xl px-4 py-2 text-xs font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {saving ? "Processing…" : isReturn ? "Return Advance" : "Record Advance"}
          </button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Amount (₹) *
          </label>
          <input
            autoFocus
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className={`${inputClass} font-mono font-bold text-sm`}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Entry Date *
          </label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Remarks / Note
          </label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={isReturn ? "e.g. Refunded excess advance to customer" : "e.g. Advance paid against order"}
            className={inputClass}
          />
        </div>
        {error && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-2 text-xs font-bold text-rose-700 dark:text-rose-400">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}