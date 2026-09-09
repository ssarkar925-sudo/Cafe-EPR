"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/modal";

function inr(value: number | string) {
  return "₹" + Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type PaymentMethod = "cash" | "upi" | "bank" | "wallet" | "debit_card" | "credit_card";

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  upi: "UPI / QR",
  bank: "Bank Transfer",
  wallet: "Wallet",
  debit_card: "Debit Card",
  credit_card: "Credit Card",
};

function newRequestKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

export default function CustomerPaymentQuickAction({
  customer,
}: {
  customer: { id: string; name: string; balance: number | string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const due = useMemo(() => Math.max(0, Number(customer.balance) || 0), [customer.balance]);

  if (due <= 0 && !open) return null;

  function close() {
    if (saving) return;
    setOpen(false);
    setError(null);
    setAmount("");
    setReference("");
  }

  async function submit() {
    setError(null);
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a valid payment amount greater than zero.");
      return;
    }
    if (value > due + 0.005) {
      setError(`Payment cannot exceed the outstanding due of ${inr(due)}.`);
      return;
    }
    if (!date) {
      setError("Select a payment date.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/pos/customer-due-payment", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customer.id,
          entry_date: date,
          amount: Number(value.toFixed(2)),
          method,
          reference: reference.trim() || null,
          idempotency_key: newRequestKey(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.error) {
        setError(payload?.error?.message || payload?.error || "Unable to record customer payment.");
        return;
      }

      close();
      router.refresh();
    } catch (requestError: any) {
      setError(requestError?.message || "Unable to reach the customer payment service.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError(null);
          setAmount("");
        }}
        className="fixed bottom-6 left-1/2 z-[35] -translate-x-1/2 inline-flex items-center gap-2 rounded-2xl border border-emerald-300 bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-xl shadow-emerald-900/20 transition hover:-translate-y-0.5 hover:bg-emerald-700 active:translate-y-0"
      >
        <span className="text-base">₹</span>
        Record Due Payment
        <span className="rounded-lg bg-white/15 px-2 py-0.5 font-mono text-xs">{inr(due)}</span>
      </button>

      {open && (
        <Modal
          onClose={close}
          title="Record Customer Due Payment"
          subtitle={`${customer.name} · outstanding due ${inr(due)}`}
          icon="M12 5v14M5 12h14"
          accent="emerald"
          size="sm"
          footer={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={saving}
                className="btn-3d-tactile-secondary rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={saving}
                className="btn-3d-tactile-emerald rounded-xl px-4 py-2 text-xs font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Recording…" : "Record Payment"}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-wider text-rose-600">Outstanding Due</div>
              <div className="mt-1 font-mono text-2xl font-black text-rose-700">{inr(due)}</div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Payment Amount *</label>
              <input
                autoFocus
                type="number"
                min="0.01"
                max={due}
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Payment Method *</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              >
                {Object.entries(METHOD_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Payment Date *</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Reference / Note</label>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. UPI ref, bank reference, cash collection note"
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-700">
                {error}
              </div>
            )}

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[11px] font-semibold text-emerald-800">
              The payment is posted to the customer ledger, reduces the outstanding due, and is allocated to the customer’s oldest open invoices first.
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
