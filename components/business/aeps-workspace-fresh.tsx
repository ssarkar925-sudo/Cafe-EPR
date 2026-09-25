"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Banknote,
  BarChart3,
  Camera,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Clock3,
  Download,
  FileImage,
  Filter,
  Landmark,
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
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { downloadCsv } from "@/components/ui/csv";
import CustomerSearchSelect, { type CustomerSearchResult } from "@/components/customers/customer-search-select";
import { extractAeps, type ScanFields } from "@/lib/scan/extract";
import { fileToDataUrl, ocrImage } from "@/lib/scan/ocr";
import type { Master, Txn } from "./business-client";

const DENOMINATIONS = [500, 1000, 2000, 3000, 5000, 10000];

const TOP_BANKS = [
  ["SBI", ["sbi", "state bank of india"]],
  ["PNB", ["pnb", "punjab national bank"]],
  ["BoB", ["bob", "bank of baroda"]],
  ["UBI", ["ubi", "union bank"]],
  ["Canara", ["canara"]],
  ["HDFC", ["hdfc"]],
  ["ICICI", ["icici"]],
  ["Axis", ["axis"]],
  ["Kotak", ["kotak"]],
  ["Indian", ["indian bank"]],
] as const;

const inputClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const smallButtonClass =
  "inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-slate-700 transition hover:bg-slate-50";
const primaryButtonClass =
  "inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-[10px] font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function normalizeBankName(raw: string) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BANK_ALIASES: Record<string, string[]> = {
  sbi: ["state bank of india", "sbi"],
  pnb: ["punjab national bank", "pnb"],
  bob: ["bank of baroda", "bank of baroda", "bob"],
  ubi: ["union bank of india", "union bank", "ubi"],
  canara: ["canara bank", "canara"],
  hdfc: ["hdfc bank", "hdfc"],
  icici: ["icici bank", "icici"],
  axis: ["axis bank", "axis"],
  kotak: ["kotak mahindra bank", "kotak"],
  indian: ["indian bank", "indian"],
};

function matchBank(input: string, banks: Master[]) {
  const normalized = normalizeBankName(input);
  if (!normalized) return null;

  const inputAliases = Object.values(BANK_ALIASES).find((aliases) =>
    aliases.includes(normalized)
  ) || [normalized];

  for (const bank of banks) {
    if ((bank as Master & { is_active?: boolean }).is_active === false) continue;

    const bankName = normalizeBankName(bank.name);
    const bankCode = normalizeBankName(bank.code || "");

    if (inputAliases.some((alias) => bankName === alias || bankName.includes(alias) || alias.includes(bankName))) {
      return bank;
    }

    if (bankCode && (bankCode === normalized || bankCode === String(input).trim().toLowerCase())) {
      return bank;
    }
  }

  return null;
}

function canonicalType(value?: string | null) {
  const normalized = String(value || "cash_out").toLowerCase();
  if (normalized === "withdrawal" || normalized === "cashout") return "cash_out";
  if (normalized === "enquiry" || normalized === "balance") return "balance_enquiry";
  if (normalized === "statement") return "mini_statement";
  return normalized;
}

function typeLabel(value?: string | null) {
  const type = canonicalType(value);
  if (type === "balance_enquiry") return "Balance Enquiry";
  if (type === "mini_statement") return "Mini Statement";
  return "Cash Out";
}

function maskMobile(value?: string | null) {
  const mobile = String(value || "").replace(/\D/g, "");
  return mobile.length === 10 ? mobile.slice(0, 2) + "••••••" + mobile.slice(-2) : mobile;
}

function cleanPhone(value?: string | null) {
  return String(value || "").replace(/\D/g, "").slice(0, 10);
}

function formatDateTime(value?: string | null) {
  if (!value) return { date: "—", time: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: value, time: "" };

  return {
    date: date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
    time: date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
  };
}

function statusTone(status?: string | null) {
  const value = String(status || "").toLowerCase();
  if (value === "success" || value === "recorded") return "success";
  if (value === "pending" || value === "review" || value === "processing") return "pending";
  if (value === "failed" || value === "cancelled") return "danger";
  if (value === "reversed") return "violet";
  return "neutral";
}

function StatusPill({ status }: { status?: string | null }) {
  const tone = statusTone(status);
  const styles = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    pending: "border-amber-200 bg-amber-50 text-amber-700",
    danger: "border-rose-200 bg-rose-50 text-rose-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
    neutral: "border-slate-200 bg-slate-50 text-slate-600",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wide",
        styles[tone]
      )}
    >
      {String(status || "unknown")}
    </span>
  );
}

function KpiCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "blue" | "green" | "rose" | "violet" | "amber";
}) {
  const colors = {
    blue: "border-blue-100 bg-blue-50/60 text-blue-600",
    green: "border-emerald-100 bg-emerald-50/60 text-emerald-600",
    rose: "border-rose-100 bg-rose-50/60 text-rose-600",
    violet: "border-violet-100 bg-violet-50/60 text-violet-600",
    amber: "border-amber-100 bg-amber-50/60 text-amber-600",
  };

  return (
    <div className={cx("rounded-2xl border p-4 shadow-sm", colors[tone])}>
      <div className="flex items-start justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm">{icon}</div>
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
  const colors = {
    success: "bg-emerald-50 text-emerald-700",
    pending: "bg-amber-50 text-amber-700",
    danger: "bg-rose-50 text-rose-700",
    neutral: "bg-slate-100 text-slate-700",
  };

  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={cx("flex h-9 w-9 items-center justify-center rounded-xl", colors[tone])}>{icon}</span>
        <div>
          <p className="text-[10px] font-bold text-slate-400">{label}</p>
          <p className="text-base font-black text-slate-950">{count}</p>
        </div>
      </div>
      <span
        className={cx(
          "h-2.5 w-2.5 rounded-full",
          tone === "success" && "bg-emerald-500",
          tone === "pending" && "bg-amber-500",
          tone === "danger" && "bg-rose-500",
          tone === "neutral" && "bg-slate-400"
        )}
      />
    </div>
  );
}

export default function AepsWorkspaceFresh({
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
  const [bankMasters, setBankMasters] = useState<Master[]>(initialBanks);
  const [portalMasters, setPortalMasters] = useState<Master[]>(initialPortals);
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [drawerOpen, setDrawerOpen] = useState(true);
  const [entryMode, setEntryMode] = useState<"manual" | "ai">("manual");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [analyzerOpen, setAnalyzerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [pricingOpen, setPricingOpen] = useState(false);
  const [pricingBusy, setPricingBusy] = useState(false);
  const [pricingMessage, setPricingMessage] = useState("");
  const [pricingPortalId, setPricingPortalId] = useState("");
  const [pricingMinAmount, setPricingMinAmount] = useState("0");
  const [pricingMaxAmount, setPricingMaxAmount] = useState("");
  const [pricingFee, setPricingFee] = useState("");
  const [pricingCommission, setPricingCommission] = useState("");

  const [watcherOpen, setWatcherOpen] = useState(false);
  const [watcherBusy, setWatcherBusy] = useState(false);
  const [watcherMessage, setWatcherMessage] = useState("");
  const [watcherPortalId, setWatcherPortalId] = useState("");
  const [watcherEnabled, setWatcherEnabled] = useState(true);
  const [watcherInterval, setWatcherInterval] = useState("30");
  const [watcherSourceUrl, setWatcherSourceUrl] = useState("");
  const [watcherConfigs, setWatcherConfigs] = useState<Record<string, { enabled: boolean; poll_interval_seconds: number; source_url: string | null }>>({});
  const [watcherRuntimeStatus, setWatcherRuntimeStatus] = useState<"idle" | "starting" | "running" | "auth_required" | "error">("idle");
  const [watcherLastCheck, setWatcherLastCheck] = useState("");
  const [watcherDetectedCount, setWatcherDetectedCount] = useState(0);
  const [watcherImportId, setWatcherImportId] = useState("");

  const [customerId, setCustomerId] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [aadhaar, setAadhaar] = useState("");
  const [transactionType, setTransactionType] = useState("cash_out");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("");
  const [commission, setCommission] = useState("");
  const [bankId, setBankId] = useState("");
  const [portalId, setPortalId] = useState(portalMasters[0]?.id || "");
  const [bankRef, setBankRef] = useState("");
  const [feeSource, setFeeSource] = useState<"cut_from_withdrawal" | "separate_cash" | "upi">("cut_from_withdrawal");
  const [customerPayMethod, setCustomerPayMethod] = useState("cash");

  const [analyzerTab, setAnalyzerTab] = useState<"paste" | "photo">("paste");
  const [sourceText, setSourceText] = useState("");
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ScanFields>({});
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [matchNotice, setMatchNotice] = useState("");

  useEffect(() => {
    let active = true;
    async function hydrateAepsMasters() {
      const [{ data: banks }, { data: portals }] = await Promise.all([
        supabase
          .from("aeps_banks")
          .select("id,name,code,is_active")
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("aeps_portals")
          .select("id,name,code,is_active,payment_instrument_id,service_type")
          .eq("is_active", true)
          .eq("service_type", "aeps")
          .order("name"),
      ]);
      if (!active) return;
      if (banks?.length) setBankMasters(banks as Master[]);
      if (portals?.length) {
        setPortalMasters(portals as Master[]);
        if (!portalId) setPortalId(portals[0].id);
      }
    }
    void hydrateAepsMasters();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadWatcherConfigs() {
      const { data } = await supabase.from("aeps_watcher_configs").select("portal_id,enabled,poll_interval_seconds,source_url").eq("service_type", "aeps");
      if (!active || !data) return;
      setWatcherConfigs(Object.fromEntries(data.map((row) => [row.portal_id, { enabled: Boolean(row.enabled), poll_interval_seconds: Number(row.poll_interval_seconds || 30), source_url: row.source_url || null }])));
    }
    void loadWatcherConfigs();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const electron = (window as Window & {
      electronAPI?: {
        onAepsWatcherEvent?: (callback: (payload: any) => void) => void;
      };
    }).electronAPI;

    if (!electron?.onAepsWatcherEvent) return;

    const handleWatcherEvent = (payload: any) => {
      if (!payload || payload.portalId !== watcherPortalId) return;

      if (payload.type === "started" || payload.type === "ready") {
        setWatcherRuntimeStatus("running");
        setWatcherMessage(payload.type === "started" ? "Watcher started. Complete portal login manually in the Watcher window if required." : "Portal page is ready.");
        return;
      }

      if (payload.type === "auth_required") {
        setWatcherRuntimeStatus("auth_required");
        setWatcherMessage(payload.message || "Portal authentication is required.");
        return;
      }

      if (payload.type === "heartbeat" || payload.type === "success") {
        setWatcherLastCheck(payload.checkedAt || new Date().toISOString());
        if (payload.type === "success") setWatcherRuntimeStatus("running");
        return;
      }

      if (payload.type === "error") {
        setWatcherRuntimeStatus("error");
        setWatcherMessage(payload.message || "Watcher error.");
        return;
      }

      if (payload.type === "stopped") {
        setWatcherRuntimeStatus("idle");
        setWatcherMessage("Watcher stopped.");
        return;
      }

      if (payload.type === "transaction") {
        void handleWatcherTransaction(payload);
      }
    };

    electron.onAepsWatcherEvent(handleWatcherEvent);
  }, [watcherPortalId]);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [importNotice, setImportNotice] = useState("");

  const cleanAadhaar = aadhaar.replace(/\D/g, "");
  const cleanMobile = mobile.replace(/\D/g, "");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);

    return rows.filter((transaction) => {
      const haystack = [
        transaction.transaction_number,
        transaction.customer_mobile,
        transaction.customers?.name,
        transaction.banks?.name,
        transaction.portals?.name,
        transaction.reference,
        transaction.remarks,
        transaction.aadhaar_last4,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const rawDate = String(transaction.transaction_date || "").slice(0, 10);

      if (dateFilter !== "all" && transaction.transaction_date) {
        if (dateFilter === "today" && rawDate !== todayKey) return false;

        if (dateFilter === "yesterday") {
          const d = new Date(now);
          d.setDate(d.getDate() - 1);
          if (rawDate !== d.toISOString().slice(0, 10)) return false;
        }

        if (dateFilter === "last7") {
          const d = new Date(now);
          d.setDate(d.getDate() - 6);
          if (rawDate < d.toISOString().slice(0, 10) || rawDate > todayKey) return false;
        }

        if (dateFilter === "last30") {
          const d = new Date(now);
          d.setDate(d.getDate() - 29);
          if (rawDate < d.toISOString().slice(0, 10) || rawDate > todayKey) return false;
        }

        if (dateFilter === "this_month" && rawDate.slice(0, 7) !== todayKey.slice(0, 7)) return false;
      }

      if (typeFilter !== "all" && canonicalType(transaction.transfer_method) !== typeFilter) return false;
      if (statusFilter !== "all" && String(transaction.status || "").toLowerCase() !== statusFilter) return false;
      if (q && !haystack.includes(q)) return false;

      return true;
    });
  }, [rows, query, dateFilter, typeFilter, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: filtered.length,
      amount: filtered.reduce((sum, t) => sum + Number(t.amount || 0), 0),
      fees: filtered.reduce((sum, t) => sum + Number(t.service_fee || 0), 0),
      commission: filtered.reduce((sum, t) => sum + Number(t.portal_commission || 0), 0),
      success: filtered.filter((t) => String(t.status) === "success" || String(t.status) === "recorded").length,
      pending: filtered.filter((t) => ["pending", "review", "processing"].includes(String(t.status))).length,
      cancelled: filtered.filter((t) => String(t.status) === "cancelled" || String(t.status) === "failed").length,
      reversed: filtered.filter((t) => String(t.status) === "reversed").length,
    };
  }, [filtered]);

  const trend = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 7 }, (_, index) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (6 - index));
      const key = d.toISOString().slice(0, 10);
      return {
        key,
        label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
        count: rows.filter((t) => String(t.transaction_date || "").slice(0, 10) === key).length,
      };
    });
  }, [rows]);

  const maxTrend = Math.max(1, ...trend.map((point) => point.count));

  const typeDistribution = useMemo(() => {
    const total = rows.length || 1;
    const cash = rows.filter((t) => canonicalType(t.transfer_method) === "cash_out").length;
    const balance = rows.filter((t) => canonicalType(t.transfer_method) === "balance_enquiry").length;
    const statement = rows.filter((t) => canonicalType(t.transfer_method) === "mini_statement").length;
    return {
      cash,
      balance,
      statement,
      cashPct: Math.round((cash / total) * 100),
      balancePct: Math.round((balance / total) * 100),
      statementPct: Math.round((statement / total) * 100),
    };
  }, [rows]);

  const portalName = portalMasters.find((portal) => portal.id === portalId)?.name || "Not selected";
  const bankName = bankMasters.find((bank) => bank.id === bankId)?.name || "Not selected";
  const aepsFloat = Number(float?.current ?? float?.balance ?? 0);

  const formValid = Boolean(
    customerId &&
      bankId &&
      portalId &&
      cleanAadhaar.length === 4 &&
      cleanMobile.length === 10 &&
      Number(amount) > 0 &&
      Number(fee || 0) >= 0 &&
      Number(commission || 0) >= 0
  );

  function resetForm() {
    setCustomerId("");
    setSelectedCustomer(null);
    setName("");
    setMobile("");
    setAadhaar("");
    setTransactionType("cash_out");
    setAmount("");
    setFee("");
    setCommission("");
    setBankId("");
    setPortalId(portalMasters[0]?.id || "");
    setBankRef("");
    setFeeSource("cut_from_withdrawal");
    setCustomerPayMethod("cash");
    setSourceText("");
    setSourceImage(null);
    setAnalysis({});
    setAnalysisError("");
    setMatchNotice("");
    setEntryMode("manual");
    setWatcherImportId("");
    setReviewOpen(false);
  }

  function selectBankByCode(code: string) {
    const bank = TOP_BANKS.find((entry) => entry[0] === code);
    if (!bank) return;

    const hit = bankMasters.find((candidate) => {
      const normalized = normalizeBankName(candidate.name);
      return bank[1].some((match) => normalized.includes(match));
    });

    if (hit) setBankId(hit.id);
  }

  async function resolveCustomerFromSignals(mobileValue: string, aadhaarValue: string): Promise<string | null> {
    setMatchNotice("");

    let mobileMatch: CustomerSearchResult | null = null;

    if (mobileValue.length === 10) {
      try {
        const response = await fetch(
          "/api/customers/search?q=" + encodeURIComponent(mobileValue) + "&limit=10"
        );
        const payload = await response.json();
        const results = Array.isArray(payload?.results) ? payload.results : [];
        mobileMatch =
          results.find(
            (customer: CustomerSearchResult) => cleanPhone(customer.phone) === mobileValue
          ) || null;
      } catch {
        mobileMatch = null;
      }
    }

    let aadhaarCustomerIds: string[] = [];

    if (aadhaarValue.length === 4) {
      try {
        const result = await supabase
          .from("transactions")
          .select("customer_id")
          .eq("service_type", "aeps")
          .eq("aadhaar_last4", aadhaarValue)
          .not("customer_id", "is", null)
          .limit(50);

        aadhaarCustomerIds = Array.from(
          new Set((result.data || []).map((row: any) => row.customer_id).filter(Boolean))
        );
      } catch {
        aadhaarCustomerIds = [];
      }
    }

    if (mobileMatch && aadhaarCustomerIds.includes(mobileMatch.id)) {
      setCustomerId(mobileMatch.id);
      setSelectedCustomer(mobileMatch);
      setName(mobileMatch.name || "");
      setMobile(cleanPhone(mobileMatch.phone));
      setMatchNotice("Verified match: mobile + Aadhaar last 4.");
      return mobileMatch.id;
    }

    if (!mobileMatch && aadhaarCustomerIds.length === 1) {
      try {
        const result = await supabase
          .from("customers")
          .select("id, name, phone, code, is_active")
          .eq("id", aadhaarCustomerIds[0])
          .maybeSingle();

        if (result.data) {
          const record: CustomerSearchResult = {
            id: result.data.id,
            code: result.data.code || null,
            name: result.data.name || null,
            phone: result.data.phone || null,
            is_active: result.data.is_active !== false,
          };
          setCustomerId(record.id);
          setSelectedCustomer(record);
          setName(record.name || "");
          setMobile(cleanPhone(record.phone));
          setMatchNotice("Matched by Aadhaar last 4.");
          return record.id;
        }
      } catch {
        // Fall through to manual customer selection.
      }
    }

    if (aadhaarCustomerIds.length > 1) {
      setCustomerId("");
      setSelectedCustomer(null);
      setName("");
      setMatchNotice(
        aadhaarCustomerIds.length +
          " customers share this Aadhaar last 4. Select the correct customer manually."
      );
      return;
    }

    if (mobileMatch) {
      setCustomerId("");
      setSelectedCustomer(null);
      setName("");
      setMatchNotice("Mobile match found, but Aadhaar must also be verified before approval.");
      return;
    }

    if (mobileValue.length === 10 || aadhaarValue.length === 4) {
      setCustomerId("");
      setSelectedCustomer(null);
      setName("");
      setMatchNotice("No single verified customer match. Manual customer selection is required.");
    }
    return null;
  }

  async function applyAnalysis(fields: ScanFields, rawText: string) {
    setAnalysis(fields);

    if (fields.aadhaar_last4) setAadhaar(fields.aadhaar_last4);
    if (fields.customer_mobile) setMobile(cleanPhone(fields.customer_mobile));
    if (fields.amount) setAmount(fields.amount);
    if (fields.service_fee) setFee(fields.service_fee);
    if (fields.portal_commission) setCommission(fields.portal_commission);
    if (fields.reference) setBankRef(fields.reference);

    if (fields.bank_name) {
      const bank = matchBank(fields.bank_name, bankMasters);
      if (bank) setBankId(bank.id);
    }

    if (fields.portal_name) {
      const portal = portalMasters.find(
        (candidate) =>
          String(candidate.name || "").toLowerCase().includes(String(fields.portal_name).toLowerCase())
      );
      if (portal) setPortalId(portal.id);
    }

    if (/mini\s*statement|mini statement/i.test(rawText)) {
      setTransactionType("mini_statement");
    } else if (/balance\s*(enquiry|inquiry)|available balance/i.test(rawText)) {
      setTransactionType("balance_enquiry");
    } else {
      setTransactionType("cash_out");
    }

    if (fields.customer_mobile || fields.aadhaar_last4) {
      await resolveCustomerFromSignals(
        cleanPhone(fields.customer_mobile || ""),
        fields.aadhaar_last4 || ""
      );
    }
  }

  async function analyzeText() {
    if (!sourceText.trim()) return;

    setAnalysisBusy(true);
    setAnalysisError("");

    try {
      const fields = extractAeps(sourceText);
      setAnalysis(fields);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Text analysis failed.");
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
      setAnalysis(fields);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Photo analysis failed.");
    } finally {
      setAnalysisBusy(false);
    }
  }

  function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (file) void analyzePhoto(file);
  }

  async function recordTransaction() {
    if (busy || !formValid) return;

    setBusy(true);
    setSaveError("");

    try {
      const result = await supabase.rpc("create_business_txn", {
        p_service_type: "aeps",
        p_transaction_date: new Date().toISOString().slice(0, 10),
        p_transaction_timestamp: new Date().toISOString(),
        p_customer_id: customerId,
        p_customer_mobile: cleanMobile,
        p_reference: bankRef.trim() || null,
        p_remarks: null,
        p_status: "success",
        p_bank_id: bankId,
        p_portal_id: portalId,
        p_merchant_qr_id: null,
        p_aadhaar_last4: cleanAadhaar,
        p_transfer_method: transactionType === "cash_out" ? "bank_account" : "upi",
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
        p_pay_from_instrument_id: null,
        p_pay_from_method: "aeps_portal",
        p_receiver_name: null,
        p_portal_charge: 0,
        p_idempotency_key: crypto.randomUUID(),
      });

      if (result.error) {
        setSaveError(
          result.error.hint ||
          result.error.details ||
          result.error.message ||
          "Transaction could not be saved."
        );
        return;
      }

      setRows((previous) => [result.data as Txn, ...previous]);
      if (watcherImportId) {
        await supabase
          .from("ai_transaction_imports")
          .update({ state: "imported", review_note: "Approved and recorded in the AEPS ledger.", updated_at: new Date().toISOString() })
          .eq("id", watcherImportId);
      }
      setReviewOpen(false);
      resetForm();
    } catch (error) {
      console.error("AEPS record failed:", error);
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? String((error as { message?: unknown }).message || "Transaction could not be saved.")
            : "Transaction could not be saved.";
      setSaveError(message);
    } finally {
      setBusy(false);
    }
  }

  async function loadAepsPricing() {
    if (!portalId || !amount || Number(amount) <= 0) return;
    const { data, error } = await supabase.rpc("resolve_aeps_pricing", {
      p_customer_id: customerId || null,
      p_portal_id: portalId,
      p_amount: Number(amount),
    });
    if (error) {
      setSaveError(error.message);
      return;
    }
    const resolved = (data || {}) as { fee?: number; commission?: number };
    setFee(String(resolved.fee ?? 0));
    setCommission(String(resolved.commission ?? 0));
    setPricingMessage("Applied saved AEPS pricing rule.");
  }

  function openWatcherSetup(portalId?: string) {
    const id = portalId || watcherPortalId || portalMasters[0]?.id || "";
    const config = watcherConfigs[id];
    setWatcherPortalId(id);
    setWatcherEnabled(config?.enabled ?? true);
    setWatcherInterval(String(config?.poll_interval_seconds ?? 30));
    setWatcherSourceUrl(config?.source_url ?? "");
    setWatcherMessage("");
    setWatcherOpen(true);
  }

  async function saveWatcherConfig(): Promise<boolean> {
    if (!watcherPortalId) {
      setWatcherMessage("Select a registered AEPS portal.");
      return false;
    }
    const interval = Number(watcherInterval);
    if (!Number.isFinite(interval) || interval < 15 || interval > 3600) {
      setWatcherMessage("Watcher interval must be between 15 and 3600 seconds.");
      return false;
    }
    setWatcherBusy(true);
    setWatcherMessage("");
    try {
      const { error } = await supabase.rpc("save_aeps_watcher_config", {
        p_portal_id: watcherPortalId,
        p_enabled: watcherEnabled,
        p_poll_interval_seconds: interval,
        p_source_url: watcherSourceUrl.trim() || null,
      });
      if (error) {
        setWatcherMessage(error.hint || error.details || error.message || "Could not save watcher setup.");
        return false;
      }
      setWatcherConfigs((previous) => ({
        ...previous,
        [watcherPortalId]: {
          enabled: watcherEnabled,
          poll_interval_seconds: interval,
          source_url: watcherSourceUrl.trim() || null,
        },
      }));
      setWatcherMessage("Watcher setup saved.");
      return true;
    } catch (error) {
      setWatcherMessage(error instanceof Error ? error.message : "Could not save watcher setup.");
      return false;
    } finally {
      setWatcherBusy(false);
    }
  }

  async function startAepsWatcher() {
    if (!watcherEnabled) {
      setWatcherMessage("Enable the watcher before starting it.");
      return;
    }
    if (!watcherPortalId || !watcherSourceUrl.trim()) {
      setWatcherMessage("Save a registered portal and source URL before starting the watcher.");
      return;
    }

    const electron = (window as Window & {
      electronAPI?: {
        startAepsWatcher?: (options: {
          portalId: string;
          portalName: string;
          sourceUrl: string;
          intervalSeconds: number;
        }) => Promise<{ success: boolean; error?: string }>;
      };
    }).electronAPI;

    if (!electron?.startAepsWatcher) {
      setWatcherMessage("Live AEPS Watcher requires the CafeERP desktop application.");
      return;
    }

    setWatcherRuntimeStatus("starting");
    setWatcherMessage("Opening the portal watcher window...");
    const result = await electron.startAepsWatcher({
      portalId: watcherPortalId,
      portalName: portalMasters.find((portal) => portal.id === watcherPortalId)?.name || "AEPS Portal",
      sourceUrl: watcherSourceUrl.trim(),
      intervalSeconds: Number(watcherInterval),
    });

    if (!result.success) {
      setWatcherRuntimeStatus("error");
      setWatcherMessage(result.error || "Could not start the watcher.");
    }
  }

  async function stopAepsWatcher() {
    const electron = (window as Window & {
      electronAPI?: {
        stopAepsWatcher?: () => Promise<{ success: boolean; error?: string }>;
      };
    }).electronAPI;

    if (!electron?.stopAepsWatcher) {
      setWatcherRuntimeStatus("idle");
      return;
    }

    const result = await electron.stopAepsWatcher();
    setWatcherRuntimeStatus("idle");
    setWatcherMessage(result.success ? "Watcher stopped." : (result.error || "Could not stop watcher."));
  }

  async function handleWatcherTransaction(payload: any) {
    const transaction = payload?.transaction;
    if (!transaction || !payload?.portalId) return;

    const portal = portalMasters.find((candidate) => candidate.id === payload.portalId);
    const rawText = [
      payload.portalName || portal?.name || "",
      transaction.rawText || "",
      transaction.externalTransactionId ? "RRN: " + transaction.externalTransactionId : "",
      transaction.amount ? "Amount: ₹" + transaction.amount : "",
      transaction.customerMobile ? "Mobile: " + transaction.customerMobile : "",
      transaction.aadhaarLast4 ? "Aadhaar: XXXX" + transaction.aadhaarLast4 : "",
      transaction.bankName ? "Bank Name: " + transaction.bankName : "",
      transaction.commission ? "Portal Commission: ₹" + transaction.commission : "",
    ].filter(Boolean).join("\n");

    const fields = extractAeps(rawText);
    fields.amount = String(transaction.amount || fields.amount || "");
    fields.reference = String(transaction.externalTransactionId || fields.reference || "");
    fields.customer_mobile = cleanPhone(String(transaction.customerMobile || fields.customer_mobile || ""));
    fields.aadhaar_last4 = String(transaction.aadhaarLast4 || fields.aadhaar_last4 || "");
    fields.bank_name = String(transaction.bankName || fields.bank_name || "");
    fields.portal_name = String(payload.portalName || portal?.name || fields.portal_name || "");
    fields.portal_commission = String(transaction.commission ?? fields.portal_commission ?? "0");

    const fingerprint = String(payload.fingerprint || [
      payload.portalId,
      fields.reference,
      fields.amount,
      "cash_out",
    ].join("|")).slice(0, 500);
    const parsedOccurredAt = transaction.occurredAt ? new Date(transaction.occurredAt) : new Date();
    const occurredAt = Number.isNaN(parsedOccurredAt.getTime())
      ? new Date().toISOString()
      : parsedOccurredAt.toISOString();

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setWatcherMessage("Watcher detected a transaction, but the CafeERP session is not authenticated.");
      return;
    }

    const { data: imported, error: importError } = await supabase
      .from("ai_transaction_imports")
      .upsert({
        created_by: userId,
        provider_name: payload.portalName || portal?.name || "AEPS Portal",
        source_type: "aeps",
        external_transaction_id: fields.reference,
        external_reference: fields.reference,
        status: "success",
        transaction_type: "cash_out",
        amount: Number(fields.amount),
        fee: fields.service_fee ? Number(fields.service_fee) : null,
        commission: Number(fields.portal_commission || 0),
        occurred_at: occurredAt,
        customer_name: transaction.customerName || null,
        customer_mobile: fields.customer_mobile || null,
        raw_data: {
          portal_id: payload.portalId,
          portal_name: payload.portalName,
          fingerprint,
          extracted: transaction,
          source_text: rawText,
        },
        fingerprint,
        state: "needs_review",
        review_note: "Detected by the read-only AEPS Watcher. Operator approval is required.",
        updated_at: new Date().toISOString(),
      }, { onConflict: "created_by,fingerprint", ignoreDuplicates: true })
      .select("id,state")
      .maybeSingle();

    if (importError) {
      setWatcherMessage(importError.message || "Watcher detected a transaction but staging failed.");
      setWatcherRuntimeStatus("error");
      return;
    }

    const stagedImportId = String(imported?.id || "");
    if (!imported?.id) {
      setWatcherMessage("Duplicate AEPS transaction detected and safely ignored.");
      return;
    }

    setWatcherImportId(stagedImportId);
    setWatcherDetectedCount((count) => count + 1);
    setSourceText(rawText);
    setAnalysis(fields);
    setEntryMode("ai");
    setPortalId(payload.portalId);
    setTransactionType("cash_out");
    setAmount(fields.amount);
    setAadhaar(fields.aadhaar_last4);
    setMobile(fields.customer_mobile);
    setBankRef(fields.reference);
    setCommission(fields.portal_commission || "0");

    const matchedBank = fields.bank_name ? matchBank(fields.bank_name, bankMasters) : null;
    if (matchedBank) setBankId(matchedBank.id);

    let matchedCustomerId: string | null = null;
    if (fields.customer_mobile || fields.aadhaar_last4) {
      matchedCustomerId = await resolveCustomerFromSignals(fields.customer_mobile || "", fields.aadhaar_last4 || "");
    }

    const { data: pricing } = await supabase.rpc("resolve_aeps_pricing", {
      p_customer_id: matchedCustomerId,
      p_portal_id: payload.portalId,
      p_amount: Number(fields.amount),
    });
    const resolvedPricing = (pricing || {}) as { fee?: number; commission?: number };
    if (resolvedPricing.fee !== undefined) setFee(String(resolvedPricing.fee));
    if (resolvedPricing.commission !== undefined) setCommission(String(resolvedPricing.commission));
    if (stagedImportId) {
      await supabase
        .from("ai_transaction_imports")
        .update({
          fee: resolvedPricing.fee ?? null,
          commission: resolvedPricing.commission ?? Number(fields.portal_commission || 0),
          updated_at: new Date().toISOString(),
        })
        .eq("id", stagedImportId);
    }

    setWatcherMessage(
      matchedCustomerId
        ? "New AEPS transaction detected and customer matched. Verify pricing, then Approve & Record."
        : "New AEPS transaction detected. Customer match requires manual review before recording."
    );
    setReviewOpen(true);
  }

  async function savePricingRule() {
    const min = Number(pricingMinAmount || 0);
    const max = pricingMaxAmount ? Number(pricingMaxAmount) : null;
    const feeValue = Number(pricingFee || 0);
    const commissionValue = Number(pricingCommission || 0);
    if (!Number.isFinite(min) || min < 0 || (max !== null && (!Number.isFinite(max) || max < min))) {
      setPricingMessage("Check the amount slab.");
      return;
    }
    if (!pricingPortalId || feeValue < 0 || commissionValue < 0) {
      setPricingMessage("Select a portal and enter valid fee/commission values.");
      return;
    }

    setPricingBusy(true);
    setPricingMessage("");
    try {
      const { error } = await supabase.rpc("save_aeps_pricing_rule", {
        p_portal_id: pricingPortalId,
        p_customer_id: null,
        p_min_amount: min,
        p_max_amount: max,
        p_fee: feeValue,
        p_commission: commissionValue,
      });
      if (error) {
        setPricingMessage(error.hint || error.details || error.message || "Could not save pricing rule.");
        return;
      }

      setPricingMessage("Pricing rule saved permanently.");
    } catch (error) {
      setPricingMessage(error instanceof Error ? error.message : "Could not save pricing rule.");
    } finally {
      setPricingBusy(false);
    }
  }

  function openAiInsights() {
    document.getElementById("aeps-ai-insights")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function stageImport(file: File) {
    setImportNotice("");
    try {
      const text = await file.text();
      if (!text.trim()) {
        setImportNotice("Import file is empty.");
        return;
      }
      const isCsv = /\.csv$/i.test(file.name) || text.includes(",");
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (!isCsv && !/^\s*\[|^\s*\{/m.test(text)) {
        setImportNotice("Import staged for preview. Use CSV or JSON transaction data.");
        return;
      }
      setImportNotice("Import staged successfully: " + lines.length + " source row(s). Nothing was recorded.");
    } catch {
      setImportNotice("Could not read the import file.");
    }
  }

  function handleImportChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (file) void stageImport(file);
  }

  function exportTransactions() {
    downloadCsv(
      "aeps-transactions.csv",
      [
        "Transaction",
        "Date",
        "Customer",
        "Mobile",
        "Type",
        "Aadhaar",
        "Amount",
        "Customer Fee",
        "Portal Commission",
        "Bank",
        "Portal",
        "Bank Reference",
        "Status",
      ],
      filtered.map((transaction) => [
        transaction.transaction_number || "",
        transaction.transaction_date || "",
        transaction.customers?.name || "",
        transaction.customer_mobile || transaction.customers?.phone || "",
        typeLabel(transaction.transfer_method),
        transaction.aadhaar_last4 || "",
        Number(transaction.amount || 0),
        Number(transaction.service_fee || 0),
        Number(transaction.portal_commission || 0),
        transaction.banks?.name || "",
        transaction.portals?.name || "",
        transaction.reference || "",
        String(transaction.remarks || ""),
        transaction.status || "",
      ])
    );
  }

  return (
    <div className="min-h-full bg-[#f5f8fd] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-[1700px] space-y-4 px-4 pb-10 pt-4 lg:px-6">

        <header className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
                <Banknote className="h-6 w-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-black tracking-tight text-slate-950">AEPS Operations</h1>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Live Watcher Ready
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Aadhaar Enabled Payment System · monitor, review and record with operator control.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={resetForm} className={primaryButtonClass}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Record Transaction
              </button>
              <button type="button" onClick={() => setEntryMode("ai")} className={smallButtonClass}>
                <Sparkles className="mr-1.5 h-3.5 w-3.5 text-violet-600" />
                AI Detected
              </button>
              <button type="button" onClick={exportTransactions} className={smallButtonClass}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Export
              </button>
            </div>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard icon={<Activity className="h-4 w-4" />} label="Total Transactions" value={String(stats.total)} tone="blue" />
          <KpiCard icon={<Banknote className="h-4 w-4" />} label="Total Amount" value={inr(stats.amount)} tone="green" />
          <KpiCard icon={<Percent className="h-4 w-4" />} label="Total Fees" value={inr(stats.fees)} tone="rose" />
          <KpiCard icon={<WalletCards className="h-4 w-4" />} label="Portal Commission" value={inr(stats.commission)} tone="violet" />
          <KpiCard icon={<Landmark className="h-4 w-4" />} label="AEPS Float" value={inr(aepsFloat)} tone="amber" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatusCard icon={<CheckCircle2 className="h-4 w-4" />} label="Recorded / Success" count={stats.success} tone="success" />
          <StatusCard icon={<Clock3 className="h-4 w-4" />} label="Pending / Review" count={stats.pending} tone="pending" />
          <StatusCard icon={<XCircle className="h-4 w-4" />} label="Cancelled" count={stats.cancelled} tone="danger" />
          <StatusCard icon={<RefreshCw className="h-4 w-4" />} label="Reversed" count={stats.reversed} tone="neutral" />
        </div>


        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-4">
            <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black text-slate-950">Transaction Trend</h2>
                  <p className="mt-0.5 text-[10px] text-slate-400">Actual AEPS activity · Last 7 days</p>
                </div>
                <BarChart3 className="h-4 w-4 text-blue-500" />
              </div>

              <div className="mt-6 grid grid-cols-7 items-end gap-2">
                {trend.map((point) => (
                  <div key={point.key} className="flex min-w-0 flex-col items-center gap-2">
                    <div className="flex h-32 w-full items-end justify-center rounded-xl bg-slate-50">
                      <div
                        className="w-5 rounded-t-lg bg-blue-500 transition-all"
                        style={{ height: Math.max(8, (point.count / maxTrend) * 100) + "%" }}
                        title={String(point.count) + " transactions"}
                      />
                    </div>
                    <span className="truncate text-[9px] font-bold text-slate-400">{point.label}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black text-slate-950">Transactions by Type</h2>
                  <p className="mt-0.5 text-[10px] text-slate-400">Actual distribution across AEPS operations</p>
                </div>
                <div className="flex h-20 w-20 items-center justify-center rounded-full border-[10px] border-blue-500">
                  <div className="text-center">
                    <div className="text-lg font-black text-slate-950">{rows.length}</div>
                    <div className="text-[8px] font-bold text-slate-400">Transactions</div>
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {[
                  ["Cash Out", typeDistribution.cash, typeDistribution.cashPct, "bg-blue-500"],
                  ["Balance Enquiry", typeDistribution.balance, typeDistribution.balancePct, "bg-emerald-500"],
                  ["Mini Statement", typeDistribution.statement, typeDistribution.statementPct, "bg-amber-500"],
                ].map((item) => (
                  <div key={String(item[0])}>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="flex items-center gap-2 font-bold text-slate-600">
                        <span className={cx("h-2 w-2 rounded-full", String(item[3]))} />
                        {String(item[0])}
                      </span>
                      <span className="font-black text-slate-900">
                        {String(item[1])} <span className="text-slate-400">({String(item[2])}%)</span>
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={cx("h-full rounded-full", String(item[3]))} style={{ width: String(item[2]) + "%" }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>


            <div className="grid gap-4 md:grid-cols-2">
          <section id="aeps-ai-insights" className="rounded-2xl border border-violet-200 bg-violet-50/60 p-5">
            <div className="flex items-center gap-2 text-[11px] font-black text-violet-900">
              <Sparkles className="h-4 w-4 text-violet-600" />
              AI Insights
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-700">
              {stats.pending} transaction(s) currently need review. AI assistance prepares drafts; final recording remains operator-controlled.
            </p>
          </section>

          <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
            <div className="flex items-center gap-2 text-[11px] font-black text-amber-900">
              <ShieldCheck className="h-4 w-4 text-amber-600" />
              Important Notes
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-700">
              Only Aadhaar last 4 is used for AEPS matching. Customer identity comes from CafeERP data, never from an assumed portal customer name.
            </p>
          </section>
        </div>


          </div>

          <aside className="space-y-4 xl:sticky xl:top-4">

            <section className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/30">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                    <Activity className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-black text-emerald-950 dark:text-emerald-100">AEPS Watcher</h2>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[8px] font-black text-emerald-700 shadow-sm dark:bg-emerald-950/70 dark:text-emerald-200">{watcherRuntimeStatus === "running" ? "RUNNING" : Object.values(watcherConfigs).some((config) => config.enabled) ? "CONFIGURED" : "SETUP"}</span>
                    </div>
                    <p className="mt-0.5 text-[9px] text-emerald-800/75 dark:text-emerald-200/75">Read-only monitor for registered portals</p>
                  </div>
                </div>
                <button type="button" onClick={() => openWatcherSetup()} disabled={!portalMasters.length} className="rounded-lg bg-white px-2.5 py-1.5 text-[9px] font-black text-emerald-700 shadow-sm disabled:opacity-40 dark:bg-slate-900 dark:text-emerald-300">Setup</button>
              </div>

              <div className="mt-3 space-y-2">
                {portalMasters.length ? portalMasters.slice(0, 4).map((portal) => {
                  const portalRows = rows.filter((row) => row.portal_id === portal.id);
                  const pendingRows = portalRows.filter((row) => ["pending", "review", "processing"].includes(String(row.status)));
                  return (
                    <div key={portal.id} className="flex items-center gap-2 rounded-xl border border-white/80 bg-white px-3 py-2 dark:border-emerald-900/40 dark:bg-slate-900">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                        <Landmark className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[10px] font-black text-slate-800 dark:text-slate-100">{portal.name}</div>
                        <div className="mt-0.5 flex items-center gap-1 text-[8px] font-bold text-emerald-700 dark:text-emerald-300">
                          <span className={cx("h-1.5 w-1.5 rounded-full", watcherRuntimeStatus === "running" && watcherPortalId === portal.id ? "bg-emerald-500" : watcherConfigs[portal.id]?.enabled ? "bg-amber-400" : "bg-slate-300")} />
                          {watcherRuntimeStatus === "running" && watcherPortalId === portal.id ? `Watching · ${watcherConfigs[portal.id]?.poll_interval_seconds || 30}s` : watcherConfigs[portal.id]?.enabled ? "Configured · not running" : "Not configured"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <div className="text-[10px] font-black text-slate-800 dark:text-slate-100">{portalRows.length}</div>
                          <div className="text-[8px] font-bold text-amber-600">{pendingRows.length} review</div>
                        </div>
                        <button type="button" onClick={() => openWatcherSetup(portal.id)} className="rounded-lg border border-emerald-100 bg-white px-2 py-1 text-[8px] font-black text-emerald-700 dark:border-emerald-900/60 dark:bg-slate-950 dark:text-emerald-300">Setup</button>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="rounded-xl border border-dashed border-emerald-200 bg-white px-3 py-4 text-center text-[9px] font-bold text-slate-500 dark:border-emerald-900/50 dark:bg-slate-900 dark:text-slate-400">
                    No registered AEPS portals yet.
                  </div>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-white px-3 py-2 dark:bg-slate-900">
                  <div className="text-[8px] font-bold uppercase tracking-wide text-slate-400">Review Queue</div>
                  <div className="mt-0.5 text-lg font-black text-slate-950 dark:text-white">{stats.pending}</div>
                </div>
                <div className="rounded-xl bg-white px-3 py-2 dark:bg-slate-900">
                  <div className="text-[8px] font-bold uppercase tracking-wide text-slate-400">Recorded Today</div>
                  <div className="mt-0.5 text-lg font-black text-slate-950 dark:text-white">{rows.filter((row) => {
                    const d = new Date();
                    return String(row.transaction_date || "").slice(0, 10) === d.toISOString().slice(0, 10) &&
                      (String(row.status) === "success" || String(row.status) === "recorded");
                  }).length}</div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-emerald-200 pt-3 dark:border-emerald-900/60">
                <span className="text-[8px] font-bold text-emerald-800/75 dark:text-emerald-200/75">Watcher never submits provider transactions.</span>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter("review");
                    setQuery("");
                    document.getElementById("aeps-transactions")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-[9px] font-black text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-300"
                >
                  Review Queue
                  <ArrowRight className="ml-1 inline h-3 w-3" />
                </button>
              </div>
            </section>


          <div>
            {!drawerOpen ? (
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="flex w-full items-center justify-between rounded-2xl border border-dashed border-blue-300 bg-blue-50 p-4 text-left"
              >
                <div>
                  <p className="text-[11px] font-black text-blue-800">Open Counter Terminal</p>
                  <p className="mt-1 text-[9px] text-blue-600">Manual Entry / AI Auto-Fill</p>
                </div>
                <ArrowRight className="h-4 w-4 text-blue-600" />
              </button>
            ) : (
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-950">
                <div className="border-b border-slate-100 dark:border-slate-800 px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-black text-slate-950">Record AEPS Transaction</h2>
                        <span className="rounded-full bg-blue-50 px-2 py-1 text-[8px] font-black text-blue-700">Review First</span>
                      </div>
                      <p className="mt-1 text-[10px] text-slate-400">Operator-controlled transaction terminal</p>
                    </div>
                    <button type="button" onClick={() => setDrawerOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" title="Close">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
                    <button
                      type="button"
                      onClick={() => setEntryMode("manual")}
                      className={cx(
                        "rounded-lg px-3 py-2 text-[10px] font-black",
                        entryMode === "manual" ? "bg-white text-slate-950 shadow-sm dark:bg-slate-900 dark:text-white" : "text-slate-500"
                      )}
                    >
                      Manual Entry
                    </button>
                    <button
                      type="button"
                      onClick={() => setEntryMode("ai")}
                      className={cx(
                        "rounded-lg px-3 py-2 text-[10px] font-black",
                        entryMode === "ai" ? "bg-white text-blue-700 shadow-sm dark:bg-slate-900" : "text-slate-500"
                      )}
                    >
                      <Sparkles className="mr-1 inline h-3 w-3" />
                      AI Auto-Fill
                    </button>
                  </div>
                </div>

                <div className="space-y-4 p-5">

                  {entryMode === "manual" && (
                    <button
                      type="button"
                      onClick={() => setAnalyzerOpen(true)}
                      className="group w-full rounded-2xl border border-violet-200 bg-violet-50/60 px-4 py-3 text-left transition hover:border-violet-300 hover:bg-violet-50"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
                          <Sparkles className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="text-[11px] font-black text-violet-950">Scan / Paste Source</span>
                            <span className="rounded-full bg-white px-2 py-0.5 text-[8px] font-black text-violet-700">OPTIONAL</span>
                          </span>
                          <span className="mt-0.5 block text-[9px] leading-4 text-violet-700/80">
                            Paste portal/SMS text or analyze a screenshot. Values are extracted only after you review them.
                          </span>
                        </span>
                        <ArrowRight className="h-4 w-4 text-violet-500 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </button>
                  )}

                  {entryMode === "ai" && (
                    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3.5">
                      <div className="flex items-center gap-2 text-[11px] font-black text-blue-900">
                        <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                        Detected Transaction Draft
                      </div>
                      <p className="mt-1 text-[9px] leading-4 text-slate-600">
                        Detected values are suggestions only. Customer, portal and references must be verified before recording.
                      </p>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {[
                          ["Portal", portalName],
                          ["Bank", bankName],
                          ["Type", typeLabel(transactionType)],
                          ["Aadhaar", cleanAadhaar ? "•••• " + cleanAadhaar : "Required"],
                          ["Amount", amount ? inr(Number(amount)) : "—"],
                          ["Bank Ref", bankRef || "—"],
                        ].map((item) => (
                          <div key={String(item[0])} className="rounded-xl border border-blue-100 bg-white p-2.5">
                            <div className="text-[8px] font-bold uppercase tracking-wide text-slate-400">{String(item[0])}</div>
                            <div className="mt-0.5 truncate text-[10px] font-black text-slate-800">{String(item[1])}</div>
                          </div>
                        ))}
                      </div>

                      {matchNotice && (
                        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[9px] font-bold text-amber-800">
                          {matchNotice}
                        </div>
                      )}

                      <div className="mt-3 rounded-xl border border-blue-100 bg-white px-3 py-2 text-[9px] text-blue-800">
                        <ShieldCheck className="mr-1 inline h-3 w-3" />
                        AI never submits the provider-side transaction.
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-600">
                        Customer <span className="text-rose-500">*</span>
                      </label>
                      {selectedCustomer && (
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-[8px] font-black text-emerald-700">
                          Verified Match
                        </span>
                      )}
                    </div>

                    <CustomerSearchSelect
                      value={customerId || null}
                      selected={selectedCustomer}
                      onChange={(id, record) => {
                        setCustomerId(id || "");
                        setSelectedCustomer(record);
                        setName(record?.name || "");
                        setMobile(cleanPhone(record?.phone || mobile));
                        setMatchNotice(record ? "Customer selected from CafeERP database." : "");
                      }}
                      placeholder="Search customer by name, mobile or code..."
                      tone="auto"
                      limit={12}
                    />
                  </div>

                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-wide text-slate-400">Pricing</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPricingPortalId(portalId);
                          setPricingMessage("");
                          setPricingOpen(true);
                        }}
                        className="text-[9px] font-black text-blue-600 hover:text-blue-700"
                      >
                        Setup Rules
                      </button>
                      <button
                        type="button"
                        onClick={() => void loadAepsPricing()}
                        disabled={!portalId || !amount}
                        className="text-[9px] font-black text-violet-600 disabled:opacity-40"
                      >
                        Load Saved
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="mb-1.5 block text-[10px] font-black text-slate-600">
                        Mobile <span className="text-rose-500">*</span>
                        {analysis.customer_mobile && <span className="ml-1 rounded-full bg-violet-50 px-1.5 py-0.5 text-[7px] font-black text-violet-700">SOURCE</span>}
                      </label>
                      <input
                        value={mobile}
                        onChange={(event) => setMobile(event.target.value.replace(/\D/g, "").slice(0, 10))}
                        className={inputClass}
                        inputMode="numeric"
                        placeholder="10-digit mobile"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[10px] font-black text-slate-600">
                        Aadhaar Last 4 <span className="text-rose-500">*</span>
                        {analysis.aadhaar_last4 && <span className="ml-1 rounded-full bg-violet-50 px-1.5 py-0.5 text-[7px] font-black text-violet-700">SOURCE</span>}
                      </label>
                      <input
                        value={aadhaar}
                        onChange={(event) => setAadhaar(event.target.value.replace(/\D/g, "").slice(0, 4))}
                        className={inputClass}
                        inputMode="numeric"
                        placeholder="4 digits"
                      />
                    </div>
                  </div>

                  {name && (
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2">
                      <div className="text-[8px] font-bold uppercase tracking-wide text-emerald-700">CafeERP Customer</div>
                      <div className="mt-0.5 text-[11px] font-black text-slate-800">{name}</div>
                    </div>
                  )}

                  {matchNotice && entryMode === "manual" && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[9px] font-bold text-amber-800">
                      {matchNotice}
                    </div>
                  )}

                  <div>
                    <label className="mb-1.5 block text-[10px] font-black text-slate-600">
                      Transaction Type <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        ["cash_out", "Cash Out"],
                        ["balance_enquiry", "Balance Enquiry"],
                        ["mini_statement", "Mini Statement"],
                      ].map((item) => (
                        <button
                          key={item[0]}
                          type="button"
                          onClick={() => setTransactionType(item[0])}
                          className={cx(
                            "rounded-xl border px-2 py-2 text-[9px] font-black",
                            transactionType === item[0]
                              ? "border-blue-500 bg-blue-50 text-blue-700"
                              : "border-slate-200 bg-white text-slate-500"
                          )}
                        >
                          {item[1]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-600">
                        Amount <span className="text-rose-500">*</span>
                      </label>
                      <span className="text-[8px] font-bold text-slate-400">Quick amount</span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      {DENOMINATIONS.map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setAmount(String(value))}
                          className={cx(
                            "rounded-xl border px-2 py-2 text-[9px] font-black",
                            amount === String(value)
                              ? "border-blue-500 bg-blue-50 text-blue-700"
                              : "border-slate-200 bg-white text-slate-500"
                          )}
                        >
                          ₹{value.toLocaleString("en-IN")}
                        </button>
                      ))}
                    </div>

                    <input
                      value={amount}
                      onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))}
                      className={cx(inputClass, "mt-2")}
                      inputMode="decimal"
                      placeholder="Enter amount"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[10px] font-black text-slate-600">
                      Bank <span className="text-rose-500">*</span>
                        {analysis.bank_name && <span className="ml-1 rounded-full bg-violet-50 px-1.5 py-0.5 text-[7px] font-black text-violet-700">SOURCE</span>}
                    </label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {TOP_BANKS.map((bank) => {
                        const current = bankMasters.find((item) => item.id === bankId);
                        const active = current
                          ? bank[1].some((match) => normalizeBankName(current.name).includes(match))
                          : false;
                        return (
                          <button
                            key={bank[0]}
                            type="button"
                            onClick={() => selectBankByCode(bank[0])}
                            className={cx(
                              "rounded-lg border px-2 py-2 text-[8px] font-black",
                              active
                                ? "border-blue-500 bg-blue-50 text-blue-700"
                                : "border-slate-200 bg-white text-slate-500"
                            )}
                          >
                            {bank[0]}
                          </button>
                        );
                      })}
                    </div>
                    <select value={bankId} onChange={(event) => setBankId(event.target.value)} className={cx(inputClass, "mt-2")}>
                      <option value="">Select registered bank</option>
                      {bankMasters.map((bank) => (
                        <option key={bank.id} value={bank.id}>
                          {bank.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="mb-1.5 block text-[10px] font-black text-slate-600">
                        Portal <span className="text-rose-500">*</span>
                        {analysis.portal_name && <span className="ml-1 rounded-full bg-violet-50 px-1.5 py-0.5 text-[7px] font-black text-violet-700">SOURCE</span>}
                      </label>
                      <select value={portalId} onChange={(event) => setPortalId(event.target.value)} className={inputClass}>
                        <option value="">Select portal</option>
                        {portalMasters.map((portal) => (
                          <option key={portal.id} value={portal.id}>
                            {portal.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[10px] font-black text-slate-600">Collection</label>
                      <select value={customerPayMethod} onChange={(event) => setCustomerPayMethod(event.target.value)} className={inputClass}>
                        <option value="cash">Cash</option>
                        <option value="bank">Bank</option>
                        <option value="upi">UPI</option>
                        <option value="qr">QR</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="mb-1.5 block text-[10px] font-black text-slate-600">Bank Reference</label>
                      <input value={bankRef} onChange={(event) => setBankRef(event.target.value)} className={inputClass} placeholder="RRN / bank ref" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-wide text-rose-700">Customer Fee</span>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[8px] font-black text-rose-600">{analysis.service_fee ? "SOURCE" : "MANUAL"}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="text-sm font-black text-slate-500">₹</span>
                        <input
                          value={fee}
                          onChange={(event) => setFee(event.target.value.replace(/[^0-9.]/g, ""))}
                          className="h-8 w-full rounded-lg border border-rose-200 bg-white px-2 text-[10px] font-black text-slate-900 outline-none"
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-wide text-violet-700">Portal Commission</span>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[8px] font-black text-violet-600">{analysis.portal_commission ? "SOURCE" : "MANUAL"}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="text-sm font-black text-slate-500">₹</span>
                        <input
                          value={commission}
                          onChange={(event) => setCommission(event.target.value.replace(/[^0-9.]/g, ""))}
                          className="h-8 w-full rounded-lg border border-violet-200 bg-white px-2 text-[10px] font-black text-slate-900 outline-none"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[10px] font-black text-slate-600">Fee Handling</label>
                    <select value={feeSource} onChange={(event) => setFeeSource(event.target.value as typeof feeSource)} className={inputClass}>
                      <option value="cut_from_withdrawal">Cut from withdrawal</option>
                      <option value="separate_cash">Collect separately</option>
                      <option value="upi">UPI fee</option>
                    </select>
                  </div>

                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[9px] text-amber-800">
                    <div className="flex items-center gap-1.5 font-black">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Review-before-record control
                    </div>
                    <p className="mt-1 leading-4">
                      Final recording stays under operator review. Analyzer and future watcher flows must never submit a provider-side transaction.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setReviewOpen(true)}
                      disabled={!formValid || busy}
                      className={cx("flex-1", primaryButtonClass)}
                    >
                      Review AEPS Transaction
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={resetForm} className={smallButtonClass}>Reset</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
        </div>

        <section id="aeps-transactions" className="min-w-0">
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className={inputClass}>
                  <option value="all">All Dates</option>
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="last7">Last 7 Days</option>
                  <option value="last30">Last 30 Days</option>
                  <option value="this_month">This Month</option>
                </select>

                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className={inputClass}>
                  <option value="all">All Types</option>
                  <option value="cash_out">Cash Out</option>
                  <option value="balance_enquiry">Balance Enquiry</option>
                  <option value="mini_statement">Mini Statement</option>
                </select>

                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={inputClass}>
                  <option value="all">All Status</option>
                  <option value="success">Success</option>
                  <option value="pending">Pending</option>
                  <option value="review">Review</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="reversed">Reversed</option>
                </select>

                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-3 h-3.5 w-3.5 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className={cx(inputClass, "pl-9")}
                    placeholder="Search customer, mobile, Aadhaar, bank, portal or reference..."
                  />
                </div>

                <button type="button" className={smallButtonClass} title="More filters">
                  <Filter className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="text-sm font-black text-slate-950">AEPS Transactions</h2>
                  <p className="mt-0.5 text-[10px] text-slate-400">Showing {filtered.length} filtered records</p>
                </div>
                <div className="flex gap-2">
                  <input ref={importRef} type="file" accept=".csv,.json,text/csv,application/json" onChange={handleImportChange} className="hidden" />
                  <button type="button" onClick={() => importRef.current?.click()} className={smallButtonClass}>
                    <Upload className="mr-1 h-3.5 w-3.5" />
                    Import
                  </button>
                  <button type="button" onClick={exportTransactions} className={smallButtonClass}>
                    <Download className="mr-1 h-3.5 w-3.5" />
                    Export
                  </button>
                  <button type="button" onClick={resetForm} className={primaryButtonClass}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    New
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1320px] text-left">
                  <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-3 py-3">#</th>
                      <th className="px-3 py-3">Date & Time</th>
                      <th className="px-3 py-3">Customer</th>
                      <th className="px-3 py-3">Mobile</th>
                      <th className="px-3 py-3">Type</th>
                      <th className="px-3 py-3">Aadhaar</th>
                      <th className="px-3 py-3">Amount</th>
                      <th className="px-3 py-3">Customer Fee</th>
                      <th className="px-3 py-3">Portal Commission</th>
                      <th className="px-3 py-3">Bank</th>
                      <th className="px-3 py-3">Portal</th>
                      <th className="px-3 py-3">Bank Ref</th>
                      <th className="px-3 py-3">Portal Ref</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[10px]">
                    {filtered.map((transaction) => {
                      const dateTime = formatDateTime(transaction.transaction_timestamp || transaction.transaction_date);
                      return (
                        <tr key={transaction.id} className="transition hover:bg-slate-50">
                          <td className="px-3 py-3 font-mono font-black text-blue-600">{transaction.transaction_number || "—"}</td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="font-bold text-slate-700">{dateTime.date}</div>
                            <div className="text-[9px] text-slate-400">{dateTime.time}</div>
                          </td>
                          <td className="px-3 py-3 font-black text-slate-900">{transaction.customers?.name || "—"}</td>
                          <td className="px-3 py-3 font-mono text-slate-500">{maskMobile(transaction.customer_mobile || transaction.customers?.phone) || "—"}</td>
                          <td className="px-3 py-3 font-semibold text-slate-600">{typeLabel(transaction.transfer_method)}</td>
                          <td className="px-3 py-3 font-mono">•••• {transaction.aadhaar_last4 || "—"}</td>
                          <td className="px-3 py-3 font-black text-slate-950">{inr(Number(transaction.amount || 0))}</td>
                          <td className="px-3 py-3 font-bold text-rose-600">{inr(Number(transaction.service_fee || 0))}</td>
                          <td className="px-3 py-3 font-bold text-violet-600">{inr(Number(transaction.portal_commission || 0))}</td>
                          <td className="px-3 py-3 text-slate-600">{transaction.banks?.name || "—"}</td>
                          <td className="px-3 py-3 text-slate-600">{transaction.portals?.name || "—"}</td>
                          <td className="px-3 py-3 font-mono text-slate-500">{transaction.reference || "—"}</td>
                          <td className="px-3 py-3 font-mono text-slate-500">{String(transaction.remarks || "").replace(/^Portal Ref:\s*/i, "") || "—"}</td>
                          <td className="px-3 py-3"><StatusPill status={transaction.status} /></td>
                          <td className="px-3 py-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              <Link href={"/business/receipt/" + transaction.id + "?mode=detailed"} target="_blank" className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-[9px] font-black text-blue-600">
                                80mm
                              </Link>
                              <Link href={"/business/receipt/" + transaction.id + "/a4?mode=detailed"} target="_blank" className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[9px] font-black text-slate-600">
                                A4
                              </Link>
                              <button type="button" className="rounded-lg border border-slate-200 p-1.5 text-slate-400" title="More">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {!filtered.length && (
                      <tr>
                        <td colSpan={15} className="px-5 py-16 text-center">
                          <ShieldCheck className="mx-auto h-8 w-8 text-slate-300" />
                          <p className="mt-3 text-sm font-black text-slate-500">No AEPS transactions found</p>
                          <p className="mt-1 text-xs text-slate-400">Real transaction data will appear here when available.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

        {importNotice && (
          <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[10px] font-bold text-blue-800">
            <ShieldCheck className="mr-1.5 inline h-3.5 w-3.5" />
            {importNotice}
          </div>
        )}

        {watcherOpen && (
          <div className="fixed inset-0 z-[96] flex items-center justify-center bg-slate-950/45 p-4">
            <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-2xl dark:border-emerald-900/60 dark:bg-slate-950">
              <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <div>
                  <h3 className="text-base font-black text-slate-950 dark:text-white">AEPS Watcher Setup</h3>
                  <p className="mt-1 text-[9px] text-slate-400">Configure a read-only source monitor. It must never submit, approve, or confirm provider transactions.</p>
                </div>
                <button type="button" onClick={() => setWatcherOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"><X className="h-4 w-4" /></button>
              </div>
              <div className="space-y-4 p-5">
                <div>
                  <label className="mb-1 block text-[9px] font-black uppercase tracking-wide text-slate-500">Registered Portal</label>
                  <select value={watcherPortalId} onChange={(e) => openWatcherSetup(e.target.value)} className={inputClass}>
                    <option value="">Select portal</option>
                    {portalMasters.map((portal) => <option key={portal.id} value={portal.id}>{portal.name}</option>)}
                  </select>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
                  <div><div className="text-[10px] font-black text-emerald-950 dark:text-emerald-100">Enable watcher</div><div className="mt-0.5 text-[9px] text-emerald-800/70 dark:text-emerald-200/70">Read and normalize new AEPS records only.</div></div>
                  <button type="button" onClick={() => setWatcherEnabled((value) => !value)} className={cx("relative h-6 w-11 rounded-full transition", watcherEnabled ? "bg-emerald-600" : "bg-slate-300")}><span className={cx("absolute top-1 h-4 w-4 rounded-full bg-white shadow transition", watcherEnabled ? "left-6" : "left-1")} /></button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="mb-1 block text-[9px] font-black uppercase tracking-wide text-slate-500">Check interval</label><select value={watcherInterval} onChange={(e) => setWatcherInterval(e.target.value)} className={inputClass}><option value="15">Every 15 seconds</option><option value="30">Every 30 seconds</option><option value="60">Every 1 minute</option><option value="120">Every 2 minutes</option><option value="300">Every 5 minutes</option><option value="600">Every 10 minutes</option></select></div>
                  <div><label className="mb-1 block text-[9px] font-black uppercase tracking-wide text-slate-500">Source URL</label><input value={watcherSourceUrl} onChange={(e) => setWatcherSourceUrl(e.target.value)} className={inputClass} placeholder="https://portal.example/..." /></div>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[9px] font-bold leading-4 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">Do not store portal passwords, OTPs, biometric data, or session tokens in CafeERP. The URL is only the source location. Extracted transactions must go to review before recording.</div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">Live runtime</div>
                      <div className="mt-1 text-[11px] font-black text-slate-800 dark:text-slate-100">
                        {watcherRuntimeStatus === "running" ? "RUNNING" : watcherRuntimeStatus === "auth_required" ? "LOGIN REQUIRED" : watcherRuntimeStatus === "starting" ? "STARTING" : watcherRuntimeStatus === "error" ? "ERROR" : "STOPPED"}
                      </div>
                    </div>
                    <div className={cx(
                      "h-2.5 w-2.5 rounded-full",
                      watcherRuntimeStatus === "running" && "bg-emerald-500",
                      watcherRuntimeStatus === "auth_required" && "bg-amber-500",
                      watcherRuntimeStatus === "starting" && "bg-blue-500",
                      watcherRuntimeStatus === "error" && "bg-rose-500",
                      watcherRuntimeStatus === "idle" && "bg-slate-300"
                    )} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[8px] font-bold text-slate-500">
                    <span>Last check: {watcherLastCheck ? new Date(watcherLastCheck).toLocaleTimeString("en-IN") : "—"}</span>
                    <span className="text-right">Detected this session: {watcherDetectedCount}</span>
                  </div>
                </div>
                {watcherMessage && <div className="rounded-xl bg-blue-50 px-3 py-2 text-[9px] font-bold text-blue-700">{watcherMessage}</div>}
              </div>
              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
                <button type="button" onClick={() => setWatcherOpen(false)} className={smallButtonClass}>Close</button>
                <button type="button" onClick={() => void stopAepsWatcher()} disabled={watcherRuntimeStatus === "idle"} className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[10px] font-black text-rose-700 disabled:opacity-40">Stop Watcher</button>
                <button type="button" onClick={() => void saveWatcherConfig()} disabled={watcherBusy || !watcherPortalId} className={smallButtonClass}>{watcherBusy ? "Saving..." : "Save Setup"}</button>
                <button type="button" onClick={async () => { const saved = await saveWatcherConfig(); if (saved) await startAepsWatcher(); }} disabled={watcherBusy || !watcherEnabled || !watcherPortalId || !watcherSourceUrl.trim()} className={primaryButtonClass}>
                  {watcherRuntimeStatus === "starting" ? "Starting..." : "Save & Start Watcher"}
                </button>
              </div>
            </div>
          </div>
        )}

        {pricingOpen && (
          <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/45 p-4">
            <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h3 className="text-base font-black text-slate-950">AEPS Pricing Rules</h3>
                  <p className="mt-1 text-[9px] text-slate-400">Save portal-specific fee and commission slabs permanently.</p>
                </div>
                <button type="button" onClick={() => setPricingOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
              </div>
              <div className="space-y-3 p-5">
                <div>
                  <label className="mb-1 block text-[9px] font-black text-slate-500">Portal</label>
                  <select value={pricingPortalId} onChange={(e) => setPricingPortalId(e.target.value)} className={inputClass}>
                    <option value="">Select portal</option>
                    {portalMasters.map((portal) => <option key={portal.id} value={portal.id}>{portal.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="mb-1 block text-[9px] font-black text-slate-500">Min Amount</label><input type="number" value={pricingMinAmount} onChange={(e) => setPricingMinAmount(e.target.value)} className={inputClass} /></div>
                  <div><label className="mb-1 block text-[9px] font-black text-slate-500">Max Amount</label><input type="number" value={pricingMaxAmount} onChange={(e) => setPricingMaxAmount(e.target.value)} placeholder="No limit" className={inputClass} /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="mb-1 block text-[9px] font-black text-slate-500">Customer Fee</label><input type="number" min="0" step="0.01" value={pricingFee} onChange={(e) => setPricingFee(e.target.value)} className={inputClass} placeholder="0" /></div>
                  <div><label className="mb-1 block text-[9px] font-black text-slate-500">Portal Commission</label><input type="number" min="0" step="0.01" value={pricingCommission} onChange={(e) => setPricingCommission(e.target.value)} className={inputClass} placeholder="0" /></div>
                </div>
                {pricingMessage && <div className="rounded-xl bg-blue-50 px-3 py-2 text-[9px] font-bold text-blue-700">{pricingMessage}</div>}
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
                <button type="button" onClick={() => setPricingOpen(false)} className={smallButtonClass}>Close</button>
                <button type="button" onClick={() => void savePricingRule()} disabled={pricingBusy} className={primaryButtonClass}>{pricingBusy ? "Saving..." : "Save Rule"}</button>
              </div>
            </div>
          </div>
        )}

        {analyzerOpen && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4">
            <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-600 text-white">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-base font-black text-slate-950 dark:text-white">Scan / Paste Transaction Source</h3>
                      <p className="mt-0.5 text-[9px] text-slate-400">Extract → verify → apply. Nothing is recorded from this window.</p>
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => setAnalyzerOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-5">
                <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
                  <button type="button" onClick={() => setAnalyzerTab("paste")} className={cx("rounded-lg px-3 py-2 text-[10px] font-black", analyzerTab === "paste" ? "bg-white text-violet-700 shadow-sm dark:bg-slate-800" : "text-slate-500")}>
                    <ClipboardPaste className="mr-1 inline h-3 w-3" />
                    Paste Text
                  </button>
                  <button type="button" onClick={() => setAnalyzerTab("photo")} className={cx("rounded-lg px-3 py-2 text-[10px] font-black", analyzerTab === "photo" ? "bg-white text-violet-700 shadow-sm dark:bg-slate-800" : "text-slate-500")}>
                    <FileImage className="mr-1 inline h-3 w-3" />
                    Photo Analyzer
                  </button>
                </div>

                {analyzerTab === "paste" ? (
                  <div className="mt-4 space-y-2">
                    <textarea
                      value={sourceText}
                      onChange={(event) => setSourceText(event.target.value)}
                      rows={8}
                      placeholder={"Paste DigiPay / portal transaction text here...\n\nExample: Amount: ₹2000\nAadhaar: XXXX 4821\nMobile: 98XXXXXXXX\nBank Ref: 123456789012"}
                      className="w-full resize-none rounded-2xl border border-violet-200 bg-white p-3 text-[10px] font-medium leading-4 text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-violet-900/60 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void analyzeText()} disabled={!sourceText.trim() || analysisBusy} className="flex-1 rounded-xl bg-violet-600 px-3 py-2.5 text-[10px] font-black text-white disabled:opacity-40">
                        {analysisBusy ? "Analyzing..." : "Analyze Source"}
                      </button>
                      <button type="button" onClick={() => { setSourceText(""); setAnalysis({}); setMatchNotice(""); }} className={smallButtonClass}>
                        Clear
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                    <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => fileRef.current?.click()} className="rounded-2xl border-2 border-dashed border-violet-200 bg-white px-3 py-7 text-center text-[10px] font-black text-violet-700 hover:bg-violet-50 dark:border-violet-900/60 dark:bg-slate-900 dark:text-violet-300">
                        <Upload className="mx-auto mb-1 h-5 w-5" />
                        Upload Screenshot
                      </button>
                      <button type="button" onClick={() => cameraRef.current?.click()} className="rounded-2xl border-2 border-dashed border-slate-200 bg-white px-3 py-7 text-center text-[10px] font-black text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                        <Camera className="mx-auto mb-1 h-5 w-5" />
                        Take Photo
                      </button>
                    </div>
                    {sourceImage && <img src={sourceImage} alt="AEPS source preview" className="max-h-48 w-full rounded-2xl object-contain bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800" />}
                    <p className="text-[9px] leading-4 text-slate-500 dark:text-slate-400">Photo OCR runs locally in the browser. Extracted values stay in the source review flow.</p>
                  </div>
                )}

                {analysisBusy && <p className="mt-3 text-[9px] font-bold text-violet-700 dark:text-violet-300">Reading source...</p>}
                {analysisError && (
                  <p className="mt-3 flex items-center gap-1 text-[9px] font-bold text-rose-600">
                    <AlertCircle className="h-3 w-3" />
                    {analysisError}
                  </p>
                )}

                {Object.keys(analysis).length > 0 && (
                  <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/60 p-3.5 dark:border-violet-900/60 dark:bg-violet-950/30">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-wide text-violet-800 dark:text-violet-200">Detected values</span>
                        <span className="ml-2 text-[9px] font-bold text-emerald-600">{Object.keys(analysis).length} fields</span>
                      </div>
                      <span className="rounded-full bg-white px-2 py-1 text-[8px] font-black text-violet-700 dark:bg-slate-900 dark:text-violet-300">SOURCE</span>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {Object.entries(analysis).map(([key, value]) => (
                        <div key={key} className="rounded-xl bg-white p-2.5 dark:bg-slate-900">
                          <div className="text-[8px] font-bold uppercase tracking-wide text-slate-400">{key.replace(/_/g, " ")}</div>
                          <div className="mt-0.5 truncate text-[10px] font-black text-slate-800 dark:text-slate-100">{String(value)}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[9px] font-bold text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
                      Customer identity is resolved from CafeERP; source text never becomes the authoritative customer name.
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
                <button type="button" onClick={() => setAnalyzerOpen(false)} className={smallButtonClass}>Cancel</button>
                <button
                  type="button"
                  onClick={() => {
                    setAnalyzerOpen(false);
                    if (Object.keys(analysis).length) {
                      void applyAnalysis(analysis, sourceText);
                    }
                  }}
                  disabled={!Object.keys(analysis).length || analysisBusy}
                  className={primaryButtonClass}
                >
                  Apply Detected Values
                  <Check className="ml-1.5 h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {reviewOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4">
            <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h3 className="text-lg font-black text-slate-950">Review AEPS Transaction</h3>
                  <p className="mt-1 text-[10px] text-slate-400">
                    Verify every value before it reaches the financial transaction boundary.
                  </p>
                </div>
                <button type="button" onClick={() => setReviewOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {saveError && (
                <div className="mx-5 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[10px] font-bold text-rose-700">
                  <AlertCircle className="mr-1.5 inline h-3.5 w-3.5" />
                  {saveError}
                </div>
              )}

              <div className="grid gap-3 p-5 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">Customer</div>
                  <div className="mt-1 text-sm font-black text-slate-950">{name || selectedCustomer?.name || "Not selected"}</div>
                  <div className="mt-1 text-[10px] text-slate-500">
                    {maskMobile(cleanMobile) || "Mobile missing"} · Aadhaar •••• {cleanAadhaar || "----"}
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">Source</div>
                  <div className="mt-1 text-sm font-black text-slate-950">{portalName}</div>
                  <div className="mt-1 text-[10px] text-slate-500">{bankName} · {typeLabel(transactionType)}</div>
                </div>

                <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                  <div className="text-[9px] font-black uppercase tracking-wide text-blue-700">Transaction</div>
                  <div className="mt-1 text-xl font-black text-slate-950">{inr(Number(amount || 0))}</div>
                  <div className="mt-1 text-[10px] text-slate-500">
                    Bank Ref: {bankRef || "—"}
                  </div>
                </div>

                <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
                  <div className="text-[9px] font-black uppercase tracking-wide text-violet-700">Fee & Commission</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[8px] font-bold text-slate-400">Customer Fee</div>
                      <div className="text-sm font-black text-slate-950">{inr(Number(fee || 0))}</div>
                    </div>
                    <div>
                      <div className="text-[8px] font-bold text-slate-400">Portal Commission</div>
                      <div className="text-sm font-black text-slate-950">{inr(Number(commission || 0))}</div>
                    </div>
                  </div>
                </div>

                <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[9px] text-amber-800">
                  <strong>Review required:</strong> the analyzer can extract and match data, but it cannot approve or submit a provider transaction.
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">
                <button type="button" onClick={() => setReviewOpen(false)} className={smallButtonClass}>
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (watcherImportId) {
                      void supabase
                        .from("ai_transaction_imports")
                        .update({ state: "rejected", review_note: "Rejected by operator before ledger posting.", updated_at: new Date().toISOString() })
                        .eq("id", watcherImportId);
                    }
                    setReviewOpen(false);
                    resetForm();
                  }}
                  className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-[10px] font-black text-rose-700"
                >
                  Reject
                </button>
                <button type="button" onClick={() => void recordTransaction()} disabled={!formValid || busy} className={primaryButtonClass}>
                  {busy ? "Processing..." : "Approve & Record"}
                  <Check className="ml-1.5 h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ZapIcon() {
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
      <Sparkles className="h-3.5 w-3.5" />
    </span>
  );
}
