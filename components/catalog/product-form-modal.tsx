"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/modal";
import SearchableSelect from "@/components/ui/searchable-select";
import type { Product } from "./products-client";
import type { CategoryRef } from "./products-client";

type Props = {
  state: { mode: "create" } | { mode: "edit"; product: Product };
  categories: CategoryRef[];
  suggestedCode?: string;
  nextCode?: () => string;
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
      /** Only included when creating a new product. Never sent on edit. */
      stock_qty: number;
      reorder_level: number;
    },
    product?: Product
  ) => Promise<void>;
};

export default function ProductFormModal({
  state,
  categories,
  suggestedCode,
  nextCode,
  onClose,
  onSave,
}: Props) {
  const editing = state.mode === "edit" ? state.product : null;
  const [name, setName] = useState(editing?.name ?? "");
  const [code, setCode] = useState(editing?.code ?? suggestedCode ?? (nextCode ? nextCode() : "PRD-0001"));
  const [categoryId, setCategoryId] = useState(editing?.category_id ?? "");
  const [unit, setUnit] = useState(editing?.unit ?? "pc");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [salePrice, setSalePrice] = useState(
    editing ? String(editing.sale_price) : ""
  );
  const [costPrice, setCostPrice] = useState(
    editing ? String(editing.cost_price) : ""
  );
  // Stock is shown for display only when editing; only editable on create.
  const [stock, setStock] = useState(editing ? String(editing.stock_qty) : "");
  const [reorder, setReorder] = useState(
    editing ? String(editing.reorder_level) : ""
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing && !code) {
      setCode(suggestedCode || (nextCode ? nextCode() : "PRD-0001"));
    }
  }, [editing, suggestedCode, nextCode, code]);

  function handleAutoGenerateCode() {
    if (nextCode) {
      setCode(nextCode());
    } else if (suggestedCode) {
      setCode(suggestedCode);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const finalCode = (code.trim() || (nextCode ? nextCode() : suggestedCode || "PRD-0001")).toUpperCase();

    await onSave(
      {
        name: name.trim(),
        code: finalCode,
        description,
        unit,
        category_id: categoryId || null,
        sale_price: Number(salePrice) || 0,
        cost_price: Number(costPrice) || 0,
        // When editing, stock_qty is intentionally forwarded as the EXISTING value
        // but the parent saveProduct() will strip it from the update payload.
        // On create it is used as the initial seeded stock.
        stock_qty: editing ? Number(editing.stock_qty) : Number(stock) || 0,
        reorder_level: Number(reorder) || 0,
      },
      editing ?? undefined
    );
    setSaving(false);
  }

  const inputClass =
    "w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-white";
  const readonlyClass =
    "w-full rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm text-slate-500 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-400 cursor-not-allowed select-none";
  const labelClass = "mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300";

  return (
    <Modal
      as="form"
      onSubmit={submit}
      onClose={onClose}
      title={editing ? "Edit Product" : "Add Product"}
      subtitle={editing ? "Update product details and pricing" : "Create a new catalog product with auto-generated code"}
      icon="M20 7 12 3 4 7v10l8 4 8-4V7ZM12 3v18M4 7l8 4 8-4M4 17l8-4 8 4"
      accent="indigo"
      size="lg"
      footer={
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 hover:brightness-110 disabled:opacity-60"
          >
            {saving ? "Saving..." : editing ? "Save changes" : "Add product"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Product Name *</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Wireless Mouse, A4 Paper..."
              className={inputClass}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Product Code / SKU *
              </label>
              <button
                type="button"
                onClick={handleAutoGenerateCode}
                title="Regenerate next unique product code"
                className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 hover:underline dark:text-indigo-400"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3 w-3">
                  <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
                </svg>
                Auto-Generate
              </button>
            </div>
            <div className="relative">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. PRD-0001"
                className={`${inputClass} font-mono uppercase`}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Category</label>
            <SearchableSelect
              value={categoryId}
              onChange={setCategoryId}
              options={[
                { value: "", label: "None / Uncategorized" },
                ...categories
                  .filter((c) => c.is_active)
                  .map((c) => ({ value: c.id, label: c.name })),
              ]}
              searchPlaceholder="Search category…"
              showClear={false}
            />
          </div>
          <div>
            <label className={labelClass}>Unit of Measure</label>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="pc, kg, box, packet..."
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <label className={labelClass}>Sale Price (₹) *</label>
            <input
              required
              type="number"
              step="0.01"
              min="0"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              placeholder="0.00"
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
              placeholder="0.00"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>
              Stock Quantity
              {editing && (
                <span className="ml-1.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
                  Read-only
                </span>
              )}
            </label>
            {editing ? (
              /* Stock is read-only on edit — use Adjust Stock button instead */
              <div className={readonlyClass} title="Use the Adjust Stock button to change stock quantity">
                {editing.stock_qty} {editing.unit}
              </div>
            ) : (
              <input
                type="number"
                step="1"
                min="0"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                placeholder="0"
                className={inputClass}
              />
            )}
          </div>
          <div>
            <label className={labelClass}>Reorder Level</label>
            <input
              type="number"
              step="1"
              min="0"
              value={reorder}
              onChange={(e) => setReorder(e.target.value)}
              placeholder="5"
              className={inputClass}
            />
          </div>
        </div>

        {editing && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
            <span className="font-black">⚠ Stock quantity is locked.</span>{" "}
            Use the <span className="font-black">Adjust Stock</span> button in the product list to set a new quantity with a reason. This ensures every stock change is recorded in the inventory journal.
          </div>
        )}

        <div>
          <label className={labelClass}>Description / Notes (Optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Product specifications, brand notes, barcode details..."
            className={inputClass}
          />
        </div>
      </div>
    </Modal>
  );
}