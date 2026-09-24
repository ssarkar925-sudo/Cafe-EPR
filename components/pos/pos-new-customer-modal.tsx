"use client";

import { useState } from "react";
import type { PosCustomer } from "./pos-types";
import Modal from "@/components/ui/modal";
import { createCustomerRecord, DuplicateCustomerError } from "@/lib/customers";

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
  const [duplicate, setDuplicate] = useState<{ id: string; name: string; phone?: string | null } | null>(null);

  if (!open) return null;

  async function useExistingCustomer(dup: { id: string; name: string; phone?: string | null }) {
    try {
      setSaving(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from("customers")
        .select("id, name, code, phone, balance, gstin, state_code")
        .eq("id", dup.id)
        .single();
      if (fetchError) throw new Error(fetchError.message);
      onCustomerCreated({
        id: data.id,
        name: data.name,
        code: data.code,
        phone: data.phone,
        balance: data.balance ?? 0,
        gstin: data.gstin,
        state_code: data.state_code,
      });
      setDuplicate(null);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to load existing customer.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
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
      setDuplicate(null);

      // Canonical creation: the database assigns the Customer ID (code).
      // Duplicate phones resolve to the existing profile, never a 2nd row.
      const data = await createCustomerRecord(supabase, {
        name: trimmedName,
        phone: phone.trim() || null,
        gstin: gstin.trim() || null,
        balance: 0,
      });

      onCustomerCreated({
        id: data.id,
        name: String(data.name),
        code: data.code,
        phone: (data.phone as string | null) ?? null,
        balance: Number(data.balance ?? 0),
        gstin: (data.gstin as string | null) ?? null,
        state_code: (data.state_code as string | null) ?? null,
      });

      onClose();
    } catch (err: any) {
      if (err instanceof DuplicateCustomerError) {
        setDuplicate(err.existing);
        return;
      }
      setError(err.message || "Failed to create customer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      as="form"
      onSubmit={handleSave}
      onClose={onClose}
      title="Quick Add Customer"
      subtitle="Save and immediately attach to the active bill"
      icon="UserPlus"
      accent="blue"
      size="sm"
      footer={
        <div className="flex w-full gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="h-10 flex-1 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-10 flex-1 rounded-xl bg-blue-600 text-xs font-black text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Add & Attach"}
          </button>
        </div>
      }
    >
      <div className="space-y-3.5">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        )}
        {duplicate && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-[11px] dark:border-amber-900/50 dark:bg-amber-950/40">
            <p className="font-black text-amber-800 dark:text-amber-200">Possible duplicate found</p>
            <p className="mt-0.5 font-semibold text-amber-700 dark:text-amber-300">
              {duplicate.name}{duplicate.phone ? ` · ${duplicate.phone}` : ""} already exists. Use the existing profile instead of creating a duplicate.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void useExistingCustomer(duplicate)}
                className="h-8 flex-1 rounded-lg bg-amber-600 text-[11px] font-black text-white hover:bg-amber-700 disabled:opacity-50"
              >
                Use existing
              </button>
              <button
                type="button"
                onClick={() => setDuplicate(null)}
                className="h-8 flex-1 rounded-lg border border-amber-300 bg-white text-[11px] font-black text-amber-800 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-slate-900 dark:text-amber-200"
              >
                Edit details
              </button>
            </div>
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
    </Modal>
  );
}
