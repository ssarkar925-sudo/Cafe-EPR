"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import Modal from "@/components/ui/modal";
import {
  ShoppingBag,
  Plus,
  Search,
  Filter,
  FileSpreadsheet,
  RotateCcw,
  Eye,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Building2,
  Calendar,
  Layers,
  Boxes,
  ArrowRight,
  Receipt,
  Tag,
  ShieldCheck,
  TrendingDown,
  CreditCard,
  Banknote,
  DollarSign,
  FileText,
  ChevronDown,
  X,
} from "lucide-react";

export type Purchase = {
  id: string;
  purchase_number: string;
  supplier_id: string | null;
  supplier_invoice_no: string | null;
  purchase_date: string;
  subtotal: number;
  tax_total: number;
  total: number;
  paid: number;
  due: number;
  status: "draft" | "completed" | "cancelled";
  notes: string | null;
  created_at: string;
  suppliers?: { id: string; name: string; code: string; phone?: string | null; current_balance?: number } | null;
  purchase_items?: PurchaseItem[];
};

export type PurchaseItem = {
  id: string;
  purchase_id: string;
  product_id: string;
  qty: number;
  purchase_rate: number;
  taxable_value: number;
  gst_rate: number;
  tax_amount: number;
  total_amount: number;
  returned_qty: number;
  products?: { id: string; name: string; code: string; cost_price: number; stock_qty: number } | null;
};

type SupplierOption = {
  id: string;
  name: string;
  code: string;
  current_balance: number;
};

export default function PurchasesHistoryClient() {
  const supabase = useMemo(() => createClient(), []);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [search, setSearch] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "total_desc" | "total_asc">("date_desc");

  // Details Modal
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Return Goods Modal
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnItems, setReturnItems] = useState<Record<string, string>>({});
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [returnReason, setReturnReason] = useState("");
  const [returning, setReturning] = useState(false);
  const [returnError, setReturnError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [purRes, supRes] = await Promise.all([
      supabase
        .from("purchases")
        .select("*, suppliers(id, name, code, phone, current_balance), purchase_items(*, products(id, name, code, cost_price, stock_qty))")
        .order("purchase_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("suppliers").select("id, name, code, current_balance").eq("is_active", true),
    ]);

    if (purRes.data) setPurchases(purRes.data as Purchase[]);
    if (supRes.data) setSuppliers(supRes.data as SupplierOption[]);
    setLoading(false);
  }

  // Filtered and Sorted Purchases
  const filteredPurchases = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();

    return purchases
      .filter((p) => {
        // Search query
        if (q) {
          const numMatch = (p.purchase_number || "").toLowerCase().includes(q);
          const invMatch = (p.supplier_invoice_no || "").toLowerCase().includes(q);
          const supMatch = (p.suppliers?.name || "").toLowerCase().includes(q);
          const supCode = (p.suppliers?.code || "").toLowerCase().includes(q);
          const notesMatch = (p.notes || "").toLowerCase().includes(q);
          if (!numMatch && !invMatch && !supMatch && !supCode && !notesMatch) return false;
        }

        // Supplier filter
        if (selectedSupplier !== "all" && p.supplier_id !== selectedSupplier) {
          return false;
        }

        // Purchase Status filter
        if (selectedStatus !== "all" && p.status !== selectedStatus) {
          return false;
        }

        // Payment status filter
        if (selectedPaymentStatus === "settled" && Number(p.due || 0) > 0) return false;
        if (selectedPaymentStatus === "due" && Number(p.due || 0) <= 0) return false;
        if (selectedPaymentStatus === "partial" && (Number(p.paid || 0) === 0 || Number(p.due || 0) === 0)) return false;

        // Date Range
        if (dateRange !== "all") {
          const pDate = new Date(p.purchase_date);
          if (dateRange === "today") {
            const todayStr = now.toISOString().slice(0, 10);
            if (p.purchase_date !== todayStr) return false;
          } else if (dateRange === "this_week") {
            const weekAgo = new Date();
            weekAgo.setDate(now.getDate() - 7);
            if (pDate < weekAgo) return false;
          } else if (dateRange === "this_month") {
            const monthAgo = new Date();
            monthAgo.setMonth(now.getMonth() - 1);
            if (pDate < monthAgo) return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "date_desc") return new Date(b.purchase_date).getTime() - new Date(a.purchase_date).getTime();
        if (sortBy === "date_asc") return new Date(a.purchase_date).getTime() - new Date(b.purchase_date).getTime();
        if (sortBy === "total_desc") return Number(b.total || 0) - Number(a.total || 0);
        if (sortBy === "total_asc") return Number(a.total || 0) - Number(b.total || 0);
        return 0;
      });
  }, [purchases, search, selectedSupplier, selectedStatus, selectedPaymentStatus, dateRange, sortBy]);

  // Aggregate Metrics
  const stats = useMemo(() => {
    let totalVal = 0;
    let totalPaid = 0;
    let totalDue = 0;
    let openBills = 0;

    for (const p of filteredPurchases) {
      totalVal += Number(p.total || 0);
      totalPaid += Number(p.paid || 0);
      const d = Number(p.due || 0);
      totalDue += d;
      if (d > 0) openBills++;
    }

    return {
      count: filteredPurchases.length,
      totalVal,
      totalPaid,
      totalDue,
      openBills,
    };
  }, [filteredPurchases]);

  // Open Return Modal
  function openReturnModal(pur: Purchase) {
    setSelectedPurchase(pur);
    const initialReturns: Record<string, string> = {};
    (pur.purchase_items || []).forEach((pi) => {
      initialReturns[pi.id] = "";
    });
    setReturnItems(initialReturns);
    setRefundAmount("");
    setReturnReason("");
    setReturnError("");
    setReturnModalOpen(true);
  }

  // Handle Process Return
  async function handleProcessReturn(e: React.FormEvent) {
    if (returning) return;
    e.preventDefault();
    setReturnError("");
    if (!selectedPurchase) return;

    const returnPayload = Object.entries(returnItems)
      .filter(([_, qtyStr]) => Number(qtyStr) > 0)
      .map(([purchase_item_id, qtyStr]) => ({
        purchase_item_id,
        return_qty: Number(qtyStr),
      }));

    if (returnPayload.length === 0) {
      setReturnError("Please specify a return quantity greater than zero for at least one item.");
      return;
    }

    if (!returnReason.trim()) {
      setReturnError("Please provide a mandatory reason for the vendor return.");
      return;
    }

    setReturning(true);
    try {
      const { error } = await supabase.rpc("process_purchase_return", {
        p_purchase_id: selectedPurchase.id,
        p_items: returnPayload,
        p_refund_amount: Number(refundAmount) || 0,
        p_refund_method: refundMethod,
        p_reason: returnReason.trim(),
      });

      if (error) {
        setReturnError("Error processing purchase return: " + error.message);
      } else {
        setReturnModalOpen(false);
        setDetailsOpen(false);
        await loadData();
      }
    } catch (err: any) {
      setReturnError("Error: " + err.message);
    } finally {
      setReturning(false);
    }
  }

  // Export CSV
  function exportCsv() {
    const headers = [
      "Purchase #",
      "Date",
      "Supplier Name",
      "Supplier Code",
      "Supplier Invoice #",
      "Subtotal",
      "Tax Total",
      "Total Amount",
      "Amount Paid",
      "Balance Due",
      "Status",
      "Items Count",
      "Notes",
    ];
    const rows = filteredPurchases.map((p) => [
      p.purchase_number,
      p.purchase_date,
      p.suppliers?.name || "Walk-in Supplier",
      p.suppliers?.code || "—",
      p.supplier_invoice_no || "—",
      p.subtotal,
      p.tax_total,
      p.total,
      p.paid,
      p.due,
      p.status,
      p.purchase_items?.length || 0,
      p.notes || "",
    ]);
    const csvContent = [
      headers.join(","),
      ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `purchase-bills-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  }

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="card-glow-indigo relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.04] via-white to-white p-6 shadow-xs transition-all duration-200 hover:shadow-md dark:border-indigo-500/30 dark:from-indigo-950/25 dark:via-slate-900 dark:to-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700 ring-1 ring-indigo-500/20 dark:bg-indigo-950/60 dark:text-indigo-300 dark:ring-indigo-500/30">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                <ShoppingBag className="h-3.5 w-3.5" />
                PURCHASING HISTORY
              </span>
              <span className="text-xs text-slate-400">· Procurement & Inward Bills Ledger</span>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Purchase Bills & Inward History
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
              Audit historic vendor purchases, invoice liabilities, Moving WAC cost additions, and supplier return debits.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={exportCsv}
              className="btn-3d-tactile-secondary inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 active:scale-95 duration-150 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
              <span>Export Bills CSV</span>
            </button>
            <Link
              href="/purchases/entry"
              className="btn-3d-tactile-primary inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2 text-xs font-black text-white shadow-md shadow-indigo-600/20 transition hover:brightness-110 active:scale-95 duration-150"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Record Inward Bill (Receive Stock)</span>
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Total Purchases Value */}
        <div className="card-glow-indigo relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.06] via-white to-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-indigo-500/30 dark:from-indigo-950/25 dark:via-slate-900 dark:to-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Total Inward Value
            </span>
            <div className="icon-box-3d flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-xs">
              <ShoppingBag className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 font-mono text-2xl font-black tracking-tight tabular-nums text-slate-900 dark:text-white">
            {inr(stats.totalVal)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">
            {stats.count} bills ({stats.count === 1 ? "record" : "records"})
          </p>
        </div>

        {/* Settled / Paid */}
        <div className="card-glow-emerald relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.06] via-white to-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-emerald-500/30 dark:from-emerald-950/25 dark:via-slate-900 dark:to-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Settled / Paid
            </span>
            <div className="icon-box-3d flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xs">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 font-mono text-2xl font-black tracking-tight tabular-nums text-emerald-700 dark:text-emerald-300">
            {inr(stats.totalPaid)}
          </p>
          <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-400 font-medium">
            Cash / Bank outflows cleared
          </p>
        </div>

        {/* Total Payable / Due */}
        <div className="card-glow-rose relative overflow-hidden rounded-2xl border border-rose-500/20 bg-gradient-to-br from-rose-500/[0.06] via-white to-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-rose-500/30 dark:from-rose-950/25 dark:via-slate-900 dark:to-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
              Accounts Payable Due
            </span>
            <div className="icon-box-3d flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-xs">
              <AlertCircle className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 font-mono text-2xl font-black tracking-tight tabular-nums text-rose-600 dark:text-rose-400">
            {inr(stats.totalDue)}
          </p>
          <p className="mt-1 text-xs text-rose-600/80 dark:text-rose-400 font-medium">
            {stats.openBills} open bill{stats.openBills === 1 ? "" : "s"} with balance
          </p>
        </div>

        {/* Moving WAC Costing Status */}
        <div className="card-glow-cyan relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.06] via-white to-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-cyan-500/30 dark:from-cyan-950/25 dark:via-slate-900 dark:to-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
              Inventory Accounting
            </span>
            <div className="icon-box-3d flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-xs">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-sm font-black text-cyan-700 dark:text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-cyan-500 animate-pulse" />
            Moving WAC Active
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">
            Perpetual lot cost averaging
          </p>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* Search Box */}
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by PO #, Invoice #, Supplier, or Notes..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-medium outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-slate-800 dark:text-white"
            />
          </div>

          {/* Supplier Filter */}
          <div>
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none transition focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
            >
              <option value="all">All Suppliers ({suppliers.length})</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          {/* Payment Status Filter */}
          <div>
            <select
              value={selectedPaymentStatus}
              onChange={(e) => setSelectedPaymentStatus(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none transition focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
            >
              <option value="all">All Payment Statuses</option>
              <option value="settled">Fully Settled (Paid)</option>
              <option value="due">Has Balance Due (Payable)</option>
              <option value="partial">Partially Paid</option>
            </select>
          </div>

          {/* Date Range Filter */}
          <div>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none transition focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="this_week">Past 7 Days</option>
              <option value="this_month">Past 30 Days</option>
            </select>
          </div>
        </div>

        {/* Secondary Toolbar: Sort & Reset */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-white/5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400">Sort By:</span>
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
            >
              <option value="date_desc">Purchase Date (Newest first)</option>
              <option value="date_asc">Purchase Date (Oldest first)</option>
              <option value="total_desc">Total Amount (Highest first)</option>
              <option value="total_asc">Total Amount (Lowest first)</option>
            </select>
          </div>

          {(search || selectedSupplier !== "all" || selectedPaymentStatus !== "all" || dateRange !== "all") && (
            <button
              onClick={() => {
                setSearch("");
                setSelectedSupplier("all");
                setSelectedPaymentStatus("all");
                setDateRange("all");
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300"
            >
              <X className="h-3 w-3" />
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Purchase Bills Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-white/10 dark:bg-slate-900">
        {loading ? (
          <div className="py-14 text-center text-xs text-slate-400">Loading purchase bills...</div>
        ) : filteredPurchases.length === 0 ? (
          <div className="py-14 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-white/5">
              <ShoppingBag className="h-6 w-6" />
            </div>
            <p className="font-bold text-slate-800 dark:text-white">No purchase bills found</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Try adjusting your search filters or record a new purchase bill.
            </p>
            <Link
              href="/purchases/entry"
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-indigo-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Record Inward Stock Bill
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/75 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider">Purchase #</th>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider">Supplier</th>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider">Invoice Ref</th>
                  <th className="px-4 py-3 text-right font-bold uppercase tracking-wider">Items</th>
                  <th className="px-4 py-3 text-right font-bold uppercase tracking-wider">Total Bill</th>
                  <th className="px-4 py-3 text-right font-bold uppercase tracking-wider">Paid</th>
                  <th className="px-4 py-3 text-right font-bold uppercase tracking-wider">Due</th>
                  <th className="px-4 py-3 text-center font-bold uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right font-bold uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filteredPurchases.map((p) => {
                  const due = Number(p.due || 0);
                  const isSettled = due <= 0;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/75 dark:hover:bg-white/5 transition">
                      {/* Purchase Number */}
                      <td className="px-4 py-3.5 font-mono font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                        {p.purchase_number}
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-600 dark:text-slate-400 font-mono">
                        {p.purchase_date}
                      </td>

                      {/* Supplier */}
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {p.suppliers?.name || "Walk-in / Direct"}
                        </div>
                        {p.suppliers?.code && (
                          <div className="text-[11px] font-mono text-slate-400">
                            {p.suppliers.code}
                          </div>
                        )}
                      </td>

                      {/* Invoice Ref */}
                      <td className="px-4 py-3.5 font-mono text-slate-500 whitespace-nowrap">
                        {p.supplier_invoice_no || "—"}
                      </td>

                      {/* Items Count */}
                      <td className="px-4 py-3.5 text-right font-semibold text-slate-700 dark:text-slate-300">
                        {p.purchase_items?.length || 0}
                      </td>

                      {/* Total Bill */}
                      <td className="px-4 py-3.5 text-right font-mono font-black text-slate-900 dark:text-white">
                        {inr(p.total)}
                      </td>

                      {/* Paid */}
                      <td className="px-4 py-3.5 text-right font-mono font-medium text-emerald-600 dark:text-emerald-400">
                        {inr(p.paid)}
                      </td>

                      {/* Due */}
                      <td className="px-4 py-3.5 text-right font-mono font-bold whitespace-nowrap">
                        {due > 0 ? (
                          <span className="text-rose-600 dark:text-rose-400">
                            {inr(due)}
                          </span>
                        ) : (
                          <span className="text-slate-400">₹0</span>
                        )}
                      </td>

                      {/* Payment Status Badge */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                            isSettled
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/20 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-500/30"
                              : Number(p.paid || 0) > 0
                              ? "bg-amber-50 text-amber-700 ring-1 ring-amber-500/20 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-500/30"
                              : "bg-rose-50 text-rose-700 ring-1 ring-rose-500/20 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-500/30"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isSettled ? "bg-emerald-500" : Number(p.paid || 0) > 0 ? "bg-amber-500" : "bg-rose-500"
                            } animate-pulse`}
                          />
                          {isSettled ? "Settled" : Number(p.paid || 0) > 0 ? "Partial" : "Credit Due"}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex justify-end items-center gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedPurchase(p);
                              setDetailsOpen(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 active:scale-95 duration-150 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                          >
                            <Eye className="h-3.5 w-3.5 text-indigo-500" />
                            View
                          </button>
                          <button
                            onClick={() => openReturnModal(p)}
                            className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 shadow-xs transition hover:bg-rose-100 active:scale-95 duration-150 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Return
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Purchase Details Modal */}
      {detailsOpen && selectedPurchase && (
        <Modal
          as="div"
          onClose={() => setDetailsOpen(false)}
          title={`Purchase Bill #${selectedPurchase.purchase_number}`}
          subtitle={`Supplier: ${selectedPurchase.suppliers?.name || "Walk-in Supplier"} • Inward Date: ${selectedPurchase.purchase_date}`}
          icon="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"
          accent="indigo"
          size="lg"
          footer={
            <div className="flex items-center justify-between w-full">
              <button
                type="button"
                onClick={() => openReturnModal(selectedPurchase)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 shadow-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Return Goods to Vendor
              </button>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
              >
                Close View
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Bill Info Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-xs dark:border-white/10 dark:bg-slate-900/50">
              <div>
                <span className="text-slate-400">Supplier Invoice Ref:</span>
                <p className="font-mono font-bold text-slate-900 dark:text-white">
                  {selectedPurchase.supplier_invoice_no || "—"}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Supplier Account:</span>
                <p className="font-bold text-slate-900 dark:text-white">
                  {selectedPurchase.suppliers?.name || "Direct Supplier"}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Inward Date:</span>
                <p className="font-mono font-bold text-slate-900 dark:text-white">
                  {selectedPurchase.purchase_date}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Settlement Status:</span>
                <p className="font-bold text-indigo-600 dark:text-indigo-400">
                  {Number(selectedPurchase.due || 0) <= 0 ? "Fully Settled" : `${inr(selectedPurchase.due)} Due`}
                </p>
              </div>
            </div>

            {/* Financial Summary Cards */}
            <div className="grid grid-cols-3 gap-3 rounded-xl bg-indigo-50/60 p-3.5 text-xs dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30">
              <div>
                <span className="text-slate-500">Taxable Subtotal</span>
                <div className="text-base font-black text-slate-900 dark:text-white">
                  {inr(selectedPurchase.subtotal)}
                </div>
              </div>
              <div>
                <span className="text-slate-500">GST / Tax Total</span>
                <div className="text-base font-black text-slate-900 dark:text-white">
                  {inr(selectedPurchase.tax_total)}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Bill Grand Total</span>
                <div className="text-base font-black text-indigo-700 dark:text-indigo-300">
                  {inr(selectedPurchase.total)}
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-400 border-b border-slate-200 dark:border-white/10">
                  <tr>
                    <th className="py-2.5 px-3 font-bold uppercase tracking-wider">Product</th>
                    <th className="py-2.5 px-3 text-right font-bold uppercase tracking-wider">Inward Qty</th>
                    <th className="py-2.5 px-3 text-right font-bold uppercase tracking-wider">Returned</th>
                    <th className="py-2.5 px-3 text-right font-bold uppercase tracking-wider">Purchase Rate</th>
                    <th className="py-2.5 px-3 text-right font-bold uppercase tracking-wider">GST %</th>
                    <th className="py-2.5 px-3 text-right font-bold uppercase tracking-wider">Total Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {(selectedPurchase.purchase_items || []).map((pi) => (
                    <tr key={pi.id}>
                      <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white">
                        {pi.products?.name || "Product Item"}
                        <div className="text-[10px] font-mono text-slate-400">{pi.products?.code || "No SKU"}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {pi.qty}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-rose-600 dark:text-rose-400">
                        {pi.returned_qty > 0 ? pi.returned_qty : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                        {inr(pi.purchase_rate)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                        {pi.gst_rate}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900 dark:text-white">
                        {inr(pi.total_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedPurchase.notes && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-white/10 dark:bg-slate-900 dark:text-slate-400">
                <span className="font-bold text-slate-700 dark:text-slate-300">Bill Notes: </span>
                {selectedPurchase.notes}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Purchase Return Modal */}
      {returnModalOpen && selectedPurchase && (
        <Modal
          as="form"
          onSubmit={handleProcessReturn}
          onClose={() => setReturnModalOpen(false)}
          title={`Process Return: #${selectedPurchase.purchase_number}`}
          subtitle="Return damaged or excess goods from specific purchase lots with verified Moving WAC cost relief"
          icon="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"
          accent="rose"
          size="lg"
          footer={
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setReturnModalOpen(false)}
                className="btn-3d-tactile-secondary rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 active:scale-95 duration-150 transition dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={returning}
                className="btn-3d-tactile-primary rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 px-5 py-2 text-xs font-black text-white shadow-md shadow-rose-600/20 hover:brightness-110 active:scale-95 duration-150 disabled:opacity-60 transition"
              >
                {returning ? "Processing Return..." : "Confirm Vendor Return"}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-400 border-b border-slate-200 dark:border-white/10">
                  <tr>
                    <th className="py-2.5 px-3 font-bold uppercase tracking-wider">Product</th>
                    <th className="py-2.5 px-3 text-right font-bold uppercase tracking-wider">Inward Qty</th>
                    <th className="py-2.5 px-3 text-right font-bold uppercase tracking-wider">Available</th>
                    <th className="py-2.5 px-3 text-right font-bold uppercase tracking-wider">Rate</th>
                    <th className="py-2.5 px-3 text-right w-28 font-bold uppercase tracking-wider">Return Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {(selectedPurchase.purchase_items || []).map((pi) => {
                    const remaining = pi.qty - pi.returned_qty;
                    return (
                      <tr key={pi.id}>
                        <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white">
                          {pi.products?.name || "Product"}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">{pi.qty}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-600">
                          {remaining}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">{inr(pi.purchase_rate)}</td>
                        <td className="py-2.5 px-3 text-right">
                          <input
                            type="number"
                            min="0"
                            max={remaining}
                            step="any"
                            placeholder="0"
                            value={returnItems[pi.id] || ""}
                            onChange={(e) =>
                              setReturnItems((prev) => ({ ...prev, [pi.id]: e.target.value }))
                            }
                            className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs text-right outline-none focus:border-rose-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Refund Received from Supplier (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-medium outline-none focus:border-rose-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Refund Tender Mode
                </label>
                <select
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold outline-none focus:border-rose-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
                >
                  <option value="cash">Cash Inflow</option>
                  <option value="bank">Bank Transfer / UPI Inflow</option>
                  <option value="credit">Supplier Ledger Credit Adjustment</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Reason for Return *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Defective stock, expired batch, wrong shipment received"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-medium outline-none focus:border-rose-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
              />
            </div>

            {returnError && (
              <div className="rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                {returnError}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
