"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { type PosCatalogItem, type PosCategory } from "./pos-types";
import { X, Sparkles, AlertCircle, Loader2 } from "lucide-react";

const GST_RATES = [
  { label: "0% (Exempt / Nil)", value: 0 },
  { label: "5% (Standard Essential)", value: 5 },
  { label: "12% (Standard Low)", value: 12 },
  { label: "18% (Standard Services/Goods)", value: 18 },
  { label: "28% (Luxury / Cess)", value: 28 },
];

export default function PosCustomItemModal({
  open,
  onClose,
  categories,
  onItemCreated,
}: {
  open: boolean;
  onClose: () => void;
  categories: PosCategory[];
  onItemCreated: (item: PosCatalogItem) => void;
}) {
  const [kind, setKind] = useState<"service" | "product">("service");
  const [name, setName] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [costPrice, setCostPrice] = useState("0");
  const [categoryId, setCategoryId] = useState(categories[0]?.id || "");
  const [gstRate, setGstRate] = useState(0);
  const [hsnSac, setHsnSac] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [stockQty, setStockQty] = useState("10");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cleanName = name.trim();
    const priceNum = Number(salePrice);

    if (!cleanName) {
      setError("Please enter an item name.");
      return;
    }
    if (isNaN(priceNum) || priceNum < 0) {
      setError("Please enter a valid sale price.");
      return;
    }

    setBusy(true);
    const supabase = createClient();

    try {
      if (kind === "service") {
        const { data, error: insertError } = await supabase
          .from("services")
          .insert({
            name: cleanName,
            sale_price: priceNum,
            cost_price: Number(costPrice) || 0,
            category_id: categoryId || null,
            gst_rate: gstRate,
            sac_code: hsnSac.trim() || null,
            is_active: true,
          })
          .select("id, name, sale_price, cost_price, category_id, sac_code, gst_rate, categories(name)")
          .single();

        if (insertError) throw new Error(insertError.message);

        const newItem: PosCatalogItem = {
          id: data.id,
          kind: "service",
          name: data.name,
          code: null,
          sale_price: data.sale_price,
          cost_price: data.cost_price,
          unit: "service",
          category_id: data.category_id,
          category_name: (data.categories as any)?.name ?? null,
          gst_rate: data.gst_rate,
          hsn_sac: data.sac_code,
        };

        onItemCreated(newItem);
      } else {
        const code = `PRD-${Date.now().toString().slice(-4)}`;
        const initialStockNum = Math.max(0, Number(stockQty) || 0);

        // First attempt using create_product_with_opening_stock RPC
        let createdProduct: any = null;
        const { data: rpcData, error: rpcError } = await supabase.rpc("create_product_with_opening_stock", {
          p_name: cleanName,
          p_code: code,
          p_description: null,
          p_unit: unit || "pcs",
          p_category_id: categoryId || null,
          p_sale_price: priceNum,
          p_cost_price: Number(costPrice) || 0,
          p_initial_stock: initialStockNum,
          p_reorder_level: 5,
        });

        if (!rpcError && rpcData) {
          createdProduct = rpcData;
        } else {
          // Fallback direct table insertion
          const { data: directData, error: directError } = await supabase
            .from("products")
            .insert({
              name: cleanName,
              code,
              unit: unit || "pcs",
              category_id: categoryId || null,
              sale_price: priceNum,
              cost_price: Number(costPrice) || 0,
              stock_qty: initialStockNum,
              reorder_level: 5,
              gst_rate: gstRate,
              hsn_code: hsnSac.trim() || null,
              is_active: true,
            })
            .select("id, code, name, sale_price, cost_price, stock_qty, reorder_level, unit, category_id, hsn_code, gst_rate, categories(name)")
            .single();

          if (directError) throw new Error(directError.message);
          createdProduct = directData;
        }

        const selectedCatName = categories.find((c) => c.id === categoryId)?.name ?? null;

        const newItem: PosCatalogItem = {
          id: createdProduct.id,
          kind: "product",
          name: createdProduct.name || cleanName,
          code: createdProduct.code || code,
          sale_price: createdProduct.sale_price ?? priceNum,
          cost_price: createdProduct.cost_price ?? (Number(costPrice) || 0),
          stock_qty: createdProduct.stock_qty ?? initialStockNum,
          reorder_level: createdProduct.reorder_level ?? 5,
          unit: createdProduct.unit || unit || "pcs",
          category_id: createdProduct.category_id || categoryId || null,
          category_name: (createdProduct.categories as any)?.name ?? selectedCatName,
          gst_rate: createdProduct.gst_rate ?? gstRate,
          hsn_sac: createdProduct.hsn_code ?? (hsnSac.trim() || null),
        };

        onItemCreated(newItem);
      }

      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to register custom item.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm antialiased font-sans">
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-500/20">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white">Add Custom Item</h2>
              <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                Registered in store catalog &amp; financial accounting
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Item Kind Selector */}
          <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-950">
            <button
              type="button"
              onClick={() => setKind("service")}
              className={`flex-1 rounded-lg py-1.5 text-xs font-black transition ${
                kind === "service"
                  ? "bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              Service (Cybercafe / Digital)
            </button>
            <button
              type="button"
              onClick={() => setKind("product")}
              className={`flex-1 rounded-lg py-1.5 text-xs font-black transition ${
                kind === "product"
                  ? "bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              Product (Physical Inventory)
            </button>
          </div>

          {/* Name & Category */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Item Name *
              </label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={kind === "service" ? "e.g. Urgent Spiral Binding" : "e.g. A4 Photo Glossy Paper (50pk)"}
                className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:focus:bg-slate-900 dark:focus:ring-blue-900/30"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Sale Price (₹) *
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                placeholder="0.00"
                className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:focus:bg-slate-900 dark:focus:ring-blue-900/30"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Category
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:focus:bg-slate-900"
              >
                <option value="">General / None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Pricing & Tax Details */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Cost Price (₹)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder="0.00"
                className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:focus:bg-slate-900"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                GST Rate
              </label>
              <select
                value={gstRate}
                onChange={(e) => setGstRate(Number(e.target.value))}
                className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:focus:bg-slate-900"
              >
                {GST_RATES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                HSN / SAC
              </label>
              <input
                value={hsnSac}
                onChange={(e) => setHsnSac(e.target.value)}
                placeholder={kind === "service" ? "9983" : "4911"}
                className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-mono font-bold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:focus:bg-slate-900"
              />
            </div>
          </div>

          {/* Product Specific: Stock & Unit */}
          {kind === "product" && (
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-amber-900 dark:text-amber-300">
                  Initial Stock Qty
                </label>
                <input
                  type="number"
                  min="0"
                  value={stockQty}
                  onChange={(e) => setStockQty(e.target.value)}
                  className="h-9 rounded-xl border border-amber-200 bg-white px-3 text-xs font-bold text-slate-900 outline-none focus:border-amber-500 dark:border-amber-800 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-amber-900 dark:text-amber-300">
                  Unit of Measure
                </label>
                <input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="pcs / pkt"
                  className="h-9 rounded-xl border border-amber-200 bg-white px-3 text-xs font-bold text-slate-900 outline-none focus:border-amber-500 dark:border-amber-800 dark:bg-slate-900 dark:text-white"
                />
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="mt-2 flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-5 text-xs font-black text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Registering...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Save &amp; Add to Bill</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
