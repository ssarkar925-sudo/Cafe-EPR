"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import InvoiceViewModal from "./invoice-view-modal";
import ReturnModal from "./return-modal";

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
  customers: { name: string } | null;
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
}: {
  initialInvoices: InvoiceRow[];
}) {
  const [invoices, setInvoices] = useState<InvoiceRow[]>(initialInvoices);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [sort, setSort] = useState("newest");
  const [view, setView] = useState<"cards" | "list">(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "cards";
    } catch {
      return "cards";
    }
  });
  const [viewId, setViewId] = useState<string | null>(null);
  const [returnId, setReturnId] = useState<string | null>(null);
  const [collectId, setCollectId] = useState<string | null>(null);
  const [collectMethod, setCollectMethod] = useState<string>("cash");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const timerRef = useRef<number | null>(null);

  const supabase = createClient();

  function flash(type: "success" | "error", text: string) {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3200);
  }

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
        (inv.customers?.name ?? "").toLowerCase().includes(needle)
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
      const rows = sorted.map((r) => ({
        invoice: r.invoice_number,
        date: r.invoice_date,
        customer: r.customers?.name ?? "Walk-in",
        total: Number(r.total),
        paid: Number(r.paid),
        due: Number(r.due),
        returned: Number(r.returned),
        refunded: Number(r.refunded),
        status: r.status,
      }));
      const headers = ["Invoice", "Date", "Customer", "Total", "Paid", "Due", "Returned", "Refunded", "Status"];
      const csv = (v: string | number) => {
        const s = String(v).replace(/"/g, '""');
        return /[",\n]/.test(s) ? `"${s}"` : s;
      };
      const lines = [
        headers.join(","),
        ...rows.map((r) => [r.invoice, r.date, r.customer, r.total, r.paid, r.due, r.returned, r.refunded, r.status].map(csv).join(",")),
      ];
      const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      flash("success", `${rows.length} invoices exported`);
      logAudit({
        action: "export",
        entity: "report",
        entity_id: null,
        description: `Exported ${rows.length} invoices to CSV from Invoices`,
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
      icon: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
      grad: "from-blue-500 to-indigo-600",
      iconBg: "bg-blue-100 text-blue-600",
    },
    {
      label: "Collected",
      value: inr(stats.paid),
      sub: `${rate}% collection rate`,
      icon: "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14l-3-3",
      grad: "from-emerald-500 to-teal-600",
      iconBg: "bg-emerald-100 text-emerald-600",
    },
    {
      label: "Outstanding",
      value: inr(stats.due),
      sub: `${counts.unpaid ?? 0} unpaid · ${counts.partial ?? 0} partial`,
      icon: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z",
      grad: "from-amber-500 to-orange-600",
      iconBg: "bg-amber-100 text-amber-600",
    },
    {
      label: "Returned",
      value: inr(stats.returned),
      sub: `Refunded ${inr(stats.refunded)}`,
      icon: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
      grad: "from-rose-500 to-pink-600",
      iconBg: "bg-rose-100 text-rose-600",
    },
    {
      label: "Collection Rate",
      value: `${rate}%`,
      sub: `${inr(stats.paid)} of ${inr(stats.total)}`,
      icon: "M3 3v18h18M7 14l4-4 3 3 5-6",
      grad: "from-violet-500 to-purple-600",
      iconBg: "bg-violet-100 text-violet-600",
      progress: true,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
          <p className="text-sm text-slate-500">Track sales, payments and returns — every bill, every rupee.</p>
        </div>
        <a
          href="/pos"
          className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
        >
          + New Sale
        </a>
      </div>

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        {KPI_CARDS.map((c) => (
          <div key={c.label} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${c.grad}`} />
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">{c.label}</p>
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${c.iconBg} shadow-sm`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
                  <path d={c.icon} />
                </svg>
              </div>
            </div>
            <p className="mt-1.5 text-xl font-bold tracking-tight text-slate-900">{c.value}</p>
            <p className="mt-0.5 text-xs text-slate-400">{c.sub}</p>
            {c.progress && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full bg-gradient-to-r ${c.grad}`} style={{ width: `${Math.min(100, rate)}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-[220px] flex-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search invoice no or customer…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-1 text-xs">
            <button
              onClick={() => setViewMode("cards")}
              title="Card view"
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
                view === "cards" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode("list")}
              title="List view"
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
                view === "list" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
              </svg>
            </button>
          </div>
          <div className="flex rounded-xl bg-slate-100 p-1 text-xs">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`rounded-lg px-3 py-1.5 font-medium capitalize transition ${
                  status === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {s === "all" ? "All" : s}
                <span className={`ml-1 rounded-full px-1.5 text-[10px] ${status === s ? "bg-slate-100 text-slate-500" : "bg-white/60"}`}>
                  {counts[s] ?? 0}
                </span>
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 outline-none transition focus:border-blue-500"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            onClick={exportCsv}
            disabled={exporting || sorted.length === 0}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
          <span className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
            {sorted.length} invoice{sorted.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {/* Cards */}
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
              className={`group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${
                cancelled ? "opacity-70" : ""
              }`}
            >
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${BAR_STYLE[inv.status] ?? "bg-slate-300"}`} />
              <div className="flex flex-1 flex-col p-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient(customer)} text-sm font-bold text-white shadow-sm`}>
                      {customer.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{inv.invoice_number}</p>
                      <p className="truncate text-xs text-slate-400">{customer}</p>
                    </div>
                  </div>
                  {statusBadge(inv.status)}
                </div>

                {/* Amounts */}
                <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Total</p>
                    <p className="mt-0.5 text-sm font-bold text-slate-900">{inr(total)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Paid</p>
                    <p className="mt-0.5 text-sm font-bold text-emerald-600">{inr(paid)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Due</p>
                    <p className="mt-0.5 text-sm font-bold text-rose-600">{inr(due)}</p>
                  </div>
                </div>

                {/* Progress */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-slate-500">{pct}% collected</span>
                    <span className="text-slate-400">{fmtDate(inv.invoice_date)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${BAR_STYLE[inv.status]}`} style={{ width: `${cancelled ? 0 : pct}%` }} />
                  </div>
                </div>

                {/* Meta chips */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(hasReturn || hasRefund) && (
                    <>
                      {hasReturn && (
                        <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-600">Returned {inr(inv.returned)}</span>
                      )}
                      {hasRefund && (
                        <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-600">Refunded {inr(inv.refunded)}</span>
                      )}
                    </>
                  )}
                  {collectable && (
                    <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">{inr(due)} to collect</span>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-4 flex items-center gap-1.5 border-t border-slate-100 pt-3">
                  <button
                    onClick={() => copyNumber(inv.invoice_number)}
                    title="Copy invoice number"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                      <path d="M8 8h12v12H8zM4 16H2V2h14v2" />
                    </svg>
                  </button>
                  <a
                    href={`/receipt/${inv.id}`}
                    target="_blank"
                    title="Print 80mm receipt"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                      <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />
                    </svg>
                  </a>
                  <button
                    onClick={() => setViewId(inv.id)}
                    className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    View
                  </button>
                  {collectable && (
                    <button
                      onClick={() => {
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
            <table className="w-full min-w-[920px] text-left text-sm">
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
                      <tr className="border-b border-slate-100 transition hover:bg-slate-50/60">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-slate-900">{inv.invoice_number}</p>
                            <button
                              onClick={() => copyNumber(inv.invoice_number)}
                              title="Copy invoice number"
                              className="text-slate-300 transition hover:text-slate-600"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                                <path d="M8 8h12v12H8zM4 16H2V2h14v2" />
                              </svg>
                            </button>
                            <div className="flex flex-wrap gap-1">
                              {hasReturn && (
                                <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-600">R {inr(inv.returned)}</span>
                              )}
                              {hasRefund && (
                                <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-600">RF {inr(inv.refunded)}</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${gradient(customer)} text-[11px] font-bold text-white`}>
                              {customer.slice(0, 1).toUpperCase()}
                            </div>
                            <span className="max-w-[140px] truncate text-slate-600">{customer}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">{fmtDate(inv.invoice_date)}</td>
                        <td className="px-4 py-3 text-right">
                          <p className="font-semibold text-slate-900">{inr(total)}</p>
                          <div className="ml-auto mt-1 h-1 w-16 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${BAR_STYLE[inv.status] ?? "bg-slate-300"}`}
                              style={{ width: `${cancelled ? 0 : pct}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-emerald-600">{inr(paid)}</td>
                        <td className="px-4 py-3 text-right font-medium text-rose-600">{inr(due)}</td>
                        <td className="px-4 py-3">{statusBadge(inv.status)}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <a
                              href={`/receipt/${inv.id}`}
                              target="_blank"
                              title="Print 80mm receipt"
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                                <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />
                              </svg>
                            </a>
                            <button
                              onClick={() => setViewId(inv.id)}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                            >
                              View
                            </button>
                            {collectable && (
                              <button
                                onClick={() => {
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