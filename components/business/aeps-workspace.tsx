"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/lib/supabase/realtime";
import { inr } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import SearchableSelect from "@/components/ui/searchable-select";
import FloatingWindow from "@/components/ui/floating-window";
import ScanFillModal from "@/components/scan-fill/scan-fill-modal";
import type { ScanFields } from "@/lib/scan/extract";
import type { CustomerRow, Master, Txn } from "./business-client";
import { useToast } from "@/components/ui/use-toast";
import { downloadCsv } from "@/components/ui/csv";
import { getWhatsAppConfig, renderWhatsAppTemplate, DEFAULT_WA_TEMPLATES } from "@/lib/whatsapp";
import WhatsAppSendModal from "@/components/whatsapp/whatsapp-send-modal";
import { createCustomerRecord, DuplicateCustomerError } from "@/lib/customers";

// Normalization dictionary for common Indian banks
const BANK_ALIASES: Record<string, string> = {
  sbi: "state bank of india",
  "state bank": "state bank of india",
  "sbi bank": "state bank of india",
  pnb: "punjab national bank",
  "punjab national": "punjab national bank",
  bob: "bank of baroda",
  "baroda bank": "bank of baroda",
  boi: "bank of india",
  cbi: "central bank of india",
  ubi: "union bank of india",
  "union bank": "union bank of india",
  iob: "indian overseas bank",
  hdfc: "hdfc bank",
  icici: "icici bank",
  axis: "axis bank",
  kotak: "kotak mahindra bank",
  bandhan: "bandhan bank",
  canara: "canara bank",
  idbi: "idbi bank",
  uco: "uco bank",
  "indian bank": "indian bank",
};

export const TOP_INDIAN_BANKS = [
  { code: "SBI", label: "SBI", match: ["sbi", "state bank of india"] },
  { code: "PNB", label: "PNB", match: ["pnb", "punjab national bank"] },
  { code: "BOB", label: "BoB", match: ["bob", "bank of baroda"] },
  { code: "CANARA", label: "Canara", match: ["canara", "canara bank"] },
  { code: "UBI", label: "UBI", match: ["ubi", "union bank"] },
  { code: "HDFC", label: "HDFC", match: ["hdfc"] },
  { code: "ICICI", label: "ICICI", match: ["icici"] },
  { code: "AXIS", label: "Axis", match: ["axis"] },
  { code: "KOTAK", label: "Kotak", match: ["kotak"] },
  { code: "INDIAN", label: "Indian", match: ["indian bank"] },
];

export function normalizeBankName(raw: string): string {
  let s = (raw || "").toLowerCase().trim();
  s = s.replace(/[,.\\/#!$%^&*;:{}=\\-_~()]/g, " ");
  s = s.replace(/\\b(ltd|limited|bank|the|india|branch)\\b/g, " ");
  s = s.replace(/\\s+/g, " ").trim();
  if (BANK_ALIASES[s]) return BANK_ALIASES[s];
  return s;
}

export function matchBank(inputName: string, bankList: Master[]): Master | null {
  if (!inputName || !inputName.trim()) return null;
  const normInput = normalizeBankName(inputName);
  if (!normInput) return null;

  for (const b of bankList) {
    if (!b.name) continue;
    const normB = normalizeBankName(b.name);
    if (normB === normInput) return b;
    if (normB.includes(normInput) || normInput.includes(normB)) {
      if (normInput.length >= 3 && normB.length >= 3) return b;
    }
  }

  for (const b of bankList) {
    if (b.code && b.code.toLowerCase().trim() === inputName.toLowerCase().trim()) {
      return b;
    }
  }

  return null;
}

/** Privacy-safe mobile masker: e.g. 9876543210 -> 98••••••10 */
export function maskMobile(mobile: string | null | undefined): string {
  if (!mobile) return "";
  const clean = mobile.replace(/\D/g, "");
  if (clean.length === 10) {
    return `${clean.slice(0, 2)}••••••${clean.slice(-2)}`;
  }
  return clean;
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d.length === 10 ? d + "T00:00:00" : d);
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtTime(d?: string | null) {
  if (!d) return "";
  try {
    const dt = new Date(d);
    return dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}


export default function AepsWorkspace({
  initialTransactions,
  initialCustomers,
  initialBanks,
  initialPortals,
  float,
}: {
  initialTransactions: Txn[];
  initialCustomers: CustomerRow[];
  initialBanks: Master[];
  initialPortals: Master[];
  paymentInstruments?: any[];
  float: any;
}) {
  const supabase = createClient();
  const { showToast } = useToast();
  const [rows, setRows] = useState<Txn[]>(initialTransactions);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [mobile, setMobile] = useState("");
  const [name, setName] = useState("");
  const [aadhaar, setAadhaar] = useState("");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("");
  const [commission, setCommission] = useState("");
  const [bankId, setBankId] = useState("");
  const [portalId, setPortalId] = useState(initialPortals[0]?.id || "");
  const [bankRef, setBankRef] = useState("");
  const [portalRef, setPortalRef] = useState("");

  const cleanAadhaar = aadhaar.replace(/\D/g, "");
  const cleanMobile = mobile.replace(/\D/g, "");

  const isFormValid = Boolean(
    bankId &&
    portalId &&
    cleanAadhaar.length === 4 &&
    cleanMobile.length === 10 &&
    Number(amount) > 0 &&
    Number(fee || 0) >= 0 &&
    Number(commission || 0) >= 0
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((t) => {
      const method = t.transfer_method || "cash_out";
      const haystack = [
        t.transaction_number,
        t.customer_mobile,
        t.customers?.name,
        t.banks?.name,
        t.portals?.name,
        t.reference,
        t.remarks,
        t.aadhaar_last4,
      ].filter(Boolean).join(" ").toLowerCase();
      return (typeFilter === "all" || method === typeFilter)
        && (statusFilter === "all" || t.status === statusFilter)
        && (!q || haystack.includes(q));
    });
  }, [rows, query, typeFilter, statusFilter]);

  const stats = useMemo(() => ({
    total: filtered.length,
    amount: filtered.reduce((n, t) => n + Number(t.amount || 0), 0),
    fees: filtered.reduce((n, t) => n + Number(t.service_fee || 0), 0),
    commission: filtered.reduce((n, t) => n + Number(t.portal_commission || 0), 0),
    recorded: filtered.filter((t) => t.status === "success" || t.status === "recorded").length,
    review: filtered.filter((t) => ["pending", "review", "processing"].includes(t.status)).length,
    cancelled: filtered.filter((t) => t.status === "cancelled").length,
    reversed: filtered.filter((t) => t.status === "reversed").length,
  }), [filtered]);

  const aepsFloat = Number(float?.current ?? float?.balance ?? 0);
  const receiptMode = "basic";
  const receiptUrl = (id: string) => "/business/receipt/" + id + (receiptMode === "detailed" ? "?mode=detailed" : "");
  const invoiceUrl = (id: string) => "/business/receipt/" + id + "/a4" + (receiptMode === "detailed" ? "?mode=detailed" : "");

  const candidates = useMemo(() => {
    return initialCustomers.filter((c) => {
      const phone = String(c.phone || "").replace(/\D/g, "");
      if (cleanMobile.length === 10 && phone === cleanMobile) return true;
      if (cleanAadhaar.length === 4) {
        return rows.some((t) => t.customer_id === c.id && String(t.aadhaar_last4 || "") === cleanAadhaar);
      }
      return false;
    });
  }, [initialCustomers, cleanMobile, cleanAadhaar, rows]);

  const selectedCustomer = initialCustomers.find((c) => c.id === customerId) || candidates[0] || null;

  const selectCustomer = (id: string) => {
    setCustomerId(id);
    const customer = initialCustomers.find((c) => c.id === id);
    if (customer) {
      setName(customer.name);
      setMobile(String(customer.phone || "").replace(/\D/g, "").slice(0, 10));
    }
  };

  const handleNewCashOut = () => {
    setCustomerId("");
    setMobile("");
    setName("");
    setAadhaar("");
    setAmount("");
    setFee("");
    setCommission("");
    setBankId("");
    setPortalId(initialPortals[0]?.id || "");
    setBankRef("");
    setPortalRef("");
    setReviewOpen(false);
    setDrawerOpen(true);
  };

  const handleExport = () => {
    downloadCsv(filtered as any, "aeps-transactions.csv");
    showToast("success", "AEPS transaction export created.");
  };

  const recordTransaction = async () => {
    if (busy || !isFormValid) return;
    setBusy(true);
    try {
      const payload: any = {
        p_service_type: "aeps",
        p_transaction_date: new Date().toISOString().slice(0, 10),
        p_transaction_timestamp: new Date().toISOString(),
        p_customer_id: customerId || selectedCustomer?.id || null,
        p_customer_mobile: cleanMobile,
        p_reference: bankRef || null,
        p_remarks: portalRef ? "Portal Ref: " + portalRef : null,
        p_status: "success",
        p_bank_id: bankId,
        p_portal_id: portalId,
        p_merchant_qr_id: null,
        p_aadhaar_last4: cleanAadhaar,
        p_transfer_method: "cash_out",
        p_amount: Number(amount),
        p_service_fee: Number(fee || 0),
        p_portal_commission: Number(commission || 0),
        p_fee_source: "customer_paid_extra",
        p_paid_from: "portal",
        p_customer_pay_method: "cash",
        p_pay_from_instrument_id: null,
        p_pay_from_method: "aeps_portal",
        p_receiver_name: null,
      };

      let result = await supabase.rpc("create_business_txn", payload);
      if (result.error) throw result.error;

      setRows((prev) => [result.data as Txn, ...prev]);
      showToast("success", "AEPS transaction recorded successfully.");
      handleNewCashOut();
      setDrawerOpen(false);
    } catch (error: any) {
      showToast("error", error?.message || "Failed to record AEPS transaction.");
    } finally {
      setBusy(false);
    }
  };

  const portalName = initialPortals.find((p) => p.id === portalId)?.name || "—";
  const bankName = initialBanks.find((b) => b.id === bankId)?.name || "—";

  return (
    <div className="min-h-full bg-[#f7faff] text-slate-900">
      <div className="mx-auto max-w-[1600px] space-y-4 p-4 lg:p-6">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[10px] font-bold text-slate-400">Business Services › AEPS</div>
            <div className="mt-1 flex items-center gap-3">
              <div className="rounded-2xl bg-blue-600 px-3 py-3 text-white">AEPS</div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-black">AEPS Transactions</h1>
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-700">LIVE WATCHER READY</span>
                </div>
                <p className="text-sm text-slate-500">Monitor, review and record Aadhaar Enabled Payment System transactions</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { handleNewCashOut(); setDrawerOpen(true); }} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white">＋ Record Transaction</button>
            <button type="button" onClick={() => showToast("info", "Import is reserved for the verified AEPS import contract.")} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold">⇧ Import</button>
            <button type="button" onClick={handleExport} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold">⇩ Export</button>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["Total Transactions", String(stats.total)],
            ["Total Amount", inr(stats.amount)],
            ["Total Fees", inr(stats.fees)],
            ["Portal Commission", inr(stats.commission)],
            ["AEPS Float", inr(aepsFloat)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
              <p className="mt-2 text-xl font-black">{value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Recorded / Success", stats.recorded],
            ["Pending / Review", stats.review],
            ["Cancelled", stats.cancelled],
            ["Reversed", stats.reversed],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-[10px] text-slate-400">{label}</p>
              <p className="text-sm font-black">{value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <main className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-black">Transaction Trend</h2>
                <div className="mt-6 flex h-28 items-end gap-2">
                  {[0,1,2,3,4,5,6].map((i) => {
                    const count = filtered.slice(i * 5, (i + 1) * 5).length;
                    return <div key={i} className="flex-1 rounded-t bg-blue-500" style={{ height: `${Math.max(10, Math.min(100, count * 20))}%` }} />;
                  })}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-black">Transactions by Type</h2>
                <div className="mt-4 space-y-2 text-xs">
                  <p>Cash Out: {rows.filter((t) => !t.transfer_method || t.transfer_method === "cash_out" || t.transfer_method === "withdrawal").length}</p>
                  <p>Balance Enquiry: {rows.filter((t) => t.transfer_method === "balance_enquiry" || t.transfer_method === "enquiry").length}</p>
                  <p>Mini Statement: {rows.filter((t) => t.transfer_method === "mini_statement" || t.transfer_method === "statement").length}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="flex flex-col gap-2 lg:flex-row">
                <select value="all" readOnly className="rounded-xl border px-3 py-2 text-xs"><option>All Dates</option></select>
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-xl border px-3 py-2 text-xs">
                  <option value="all">All Types</option><option value="cash_out">Cash Out</option><option value="balance_enquiry">Balance Enquiry</option><option value="mini_statement">Mini Statement</option>
                </select>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border px-3 py-2 text-xs">
                  <option value="all">All Status</option><option value="success">Success</option><option value="pending">Pending</option><option value="review">Review</option><option value="cancelled">Cancelled</option><option value="reversed">Reversed</option>
                </select>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search transaction, customer, mobile, Aadhaar, bank or portal ref..." className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-xs" />
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="border-b px-4 py-4">
                <h2 className="text-base font-black">AEPS Transactions</h2>
                <p className="text-[10px] text-slate-400">Showing {Math.min(12, filtered.length)} of {filtered.length} filtered records</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1200px] text-left text-[10px]">
                  <thead className="bg-slate-50 font-black uppercase text-slate-400">
                    <tr><th className="px-3 py-3">#</th><th>Date &amp; Time</th><th>Customer</th><th>Mobile</th><th>Type</th><th>Aadhaar</th><th>Amount</th><th>Fee</th><th>Commission</th><th>Bank Ref</th><th>Portal Ref</th><th>Status</th><th>Receipt</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.slice(0, 12).map((t) => (
                      <tr key={t.id}>
                        <td className="px-3 py-3 font-mono font-bold text-blue-600">{t.transaction_number}</td>
                        <td className="px-3 py-3">{fmtDate(t.transaction_date)} {fmtTime((t as any).transaction_timestamp)}</td>
                        <td className="px-3 py-3">{t.customers?.name || "—"}</td>
                        <td className="px-3 py-3">{t.customer_mobile || t.customers?.phone || "—"}</td>
                        <td className="px-3 py-3">{t.transfer_method || "Cash Out"}</td>
                        <td className="px-3 py-3">•••• {t.aadhaar_last4 || "—"}</td>
                        <td className="px-3 py-3 font-bold">{inr(Number(t.amount || 0))}</td>
                        <td className="px-3 py-3">{inr(Number(t.service_fee || 0))}</td>
                        <td className="px-3 py-3">{inr(Number(t.portal_commission || 0))}</td>
                        <td className="px-3 py-3">{t.reference || "—"}</td>
                        <td className="px-3 py-3">{t.remarks?.replace(/^Portal Ref:\s*/i, "") || "—"}</td>
                        <td className="px-3 py-3">{t.status}</td><td className="px-3 py-3"><div className="flex gap-1"><Link href={receiptUrl(t.id)} target="_blank" className="font-bold text-blue-600">80mm</Link><Link href={invoiceUrl(t.id)} target="_blank" className="font-bold text-slate-600">A4</Link></div></td>
                      </tr>
                    ))}
                    {filtered.length === 0 && <tr><td colSpan={13} className="px-4 py-10 text-center text-xs text-slate-400">No AEPS transactions match the current filters.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
                <p className="font-black">AI Insights</p>
                <p className="mt-2 text-xs">{stats.total} real AEPS records loaded · {inr(stats.commission)} portal commission · {stats.review} requiring review.</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="font-black">Important Notes</p>
                <p className="mt-2 text-xs">Only Aadhaar last 4 is stored. Customer name is resolved from CafeERP data; the portal is never treated as a source of customer name.</p>
              </div>
            </div>
          </main>

          {drawerOpen && (
            <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg xl:sticky xl:top-4 xl:h-fit">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-black">Record AEPS Transaction</h2>
                <button type="button" onClick={() => setDrawerOpen(false)} className="text-lg">×</button>
              </div>
              <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs">
                <b>✦ AI Auto-Fill</b>
                <p className="mt-1">Customer matching uses mobile and/or Aadhaar last 4. A match is only a suggestion and remains under operator review.</p>
                {candidates.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {candidates.slice(0, 3).map((c) => (
                      <button type="button" key={c.id} onClick={() => selectCustomer(c.id)} className="block w-full rounded-lg bg-white px-2 py-1 text-left font-bold">{c.name} · {c.phone || "No mobile"}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-4 space-y-3">
                <label className="block text-[10px] font-black">Customer Mobile *
                  <input value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} maxLength={10} className="mt-1 w-full rounded-xl border px-3 py-2 text-xs" />
                </label>
                <label className="block text-[10px] font-black">Customer Name
                  <input value={name} readOnly className="mt-1 w-full rounded-xl border bg-slate-50 px-3 py-2 text-xs" />
                </label>
                <label className="block text-[10px] font-black">Aadhaar Last 4 Digits *
                  <input value={aadhaar} onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, "").slice(0, 4))} maxLength={4} className="mt-1 w-full rounded-xl border px-3 py-2 font-mono text-xs" />
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <label className="text-[10px] font-black">Amount<input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" step="any" className="mt-1 w-full rounded-xl border px-2 py-2 text-xs" /></label>
                  <label className="text-[10px] font-black">Fee<input value={fee} onChange={(e) => setFee(e.target.value)} type="number" min="0" step="any" className="mt-1 w-full rounded-xl border px-2 py-2 text-xs" /></label>
                  <label className="text-[10px] font-black">Commission<input value={commission} onChange={(e) => setCommission(e.target.value)} type="number" min="0" step="any" className="mt-1 w-full rounded-xl border px-2 py-2 text-xs" /></label>
                </div>
                <label className="block text-[10px] font-black">Bank Name
                  <select value={bankId} onChange={(e) => setBankId(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 text-xs"><option value="">Select bank</option>{initialBanks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
                </label>
                <label className="block text-[10px] font-black">Portal Name
                  <select value={portalId} onChange={(e) => setPortalId(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 text-xs"><option value="">Select portal</option>{initialPortals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                </label>
                <label className="block text-[10px] font-black">Bank Reference<input value={bankRef} onChange={(e) => setBankRef(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 text-xs" /></label>
                <label className="block text-[10px] font-black">Portal Reference<input value={portalRef} onChange={(e) => setPortalRef(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 text-xs" /></label>
              </div>
              <button type="button" disabled={!isFormValid || busy} onClick={() => setReviewOpen(true)} className="mt-4 w-full rounded-xl bg-blue-600 py-3 text-xs font-black text-white disabled:opacity-50">{busy ? "Processing…" : "Review & Record Transaction"}</button>
              <p className="mt-2 text-center text-[9px] text-slate-400">Final recording stays under operator review.</p>
            </aside>
          )}
        </div>

        {reviewOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
              <h3 className="text-lg font-black">Review AEPS Transaction</h3>
              <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-xs">
                <p>Customer<br /><b>{name || selectedCustomer?.name || "—"}</b></p>
                <p>Mobile<br /><b>{cleanMobile}</b></p>
                <p>Aadhaar<br /><b>•••• {cleanAadhaar}</b></p>
                <p>Bank<br /><b>{bankName}</b></p>
                <p>Portal<br /><b>{portalName}</b></p>
                <p>Amount<br /><b>{inr(Number(amount))}</b></p>
                <p>Customer Fee<br /><b>{inr(Number(fee || 0))}</b></p>
                <p>Portal Commission<br /><b>{inr(Number(commission || 0))}</b></p>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setReviewOpen(false)} className="rounded-xl border px-4 py-2 text-xs font-bold">Edit</button>
                <button type="button" onClick={recordTransaction} disabled={!isFormValid || busy} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{busy ? "Processing…" : "Approve & Record"}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
