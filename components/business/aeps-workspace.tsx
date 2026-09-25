"use client";

import { useState, useMemo, useEffect } from "react";
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

// Subcomponents for clean modularity
function AepsKpiCard({
  label,
  value,
  accentColor,
  icon,
}: {
  label: string;
  value: string;
  accentColor: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</span>
        <span className={`p-1.5 rounded-xl ${accentColor} text-slate-700 dark:text-slate-200`}>{icon}</span>
      </div>
      <p className="mt-3 text-2xl font-black text-slate-900 dark:text-white tracking-tight">{value}</p>
    </div>
  );
}

function AepsStatusCard({
  label,
  count,
  badgeClass,
}: {
  label: string;
  count: number;
  badgeClass: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 shadow-sm flex items-center justify-between">
      <div>
        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{count}</p>
      </div>
      <span className={`h-2.5 w-2.5 rounded-full ${badgeClass}`} />
    </div>
  );
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
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [entryMode, setEntryMode] = useState<"manual" | "ai_autofill">("manual");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [mobile, setMobile] = useState("");
  const [name, setName] = useState("");
  const [aadhaar, setAadhaar] = useState("");
  const [transferMethod, setTransferMethod] = useState("cash_out");
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
    (transferMethod === "cash_out" ? Number(amount) > 0 : true) &&
    Number(fee || 0) >= 0 &&
    Number(commission || 0) >= 0
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

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
        const txnDateObj = new Date(t.transaction_date.length === 10 ? t.transaction_date + "T00:00:00" : t.transaction_date);
        const txnDay = new Date(txnDateObj.getFullYear(), txnDateObj.getMonth(), txnDateObj.getDate());
        if (dateFilter === "today" && txnDay.getTime() !== todayStart.getTime()) return false;
        if (dateFilter === "yesterday") {
          const yest = new Date(todayStart);
          yest.setDate(yest.getDate() - 1);
          if (txnDay.getTime() !== yest.getTime()) return false;
        }
        if (dateFilter === "last7") {
          const sevenDaysAgo = new Date(todayStart);
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
          if (txnDay < sevenDaysAgo || txnDay > now) return false;
        }
        if (dateFilter === "last30") {
          const thirtyDaysAgo = new Date(todayStart);
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
          if (txnDay < thirtyDaysAgo || txnDay > now) return false;
        }
        if (dateFilter === "this_month") {
          if (txnDateObj.getFullYear() !== now.getFullYear() || txnDateObj.getMonth() !== now.getMonth()) return false;
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

  const handleNewCashOut = () => {
    setCustomerId("");
    setMobile("");
    setName("");
    setAadhaar("");
    setTransferMethod("cash_out");
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
    // Optional standard fee guidance if empty
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
        p_transfer_method: transferMethod,
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
    <div className="min-h-full bg-[#f7faff] dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <div className="mx-auto max-w-[1600px] space-y-5 p-4 lg:p-6">

        {/* HEADER */}
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 font-black text-white shadow-md shadow-blue-500/20 text-base">
              AePS
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl lg:text-2xl font-black text-slate-900 dark:text-white tracking-tight">AEPS Transactions</h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  LIVE WATCHER READY
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Monitor, review and record Aadhaar Enabled Payment System transactions
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setInsightsOpen(!insightsOpen)}
              className="rounded-xl border border-violet-200 dark:border-violet-800/50 bg-violet-50 dark:bg-violet-950/30 px-3.5 py-2.5 text-xs font-bold text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              AI Insights
            </button>
            <button
              type="button"
              onClick={() => { handleNewCashOut(); setDrawerOpen(true); }}
              className="rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-xs font-black text-white shadow-md shadow-blue-600/20 active:scale-95 transition-all flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" /></svg>
              Record Transaction
            </button>
            <button
              type="button"
              onClick={() => showToast("info", "Import is reserved for the verified AEPS import contract.")}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              Import
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Export
            </button>
          </div>
        </header>

        {/* 5 PREMIUM KPI CARDS */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <AepsKpiCard
            label="Total Transactions"
            value={String(stats.total)}
            accentColor="bg-blue-50 dark:bg-blue-900/30 text-blue-600"
            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
          />
          <AepsKpiCard
            label="Total Amount"
            value={inr(stats.amount)}
            accentColor="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600"
            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <AepsKpiCard
            label="Total Fees"
            value={inr(stats.fees)}
            accentColor="bg-violet-50 dark:bg-violet-900/30 text-violet-600"
            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
          />
          <AepsKpiCard
            label="Portal Commission"
            value={inr(stats.commission)}
            accentColor="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600"
            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
          />
          <AepsKpiCard
            label="AEPS Float"
            value={inr(aepsFloat)}
            accentColor="bg-amber-50 dark:bg-amber-900/30 text-amber-600"
            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" /></svg>}
          />
        </div>

        {/* STATUS CARDS */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <AepsStatusCard label="Recorded / Success" count={stats.recorded} badgeClass="bg-emerald-500" />
          <AepsStatusCard label="Pending / Review" count={stats.review} badgeClass="bg-amber-500" />
          <AepsStatusCard label="Cancelled" count={stats.cancelled} badgeClass="bg-rose-500" />
          <AepsStatusCard label="Reversed" count={stats.reversed} badgeClass="bg-purple-500" />
        </div>

        {/* OPTIONAL AI INSIGHTS ACCORDION */}
        {insightsOpen && (
          <div className="rounded-2xl border border-violet-200 dark:border-violet-900/50 bg-violet-50/70 dark:bg-violet-950/20 p-5 shadow-sm space-y-2 animate-fadeIn">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-violet-900 dark:text-violet-300 flex items-center gap-2">
                <span>✦</span> AI Insights Engine
              </h3>
              <button type="button" onClick={() => setInsightsOpen(false)} className="text-xs text-violet-600 dark:text-violet-400 font-bold">Close</button>
            </div>
            <div className="grid gap-3 md:grid-cols-3 text-xs pt-1">
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-violet-100 dark:border-violet-900/40">
                <span className="font-bold text-slate-500 dark:text-slate-400 block mb-1">Audit Status</span>
                <p className="font-semibold text-slate-800 dark:text-slate-200">{stats.review > 0 ? `${stats.review} transaction(s) pending operator review.` : "All transactions reconciled successfully."}</p>
              </div>
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-violet-100 dark:border-violet-900/40">
                <span className="font-bold text-slate-500 dark:text-slate-400 block mb-1">Fee Integrity</span>
                <p className="font-semibold text-slate-800 dark:text-slate-200">{stats.fees > 0 ? `Total customer fees collected: ${inr(stats.fees)}.` : "Zero customer fees recorded in this dataset."}</p>
              </div>
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-violet-100 dark:border-violet-900/40">
                <span className="font-bold text-slate-500 dark:text-slate-400 block mb-1">Operator Yield</span>
                <p className="font-semibold text-slate-800 dark:text-slate-200">{stats.amount > 0 ? `Net margin is ${((stats.commission / (stats.amount || 1)) * 100).toFixed(2)}% of transaction volume.` : "No transaction volume loaded."}</p>
              </div>
            </div>
          </div>
        )}

        {/* MAIN WORKSPACE LAYOUT (2 Columns on Desktop) */}
        <div className={`grid grid-cols-1 gap-5 ${drawerOpen ? "xl:grid-cols-[minmax(0,1fr)_420px]" : "xl:grid-cols-1"}`}>

          {/* LEFT: ANALYTICS & LEDGER */}
          <main className="space-y-5 min-w-0">

            {/* ANALYTICS SECTION */}
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Card 1: Transaction Trend */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-black text-slate-900 dark:text-white">Transaction Trend</h2>
                    <p className="text-[10px] text-slate-400 mt-0.5">Last 7 days real transaction count</p>
                  </div>
                  <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-lg">7 Days</span>
                </div>

                {trendData.hasActivity ? (
                  <div className="flex h-32 items-end gap-2 pt-2">
                    {trendData.days.map((day) => {
                      const heightPct = Math.max(12, Math.round((day.count / trendData.maxCount) * 100));
                      return (
                        <div key={day.dateStr} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                          <span className="text-[10px] font-bold text-slate-400 group-hover:text-blue-600 transition-colors">{day.count}</span>
                          <div
                            className="w-full rounded-t-lg bg-blue-500 hover:bg-blue-600 transition-all duration-300"
                            style={{ height: `${heightPct}%` }}
                          />
                          <span className="text-[9px] font-semibold text-slate-400 uppercase">{day.label}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex h-32 items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400 font-medium">
                    No AEPS activity yet in the last 7 days
                  </div>
                )}
              </div>

              {/* Card 2: Transactions by Type */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-black text-slate-900 dark:text-white">Transactions by Type</h2>
                    <p className="text-[10px] text-slate-400 mt-0.5">Actual distribution across operations</p>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">{rows.length} Total</span>
                </div>

                {rows.length > 0 ? (
                  <div className="space-y-3.5 pt-1">
                    {/* Proportional multi-segment bar */}
                    <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="bg-blue-600 transition-all" style={{ width: `${typeDistribution.cashOutPct}%` }} title={`Cash Out: ${typeDistribution.cashOutCount}`} />
                      <div className="bg-emerald-500 transition-all" style={{ width: `${typeDistribution.balancePct}%` }} title={`Balance Enquiry: ${typeDistribution.balanceCount}`} />
                      <div className="bg-purple-500 transition-all" style={{ width: `${typeDistribution.statementPct}%` }} title={`Mini Statement: ${typeDistribution.statementCount}`} />
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-blue-600" />
                          Cash Out
                        </span>
                        <span className="font-bold">{typeDistribution.cashOutCount} ({typeDistribution.cashOutPct}%)</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          Balance Enquiry
                        </span>
                        <span className="font-bold">{typeDistribution.balanceCount} ({typeDistribution.balancePct}%)</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-purple-500" />
                          Mini Statement
                        </span>
                        <span className="font-bold">{typeDistribution.statementCount} ({typeDistribution.statementPct}%)</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-32 items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400 font-medium">
                    No transactions to display
                  </div>
                )}
              </div>
            </div>

            {/* FILTER BAR */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-sm">
              <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"
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
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="all">All Types</option>
                  <option value="cash_out">Cash Out</option>
                  <option value="balance_enquiry">Balance Enquiry</option>
                  <option value="mini_statement">Mini Statement</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="all">All Status</option>
                  <option value="success">Success</option>
                  <option value="pending">Pending</option>
                  <option value="review">Review</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="reversed">Reversed</option>
                </select>

                <div className="relative min-w-0 flex-1">
                  <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search transaction, customer, mobile, Aadhaar, bank or portal ref..."
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-9 pr-4 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* AEPS TRANSACTION LEDGER TABLE */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-white">AEPS Transactions</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">Showing {filtered.length} filtered records</p>
                </div>
                {!drawerOpen && (
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(true)}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Open Counter Terminal →
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1300px] text-left text-[11px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 font-black uppercase text-slate-400 tracking-wider text-[10px] border-b border-slate-100 dark:border-slate-800">
                    <tr>
                      <th className="px-3.5 py-3">#</th>
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
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                    {filtered.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-3.5 py-3 font-mono font-bold text-blue-600 dark:text-blue-400">{t.transaction_number}</td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {fmtDate(t.transaction_date)} <span className="text-slate-400 text-[10px]">{fmtTime((t as any).transaction_timestamp)}</span>
                        </td>
                        <td className="px-3 py-3 font-semibold text-slate-900 dark:text-white">{t.customers?.name || "—"}</td>
                        <td className="px-3 py-3 font-mono text-slate-500">{maskMobile(t.customer_mobile || t.customers?.phone) || "—"}</td>
                        <td className="px-3 py-3 capitalize">{t.transfer_method?.replace(/_/g, " ") || "Cash Out"}</td>
                        <td className="px-3 py-3 font-mono">•••• {t.aadhaar_last4 || "—"}</td>
                        <td className="px-3 py-3 font-black text-slate-900 dark:text-white">{inr(Number(t.amount || 0))}</td>
                        <td className="px-3 py-3 font-medium text-indigo-600 dark:text-indigo-400">{inr(Number(t.service_fee || 0))}</td>
                        <td className="px-3 py-3 font-medium text-emerald-600 dark:text-emerald-400">{inr(Number(t.portal_commission || 0))}</td>
                        <td className="px-3 py-3">{t.banks?.name || "—"}</td>
                        <td className="px-3 py-3">{t.portals?.name || "—"}</td>
                        <td className="px-3 py-3 font-mono text-slate-500">{t.reference || "—"}</td>
                        <td className="px-3 py-3 font-mono text-slate-500">{t.remarks?.replace(/^Portal Ref:\s*/i, "") || "—"}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            t.status === "success" || t.status === "recorded"
                              ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20"
                              : ["pending", "review", "processing"].includes(t.status)
                              ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20"
                              : t.status === "cancelled"
                              ? "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20"
                              : "bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/20"
                          }`}>
                            {t.status}
                          </span>
                        </td>
                        <td className="px-3.5 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            <Link
                              href={receiptUrl(t.id)}
                              target="_blank"
                              className="font-bold text-[10px] px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors"
                            >
                              80mm
                            </Link>
                            <Link
                              href={invoiceUrl(t.id)}
                              target="_blank"
                              className="font-bold text-[10px] px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 transition-colors"
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
              <div className="rounded-2xl border border-violet-200 dark:border-violet-900/50 bg-violet-50/50 dark:bg-violet-950/20 p-5 shadow-sm">
                <p className="font-black text-xs uppercase tracking-wider text-violet-900 dark:text-violet-300 flex items-center gap-2">
                  <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  AI Insights
                </p>
                <p className="mt-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  {stats.total} real AEPS records loaded · {inr(stats.commission)} portal commission · {stats.review} requiring review.
                </p>
              </div>

              <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 p-5 shadow-sm">
                <p className="font-black text-xs uppercase tracking-wider text-amber-900 dark:text-amber-300 flex items-center gap-2">
                  <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  Important Notes
                </p>
                <p className="mt-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  Only Aadhaar last 4 is stored. Customer name is resolved from CafeERP data; the portal is never treated as a source of customer name.
                </p>
              </div>
            </div>
          </main>

          {/* RIGHT: RECORD AEPS TRANSACTION PANEL */}
          {drawerOpen && (
            <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-lg space-y-4 xl:sticky xl:top-6 xl:h-fit text-slate-900">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-black text-slate-900">Record AEPS Transaction</h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">Enter customer details and transaction information</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 xl:hidden text-lg"
                >
                  ✕
                </button>
              </div>

              {/* TWO-TAB ENTRY MODE CONTROL */}
              <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setEntryMode("manual")}
                  className={`flex-1 py-1.5 rounded-lg transition-all text-center ${
                    entryMode === "manual" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Manual Entry
                </button>
                <button
                  type="button"
                  onClick={() => setEntryMode("ai_autofill")}
                  className={`flex-1 py-1.5 rounded-lg transition-all text-center flex items-center justify-center gap-1 ${
                    entryMode === "ai_autofill" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <span>✦</span> AI Auto-Fill
                </button>
              </div>

              {/* AI Auto-Fill Assistance Banner */}
              {entryMode === "ai_autofill" && (
                <div className="rounded-xl border border-violet-200 bg-violet-50/80 p-3.5 text-xs text-slate-700 space-y-2">
                  <div className="font-bold text-violet-900 flex items-center gap-1.5">
                    <span>✦</span> AI Customer Matching Active
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Customer matching uses mobile and/or Aadhaar last 4 against the CafeERP directory. A match is only a suggestion and remains under operator review.
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
                          className="block w-full rounded-lg bg-white px-2.5 py-1.5 text-left text-xs font-semibold text-slate-800 hover:bg-violet-100 border border-violet-100 transition-colors"
                        >
                          {c.name} · {c.phone || "No phone"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* INPUT FIELDS (All explicitly styled light for high contrast) */}
              <div className="space-y-3.5 pt-1">
                {/* Mobile Number */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Customer Mobile *
                  </label>
                  <input
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    maxLength={10}
                    placeholder="10-digit mobile number"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                {/* Customer Name (Resolved from CafeERP database) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Customer Name (Database Resolved)
                  </label>
                  <input
                    value={name}
                    readOnly
                    placeholder="Resolves from CafeERP directory..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700 cursor-not-allowed font-medium"
                  />
                </div>

                {/* Aadhaar Last 4 Digits */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Aadhaar Last 4 Digits *
                  </label>
                  <input
                    value={aadhaar}
                    onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    maxLength={4}
                    placeholder="Last 4 digits only (e.g. 1234)"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 transition-colors tracking-widest"
                  />
                </div>

                {/* Transaction Type */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Transaction Type *
                  </label>
                  <select
                    value={transferMethod}
                    onChange={(e) => setTransferMethod(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 font-medium"
                  >
                    <option value="cash_out">Cash Out (Withdrawal)</option>
                    <option value="balance_enquiry">Balance Enquiry</option>
                    <option value="mini_statement">Mini Statement</option>
                  </select>
                </div>

                {/* 1-Click Top Indian Bank Chips */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-bold text-slate-700">Select Bank *</label>
                    <span className="text-[10px] text-blue-600 font-semibold">1-Click Top Banks</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5 mb-2">
                    {TOP_INDIAN_BANKS.map((b) => {
                      const active = isBankChipActive(b.code);
                      return (
                        <button
                          key={b.code}
                          type="button"
                          onClick={() => selectBankByCode(b.code)}
                          className={`rounded-lg py-1.5 text-[10px] font-bold transition-all text-center border ${
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
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 font-medium"
                  >
                    <option value="">Or choose from all 100+ Indian Banks...</option>
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
                    <label className="text-[11px] font-bold text-slate-700">Amount (₹) *</label>
                    <span className="text-[10px] text-slate-400">Denomination Chips</span>
                  </div>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.00"
                    disabled={transferMethod !== "cash_out"}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-base font-black font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 transition-colors mb-2 disabled:opacity-50"
                  />
                  {transferMethod === "cash_out" && (
                    <div className="grid grid-cols-6 gap-1.5">
                      {[500, 1000, 2000, 3000, 5000, 10000].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => handleDenominationClick(d)}
                          className="rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-600 hover:text-white hover:border-blue-600 py-1 text-[10px] font-bold text-slate-700 transition-all text-center"
                        >
                          {d >= 1000 ? `${d / 1000}k` : d}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Customer Fee & Portal Commission Inputs */}
                <div className="grid grid-cols-2 gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Customer Fee (₹)</label>
                    <input
                      value={fee}
                      onChange={(e) => setFee(e.target.value)}
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0.00"
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-indigo-700 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Portal Commission (₹)</label>
                    <input
                      value={commission}
                      onChange={(e) => setCommission(e.target.value)}
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0.00"
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-emerald-700 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Registered Portal Selection */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Service Portal *
                  </label>
                  <select
                    value={portalId}
                    onChange={(e) => setPortalId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 font-medium"
                  >
                    <option value="">Select registered portal</option>
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
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Bank RRN / Ref</label>
                    <input
                      value={bankRef}
                      onChange={(e) => setBankRef(e.target.value)}
                      placeholder="e.g. 42819201"
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Portal Ref</label>
                    <input
                      value={portalRef}
                      onChange={(e) => setPortalRef(e.target.value)}
                      placeholder="e.g. DP-8821"
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 font-mono"
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
                  className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 py-3 text-xs font-black text-white shadow-lg shadow-blue-600/25 active:scale-95 transition-all disabled:opacity-50 disabled:hover:bg-blue-600 flex items-center justify-center gap-2"
                >
                  {busy ? "Processing…" : "Review AEPS Transaction"}
                </button>
                <p className="mt-2 text-center text-[10px] text-slate-400">
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
                  <h3 className="text-base font-black text-slate-900">Review AEPS Transaction</h3>
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
                  <span className="font-bold text-slate-900 capitalize">{transferMethod.replace(/_/g, " ")}</span>
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
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={recordTransaction}
                  disabled={!isFormValid || busy}
                  className="rounded-xl bg-blue-600 hover:bg-blue-500 px-5 py-2.5 text-xs font-black text-white shadow-md shadow-blue-600/25 transition-all disabled:opacity-50"
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
