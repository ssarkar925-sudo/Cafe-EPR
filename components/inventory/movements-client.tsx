"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import Modal from "@/components/ui/modal";

export type StockMovement = {
  id: string;
  product_id: string;
  movement_date: string;
  movement_type: "OPENING_STOCK" | "PURCHASE" | "SALE" | "SALES_RETURN" | "PURCHASE_RETURN" | "ADJUSTMENT";
  qty_change: number;
  unit_cost: number;
  stock_after: number;
  ref_type: string | null;
  ref_id: string | null;
  remarks: string | null;
  created_at: string;
  products?: { id: string; name: string; code: string } | null;
};

type ProductOption = {
  id: string;
  name: string;
  code: string;
  stock_qty: number;
  cost_price: number;
};

export default function StockMovementsClient() {
  const supabase = useMemo(() => createClient(), []);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");

  // Manual Adjustment Modal
  const [adjModalOpen, setAdjModalOpen] = useState(false);
  const [adjProductId, setAdjProductId] = useState("");
  const [adjNewStock, setAdjNewStock] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [savingAdj, setSavingAdj] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [movRes, prodRes] = await Promise.all([
      supabase
        .from("stock_movements")
        .select("*, products(id, name, code)")
        .order("movement_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("products").select("id, name, code, stock_qty, cost_price").eq("is_active", true),
    ]);

    if (movRes.data) setMovements(movRes.data as StockMovement[]);
    if (prodRes.data) setProducts(prodRes.data as ProductOption[]);
    setLoading(false);
  }

  async function handleManualAdjustment(e: React.FormEvent) {
    e.preventDefault();
    if (!adjProductId) {
      alert("Please select a product to adjust.");
      return;
    }
    if (!adjReason.trim()) {
      alert("Please provide a reason for the physical stock adjustment.");
      return;
    }

    setSavingAdj(true);
    try {
      const { error } = await supabase.rpc("adjust_stock_manual", {
        p_product_id: adjProductId,
        p_new_stock: Number(adjNewStock),
        p_reason: adjReason.trim(),
      });

      if (error) {
        alert("Adjustment error: " + error.message);
      } else {
        setAdjModalOpen(false);
        setAdjProductId("");
        setAdjNewStock("");
        setAdjReason("");
        loadData();
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setSavingAdj(false);
    }
  }

  const filtered = movements.filter((m) => {
    if (selectedProduct !== "all" && m.product_id !== selectedProduct) return false;
    if (selectedType !== "all" && m.movement_type !== selectedType) return false;
    return true;
  });

  const TYPE_STYLES: Record<string, string> = {
    OPENING_STOCK: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300",
    PURCHASE: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30",
    SALE: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30",
    SALES_RETURN: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30",
    PURCHASE_RETURN: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30",
    ADJUSTMENT: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Audited Stock Movements Journal
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Immutable physical stock ledger capturing purchases, POS sales, returns, and audited adjustments
          </p>
        </div>
        <button
          onClick={() => {
            if (products.length > 0) {
              setAdjProductId(products[0].id);
              setAdjNewStock(String(products[0].stock_qty));
            }
            setAdjReason("");
            setAdjModalOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 dark:bg-white/10 dark:hover:bg-white/20"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Audited Stock Adjustment
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <select
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
          >
            <option value="all">All Products ({products.length})</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
        </div>

        <div className="w-full sm:w-64">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
          >
            <option value="all">All Movement Types</option>
            <option value="OPENING_STOCK">OPENING_STOCK</option>
            <option value="PURCHASE">PURCHASE (Restock)</option>
            <option value="SALE">SALE (POS Outflow)</option>
            <option value="SALES_RETURN">SALES_RETURN (Customer Restock)</option>
            <option value="PURCHASE_RETURN">PURCHASE_RETURN (Vendor Return)</option>
            <option value="ADJUSTMENT">ADJUSTMENT (Audit Correction)</option>
          </select>
        </div>
      </div>

      {/* Movements Table */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-slate-900">
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-400">Loading stock movements journal...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">No stock movement records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10 dark:text-slate-400">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4 text-right">Qty Change</th>
                  <th className="py-3 px-4 text-right">Unit Cost</th>
                  <th className="py-3 px-4 text-right">Stock After</th>
                  <th className="py-3 px-4">Remarks / Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filtered.map((m) => {
                  const isPositive = Number(m.qty_change) > 0;
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-600 dark:text-slate-400">
                        {m.movement_date}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {m.products?.name || "Product"}
                        </div>
                        <div className="text-xs font-mono text-slate-400">{m.products?.code}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                            TYPE_STYLES[m.movement_type] || TYPE_STYLES.OPENING_STOCK
                          }`}
                        >
                          {m.movement_type}
                        </span>
                      </td>
                      <td
                        className={`py-3.5 px-4 text-right font-bold ${
                          isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {isPositive ? `+${m.qty_change}` : m.qty_change}
                      </td>
                      <td className="py-3.5 px-4 text-right font-medium text-slate-700 dark:text-slate-300">
                        {inr(m.unit_cost)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900 dark:text-white">
                        {m.stock_after}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-500 max-w-xs truncate">
                        {m.remarks || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manual Stock Adjustment Modal */}
      {adjModalOpen && (
        <Modal
          as="form"
          onSubmit={handleManualAdjustment}
          onClose={() => setAdjModalOpen(false)}
          title="Audited Physical Stock Adjustment"
          subtitle="Record physical stock count corrections with required audit trail reason"
          icon="M12 6v6m0 0v6m0-6h6m-6 0H6"
          accent="amber"
          size="md"
          footer={
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setAdjModalOpen(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingAdj}
                className="rounded-xl bg-amber-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-60"
              >
                {savingAdj ? "Saving..." : "Apply Adjustment"}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Product *
              </label>
              <select
                value={adjProductId}
                onChange={(e) => {
                  setAdjProductId(e.target.value);
                  const p = products.find((x) => x.id === e.target.value);
                  if (p) setAdjNewStock(String(p.stock_qty));
                }}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-amber-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code}) — Current Physical Stock: {p.stock_qty}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Actual Verified Physical Stock Count *
              </label>
              <input
                type="number"
                min="0"
                step="any"
                required
                value={adjNewStock}
                onChange={(e) => setAdjNewStock(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-amber-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Mandatory Reason for Stock Adjustment *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Physical inventory count discrepancy, damaged packaging, shrinkage"
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-amber-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

