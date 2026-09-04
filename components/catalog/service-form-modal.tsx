"use client";

import { useState } from "react";
import Modal from "@/components/ui/modal";
import SearchableSelect from "@/components/ui/searchable-select";
import type { Service } from "./services-client";
import type { CategoryRef } from "./products-client";

type Props = {
  state: { mode: "create" } | { mode: "edit"; service: Service };
  categories: CategoryRef[];
  onClose: () => void;
  onSave: (
    input: {
      name: string;
      description: string;
      category_id: string | null;
      sale_price: number;
      cost_price: number;
    },
    service?: Service
  ) => Promise<void>;
};

export default function ServiceFormModal({
  state,
  categories,
  onClose,
  onSave,
}: Props) {
  const editing = state.mode === "edit" ? state.service : null;
  const [name, setName] = useState(editing?.name ?? "");
  const [categoryId, setCategoryId] = useState(editing?.category_id ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [salePrice, setSalePrice] = useState(
    editing ? String(editing.sale_price) : ""
  );
  const [costPrice, setCostPrice] = useState(
    editing ? String(editing.cost_price) : ""
  );
  const [saving, setSaving] = useState(false);

  const margin = (Number(salePrice) || 0) - (Number(costPrice) || 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSave(
      {
        name,
        description,
        category_id: categoryId || null,
        sale_price: Number(salePrice) || 0,
        cost_price: Number(costPrice) || 0,
      },
      editing ?? undefined
    );
    setSaving(false);
  }

  const inputClass =
    "w-full rounded-xl border border-slate-200/90 bg-white/90 px-3.5 py-2.5 text-xs font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-white";
  const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400";

  return (
    <Modal
      as="form"
      onSubmit={submit}
      onClose={onClose}
      title={editing ? "Edit Service Rate Card" : "Add Billable Service"}
      subtitle={editing ? "Update service pricing, rates and category" : "Create a new billable service for POS sales and digital work"}
      icon="M12 2l8 4.5v9L12 20l-8-4.5v-9L12 2ZM12 11V6m0 5 5.5 3M12 11 6.5 14"
      accent="indigo"
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-3d-tactile-secondary rounded-xl px-4 py-2 text-xs font-bold"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="btn-3d-tactile-primary rounded-xl px-4 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-60"
          >
            {saving ? "Saving…" : editing ? "Save Changes" : "Add Service"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Service Name *</label>
            <input
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Color Xerox / Print"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Catalog Category</label>
            <SearchableSelect
              value={categoryId}
              onChange={setCategoryId}
              options={[
                { value: "", label: "None (Unassigned)" },
                ...categories
                  .filter((c) => c.is_active)
                  .map((c) => ({ value: c.id, label: c.name })),
              ]}
              searchPlaceholder="Search category…"
              showClear={false}
            />
          </div>
        </div>
        <div>
          <label className={labelClass}>Description / Instructions</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Service specifications, per-page rate, etc."
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-2 gap-3.5">
          <div>
            <label className={labelClass}>Customer Sale Price (₹) *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              placeholder="0.00"
              className={`${inputClass} font-mono font-bold`}
            />
          </div>
          <div>
            <label className={labelClass}>Direct Cost Price (₹)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              placeholder="0.00"
              className={`${inputClass} font-mono font-bold`}
            />
          </div>
        </div>
        <div
          className={`flex items-center justify-between rounded-xl border px-3.5 py-2 text-xs font-bold ${
            margin >= 0
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400"
          }`}
        >
          <span className="flex items-center gap-1.5 font-sans">
            <span className={`h-1.5 w-1.5 rounded-full ${margin >= 0 ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
            Operating Unit Margin
          </span>
          <span className="font-mono text-sm font-black">
            {margin >= 0 ? "+" : ""}₹{margin.toFixed(2)}
          </span>
        </div>
      </div>
    </Modal>
  );
}