"use client";

import { useState } from "react";
import { UserPlus, X } from "lucide-react";
import type { PosCustomer } from "./pos-types";

export default function PosNewCustomerModal({
  open,
  onClose,
  supabase,
  onCustomerCreated,
}: {
  open: boolean;
  onClose: () => void;
  supabase: any;
  onCustomerCreated: (customer: PosCustomer) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gstin, setGstin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Customer name is required.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // Auto-generate code if needed or let trigger handle it
      const code = `CUST-${Date.now().toString().slice(-4)}`;

      const { data, error: insertError } = await supabase
        .from("customers")
        .insert({
          name: trimmedName,
          phone: phone.trim() || null,
          gstin: gstin.trim() ? gstin.trim().toUpperCase() : null,
          code,
          is_active: true,
          balance: 0,
        })
        .select("id, name, code, phone, balance, gstin, state_code")
        .single();

      if (insertError) throw new Error(insertError.message);

      onCustomerCreated({
        id: data.id,
        name: data.name,
        code: data.code,
        phone: data.phone,
        balance: data.balance ?? 0,
        gstin: data.gstin,
        state_code: data.state_code,
      });

      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create customer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <form
        onSubmit={handleSave}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
              <UserPlus className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Quick Add Customer</h3>
              <p className="text-[10px] text-slate-400">Save and immediately attach to the active bill</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3.5 p-5">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Full Name *
            </label>
            <input
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rahul Sharma"
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-slate-950 dark:text-white dark:focus:bg-slate-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Mobile Phone
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="10-digit mobile"
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-slate-950 dark:text-white dark:focus:bg-slate-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                GSTIN (Optional)
              </label>
              <input
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-xs font-bold uppercase text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-slate-950 dark:text-white dark:focus:bg-slate-900"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2.5 border-t border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-white/10 dark:bg-slate-950">
          <button
            type="button"
            onClick={onClose}
            className="h-9 flex-1 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-9 flex-1 rounded-xl bg-blue-600 text-xs font-black text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Add & Attach"}
          </button>
        </div>
      </form>
    </div>
  );
}
