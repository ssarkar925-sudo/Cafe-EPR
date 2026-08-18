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
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";
  const labelClass = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <Modal
      as="form"
      onSubmit={submit}
      onClose={onClose}
      title={editing ? "Edit Service" : "Add Service"}
      subtitle={editing ? "Update the service details" : "Create a new billable service"}
      icon="M12 2l8 4.5v9L12 20l-8-4.5v-9L12 2ZM12 11V6m0 5 5.5 3M12 11 6.5 14"
      accent="teal"
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
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : editing ? "Save changes" : "Add service"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Name *</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Category</label>
            <SearchableSelect
              value={categoryId}
              onChange={setCategoryId}
              options={[
                { value: "", label: "None" },
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
          <label className={labelClass}>Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Sale Price (₹) *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Cost Price (₹)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div
          className={`rounded-lg px-3 py-2 text-sm font-medium ${
            margin >= 0
              ? "bg-emerald-50 text-emerald-700"
              : "bg-rose-50 text-rose-700"
          }`}
        >
          Margin: {margin >= 0 ? "+" : ""}₹{margin.toFixed(2)}
        </div>
      </div>
    </Modal>
  );
}