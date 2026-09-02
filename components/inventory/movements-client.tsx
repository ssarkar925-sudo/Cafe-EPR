"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import Modal from "@/components/ui/modal";
import {
  History,
  Boxes,
  ArrowUpRight,
  ArrowDownRight,
  FileSpreadsheet,
  Search,
  Filter,
  Scale,
  RefreshCw,
  ArrowLeft,
  X,
  Package,
} from "lucide-react";

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
  const searchParams = useSearchParams();

  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<string>(
    searchParams?.get("product") || "all"
  );
  const [selectedType, setSelectedType] = useState<string>("all");
  const [q, setQ] = useState("");

  // Manual Adjustment Modal
  const [adjModalOpen, setAdjModalOpen] = useState(false);
  const [adjProductId, setAdjProductId] = useState("");
  const [adjNewStock, setAdjNewStock] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [savingAdj, setSavingAdj] = useState(false);
  const [adjError, setAdjError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  // Update selectedProduct if searchParam changes
  useEffect(() => {
    const prodParam = searchParams?.get("product");
    if (prodParam) {
      setSelectedProduct(prodParam);
    }
  }, [searchParams]);

  async function loadData() {
    setLoading(true);
    const [movRes, prodRes] = await Promise.all([
      supabase
        .from("stock_movements")
        .select("*, products(id, name, code)")
        .order("movement_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("products")
        .select("id, name, code, stock_qty, cost_price")
        .eq("is_active", true),
    ]);

    if (movRes.data) setMovements(movRes.data as StockMovement[]);
    if (prodRes.data) setProducts(prodRes.data as ProductOption[]);
    setLoading(false);
  }

  async function handleManualAdjustment(e: React.FormEvent) {
    e.preventDefault();
    setAdjError("");
    if (!adjProductId) {
      setAdjError("Please select a product to adjust.");
      return;
    }
    if (isNaN(Number(adjNewStock)) || Number(adjNewStock) < 0) {
      setAdjError("Verified stock count must be a non-negative number.");
      return;
    }
    if (!adjReason.trim()) {
      setAdjError("Please provide a mandatory reason for the physical stock adjustment.");
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
        setAdjError("Adjustment error: " + error.message);
      } else {
        setAdjModalOpen(false);
        setAdjProductId("");
        setAdjNewStock("");
        setAdjReason("");
        await loadData();
      }
    } catch (err: any) {
      setAdjError("Error: " + err.message);
    } finally {
      setSavingAdj(false);
    }
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return movements.filter((m) => {
      if (selectedProduct !== "all" && m.product_id !== selectedProduct) return false;
      if (selectedType !== "all" && m.movement_type !== selectedType) return false;
      if (needle) {
        const prodName = (m.products?.name ?? "").toLowerCase();
        const prodCode = (m.products?.code ?? "").toLowerCase();
        const remarks = (m.remarks ?? "").toLowerCase();
        if (!prodName.includes(needle) && !prodCode.includes(needle) && !remarks.includes(needle)) {
          return false;
        }
      }
      return true;
    });
  }, [movements, selectedProduct, selectedType, q]);

  // Movement Metrics
  const stats = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    for (const m of filtered) {
      const qVal = Number(m.qty_change ?? 0);
      if (qVal > 0) inflow += qVal;
      else outflow += Math.abs(qVal);
    }
    return {
      totalRecords: filtered.length,
      inflow,
      outflow,
      netChange: inflow - outflow,
    };
  }, [filtered]);

  function exportCsv() {
    const headers = [
      "Date",
      "Product Name",
      "Product Code",
      "Movement Type",
      "Quantity Change",
      "Unit Cost",
      "Stock After",
      "Remarks",
      "Reference Type",
      "Reference ID",
    ];
    const rows = filtered.map((m) => [
      m.movement_date,
      m.products?.name ?? "-",
      m.products?.code ?? "-",
      m.movement_type,
      m.qty_change,
      m.unit_cost,
      m.stock_after,
      m.remarks ?? "",
      m.ref_type ?? "",
      m.ref_id ?? "",
    ]);
    const csvContent = [
      headers.join(","),
      ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `stock-movements-journal-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  }

  const TYPE_STYLES: Record<string, string> = {
    OPENING_STOCK: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300",
    PURCHASE: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40",
    SALE: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/40",
    SALES_RETURN: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40",
    PURCHASE_RETURN: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800/40",
    ADJUSTMENT: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40",
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/inventory"
              className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Inventory Control
            </Link>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
              <History className="h-3.5 w-3.5" />
              AUDIT LEDGER
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Stock Movements Journal
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
            Immutable physical stock ledger capturing supplier purchases, counter sales, returns, and audited corrections.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            Export Journal CSV
          </button>
          <button
            onClick={() => {
              if (products.length > 0) {
                setAdjProductId(selectedProduct !== "all" ? selectedProduct : products[0].id);
                const p = products.find((x) => x.id === (selectedProduct !== "all" ? selectedProduct : products[0].id));
                if (p) setAdjNewStock(String(p.stock_qty));
              }
              setAdjReason("");
              setAdjError("");
              setAdjModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-amber-700"
          >
            <Scale className="h-3.5 w-3.5" />
            Audited Stock Adjustment
          </button>
        </div>
      </div>

      {/* Journal Metrics Bar */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-slate-900">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Journal Entries</span>
          <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{stats.totalRecords}</p>
          <p className="mt-0.5 text-xs text-slate-400">Filtered movement events</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-slate-900">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Total Inflow (+)</span>
          <p className="mt-1 text-2xl font-black text-emerald-700 dark:text-emerald-300">+{stats.inflow.toLocaleString()}</p>
          <p className="mt-0.5 text-xs text-slate-400">Purchases, opening & returns</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-slate-900">
          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Total Outflow (-)</span>
          <p className="mt-1 text-2xl font-black text-rose-700 dark:text-rose-300">-{stats.outflow.toLocaleString()}</p>
          <p className="mt-0.5 text-xs text-slate-400">POS sales & return to vendor</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-slate-900">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Net Movement</span>
          <p className={`mt-1 text-2xl font-black ${stats.netChange >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {stats.netChange >= 0 ? `+${stats.netChange}` : stats.netChange}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">Net physical change</p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-slate-900 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by product name, code, or remarks..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-medium outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-slate-800 dark:text-white"
          />
        </div>

        {/* Product Filter */}
        <div className="w-full sm:w-64">
          <select
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none transition focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
          >
            <option value="all">All Products ({products.length})</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code || "No SKU"})
              </option>
            ))}
          </select>
        </div>

        {/* Movement Type Filter */}
        <div className="w-full sm:w-56">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none transition focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
          >
            <option value="all">All Movement Types</option>
            <option value="OPENING_STOCK">OPENING_STOCK (Initial)</option>
            <option value="PURCHASE">PURCHASE (Restock)</option>
            <option value="SALE">SALE (POS Outflow)</option>
            <option value="SALES_RETURN">SALES_RETURN (Customer Restock)</option>
            <option value="PURCHASE_RETURN">PURCHASE_RETURN (Vendor Return)</option>
            <option value="ADJUSTMENT">ADJUSTMENT (Audit Correction)</option>
          </select>
        </div>

        {(selectedProduct !== "all" || selectedType !== "all" || q) && (
          <button
            onClick={() => {
              setSelectedProduct("all");
              setSelectedType("all");
              setQ("");
            }}
            className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300"
          >
            <X className="h-3 w-3" />
            Reset
          </button>
        )}
      </div>

      {/* Movements Journal Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-white/10 dark:bg-slate-900">
        {loading ? (
          <div className="py-14 text-center text-xs text-slate-400">Loading stock movements journal...</div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-white/5">
              <History className="h-6 w-6" />
            </div>
            <p className="font-bold text-slate-800 dark:text-white">No stock movement records found</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Try adjusting your search criteria or movement type filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/75 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider">Date & Time</th>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider">Product</th>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider">Movement Type</th>
                  <th className="px-4 py-3 text-right font-bold uppercase tracking-wider">Qty Change</th>
                  <th className="px-4 py-3 text-right font-bold uppercase tracking-wider">Unit Cost</th>
                  <th className="px-4 py-3 text-right font-bold uppercase tracking-wider">Stock After</th>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider">Remarks / Audit Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filtered.map((m) => {
                  const isPositive = Number(m.qty_change) > 0;
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/75 dark:hover:bg-white/5 transition">
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-600 dark:text-slate-400 font-mono">
                        {m.movement_date}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {m.products?.name || "Product"}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">
                          {m.products?.code || "No SKU"}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            TYPE_STYLES[m.movement_type] || TYPE_STYLES.OPENING_STOCK
                          }`}
                        >
                          {m.movement_type}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-3.5 text-right font-mono text-sm font-black whitespace-nowrap ${
                          isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        <span className="inline-flex items-center gap-0.5">
                          {isPositive ? <ArrowUpRight className="h-3.5 w-3.5 inline" /> : <ArrowDownRight className="h-3.5 w-3.5 inline" />}
                          {isPositive ? `+${m.qty_change}` : m.qty_change}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-medium text-slate-600 dark:text-slate-400">
                        {inr(m.unit_cost)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-black text-slate-900 dark:text-white">
                        {m.stock_after}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500 max-w-sm truncate">
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
          title="Audited Stock Adjustment"
          subtitle="Record physical stock count corrections with required audit trail reason"
          icon="M12 6v6m0 0v6m0-6h6m-6 0H6"
          accent="amber"
          size="md"
          footer={
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setAdjModalOpen(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingAdj}
                className="rounded-xl bg-amber-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-700 disabled:opacity-60"
              >
                {savingAdj ? "Applying..." : "Apply Adjustment"}
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
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold outline-none focus:border-amber-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
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
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-medium outline-none focus:border-amber-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Mandatory Audit Reason *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Physical inventory count discrepancy, damaged goods removal, shrinkage"
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-medium outline-none focus:border-amber-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
              />
            </div>

            {adjError && (
              <div className="rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                {adjError}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
