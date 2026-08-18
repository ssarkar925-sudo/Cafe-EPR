"use client";

import { useState } from "react";
import Modal from "@/components/ui/modal";
import SearchableSelect from "@/components/ui/searchable-select";
import type { Product } from "./products-client";
import type { CategoryRef } from "./products-client";

type Props = {
  state: { mode: "create" } | { mode: "edit"; product: Product };
  categories: CategoryRef[];
  onClose: () => void;
  onSave: (
    input: {
      name: string;
      code: string;
      description: string;
      unit: string;
      category_id: string | null;
      sale_price: number;
      cost_price: number;
      stock_qty: number;
      reorder_level: number;
    },
    product?: Product
  ) => Promise<void>;
};

export default function ProductFormModal({
  state,
  categories,
  onClose,
  onSave,
}: Props) {
  const editing = state.mode === "edit" ? state.product : null;
  const [name, setName] = useState(editing?.name ?? "");
  const [code, setCode] = useState(editing?.code ?? "");
  const [categoryId, setCategoryId] = useState(editing?.category_id ?? "");
  const [unit, setUnit] = useState(editing?.unit ?? "pc");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [salePrice, setSalePrice] = useState(
    editing ? String(editing.sale_price) : ""
  );
  const [costPrice, setCostPrice] = useState(
    editing ? String(editing.cost_price) : ""
  );
  const [stock, setStock] = useState(editing ? String(editing.stock_qty) : "");
  const [reorder, setReorder] = useState(
    editing ? String(editing.reorder_level) : ""
  );
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSave(
      {
        name,
        code,
        description,
        unit,
        category_id: categoryId || null,
        sale_price: Number(salePrice) || 0,
        cost_price: Number(costPrice) || 0,
        stock_qty: Number(stock) || 0,
        reorder_level: Number(reorder) || 0,
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
      title={editing ? "Edit Product" : "Add Product"}
      subtitle={editing ? "Update the product details" : "Create a new catalog product"}
      icon="M20 7 12 3 4 7v10l8 4 8-4V7ZM12 3v18M4 7l8 4 8-4M4 17l8-4 8 4"
      accent="indigo"
      size="lg"
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
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : editing ? "Save changes" : "Add product"}
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
            <label className={labelClass}>Code</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="auto: PRD-0001"
              className={inputClass}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
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
          <div>
            <label className={labelClass}>Unit</label>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className={inputClass}
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
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Opening Stock</label>
            <input
              type="number"
              step="0.001"
              min="0"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Reorder Level</label>
            <input
              type="number"
              step="0.001"
              min="0"
              value={reorder}
              onChange={(e) => setReorder(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}