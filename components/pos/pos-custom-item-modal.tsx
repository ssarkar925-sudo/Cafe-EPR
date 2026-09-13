"use client";

import { useState } from "react";
import { type CartLine, type PosCatalogItem, type PosCategory } from "./pos-types";
import { X, Sparkles, AlertCircle, ShoppingCart, ChevronDown, ChevronUp } from "lucide-react";

const GST_RATES = [
  { label: "0% (Exempt / Nil)", value: 0 },
  { label: "5% (Standard)", value: 5 },
  { label: "12% (Standard Low)", value: 12 },
  { label: "18% (Standard 18%)", value: 18 },
  { label: "28% (Luxury 28%)", value: 28 },
];

const COMMON_UNITS = ["pc", "page", "set", "copy", "hr", "job"];
const COMMON_RATES = [5, 10, 20, 50, 100, 200];

export default function PosCustomItemModal({
  open,
  onClose,
  categories,
  onItemCreated,
  onAddCustomItem,
}: {
  open: boolean;
  onClose: () => void;
  categories?: PosCategory[];
  onItemCreated?: (item: PosCatalogItem) => void;
  onAddCustomItem?: (item: Omit<CartLine, "key">) => void;
}) {
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("pc");
  const [gstRate, setGstRate] = useState(0);
  const [costPrice, setCostPrice] = useState("0");
  const [hsnSac, setHsnSac] = useState("");
  const [note, setNote] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function resetForm() {
    setName("");
    setRate("");
    setQty("1");
    setUnit("pc");
    setGstRate(0);
    setCostPrice("0");
    setHsnSac("");
    setNote("");
    setShowAdvanced(false);
    setError(null);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanName = name.trim();
    const rateNum = Number(rate);
    const qtyNum = Number(qty);

    if (!cleanName) {
      setError("Please enter an item name or description.");
      return;
    }
    if (isNaN(rateNum) || rateNum < 0) {
      setError("Please enter a valid unit rate (₹).");
      return;
    }
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setError("Please enter a valid quantity greater than 0.");
      return;
    }

    const customLine: Omit<CartLine, "key"> = {
      id: `temp-${Date.now()}`,
      kind: "custom",
      name: cleanName,
      code: null,
      rate: rateNum,
      qty: qtyNum,
      costPrice: Number(costPrice) || 0,
      categoryName: "Custom / Ad-hoc",
      gstRate,
      hsnSac: hsnSac.trim() || null,
      stockQty: null,
      unit: unit.trim() || "pc",
      note: note.trim() || undefined,
      isCustom: true,
    };

    if (onAddCustomItem) {
      onAddCustomItem(customLine);
    } else if (onItemCreated) {
      onItemCreated({
        id: customLine.id,
        kind: "service",
        name: cleanName,
        sale_price: rateNum,
        cost_price: Number(costPrice) || 0,
        gst_rate: gstRate,
        hsn_sac: hsnSac.trim() || null,
        unit: unit.trim() || "pc",
      });
    }

    resetForm();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs antialiased font-sans">
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white">Add Temporary Item</h2>
              <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                Adds directly to current cart only · Not saved in catalog
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 p-5">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Item Name / Description */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Item Name / Description *
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Color Xerox, Urgent Laminate, Custom Service"
              className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:focus:bg-slate-900 dark:focus:ring-blue-900/30"
            />
          </div>

          {/* Price & Quantity Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Unit Rate (₹) *
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="0.00"
                className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:focus:bg-slate-900"
              />
              {/* Quick Rate Preset Chips */}
              <div className="mt-1 flex flex-wrap gap-1">
                {COMMON_RATES.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setRate(String(amt))}
                    className={`rounded px-1.5 py-0.5 text-[9px] font-black transition ${
                      Number(rate) === amt
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    ₹{amt}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Quantity *
              </label>
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => setQty((q) => String(Math.max(1, (Number(q) || 1) - 1)))}
                  className="flex h-10 w-9 items-center justify-center rounded-l-xl border border-r-0 border-slate-200 bg-slate-100 text-xs font-black text-slate-600 hover:bg-slate-200 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
                >
                  -
                </button>
                <input
                  type="number"
                  min="0.001"
                  step="any"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="h-10 w-full border border-slate-200 bg-slate-50 text-center text-xs font-black text-slate-900 outline-none focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => setQty((q) => String((Number(q) || 1) + 1))}
                  className="flex h-10 w-9 items-center justify-center rounded-r-xl border border-l-0 border-slate-200 bg-slate-100 text-xs font-black text-slate-600 hover:bg-slate-200 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
                >
                  +
                </button>
              </div>
              <p className="mt-1 text-right text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400">
                Line Total: ₹{((Number(rate) || 0) * (Number(qty) || 0)).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Unit Chips */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Unit of Measure
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {COMMON_UNITS.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                    unit === u
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                      : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  {u}
                </button>
              ))}
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="custom"
                className="h-7 w-20 rounded-lg border border-slate-200 bg-slate-50 px-2 text-[11px] font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white"
              />
            </div>
          </div>

          {/* GST Rate */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              GST Rate
            </label>
            <div className="grid grid-cols-5 gap-1">
              {GST_RATES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setGstRate(r.value)}
                  className={`rounded-lg py-1.5 text-center text-[10px] font-black transition ${
                    gstRate === r.value
                      ? "bg-blue-600 text-white shadow-xs"
                      : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  {r.value}%
                </button>
              ))}
            </div>
          </div>

          {/* Optional Advanced Accordion */}
          <div className="border-t border-slate-100 pt-2 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            >
              <span>Advanced Options (Cost Price, HSN/SAC, Note)</span>
              {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {showAdvanced && (
              <div className="mt-2.5 grid grid-cols-2 gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-500">
                    Cost Price (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={costPrice}
                    onChange={(e) => setCostPrice(e.target.value)}
                    placeholder="0.00"
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-900 outline-none focus:border-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-500">
                    HSN / SAC Code
                  </label>
                  <input
                    value={hsnSac}
                    onChange={(e) => setHsnSac(e.target.value)}
                    placeholder="e.g. 9983"
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-mono font-bold text-slate-900 outline-none focus:border-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-500">
                    Optional Item Note
                  </label>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. Urgent rush order"
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-900 outline-none focus:border-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="mt-1 flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <button
              type="button"
              onClick={handleClose}
              className="h-9 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-5 text-xs font-black text-white shadow-xs hover:bg-blue-700"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              <span>Add to Cart</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
