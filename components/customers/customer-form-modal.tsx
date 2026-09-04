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
    "w-full rounded-xl border border-slate-200/90 bg-white/90 px-3.5 py-2.5 text-xs font-medium text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-indigo-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-white";
  const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400";

  return (
    <Modal
      as="form"
      onSubmit={submit}
      onClose={onClose}
      title={editing ? "Edit Customer Profile" : "Add New Customer"}
      subtitle={
        editing
          ? `${editing.code ?? "Customer"} · Balance ₹${Number(editing.balance).toLocaleString("en-IN")}`
          : "Create a customer profile for POS billing, credit khata and ledger tracking"
      }
      icon="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21a8 8 0 0 1 16 0"
      accent="indigo"
      size="md"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="btn-3d-tactile-secondary rounded-xl px-4 py-2.5 text-xs font-bold"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="btn-3d-tactile-primary rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving…" : editing ? "Save Changes" : "Create Customer"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Customer Name *</label>
          <input
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Rahul Sharma"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Phone Number</label>
            <input
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit mobile number"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Email Address</label>
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
          <label className={labelClass}>Physical Address</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street address or locality (optional)"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Customer Category</label>
          <select
            value={customerType}
            onChange={(e) => setCustomerType(e.target.value)}
            className={inputClass}
          >
            <option value="retail">Retail Consumer</option>
            <option value="business">Commercial / B2B</option>
            <option value="walk-in">Casual Walk-in</option>
          </select>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.02]">
          <div className="mb-3">
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Credit Limit &amp; Starting Balance</p>
            <p className="mt-0.5 text-[11px] text-slate-400">Configure starting balance and credit threshold for this customer.</p>
          </div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label className={labelClass}>
                Credit limit (₹)
                <span className="ml-1 font-normal normal-case tracking-normal text-slate-400">(0 = unlimited)</span>
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
              <label className={labelClass}>
                Opening balance (₹)
                <span className="ml-1 font-normal normal-case tracking-normal text-slate-400">
                  {editing ? "Display only" : "(+ owing, - advance)"}
                </span>
              </label>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                disabled={Boolean(editing)}
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
                placeholder="0.00"
                className={editing ? `${inputClass} opacity-60 cursor-not-allowed` : inputClass}
              />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
