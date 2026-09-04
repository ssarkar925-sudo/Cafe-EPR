"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/lib/supabase/realtime";
import { logAudit } from "@/lib/audit";
import { inr } from "@/lib/format";
import SearchableSelect from "@/components/ui/searchable-select";
import Modal from "@/components/ui/modal";
import {
  Boxes,
  Package,
  AlertTriangle,
  TrendingUp,
  Search,
  Filter,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  History,
  FileSpreadsheet,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Tag,
  Scale,
  DollarSign,
  Layers,
  Sparkles,
  RefreshCw,
  X,
} from "lucide-react";

export type InventoryProduct = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  unit: string;
  category_id: string | null;
  sale_price: number | string;
  cost_price: number | string;
  stock_qty: number | string;
  reorder_level: number | string;
  is_active: boolean;
  categories: { id?: string; name: string } | null;
};

export type CategoryOption = {
  id: string;
  name: string;
  is_active: boolean;
};

type StockStatusFilter = "all" | "low_stock" | "out_of_stock" | "healthy" | "inactive";

// ─── Audited Stock Adjustment Modal ───────────────────────────────────────────
function StockAdjustmentModal({
  product,
  onClose,
  onAdjusted,
}: {
  product: InventoryProduct;
  onClose: () => void;
  onAdjusted: (productId: string, newStock: number) => void;
}) {
  const [newStock, setNewStock] = useState(String(product.stock_qty ?? 0));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();

  const currentStock = Number(product.stock_qty ?? 0);
  const targetStock = Number(newStock);
  const diff = isNaN(targetStock) ? 0 : targetStock - currentStock;

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (isNaN(targetStock) || targetStock < 0) {
      setError("Verified stock count must be a non-negative number.");
      return;
    }
    if (!reason.trim()) {
      setError("A mandatory audit reason is required for every stock adjustment.");
      return;
    }
    setSaving(true);
    const { data, error: rpcError } = await supabase.rpc("adjust_stock_manual", {
      p_product_id: product.id,
      p_new_stock: targetStock,
      p_reason: reason.trim(),
    });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    logAudit({
      action: "stock_adjustment",
      entity: "product",
      entity_id: product.id,
      description: `Physical stock adjusted for ${product.name}: ${currentStock} → ${targetStock} (${diff >= 0 ? "+" : ""}${diff} ${product.unit}). Reason: ${reason.trim()}`,
      details: data as Record<string, unknown>,
    });
    onAdjusted(product.id, targetStock);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4 dark:border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
                <Scale className="h-4 w-4" />
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Audited Stock Adjustment</h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {product.name} {product.code ? <span className="font-mono text-slate-400 font-semibold">({product.code})</span> : null}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleApply} className="px-6 py-5 space-y-4">
          {/* Current Stock */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Current Physical Stock (Ledger)
            </label>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm dark:border-white/10 dark:bg-slate-800/60">
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <Package className="h-4 w-4 text-slate-400" />
                <span className="font-bold text-slate-900 dark:text-white">{currentStock}</span>
                <span className="text-xs text-slate-400">{product.unit}</span>
              </div>
              <span className="text-xs font-medium text-slate-400">Unit Cost: {inr(product.cost_price)}</span>
            </div>
          </div>

          {/* Verified Count */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Actual Verified Physical Stock Count *
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="any"
                min="0"
                required
                value={newStock}
                onChange={(e) => setNewStock(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-black outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-white"
                placeholder="Enter verified physical count"
              />
              <div className="flex items-center gap-1 shrink-0">
                {[-5, -1, 1, 5].map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => {
                      const base = isNaN(targetStock) ? currentStock : targetStock;
                      const updated = Math.max(0, base + delta);
                      setNewStock(String(updated));
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-xs font-black text-slate-700 hover:bg-slate-100 active:scale-90 transition-all dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </button>
                ))}
              </div>
            </div>
            {!isNaN(targetStock) && targetStock !== currentStock && (
              <div className={`mt-2 flex items-center gap-1.5 text-xs font-bold ${diff > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {diff > 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                <span>
                  {diff > 0 ? "Inventory IN" : "Inventory OUT"}: {Math.abs(diff)} {product.unit} ({diff > 0 ? "+" : ""}{diff})
                </span>
                <span className="text-slate-400 font-normal">
                  — Valuation impact: {inr(Math.abs(diff) * Number(product.cost_price ?? 0))}
                </span>
              </div>
            )}
          </div>

          {/* Reason & Quick Chips */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Mandatory Audit Reason *
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {[
                "Physical Audit Count",
                "Damaged / Broken",
                "Expired Goods",
                "Supplier Return",
                "Surplus Found",
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setReason(chip)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all active:scale-95 ${
                    reason === chip
                      ? "bg-amber-600 text-white shadow-xs font-black"
                      : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>
            <textarea
              required
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Select preset above or type specific audit explanation..."
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-white"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              This adjustment will be permanently logged in the Immutable Stock Movements Journal.
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-400">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || isNaN(targetStock) || targetStock < 0 || !reason.trim()}
              className="btn-3d-tactile-primary rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 px-5 py-2 text-sm font-black text-white shadow-md shadow-amber-600/20 hover:brightness-110 active:scale-95 disabled:opacity-60"
            >
              {saving ? "Posting to Journal..." : "Apply Adjustment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Inventory Client ───────────────────────────────────────────────────
export default function InventoryClient({
  initialProducts,
  categories,
}: {
  initialProducts: InventoryProduct[];
  categories: CategoryOption[];
}) {
  useRealtime(["products", "stock_movements", "categories"]);
  const searchParams = useSearchParams();

  const [products, setProducts] = useState<InventoryProduct[]>(initialProducts);
  const [q, setQ] = useState(searchParams?.get("q") || "");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StockStatusFilter>(
    (searchParams?.get("status") as StockStatusFilter) || "all"
  );
  const [sortBy, setSortBy] = useState<"stock_asc" | "stock_desc" | "value_desc" | "name_asc" | "reorder_urgency">("reorder_urgency");
  const [adjustingProduct, setAdjustingProduct] = useState<InventoryProduct | null>(null);
  const [detailProduct, setDetailProduct] = useState<InventoryProduct | null>(null);

  // Sync initialProducts if prop updates
  useEffect(() => {
    setProducts(initialProducts);
  }, [initialProducts]);

  // Handle stock adjustment update in state
  function handleStockAdjusted(productId: string, newStock: number) {
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, stock_qty: newStock } : p))
    );
  }

  // Calculate Operational Metrics
  const metrics = useMemo(() => {
    let totalItems = products.length;
    let activeItems = 0;
    let totalUnits = 0;
    let totalCostValuation = 0;
    let totalRetailValuation = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let healthyCount = 0;

    for (const p of products) {
      if (!p.is_active) continue;
      activeItems++;
      const qty = Number(p.stock_qty ?? 0);
      const reorder = Number(p.reorder_level ?? 0);
      const cost = Number(p.cost_price ?? 0);
      const sale = Number(p.sale_price ?? 0);

      totalUnits += qty;
      if (qty > 0) {
        totalCostValuation += qty * cost;
        totalRetailValuation += qty * sale;
      }

      if (qty <= 0) {
        outOfStockCount++;
      } else if (qty <= reorder) {
        lowStockCount++;
      } else {
        healthyCount++;
      }
    }

    const potentialGrossProfit = Math.max(0, totalRetailValuation - totalCostValuation);
    const avgMarginPercent = totalRetailValuation > 0 ? (potentialGrossProfit / totalRetailValuation) * 100 : 0;

    return {
      totalItems,
      activeItems,
      totalUnits,
      totalCostValuation,
      totalRetailValuation,
      potentialGrossProfit,
      avgMarginPercent,
      lowStockCount,
      outOfStockCount,
      healthyCount,
    };
  }, [products]);

  // Filter and Sort Products
  const filteredProducts = useMemo(() => {
    const needle = q.trim().toLowerCase();

    const list = products.filter((p) => {
      // Category filter
      if (selectedCategory !== "all" && p.category_id !== selectedCategory) {
        return false;
      }

      const qty = Number(p.stock_qty ?? 0);
      const reorder = Number(p.reorder_level ?? 0);

      // Status filter
      if (statusFilter === "inactive" && p.is_active) return false;
      if (statusFilter !== "inactive" && !p.is_active) return false;

      if (statusFilter === "out_of_stock" && qty > 0) return false;
      if (statusFilter === "low_stock" && (qty <= 0 || qty > reorder)) return false;
      if (statusFilter === "healthy" && (qty <= reorder || qty <= 0)) return false;

      // Text search
      if (needle) {
        const nameMatch = p.name.toLowerCase().includes(needle);
        const codeMatch = (p.code ?? "").toLowerCase().includes(needle);
        const catMatch = (p.categories?.name ?? "").toLowerCase().includes(needle);
        if (!nameMatch && !codeMatch && !catMatch) return false;
      }

      return true;
    });

    // Sorting
    return list.sort((a, b) => {
      const aQty = Number(a.stock_qty ?? 0);
      const bQty = Number(b.stock_qty ?? 0);
      const aReorder = Number(a.reorder_level ?? 0);
      const bReorder = Number(b.reorder_level ?? 0);
      const aCost = Number(a.cost_price ?? 0);
      const bCost = Number(b.cost_price ?? 0);

      if (sortBy === "reorder_urgency") {
        // Priority: Out of stock first, then low stock by deficit, then healthy
        const aDeficit = aReorder - aQty;
        const bDeficit = bReorder - bQty;
        return bDeficit - aDeficit;
      }
      if (sortBy === "stock_asc") return aQty - bQty;
      if (sortBy === "stock_desc") return bQty - aQty;
      if (sortBy === "value_desc") return bQty * bCost - aQty * aCost;
      if (sortBy === "name_asc") return a.name.localeCompare(b.name);
      return 0;
    });
  }, [products, q, selectedCategory, statusFilter, sortBy]);

  // Export Inventory CSV
  function exportInventoryCsv() {
    const headers = [
      "Product Name",
      "Item Code / SKU",
      "Category",
      "Unit",
      "Stock on Hand",
      "Reorder Level",
      "Stock Status",
      "Unit Cost Price",
      "Unit Sale Price",
      "Total Stock Value (Cost)",
      "Total Potential Value (Sale)",
    ];

    const rows = filteredProducts.map((p) => {
      const qty = Number(p.stock_qty ?? 0);
      const reorder = Number(p.reorder_level ?? 0);
      const cost = Number(p.cost_price ?? 0);
      const sale = Number(p.sale_price ?? 0);
      let statusStr = "Healthy";
      if (!p.is_active) statusStr = "Inactive";
      else if (qty <= 0) statusStr = "Out of Stock";
      else if (qty <= reorder) statusStr = "Low Stock";

      return [
        p.name,
        p.code ?? "",
        p.categories?.name ?? "Uncategorized",
        p.unit,
        qty,
        reorder,
        statusStr,
        cost,
        sale,
        qty * cost,
        qty * sale,
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `inventory-valuation-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  }

  // Export Low Stock Reorder PO
  function exportReorderPo() {
    const lowItems = products.filter(
      (p) => p.is_active && Number(p.stock_qty ?? 0) <= Number(p.reorder_level ?? 0)
    );
    if (!lowItems.length) {
      alert("All active products have healthy stock levels. No reorder needed!");
      return;
    }

    const headers = [
      "Item Code",
      "Product Name",
      "Category",
      "Current Stock",
      "Reorder Min Level",
      "Suggested Order Qty",
      "Est. Unit Cost",
      "Est. Total Cost",
    ];

    const rows = lowItems.map((p) => {
      const cur = Number(p.stock_qty ?? 0);
      const reorder = Number(p.reorder_level ?? 0);
      const orderQty = Math.max(10, reorder * 2 - cur);
      const cost = Number(p.cost_price ?? 0);
      return [
        p.code ?? "-",
        p.name,
        p.categories?.name ?? "-",
        cur,
        reorder,
        orderQty,
        cost,
        orderQty * cost,
      ];
    });

    const csv = [
      headers.join(","),
      ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `purchase-order-draft-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Module Distinction */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              <Boxes className="h-3.5 w-3.5" />
              OPERATIONAL INVENTORY
            </span>
            <span className="text-xs text-slate-400">· Physical Stock on Hand</span>
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Inventory & Stock Control
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
            Live stock balances, inventory valuation, replenishment watch, and audited physical adjustments.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/inventory/movements"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
          >
            <History className="h-3.5 w-3.5 text-indigo-500" />
            Stock Journal
          </Link>
          <button
            onClick={exportInventoryCsv}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
            title="Download complete stock valuation sheet"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            Export CSV
          </button>
          {metrics.lowStockCount + metrics.outOfStockCount > 0 && (
            <button
              onClick={exportReorderPo}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-800 shadow-xs transition hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              Reorder PO ({metrics.lowStockCount + metrics.outOfStockCount})
            </button>
          )}
          <Link
            href="/catalog/products"
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-slate-800 dark:bg-white dark:text-slate-900"
          >
            <span>Product Master</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Operational KPI Metric Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Total Cost Valuation */}
        <div className="card-glow-emerald relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.07] via-white to-white p-5 shadow-xs transition hover:shadow-md dark:border-emerald-500/30 dark:from-emerald-950/25 dark:via-slate-900 dark:to-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Stock Valuation (Cost)</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
            {inr(metrics.totalCostValuation)}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Retail value: {inr(metrics.totalRetailValuation)}</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">+{metrics.avgMarginPercent.toFixed(1)}% margin</span>
          </div>
        </div>

        {/* Physical Units on Hand */}
        <div className="card-glow-indigo relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.07] via-white to-white p-5 shadow-xs transition hover:shadow-md dark:border-indigo-500/30 dark:from-indigo-950/25 dark:via-slate-900 dark:to-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Physical Units</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400">
              <Package className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
            {metrics.totalUnits.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Across {metrics.activeItems} active catalog products
          </div>
        </div>

        {/* Replenishment Watch */}
        <div
          onClick={() => setStatusFilter(statusFilter === "low_stock" ? "all" : "low_stock")}
          className={`card-glow-amber group relative cursor-pointer overflow-hidden rounded-2xl border p-5 shadow-xs transition-all hover:shadow-md active:scale-[0.99] ${
            statusFilter === "low_stock"
              ? "border-amber-500 bg-amber-50/70 ring-2 ring-amber-500/20 dark:border-amber-500/60 dark:bg-amber-950/40"
              : "border-amber-500/20 bg-gradient-to-br from-amber-500/[0.06] via-white to-white hover:border-amber-400 dark:border-amber-500/30 dark:from-amber-950/20 dark:via-slate-900 dark:to-slate-900"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Low Stock Alert</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-amber-700 dark:text-amber-300">
            {metrics.lowStockCount} items
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            At or below minimum reorder levels
          </div>
        </div>

        {/* Out of Stock */}
        <div
          onClick={() => setStatusFilter(statusFilter === "out_of_stock" ? "all" : "out_of_stock")}
          className={`card-glow-rose group relative cursor-pointer overflow-hidden rounded-2xl border p-5 shadow-xs transition-all hover:shadow-md active:scale-[0.99] ${
            statusFilter === "out_of_stock"
              ? "border-rose-500 bg-rose-50/70 ring-2 ring-rose-500/20 dark:border-rose-500/60 dark:bg-rose-950/40"
              : "border-rose-500/20 bg-gradient-to-br from-rose-500/[0.06] via-white to-white hover:border-rose-400 dark:border-rose-500/30 dark:from-rose-950/20 dark:via-slate-900 dark:to-slate-900"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Out of Stock</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
              <AlertCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-rose-700 dark:text-rose-300">
            {metrics.outOfStockCount} items
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            0 units remaining · Sales blocked
          </div>
        </div>
      </div>

      {/* Search, Filters, and Sorting Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by product name, SKU / barcode, category..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-medium outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-800 dark:text-white"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Category Dropdown Filter */}
          <div className="w-52">
            <SearchableSelect
              value={selectedCategory}
              onChange={setSelectedCategory}
              options={[
                { value: "all", label: "All Categories" },
                ...categories
                  .filter((c) => c.is_active)
                  .map((c) => ({ value: c.id, label: c.name })),
              ]}
              searchPlaceholder="Filter category..."
            />
          </div>

          {/* Sort By Dropdown */}
          <div className="w-48">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none transition focus:border-blue-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
            >
              <option value="reorder_urgency">Sort: Reorder Urgency</option>
              <option value="stock_asc">Sort: Lowest Stock First</option>
              <option value="stock_desc">Sort: Highest Stock First</option>
              <option value="value_desc">Sort: Highest Value (Cost)</option>
              <option value="name_asc">Sort: Name (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-white/5">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "all", label: "All Active", count: metrics.activeItems },
              { id: "low_stock", label: "Low Stock", count: metrics.lowStockCount, tone: "amber" },
              { id: "out_of_stock", label: "Out of Stock", count: metrics.outOfStockCount, tone: "rose" },
              { id: "healthy", label: "Healthy Stock", count: metrics.healthyCount, tone: "emerald" },
              { id: "inactive", label: "Inactive", count: metrics.totalItems - metrics.activeItems },
            ].map((tab) => {
              const active = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id as StockStatusFilter)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    active
                      ? "bg-slate-900 text-white shadow-xs dark:bg-white dark:text-slate-900"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`rounded-md px-1.5 py-0.2 text-[10px] font-black ${
                      active
                        ? "bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900"
                        : "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-300"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="text-xs text-slate-400 font-medium">
            Showing <span className="font-bold text-slate-700 dark:text-slate-200">{filteredProducts.length}</span> of {products.length} products
          </div>
        </div>
      </div>

      {/* Stock Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50/75 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-bold uppercase tracking-wider">Product & Code</th>
                <th className="px-4 py-3 font-bold uppercase tracking-wider">Category</th>
                <th className="px-4 py-3 text-right font-bold uppercase tracking-wider">On Hand Qty</th>
                <th className="px-4 py-3 text-right font-bold uppercase tracking-wider">Reorder Min</th>
                <th className="px-4 py-3 text-right font-bold uppercase tracking-wider">Unit Cost</th>
                <th className="px-4 py-3 text-right font-bold uppercase tracking-wider">Total Value (Cost)</th>
                <th className="px-4 py-3 text-center font-bold uppercase tracking-wider">Stock Status</th>
                <th className="px-4 py-3 text-right font-bold uppercase tracking-wider">Operational Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filteredProducts.map((p) => {
                const qty = Number(p.stock_qty ?? 0);
                const reorder = Number(p.reorder_level ?? 0);
                const cost = Number(p.cost_price ?? 0);
                const sale = Number(p.sale_price ?? 0);
                const totalVal = qty * cost;

                let statusBadge = (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/60 dark:text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" /> Healthy
                  </span>
                );

                if (!p.is_active) {
                  statusBadge = (
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-500 dark:border-white/10 dark:bg-white/10 dark:text-slate-400">
                      Inactive
                    </span>
                  );
                } else if (qty <= 0) {
                  statusBadge = (
                    <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 shadow-xs dark:border-rose-500/40 dark:bg-rose-950/60 dark:text-rose-300">
                      <AlertCircle className="h-3 w-3" /> Out of Stock
                    </span>
                  );
                } else if (qty <= reorder) {
                  statusBadge = (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 shadow-xs dark:border-amber-500/40 dark:bg-amber-950/60 dark:text-amber-300">
                      <AlertTriangle className="h-3 w-3" /> Low Stock
                    </span>
                  );
                }

                return (
                  <tr
                    key={p.id}
                    className="hover:bg-slate-50/75 dark:hover:bg-white/5 transition"
                  >
                    {/* Product Name & SKU */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-black text-slate-700 dark:bg-white/10 dark:text-slate-200">
                          {p.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <button
                            onClick={() => setDetailProduct(p)}
                            className="text-left font-bold text-slate-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400 truncate max-w-xs block"
                          >
                            {p.name}
                          </button>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400">
                            <span className="font-mono font-semibold">{p.code || "No SKU"}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="px-4 py-3.5">
                      {p.categories?.name ? (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                          {p.categories.name}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* On Hand Qty */}
                    <td className="px-4 py-3.5 text-right font-mono">
                      <span
                        className={`text-sm font-black ${
                          qty <= 0
                            ? "text-rose-600 dark:text-rose-400"
                            : qty <= reorder
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-slate-900 dark:text-white"
                        }`}
                      >
                        {qty}
                      </span>
                      <span className="ml-1 text-[11px] font-sans text-slate-400">{p.unit}</span>
                    </td>

                    {/* Reorder Min */}
                    <td className="px-4 py-3.5 text-right font-mono text-slate-500 dark:text-slate-400">
                      {reorder} {p.unit}
                    </td>

                    {/* Unit Cost */}
                    <td className="px-4 py-3.5 text-right font-medium text-slate-600 dark:text-slate-400">
                      {inr(cost)}
                    </td>

                    {/* Total Value (Cost) */}
                    <td className="px-4 py-3.5 text-right font-bold text-slate-900 dark:text-white">
                      {inr(totalVal)}
                    </td>

                    {/* Status Badge */}
                    <td className="px-4 py-3.5 text-center whitespace-nowrap">
                      {statusBadge}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Adjust Stock Button (RPC) */}
                        <button
                          onClick={() => setAdjustingProduct(p)}
                          className="inline-flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 shadow-xs transition hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300"
                          title="Record audited physical stock adjustment"
                        >
                          <Scale className="h-3 w-3" />
                          Adjust
                        </button>

                        {/* Direct Stock Movements Journal link */}
                        <Link
                          href={`/inventory/movements?product=${p.id}`}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
                          title="View complete stock movement audit trail for this product"
                        >
                          <History className="h-3 w-3 text-indigo-500" />
                          Journal
                        </Link>

                        {/* Product Master Link */}
                        <Link
                          href={`/catalog/products?q=${encodeURIComponent(p.name)}`}
                          className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white transition"
                          title="View in Product Master Catalog"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-14 text-center">
                    <div className="mx-auto max-w-sm">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-white/5">
                        <Boxes className="h-6 w-6" />
                      </div>
                      <p className="font-bold text-slate-800 dark:text-white">No inventory items matched</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Try resetting your search query, status filters, or category selection.
                      </p>
                      <button
                        onClick={() => {
                          setQ("");
                          setSelectedCategory("all");
                          setStatusFilter("all");
                        }}
                        className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 dark:bg-white dark:text-slate-900"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Reset Filters
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock Item Quick Detail Modal */}
      {detailProduct && (
        <Modal
          onClose={() => setDetailProduct(null)}
          title={detailProduct.name}
          subtitle={`SKU: ${detailProduct.code || "None"} · Unit: ${detailProduct.unit}`}
          size="md"
          accent="indigo"
          icon="M20 7 12 3 4 7v10l8 4 8-4V7ZM12 3v18M4 7l8 4 8-4M4 17l8-4 8 4"
          footer={
            <div className="flex items-center justify-between w-full">
              <Link
                href={`/inventory/movements?product=${detailProduct.id}`}
                className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline dark:text-indigo-400"
              >
                <History className="h-3.5 w-3.5" /> View Stock Journal History →
              </Link>
              <div className="flex gap-2">
                <button
                  onClick={() => setDetailProduct(null)}
                  className="rounded-xl border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    const p = detailProduct;
                    setDetailProduct(null);
                    setAdjustingProduct(p);
                  }}
                  className="rounded-xl bg-amber-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-700"
                >
                  Adjust Stock
                </button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-slate-800/60">
                <span className="text-[11px] font-bold text-slate-400 uppercase">On Hand Qty</span>
                <p className="mt-1 text-xl font-black text-slate-900 dark:text-white">
                  {detailProduct.stock_qty} {detailProduct.unit}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-slate-800/60">
                <span className="text-[11px] font-bold text-slate-400 uppercase">Reorder Min</span>
                <p className="mt-1 text-xl font-black text-slate-900 dark:text-white">
                  {detailProduct.reorder_level} {detailProduct.unit}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Cost Price</span>
                <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-200">
                  {inr(detailProduct.cost_price)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Selling Price</span>
                <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-200">
                  {inr(detailProduct.sale_price)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Stock Valuation</span>
                <p className="mt-1 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {inr(Number(detailProduct.stock_qty ?? 0) * Number(detailProduct.cost_price ?? 0))}
                </p>
              </div>
            </div>

            {detailProduct.description && (
              <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">
                <span className="font-bold block mb-1">Description / Notes:</span>
                {detailProduct.description}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Audited Stock Adjustment Modal */}
      {adjustingProduct && (
        <StockAdjustmentModal
          product={adjustingProduct}
          onClose={() => setAdjustingProduct(null)}
          onAdjusted={handleStockAdjusted}
        />
      )}
    </div>
  );
}
