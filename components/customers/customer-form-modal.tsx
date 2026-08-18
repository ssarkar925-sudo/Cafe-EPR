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
  const [opening, setOpening] = useState(
    editing ? String(editing.opening_balance) : "0"
  );
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSave(
      {
        name,
        phone,
        email,
        address,
        opening_balance: Number(opening) || 0,
        customer_type: customerType || "retail",
      },
      editing ?? undefined
    );
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
      title={editing ? "Edit Customer" : "Add Customer"}
      subtitle={
        editing
          ? `${editing.code ?? ""} · Balance ${editing.balance}`
          : "Add a new customer to the ledger"
      }
      icon="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21a8 8 0 0 1 16 0"
      accent="blue"
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
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : editing ? "Save changes" : "Add customer"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Name *</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label className={labelClass}>Address</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
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
        <div>
          <label className={labelClass}>
            Opening Balance (₹)
            {!editing && (
              <span className="font-normal text-slate-400"> — sets starting balance</span>
            )}
          </label>
          <input
            type="number"
            step="0.01"
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
    </Modal>
  );
}