"use client";

import { useState } from "react";
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
      },
      editing ?? undefined
    );
    setSaving(false);
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";
  const labelClass = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {editing ? "Edit Customer" : "Add Customer"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            &times;
          </button>
        </div>

        {editing && (
          <p className="mt-1 text-sm text-slate-500">
            {editing.code ?? ""} &middot; Balance {editing.balance}
          </p>
        )}

        <div className="mt-5 space-y-4">
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

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : editing ? "Save changes" : "Add customer"}
          </button>
        </div>
      </form>
    </div>
  );
}
