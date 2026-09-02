"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import InvoiceViewModal from "./invoice-view-modal";
import QuickSaleViewModal from "./quick-sale-view-modal";
import ReturnModal from "./return-modal";
import CompactToggle from "@/components/ui/compact-toggle";
import { DEFAULT_WA_TEMPLATES, getWhatsAppConfig, renderWhatsAppTemplate, sendWhatsAppMessage } from "@/lib/whatsapp";
import WhatsAppSendModal from "@/components/whatsapp/whatsapp-send-modal";
import {
  FileText,
  Search,
  Plus,
  Download,
  LayoutGrid,
  List,
  Copy,
  Printer,
  MessageSquare,
  Edit2,
  Eye,
  CheckCircle2,
  Clock,
  RotateCcw,
  Percent,
  Zap,
  Check,
  X,
  TrendingUp,
} from "lucide-react";

export type InvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total: number | string;
  paid: number | string;
  due: number | string;
  returned: number | string;
  refunded: number | string;
  status: string;
  created_at?: string;
  customers: { name: string; phone?: string | null } | null;
};

export type QuickSaleRow = {
  id: string;
  sale_number: string;
  sale_date: string;
  amount: number | string;
  cost: number | string;
  tendered: number | string | null;
  change_due: number | string;
  status: string;
  created_at?: string;
  customers: { name: string; phone?: string | null } | null;
  products?: { name: string } | null;
  services?: { name: string } | null;
  item_name?: string | null;
};

const STATUSES = ["all", "paid", "partial", "unpaid", "cancelled"] as const;
const METHODS = ["cash", "upi", "card"] as const;
const COLLECT_TIMEOUT = 5000;
const VIEW_KEY = "sccomm-invoices-view";

export function statusBadge(status: string) {
  const cls: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-700 ring-emerald-200",
    partial: "bg-amber-100 text-amber-700 ring-amber-200",
    unpaid: "bg-rose-100 text-rose-700 ring-rose-200",
    cancelled: "bg-slate-100 text-slate-500 ring-slate-200",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ${
        cls[status] ?? "bg-slate-100 text-slate-500 ring-slate-200"
      }`}
    >
      {status}
    </span>
  );
}

function gradient(name: string) {
  const palettes = [
    "from-blue-500 to-cyan-400",
    "from-violet-500 to-fuchsia-400",
    "from-emerald-500 to-teal-400",
    "from-amber-500 to-orange-400",
    "from-rose-500 to-pink-400",
    "from-indigo-500 to-purple-400",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palettes[h % palettes.length];
}

function fmtDate(d: string) {
  if (!d) return "—";
  const dt = new Date(d.length === 10 ? d + "T00:00:00" : d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const BAR_STYLE: Record<string, string> = {
  paid: "bg-gradient-to-r from-emerald-500 to-teal-400",
  partial: "bg-gradient-to-r from-amber-500 to-orange-400",
  unpaid: "bg-gradient-to-r from-rose-500 to-pink-400",
  cancelled: "bg-slate-300",
};

const SORT_OPTIONS = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "amount-desc", label: "Amount: high → low" },
  { key: "amount-asc", label: "Amount: low → high" },
  { key: "customer", label: "Customer A → Z" },
];

export default function InvoicesClient({
  initialInvoices,
  initialQuickSales = [],
}: {
  initialInvoices: InvoiceRow[];
  initialQuickSales?: QuickSaleRow[];
}) {
  const searchParams = useSearchParams();
  const initialStatusParam = searchParams?.get("status");
  const initialQParam = searchParams?.get("q") || "";
  const [invoices, setInvoices] = useState<InvoiceRow[]>(initialInvoices);
  const [quickSales, setQuickSales] = useState<QuickSaleRow[]>(initialQuickSales);
  const [tab, setTab] = useState<"invoices" | "quick">("invoices");
  const [q, setQ] = useState(initialQParam);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>(
    initialStatusParam && (STATUSES as readonly string[]).includes(initialStatusParam)
      ? (initialStatusParam as (typeof STATUSES)[number])
      : "all"
  );
  const [quickStatus, setQuickStatus] = useState<"all" | "active" | "cancelled">("all");
  const [sort, setSort] = useState("newest");
  const [view, setView] = useState<"cards" | "list">(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "cards" ? "cards" : "list";
    } catch {
      return "list";
    }
  });
  const [viewId, setViewId] = useState<string | null>(null);
  const [quickViewId, setQuickViewId] = useState<string | null>(null);
  const [returnId, setReturnId] = useState<string | null>(null);
  const [collectId, setCollectId] = useState<string | null>(null);
  const [collectMethod, setCollectMethod] = useState<string>("cash");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [compact, setCompact] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [waModal, setWaModal] = useState<{
    open: boolean;
    phone: string;
    name: string;
    msg: string;
    type: "pos_invoice" | "quick_sale";
    refNum: string;
    refId: string;
  } | null>(null);
  const timerRef = useRef<number | null>(null);

  const supabase = createClient();

  function flash(type: "success" | "error", text: string) {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3200);
  }

  function handleSendInvoiceWhatsApp(inv: InvoiceRow) {
    const cfg = getWhatsAppConfig();
    const template = cfg.templates?.pos_invoice || DEFAULT_WA_TEMPLATES.pos_invoice;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const receiptUrl = `${origin}/receipt/${inv.id}/a4`;
    const phone = inv.customers?.phone || "";
    const statusText = inv.status === "paid" ? "✅ Fully Paid" : `⚠️ Balance Due: ${inr(Number(inv.due))}`;
    const msg = renderWhatsAppTemplate(template, {
      shop_name: "Sarkar Communication",
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date,
      customer_name: inv.customers?.name || "Customer",
      customer_name_line: inv.customers?.name ? `👤 Customer: ${inv.customers.name}\n` : "",
      total_amount: inr(Number(inv.total)),
      paid_amount: inr(Number(inv.paid)),
      due_amount: inr(Number(inv.due)),
      status_line: statusText,
      receipt_url: receiptUrl,
    });

    setWaModal({
      open: true,
      phone,
      name: inv.customers?.name || "Customer",
      msg,
      type: "pos_invoice",
      refNum: inv.invoice_number,
      refId: inv.id,
    });
  }

  function handleSendQuickSaleWhatsApp(s: QuickSaleRow) {
    const cfg = getWhatsAppConfig();
    const template = cfg.templates?.quick_sale || DEFAULT_WA_TEMPLATES.quick_sale;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const receiptUrl = `${origin}/receipt/quick/${s.id}`;
    const phone = s.customers?.phone || "";
    const item = s.item_name ?? s.products?.name ?? s.services?.name ?? "Quick sale";
    const msg = renderWhatsAppTemplate(template, {
      shop_name: "Sarkar Communication",
      sale_number: s.sale_number,
      sale_date: fmtDate(s.sale_date),
      customer_name: s.customers?.name ?? "Walk-in Customer",
      customer_name_line: s.customers?.name ? `👤 Customer: ${s.customers.name}\n` : "",
      item_name: item,
      paid_amount: inr(Number(s.amount)),
      receipt_url: receiptUrl,
    });

    setWaModal({
      open: true,
      phone,
      name: s.customers?.name || "Customer",
      msg,
      type: "quick_sale",
      refNum: s.sale_number,
      refId: s.id,
    });
  }

  async function fetchLatestData() {
    try {
      const [invRes, qsRes] = await Promise.all([
        supabase
          .from("invoices")
          .select("*, customers(name, phone)")
          .order("invoice_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("quick_sales")
          .select("*, customers(name, phone), products(name), services(name)")
          .order("sale_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      if (invRes.data) setInvoices(invRes.data as unknown as InvoiceRow[]);
      if (qsRes.data) setQuickSales(qsRes.data as unknown as QuickSaleRow[]);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    const channel = supabase
      .channel("invoices-realtime-" + Math.random().toString(36).slice(2))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices" },
        () => {
          fetchLatestData();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments" },
        () => {
          fetchLatestData();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "quick_sales" },
        () => {
          fetchLatestData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  useEffect(() => {
    if (!collectId) return;
    timerRef.current = window.setTimeout(() => setCollectId(null), COLLECT_TIMEOUT);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [collectId]);

  const stats = useMemo(() => {
    let total = 0,
      paid = 0,
      due = 0,
      returned = 0,
      refunded = 0,
      count = 0;
    for (const i of invoices) {
      returned += Number(i.returned) || 0;
      refunded += Number(i.refunded) || 0;
      if (i.status === "cancelled") continue;
      total += Number(i.total) || 0;
      paid += Number(i.paid) || 0;
      due += Number(i.due) || 0;
      count++;
    }
    return { total, paid, due, returned, refunded, count };
  }, [invoices]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: invoices.length };
    for (const i of invoices) c[i.status] = (c[i.status] ?? 0) + 1;
    return c;
  }, [invoices]);

  const rate = stats.total > 0 ? Math.round((stats.paid / stats.total) * 100) : 0;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (status !== "all" && inv.status !== status) return false;
      if (!needle) return true;
      return (
        inv.invoice_number.toLowerCase().includes(needle) ||
        (inv.customers?.name ?? "").toLowerCase().includes(needle) ||
        (inv.customers?.phone ?? "").toLowerCase().includes(needle)
      );
    });
  }, [invoices, q, status]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    switch (sort) {
      case "oldest":
        list.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
        break;
      case "amount-desc":
        list.sort((a, b) => Number(b.total) - Number(a.total));
        break;
      case "amount-asc":
        list.sort((a, b) => Number(a.total) - Number(b.total));
        break;
      case "customer":
        list.sort((a, b) =>
          (a.customers?.name ?? "Walk-in").localeCompare(b.customers?.name ?? "Walk-in")
        );
        break;
      default:
        list.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    }
    return list;
  }, [filtered, sort]);

  const quickStats = useMemo(() => {
    let collected = 0,
      cost = 0,
      count = 0,
      cancelled = 0;
    for (const s of quickSales) {
      if (s.status === "cancelled") {
        cancelled++;
        continue;
      }
      collected += Number(s.amount) || 0;
      cost += Number(s.cost) || 0;
      count++;
    }
    return { collected, cost, profit: collected - cost, count, cancelled };
  }, [quickSales]);

  const filteredQuick = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return quickSales.filter((s) => {
      if (quickStatus !== "all" && s.status !== quickStatus) return false;
      if (!needle) return true;
      const item = s.item_name ?? s.products?.name ?? s.services?.name ?? "";
      return (
        s.sale_number.toLowerCase().includes(needle) ||
        item.toLowerCase().includes(needle) ||
        (s.customers?.name ?? "").toLowerCase().includes(needle) ||
        (s.customers?.phone ?? "").toLowerCase().includes(needle)
      );
    });
  }, [quickSales, q, quickStatus]);

  const sortedQuick = useMemo(() => {
    const list = [...filteredQuick];
    switch (sort) {
      case "oldest":
        list.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
        break;
      case "amount-desc":
        list.sort((a, b) => Number(b.amount) - Number(a.amount));
        break;
      case "amount-asc":
        list.sort((a, b) => Number(a.amount) - Number(b.amount));
        break;
      case "customer":
        list.sort((a, b) =>
          (a.customers?.name ?? "Walk-in").localeCompare(b.customers?.name ?? "Walk-in")
        );
        break;
      default:
        list.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    }
    return list;
  }, [filteredQuick, sort]);

  function handleChanged(row: InvoiceRow) {
    setInvoices((prev) => prev.map((x) => (x.id === row.id ? { ...x, ...row } : x)));
  }

  function handleReturned(row: InvoiceRow) {
    setInvoices((prev) => prev.map((x) => (x.id === row.id ? { ...x, ...row } : x)));
  }

  async function collectDue(inv: InvoiceRow) {
    const amt = Number(inv.due);
    if (!(amt > 0)) return;
    setBusyId(inv.id);
    const { data, error } = await supabase.rpc("record_invoice_payment", {
      p_invoice_id: inv.id,
      p_method: collectMethod,
      p_amount: amt,
    });
    setBusyId(null);
    setCollectId(null);
    if (error) {
      flash("error", error.message);
      return;
    }
    const r = data as { paid: number; due: number; status: string };
    setInvoices((prev) =>
      prev.map((x) =>
        x.id === inv.id ? { ...x, paid: r.paid, due: r.due, status: r.status } : x
      )
    );
    flash("success", `${inv.invoice_number} — ${inr(amt)} collected (${collectMethod.toUpperCase()})`);
    logAudit({
      action: "payment",
      entity: "invoice",
      entity_id: inv.id,
      description: `Payment of ${inr(amt)} received (${collectMethod})`,
      details: { invoice_number: inv.invoice_number, method: collectMethod, amount: amt },
    });
  }

  async function copyNumber(n: string) {
    try {
      await navigator.clipboard.writeText(n);
      flash("success", `Invoice number ${n} copied`);
    } catch {
      flash("error", "Copy failed on this browser");
    }
  }

  function setViewMode(v: "cards" | "list") {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      if (tab === "invoices") {
        const rows = sorted.map((r) => ({
          invoice: r.invoice_number,
          date: r.invoice_date,
          customer: r.customers?.name ?? "Walk-in",
          mobile: r.customers?.phone ?? "",
          total: Number(r.total),
          paid: Number(r.paid),
          due: Number(r.due),
          returned: Number(r.returned),
          refunded: Number(r.refunded),
          status: r.status,
        }));
        const headers = ["Invoice", "Date", "Customer", "Mobile", "Total", "Paid", "Due", "Returned", "Refunded", "Status"];
        const csv = (v: string | number) => {
          const s = String(v).replace(/"/g, '""');
          return /[",\n]/.test(s) ? `"${s}"` : s;
        };
        const lines = [
          headers.join(","),
          ...rows.map((r) => [r.invoice, r.date, r.customer, r.mobile, r.total, r.paid, r.due, r.returned, r.refunded, r.status].map(csv).join(",")),
        ];
        const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
        flash("success", `${rows.length} invoices exported`);
      } else {
        const rows = sortedQuick.map((r) => ({
          sale: r.sale_number,
          date: r.sale_date,
          customer: r.customers?.name ?? "Walk-in",
          mobile: r.customers?.phone ?? "",
          item: r.item_name ?? r.products?.name ?? r.services?.name ?? "Quick sale",
          amount: Number(r.amount),
          cost: Number(r.cost),
          tendered: r.tendered != null ? Number(r.tendered) : "",
          change: Number(r.change_due),
          status: r.status,
        }));
        const headers = ["Sale", "Date", "Customer", "Mobile", "Item", "Amount", "Cost", "Tendered", "Change", "Status"];
        const csv = (v: string | number) => {
          const s = String(v).replace(/"/g, '""');
          return /[",\n]/.test(s) ? `"${s}"` : s;
        };
        const lines = [
          headers.join(","),
          ...rows.map((r) => [r.sale, r.date, r.customer, r.mobile, r.item, r.amount, r.cost, r.tendered, r.change, r.status].map(csv).join(",")),
        ];
        const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `quick-sales-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
        flash("success", `${rows.length} quick sales exported`);
      }
      logAudit({
        action: "export",
        entity: "report",
        entity_id: null,
        description: `Exported ${tab === "invoices" ? sorted.length : sortedQuick.length} ${tab} to CSV from Invoices`,
      });
    } catch (e: any) {
      flash("error", e?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const KPI_CARDS = [
    {
      label: "Total Sales",
      value: inr(stats.total),
      sub: `${stats.count} invoice${stats.count === 1 ? "" : "s"}`,
      icon: <FileText className="h-4.5 w-4.5 text-blue-600" />,
      grad: "from-blue-500 to-indigo-600",
      iconBg: "bg-blue-100 dark:bg-blue-950/40",
    },
    {
      label: "Collected",
      value: inr(stats.paid),
      sub: `${rate}% collection rate`,
      icon: <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" />,
      grad: "from-emerald-500 to-teal-600",
      iconBg: "bg-emerald-100 dark:bg-emerald-950/40",
    },
    {
      label: "Outstanding",
      value: inr(stats.due),
      sub: `${counts.unpaid ?? 0} unpaid · ${counts.partial ?? 0} partial`,
      icon: <Clock className="h-4.5 w-4.5 text-amber-600" />,
      grad: "from-amber-500 to-orange-600",
      iconBg: "bg-amber-100 dark:bg-amber-950/40",
    },
    {
      label: "Returned",
      value: inr(stats.returned),
      sub: `Refunded ${inr(stats.refunded)}`,
      icon: <RotateCcw className="h-4.5 w-4.5 text-rose-600" />,
      grad: "from-rose-500 to-pink-600",
      iconBg: "bg-rose-100 dark:bg-rose-950/40",
    },
    {
      label: "Collection Rate",
      value: `${rate}%`,
      sub: `${inr(stats.paid)} of ${inr(stats.total)}`,
      icon: <TrendingUp className="h-4.5 w-4.5 text-violet-600" />,
      grad: "from-violet-500 to-purple-600",
      iconBg: "bg-violet-100 dark:bg-violet-950/40",
      progress: true,
    },
  ];

  const QUICK_KPI_CARDS = [
    {
      label: "Collected",
      value: inr(quickStats.collected),
      sub: `${quickStats.count} sale${quickStats.count === 1 ? "" : "s"}`,
      icon: <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" />,
      grad: "from-emerald-500 to-teal-600",
      iconBg: "bg-emerald-100 dark:bg-emerald-950/40",
      progress: false,
    },
    {
      label: "Est. Profit",
      value: inr(quickStats.profit),
      sub: `On ${inr(quickStats.cost)} cost`,
      icon: <Zap className="h-4.5 w-4.5 text-blue-600" />,
      grad: "from-blue-500 to-indigo-600",
      iconBg: "bg-blue-100 dark:bg-blue-950/40",
      progress: false,
    },
    {
      label: "Cancelled",
      value: String(quickStats.cancelled),
      sub: `${quickStats.cancelled === 1 ? "sale" : "sales"} reversed`,
      icon: <RotateCcw className="h-4.5 w-4.5 text-rose-600" />,
      grad: "from-rose-500 to-pink-600",
      iconBg: "bg-rose-100 dark:bg-rose-950/40",
      progress: false,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {tab === "invoices" ? "Invoices" : "Quick Sales"}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {tab === "invoices"
              ? "Track sales, payments and returns — every bill, every rupee."
              : "Fast walk-in counter sales — cash-register style."}
          </p>
        </div>
        <a
          href={tab === "invoices" ? "/pos" : "/pos?mode=quick"}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-xs transition hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          <span>New {tab === "invoices" ? "Sale" : "Quick Sale"}</span>
        </a>
      </div>

      {/* Tabs */}
      <div className="mt-5 flex rounded-xl border border-slate-200/90 bg-slate-100/90 p-1 text-sm dark:border-white/10 dark:bg-slate-800/80">
        <button
          onClick={() => setTab("invoices")}
          className={`flex-1 rounded-lg px-4 py-2 font-bold transition ${
            tab === "invoices" ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          Invoices
          <span className={`ml-1.5 rounded-full px-1.5 text-[10px] ${tab === "invoices" ? "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300" : "bg-white/60 dark:bg-white/5"}`}>
            {invoices.length}
          </span>
        </button>
        <button
          onClick={() => setTab("quick")}
          className={`flex-1 rounded-lg px-4 py-2 font-bold transition ${
            tab === "quick" ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          Quick Sales
          <span className={`ml-1.5 rounded-full px-1.5 text-[10px] ${tab === "quick" ? "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300" : "bg-white/60 dark:bg-white/5"}`}>
            {quickSales.length}
          </span>
        </button>
      </div>

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        {(tab === "invoices" ? KPI_CARDS : QUICK_KPI_CARDS).map((c) => (
          <div key={c.label} className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-slate-900">
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${c.grad}`} />
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{c.label}</p>
              <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${c.iconBg} shadow-xs`}>
                {c.icon}
              </div>
            </div>
            <p className="mt-1.5 text-xl font-bold tracking-tight text-slate-900 dark:text-white">{c.value}</p>
            <p className="mt-0.5 text-xs text-slate-400">{c.sub}</p>
            {c.progress && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                <div className={`h-full rounded-full bg-gradient-to-r ${c.grad}`} style={{ width: `${Math.min(100, rate)}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tab === "invoices" ? "Search invoice no, customer or mobile…" : "Search sale no, item, customer or mobile…"}
            className="w-full rounded-xl border border-slate-200/90 bg-white py-2 pl-9 pr-3 text-xs font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-slate-200/90 bg-slate-100/90 p-1 text-xs dark:border-white/10 dark:bg-slate-800/80">
            <button
              onClick={() => setViewMode("cards")}
              title="Card view"
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${
                view === "cards" ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              title="List view"
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${
                view === "list" ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
          {tab === "invoices" ? (
          <div className="flex rounded-xl border border-slate-200/90 bg-slate-100/90 p-1 text-xs dark:border-white/10 dark:bg-slate-800/80">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`rounded-lg px-3 py-1.5 font-bold capitalize transition ${
                  status === s ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
                }`}
              >
                {s === "all" ? "All" : s}
                <span className={`ml-1 rounded-full px-1.5 text-[10px] ${status === s ? "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300" : "bg-white/60 dark:bg-white/5"}`}>
                  {counts[s] ?? 0}
                </span>
              </button>
            ))}
          </div>
          ) : (
          <div className="flex rounded-xl border border-slate-200/90 bg-slate-100/90 p-1 text-xs dark:border-white/10 dark:bg-slate-800/80">
            {(["all", "active", "cancelled"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setQuickStatus(s)}
                className={`rounded-lg px-3 py-1.5 font-bold capitalize transition ${
                  quickStatus === s ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
                }`}
              >
                {s === "all" ? "All" : s}
              </button>
            ))}
          </div>
          )}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-xl border border-slate-200/90 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs outline-none transition focus:border-blue-500 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            onClick={exportCsv}
            disabled={exporting || (tab === "invoices" ? sorted.length === 0 : sortedQuick.length === 0)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{exporting ? "Exporting…" : "Export CSV"}</span>
          </button>
          <span className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">
            {tab === "invoices"
              ? `${sorted.length} invoice${sorted.length === 1 ? "" : "s"}`
              : `${sortedQuick.length} quick sale${sortedQuick.length === 1 ? "" : "s"}`}
          </span>
          <CompactToggle value={compact} onChange={setCompact} storageKey="sccomm-invoices-compact" />
        </div>
      </div>

      {/* Cards / List */}
      {tab === "invoices" && (
      <>
      {view === "cards" ? (
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.map((inv) => {
          const total = Number(inv.total) || 0;
          const paid = Number(inv.paid) || 0;
          const due = Number(inv.due) || 0;
          const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
          const cancelled = inv.status === "cancelled";
          const collectable = !cancelled && due > 0;
          const customer = inv.customers?.name ?? "Walk-in";
          const hasReturn = Number(inv.returned) > 0;
          const hasRefund = Number(inv.refunded) > 0;
          return (
            <div
              key={inv.id}
              onClick={() => setViewId(inv.id)}
              className={`bento-surface-interactive group relative flex cursor-pointer flex-col overflow-hidden p-5 dark:bg-slate-900/90 ${
                cancelled ? "opacity-60" : ""
              }`}
            >
              <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${BAR_STYLE[inv.status] ?? "bg-slate-300"}`} />
              <div className="flex flex-1 flex-col pt-1">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`icon-box-3d h-11 w-11 shrink-0 bg-gradient-to-br ${gradient(customer)} text-sm font-black text-white shadow-sm`}>
                      {customer.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{inv.invoice_number}</p>
                      <p className="truncate text-xs text-slate-400">{customer}</p>
                      {inv.customers?.phone && (
                        <p className="truncate text-[11px] text-slate-300">{inv.customers.phone}</p>
                      )}
                    </div>
                  </div>
                  {statusBadge(inv.status)}
                </div>

                {/* Amounts */}
                <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100 sm:gap-3 dark:bg-slate-800/60 dark:ring-white/5">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Total</p>
                    <p className="mt-0.5 truncate text-sm font-bold text-slate-900 dark:text-white">{inr(total)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Paid</p>
                    <p className="mt-0.5 truncate text-sm font-bold text-emerald-600 dark:text-emerald-400">{inr(paid)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Due</p>
                    <p className="mt-0.5 truncate text-sm font-bold text-rose-600 dark:text-rose-400">{inr(due)}</p>
                  </div>
                </div>

                {/* Progress */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-slate-500 dark:text-slate-400">{pct}% collected</span>
                    <span className="text-slate-400">{fmtDate(inv.invoice_date)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                    <div className={`h-full rounded-full ${BAR_STYLE[inv.status]}`} style={{ width: `${cancelled ? 0 : pct}%` }} />
                  </div>
                </div>

                {/* Meta chips */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(hasReturn || hasRefund) && (
                    <>
                      {hasReturn && (
                        <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">Returned {inr(inv.returned)}</span>
                      )}
                      {hasRefund && (
                        <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">Refunded {inr(inv.refunded)}</span>
                      )}
                    </>
                  )}
                  {collectable && (
                    <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">{inr(due)} to collect</span>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-4 flex items-center gap-1.5 border-t border-slate-100 pt-3 dark:border-white/5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyNumber(inv.invoice_number);
                    }}
                    title="Copy invoice number"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 dark:border-white/10 dark:hover:bg-slate-800"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <a
                    href={`/receipt/${inv.id}/a4`}
                    target="_blank"
                    onClick={(e) => e.stopPropagation()}
                    title="Print A4 Invoice / PDF"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 dark:border-white/10 dark:hover:bg-slate-800"
                  >
                    <Printer className="h-3.5 w-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSendInvoiceWhatsApp(inv);
                    }}
                    title="Send Invoice on WhatsApp"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                  </button>
                  {!cancelled && (
                    <a
                      href={`/pos?edit=${inv.id}`}
                      onClick={(e) => e.stopPropagation()}
                      title="Edit Invoice"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-600 transition hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-300"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewId(inv.id);
                    }}
                    className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                  >
                    View
                  </button>
                  {collectable && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCollectMethod("cash");
                        setCollectId(inv.id);
                      }}
                      className="rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:from-emerald-600 hover:to-teal-600"
                    >
                      Collect
                    </button>
                  )}
                </div>

                {/* Quick collect panel */}
                {collectId === inv.id && (
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-2">
                    <p className="px-1 text-[11px] font-semibold text-emerald-700">
                      Collect {inr(due)} from {customer}?
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <select
                        value={collectMethod}
                        onChange={(e) => setCollectMethod(e.target.value)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none"
                      >
                        {METHODS.map((m) => (
                          <option key={m} value={m}>
                            {m.toUpperCase()}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => collectDue(inv)}
                        disabled={busyId === inv.id}
                        className="flex-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {busyId === inv.id ? "Recording…" : "Confirm"}
                      </button>
                      <button
                        onClick={() => setCollectId(null)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-500 transition hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="overflow-x-auto">
            <table className={`w-full min-w-[920px] text-left text-sm ${compact ? "rows-compact" : ""}`}>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3">Invoice</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Due</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((inv) => {
                  const total = Number(inv.total) || 0;
                  const paid = Number(inv.paid) || 0;
                  const due = Number(inv.due) || 0;
                  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
                  const cancelled = inv.status === "cancelled";
                  const collectable = !cancelled && due > 0;
                  const customer = inv.customers?.name ?? "Walk-in";
                  const hasReturn = Number(inv.returned) > 0;
                  const hasRefund = Number(inv.refunded) > 0;
                  return (
                    <Fragment key={inv.id}>
                      <tr
                        onClick={() => setViewId(inv.id)}
                        className="cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 dark:border-white/5 dark:hover:bg-slate-800/60"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-slate-900 dark:text-white">{inv.invoice_number}</p>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyNumber(inv.invoice_number);
                              }}
                              title="Copy invoice number"
                              className="text-slate-300 transition hover:text-slate-600 dark:hover:text-slate-200"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <div className="cell-sub flex flex-wrap gap-1">
                              {hasReturn && (
                                <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">R {inr(inv.returned)}</span>
                              )}
                              {hasRefund && (
                                <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">RF {inr(inv.refunded)}</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${gradient(customer)} text-[11px] font-bold text-white`}>
                              {customer.slice(0, 1).toUpperCase()}
                            </div>
                            <span className="max-w-[140px] truncate text-slate-600 dark:text-slate-300">{customer}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">{fmtDate(inv.invoice_date)}</td>
                        <td className="px-4 py-3 text-right">
                          <p className="font-semibold text-slate-900 dark:text-white">{inr(total)}</p>
                          <div className="cell-sub ml-auto mt-1 h-1 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                            <div
                              className={`h-full rounded-full ${BAR_STYLE[inv.status] ?? "bg-slate-300"}`}
                              style={{ width: `${cancelled ? 0 : pct}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-emerald-600 dark:text-emerald-400">{inr(paid)}</td>
                        <td className="px-4 py-3 text-right font-medium text-rose-600 dark:text-rose-400">{inr(due)}</td>
                        <td className="px-4 py-3">{statusBadge(inv.status)}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <a
                              href={`/receipt/${inv.id}/a4`}
                              target="_blank"
                              onClick={(e) => e.stopPropagation()}
                              title="Print A4 Invoice / PDF"
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 dark:border-white/10 dark:hover:bg-slate-800"
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </a>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSendInvoiceWhatsApp(inv);
                              }}
                              title="Send Invoice on WhatsApp"
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300"
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                            </button>
                            {!cancelled && (
                              <a
                                href={`/pos?edit=${inv.id}`}
                                onClick={(e) => e.stopPropagation()}
                                title="Edit Invoice"
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-600 transition hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-300"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </a>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewId(inv.id);
                              }}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                            >
                              View
                            </button>
                            {collectable && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCollectMethod("cash");
                                  setCollectId(inv.id);
                                }}
                                className="rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:from-emerald-600 hover:to-teal-600"
                              >
                                Collect
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {collectId === inv.id && (
                        <tr className="bg-emerald-50/60">
                          <td colSpan={8} className="px-5 py-2.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-[11px] font-semibold text-emerald-700">
                                Collect {inr(due)} from {customer}?
                              </p>
                              <select
                                value={collectMethod}
                                onChange={(e) => setCollectMethod(e.target.value)}
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none"
                              >
                                {METHODS.map((m) => (
                                  <option key={m} value={m}>
                                    {m.toUpperCase()}
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() => collectDue(inv)}
                                disabled={busyId === inv.id}
                                className="flex-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                              >
                                {busyId === inv.id ? "Recording…" : "Confirm"}
                              </button>
                              <button
                                onClick={() => setCollectId(null)}
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-500 transition hover:bg-slate-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
</div>
      )}

      {sorted.length === 0 && (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 py-16 text-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto h-10 w-10 text-slate-300">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" />
          </svg>
          <p className="mt-3 text-sm font-medium text-slate-600">No invoices found</p>
          <p className="mt-1 text-xs text-slate-400">
            {q || status !== "all"
              ? "Try a different search or filter."
              : "Create your first sale from the Point of Sale."}
          </p>
        </div>
      )}
      </>
      )}

      {tab === "quick" && (
        <>
          {view === "cards" ? (
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {sortedQuick.map((s) => {
                const customer = s.customers?.name ?? "Walk-in";
                const cancelled = s.status === "cancelled";
                const item = s.item_name ?? s.products?.name ?? s.services?.name ?? "Quick sale";
                return (
                  <div
                    key={s.id}
                    onClick={() => setQuickViewId(s.id)}
                    className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-slate-900 ${
                      cancelled ? "opacity-70" : ""
                    }`}
                  >
                    <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${cancelled ? "bg-slate-300 dark:bg-slate-700" : "from-emerald-500 to-teal-400"}`} />
                    <div className="flex flex-1 flex-col p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient(customer)} text-sm font-bold text-white shadow-sm`}>
                            {customer.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{s.sale_number}</p>
                            <p className="truncate text-xs text-slate-400">{customer}</p>
                            {s.customers?.phone && (
                              <p className="truncate text-[11px] text-slate-400">{s.customers.phone}</p>
                            )}
                          </div>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ${
                            cancelled ? "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-white/10" : "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/40"
                          }`}
                        >
                          {s.status}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100 dark:bg-slate-800/60 dark:ring-white/5">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Item</p>
                          <p className="mt-0.5 truncate text-sm font-semibold text-slate-900 dark:text-white">{item}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Amount</p>
                          <p className="mt-0.5 truncate text-sm font-bold text-emerald-600 dark:text-emerald-400">{inr(Number(s.amount))}</p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">{fmtDate(s.sale_date)}</span>
                        {s.created_at && (
                          <span className="text-slate-400">
                            {new Date(s.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </div>

                      <div className="mt-4 flex items-center gap-1.5 border-t border-slate-100 pt-3 dark:border-white/5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyNumber(s.sale_number);
                          }}
                          title="Copy sale number"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 dark:border-white/10 dark:hover:bg-slate-800"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <a
                          href={`/receipt/quick/${s.id}`}
                          target="_blank"
                          onClick={(e) => e.stopPropagation()}
                          title="Print 80mm receipt"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 dark:border-white/10 dark:hover:bg-slate-800"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSendQuickSaleWhatsApp(s);
                          }}
                          title="Send receipt on WhatsApp"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setQuickViewId(s.id);
                          }}
                          className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={`mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900 ${compact ? "table-compact" : ""}`}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-400">
                    <tr>
                      <th className="px-5 py-3">Sale #</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Item</th>
                      <th className="px-4 py-3">Date & Time</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {sortedQuick.map((s) => {
                      const customer = s.customers?.name ?? "Walk-in";
                      const cancelled = s.status === "cancelled";
                      const item = s.item_name ?? s.products?.name ?? s.services?.name ?? "Quick sale";
                      return (
                        <tr
                          key={s.id}
                          onClick={() => setQuickViewId(s.id)}
                          className="cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
                        >
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-slate-900 dark:text-white">{s.sale_number}</p>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyNumber(s.sale_number);
                                }}
                                title="Copy sale number"
                                className="text-slate-300 transition hover:text-slate-600 dark:hover:text-slate-200"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${gradient(customer)} text-[11px] font-bold text-white`}>
                                {customer.slice(0, 1).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="max-w-[140px] truncate font-medium text-slate-700 dark:text-slate-200">{customer}</p>
                                {s.customers?.phone && (
                                  <p className="text-[11px] text-slate-400">{s.customers.phone}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="max-w-[200px] truncate px-4 py-3 font-medium text-slate-900 dark:text-white">
                            {item}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                            <div>{fmtDate(s.sale_date)}</div>
                            {s.created_at && (
                              <div className="text-[11px] text-slate-400">
                                {new Date(s.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                            {inr(Number(s.amount))}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ${
                                cancelled ? "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-white/10" : "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/40"
                              }`}
                            >
                              {s.status}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <a
                                href={`/receipt/quick/${s.id}`}
                                target="_blank"
                                onClick={(e) => e.stopPropagation()}
                                title="Print 80mm receipt"
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 dark:border-white/10 dark:hover:bg-slate-800"
                              >
                                <Printer className="h-3.5 w-3.5" />
                              </a>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSendQuickSaleWhatsApp(s);
                                }}
                                title="Send receipt on WhatsApp"
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300"
                              >
                                <MessageSquare className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setQuickViewId(s.id);
                                }}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                              >
                                View
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "quick" && sortedQuick.length === 0 && (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 py-16 text-center">
          <Zap className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-600">No quick sales found</p>
          <p className="mt-1 text-xs text-slate-400">
            {q || quickStatus !== "all"
              ? "Try a different search or filter."
              : "Create your first quick sale from the Point of Sale."}
          </p>
        </div>
      )}

      {returnId && (
        <ReturnModal
          invoiceId={returnId}
          onClose={() => setReturnId(null)}
          onReturned={handleReturned}
        />
      )}
      {viewId && (
        <InvoiceViewModal
          invoiceId={viewId}
          onClose={() => setViewId(null)}
          onChanged={handleChanged}
          onReturn={setReturnId}
        />
      )}
      {quickViewId && (
        <QuickSaleViewModal
          saleId={quickViewId}
          onClose={() => setQuickViewId(null)}
          onCancelled={(id) => {
            setQuickSales((prev) => prev.map((s) => (s.id === id ? { ...s, status: "cancelled" } : s)));
          }}
        />
      )}

      {waModal && (
        <WhatsAppSendModal
          open={Boolean(waModal)}
          onClose={() => setWaModal(null)}
          phone={waModal.phone}
          recipientName={waModal.name}
          initialMessage={waModal.msg}
          messageType={waModal.type}
          refId={waModal.refId}
          refNumber={waModal.refNum}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div
            className={`rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg ${
              toast.type === "success" ? "bg-emerald-600" : "bg-rose-600"
            }`}
          >
            {toast.text}
          </div>
        </div>
      )}
    </div>
  );
}