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

  const TYPE_STYLES: Record<string, { bg: string; dot: string; text: string }> = {
    OPENING_STOCK: {
      bg: "bg-slate-100 text-slate-700 ring-1 ring-slate-500/20 dark:bg-white/10 dark:text-slate-300 dark:ring-white/10",
      dot: "bg-slate-500",
      text: "OPENING",
    },
    PURCHASE: {
      bg: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/20 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-500/30",
      dot: "bg-emerald-500",
      text: "PURCHASE",
    },
    SALE: {
      bg: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500/20 dark:bg-indigo-950/60 dark:text-indigo-300 dark:ring-indigo-500/30",
      dot: "bg-indigo-500",
      text: "POS SALE",
    },
    SALES_RETURN: {
      bg: "bg-blue-50 text-blue-700 ring-1 ring-blue-500/20 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-500/30",
      dot: "bg-blue-500",
      text: "CUSTOMER RETURN",
    },
    PURCHASE_RETURN: {
      bg: "bg-rose-50 text-rose-700 ring-1 ring-rose-500/20 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-500/30",
      dot: "bg-rose-500",
      text: "VENDOR RETURN",
    },
    ADJUSTMENT: {
      bg: "bg-amber-50 text-amber-700 ring-1 ring-amber-500/20 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-500/30",
      dot: "bg-amber-500",
      text: "AUDIT CORRECTION",
    },
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="card-glow-indigo relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.04] via-white to-white p-6 shadow-xs transition-all duration-200 hover:shadow-md dark:border-indigo-500/30 dark:from-indigo-950/25 dark:via-slate-900 dark:to-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Link
                href="/inventory"
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white transition active:scale-95 duration-150"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Inventory Control
              </Link>
              <span className="text-slate-300 dark:text-slate-700">/</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700 ring-1 ring-indigo-500/20 dark:bg-indigo-950/60 dark:text-indigo-300 dark:ring-indigo-500/30">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                <History className="h-3.5 w-3.5" />
                STOCK MOVEMENTS JOURNAL
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
              className="btn-3d-tactile-secondary inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 active:scale-95 duration-150 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
              <span>Export Journal CSV</span>
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
              className="btn-3d-tactile-primary inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 px-4 py-2 text-xs font-black text-white shadow-md shadow-amber-600/20 transition hover:brightness-110 active:scale-95 duration-150"
            >
              <Scale className="h-3.5 w-3.5" />
              <span>Audited Stock Adjustment</span>
            </button>
          </div>
        </div>
      </div>

      {/* Journal Metrics Bar */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Total Records */}
        <div className="card-glow-indigo relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.06] via-white to-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-indigo-500/30 dark:from-indigo-950/25 dark:via-slate-900 dark:to-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Journal Entries</span>
            <div className="icon-box-3d flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-xs">
              <History className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 font-mono text-2xl font-black tracking-tight tabular-nums text-slate-900 dark:text-white">{stats.totalRecords}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">Filtered movement events</p>
        </div>

        {/* Total Inflow */}
        <div className="card-glow-emerald relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.06] via-white to-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-emerald-500/30 dark:from-emerald-950/25 dark:via-slate-900 dark:to-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Total Inflow (+)</span>
            <div className="icon-box-3d flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xs">
              <ArrowUpRight className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 font-mono text-2xl font-black tracking-tight tabular-nums text-emerald-700 dark:text-emerald-300">+{stats.inflow.toLocaleString()}</p>
          <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-400 font-medium">Purchases, opening & returns</p>
        </div>

        {/* Total Outflow */}
        <div className="card-glow-rose relative overflow-hidden rounded-2xl border border-rose-500/20 bg-gradient-to-br from-rose-500/[0.06] via-white to-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-rose-500/30 dark:from-rose-950/25 dark:via-slate-900 dark:to-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">Total Outflow (-)</span>
            <div className="icon-box-3d flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-xs">
              <ArrowDownRight className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 font-mono text-2xl font-black tracking-tight tabular-nums text-rose-700 dark:text-rose-300">-{stats.outflow.toLocaleString()}</p>
          <p className="mt-1 text-xs text-rose-600/80 dark:text-rose-400 font-medium">POS sales & vendor returns</p>
        </div>

        {/* Net Movement */}
        <div className="card-glow-cyan relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.06] via-white to-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-cyan-500/30 dark:from-cyan-950/25 dark:via-slate-900 dark:to-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-cyan-600 dark:text-cyan-400">Net Physical Delta</span>
            <div className="icon-box-3d flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-xs">
              <Boxes className="h-4 w-4" />
            </div>
          </div>
          <p className={`mt-2 font-mono text-2xl font-black tracking-tight tabular-nums ${stats.netChange >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {stats.netChange >= 0 ? `+${stats.netChange}` : stats.netChange}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">Net inventory delta</p>
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
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-medium outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-white"
          />
        </div>

        {/* Product Filter */}
        <div className="w-full sm:w-64">
          <select
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-white"
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
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-white"
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
            className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 active:scale-95 duration-150 transition dark:bg-white/10 dark:text-slate-300"
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
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                            (TYPE_STYLES[m.movement_type] || TYPE_STYLES.OPENING_STOCK).bg
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              (TYPE_STYLES[m.movement_type] || TYPE_STYLES.OPENING_STOCK).dot
                            } animate-pulse`}
                          />
                          {(TYPE_STYLES[m.movement_type] || TYPE_STYLES.OPENING_STOCK).text}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs font-black ${
                            isPositive
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/20 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-500/30"
                              : "bg-rose-50 text-rose-700 ring-1 ring-rose-500/20 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-500/30"
                          }`}
                        >
                          {isPositive ? <ArrowUpRight className="h-3 w-3 inline" /> : <ArrowDownRight className="h-3 w-3 inline" />}
                          {isPositive ? `+${m.qty_change}` : m.qty_change}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-medium text-slate-600 dark:text-slate-400">
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
                className="btn-3d-tactile-secondary rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 active:scale-95 duration-150 transition dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingAdj}
                className="btn-3d-tactile-primary rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 px-5 py-2 text-xs font-black text-white shadow-md shadow-amber-600/20 hover:brightness-110 active:scale-95 duration-150 disabled:opacity-60 transition"
              >
                {savingAdj ? "Applying Adjustment..." : "Apply Adjustment"}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                Product Master <span className="text-rose-500">*</span>
              </label>
              <select
                value={adjProductId}
                onChange={(e) => {
                  setAdjProductId(e.target.value);
                  const p = products.find((x) => x.id === e.target.value);
                  if (p) setAdjNewStock(String(p.stock_qty));
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-white"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code}) — Current Physical Stock: {p.stock_qty}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                Actual Verified Physical Stock Count <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="any"
                required
                value={adjNewStock}
                onChange={(e) => setAdjNewStock(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-mono font-bold outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-white"
              />
              {(() => {
                const cur = products.find((p) => p.id === adjProductId);
                const curQty = Number(cur?.stock_qty || 0);
                const target = Number(adjNewStock);
                const diff = isNaN(target) ? 0 : target - curQty;
                if (!isNaN(target) && target !== curQty) {
                  return (
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs font-bold">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-mono ${
                          diff > 0
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/20 dark:bg-emerald-950/60 dark:text-emerald-300"
                            : "bg-rose-50 text-rose-700 ring-1 ring-rose-500/20 dark:bg-rose-950/60 dark:text-rose-300"
                        }`}
                      >
                        {diff > 0 ? `▲ Stock Inward: +${diff}` : `▼ Stock Write-off: ${diff}`}
                      </span>
                    </div>
                  );
                }
                return null;
              })()}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                Mandatory Audit Reason <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Physical inventory count discrepancy, damaged goods removal, shrinkage"
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-medium outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-white"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  "Physical count correction",
                  "Damaged goods write-off",
                  "Inventory discrepancy",
                  "Opening stock seed",
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setAdjReason(chip)}
                    className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-200 active:scale-95 duration-150 transition dark:bg-white/10 dark:text-slate-300"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            </div>

            {adjError && (
              <div className="rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700 ring-1 ring-rose-500/20 dark:bg-rose-950/40 dark:text-rose-400">
                {adjError}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
