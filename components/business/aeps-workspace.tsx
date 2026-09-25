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
  paymentInstruments = [],
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
  const { showToast, toastView } = useToast();
  const formRef = useRef<HTMLDivElement>(null);

  useRealtime(["transactions", "aeps_banks", "aeps_portals", "customers", "cash_entries", "payment_instruments", "settlements"]);

  const [transactions, setTransactions] = useState<Txn[]>(initialTransactions);
  const [customers, setCustomers] = useState<CustomerRow[]>(initialCustomers);
  const [banks, setBanks] = useState<Master[]>(initialBanks);
  const [portals, setPortals] = useState<Master[]>(initialPortals);
  const [liveInstruments, setLiveInstruments] = useState<any[]>(paymentInstruments);
  const [livePool, setLivePool] = useState<any>(float);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>(() =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );

  // Operation selection: "withdrawal" (Cash Out), "enquiry" (Balance Enquiry), "statement" (Mini Statement)
  const [operation, setOperation] = useState<"withdrawal" | "enquiry" | "statement">("withdrawal");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [recordMode, setRecordMode] = useState<"manual" | "ai">("manual");

  // Canonical Clean Form State (Starts completely empty on fresh page load)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [customerMobile, setCustomerMobile] = useState<string>("");
  const [selectedBankId, setSelectedBankId] = useState<string>("");
  const [selectedPortalId, setSelectedPortalId] = useState<string>(initialPortals[0]?.id || "");
  const [aadhaarLast4, setAadhaarLast4] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [serviceFee, setServiceFee] = useState<string>("");
  const [portalCommission, setPortalCommission] = useState<string>("");
  
  // Fee Treatment: "separate" (Collect Separately) vs "deduct" (Deduct From Payout)
  const [feeTreatment, setFeeTreatment] = useState<"deduct" | "separate">("separate");
  // Fee Collection Instrument (when separate): "cash", "upi", "bank", "due"
  const [customerPayMethod, setCustomerPayMethod] = useState<"cash" | "upi" | "bank" | "due">("cash");

  // Receipt Print Preference: "basic" (Default, amount only) vs "detailed" (With fee breakdown)
  const [receiptMode, setReceiptMode] = useState<"basic" | "detailed">("basic");

  const [reference, setReference] = useState<string>("");
  const [remarks, setRemarks] = useState<string>("");

  // Scan & Fill Modals
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scannedReviewData, setScannedReviewData] = useState<{
    customerName?: string;
    mobile?: string;
    aadhaarLast4?: string;
    bankName?: string;
    matchedBank?: Master | null;
  } | null>(null);

  // Add Bank Modal
  const [addBankWindowOpen, setAddBankWindowOpen] = useState(false);
  const [newBankName, setNewBankName] = useState("");
  const [newBankCode, setNewBankCode] = useState("");
  const [bankCreateError, setBankCreateError] = useState("");
  const [bankCreateSubmitting, setBankCreateSubmitting] = useState(false);

  // Add Customer Modal
  const [addCustomerWindowOpen, setAddCustomerWindowOpen] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustEmail, setNewCustEmail] = useState("");
  const [newCustAddress, setNewCustAddress] = useState("");
  const [custCreateError, setCustCreateError] = useState("");
  const [custCreateSubmitting, setCustCreateSubmitting] = useState(false);

  // Edit Transaction Modal (Full Financial & Operational)
  const [editTxnWindowOpen, setEditTxnWindowOpen] = useState(false);
  const [editingTxn, setEditingTxn] = useState<Txn | null>(null);
  const [editAmount, setEditAmount] = useState<string>("");
  const [editServiceFee, setEditServiceFee] = useState<string>("");
  const [editPortalCommission, setEditPortalCommission] = useState<string>("");
  const [editFeeTreatment, setEditFeeTreatment] = useState<"deduct" | "separate">("deduct");
  const [editCustomerPayMethod, setEditCustomerPayMethod] = useState<"cash" | "upi" | "bank" | "due">("cash");
  const [editBankId, setEditBankId] = useState<string>("");
  const [editPortalId, setEditPortalId] = useState<string>("");
  const [editAadhaarLast4, setEditAadhaarLast4] = useState<string>("");
  const [editCustomerId, setEditCustomerId] = useState<string>("");
  const [editCustomerMobile, setEditCustomerMobile] = useState<string>("");
  const [editReference, setEditReference] = useState<string>("");
  const [editRemarks, setEditRemarks] = useState<string>("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Transaction Processing & Lifecycle
  const [confirmWindowOpen, setConfirmWindowOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDetailTxn, setSelectedDetailTxn] = useState<Txn | null>(null);
  const [successTxn, setSuccessTxn] = useState<Txn | null>(null);

  // WhatsApp Modal
  const [waModal, setWaModal] = useState<{ open: boolean; phone: string; name: string; msg: string; refNum: string; refId: string }>({
    open: false,
    phone: "",
    name: "",
    msg: "",
    refNum: "",
    refId: "",
  });

  // When customer changes, auto-fill mobile
  useEffect(() => {
    if (!selectedCustomerId) return;
    const c = customers.find((x) => x.id === selectedCustomerId);
    if (c?.phone) setCustomerMobile(c.phone);
  }, [selectedCustomerId, customers]);

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [{ data: txns }, { data: poolData }, { data: bData }, { data: pData }, { data: cData }] = await Promise.all([
        supabase
          .from("transactions")
          .select("*, customers(name, phone), banks:aeps_banks(name, code), portals:aeps_portals(name, code), profiles(full_name)")
          .eq("service_type", "aeps")
          .order("transaction_timestamp", { ascending: false, nullsFirst: false })
          .order("transaction_date", { ascending: false })
          .limit(500),
        supabase.rpc("get_pool_balances"),
        supabase.from("aeps_banks").select("*").order("name"),
        supabase.from("aeps_portals").select("*").eq("service_type", "aeps").order("name"),
        supabase.from("customers").select("id, name, code, phone").eq("is_active", true).order("name"),
      ]);

      if (txns) setTransactions(txns as any);
      if (poolData) setLivePool((poolData as any)?.aeps ?? null);
      if (bData) setBanks(bData);
      if (pData) {
        setPortals(pData);
        setSelectedPortalId((prev) => (prev && pData.some((p: any) => p.id === prev) ? prev : pData[0]?.id || ""));
      }
      if (cData) setCustomers(cData);

      setLastRefreshedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch (err) {
      console.error("AEPS refresh error:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [supabase]);

  // Current canonical platform float
  const aepsCurrentBalance = useMemo(() => {
    if (!livePool) return 0;
    return Number(livePool.current ?? (Number(livePool.opening || 0) + Number(livePool.movements || 0)));
  }, [livePool]);

  // Selected Bank Object
  const selectedBank = useMemo(() => {
    return banks.find((b) => b.id === selectedBankId);
  }, [banks, selectedBankId]);

  // Calculations for current form values
  const numAmount = parseFloat(amount) || 0;
  const numFee = parseFloat(serviceFee) || 0;
  const numComm = parseFloat(portalCommission) || 0;
  const totalIncome = numFee + numComm;
  const cashHanded = feeTreatment === "deduct" ? Math.max(0, numAmount - numFee) : numAmount;

  // Validation rules
  const cleanAadhaar = aadhaarLast4.replace(/\D/g, "");
  const cleanMobile = customerMobile.replace(/\D/g, "");

  const isFormValid = useMemo(() => {
    if (!selectedBankId) return false;
    if (cleanAadhaar.length !== 4) return false;
    if (cleanMobile.length !== 10) return false;
    if (!selectedPortalId) return false;
    if (operation === "withdrawal" && numAmount <= 0) return false;
    if (numFee < 0 || numComm < 0) return false;
    return true;
  }, [selectedBankId, cleanAadhaar, cleanMobile, selectedPortalId, operation, numAmount, numFee, numComm]);

  // Filtered transactions list
  const filteredTxns = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return transactions.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (!q) return true;
      const trendData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (6 - index));
      return d;
    });
    return days.map((day) => {
      const key = day.toISOString().slice(0, 10);
      const rows = transactions.filter((t) => String(t.transaction_date || "").slice(0, 10) === key && t.status === "success");
      return { label: day.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }), count: rows.length, amount: rows.reduce((sum, t) => sum + Number(t.amount || 0), 0) };
    });
  }, [transactions]);

  const transactionTypes = useMemo(() => Array.from(new Set(transactions.map((t) => t.transfer_method || "Cash Withdrawal").filter(Boolean))), [transactions]);

  const displayedTransactions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const today = new Date();
    return transactions.filter((t) => {
      const type = t.transfer_method || "Cash Withdrawal";
      if (typeFilter !== "all" && type !== typeFilter) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (dateFilter !== "all") {
        const d = new Date(String(t.transaction_timestamp || t.transaction_date || ""));
        if (dateFilter === "today" && d.toDateString() !== today.toDateString()) return false;
        if (dateFilter === "7d" && (today.getTime() - d.getTime()) > 7 * 86400000) return false;
        if (dateFilter === "30d" && (today.getTime() - d.getTime()) > 30 * 86400000) return false;
      }
      if (!q) return true;
      return [t.transaction_number, t.customer_mobile, t.customers?.name, t.banks?.name, t.portals?.name, t.reference, t.aadhaar_last4]
        .filter(Boolean).some((value) => String(value).toLowerCase().includes(q));
    });
  }, [transactions, searchQuery, statusFilter, typeFilter, dateFilter]);

  return (
    <div className="min-h-screen bg-[#f7f9fc] pb-16 text-slate-900 dark:bg-slate-950 dark:text-white">
      {toastView}

      <div className="mx-auto max-w-[1600px] space-y-5 px-4 py-5 sm:px-6">
        <section className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-[0_12px_40px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-slate-900 sm:px-7">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />LIVE WATCHER READY</span>
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Business Services / AEPS</span>
              </div>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white">AEPS Transactions</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Monitor, review and record Aadhaar Enabled Payment System transactions from every registered portal.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setScanModalOpen(true)} className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-xs font-black text-violet-700 hover:bg-violet-100 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">✦ AI Insights</button>
              <button type="button" onClick={handleNewCashOut} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700">+ Record Transaction</button>
              <button type="button" onClick={handleExportCsv} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">↓ Export</button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Total Transactions", String(kpis.count), kpis.successCount + " completed", "blue"],
            ["Total Amount", inr(kpis.volume), "AEPS transaction volume", "blue"],
            ["Total Fees", inr(kpis.fees), "Customer fees earned", "emerald"],
            ["Total Commission", inr(kpis.commissions), "Portal commission earned", "violet"],
          ].map(([label, value, note]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-center justify-between"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">₹</span><span className="text-[10px] font-black uppercase text-emerald-600">Live</span></div>
              <p className="mt-4 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</p>
              <p className="mt-1 text-2xl font-black">{value}</p>
              <p className="mt-1 text-xs text-slate-400">{note}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Recorded", String(kpis.successCount), "bg-emerald-50 border-emerald-200 text-emerald-700"],
            ["Pending / Review", String(Math.max(0, kpis.count - kpis.successCount)), "bg-amber-50 border-amber-200 text-amber-700"],
            ["Cancelled", String(transactions.filter((t) => t.status === "cancelled").length), "bg-rose-50 border-rose-200 text-rose-700"],
            ["Reversed", String(transactions.filter((t) => t.status === "reversed").length), "bg-slate-50 border-slate-200 text-slate-700"],
          ].map(([label, value, classes]) => (
            <div key={label} className={`rounded-2xl border p-4 ${classes}`}>
              <p className="text-[10px] font-black uppercase tracking-wider">{label}</p><p className="mt-1 text-2xl font-black">{value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 lg:col-span-3">
            <div className="flex items-center justify-between"><div><h2 className="text-sm font-black">Transaction Trend</h2><p className="text-xs text-slate-400">Completed AEPS volume · last 7 days</p></div><span className="text-xs font-bold text-blue-600">{inr(trendData.reduce((s, d) => s + d.amount, 0))}</span></div>
            <div className="mt-6 flex h-44 items-end gap-2">
              {trendData.map((d) => {
                const max = Math.max(...trendData.map((x) => x.amount), 1);
                return <div key={d.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2"><div className="w-full rounded-t-lg bg-blue-500/15" style={{ height: `${Math.max(8, (d.amount / max) * 120)}px` }}><div className="h-full w-full rounded-t-lg bg-blue-600" /></div><span className="truncate text-[9px] font-bold text-slate-400">{d.label}</span></div>;
              })}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 lg:col-span-2">
            <h2 className="text-sm font-black">Transactions by Type</h2><p className="text-xs text-slate-400">Live transaction mix</p>
            <div className="mt-5 space-y-3">
              {(transactionTypes.length ? transactionTypes : ["Cash Withdrawal"]).slice(0, 5).map((type) => {
                const count = transactions.filter((t) => (t.transfer_method || "Cash Withdrawal") === type).length;
                const pct = transactions.length ? Math.round((count / transactions.length) * 100) : 0;
                return <div key={type}><div className="flex justify-between text-xs font-bold"><span>{type}</span><span>{count} · {pct}%</span></div><div className="mt-1.5 h-2 rounded-full bg-slate-100 dark:bg-white/5"><div className="h-full rounded-full bg-violet-500" style={{ width: `${pct}%` }} /></div></div>;
              })}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold outline-none dark:border-white/10 dark:bg-white/5"><option value="all">All Dates</option><option value="today">Today</option><option value="7d">Last 7 Days</option><option value="30d">Last 30 Days</option></select>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold outline-none dark:border-white/10 dark:bg-white/5"><option value="all">All Types</option>{transactionTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold outline-none dark:border-white/10 dark:bg-white/5"><option value="all">All Status</option><option value="success">Recorded</option><option value="pending">Pending</option><option value="cancelled">Cancelled</option><option value="reversed">Reversed</option></select>
            </div>
            <div className="relative w-full xl:w-80"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span><input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search customer, mobile, Aadhaar, ref…" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5" /></div>
          </div>
        </section>

        <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="min-w-0 space-y-4">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-white/5"><div><h2 className="text-sm font-black">AEPS Transactions</h2><p className="text-xs text-slate-400">{displayedTransactions.length} transaction(s) shown</p></div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">{portals.length} portals registered</span></div>
              <div className="overflow-x-auto">
                <table className="min-w-[1250px] w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:bg-white/5">
                    <tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Date &amp; Time</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Mobile</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Aadhaar</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Fee</th><th className="px-4 py-3">Commission</th><th className="px-4 py-3">Bank Ref</th><th className="px-4 py-3">Portal</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {displayedTransactions.length ? displayedTransactions.map((t, index) => (
                      <tr key={t.id} className="hover:bg-slate-50/80 dark:hover:bg-white/[0.03]">
                        <td className="px-4 py-3 text-slate-400">{index + 1}</td>
                        <td className="px-4 py-3 whitespace-nowrap"><div className="font-bold">{fmtDate(t.transaction_date)}</div><div className="text-[10px] text-slate-400">{fmtTime(t.transaction_timestamp)}</div></td>
                        <td className="px-4 py-3"><div className="font-bold">{t.customers?.name || "Walk-in Customer"}</div><div className="text-[10px] text-slate-400">{t.transaction_number}</div></td>
                        <td className="px-4 py-3 font-mono text-[11px]">{maskMobile(t.customer_mobile || t.customers?.phone)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{t.transfer_method || "Cash Withdrawal"}</td>
                        <td className="px-4 py-3 font-mono">**** {t.aadhaar_last4 || "—"}</td>
                        <td className="px-4 py-3 font-black">{inr(t.amount)}</td>
                        <td className="px-4 py-3 font-bold text-emerald-600">{inr(t.service_fee || 0)}</td>
                        <td className="px-4 py-3 font-bold text-violet-600">{inr(t.portal_commission || 0)}</td>
                        <td className="px-4 py-3 font-mono">{t.reference || "—"}</td>
                        <td className="px-4 py-3"><div className="font-bold">{t.portals?.name || "—"}</div><div className="text-[10px] text-slate-400">{t.banks?.name || "Bank —"}</div></td>
                        <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-black ${t.status === "success" ? "bg-emerald-100 text-emerald-700" : t.status === "cancelled" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{t.status}</span></td>
                        <td className="px-4 py-3"><button type="button" onClick={() => setSelectedDetailTxn(t)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-bold hover:bg-slate-50 dark:border-white/10">View</button></td>
                      </tr>
                    )) : <tr><td colSpan={13} className="px-5 py-12 text-center text-xs text-slate-400">No AEPS transactions match the selected filters.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-5 dark:border-violet-500/20 dark:bg-violet-500/10">
                <div className="flex items-center justify-between"><h2 className="text-sm font-black">✦ AI Insights</h2><span className="text-[10px] font-black uppercase text-violet-600">Read-only</span></div>
                {transactions.length ? <div className="mt-4 space-y-3 text-xs"><div className="rounded-xl bg-white/70 p-3 dark:bg-white/5"><strong>{portals.length}</strong> registered AEPS portal(s) are available for transaction routing.</div><div className="rounded-xl bg-white/70 p-3 dark:bg-white/5"><strong>{kpis.successCount}</strong> completed transaction(s) are currently recorded.</div><div className="rounded-xl bg-white/70 p-3 dark:bg-white/5">Latest activity: <strong>{recentTxn?.portals?.name || "Portal not recorded"}</strong> · {recentTxn ? inr(recentTxn.amount) : "—"}.</div></div> : <p className="mt-4 text-xs text-slate-500">No transaction history yet. AI insights will appear when AEPS records are available.</p>}
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-500/20 dark:bg-amber-500/10">
                <h2 className="text-sm font-black">Important Notes</h2>
                <ul className="mt-4 space-y-2 text-xs text-slate-600 dark:text-slate-300"><li>• Aadhaar last 4 digits are mandatory for AEPS.</li><li>• Customer name is sourced from the CafeERP customer record, not from a portal.</li><li>• Portal identity should come from the registered portal/session.</li><li>• Financial submission remains under operator control.</li></ul>
              </div>
            </div>
          </div>

          <aside ref={formRef} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_45px_rgba(15,23,42,0.07)] dark:border-white/10 dark:bg-slate-900 xl:sticky xl:top-24">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-white/5">
              <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Record AEPS Transaction</p><h2 className="mt-1 text-lg font-black">New Transaction</h2></div>
              <span className="rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">REVIEW BEFORE SUBMIT</span>
            </div>

            <div className="mt-4 grid grid-cols-2 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
              <button type="button" onClick={() => setRecordMode("manual")} className={`rounded-lg px-3 py-2 text-xs font-black ${recordMode === "manual" ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white" : "text-slate-500"}`}>Manual Entry</button>
              <button type="button" onClick={() => { setRecordMode("ai"); setScanModalOpen(true); }} className={`rounded-lg px-3 py-2 text-xs font-black ${recordMode === "ai" ? "bg-white text-violet-700 shadow-sm dark:bg-slate-800 dark:text-violet-300" : "text-slate-500"}`}>✦ AI Auto-Fill</button>
            </div>

            <div className="mt-4 space-y-3">
              <div><label className="text-[10px] font-black uppercase text-slate-400">Customer</label><SearchableSelect value={selectedCustomerId} onChange={setSelectedCustomerId} minSearchLength={2} minSearchPrompt="Search saved customer…" options={[{ value: "", label: "-- Select customer --" }, ...customers.map((c) => ({ value: c.id, label: c.name }))]} placeholder="Search customer…" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[10px] font-black uppercase text-slate-400">Mobile</label><input value={customerMobile} onChange={(e) => setCustomerMobile(e.target.value.replace(/D/g, "").slice(0,10))} placeholder="10 digits" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold dark:border-white/10 dark:bg-white/5" /></div>
                <div><label className="text-[10px] font-black uppercase text-slate-400">Aadhaar last 4 *</label><input maxLength={4} value={aadhaarLast4} onChange={(e) => setAadhaarLast4(e.target.value.replace(/D/g, "").slice(0,4))} placeholder="1234" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-mono font-black tracking-widest dark:border-white/10 dark:bg-white/5" /></div>
              </div>
              <div><label className="text-[10px] font-black uppercase text-slate-400">AEPS Type</label><select value={operation} onChange={(e) => setOperation(e.target.value as any)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold dark:border-white/10 dark:bg-white/5"><option value="withdrawal">Cash Withdrawal</option><option value="enquiry">Balance Enquiry</option><option value="statement">Mini Statement</option></select></div>
              {operation === "withdrawal" && <div><label className="text-[10px] font-black uppercase text-slate-400">Amount</label><div className="relative mt-1"><span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-slate-400">₹</span><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-8 pr-3 text-xl font-black dark:border-white/10 dark:bg-white/5" /></div></div>}
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[10px] font-black uppercase text-slate-400">Customer Fee</label><input type="number" value={serviceFee} onChange={(e) => setServiceFee(e.target.value)} placeholder="Auto / 0" className="mt-1 w-full rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2.5 text-xs font-black text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300" /></div>
                <div><label className="text-[10px] font-black uppercase text-slate-400">Commission</label><input type="number" value={portalCommission} onChange={(e) => setPortalCommission(e.target.value)} placeholder="Auto / 0" className="mt-1 w-full rounded-xl border border-violet-200 bg-violet-50/40 px-3 py-2.5 text-xs font-black text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300" /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[10px] font-black uppercase text-slate-400">Bank</label><select value={selectedBankId} onChange={(e) => setSelectedBankId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold dark:border-white/10 dark:bg-white/5"><option value="">Select bank</option>{banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
                <div><label className="text-[10px] font-black uppercase text-slate-400">Portal</label><select value={selectedPortalId} onChange={(e) => setSelectedPortalId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold dark:border-white/10 dark:bg-white/5">{portals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[10px] font-black uppercase text-slate-400">Bank Ref</label><input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="RRN / bank ref" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold dark:border-white/10 dark:bg-white/5" /></div>
                <div><label className="text-[10px] font-black uppercase text-slate-400">Portal Ref</label><input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Portal reference" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold dark:border-white/10 dark:bg-white/5" /></div>
              </div>
              <div><label className="text-[10px] font-black uppercase text-slate-400">Collection Method</label><div className="grid grid-cols-4 gap-1.5 mt-1">{[{id:"cash",label:"Cash"},{id:"upi",label:"UPI"},{id:"bank",label:"Bank"},{id:"due",label:"Due"}].map((m) => <button type="button" key={m.id} onClick={() => setCustomerPayMethod(m.id as any)} className={`rounded-lg border px-2 py-2 text-[10px] font-black ${customerPayMethod===m.id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500 dark:border-white/10 dark:bg-white/5"}`}>{m.label}</button>)}</div></div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5"><div className="flex justify-between text-xs"><span className="text-slate-500">Customer fee</span><strong>{inr(numFee)}</strong></div><div className="mt-1 flex justify-between text-xs"><span className="text-slate-500">Portal commission</span><strong>{inr(numComm)}</strong></div><div className="mt-2 border-t border-slate-200 pt-2 dark:border-white/10 flex justify-between text-sm"><span className="font-black">Your income</span><strong className="text-emerald-600">+{inr(totalIncome)}</strong></div></div>
              <button type="button" onClick={handleInitiateTransaction} disabled={!isFormValid || isSubmitting} className={`w-full rounded-xl py-3 text-sm font-black ${isFormValid && !isSubmitting ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700" : "cursor-not-allowed bg-slate-100 text-slate-400"}`}>{isSubmitting ? "Processing…" : "Record Transaction"}</button>
              <p className="text-center text-[10px] text-slate-400">Review all financial values before final submission.</p>
            </div>
          </aside>
        </section>
      </div>

      {confirmWindowOpen && <FloatingWindow isOpen={confirmWindowOpen} size="sm" title="Confirm AEPS Cash Withdrawal" onClose={() => setConfirmWindowOpen(false)}><div className="p-5 space-y-4"><div className="rounded-2xl bg-slate-50 p-4 text-xs space-y-2"><div className="flex justify-between"><span className="text-slate-500">Withdrawal Amount:</span><strong className="text-base text-slate-900 dark:text-white">{inr(numAmount)}</strong></div><div className="flex justify-between"><span className="text-slate-500">Customer Bank:</span><strong className="text-slate-900 dark:text-white">{selectedBank?.name}</strong></div><div className="flex justify-between"><span className="text-slate-500">Aadhaar (Last 4):</span><strong className="text-slate-900 dark:text-white">**** {cleanAadhaar}</strong></div><div className="flex justify-between"><span className="text-slate-500">{feeTreatment === "deduct" ? "Fee Deducted from Payout:" : "Customer Service Fee:"}</span><strong className={feeTreatment === "deduct" ? "text-amber-600 dark:text-amber-400 font-bold" : "text-emerald-600 dark:text-emerald-400 font-bold"}>{feeTreatment === "deduct" ? `-${inr(numFee)}` : `+${inr(numFee)}`}</strong></div><div className="flex justify-between"><span className="text-slate-500">Fee Treatment:</span><strong className="text-slate-900 dark:text-white">{feeTreatment === "deduct" ? "Deducted from Payout" : `Separate via ${customerPayMethod.toUpperCase()}`}</strong></div>{feeTreatment === "separate" && customerPayMethod === "cash" && <div className="flex justify-between"><span className="text-slate-500">Total Customer Cash Received:</span><strong className="text-slate-900 dark:text-white">{inr(numAmount + numFee)}</strong></div>}<div className="flex justify-between"><span className="text-slate-500">Portal Commission:</span><strong className="text-teal-600 dark:text-teal-400 font-bold">+{inr(numComm)}</strong></div><div className="flex justify-between"><span className="text-slate-700 font-bold">Operator Net Income:</span><strong className="text-emerald-600 dark:text-emerald-400 font-black">+{inr(totalIncome)}</strong></div><div className="flex justify-between border-t border-slate-200 pt-2 dark:border-white/10"><span className="text-slate-700 font-bold dark:text-slate-300">Physical Cash to Hand to Customer:</span><strong className="text-emerald-600 dark:text-emerald-400 text-sm font-black">{inr(cashHanded)}</strong></div></div><p className="text-[11px] text-slate-500">Please verify biometric confirmation on your AEPS device before confirming.</p><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setConfirmWindowOpen(false)} disabled={isSubmitting} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button><button type="button" onClick={handleProcessTransaction} disabled={isSubmitting || !isFormValid} className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50">{isSubmitting ? "Processing…" : `Confirm & Disburse ${inr(cashHanded)}`}</button></div></div></FloatingWindow>}

      {addBankWindowOpen && <FloatingWindow isOpen={addBankWindowOpen} size="sm" title="Add New Bank to Master List" onClose={() => setAddBankWindowOpen(false)}><form onSubmit={handleCreateBank} className="p-5 space-y-4">{bankCreateError && <div className="rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-600 dark:bg-rose-950/30 dark:text-rose-400">{bankCreateError}</div>}<div className="space-y-1.5"><label className="text-xs font-bold text-slate-700 dark:text-slate-300">Bank Name <span className="text-rose-500">*</span></label><input type="text" required value={newBankName} onChange={(e) => setNewBankName(e.target.value)} placeholder="e.g. Bandhan Bank Ltd" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-teal-500 dark:border-white/10 dark:bg-white/5" /></div><div className="space-y-1.5"><label className="text-xs font-bold text-slate-700 dark:text-slate-300">Bank Code / IFSC Prefix (Optional)</label><input type="text" value={newBankCode} onChange={(e) => setNewBankCode(e.target.value.toUpperCase())} placeholder="e.g. BDBL" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-teal-500 dark:border-white/10 dark:bg-white/5" /></div><div className="rounded-xl bg-slate-50 p-3 text-[11px] text-slate-500 dark:bg-white/5"><strong>Strict Guarantee:</strong> If this bank already exists under a known alias or code, the system will select the existing record to prevent duplicate master data.</div><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setAddBankWindowOpen(false)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button><button type="submit" disabled={bankCreateSubmitting} className="rounded-xl bg-teal-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-teal-700 disabled:opacity-50">{bankCreateSubmitting ? "Saving…" : "Add & Select Bank"}</button></div></form></FloatingWindow>}

      {addCustomerWindowOpen && <FloatingWindow isOpen={addCustomerWindowOpen} size="sm" title="Add New Customer to CRM" onClose={() => setAddCustomerWindowOpen(false)}><form onSubmit={handleCreateCustomer} className="p-5 space-y-4 text-xs"><div className="space-y-1.5"><label className="text-xs font-bold text-slate-700 dark:text-slate-300">Customer Name <span className="text-rose-500">*</span></label><input type="text" required value={newCustName} onChange={(e) => setNewCustName(e.target.value)} placeholder="e.g. Rahul Sharma" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-teal-500 dark:border-white/10 dark:bg-white/5" /></div><div className="space-y-1.5"><label className="text-xs font-bold text-slate-700 dark:text-slate-300">Mobile Number <span className="text-rose-500">*</span></label><input type="tel" required maxLength={10} value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile number" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-teal-500 dark:border-white/10 dark:bg-white/5" /></div><div className="space-y-1.5"><label className="text-xs font-bold text-slate-700 dark:text-slate-300">Email Address (Optional)</label><input type="email" value={newCustEmail} onChange={(e) => setNewCustEmail(e.target.value)} placeholder="customer@email.com" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-teal-500 dark:border-white/10 dark:bg-white/5" /></div><div className="space-y-1.5"><label className="text-xs font-bold text-slate-700 dark:text-slate-300">Address / Location (Optional)</label><input type="text" value={newCustAddress} onChange={(e) => setNewCustAddress(e.target.value)} placeholder="e.g. Ward 4, Newtown" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-teal-500 dark:border-white/10 dark:bg-white/5" /></div><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setAddCustomerWindowOpen(false)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button><button type="submit" disabled={custCreateSubmitting} className="rounded-xl bg-teal-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-teal-700 disabled:opacity-50">{custCreateSubmitting ? "Saving…" : "Save & Select"}</button></div></form></FloatingWindow>}

      {editTxnWindowOpen && editingTxn && (
        <FloatingWindow
          isOpen={editTxnWindowOpen}
          size="md"
          title={`Edit AEPS Transaction #${editingTxn.transaction_number}`}
          onClose={() => setEditTxnWindowOpen(false)}
        >
          {(() => {
            const editNumAmt = parseFloat(editAmount) || 0;
            const editNumFee = parseFloat(editServiceFee) || 0;
            const editNumComm = parseFloat(editPortalCommission) || 0;
            const editCashHanded = editFeeTreatment === "deduct" ? Math.max(0, editNumAmt - editNumFee) : editNumAmt;
            const editTotalIncome = editNumFee + editNumComm;

            return (
              <form onSubmit={handleSaveEdit} className="p-5 space-y-4 text-xs">
                <div className="rounded-xl border border-teal-500/20 bg-teal-500/10 p-3 text-teal-900 dark:text-teal-300">
                  <div className="font-bold flex items-center gap-1.5">
                    <span>⚡</span>
                    <span>Full Reversal &amp; Double-Entry Repost</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-teal-800 dark:text-teal-400">
                    Modifying amounts, fees, or routing atomically reverses previous ledger postings and records new entries across Cash Drawer and AEPS Float Pool with ₹0.00 variance.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Withdrawal Amount (₹) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-teal-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Customer Service Fee (₹)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={editServiceFee}
                      onChange={(e) => setEditServiceFee(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-teal-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Portal Commission (₹)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={editPortalCommission}
                      onChange={(e) => setEditPortalCommission(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-teal-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Fee Treatment Model
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditFeeTreatment("deduct")}
                      className={`rounded-xl border p-2 text-left transition ${
                        editFeeTreatment === "deduct"
                          ? "border-teal-600 bg-teal-50/80 font-bold text-teal-900 dark:border-teal-500 dark:bg-teal-950/40 dark:text-teal-200"
                          : "border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5"
                      }`}
                    >
                      <div className="text-xs font-bold">✂️ Deduct from Payout</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">Cash handed: {inr(Math.max(0, editNumAmt - editNumFee))}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditFeeTreatment("separate")}
                      className={`rounded-xl border p-2 text-left transition ${
                        editFeeTreatment === "separate"
                          ? "border-teal-600 bg-teal-50/80 font-bold text-teal-900 dark:border-teal-500 dark:bg-teal-950/40 dark:text-teal-200"
                          : "border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5"
                      }`}
                    >
                      <div className="text-xs font-bold">💵 Collect Separately</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">Cash handed: {inr(editNumAmt)}</div>
                    </button>
                  </div>
                </div>

                {editFeeTreatment === "separate" && (
                  <div className="space-y-1 pt-1 border-t border-slate-100 dark:border-white/5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Fee Collection Instrument
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { id: "cash", label: "💵 Cash" },
                        { id: "upi", label: "📱 UPI / QR" },
                        { id: "bank", label: "🏦 Bank" },
                        { id: "due", label: "📋 Due" },
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setEditCustomerPayMethod(m.id as any)}
                          className={`rounded-lg border p-1.5 text-center text-xs font-bold transition ${
                            editCustomerPayMethod === m.id
                              ? "border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Customer Bank <span className="text-rose-500">*</span>
                    </label>
                    <SearchableSelect
                      value={editBankId}
                      onChange={setEditBankId}
                      options={[
                        { value: "", label: "-- Select Bank --" },
                        ...banks.map((b) => ({ value: b.id, label: b.name })),
                      ]}
                      placeholder="Search bank…"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      AEPS Service Portal <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={editPortalId}
                      onChange={(e) => setEditPortalId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold outline-none focus:border-teal-500 dark:border-white/10 dark:bg-white/5"
                    >
                      {portals.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Aadhaar Number (Last 4 Digits) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      value={editAadhaarLast4}
                      onChange={(e) => setEditAadhaarLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="e.g. 1234"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono font-bold tracking-widest outline-none focus:border-teal-500 dark:border-white/10 dark:bg-white/5"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Bank RRN / Auth Reference Number
                    </label>
                    <input
                      type="text"
                      value={editReference}
                      onChange={(e) => setEditReference(e.target.value)}
                      placeholder="12-digit RRN / Ref"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-teal-500 dark:border-white/10 dark:bg-white/5"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Customer Attribution
                    </label>
                    <SearchableSelect
                      value={editCustomerId}
                      onChange={(id) => {
                        setEditCustomerId(id);
                        const c = customers.find((cust) => cust.id === id);
                        if (c?.phone) setEditCustomerMobile(c.phone);
                      }}
                      minSearchLength={2}
                      minSearchPrompt="Type to search…"
                      options={[
                        { value: "", label: "-- Walk-in Customer --" },
                        ...customers.map((c) => ({ value: c.id, label: `${c.name} (${maskMobile(c.phone) || c.code})` })),
                      ]}
                      placeholder="Assign customer…"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Customer Mobile Number
                    </label>
                    <input
                      type="tel"
                      value={editCustomerMobile}
                      onChange={(e) => setEditCustomerMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="10-digit mobile"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-teal-500 dark:border-white/10 dark:bg-white/5"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Operator Remarks / Reason for Edit
                  </label>
                  <input
                    type="text"
                    value={editRemarks}
                    onChange={(e) => setEditRemarks(e.target.value)}
                    placeholder="e.g. Corrected withdrawal amount and RRN from receipt slip"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-teal-500 dark:border-white/10 dark:bg-white/5"
                  />
                </div>

                <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-1.5">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Projected Reconciliation Summary</div>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div>
                      <span className="text-slate-400">Withdrawal:</span>
                      <p className="font-black text-slate-900 dark:text-white">{inr(editNumAmt)}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Cash Handed:</span>
                      <p className="font-black text-emerald-600 dark:text-emerald-400">{inr(editCashHanded)}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Float Credited:</span>
                      <p className="font-black text-teal-600 dark:text-teal-400">{inr(editNumAmt + editNumComm)}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Net Earned:</span>
                      <p className="font-black text-cyan-600 dark:text-cyan-400">+{inr(editTotalIncome)}</p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
                  <button
                    type="button"
                    onClick={() => setEditTxnWindowOpen(false)}
                    disabled={editSubmitting}
                    className="rounded-xl px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editSubmitting || editNumAmt <= 0}
                    className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2 font-bold text-white shadow-md hover:bg-teal-700 disabled:opacity-50"
                  >
                    {editSubmitting ? (
                      <>
                        <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        <span>Reconciling &amp; Saving…</span>
                      </>
                    ) : (
                      "Save & Reconcile Transaction"
                    )}
                  </button>
                </div>
              </form>
            );
          })()}
        </FloatingWindow>
      )}

      {selectedDetailTxn && <FloatingWindow isOpen={Boolean(selectedDetailTxn)} size="md" title={`AEPS Transaction #${selectedDetailTxn.transaction_number}`} onClose={() => setSelectedDetailTxn(null)}>{(() => { const isDeducted = selectedDetailTxn.fee_source === "cut_from_withdrawal"; const detailCashHanded = isDeducted ? Math.max(0, Number(selectedDetailTxn.amount || 0) - Number(selectedDetailTxn.service_fee || 0)) : Number(selectedDetailTxn.amount || 0); const receiptUrl = `/business/receipt/${selectedDetailTxn.id}${receiptMode === "detailed" ? "?mode=detailed" : ""}`; const invoiceUrl = `/business/receipt/${selectedDetailTxn.id}/a4${receiptMode === "detailed" ? "?mode=detailed" : ""}`; return <div className="p-5 space-y-4 text-xs"><div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-white/5"><div><span className="text-slate-400">Date:</span> <div className="font-bold">{selectedDetailTxn.transaction_date}</div></div><div><span className="text-slate-400">Status:</span> <div className="font-bold text-emerald-600">{selectedDetailTxn.status.toUpperCase()}</div></div><div><span className="text-slate-400">Withdrawal Amount:</span> <div className="font-black text-sm">{inr(selectedDetailTxn.amount)}</div></div><div><span className="text-slate-400">Cash Handed to Customer:</span> <div className="font-black text-sm text-emerald-700 dark:text-emerald-400">{inr(detailCashHanded)}</div></div><div><span className="text-slate-400">{isDeducted ? "Fee Deducted from Payout:" : "Customer Service Fee:"}</span> <div className={isDeducted ? "font-bold text-amber-600 dark:text-amber-400" : "font-bold text-emerald-600"}>{isDeducted ? `-${inr(selectedDetailTxn.service_fee)}` : `+${inr(selectedDetailTxn.service_fee)}`}</div></div><div><span className="text-slate-400">Fee Treatment:</span> <div className="font-bold text-slate-700 dark:text-slate-300">{isDeducted ? "Deducted from Payout" : `Separate via ${(selectedDetailTxn.customer_pay_method || "CASH").toUpperCase()}`}</div></div><div><span className="text-slate-400">Portal Commission:</span> <div className="font-bold text-teal-600 dark:text-teal-400">+{inr(selectedDetailTxn.portal_commission)}</div></div><div><span className="text-slate-400">Total Operator Income:</span> <div className="font-black text-emerald-600">+{inr(Number(selectedDetailTxn.service_fee || 0) + Number(selectedDetailTxn.portal_commission || 0))}</div></div><div><span className="text-slate-400">Customer:</span> <div className="font-bold">{selectedDetailTxn.customers?.name || "Walk-in"}</div></div><div><span className="text-slate-400">Aadhaar:</span> <div className="font-bold">**** {selectedDetailTxn.aadhaar_last4 || "N/A"}</div></div><div><span className="text-slate-400">Bank:</span> <div className="font-bold">{selectedDetailTxn.banks?.name || "N/A"}</div></div><div><span className="text-slate-400">Portal:</span> <div className="font-bold">{selectedDetailTxn.portals?.name || "N/A"}</div></div>{selectedDetailTxn.reference && <div className="col-span-2"><span className="text-slate-400">RRN / Ref:</span> <div className="font-bold">{selectedDetailTxn.reference}</div></div>}{selectedDetailTxn.remarks && <div className="col-span-2"><span className="text-slate-400">Remarks:</span> <div className="font-semibold">{selectedDetailTxn.remarks}</div></div>}</div><div className="flex justify-between items-center pt-2"><div className="flex gap-2"><Link href={receiptUrl} target="_blank" className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white hover:bg-slate-800 dark:bg-teal-600">🖨️ 80mm</Link><Link href={invoiceUrl} target="_blank" className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200">📄 A4 Invoice</Link><button type="button" onClick={() => { setSelectedDetailTxn(null); handleOpenEdit(selectedDetailTxn); }} className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 font-bold text-teal-700 hover:bg-teal-100 dark:border-teal-900/40 dark:bg-teal-950/40 dark:text-teal-300">✏️ Edit Transaction</button></div><button type="button" onClick={() => setSelectedDetailTxn(null)} className="rounded-xl px-4 py-2 font-bold text-slate-500 hover:bg-slate-100">Close</button></div></div>; })()}</FloatingWindow>}

      {waModal.open && <WhatsAppSendModal open={waModal.open} onClose={() => setWaModal((prev) => ({ ...prev, open: false }))} phone={waModal.phone} initialMessage={waModal.msg} recipientName={waModal.name} messageType="banking_txn" refId={waModal.refId} refNumber={waModal.refNum} onSent={() => showToast("success", "WhatsApp receipt dispatched.")} />}

      {scanModalOpen && <ScanFillModal open={scanModalOpen} mode="aeps" onClose={() => setScanModalOpen(false)} onApply={handleScanApply} />}
    </div>
  );
}
