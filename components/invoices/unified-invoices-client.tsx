"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { FileText, Search, Plus, Printer, Eye, MessageSquare, RotateCcw, CreditCard } from "lucide-react";
import InvoiceViewModal from "./invoice-view-modal";
import QuickSaleViewModal from "./quick-sale-view-modal";
import MultiPaymentCollection, { type PaymentAllocation } from "@/components/business/multi-payment-collection";
import { DEFAULT_WA_TEMPLATES, getWhatsAppConfig, renderWhatsAppTemplate, sendWhatsAppMessage } from "@/lib/whatsapp";
import { logAudit } from "@/lib/audit";

export type UnifiedInvoiceRow = {
  id: string;
  number: string;
  date: string;
  total: number;
  paid: number;
  due: number;
  status: string;
  customer: { name?: string | null; phone?: string | null } | null;
  source: "pos" | "quick";
  item?: string | null;
  cost?: number;
};

type Props = {
  initialInvoices: any[];
  initialQuickSales: any[];
};

function normalize(invoices: any[], quickSales: any[]): UnifiedInvoiceRow[] {
  const pos = invoices.map((row) => ({
    id: String(row.id),
    number: String(row.invoice_number ?? ""),
    date: String(row.invoice_date ?? ""),
    total: Number(row.total ?? 0),
    paid: Number(row.paid ?? 0),
    due: Number(row.due ?? 0),
    status: String(row.status ?? "unpaid"),
    customer: Array.isArray(row.customers) ? row.customers[0] ?? null : row.customers ?? null,
    source: "pos" as const,
  }));
  const quick = quickSales.map((row) => ({
    id: String(row.id),
    number: String(row.sale_number ?? ""),
    date: String(row.sale_date ?? ""),
    total: Number(row.amount ?? 0),
    paid: Number(row.amount ?? 0),
    due: 0,
    status: String(row.status ?? "paid"),
    customer: Array.isArray(row.customers) ? row.customers[0] ?? null : row.customers ?? null,
    source: "quick" as const,
    item: row.item_name ?? row.products?.name ?? row.services?.name ?? "Quick Sale",
    cost: Number(row.cost ?? 0),
  }));
  return [...pos, ...quick].sort((a, b) => `${b.date}-${b.id}`.localeCompare(`${a.date}-${a.id}`));
}

function fmtDate(value: string) {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function statusClass(status: string) {
  if (status === "paid") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "partial") return "bg-amber-50 text-amber-700 ring-amber-200";
  if (status === "cancelled") return "bg-slate-100 text-slate-500 ring-slate-200";
  return "bg-rose-50 text-rose-700 ring-rose-200";
}

export default function UnifiedInvoicesClient({ initialInvoices, initialQuickSales }: Props) {
  const supabase = createClient();
  const [invoices, setInvoices] = useState(initialInvoices);
  const [quickSales, setQuickSales] = useState(initialQuickSales);
  const [q, setQ] = useState("");
  const [source, setSource] = useState<"all" | "pos" | "quick">("all");
  const [status, setStatus] = useState("all");
  const [viewId, setViewId] = useState<string | null>(null);
  const [quickViewId, setQuickViewId] = useState<string | null>(null);
  const [collectId, setCollectId] = useState<string | null>(null);
  const [allocations, setAllocations] = useState<PaymentAllocation[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const rows = useMemo(() => normalize(invoices, quickSales), [invoices, quickSales]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (source !== "all" && row.source !== source) return false;
      if (status !== "all" && row.status !== status) return false;
      if (!needle) return true;
      return [row.number, row.customer?.name, row.customer?.phone, row.item].filter(Boolean).some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [rows, q, source, status]);

  const stats = useMemo(() => {
    const active = rows.filter((r) => r.status !== "cancelled");
    return {
      count: active.length,
      total: active.reduce((s, r) => s + r.total, 0),
      paid: active.reduce((s, r) => s + r.paid, 0),
      due: active.reduce((s, r) => s + r.due, 0),
      pos: rows.filter((r) => r.source === "pos").length,
      quick: rows.filter((r) => r.source === "quick").length,
    };
  }, [rows]);

  async function refresh() {
    const [a, b] = await Promise.all([
      supabase.from("invoices").select("id, invoice_number, invoice_date, total, paid, due, returned, refunded, status, created_at, customers(name, phone)").order("created_at", { ascending: false }).limit(500),
      supabase.from("quick_sales").select("id, sale_number, sale_date, amount, cost, status, created_at, customers(name, phone), products(name), services(name), item_name").order("created_at", { ascending: false }).limit(500),
    ]);
    if (a.data) setInvoices(a.data);
    if (b.data) setQuickSales(b.data);
  }

  useEffect(() => {
    const channel = supabase.channel(`unified-invoices-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "quick_sales" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  async function collect() {
    if (!collectId) return;
    const allocationRows = allocations.filter((x) => Number(x.amount) > 0);
    if (!allocationRows.length) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("record_invoice_multi_payment", { p_invoice_id: collectId, p_allocations: allocationRows });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    const result = data as { paid: number; due: number; status: string };
    setInvoices((current) => current.map((row) => row.id === collectId ? { ...row, paid: result.paid, due: result.due, status: result.status } : row));
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
    const msg = row.source === "pos"
      ? renderWhatsAppTemplate(cfg.templates?.pos_invoice || DEFAULT_WA_TEMPLATES.pos_invoice, { shop_name: "Sarkar Communication", invoice_number: row.number, invoice_date: row.date, customer_name: row.customer?.name || "Customer", total_amount: inr(row.total), paid_amount: inr(row.paid), due_amount: inr(row.due), status_line: row.status === "paid" ? "Fully Paid" : `Balance Due: ${inr(row.due)}`, receipt_url: url })
      : `🧾 Receipt: ${row.number}\n📅 Date: ${row.date}\n👤 Customer: ${row.customer?.name || "Walk-in"}\n💰 Amount: ${inr(row.total)}\n📄 Receipt: ${url}`;
    const result = await sendWhatsAppMessage({ phone, message: msg });
    if (!result.ok) window.open(result.fallbackUrl, "_blank", "noopener");
  }

  function open(row: UnifiedInvoiceRow) {
    if (row.source === "pos") setViewId(row.id); else setQuickViewId(row.id);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">Invoices</h1>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-300">ONE LEDGER</span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">POS bills and Quick Sales are shown together in one invoice register.</p>
        </div>
        <a href="/pos" className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700"><Plus className="h-4 w-4" /> New Invoice</a>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Active", String(stats.count), "Invoices"],
          ["Billed", inr(stats.total), "POS + Quick"],
          ["Collected", inr(stats.paid), "Received"],
          ["Due", inr(stats.due), "Outstanding"],
        ].map(([label, value, sub]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-white/10 dark:bg-slate-900"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{value}</p><p className="text-[10px] font-medium text-slate-400">{sub}</p></div>)}
      </div>

      <div className="mt-5 flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search invoice number, customer, mobile or item…" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs font-semibold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-slate-900 dark:text-white" /></div>
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-white/10 dark:bg-slate-800">
          {(["all", "pos", "quick"] as const).map((value) => <button key={value} onClick={() => setSource(value)} className={`rounded-lg px-3 py-1.5 text-[11px] font-bold ${source === value ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white" : "text-slate-500"}`}>{value === "all" ? `All (${rows.length})` : value === "pos" ? `POS (${stats.pos})` : `Quick Sale (${stats.quick})`}</button>)}
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold dark:border-white/10 dark:bg-slate-900 dark:text-white"><option value="all">All status</option><option value="paid">Paid</option><option value="partial">Partial</option><option value="unpaid">Unpaid</option><option value="cancelled">Cancelled</option></select>
      </div>

      {message && <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">{message}</div>}

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead><tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:border-white/10 dark:bg-slate-950"><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Date</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Paid</th><th className="px-4 py-3 text-right">Due</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
            <tbody>
              {filtered.map((row) => <tr key={`${row.source}:${row.id}`} onClick={() => open(row)} className="cursor-pointer border-b border-slate-100 hover:bg-blue-50/40 dark:border-white/5 dark:hover:bg-white/[0.025]">
                <td className="px-4 py-3 font-black text-slate-900 dark:text-white">{row.number}</td>
                <td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-[10px] font-black ${row.source === "pos" ? "bg-blue-50 text-blue-700" : "bg-violet-50 text-violet-700"}`}>{row.source === "pos" ? "POS" : "QUICK SALE"}</span></td>
                <td className="px-4 py-3"><p className="font-semibold text-slate-700 dark:text-slate-200">{row.customer?.name || "Walk-in Customer"}</p>{row.item && <p className="text-[10px] text-slate-400">{row.item}</p>}</td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-500">{fmtDate(row.date)}</td>
                <td className="px-4 py-3 text-right font-bold">{inr(row.total)}</td>
                <td className="px-4 py-3 text-right font-bold text-emerald-600">{inr(row.paid)}</td>
                <td className="px-4 py-3 text-right font-bold text-rose-600">{inr(row.due)}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ring-1 ${statusClass(row.status)}`}>{row.status}</span></td>
                <td className="px-4 py-3"><div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <button title="View" onClick={() => open(row)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/10"><Eye className="h-3.5 w-3.5" /></button>
                  <a title="Print" target="_blank" href={row.source === "pos" ? `/receipt/${row.id}/a4` : `/receipt/quick/${row.id}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/10"><Printer className="h-3.5 w-3.5" /></a>
                  <button title="WhatsApp" onClick={() => void sendWhatsApp(row)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600"><MessageSquare className="h-3.5 w-3.5" /></button>
                  {row.source === "pos" && row.due > 0 && row.status !== "cancelled" && <button title="Collect" onClick={() => { setCollectId(row.id); setAllocations([{ method: "cash", amount: row.due.toFixed(2) }]); }} className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white"><CreditCard className="h-3.5 w-3.5" /></button>}
                </div></td>
              </tr>)}
              {!filtered.length && <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-400">No invoices found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {collectId && <div className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-950/40 p-4 sm:items-center"><div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900"><div className="flex items-center justify-between"><div><h2 className="text-base font-black dark:text-white">Collect Invoice Payment</h2><p className="text-xs text-slate-400">Record the remaining amount against this invoice.</p></div><button onClick={() => setCollectId(null)} className="text-slate-400">×</button></div><div className="mt-4"><MultiPaymentCollection totalDue={rows.find((r) => r.id === collectId && r.source === "pos")?.due ?? 0} mode="invoice" onChange={setAllocations} /></div><div className="mt-4 flex justify-end gap-2"><button onClick={() => setCollectId(null)} className="rounded-lg border px-3 py-2 text-xs font-bold">Cancel</button><button disabled={busy} onClick={() => void collect()} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? "Recording…" : "Confirm Payment"}</button></div></div></div>}

      {viewId && <InvoiceViewModal invoiceId={viewId} onClose={() => setViewId(null)} onChanged={(row) => { setInvoices((current) => current.map((x) => x.id === row.id ? { ...x, ...row } : x)); }} />}
      {quickViewId && <QuickSaleViewModal saleId={quickViewId} onClose={() => setQuickViewId(null)} onCancelled={(id) => { setQuickSales((current) => current.map((x) => x.id === id ? { ...x, status: "cancelled" } : x)); }} />}
    </div>
  );
}
