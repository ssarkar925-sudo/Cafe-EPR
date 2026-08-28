"use client";

import { useState } from "react";
import Modal from "@/components/ui/modal";
import type { Customer } from "./customers-client";

type Props = {
  state: { mode: "create" } | { mode: "edit"; customer: Customer };
  onClose: () => void;
  onSave: (
    input: {
      name: string;
      phone: string;
      email: string;
      address: string;
      opening_balance: number;
      customer_type: string;
      credit_limit?: number;
    },
    customer?: Customer
  ) => Promise<void>;
};

export default function CustomerFormModal({ state, onClose, onSave }: Props) {
  const editing = state.mode === "edit" ? state.customer : null;
  const [name, setName] = useState(editing?.name ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [address, setAddress] = useState(editing?.address ?? "");
  const [customerType, setCustomerType] = useState(editing?.customer_type ?? "retail");
  const [creditLimit, setCreditLimit] = useState(
    editing ? String(editing.credit_limit ?? "0") : "5000"
  );
  const [opening, setOpening] = useState(editing ? String(editing.opening_balance) : "0");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setSaving(true);
    try {
      await onSave(
        {
          name: trimmedName,
          phone: phone.trim(),
          email: email.trim(),
          address: address.trim(),
          opening_balance: Number(opening) || 0,
          customer_type: customerType || "retail",
          credit_limit: Number(creditLimit) || 0,
        },
        editing ?? undefined
      );
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10";
  const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500";

  return (
    <Modal
      as="form"
      onSubmit={submit}
      onClose={onClose}
      title={editing ? "Edit Customer" : "Add Customer"}
      subtitle={
        editing
          ? `${editing.code ?? "Customer"} · Balance ${editing.balance}`
          : "Create a customer profile for sales, credit and ledger tracking"
      }
      icon="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21a8 8 0 0 1 16 0"
      accent="blue"
      size="md"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-11 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="min-h-11 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving…" : editing ? "Save changes" : "Add customer"}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <label className={labelClass}>Name *</label>
          <input
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Customer name"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Phone</label>
            <input
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Mobile number"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Address</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Address (optional)"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Customer type</label>
          <select
            value={customerType}
            onChange={(e) => setCustomerType(e.target.value)}
            className={inputClass}
          >
            <option value="retail">Retail</option>
            <option value="business">Business</option>
            <option value="walk-in">Walk-in</option>
          </select>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
          <div className="mb-3">
            <p className="text-sm font-semibold text-slate-800">Credit & opening balance</p>
            <p className="mt-0.5 text-xs text-slate-400">Set the customer's starting financial position.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>
                Credit limit (₹)
                <span className="ml-1 font-normal normal-case tracking-normal text-slate-400">0 = no limit</span>
              </label>
              <input
                type="number"
                min="0"
                step="100"
                inputMode="decimal"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                placeholder="5000"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Opening balance (₹)</label>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
                placeholder="0"
                className={inputClass}
              />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
