"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Banknote,
  Camera,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Clock3,
  Download,
  FileImage,
  Filter,
  Landmark,
  Menu,
  MoreHorizontal,
  Percent,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  WalletCards,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { downloadCsv } from "@/components/ui/csv";
import CustomerSearchSelect, { type CustomerSearchResult } from "@/components/customers/customer-search-select";
import { extractAeps, type ScanFields } from "@/lib/scan/extract";
import { fileToDataUrl, ocrImage } from "@/lib/scan/ocr";
import type { Master, Txn } from "./business-client";

const TOP_BANKS = [
  { code: "SBI", label: "SBI", match: ["sbi", "state bank of india"] },
  { code: "PNB", label: "PNB", match: ["pnb", "punjab national bank"] },
  { code: "BOB", label: "BoB", match: ["bob", "bank of baroda"] },
  { code: "UBI", label: "UBI", match: ["ubi", "union bank of india"] },
  { code: "CANARA", label: "Canara", match: ["canara"] },
  { code: "HDFC", label: "HDFC", match: ["hdfc"] },
  { code: "ICICI", label: "ICICI", match: ["icici"] },
  { code: "AXIS", label: "Axis", match: ["axis"] },
  { code: "KOTAK", label: "Kotak", match: ["kotak"] },
  { code: "INDIAN", label: "Indian", match: ["indian bank"] },
];

const DENOMINATIONS = [500, 1000, 2000, 3000, 5000, 10000];

function normalizeBankName(raw: string) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|bank|india|limited|ltd|branch)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchBank(input: string, banks: Master[]) {
  const n = normalizeBankName(input);
  if (!n) return null;
  for (const bank of banks) {
    const bn = normalizeBankName(bank.name);
    if (bn && (bn === n || bn.includes(n) || n.includes(bn))) return bank;
    if (bank.code && bank.code.toLowerCase() === String(input).trim().toLowerCase()) return bank;
  }
  return null;
}

function canonicalType(value?: string | null) {
  const v = String(value || "cash_out").toLowerCase();
  if (v === "withdrawal" || v === "cashout") return "cash_out";
  if (v === "enquiry" || v === "balance") return "balance_enquiry";
  if (v === "statement") return "mini_statement";
  return v;
}

function typeLabel(value?: string | null) {
  const t = canonicalType(value);
  if (t === "balance_enquiry") return "Balance Enquiry";
  if (t === "mini_statement") return "Mini Statement";
  return "Cash Out";
}

function maskMobile(raw?: string | null) {
  const m = String(raw || "").replace(/\D/g, "");
  return m.length === 10 ? m.slice(0, 2) + "••••••" + m.slice(-2) : m;
}

function formatDateTime(raw?: string | null) {
  if (!raw) return { date: "—", time: "" };
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return { date: raw, time: "" };
  return {
    date: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
    time: d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
  };
}

function detectAepsType(text: string) {
  if (/mini\s*statement|mini statement/i.test(text)) return "mini_statement";
  if (/balance\s*(enquiry|inquiry)|available balance/i.test(text)) return "balance_enquiry";
  return "cash_out";
}

function toneForStatus(status?: string | null) {
  const s = String(status || "").toLowerCase();
  if (s === "success" || s === "recorded") return "success";
  if (s === "pending" || s === "review" || s === "processing") return "pending";
  if (s === "failed" || s === "cancelled") return "danger";
  if (s === "reversed") return "violet";
  return "neutral";
}

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "success" | "pending" | "danger" | "violet" | "neutral";
}) {
  const cls = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    pending: "border-amber-200 bg-amber-50 text-amber-700",
    danger: "border-rose-200 bg-rose-50 text-rose-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
    neutral: "border-slate-200 bg-slate-50 text-slate-600",
  }[tone];
  return <span className={"inline-flex items-center rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wide " + cls}>{children}</span>;
}

function KpiCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: "blue" | "green" | "rose" | "violet" | "amber";
}) {
  const tones = {
    blue: "border-blue-100 bg-blue-50/60 text-blue-600",
    green: "border-emerald-100 bg-emerald-50/60 text-emerald-600",
    rose: "border-rose-100 bg-rose-50/60 text-rose-600",
    violet: "border-violet-100 bg-violet-50/60 text-violet-600",
    amber: "border-amber-100 bg-amber-50/60 text-amber-600",
  }[accent];
  return (
    <div className={"rounded-2xl border p-4 shadow-sm " + tones}>
      <div className="flex items-start justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-sm font-black shadow-sm">{icon}</div>
      </div>
      <p className="mt-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function StatusCard({
  icon,
  label,
  count,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  tone: "success" | "pending" | "danger" | "neutral";
}) {
  const cls = {
    success: "bg-emerald-50 text-emerald-700",
    pending: "bg-amber-50 text-amber-700",
    danger: "bg-rose-50 text-rose-700",
    neutral: "bg-slate-100 text-slate-700",
  }[tone];
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={"flex h-9 w-9 items-center justify-center rounded-xl " + cls}>{icon}</span>
        <div>
          <p className="text-[10px] font-bold text-slate-400">{label}</p>
          <p className="text-base font-black text-slate-950">{count}</p>
        </div>
      </div>
      <span className={"h-2.5 w-2.5 rounded-full " + (tone === "success" ? "bg-emerald-500" : tone === "pending" ? "bg-amber-500" : tone === "danger" ? "bg-rose-500" : "bg-slate-400")} />
    </div>
  );
}

export default function AepsWorkspace({
  initialTransactions,
  initialBanks,
  initialPortals,
  float,
}: {
  initialTransactions: Txn[];
  initialCustomers: any[];
  initialBanks: Master[];
  initialPortals: Master[];
  paymentInstruments?: any[];
  float: any;
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<Txn[]>(initialTransactions);
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [drawerOpen, setDrawerOpen] = useState(true);
  const [entryMode, setEntryMode] = useState<"manual" | "ai">("manual");
  const [transactionType, setTransactionType] = useState("cash_out");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null);
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
  const [feeSource, setFeeSource] = useState<"cut_from_withdrawal" | "separate_cash" | "upi">("cut_from_withdrawal");
  const [customerPayMethod, setCustomerPayMethod] = useState("cash");

  const [analyzerTab, setAnalyzerTab] = useState<"paste" | "photo">("paste");
  const [sourceText, setSourceText] = useState("");
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ScanFields>({});
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [matchNotice, setMatchNotice] = useState("");
  const [section, setSection] = useState<"overview" | "transactions">("overview");

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const cleanAadhaar = aadhaar.replace(/\D/g, "");
  const cleanMobile = mobile.replace(/\D/g, "");

  const isFormValid = Boolean(
    customerId &&
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
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    return rows.filter((t) => {
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

      if (dateFilter !== "all" && t.transaction_date) {
        const raw = String(t.transaction_date).slice(0, 10);
        if (dateFilter === "today" && raw !== todayKey) return false;
        if (dateFilter === "yesterday") {
          const d = new Date(now);
          d.setDate(d.getDate() - 1);
          if (raw !== d.toISOString().slice(0, 10)) return false;
        }
        if (["last7", "7d"].includes(dateFilter)) {
          const d = new Date(now);
          d.setDate(d.getDate() - 6);
          if (raw < d.toISOString().slice(0, 10) || raw > todayKey) return false;
        }
        if (["last30", "30d"].includes(dateFilter)) {
          const d = new Date(now);
          d.setDate(d.getDate() - 29);
          if (raw < d.toISOString().slice(0, 10) || raw > todayKey) return false;
        }
        if (["this_month", "month"].includes(dateFilter) && raw.slice(0, 7) !== todayKey.slice(0, 7)) return false;
      }

      if (typeFilter !== "all" && canonicalType(t.transfer_method) !== typeFilter) return false;
      if (statusFilter !== "all" && String(t.status || "").toLowerCase() !== statusFilter) return false;
      if (q && !haystack.includes(q)) return false;
      return true;
    });
  }, [rows, query, dateFilter, typeFilter, statusFilter]);

  const stats = useMemo(() => ({
    total: filtered.length,
    amount: filtered.reduce((n, t) => n + Number(t.amount || 0), 0),
    fees: filtered.reduce((n, t) => n + Number(t.service_fee || 0), 0),
    commission: filtered.reduce((n, t) => n + Number(t.portal_commission || 0), 0),
    success: filtered.filter((t) => ["success", "recorded"].includes(String(t.status))).length,
    pending: filtered.filter((t) => ["pending", "review", "processing"].includes(String(t.status))).length,
    cancelled: filtered.filter((t) => ["cancelled", "failed"].includes(String(t.status))).length,
    reversed: filtered.filter((t) => String(t.status) === "reversed").length,
  }), [filtered]);

  const trend = useMemo(() => {
    const now = new Date();
    const data = Array.from({ length: 7 }, (_, idx) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (6 - idx));
      const key = d.toISOString().slice(0, 10);
      return {
        key,
        label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
        count: rows.filter((t) => String(t.transaction_date || "").slice(0, 10) === key).length,
      };
    });
    return { data, max: Math.max(...data.map((x) => x.count), 1) };
  }, [rows]);

  const distribution = useMemo(() => {
    const total = rows.length || 1;
    const cash = rows.filter((t) => canonicalType(t.transfer_method) === "cash_out").length;
    const balance = rows.filter((t) => canonicalType(t.transfer_method) === "balance_enquiry").length;
    const statement = rows.filter((t) => canonicalType(t.transfer_method) === "mini_statement").length;
    return {
      cash,
      balance,
      statement,
      cashPct: Math.round(cash / total * 100),
      balancePct: Math.round(balance / total * 100),
      statementPct: Math.round(statement / total * 100),
    };
  }, [rows]);

  const portalName = initialPortals.find((p) => p.id === portalId)?.name || "—";
  const bankName = initialBanks.find((b) => b.id === bankId)?.name || "—";
  const aepsFloat = Number(float?.current ?? float?.balance ?? 0);

  function handleNewCashOut() {
    setCustomerId("");
    setSelectedCustomer(null);
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
    setFeeSource("cut_from_withdrawal");
    setCustomerPayMethod("cash");
    setAnalysis({});
    setSourceText("");
    setSourceImage(null);
    setMatchNotice("");
    setReviewOpen(false);
    setEntryMode("manual");
    setDrawerOpen(true);
  }

  function selectBankByCode(code: string) {
    const top = TOP_BANKS.find((b) => b.code === code);
    if (!top) return;
    const hit = initialBanks.find((b) => {
      const n = normalizeBankName(b.name);
      return top.match.some((m) => n.includes(m));
    });
    if (hit) setBankId(hit.id);
  }

  async function resolveCustomerFromSignals(mobileValue: string, aadhaarValue: string) {
    setMatchNotice("");
    let mobileMatch: CustomerSearchResult | null = null;

    if (mobileValue.length === 10) {
      try {
        const res = await fetch("/api/customers/search?q=" + encodeURIComponent(mobileValue) + "&limit=10");
        const data = await res.json();
        const candidates = Array.isArray(data?.results) ? data.results : [];
        mobileMatch = candidates.find((c: CustomerSearchResult) => String(c.phone || "").replace(/\D/g, "") === mobileValue) || null;
      } catch {
        // Manual selection remains available.
      }
    }

    let aadhaarCustomerIds: string[] = [];
    if (aadhaarValue.length === 4) {
      try {
        const { data } = await supabase
          .from("transactions")
          .select("customer_id")
          .eq("service_type", "aeps")
          .eq("aadhaar_last4", aadhaarValue)
          .not("customer_id", "is", null)
          .limit(50);
        aadhaarCustomerIds = Array.from(new Set((data || []).map((x: any) => x.customer_id).filter(Boolean)));
      } catch {
        aadhaarCustomerIds = [];
      }
    }

    if (mobileMatch && aadhaarCustomerIds.includes(mobileMatch.id)) {
      setCustomerId(mobileMatch.id);
      setSelectedCustomer(mobileMatch);
      setName(mobileMatch.name || "");
      setMobile(String(mobileMatch.phone || "").replace(/\D/g, ""));
      setMatchNotice("Verified by mobile + Aadhaar last 4.");
      return;
    }

    if (!mobileMatch && aadhaarCustomerIds.length === 1) {
      try {
        const { data } = await supabase
          .from("customers")
          .select("id, name, phone, code, is_active")
          .eq("id", aadhaarCustomerIds[0])
          .maybeSingle();
        if (data) {
          const record: CustomerSearchResult = {
            id: data.id,
            code: data.code || null,
            name: data.name || null,
            phone: data.phone || null,
            is_active: data.is_active !== false,
          };
          setCustomerId(record.id);
          setSelectedCustomer(record);
          setName(record.name || "");
          setMobile(String(record.phone || "").replace(/\D/g, ""));
          setMatchNotice("Matched by Aadhaar last 4.");
          return;
        }
      } catch {
        // Manual selection remains available.
      }
    }

    if (aadhaarCustomerIds.length > 1) {
      setMatchNotice(String(aadhaarCustomerIds.length) + " customers share this Aadhaar last 4. Select the correct customer manually.");
      return;
    }

    if (mobileMatch && !aadhaarValue) {
      setCustomerId(mobileMatch.id);
      setSelectedCustomer(mobileMatch);
      setName(mobileMatch.name || "");
      setMobile(String(mobileMatch.phone || mobileValue).replace(/\D/g, "").slice(0, 10));
      setMatchNotice("Unique mobile match found. Review before approval.");
      return;
    }

    if (mobileMatch && aadhaarValue.length === 4) {
      setMatchNotice("Mobile match found, but Aadhaar last 4 is not verified against this customer. Manual confirmation is required.");
      setCustomerId("");
      setSelectedCustomer(null);
      return;
    }

    if (aadhaarValue.length === 4 || mobileValue.length === 10) {
      setMatchNotice("No single verified customer match. Manual customer selection is required.");
    }
  }

  async function applyAnalyzedFields(fields: ScanFields) {
    setAnalysis(fields);
    if (fields.aadhaar_last4) setAadhaar(fields.aadhaar_last4);
    if (fields.customer_mobile) setMobile(String(fields.customer_mobile).replace(/\D/g, "").slice(0, 10));
    if (fields.amount) setAmount(fields.amount);
    if (fields.service_fee) setFee(fields.service_fee);
    if (fields.portal_commission) setCommission(fields.portal_commission);
    if (fields.reference) setBankRef(fields.reference);
    if (fields.portal_name) {
      const p = initialPortals.find((x) => String(x.name).toLowerCase().includes(String(fields.portal_name).toLowerCase()));
      if (p) setPortalId(p.id);
    }
    if (fields.bank_name) {
      const b = matchBank(fields.bank_name, initialBanks);
      if (b) setBankId(b.id);
    }
    const detectedType = detectAepsType(sourceText);
    setTransactionType(detectedType);
    if (fields.customer_mobile || fields.aadhaar_last4) {
      await resolveCustomerFromSignals(String(fields.customer_mobile || "").replace(/\D/g, "").slice(0, 10), fields.aadhaar_last4 || "");
    }
  }

  async function analyzeText() {
    setAnalysisBusy(true);
    setAnalysisError("");
    try {
      const fields = extractAeps(sourceText);
      await applyAnalyzedFields(fields);
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : "Text analysis failed.");
    } finally {
      setAnalysisBusy(false);
    }
  }

  async function analyzePhoto(file: File) {
    setAnalysisBusy(true);
    setAnalysisError("");
    try {
      const preview = await fileToDataUrl(file);
      setSourceImage(preview);
      const text = await ocrImage(file);
      setSourceText(text);
      const fields = extractAeps(text);
      await applyAnalyzedFields(fields);
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : "Photo analysis failed.");
    } finally {
      setAnalysisBusy(false);
    }
  }

  function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void analyzePhoto(file);
    e.currentTarget.value = "";
  }

  async function recordTransaction() {
    if (busy || !isFormValid) return;
    setBusy(true);
    try {
      const result = await supabase.rpc("create_business_txn", {
        p_service_type: "aeps",
        p_transaction_date: new Date().toISOString().slice(0, 10),
        p_transaction_timestamp: new Date().toISOString(),
        p_customer_id: customerId,
        p_customer_mobile: cleanMobile,
        p_reference: bankRef.trim() || null,
        p_remarks: portalRef.trim() ? "Portal Ref: " + portalRef.trim() : null,
        p_status: "success",
        p_bank_id: bankId,
        p_portal_id: portalId,
        p_merchant_qr_id: null,
        p_aadhaar_last4: cleanAadhaar,
        p_transfer_method: transactionType,
        p_sender_name: null,
        p_sender_mobile: null,
        p_beneficiary_name: null,
        p_beneficiary_mobile: null,
        p_beneficiary_bank: null,
        p_beneficiary_ifsc: null,
        p_beneficiary_account: null,
        p_upi_id: null,
        p_amount: Number(amount),
        p_service_fee: Number(fee || 0),
        p_portal_commission: Number(commission || 0),
        p_fee_source: feeSource,
        p_paid_from: "portal",
        p_customer_pay_method: customerPayMethod,
        p_receiver_name: null,
      });

      if (result.error) throw result.error;
      setRows((prev) => [result.data as Txn, ...prev]);
      setReviewOpen(false);
      handleNewCashOut();
    } catch (error) {
      console.error(error);
    } finally {
      setBusy(false);
    }
  }

  function handleExport() {
    downloadCsv(
      "aeps-transactions.csv",
      ["Transaction", "Date", "Customer", "Mobile", "Type", "Aadhaar", "Amount", "Customer Fee", "Portal Commission", "Bank", "Portal", "Bank Reference", "Portal Reference", "Status"],
      filtered.map((t) => [
        t.transaction_number || "",
        t.transaction_date || "",
        t.customers?.name || "",
        t.customer_mobile || t.customers?.phone || "",
        typeLabel(t.transfer_method),
        t.aadhaar_last4 || "",
        Number(t.amount || 0),
        Number(t.service_fee || 0),
        Number(t.portal_commission || 0),
        t.banks?.name || "",
        t.portals?.name || "",
        t.reference || "",
        String(t.remarks || "").replace(/^Portal Ref:\s*/i, ""),
        t.status || "",
      ])
    );
  }

  const inputCls = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const selectCls = inputCls;
  const smallBtn = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-700 transition hover:bg-slate-50";
  const primaryBtn = "rounded-xl bg-blue-600 px-4 py-2.5 text-[10px] font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45";

  return (
    <div className="min-h-full bg-[#f5f8fd] text-slate-900">
      <div className="mx-auto max-w-[1600px] space-y-4 px-4 pb-10 pt-4 lg:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 lg:hidden" aria-label="AEPS menu">
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 text-[10px] font-black text-slate-400">
              <span className="rounded-lg bg-slate-100 px-2 py-1">AEPS</span>
              <ArrowRight className="h-3 w-3" />
              <span className="text-slate-700">Operations</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setSection("overview")} className={"rounded-lg px-3 py-1.5 text-[10px] font-black " + (section === "overview" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500")}>Overview</button>
            <button type="button" onClick={() => setSection("transactions")} className={"rounded-lg px-3 py-1.5 text-[10px] font-black " + (section === "transactions" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500")}>All Transactions</button>
          </div>
        </div>

        <header className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Business Services / AEPS</div>
              <div className="mt-1.5 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm"><Banknote className="h-5 w-5" /></div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-black tracking-tight text-slate-950">AEPS Transactions</h1>
                    <Pill tone="success">● LIVE WATCHER READY</Pill>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Aadhaar Enabled Payment System — monitor, review, and record with operator control.</p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleNewCashOut} className={primaryBtn}><Plus className="mr-1 inline h-3.5 w-3.5" /> Record Transaction</button>
              <button type="button" onClick={() => setEntryMode("ai")} className={smallBtn}><Sparkles className="mr-1 inline h-3.5 w-3.5 text-violet-600" /> AI Detected</button>
              <button type="button" onClick={handleExport} className={smallBtn}><Download className="mr-1 inline h-3.5 w-3.5" /> Export</button>
            </div>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard icon={<Activity className="h-4 w-4" />} label="Total Transactions" value={String(stats.total)} accent="blue" />
          <KpiCard icon={<Banknote className="h-4 w-4" />} label="Total Amount" value={inr(stats.amount)} accent="green" />
          <KpiCard icon={<Percent className="h-4 w-4" />} label="Total Fees" value={inr(stats.fees)} accent="rose" />
          <KpiCard icon={<WalletCards className="h-4 w-4" />} label="Portal Commission" value={inr(stats.commission)} accent="violet" />
          <KpiCard icon={<Landmark className="h-4 w-4" />} label="AEPS Float" value={inr(aepsFloat)} accent="amber" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatusCard icon={<CheckCircle2 className="h-4 w-4" />} label="Recorded / Success" count={stats.success} tone="success" />
          <StatusCard icon={<Clock3 className="h-4 w-4" />} label="Pending / Review" count={stats.pending} tone="pending" />
          <StatusCard icon={<XCircle className="h-4 w-4" />} label="Cancelled" count={stats.cancelled} tone="danger" />
          <StatusCard icon={<RefreshCw className="h-4 w-4" />} label="Reversed" count={stats.reversed} tone="neutral" />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.35fr_.85fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div><h2 className="text-sm font-black text-slate-950">Transaction Trend</h2><p className="mt-0.5 text-[10px] text-slate-400">Recent AEPS activity</p></div>
              <Pill>Last 7 Days</Pill>
            </div>
            <div className="mt-6 grid grid-cols-7 items-end gap-2">
              {trend.data.map((d) => (
                <div key={d.key} className="flex min-w-0 flex-col items-center gap-2">
                  <div className="flex h-32 w-full items-end justify-center rounded-xl bg-slate-50">
                    <div className="w-5 rounded-t-lg bg-blue-500 transition-all" style={{ height: Math.max(8, d.count / trend.max * 100) + "%" }} title={String(d.count) + " transactions"} />
                  </div>
                  <span className="truncate text-[9px] font-bold text-slate-400">{d.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div><h2 className="text-sm font-black text-slate-950">Transactions by Type</h2><p className="mt-0.5 text-[10px] text-slate-400">Distribution across AEPS operations</p></div>
              <div className="relative h-24 w-24 rounded-full" style={{ background: "conic-gradient(#2563eb 0 " + distribution.cashPct + "%, #10b981 " + distribution.cashPct + "% " + (distribution.cashPct + distribution.balancePct) + "%, #f59e0b " + (distribution.cashPct + distribution.balancePct) + "% 100%)" }}>
                <div className="absolute inset-3 flex items-center justify-center rounded-full bg-white">
                  <div className="text-center"><div className="text-lg font-black text-slate-950">{rows.length}</div><div className="text-[8px] font-bold text-slate-400">Transactions</div></div>
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-3 text-[10px]">
              {[
                ["Cash Out", distribution.cash, distribution.cashPct, "bg-blue-500"],
                ["Balance Enquiry", distribution.balance, distribution.balancePct, "bg-emerald-500"],
                ["Mini Statement", distribution.statement, distribution.statementPct, "bg-amber-500"],
              ].map(([label, count, pct, dot]) => (
                <div key={String(label)}>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-bold text-slate-600"><span className={"h-2 w-2 rounded-full " + dot} />{label}</span>
                    <span className="font-black text-slate-900">{count} <span className="text-slate-400">({pct}%)</span></span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={"h-full rounded-full " + dot} style={{ width: String(pct) + "%" }} /></div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_420px]">
          <section className="min-w-0 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className={selectCls}>
                  <option value="all">All Dates</option><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="last7">Last 7 Days</option><option value="last30">Last 30 Days</option><option value="this_month">This Month</option>
                </select>
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={selectCls}>
                  <option value="all">All Types</option><option value="cash_out">Cash Out</option><option value="balance_enquiry">Balance Enquiry</option><option value="mini_statement">Mini Statement</option>
                </select>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
                  <option value="all">All Status</option><option value="success">Success</option><option value="pending">Pending</option><option value="review">Review</option><option value="cancelled">Cancelled</option><option value="reversed">Reversed</option>
                </select>
                <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-3.5 w-3.5 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customer, mobile, Aadhaar, reference, bank or portal…" className={inputCls + " pl-9"} /></div>
                <button type="button" className={smallBtn}><Filter className="h-3.5 w-3.5" /></button>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
                <div><h2 className="text-sm font-black text-slate-950">AEPS Transactions</h2><p className="mt-0.5 text-[10px] text-slate-400">Showing {filtered.length} filtered records</p></div>
                <div className="flex gap-2"><button type="button" onClick={handleExport} className={smallBtn}><Download className="mr-1 inline h-3 w-3" /> Export</button><button type="button" onClick={handleNewCashOut} className={primaryBtn}><Plus className="mr-1 inline h-3 w-3" /> New</button></div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1280px] text-left">
                  <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-3 py-3">#</th><th className="px-3 py-3">Date &amp; Time</th><th className="px-3 py-3">Customer</th><th className="px-3 py-3">Mobile</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Aadhaar</th><th className="px-3 py-3">Amount</th><th className="px-3 py-3">Customer Fee</th><th className="px-3 py-3">Portal Commission</th><th className="px-3 py-3">Bank</th><th className="px-3 py-3">Portal</th><th className="px-3 py-3">Bank Ref</th><th className="px-3 py-3">Portal Ref</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[10px]">
                    {filtered.map((t) => {
                      const dt = formatDateTime(t.transaction_timestamp || t.transaction_date);
                      return (
                        <tr key={t.id} className="transition hover:bg-slate-50">
                          <td className="px-3 py-3 font-mono font-black text-blue-600">{t.transaction_number || "—"}</td>
                          <td className="whitespace-nowrap px-3 py-3"><div className="font-bold text-slate-700">{dt.date}</div><div className="text-[9px] text-slate-400">{dt.time}</div></td>
                          <td className="px-3 py-3 font-black text-slate-900">{t.customers?.name || "—"}</td>
                          <td className="px-3 py-3 font-mono text-slate-500">{maskMobile(t.customer_mobile || t.customers?.phone) || "—"}</td>
                          <td className="px-3 py-3 font-semibold text-slate-600">{typeLabel(t.transfer_method)}</td>
                          <td className="px-3 py-3 font-mono">•••• {t.aadhaar_last4 || "—"}</td>
                          <td className="px-3 py-3 font-black text-slate-950">{inr(Number(t.amount || 0))}</td>
                          <td className="px-3 py-3 font-bold text-rose-600">{inr(Number(t.service_fee || 0))}</td>
                          <td className="px-3 py-3 font-bold text-violet-600">{inr(Number(t.portal_commission || 0))}</td>
                          <td className="px-3 py-3 text-slate-600">{t.banks?.name || "—"}</td>
                          <td className="px-3 py-3 text-slate-600">{t.portals?.name || "—"}</td>
                          <td className="px-3 py-3 font-mono text-slate-500">{t.reference || "—"}</td>
                          <td className="px-3 py-3 font-mono text-slate-500">{String(t.remarks || "").replace(/^Portal Ref:\s*/i, "") || "—"}</td>
                          <td className="px-3 py-3"><Pill tone={toneForStatus(t.status) as any}>{String(t.status || "unknown")}</Pill></td>
                          <td className="px-3 py-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              <Link href={"/business/receipt/" + t.id + "?mode=detailed"} target="_blank" className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-[9px] font-black text-blue-600">80mm</Link>
                              <Link href={"/business/receipt/" + t.id + "/a4?mode=detailed"} target="_blank" className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[9px] font-black text-slate-600">A4</Link>
                              <button type="button" className="rounded-lg border border-slate-200 p-1.5 text-slate-400"><MoreHorizontal className="h-3.5 w-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr><td colSpan={15} className="px-5 py-16 text-center"><div className="mx-auto flex max-w-sm flex-col items-center"><ShieldCheck className="h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-black text-slate-500">No AEPS transactions found</p><p className="mt-1 text-xs text-slate-400">Your real transaction data will appear here when available.</p></div></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <aside className="xl:sticky xl:top-4">
            {drawerOpen ? (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
                <div className="border-b border-slate-100 px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><div className="flex items-center gap-2"><h2 className="text-base font-black text-slate-950">Record AEPS Transaction</h2><Pill>Review First</Pill></div><p className="mt-1 text-[10px] text-slate-400">Enter customer details and transaction information</p></div>
                    <button type="button" onClick={() => setDrawerOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
                    <button type="button" onClick={() => setEntryMode("manual")} className={"rounded-lg px-3 py-2 text-[10px] font-black " + (entryMode === "manual" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500")}>Manual Entry</button>
                    <button type="button" onClick={() => setEntryMode("ai")} className={"rounded-lg px-3 py-2 text-[10px] font-black " + (entryMode === "ai" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500")}><Sparkles className="mr-1 inline h-3 w-3" /> AI Auto-Fill</button>
                  </div>
                </div>

                <div className="space-y-4 p-5">
                  {entryMode === "manual" && (
                    <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <div><div className="flex items-center gap-2 text-[11px] font-black text-violet-900"><Zap className="h-3.5 w-3.5 text-violet-600" /> Smart Paste / Photo Analyzer</div><p className="mt-0.5 text-[9px] text-violet-700/70">Paste portal text or analyze a screenshot. Nothing is recorded automatically.</p></div>
                        <Pill tone="violet">Manual</Pill>
                      </div>
                      <div className="mt-3 flex gap-1 rounded-xl bg-white/80 p-1">
                        <button type="button" onClick={() => setAnalyzerTab("paste")} className={"flex-1 rounded-lg px-2.5 py-2 text-[9px] font-black " + (analyzerTab === "paste" ? "bg-white text-violet-700 shadow-sm" : "text-slate-400")}><ClipboardPaste className="mr-1 inline h-3 w-3" /> Paste Text</button>
                        <button type="button" onClick={() => setAnalyzerTab("photo")} className={"flex-1 rounded-lg px-2.5 py-2 text-[9px] font-black " + (analyzerTab === "photo" ? "bg-white text-violet-700 shadow-sm" : "text-slate-400")}><FileImage className="mr-1 inline h-3 w-3" /> Photo Analyzer</button>
                      </div>

                      {analyzerTab === "paste" ? (
                        <div className="mt-3 space-y-2">
                          <textarea value={sourceText} onChange={(e) => setSourceText(e.target.value)} rows={5} placeholder="Paste DigiPay / portal transaction SMS or receipt text here…" className="w-full resize-none rounded-xl border border-violet-200 bg-white p-3 text-[10px] font-medium text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
                          <div className="flex gap-2">
                            <button type="button" onClick={() => void analyzeText()} disabled={!sourceText.trim() || analysisBusy} className="flex-1 rounded-xl bg-violet-600 px-3 py-2 text-[10px] font-black text-white disabled:opacity-40">{analysisBusy ? "Analyzing…" : "Analyze & Fill"}</button>
                            <button type="button" onClick={() => { setSourceText(""); setAnalysis({}); setMatchNotice(""); }} className={smallBtn}>Clear</button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 space-y-2.5">
                          <input ref={fileRef} type="file" accept="image/*" onChange={onPhotoChange} className="hidden" />
                          <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={onPhotoChange} className="hidden" />
                          <div className="grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => fileRef.current?.click()} className="rounded-xl border-2 border-dashed border-violet-200 bg-white px-3 py-5 text-center text-[10px] font-black text-violet-700 hover:bg-violet-50"><Upload className="mx-auto mb-1 h-5 w-5" /> Upload Screenshot</button>
                            <button type="button" onClick={() => cameraRef.current?.click()} className="rounded-xl border-2 border-dashed border-slate-200 bg-white px-3 py-5 text-center text-[10px] font-black text-slate-700 hover:bg-slate-50"><Camera className="mx-auto mb-1 h-5 w-5" /> Take Photo</button>
                          </div>
                          {sourceImage && <img src={sourceImage} alt="AEPS source preview" className="max-h-40 w-full rounded-xl bg-slate-50 object-contain ring-1 ring-slate-200" />}
                          <p className="text-[9px] leading-4 text-slate-500">Photo OCR runs locally in the browser. Review extracted fields before recording.</p>
                        </div>
                      )}

                      {analysisBusy && <p className="mt-2 text-[9px] font-bold text-violet-700">Reading source…</p>}
                      {analysisError && <p className="mt-2 flex items-center gap-1 text-[9px] font-bold text-rose-600"><AlertCircle className="h-3 w-3" /> {analysisError}</p>}
                      {Object.keys(analysis).length > 0 && (
                        <div className="mt-3 rounded-xl border border-violet-200 bg-white p-3">
                          <div className="flex items-center justify-between"><span className="text-[9px] font-black uppercase tracking-wide text-slate-400">Extracted</span><span className="text-[9px] font-bold text-emerald-600">{Object.keys(analysis).length} fields</span></div>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            {Object.entries(analysis).map(([key, value]) => <div key={key} className="rounded-lg bg-slate-50 p-2"><div className="text-[8px] font-bold uppercase tracking-wide text-slate-400">{key.replace(/_/g, " ")}</div><div className="mt-0.5 truncate text-[9px] font-black text-slate-700">{String(value)}</div></div>)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {entryMode === "ai" && (
                    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3.5">
                      <div className="flex items-center gap-2 text-[11px] font-black text-blue-900"><Sparkles className="h-3.5 w-3.5 text-blue-600" /> AI Auto-Fill Assistant</div>
                      <p className="mt-1 text-[9px] leading-4 text-slate-600">Detected data is treated as a draft. Match the customer and verify every field before approval.</p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {[
                          ["Portal", portalName],["Bank", bankName],["Type", typeLabel(transactionType)],["Aadhaar", cleanAadhaar ? "•••• " + cleanAadhaar : "Required"],["Amount", amount ? inr(Number(amount)) : "—"],["Reference", bankRef || "—"],
                        ].map(([k, v]) => <div key={k} className="rounded-xl border border-blue-100 bg-white p-2.5"><div className="text-[8px] font-bold uppercase tracking-wide text-slate-400">{k}</div><div className="mt-0.5 truncate text-[10px] font-black text-slate-800">{v}</div></div>)}
                      </div>
                      {matchNotice && <div className="mt-2 rounded-xl bg-white px-3 py-2 text-[9px] font-bold text-slate-600">{matchNotice}</div>}
                    </div>
                  )}

                  <div>
                    <div className="mb-1.5 flex items-center justify-between"><label className="text-[10px] font-black text-slate-600">Customer <span className="text-rose-500">*</span></label>{selectedCustomer && <Pill tone="success">Matched</Pill>}</div>
                    <CustomerSearchSelect
                      value={customerId || null}
                      selected={selectedCustomer}
                      onChange={(id, record) => {
                        setCustomerId(id || "");
                        setSelectedCustomer(record);
                        setName(record?.name || "");
                        setMobile(String(record?.phone || mobile).replace(/\D/g, "").slice(0, 10));
                      }}
                      placeholder="Search customer name, mobile or code…"
                      tone="auto"
                      limit={12}
                    />
                    {matchNotice && <p className="mt-1.5 text-[9px] font-bold text-amber-700">{matchNotice}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div><label className="mb-1.5 block text-[10px] font-black text-slate-600">Mobile <span className="text-rose-500">*</span></label><input value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0,10))} className={inputCls} inputMode="numeric" placeholder="10-digit mobile" /></div>
                    <div><label className="mb-1.5 block text-[10px] font-black text-slate-600">Aadhaar Last 4 <span className="text-rose-500">*</span></label><input value={aadhaar} onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, "").slice(0,4))} className={inputCls} inputMode="numeric" placeholder="4 digits" /></div>
                  </div>

                  {name && <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2"><div className="text-[8px] font-bold uppercase tracking-wide text-emerald-700">CafeERP Customer</div><div className="mt-0.5 text-[11px] font-black text-slate-800">{name}</div></div>}

                  <div>
                    <label className="mb-1.5 block text-[10px] font-black text-slate-600">Transaction Type <span className="text-rose-500">*</span></label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[["cash_out", "Cash Out"],["balance_enquiry", "Balance Enquiry"],["mini_statement", "Mini Statement"]].map(([id, label]) => <button key={id} type="button" onClick={() => setTransactionType(id)} className={"rounded-xl border px-2 py-2 text-[9px] font-black " + (transactionType === id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500")}>{label}</button>)}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between"><label className="text-[10px] font-black text-slate-600">Amount <span className="text-rose-500">*</span></label><span className="text-[8px] font-bold text-slate-400">Quick select</span></div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {DENOMINATIONS.map((value) => <button key={value} type="button" onClick={() => setAmount(String(value))} className={"rounded-xl border px-2 py-2 text-[9px] font-black " + (amount === String(value) ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500")}>₹{value.toLocaleString("en-IN")}</button>)}
                    </div>
                    <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} className={inputCls + " mt-2"} inputMode="decimal" placeholder="Enter amount" />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[10px] font-black text-slate-600">Bank <span className="text-rose-500">*</span></label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {TOP_BANKS.map((bank) => {
                        const selected = initialBanks.find((x) => x.id === bankId);
                        const active = selected ? bank.match.some((m) => normalizeBankName(selected.name).includes(m)) : false;
                        return <button key={bank.code} type="button" onClick={() => selectBankByCode(bank.code)} className={"rounded-lg border px-2 py-2 text-[8px] font-black " + (active ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500")}>{bank.label}</button>;
                      })}
                    </div>
                    <select value={bankId} onChange={(e) => setBankId(e.target.value)} className={selectCls + " mt-2"}><option value="">Select registered bank</option>{initialBanks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div><label className="mb-1.5 block text-[10px] font-black text-slate-600">Portal <span className="text-rose-500">*</span></label><select value={portalId} onChange={(e) => setPortalId(e.target.value)} className={selectCls}><option value="">Select portal</option>{initialPortals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                    <div><label className="mb-1.5 block text-[10px] font-black text-slate-600">Collection</label><select value={customerPayMethod} onChange={(e) => setCustomerPayMethod(e.target.value)} className={selectCls}><option value="cash">Cash</option><option value="bank">Bank</option><option value="upi">UPI</option><option value="qr">QR</option></select></div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div><label className="mb-1.5 block text-[10px] font-black text-slate-600">Bank Reference</label><input value={bankRef} onChange={(e) => setBankRef(e.target.value)} className={inputCls} placeholder="RRN / bank ref" /></div>
                    <div><label className="mb-1.5 block text-[10px] font-black text-slate-600">Portal Reference</label><input value={portalRef} onChange={(e) => setPortalRef(e.target.value)} className={inputCls} placeholder="Portal txn ref" /></div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3"><div className="flex items-center justify-between"><span className="text-[9px] font-black uppercase tracking-wide text-rose-700">Customer Fee</span><span className="text-[8px] font-bold text-rose-500">Auto / Editable</span></div><div className="mt-2 flex items-center gap-1.5"><span className="text-sm font-black text-slate-500">₹</span><input value={fee} onChange={(e) => setFee(e.target.value.replace(/[^0-9.]/g, ""))} className="h-8 w-full rounded-lg border border-rose-200 bg-white px-2 text-[10px] font-black text-slate-900 outline-none" placeholder="0.00" /></div></div>
                    <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3"><div className="flex items-center justify-between"><span className="text-[9px] font-black uppercase tracking-wide text-violet-700">Portal Commission</span><span className="text-[8px] font-bold text-violet-500">Auto / Editable</span></div><div className="mt-2 flex items-center gap-1.5"><span className="text-sm font-black text-slate-500">₹</span><input value={commission} onChange={(e) => setCommission(e.target.value.replace(/[^0-9.]/g, ""))} className="h-8 w-full rounded-lg border border-violet-200 bg-white px-2 text-[10px] font-black text-slate-900 outline-none" placeholder="0.00" /></div></div>
                  </div>

                  <div><label className="mb-1.5 block text-[10px] font-black text-slate-600">Fee Handling</label><select value={feeSource} onChange={(e) => setFeeSource(e.target.value as typeof feeSource)} className={selectCls}><option value="cut_from_withdrawal">Cut from withdrawal</option><option value="separate_cash">Collect separately</option><option value="upi">UPI fee</option></select></div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[9px] text-amber-800">
                    <div className="flex items-center gap-1.5 font-black"><ShieldCheck className="h-3.5 w-3.5" /> Review-before-record control</div>
                    <p className="mt-1 leading-4">Final recording stays under operator review. AI or analyzers never submit provider-side transactions.</p>
                  </div>

                  <div className="flex gap-2">
                    <button type="button" onClick={() => setReviewOpen(true)} disabled={!isFormValid || busy} className={"flex-1 " + primaryBtn}>Review AEPS Transaction <ArrowRight className="ml-1 inline h-3.5 w-3.5" /></button>
                    <button type="button" onClick={handleNewCashOut} className={smallBtn}>Reset</button>
                  </div>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setDrawerOpen(true)} className="flex w-full items-center justify-between rounded-2xl border border-dashed border-blue-300 bg-blue-50 px-4 py-4 text-left">
                <div><div className="text-[11px] font-black text-blue-800">Open Counter Terminal</div><div className="mt-1 text-[9px] text-blue-600">Manual Entry / AI Auto-Fill</div></div><ArrowRight className="h-4 w-4 text-blue-600" />
              </button>
            )}
          </aside>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-violet-200 bg-violet-50/60 p-5">
            <div className="flex items-center gap-2 text-[11px] font-black text-violet-900"><Sparkles className="h-4 w-4 text-violet-600" /> AI Insights</div>
            <p className="mt-2 text-xs leading-5 text-slate-700">{stats.total} real AEPS records loaded · {inr(stats.commission)} portal commission in the active view · {stats.pending} requiring review.</p>
          </section>
          <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
            <div className="flex items-center gap-2 text-[11px] font-black text-amber-900"><ShieldCheck className="h-4 w-4 text-amber-600" /> Important Notes</div>
            <p className="mt-2 text-xs leading-5 text-slate-700">Only Aadhaar last 4 is stored for AEPS matching. Customer name is sourced from CafeERP, never assumed from the portal.</p>
          </section>
        </div>

        {reviewOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4">
            <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4"><div><h3 className="text-lg font-black text-slate-950">Review AEPS Transaction</h3><p className="mt-1 text-[10px] text-slate-400">Verify customer, transaction data, references, and pricing.</p></div><button type="button" onClick={() => setReviewOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
              <div className="grid gap-3 p-5 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4"><div className="text-[9px] font-black uppercase tracking-wide text-slate-400">Customer</div><div className="mt-1 text-sm font-black text-slate-950">{name || selectedCustomer?.name || "Not selected"}</div><div className="mt-1 text-[10px] text-slate-500">{maskMobile(cleanMobile)} · Aadhaar •••• {cleanAadhaar}</div></div>
                <div className="rounded-2xl bg-slate-50 p-4"><div className="text-[9px] font-black uppercase tracking-wide text-slate-400">Source</div><div className="mt-1 text-sm font-black text-slate-950">{portalName}</div><div className="mt-1 text-[10px] text-slate-500">{bankName} · {typeLabel(transactionType)}</div></div>
                <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4"><div className="text-[9px] font-black uppercase tracking-wide text-blue-700">Transaction</div><div className="mt-1 text-xl font-black text-slate-950">{inr(Number(amount || 0))}</div><div className="mt-1 text-[10px] text-slate-500">Bank Ref: {bankRef || "—"} · Portal Ref: {portalRef || "—"}</div></div>
                <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4"><div className="text-[9px] font-black uppercase tracking-wide text-violet-700">Fee & Commission</div><div className="mt-2 grid grid-cols-2 gap-2"><div><div className="text-[8px] font-bold text-slate-400">Customer Fee</div><div className="text-sm font-black text-slate-950">{inr(Number(fee || 0))}</div></div><div><div className="text-[8px] font-bold text-slate-400">Portal Commission</div><div className="text-sm font-black text-slate-950">{inr(Number(commission || 0))}</div></div></div></div>
                <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[9px] text-amber-800"><strong>Review required:</strong> verify every detected or entered value before recording.</div>
              </div>
              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">
                <button type="button" onClick={() => setReviewOpen(false)} className={smallBtn}>Edit</button>
                <button type="button" onClick={() => setReviewOpen(false)} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-[10px] font-black text-rose-700">Reject</button>
                <button type="button" onClick={() => void recordTransaction()} disabled={!isFormValid || busy} className={primaryBtn}>{busy ? "Processing…" : "Approve & Record"} <Check className="ml-1 inline h-3.5 w-3.5" /></button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
