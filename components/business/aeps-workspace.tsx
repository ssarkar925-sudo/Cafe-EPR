"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { useToast } from "@/components/ui/use-toast";
import { downloadCsv } from "@/components/ui/csv";
import { createCustomerRecord } from "@/lib/customers";
import type { CustomerRow, Master, Txn } from "./business-client";

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
  s = s.replace(/\b(ltd|limited|bank|the|india|branch)\b/g, " ");
  s = s.replace(/\s+/g, " ").trim();
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
  const [dateFilter, setDateFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [entryMode, setEntryMode] = useState<"manual" | "ai">("manual");
  const [transactionType, setTransactionType] = useState("cash_out");
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
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
    (transactionType === "cash_out" ? Number(amount) > 0 : true) &&
    Number(fee || 0) >= 0 &&
    Number(commission || 0) >= 0
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);

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

      // Date filtering
      if (dateFilter !== "all" && t.transaction_date) {
        const raw = String(t.transaction_date || "").slice(0, 10);
        if (dateFilter === "today" && raw !== todayKey) return false;
        if (dateFilter === "yesterday") {
          const d = new Date(today);
          d.setDate(d.getDate() - 1);
          if (raw !== d.toISOString().slice(0, 10)) return false;
        }
        if (dateFilter === "last7" || dateFilter === "7d") {
          const d = new Date(today);
          d.setDate(d.getDate() - 6);
          if (raw < d.toISOString().slice(0, 10) || raw > todayKey) return false;
        }
        if (dateFilter === "last30" || dateFilter === "30d") {
          const d = new Date(today);
          d.setDate(d.getDate() - 29);
          if (raw < d.toISOString().slice(0, 10) || raw > todayKey) return false;
        }
        if (dateFilter === "this_month" || dateFilter === "month") {
          if (raw.slice(0, 7) !== todayKey.slice(0, 7)) return false;
        }
      }

      return (typeFilter === "all" || method === typeFilter)
        && (statusFilter === "all" || t.status === statusFilter)
        && (!q || haystack.includes(q));
    });
  }, [rows, query, dateFilter, typeFilter, statusFilter]);

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
  const receiptQuery = (mode: "basic" | "detailed") =>
    mode === "detailed" ? "?mode=detailed" : "";
  const receiptMode: "basic" | "detailed" = "basic";
  const receiptUrl = (id: string) => "/business/receipt/" + id + receiptQuery(receiptMode);
  const invoiceUrl = (id: string) => "/business/receipt/" + id + "/a4" + receiptQuery(receiptMode);

  // Customer matching candidates
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

  // Auto-fill customer if unique match found
  useEffect(() => {
    if (cleanMobile.length === 10 && !customerId) {
      const exactMatch = initialCustomers.find((c) => String(c.phone || "").replace(/\D/g, "") === cleanMobile);
      if (exactMatch) {
        setCustomerId(exactMatch.id);
        setName(exactMatch.name);
      }
    }
  }, [cleanMobile, customerId, initialCustomers]);

  const selectCustomer = (id: string) => {
    setCustomerId(id);
    const customer = initialCustomers.find((c) => c.id === id);
    if (customer) {
      setName(customer.name);
      setMobile(String(customer.phone || "").replace(/\D/g, "").slice(0, 10));
    }
  };

  const handleNewCashOut = useCallback(() => {
    setCustomerId("");
    setMobile("");
    setName("");
    setAadhaar("");
    setTransactionType("cash_out");
    setAmount("");
    setFee("");
    setCommission("");
    setBankId("");
    setPortalId(initialPortals[0]?.id || "");
    setBankRef("");
    setPortalRef("");
    setReviewOpen(false);
    setDrawerOpen(true);
  }, [initialPortals]);

  const selectBankByCode = (code: string) => {
    const top = TOP_INDIAN_BANKS.find((b) => b.code === code);
    if (!top) return;
    const matched = matchBank(top.label, initialBanks) || matchBank(top.code, initialBanks) || matchBank(top.match[0], initialBanks);
    if (matched) {
      setBankId(matched.id);
    }
  };

  const isBankChipActive = (code: string) => {
    if (!bankId) return false;
    const currentBank = initialBanks.find((b) => b.id === bankId);
    if (!currentBank) return false;
    const top = TOP_INDIAN_BANKS.find((b) => b.code === code);
    if (!top) return false;
    const norm = normalizeBankName(currentBank.name);
    return top.match.some((m) => norm.includes(m) || m.includes(norm)) || (currentBank.code && currentBank.code.toUpperCase() === code);
  };

  const handleDenominationClick = (val: number) => {
    setAmount(String(val));
    if (!fee) {
      if (val >= 500 && val < 1000) setFee("5");
      else if (val >= 1000 && val < 2000) setFee("10");
      else if (val >= 2000 && val < 3000) setFee("15");
      else if (val >= 3000 && val < 5000) setFee("20");
      else if (val >= 5000 && val < 10000) setFee("30");
      else if (val >= 10000) setFee("50");
    }
    if (!commission) {
      if (val >= 500 && val < 1000) setCommission("2");
      else if (val >= 1000 && val < 2000) setCommission("4");
      else if (val >= 2000 && val < 3000) setCommission("6");
      else if (val >= 3000 && val < 5000) setCommission("9");
      else if (val >= 5000 && val < 10000) setCommission("12");
      else if (val >= 10000) setCommission("15");
    }
  };

  const handleExport = () => {
    downloadCsv(
      "aeps-transactions.csv",
      ["Transaction", "Date", "Customer", "Mobile", "Type", "Aadhaar", "Amount", "Fee", "Commission", "Bank", "Portal", "Bank Ref", "Portal Ref", "Status"],
      filtered.map((t) => [
        t.transaction_number || "",
        t.transaction_date || "",
        t.customers?.name || "",
        t.customer_mobile || t.customers?.phone || "",
        t.transfer_method || "Cash Out",
        t.aadhaar_last4 || "",
        Number(t.amount || 0),
        Number(t.service_fee || 0),
        Number(t.portal_commission || 0),
        t.banks?.name || "",
        t.portals?.name || "",
        t.reference || "",
        t.remarks?.replace(/^Portal Ref:\s*/i, "") || "",
        t.status || "",
      ])
    );
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
        p_transfer_method: transactionType,
        p_amount: Number(amount || 0),
        p_service_fee: Number(fee || 0),
        p_portal_commission: Number(commission || 0),
        p_fee_source: "customer_paid_extra",
        p_paid_from: "portal",
        p_customer_pay_method: "cash",
        p_pay_from_instrument_id: null,
        p_pay_from_method: "aeps_portal",
        p_receiver_name: null,
      };

      const result = await supabase.rpc("create_business_txn", payload);
      if (result.error) throw result.error;

      setRows((prev) => [result.data as Txn, ...prev]);
      showToast("success", "AEPS transaction recorded successfully.");
      handleNewCashOut();
      setReviewOpen(false);
    } catch (error: any) {
      showToast("error", error?.message || "Failed to record AEPS transaction.");
    } finally {
      setBusy(false);
    }
  };

  const portalName = initialPortals.find((p) => p.id === portalId)?.name || "—";
  const bankName = initialBanks.find((b) => b.id === bankId)?.name || "—";

  // Last 7 days trend calculations
  const trendData = useMemo(() => {
    const days: { dateStr: string; label: string; count: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-IN", { weekday: "short" });
      const count = rows.filter((t) => (t.transaction_date || "").slice(0, 10) === dateStr).length;
      days.push({ dateStr, label, count });
    }
    const maxCount = Math.max(...days.map((d) => d.count), 1);
    const hasActivity = days.some((d) => d.count > 0);
    return { days, maxCount, hasActivity };
  }, [rows]);

  // Transaction type distribution
  const typeDistribution = useMemo(() => {
    const cashOutCount = rows.filter((t) => !t.transfer_method || t.transfer_method === "cash_out" || t.transfer_method === "withdrawal").length;
    const balanceCount = rows.filter((t) => t.transfer_method === "balance_enquiry" || t.transfer_method === "enquiry").length;
    const statementCount = rows.filter((t) => t.transfer_method === "mini_statement" || t.transfer_method === "statement").length;
    const total = rows.length || 1;
    return {
      cashOutCount,
      balanceCount,
      statementCount,
      cashOutPct: Math.round((cashOutCount / total) * 100),
      balancePct: Math.round((balanceCount / total) * 100),
      statementPct: Math.round((statementCount / total) * 100),
    };
  }, [rows]);

  return (
    <div className="aeps-modern-light min-h-full bg-[#f6f9fd] text-slate-900 transition-colors">
      <div className="mx-auto max-w-[1600px] px-4 pb-8 pt-4 lg:px-6 lg:pt-5 space-y-4">

        {/* HEADER */}
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Business Services / AEPS</div>
            <div className="mt-1 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-xl font-black text-white shadow-sm">
                AePS
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-black tracking-tight text-slate-950">AEPS Transactions</h1>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[9px] font-black text-emerald-700 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    LIVE WATCHER READY
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">Monitor, review and record Aadhaar Enabled Payment System transactions</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setInsightsOpen(!insightsOpen)}
              className="rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-2.5 text-xs font-bold text-violet-700 hover:bg-violet-100 transition-colors flex items-center gap-1.5"
            >
              <span>✦</span> AI Insights
            </button>
            <button
              type="button"
              onClick={handleNewCashOut}
              className="rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-xs font-black text-white shadow-sm active:scale-95 transition-all flex items-center gap-1.5"
            >
              ＋ Record Transaction
            </button>
            <button
              type="button"
              onClick={() => showToast("info", "Import is reserved for the verified AEPS import contract.")}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
            >
              ⇧ Import
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
            >
              ⇩ Export
            </button>
          </div>
        </header>

        {/* 5 PREMIUM KPI CARDS WITH CONCEPT ACCENT TONES */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["▣", "Total Transactions", String(stats.total), "border-blue-100 bg-blue-50/60 text-blue-600"],
            ["₹", "Total Amount", inr(stats.amount), "border-emerald-100 bg-emerald-50/60 text-emerald-600"],
            ["%", "Total Fees", inr(stats.fees), "border-rose-100 bg-rose-50/60 text-rose-600"],
            ["◔", "Portal Commission", inr(stats.commission), "border-violet-100 bg-violet-50/60 text-violet-600"],
            ["▣", "AEPS Float", inr(aepsFloat), "border-amber-100 bg-amber-50/60 text-amber-600"],
          ].map(([icon, label, value, tone]) => (
            <div key={label} className={`rounded-2xl border p-4 shadow-sm ${tone}`}>
              <div className="flex items-start justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-sm font-black shadow-sm">{icon}</div>
              </div>
              <p className="mt-3 text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p>
              <p className="mt-1 text-xl font-black text-slate-950">{value}</p>
            </div>
          ))}
        </div>

        {/* 4 STATUS SUMMARY CARDS */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["✓", "Recorded / Success", stats.recorded, "text-emerald-600 bg-emerald-50"],
            ["◷", "Pending / Review", stats.review, "text-amber-600 bg-amber-50"],
            ["×", "Cancelled", stats.cancelled, "text-rose-600 bg-rose-50"],
            ["↶", "Reversed", stats.reversed, "text-slate-600 bg-slate-100"],
          ].map(([icon, label, value, tone]) => (
            <div key={String(label)} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <span className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-black ${tone}`}>{icon}</span>
              <div>
                <p className="text-[10px] font-medium text-slate-400">{label}</p>
                <p className="text-base font-black text-slate-950">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* OPTIONAL AI INSIGHTS ACCORDION */}
        {insightsOpen && (
          <div className="rounded-2xl border border-violet-200 bg-violet-50/80 p-5 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-violet-900 flex items-center gap-2">
                <span>✦</span> AI Insights Engine
              </h3>
              <button type="button" onClick={() => setInsightsOpen(false)} className="text-xs text-violet-600 font-bold">Close</button>
            </div>
            <div className="grid gap-3 md:grid-cols-3 text-xs pt-1">
              <div className="p-3 bg-white rounded-xl border border-violet-100">
                <span className="font-bold text-slate-500 block mb-1">Audit Status</span>
                <p className="font-semibold text-slate-800">{stats.review > 0 ? `${stats.review} transaction(s) pending operator review.` : "All transactions reconciled successfully."}</p>
              </div>
              <div className="p-3 bg-white rounded-xl border border-violet-100">
                <span className="font-bold text-slate-500 block mb-1">Fee Integrity</span>
                <p className="font-semibold text-slate-800">{stats.fees > 0 ? `Total customer fees collected: ${inr(stats.fees)}.` : "Zero customer fees recorded in this dataset."}</p>
              </div>
              <div className="p-3 bg-white rounded-xl border border-violet-100">
                <span className="font-bold text-slate-500 block mb-1">Operator Yield</span>
                <p className="font-semibold text-slate-800">{stats.amount > 0 ? `Net margin is ${((stats.commission / (stats.amount || 1)) * 100).toFixed(2)}% of volume.` : "No transaction volume loaded."}</p>
              </div>
            </div>
          </div>
        )}

        {/* MAIN WORKSPACE LAYOUT (2 Columns on Desktop) */}
        <div className={`grid grid-cols-1 gap-4 ${drawerOpen ? "xl:grid-cols-[minmax(0,1fr)_410px]" : "xl:grid-cols-1"}`}>

          {/* LEFT: ANALYTICS & LEDGER */}
          <main className="min-w-0 space-y-4">

            {/* ANALYTICS SECTION */}
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Card 1: Transaction Trend */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h2 className="text-sm font-black text-slate-950">Transaction Trend</h2>
                    <p className="text-[10px] text-slate-400">Recent AEPS activity</p>
                  </div>
                  <span className="rounded-lg border border-slate-200 px-2 py-1 text-[9px] font-bold text-slate-500">Last 7 periods</span>
                </div>

                {trendData.hasActivity ? (
                  <div className="flex h-28 items-end gap-2 pt-2">
                    {trendData.days.map((day) => {
                      const heightPct = Math.max(12, Math.round((day.count / trendData.maxCount) * 100));
                      return (
                        <div key={day.dateStr} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group">
                          <span className="text-[10px] font-bold text-slate-400 group-hover:text-blue-600 transition-colors">{day.count}</span>
                          <div
                            className="w-full rounded-t-lg bg-blue-500 hover:bg-blue-600 transition-all"
                            style={{ height: `${heightPct}%` }}
                          />
                          <span className="text-[9px] font-semibold text-slate-400 uppercase">{day.label}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex h-28 items-center justify-center rounded-xl bg-slate-50 border border-dashed border-slate-200 text-xs text-slate-400 font-medium">
                    No AEPS activity yet in the last 7 days
                  </div>
                )}
              </div>

              {/* Card 2: Transactions by Type */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h2 className="text-sm font-black text-slate-950">Transactions by Type</h2>
                    <p className="text-[10px] text-slate-400">Distribution across AEPS operations</p>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">{rows.length} Total</span>
                </div>

                <div className="my-2 flex justify-center">
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 p-2 shadow-inner">
                    <div className="absolute inset-2 flex items-center justify-center rounded-full bg-white text-center shadow-sm">
                      <div>
                        <div className="text-sm font-black text-slate-950">{rows.length}</div>
                        <div className="text-[7px] text-slate-400 uppercase">Txns</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  {[
                    ["Cash Out", typeDistribution.cashOutCount, "bg-blue-500", typeDistribution.cashOutPct],
                    ["Balance Enquiry", typeDistribution.balanceCount, "bg-emerald-500", typeDistribution.balancePct],
                    ["Mini Statement", typeDistribution.statementCount, "bg-amber-500", typeDistribution.statementPct],
                  ].map(([label, count, bar, pct]) => (
                    <div key={String(label)}>
                      <div className="mb-0.5 flex justify-between text-[10px]">
                        <span className="font-semibold text-slate-600">{label}</span>
                        <b className="text-slate-900">{count} ({pct}%)</b>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className={`h-1.5 rounded-full ${bar}`} style={{ width: `${Number(pct) || 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* FILTER BAR */}
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  <option value="all">All Dates</option>
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="last7">Last 7 Days</option>
                  <option value="last30">Last 30 Days</option>
                  <option value="this_month">This Month</option>
                </select>

                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  <option value="all">All Types</option>
                  <option value="cash_out">Cash Out</option>
                  <option value="balance_enquiry">Balance Enquiry</option>
                  <option value="mini_statement">Mini Statement</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  <option value="all">All Status</option>
                  <option value="success">Success</option>
                  <option value="pending">Pending</option>
                  <option value="review">Review</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="reversed">Reversed</option>
                </select>

                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by customer, mobile, Aadhaar, bank or portal reference..."
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* AEPS TRANSACTION LEDGER TABLE */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="text-base font-black text-slate-950">AEPS Transactions</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">Showing {filtered.length} filtered records</p>
                </div>
                {!drawerOpen && (
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(true)}
                    className="text-xs font-bold text-blue-600 hover:underline"
                  >
                    Open Counter Terminal →
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1300px] text-left text-[11px]">
                  <thead className="bg-slate-50 font-black uppercase text-slate-400 tracking-wider text-[10px] border-b border-slate-100">
                    <tr>
                      <th className="px-3 py-3">#</th>
                      <th className="px-3 py-3">Date &amp; Time</th>
                      <th className="px-3 py-3">Customer</th>
                      <th className="px-3 py-3">Mobile</th>
                      <th className="px-3 py-3">Type</th>
                      <th className="px-3 py-3">Aadhaar</th>
                      <th className="px-3 py-3">Amount</th>
                      <th className="px-3 py-3">Customer Fee</th>
                      <th className="px-3 py-3">Portal Commission</th>
                      <th className="px-3 py-3">Bank</th>
                      <th className="px-3 py-3">Portal</th>
                      <th className="px-3 py-3">Bank Reference</th>
                      <th className="px-3 py-3">Portal Reference</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3.5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filtered.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-3 font-mono font-bold text-blue-600">{t.transaction_number}</td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {fmtDate(t.transaction_date)} <span className="text-slate-400 text-[10px]">{fmtTime((t as any).transaction_timestamp)}</span>
                        </td>
                        <td className="px-3 py-3 font-semibold text-slate-950">{t.customers?.name || "—"}</td>
                        <td className="px-3 py-3 font-mono text-slate-500">{maskMobile(t.customer_mobile || t.customers?.phone) || "—"}</td>
                        <td className="px-3 py-3 capitalize">{t.transfer_method?.replace(/_/g, " ") || "Cash Out"}</td>
                        <td className="px-3 py-3 font-mono">•••• {t.aadhaar_last4 || "—"}</td>
                        <td className="px-3 py-3 font-bold text-slate-950">{inr(Number(t.amount || 0))}</td>
                        <td className="px-3 py-3 font-medium text-indigo-600">{inr(Number(t.service_fee || 0))}</td>
                        <td className="px-3 py-3 font-medium text-emerald-600">{inr(Number(t.portal_commission || 0))}</td>
                        <td className="px-3 py-3">{t.banks?.name || "—"}</td>
                        <td className="px-3 py-3">{t.portals?.name || "—"}</td>
                        <td className="px-3 py-3 font-mono text-slate-500">{t.reference || "—"}</td>
                        <td className="px-3 py-3 font-mono text-slate-500">{t.remarks?.replace(/^Portal Ref:\s*/i, "") || "—"}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            t.status === "success" || t.status === "recorded"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : ["pending", "review", "processing"].includes(t.status)
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : t.status === "cancelled"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : "bg-purple-50 text-purple-700 border border-purple-200"
                          }`}>
                            {t.status}
                          </span>
                        </td>
                        <td className="px-3.5 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            <Link
                              href={receiptUrl(t.id)}
                              target="_blank"
                              className="font-bold text-[10px] px-2 py-1 rounded-md bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition-colors"
                            >
                              80mm
                            </Link>
                            <Link
                              href={invoiceUrl(t.id)}
                              target="_blank"
                              className="font-bold text-[10px] px-2 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 transition-colors"
                            >
                              A4
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={15} className="px-4 py-12 text-center text-xs text-slate-400">
                          No AEPS transactions match the current filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* AI INSIGHTS & IMPORTANT NOTES FOOTER CARDS */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 shadow-sm">
                <p className="font-black text-xs uppercase tracking-wider text-violet-900 flex items-center gap-2">
                  <span>✦</span> AI Insights
                </p>
                <p className="mt-2 text-xs text-slate-700 leading-relaxed">
                  {stats.total} real AEPS records loaded · {inr(stats.commission)} portal commission · {stats.review} requiring review.
                </p>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                <p className="font-black text-xs uppercase tracking-wider text-amber-900 flex items-center gap-2">
                  <span>ⓘ</span> Important Notes
                </p>
                <p className="mt-2 text-xs text-slate-700 leading-relaxed">
                  Only Aadhaar last 4 is stored. Customer name is resolved from CafeERP data; the portal is never treated as a source of customer name.
                </p>
              </div>
            </div>
          </main>

          {/* RIGHT: RECORD AEPS TRANSACTION PANEL (Permanently High Contrast & Light Surface) */}
          {drawerOpen && (
            <aside
              className="aeps-surface rounded-2xl border border-slate-200 bg-white p-5 shadow-lg space-y-4 xl:sticky xl:top-4 xl:h-fit text-slate-900"
              style={{ colorScheme: "light" }}
            >
              <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-base font-black text-slate-950">Record AEPS Transaction</h2>
                  <p className="mt-0.5 text-[10px] text-slate-400">Enter customer details and transaction information</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-lg bg-blue-50 px-2 py-1 text-[9px] font-black text-blue-700">Review First</span>
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(false)}
                    className="rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 xl:hidden text-lg"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* TWO-TAB ENTRY MODE CONTROL */}
              <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setEntryMode("manual")}
                  className={`rounded-lg py-1.5 text-[10px] font-black transition-all ${
                    entryMode === "manual" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Manual Entry
                </button>
                <button
                  type="button"
                  onClick={() => setEntryMode("ai")}
                  className={`rounded-lg py-1.5 text-[10px] font-black transition-all flex items-center justify-center gap-1 ${
                    entryMode === "ai" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <span>✦</span> + AI Auto-Fill
                </button>
              </div>

              {/* AI Auto-Fill Assistance Banner */}
              {entryMode === "ai" && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-slate-700 space-y-2">
                  <div className="font-black text-blue-700 flex items-center gap-1.5">
                    <span>✦</span> + AI Auto-Fill Assistant
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Match the entered mobile and/or Aadhaar last 4 against CafeERP. The suggested customer is never selected blindly.
                  </p>
                  {cleanMobile.length === 10 && !customerId && candidates.length === 0 && (
                    <p className="text-[11px] font-bold text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                      Customer not found in directory.
                    </p>
                  )}
                  {candidates.length > 0 && (
                    <div className="space-y-1 pt-1">
                      <span className="text-[10px] font-bold uppercase text-slate-500 block">Matched Candidates:</span>
                      {candidates.slice(0, 3).map((c) => (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => selectCustomer(c.id)}
                          className="block w-full rounded-lg bg-white px-2.5 py-1.5 text-left text-xs font-semibold text-slate-800 hover:bg-blue-100 border border-blue-100 transition-colors"
                        >
                          {c.name} · {c.phone || "No phone"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* INPUT FIELDS (All explicitly styled light for high contrast) */}
              <div className="space-y-3 pt-1">
                {/* Mobile Number */}
                <div>
                  <label className="block text-[10px] font-black text-slate-700 mb-1">
                    Customer Mobile *
                  </label>
                  <input
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    maxLength={10}
                    placeholder="Enter 10 digit mobile number"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-colors"
                  />
                </div>

                {/* Customer Name (Resolved from CafeERP database) */}
                <div>
                  <label className="block text-[10px] font-black text-slate-700 mb-1">
                    Customer Name
                  </label>
                  <input
                    value={name}
                    readOnly
                    placeholder="Auto-filled from customer database"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 outline-none cursor-not-allowed"
                  />
                </div>

                {/* Aadhaar Last 4 Digits */}
                <div>
                  <label className="block text-[10px] font-black text-slate-700 mb-1">
                    Aadhaar Last 4 Digits *
                  </label>
                  <input
                    value={aadhaar}
                    onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    maxLength={4}
                    placeholder="Enter last 4 digits"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-colors tracking-widest"
                  />
                </div>

                {/* Transaction Type */}
                <div>
                  <label className="block text-[10px] font-black text-slate-700 mb-1">
                    Transaction Type *
                  </label>
                  <select
                    value={transactionType}
                    onChange={(e) => setTransactionType(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-xs text-slate-900 outline-none focus:border-blue-400"
                  >
                    <option value="cash_out">Cash Out</option>
                    <option value="balance_enquiry">Balance Enquiry</option>
                    <option value="mini_statement">Mini Statement</option>
                  </select>
                </div>

                {/* 1-Click Top Indian Bank Chips */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black text-slate-700">Bank *</label>
                    <span className="text-[9px] text-blue-600 font-bold">1-Click Top Banks</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1 mb-2">
                    {TOP_INDIAN_BANKS.map((b) => {
                      const active = isBankChipActive(b.code);
                      return (
                        <button
                          key={b.code}
                          type="button"
                          onClick={() => selectBankByCode(b.code)}
                          className={`rounded-lg py-1 text-[9px] font-bold transition-all text-center border ${
                            active
                              ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                              : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          {b.label}
                        </button>
                      );
                    })}
                  </div>
                  <select
                    value={bankId}
                    onChange={(e) => setBankId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs text-slate-900 outline-none focus:border-blue-400"
                  >
                    <option value="">Select bank...</option>
                    {initialBanks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Amount & Tactile Denomination Buttons */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black text-slate-700">Amount (₹) *</label>
                    <span className="text-[9px] text-slate-400 font-medium">1-Click Presets</span>
                  </div>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.00"
                    disabled={transactionType !== "cash_out"}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base font-black font-mono text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-colors mb-2 disabled:opacity-50"
                  />
                  {transactionType === "cash_out" && (
                    <div className="grid grid-cols-6 gap-1">
                      {[500, 1000, 2000, 3000, 5000, 10000].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => handleDenominationClick(d)}
                          className="rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-600 hover:text-white hover:border-blue-600 py-1 text-[9px] font-bold text-slate-700 transition-all text-center"
                        >
                          {d >= 1000 ? `${d / 1000}k` : d}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Customer Fee & Portal Commission Inputs */}
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-[9px] font-black text-slate-600 mb-0.5">Fee (₹)</label>
                    <input
                      value={fee}
                      onChange={(e) => setFee(e.target.value)}
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0.00"
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-mono font-bold text-indigo-700 outline-none focus:border-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-slate-600 mb-0.5">Commission (₹)</label>
                    <input
                      value={commission}
                      onChange={(e) => setCommission(e.target.value)}
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0.00"
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-mono font-bold text-emerald-700 outline-none focus:border-emerald-400"
                    />
                  </div>
                </div>

                {/* Registered Portal Selection */}
                <div>
                  <label className="block text-[10px] font-black text-slate-700 mb-1">
                    Portal *
                  </label>
                  <select
                    value={portalId}
                    onChange={(e) => setPortalId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs text-slate-900 outline-none focus:border-blue-400"
                  >
                    <option value="">Select portal...</option>
                    {initialPortals.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* References */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9px] font-black text-slate-600 mb-0.5">Bank Reference</label>
                    <input
                      value={bankRef}
                      onChange={(e) => setBankRef(e.target.value)}
                      placeholder="Optional RRN"
                      className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-400 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-slate-600 mb-0.5">Portal Reference</label>
                    <input
                      value={portalRef}
                      onChange={(e) => setPortalRef(e.target.value)}
                      placeholder="Optional Ref"
                      className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-400 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* PRIMARY ACTION BUTTON */}
              <div className="pt-2">
                <button
                  type="button"
                  disabled={!isFormValid || busy}
                  onClick={() => setReviewOpen(true)}
                  className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 py-3 text-xs font-black text-white shadow-sm active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {busy ? "Processing…" : "Review AEPS Transaction"}
                </button>
                <p className="mt-2 text-center text-[9px] text-slate-400">
                  Final recording stays under operator review.
                </p>
              </div>
            </aside>
          )}
        </div>

        {/* REVIEW-BEFORE-RECORD MODAL DIALOG */}
        {reviewOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 text-slate-900 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                  <h3 className="text-base font-black text-slate-950">Review AEPS Transaction</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setReviewOpen(false)}
                  className="text-slate-400 hover:text-slate-600 text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-xs border border-slate-200/80">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">Customer</span>
                  <span className="font-bold text-slate-900">{name || selectedCustomer?.name || "Walk-in Customer"}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">Mobile</span>
                  <span className="font-mono font-bold text-slate-900">{cleanMobile}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">Aadhaar Last 4</span>
                  <span className="font-mono font-bold text-blue-600">•••• {cleanAadhaar}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">Transaction Type</span>
                  <span className="font-bold text-slate-900 capitalize">{transactionType.replace(/_/g, " ")}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">Bank</span>
                  <span className="font-semibold text-slate-800">{bankName}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">Portal</span>
                  <span className="font-semibold text-slate-800">{portalName}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">Amount</span>
                  <span className="font-mono font-black text-sm text-slate-900">{inr(Number(amount || 0))}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">Customer Fee</span>
                  <span className="font-mono font-bold text-indigo-600">{inr(Number(fee || 0))}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">Portal Commission</span>
                  <span className="font-mono font-bold text-emerald-600">{inr(Number(commission || 0))}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">References</span>
                  <span className="font-mono text-slate-600 text-[11px]">
                    RRN: {bankRef || "—"} | Portal: {portalRef || "—"}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewOpen(false)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={recordTransaction}
                  disabled={!isFormValid || busy}
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 px-5 py-2 text-xs font-black text-white shadow-sm transition-all disabled:opacity-50"
                >
                  {busy ? "Processing…" : "Approve & Record"}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
