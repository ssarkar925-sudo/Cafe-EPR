"use client";

import { useMemo, useState } from "react";
import { inr } from "@/lib/format";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";
const labelClass = "mb-1 block text-sm font-medium text-slate-700";

export default function TxnFormModal({
  service,
  label,
  customers,
  onClose,
  onSave,
}: {
  service: string;
  label: string;
  customers: { id: string; name: string; code: string }[];
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [service_type] = useState(service);
  const [transaction_date, setTransactionDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [customer_id, setCustomerId] = useState("");
  const [customer_name, setCustomerName] = useState("Walk-in");
  const [phone, setPhone] = useState("");
  const [aadhaar_last4, setAadhaarLast4] = useState("");
  const [bank_name, setBankName] = useState("");
  const [account_last4, setAccountLast4] = useState("");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [commission, setCommission] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isDmt = service_type === "dmt";
  const isAeps = service_type === "aeps";

  const cashEffect = useMemo(() => {
    const amt = Number(amount) || 0;
    const comm = Number(commission) || 0;
    if (isDmt)
      return { dir: "in", value: amt + comm, note: "Cash received from sender" };
    return { dir: "out", value: amt, note: "Cash paid out to customer" };
  }, [isDmt, amount, commission]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (isAeps && !/^[0-9]{4}$/.test(aadhaar_last4)) {
      setError("Aadhaar last 4 digits (numbers only) required");
      return;
    }
    if (isDmt && !reference.trim()) {
      setError("Reference / RRN is required for DMT");
      return;
    }
    setSaving(true);
    await onSave({
      service_type,
      transaction_date,
      customer_id: customer_id || null,
      customer_name,
      phone: phone || null,
      aadhaar_last4: aadhaar_last4 || null,
      bank_name: bank_name || null,
      account_last4: account_last4 || null,
      reference: reference || null,
      amount: Number(amount),
      commission: Number(commission || 0),
    });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            New {label} Transaction
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            &times;
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Service</label>
              <input
                value={label}
                readOnly
                className={`${inputClass} bg-slate-50 text-slate-500`}
              />
            </div>
            <div>
              <label className={labelClass}>Date</label>
              <input
                type="date"
                required
                value={transaction_date}
                onChange={(e) => setTransactionDate(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Customer</label>
              <select
                value={customer_id}
                onChange={(e) => setCustomerId(e.target.value)}
                className={inputClass}
              >
                <option value="">Walk-in</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Name</label>
              <input
                value={customer_name}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Walk-in"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Optional"
              className={inputClass}
            />
          </div>

          {isAeps && (
            <div>
              <label className={labelClass}>
                Aadhaar last 4 digits (no full Aadhaar)
              </label>
              <input
                value={aadhaar_last4}
                onChange={(e) => setAadhaarLast4(e.target.value)}
                maxLength={4}
                placeholder="1234"
                className={inputClass}
              />
            </div>
          )}

          {isDmt && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Beneficiary bank</label>
                <input
                  value={bank_name}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Optional"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Account last 4</label>
                <input
                  value={account_last4}
                  onChange={(e) => setAccountLast4(e.target.value)}
                  maxLength={4}
                  placeholder="Optional"
                  className={inputClass}
                />
              </div>
            </div>
          )}

          <div>
            <label className={labelClass}>
              Reference / RRN {isDmt && "(required)"}
            </label>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. 429512000123"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Amount</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Commission</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
                placeholder="0.00"
                className={inputClass}
              />
            </div>
          </div>

          <div
            className={`rounded-lg px-3 py-2 text-sm ${
              cashEffect.dir === "in"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            <p className="font-medium">
              Cash {cashEffect.dir.toUpperCase()}: {inr(cashEffect.value)}
            </p>
            <p className="mt-0.5 text-xs opacity-80">{cashEffect.note}</p>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
