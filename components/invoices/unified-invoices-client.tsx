"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import {
  FileText,
  Search,
  Plus,
  Printer,
  Eye,
  MessageSquare,
  CreditCard,
  Download,
  MoreVertical,
  Pencil,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Copy,
  Check,
  X,
  Clock,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Calendar,
  DollarSign,
} from "lucide-react";
import InvoiceViewModal from "./invoice-view-modal";
import InvoiceEditModal from "./invoice-edit-modal";
import QuickSaleViewModal from "./quick-sale-view-modal";
import ReturnModal from "./return-modal";
import MultiPaymentCollection, { type PaymentAllocation } from "@/components/business/multi-payment-collection";
import { DEFAULT_WA_TEMPLATES, getWhatsAppConfig, renderWhatsAppTemplate, sendWhatsAppMessage } from "@/lib/whatsapp";

type Props = {
  initialInvoices: any[];
  initialQuickSales: any[];
};

export type UnifiedInvoiceRow = {
  id: string;
  number: string;
  date: string;
  createdAt: string;
  total: number;
  paid: number;
  due: number;
  status: string;
  customer: { name?: string | null; phone?: string | null } | null;
  source: "pos" | "quick";
  item?: string | null;
  cost?: number;
};

export type SortKey =
  | "newest"
  | "oldest"
  | "highest_amount"
  | "lowest_amount"
  | "highest_due"
  | "number_asc"
  | "number_desc";

function normalize(invoices: any[], quickSales: any[]): UnifiedInvoiceRow[] {
  const pos: UnifiedInvoiceRow[] = invoices.map((row) => ({
    id: String(row.id),
    number: String(row.invoice_number ?? ""),
    date: String(row.invoice_date ?? ""),
    createdAt: String(row.created_at ?? row.invoice_date ?? ""),
    total: Number(row.total ?? 0),
    paid: Number(row.paid ?? 0),
    due: Number(row.due ?? 0),
    status: String(row.status ?? "unpaid"),
    customer: Array.isArray(row.customers) ? row.customers[0] ?? null : row.customers ?? null,
    source: "pos" as const,
  }));
  const quick: UnifiedInvoiceRow[] = quickSales.map((row) => ({
    id: String(row.id),
    number: String(row.sale_number ?? ""),
    date: String(row.sale_date ?? ""),
    createdAt: String(row.created_at ?? row.sale_date ?? ""),
    total: Number(row.amount ?? 0),
    paid: Number(row.amount ?? 0),
    due: 0,
    status: String(row.status ?? "paid"),
    customer: Array.isArray(row.customers) ? row.customers[0] ?? null : row.customers ?? null,
    source: "quick" as const,
    item: row.item_name ?? row.products?.name ?? row.services?.name ?? "Quick Sale",
    cost: Number(row.cost ?? 0),
  }));

  // Default chronological sort: newest creation timestamp first
  return [...pos, ...quick].sort((a, b) => {
    const timeA = a.createdAt || a.date;
    const timeB = b.createdAt || b.date;
    const cmp = timeB.localeCompare(timeA);
    return cmp !== 0 ? cmp : b.id.localeCompare(a.id);
  });
}

function fmtDate(value: string) {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function statusBadge(status: string) {
  switch (status) {
    case "paid":
      return {
        label: "Paid",
        badge: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800",
        icon: CheckCircle2,
      };
    case "partial":
      return {
        label: "Partial",
        badge: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800",
        icon: Clock,
      };
    case "cancelled":
      return {
        label: "Cancelled",
        badge: "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700",
        icon: X,
      };
    default:
      return {
        label: "Unpaid",
        badge: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800",
        icon: AlertCircle,
      };
  }
}

export default function UnifiedInvoicesClient({ initialInvoices, initialQuickSales }: Props) {
  const supabase = createClient();
  const [invoices, setInvoices] = useState(initialInvoices);
  const [quickSales, setQuickSales] = useState(initialQuickSales);
  const [q, setQ] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "pos" | "quick">("all");
  const [status, setStatus] = useState("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "this_month">("all");
  const [sortBy, setSortBy] = useState<SortKey>("newest");

  const [viewId, setViewId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [quickViewId, setQuickViewId] = useState<string | null>(null);
  const [returnInvoiceId, setReturnInvoiceId] = useState<string | null>(null);
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [collectId, setCollectId] = useState<string | null>(null);
  const [allocations, setAllocations] = useState<PaymentAllocation[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copiedNum, setCopiedNum] = useState<string | null>(null);

  const rows = useMemo(() => normalize(invoices, quickSales), [invoices, quickSales]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rowsFiltered = rows.filter((row) => {
      if (sourceFilter !== "all" && row.source !== sourceFilter) return false;
      if (status !== "all" && row.status !== status) return false;
      if (dateFilter === "today") {
        const todayStr = new Date().toISOString().slice(0, 10);
        if (row.date !== todayStr && !row.createdAt?.startsWith(todayStr)) return false;
      } else if (dateFilter === "this_month") {
        const monthStr = new Date().toISOString().slice(0, 7);
        if (!row.date?.startsWith(monthStr) && !row.createdAt?.startsWith(monthStr)) return false;
      }
      if (!needle) return true;
      return [row.number, row.customer?.name, row.customer?.phone, row.item]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });

    return rowsFiltered.sort((a, b) => {
      switch (sortBy) {
        case "newest": {
          const timeA = a.createdAt || a.date;
          const timeB = b.createdAt || b.date;
          const cmp = timeB.localeCompare(timeA);
          return cmp !== 0 ? cmp : b.id.localeCompare(a.id);
        }
        case "oldest": {
          const timeA = a.createdAt || a.date;
          const timeB = b.createdAt || b.date;
          const cmp = timeA.localeCompare(timeB);
          return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
        }
        case "highest_amount":
          return b.total - a.total;
        case "lowest_amount":
          return a.total - b.total;
        case "highest_due":
          return b.due - a.due;
        case "number_asc":
          return a.number.localeCompare(b.number, undefined, { numeric: true });
        case "number_desc":
          return b.number.localeCompare(a.number, undefined, { numeric: true });
        default:
          return 0;
      }
    });
  }, [rows, q, status, sourceFilter, dateFilter, sortBy]);

  const stats = useMemo(() => {
    const active = rows.filter((r) => r.status !== "cancelled");
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayBills = active.filter((r) => r.date === todayStr || r.createdAt?.startsWith(todayStr));
    const total = active.reduce((s, r) => s + r.total, 0);
    const paid = active.reduce((s, r) => s + r.paid, 0);
    const due = active.reduce((s, r) => s + r.due, 0);
    const posTotal = active.filter((r) => r.source === "pos").reduce((s, r) => s + r.total, 0);
    const quickTotal = active.filter((r) => r.source === "quick").reduce((s, r) => s + r.total, 0);
    const todayTotal = todayBills.reduce((s, r) => s + r.total, 0);
    const collectionRate = total > 0 ? Math.round((paid / total) * 100) : 100;
    return {
      count: active.length,
      total,
      paid,
      due,
      posTotal,
      quickTotal,
      todayCount: todayBills.length,
      todayTotal,
      collectionRate,
    };
  }, [rows]);

  async function refresh() {
    const [a, b] = await Promise.all([
      supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, total, paid, due, returned, refunded, status, created_at, customers(name, phone)")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("quick_sales")
        .select("id, sale_number, sale_date, amount, cost, status, created_at, customers(name, phone), products(name), services(name), item_name")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    if (a.data) setInvoices(a.data);
    if (b.data) setQuickSales(b.data);
  }

  useEffect(() => {
    const channel = supabase
      .channel(`unified-invoices-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "quick_sales" }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  async function collect() {
    if (!collectId) return;
    const allocationRows = allocations.filter((x) => Number(x.amount) > 0);
    if (!allocationRows.length) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("record_invoice_multi_payment", {
      p_invoice_id: collectId,
      p_allocations: allocationRows,
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    const result = data as { paid: number; due: number; status: string };
    setInvoices((current) =>
      current.map((row) =>
        row.id === collectId ? { ...row, paid: result.paid, due: result.due, status: result.status } : row
      )
    );
    setCollectId(null);
    setAllocations([]);
    setMessage("Payment collected successfully.");
    setTimeout(() => setMessage(null), 2500);
  }

  async function sendWhatsApp(row: UnifiedInvoiceRow) {
    const cfg = getWhatsAppConfig();
    const phone = row.customer?.phone || "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = row.source === "pos" ? `${origin}/receipt/${row.id}/a4` : `${origin}/receipt/quick/${row.id}`;
    const msg =
      row.source === "pos"
        ? renderWhatsAppTemplate(cfg.templates?.pos_invoice || DEFAULT_WA_TEMPLATES.pos_invoice, {
            shop_name: "Sarkar Communication",
            invoice_number: row.number,
            invoice_date: row.date,
            customer_name: row.customer?.name || "Customer",
            total_amount: inr(row.total),
            paid_amount: inr(row.paid),
            due_amount: inr(row.due),
            status_line: row.status === "paid" ? "Fully Paid" : `Balance Due: ${inr(row.due)}`,
            receipt_url: url,
          })
        : `🧾 Receipt: ${row.number}\n📅 Date: ${row.date}\n👤 Customer: ${row.customer?.name || "Walk-in"}\n💰 Amount: ${inr(row.total)}\n📄 Receipt: ${url}`;
    const result = await sendWhatsAppMessage({ phone, message: msg });
    if (!result.ok) window.open(result.fallbackUrl, "_blank", "noopener");
  }

  function handleCopy(num: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(num);
      setCopiedNum(num);
      setTimeout(() => setCopiedNum(null), 2000);
    }
  }

  function open(row: UnifiedInvoiceRow) {
    setMenuKey(null);
    if (row.source === "pos") setViewId(row.id);
    else setQuickViewId(row.id);
  }

  function edit(row: UnifiedInvoiceRow) {
    setMenuKey(null);
    if (row.source === "pos" && row.status !== "cancelled") setEditId(row.id);
  }

  function handleEdited() {
    setEditId(null);
    setViewId(null);
    setMessage("Invoice edited successfully. The original invoice remains in the audit trail.");
    void refresh();
    window.setTimeout(() => setMessage(null), 3500);
  }

  function toggleHeaderSort(column: "date" | "total" | "due" | "number") {
    if (column === "date") {
      setSortBy(sortBy === "newest" ? "oldest" : "newest");
    } else if (column === "total") {
      setSortBy(sortBy === "highest_amount" ? "lowest_amount" : "highest_amount");
    } else if (column === "due") {
      setSortBy(sortBy === "highest_due" ? "newest" : "highest_due");
    } else if (column === "number") {
      setSortBy(sortBy === "number_asc" ? "number_desc" : "number_asc");
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Executive Module Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-500/20 dark:bg-blue-950/50 dark:text-blue-400">
              <FileText className="h-4 w-4" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Sales & Invoices
            </h1>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-blue-700 ring-1 ring-blue-500/20 dark:bg-blue-950/60 dark:text-blue-300">
              ONE LEDGER
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Real-time unified register for POS bills and quick counter sales with multi-payment allocations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/pos"
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-blue-500/20 transition hover:bg-blue-700 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            <span>New POS Bill</span>
          </a>
        </div>
      </div>

      {/* 5 Executive KPI Bento Cards (Default Light Theme) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {/* Total Billed */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:shadow-md dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Gross Billed
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 font-mono text-xl font-black text-slate-900 dark:text-white">
            {inr(stats.total)}
          </p>
          <p className="mt-1 text-[10px] font-semibold text-slate-400">
            POS {inr(stats.posTotal)} · Quick {inr(stats.quickTotal)}
          </p>
        </div>

        {/* Collections Received */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:shadow-md dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Collections
            </span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700 ring-1 ring-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-300">
              {stats.collectionRate}%
            </span>
          </div>
          <p className="mt-2 font-mono text-xl font-black text-emerald-600 dark:text-emerald-400">
            {inr(stats.paid)}
          </p>
          <p className="mt-1 text-[10px] font-semibold text-slate-400">
            Received & settled inflows
          </p>
        </div>

        {/* Outstanding Due */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:shadow-md dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              Khata Due
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
              <AlertCircle className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 font-mono text-xl font-black text-rose-600 dark:text-rose-400">
            {inr(stats.due)}
          </p>
          <p className="mt-1 text-[10px] font-semibold text-slate-400">
            Customer balance outstanding
          </p>
        </div>

        {/* Today's Sales */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:shadow-md dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Today&apos;s Sales
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 font-mono text-xl font-black text-slate-900 dark:text-white">
            {inr(stats.todayTotal)}
          </p>
          <p className="mt-1 text-[10px] font-semibold text-slate-400">
            {stats.todayCount} sales recorded today
          </p>
        </div>

        {/* Active Invoices Count */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:shadow-md dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Active Bills
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <FileText className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 font-mono text-xl font-black text-slate-900 dark:text-white">
            {stats.count}
          </p>
          <p className="mt-1 text-[10px] font-semibold text-slate-400">
            {filtered.length} currently filtered
          </p>
        </div>
      </div>

      {/* Modern Filter Ribbon with Sorting Controls */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Search Box */}
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search invoice number, customer, mobile or item…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-8 text-xs font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-white"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter & Sorting Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Segmented Source Filter */}
            <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setSourceFilter("all")}
                className={`rounded-lg px-2.5 py-1 transition ${
                  sourceFilter === "all"
                    ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setSourceFilter("pos")}
                className={`rounded-lg px-2.5 py-1 transition ${
                  sourceFilter === "pos"
                    ? "bg-white text-blue-700 shadow-xs dark:bg-slate-900 dark:text-blue-400"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                POS
              </button>
              <button
                type="button"
                onClick={() => setSourceFilter("quick")}
                className={`rounded-lg px-2.5 py-1 transition ${
                  sourceFilter === "quick"
                    ? "bg-white text-violet-700 shadow-xs dark:bg-slate-900 dark:text-violet-400"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                Quick Sale
              </button>
            </div>

            {/* Status Select */}
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 outline-none transition focus:border-blue-500 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="all">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="unpaid">Unpaid</option>
              <option value="cancelled">Cancelled</option>
            </select>

            {/* Date Quick Filter */}
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 outline-none transition focus:border-blue-500 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="this_month">This Month</option>
            </select>

            {/* Sorting Dropdown (Newest First by Default) */}
            <div className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/50 px-2.5 py-1 dark:border-blue-900 dark:bg-blue-950/30">
              <ArrowUpDown className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                aria-label="Sort Invoices"
                className="bg-transparent text-xs font-black text-blue-700 outline-none dark:text-blue-300"
              >
                <option value="newest">Newest First (Default)</option>
                <option value="oldest">Oldest First</option>
                <option value="highest_amount">Highest Amount</option>
                <option value="lowest_amount">Lowest Amount</option>
                <option value="highest_due">Highest Due Balance</option>
                <option value="number_asc">Invoice # (Ascending)</option>
                <option value="number_desc">Invoice # (Descending)</option>
              </select>
            </div>

            {/* Reset Button */}
            {(q || status !== "all" || sourceFilter !== "all" || dateFilter !== "all" || sortBy !== "newest") && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setStatus("all");
                  setSourceFilter("all");
                  setDateFilter("all");
                  setSortBy("newest");
                }}
                className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Notification Banner */}
      {message && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Invoice Register Table with Clickable Sort Headers */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[950px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-400">
                <th
                  onClick={() => toggleHeaderSort("number")}
                  className="cursor-pointer px-4 py-3 select-none hover:text-slate-900 dark:hover:text-white"
                >
                  <div className="flex items-center gap-1">
                    <span>Invoice #</span>
                    {sortBy === "number_asc" ? (
                      <ArrowUp className="h-3 w-3 text-blue-600" />
                    ) : sortBy === "number_desc" ? (
                      <ArrowDown className="h-3 w-3 text-blue-600" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </div>
                </th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Customer & Item</th>
                <th
                  onClick={() => toggleHeaderSort("date")}
                  className="cursor-pointer px-4 py-3 select-none hover:text-slate-900 dark:hover:text-white"
                >
                  <div className="flex items-center gap-1">
                    <span>Date & Time</span>
                    {sortBy === "newest" ? (
                      <ArrowDown className="h-3 w-3 text-blue-600" />
                    ) : sortBy === "oldest" ? (
                      <ArrowUp className="h-3 w-3 text-blue-600" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => toggleHeaderSort("total")}
                  className="cursor-pointer px-4 py-3 text-right select-none hover:text-slate-900 dark:hover:text-white"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Total</span>
                    {sortBy === "highest_amount" ? (
                      <ArrowDown className="h-3 w-3 text-blue-600" />
                    ) : sortBy === "lowest_amount" ? (
                      <ArrowUp className="h-3 w-3 text-blue-600" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </div>
                </th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th
                  onClick={() => toggleHeaderSort("due")}
                  className="cursor-pointer px-4 py-3 text-right select-none hover:text-slate-900 dark:hover:text-white"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Due</span>
                    {sortBy === "highest_due" ? (
                      <ArrowDown className="h-3 w-3 text-blue-600" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </div>
                </th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filtered.map((row) => {
                const isPos = row.source === "pos";
                const badge = statusBadge(row.status);
                const StatusIcon = badge.icon;
                const custInitial = (row.customer?.name || "W")[0].toUpperCase();

                return (
                  <tr
                    key={`${row.source}:${row.id}`}
                    onClick={() => open(row)}
                    className="cursor-pointer transition-colors duration-150 hover:bg-slate-50/80 dark:hover:bg-white/[0.02]"
                  >
                    {/* Invoice Number */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          {row.number}
                        </span>
                        <button
                          type="button"
                          title="Copy invoice number"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(row.number);
                          }}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        >
                          {copiedNum === row.number ? (
                            <Check className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Source Type Badge */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                          isPos
                            ? "bg-blue-50 text-blue-700 ring-1 ring-blue-500/20 dark:bg-blue-950/40 dark:text-blue-300"
                            : "bg-violet-50 text-violet-700 ring-1 ring-violet-500/20 dark:bg-violet-950/40 dark:text-violet-300"
                        }`}
                      >
                        {isPos ? "POS" : "QUICK"}
                      </span>
                    </td>

                    {/* Customer & Item */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {custInitial}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-bold text-slate-800 dark:text-slate-200">
                            {row.customer?.name || "Walk-in Customer"}
                          </p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400">
                            {row.customer?.phone && <span>{row.customer.phone}</span>}
                            {row.item && <span className="truncate">· {row.item}</span>}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500 dark:text-slate-400">
                      <span>{fmtDate(row.date)}</span>
                    </td>

                    {/* Total */}
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {inr(row.total)}
                    </td>

                    {/* Paid */}
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {inr(row.paid)}
                    </td>

                    {/* Due */}
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      {row.due > 0 ? (
                        <span className="text-rose-600 dark:text-rose-400">{inr(row.due)}</span>
                      ) : (
                        <span className="text-slate-400">₹0</span>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ring-1 ${badge.badge}`}
                      >
                        <StatusIcon className="h-3 w-3" />
                        <span>{badge.label}</span>
                      </span>
                    </td>

                    {/* Actions Menu / Quick Buttons */}
                    <td className="px-4 py-3">
                      <div className="relative flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {/* View Button */}
                        <button
                          type="button"
                          title="View Invoice"
                          onClick={() => open(row)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:hover:bg-white/5"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>

                        {/* Print Button */}
                        <a
                          title="Print A4 / Slip"
                          target="_blank"
                          rel="noreferrer"
                          href={isPos ? `/receipt/${row.id}/a4?print=true` : `/receipt/quick/${row.id}?print=true`}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:hover:bg-white/5"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </a>

                        {/* Download PDF Button */}
                        <a
                          title="Download PDF Invoice"
                          href={`/api/invoices/${row.id}/pdf${row.source === "quick" ? "?source=quick" : ""}`}
                          download={`Invoice-${row.number}.pdf`}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-blue-200 bg-blue-50/60 text-blue-600 hover:bg-blue-100 hover:text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/50"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>

                        {/* WhatsApp Button */}
                        <button
                          type="button"
                          title="Share on WhatsApp"
                          onClick={() => void sendWhatsApp(row)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </button>

                        {/* Quick Collect Due Button */}
                        {isPos && row.due > 0 && row.status !== "cancelled" && (
                          <button
                            type="button"
                            title="Collect Outstanding Balance"
                            onClick={() => {
                              setCollectId(row.id);
                              setAllocations([{ method: "cash", amount: row.due.toFixed(2) }]);
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-xs hover:bg-emerald-700"
                          >
                            <CreditCard className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {/* More Actions Dropdown Toggle */}
                        <button
                          type="button"
                          title="More options"
                          onClick={() => setMenuKey(menuKey === `${row.source}:${row.id}` ? null : `${row.source}:${row.id}`)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:hover:bg-white/5"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>

                        {/* Dropdown Menu */}
                        {menuKey === `${row.source}:${row.id}` && (
                          <div className="absolute right-0 top-9 z-50 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-slate-900">
                            <button
                              type="button"
                              onClick={() => open(row)}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
                            >
                              <Eye className="h-3.5 w-3.5 text-blue-500" />
                              <span>View details</span>
                            </button>
                            <a
                              href={isPos ? `/receipt/${row.id}/a4?print=true` : `/receipt/quick/${row.id}/a4?print=true`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => setMenuKey(null)}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
                            >
                              <Printer className="h-3.5 w-3.5 text-indigo-500" />
                              <span>Print A4 Invoice</span>
                            </a>
                            <a
                              href={isPos ? `/receipt/${row.id}?print=true` : `/receipt/quick/${row.id}?print=true`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => setMenuKey(null)}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
                            >
                              <Printer className="h-3.5 w-3.5 text-slate-500" />
                              <span>Print 80mm Slip</span>
                            </a>
                            <a
                              href={`/api/invoices/${row.id}/pdf${row.source === "quick" ? "?source=quick" : ""}`}
                              download={`Invoice-${row.number}.pdf`}
                              onClick={() => setMenuKey(null)}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-bold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-white/10"
                            >
                              <Download className="h-3.5 w-3.5 text-blue-600" />
                              <span>Download PDF</span>
                            </a>
                            {isPos && row.status !== "cancelled" && (
                              <button
                                type="button"
                                onClick={() => edit(row)}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
                              >
                                <Pencil className="h-3.5 w-3.5 text-amber-500" />
                                <span>Edit invoice</span>
                              </button>
                            )}
                            {isPos && row.status !== "cancelled" && (
                              <button
                                type="button"
                                onClick={() => {
                                  setMenuKey(null);
                                  setReturnInvoiceId(row.id);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-bold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                <span>Return items</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setMenuKey(null);
                                handleCopy(row.number);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
                            >
                              <Copy className="h-3.5 w-3.5 text-slate-400" />
                              <span>Copy Invoice #</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!filtered.length && (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
                      <FileText className="h-6 w-6" />
                    </div>
                    <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-300">
                      No invoices found
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Try adjusting your search query, status filters, or date range.
                    </p>
                    <div className="mt-4">
                      <a
                        href="/pos"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Create New Invoice</span>
                      </a>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Collect Invoice Payment Modal */}
      {collectId && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-950/40 p-4 backdrop-blur-xs sm:items-center">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-white">
                  Collect Invoice Payment
                </h2>
                <p className="text-xs text-slate-400">
                  Record split or single payment against this invoice.
                </p>
              </div>
              <button
                onClick={() => setCollectId(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4">
              <MultiPaymentCollection
                totalDue={rows.find((r) => r.id === collectId && r.source === "pos")?.due ?? 0}
                mode="invoice"
                onChange={setAllocations}
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCollectId(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void collect()}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy ? "Recording…" : "Confirm Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {viewId && (
        <InvoiceViewModal
          invoiceId={viewId}
          onClose={() => setViewId(null)}
          onEdit={() => {
            setViewId(null);
            setEditId(viewId);
          }}
          onReturn={(id) => {
            setViewId(null);
            setReturnInvoiceId(id);
          }}
          onChanged={(row) => {
            setInvoices((current) => current.map((x) => (x.id === row.id ? { ...x, ...row } : x)));
          }}
        />
      )}

      {/* Edit Modal */}
      {editId && <InvoiceEditModal invoiceId={editId} onClose={() => setEditId(null)} onSaved={handleEdited} />}

      {/* Quick Sale View Modal */}
      {quickViewId && (
        <QuickSaleViewModal
          saleId={quickViewId}
          onClose={() => setQuickViewId(null)}
          onCancelled={(id) => {
            setQuickSales((current) => current.map((x) => (x.id === id ? { ...x, status: "cancelled" } : x)));
          }}
        />
      )}

      {/* Return Items Modal */}
      {returnInvoiceId && (
        <ReturnModal
          invoiceId={returnInvoiceId}
          onClose={() => setReturnInvoiceId(null)}
          onReturned={() => {
            setReturnInvoiceId(null);
            setMessage("Item return recorded and stock adjusted successfully.");
            void refresh();
            setTimeout(() => setMessage(null), 3500);
          }}
        />
      )}
    </div>
  );
}
