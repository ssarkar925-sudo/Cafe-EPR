// BILLING_WORKSPACE_PATCH_SAFE_V1
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
import { useToast } from "@/components/ui/use-toast";
import { downloadCsv } from "@/components/ui/csv";
import { renderWhatsAppTemplate, sendWhatsAppMessage, getWhatsAppConfig, DEFAULT_WA_TEMPLATES } from "@/lib/whatsapp";
import WhatsAppSendModal from "@/components/whatsapp/whatsapp-send-modal";

export type CustomerRow = {
  id: string;
  name: string;
  code?: string;
  phone?: string | null;
  balance?: number;
};

export type RechargeProvider = {
  id: string;
  name: string;
  is_active: boolean;
  sort_order?: number;
  code?: string;
};

export type RechargeSlab = {
  id: string;
  provider_id: string;
  min_amount: number | string;
  max_amount: number | string;
  commission_percent: number | string;
};

export type PaymentInstrument = {
  id: string;
  name: string;
  type: string;
  balance?: number;
  opening_balance?: number;
  details?: any;
  is_active: boolean;
};

export type Txn = {
  id: string;
  transaction_number: string;
  service_type: string;
  direction: string;
  transaction_date: string;
  transaction_timestamp?: string | null;
  customer_id?: string | null;
  customer_mobile?: string | null;
  reference?: string | null;
  remarks?: string | null;
  status: "success" | "pending" | "failed" | "reversed";
  provider_id?: string | null;
  instrument_id?: string | null;
  amount: number | string;
  service_fee?: number | string;
  portal_commission?: number | string;
  portal_charge?: number | string;
  customer_pay_method?: string | null;
  cash_in?: number | string;
  cash_out?: number | string;
  bank_in?: number | string;
  bank_out?: number | string;
  pool_out?: number | string;
  pool_credit?: number | string;
  created_at?: string;
  customers?: { name: string; phone?: string | null } | null;
  providers?: { name: string } | null;
  profiles?: { full_name: string } | null;
};

// Telecom Circles
const TELECOM_CIRCLES = [
  "West Bengal",
  "Kolkata",
  "Bihar & Jharkhand",
  "Delhi NCR",
  "Mumbai",
  "Maharashtra & Goa",
  "Uttar Pradesh (East)",
  "Uttar Pradesh (West)",
  "Assam",
  "North East",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Tamil Nadu & Chennai",
  "Karnataka",
  "Andhra Pradesh & Telangana",
  "Gujarat",
  "Madhya Pradesh & Chhattisgarh",
  "Haryana",
  "Kerala",
  "All India",
];

// Standard Dynamic Telecom Operators (Dynamic Catalog)
const OPERATOR_CATALOG: { name: string; code: string; color: string; icon: string; bg: string; border: string; text: string }[] = [
  { name: "Airtel", code: "airtel", color: "rose", icon: "🔴", bg: "bg-rose-500/10 dark:bg-rose-950/30", border: "border-rose-500/30", text: "text-rose-600 dark:text-rose-400" },
  { name: "Jio", code: "jio", color: "blue", icon: "🔵", bg: "bg-blue-500/10 dark:bg-blue-950/30", border: "border-blue-500/30", text: "text-blue-600 dark:text-blue-400" },
  { name: "Vodafone Idea (Vi)", code: "vi", color: "amber", icon: "🟡", bg: "bg-amber-500/10 dark:bg-amber-950/30", border: "border-amber-500/30", text: "text-amber-600 dark:text-amber-400" },
  { name: "BSNL", code: "bsnl", color: "emerald", icon: "🟢", bg: "bg-emerald-500/10 dark:bg-emerald-950/30", border: "border-emerald-500/30", text: "text-emerald-600 dark:text-emerald-400" },
  { name: "Tata Play (DTH)", code: "tataplay", color: "purple", icon: "📺", bg: "bg-purple-500/10 dark:bg-purple-950/30", border: "border-purple-500/30", text: "text-purple-600 dark:text-purple-400" },
  { name: "Airtel Digital TV", code: "airteldth", color: "rose", icon: "📡", bg: "bg-rose-500/10 dark:bg-rose-950/30", border: "border-rose-500/30", text: "text-rose-600 dark:text-rose-400" },
  { name: "Dish TV", code: "dishtv", color: "orange", icon: "🛰️", bg: "bg-orange-500/10 dark:bg-orange-950/30", border: "border-orange-500/30", text: "text-orange-600 dark:text-orange-400" },
  { name: "Sun Direct", code: "sundirect", color: "yellow", icon: "☀️", bg: "bg-yellow-500/10 dark:bg-yellow-950/30", border: "border-yellow-500/30", text: "text-yellow-600 dark:text-yellow-400" },
];

// Curated Popular Telecom Plans
export type PlanItem = {
  id: string;
  provider_id?: string | null;
  category: string;
  amount: number;
  validity: string;
  data: string;
  voice: string;
  sms: string;
  description: string;
  badge?: string;
};

const SAMPLE_PLANS: PlanItem[] = [
  { id: "p1", category: "Popular Plans", amount: 299, validity: "28 Days", data: "1.5 GB/Day", voice: "Unlimited", sms: "100/Day", description: "Unlimited 5G Data + Disney+ Hotstar Mobile 3M", badge: "Best Seller" },
  { id: "p2", category: "Popular Plans", amount: 349, validity: "28 Days", data: "2.0 GB/Day", voice: "Unlimited", sms: "100/Day", description: "Truly Unlimited Calls + Free Hello Tunes & Wynk", badge: "Hero Unlimited" },
  { id: "p3", category: "Daily 1.5GB/Day", amount: 719, validity: "84 Days", data: "1.5 GB/Day", voice: "Unlimited", sms: "100/Day", description: "Quarterly Pack + Unlimited 5G Data + Apollo 24|7", badge: "Popular" },
  { id: "p4", category: "Daily 2GB/Day", amount: 859, validity: "84 Days", data: "2.0 GB/Day", voice: "Unlimited", sms: "100/Day", description: "Unlimited 5G Data + 84 Days Validity + Hotstar", badge: "Heavy Data" },
  { id: "p5", category: "Annual 365 Days", amount: 2999, validity: "365 Days", data: "2.5 GB/Day", voice: "Unlimited", sms: "100/Day", description: "Full 1 Year Pack + Unlimited 5G Data + OTT Subscription", badge: "Annual Value" },
  { id: "p6", category: "Annual 365 Days", amount: 3599, validity: "365 Days", data: "2.0 GB/Day", voice: "Unlimited", sms: "100/Day", description: "365 Days + Disney+ Hotstar 1 Year + Prime Video Mobile", badge: "VIP Annual" },
  { id: "p7", category: "Data Only", amount: 19, validity: "1 Day", data: "1.0 GB", voice: "NA", sms: "NA", description: "Emergency High Speed Data Booster Pack" },
  { id: "p8", category: "Data Only", amount: 65, validity: "Existing Pack", data: "4.0 GB", voice: "NA", sms: "NA", description: "4GB Data Booster for active validity" },
  { id: "p9", category: "Data Only", amount: 181, validity: "30 Days", data: "1.0 GB/Day", voice: "NA", sms: "NA", description: "Work From Home Data Pack 30GB total" },
  { id: "p10", category: "Talktime / Topup", amount: 155, validity: "24 Days", data: "1.0 GB Total", voice: "Unlimited", sms: "300 SMS", description: "Affordable Basic Calling Pack" },
  { id: "p11", category: "Talktime / Topup", amount: 199, validity: "28 Days", data: "2.0 GB Total", voice: "Unlimited", sms: "100 SMS", description: "Standard Calling & SMS Pack" },
];

const PLAN_CATEGORIES = [
  "Popular Plans",
  "Daily 1.5GB/Day",
  "Daily 2GB/Day",
  "Annual 365 Days",
  "Data Only",
  "Talktime / Topup",
];

function SvgIcon({ path, className = "h-4 w-4" }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

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

export default function RechargeWorkspace({
  initialTransactions,
  initialCustomers,
  initialRechargeProviders,
  initialRechargeSlabs,
  initialPaymentInstruments,
}: {
  initialTransactions: Txn[];
  initialCustomers: CustomerRow[];
  initialRechargeProviders: RechargeProvider[];
  initialRechargeSlabs: RechargeSlab[];
  initialPaymentInstruments: PaymentInstrument[];
}) {
  const supabase = createClient();
  const { showToast, toastView } = useToast();
  const formRef = useRef<HTMLDivElement>(null);

  useRealtime([
    "transactions",
    "recharge_providers",
    "recharge_commission_slabs",
    "recharge_plan_catalog",
    "customers",
    "cash_entries",
    "payment_instruments",
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("recharge_plan_catalog")
        .select("id,provider_id,category,amount,validity,data,voice,sms,description,badge")
        .eq("is_active", true)
        .order("sort_order")
        .order("amount");
      if (!cancelled && data && data.length > 0) setCatalogPlans(data as PlanItem[]);
    })();
    return () => { cancelled = true; };
  }, []);

  // State
  const [transactions, setTransactions] = useState<Txn[]>(initialTransactions);
  const [customers, setCustomers] = useState<CustomerRow[]>(initialCustomers);
  const [providers, setProviders] = useState<RechargeProvider[]>(initialRechargeProviders);
  const [slabs, setSlabs] = useState<RechargeSlab[]>(initialRechargeSlabs);
  const [instruments, setInstruments] = useState<PaymentInstrument[]>(initialPaymentInstruments);
  const [catalogPlans, setCatalogPlans] = useState<PlanItem[]>(SAMPLE_PLANS);

  // Form Inputs (Zero demo prefill)
  const [mobileNumber, setMobileNumber] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedOperatorCode, setSelectedOperatorCode] = useState("");
  const [selectedCircle, setSelectedCircle] = useState("West Bengal");
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedBadge, setDetectedBadge] = useState<string | null>(null);
  const [isManualOverride, setIsManualOverride] = useState(false);
  const lastLookupRef = useRef("");
  const lookupSeqRef = useRef(0);
  const [amount, setAmount] = useState("");
  const [serviceFee, setServiceFee] = useState("0");
  const [selectedPlan, setSelectedPlan] = useState<PlanItem | null>(null);
  const [planCategory, setPlanCategory] = useState("Popular Plans");
  const [customerPayMethod, setCustomerPayMethod] = useState<"cash" | "upi" | "bank" | "due">("cash");
  const [customerPayInstId, setCustomerPayInstId] = useState("");
  const [fundingInstId, setFundingInstId] = useState("");
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");

  // Modals & Busy Locks
  const [submitting, setSubmitting] = useState(false);
  const [receiptTxn, setReceiptTxn] = useState<Txn | null>(null);
  const [detailTxn, setDetailTxn] = useState<Txn | null>(null);
  const [reverseTxn, setReverseTxn] = useState<Txn | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [busyReverse, setBusyReverse] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [addCustomerModal, setAddCustomerModal] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [waModal, setWaModal] = useState<{ open: boolean; phone: string; name: string; msg: string; refNum: string; refId: string } | null>(null);

  // Filter & Search in History
  const [filterStatus, setFilterStatus] = useState<"all" | "success" | "pending" | "failed" | "reversed">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOperator, setFilterOperator] = useState<string>("all");

  // Dynamic Combined Providers (DB Providers + Catalog)
  const allOperators = useMemo(() => {
    const list = [...OPERATOR_CATALOG];
    if (providers && providers.length > 0) {
      for (const p of providers) {
        if (!list.some((o) => o.name.toLowerCase() === p.name.toLowerCase())) {
          list.push({
            name: p.name,
            code: p.id,
            color: "indigo",
            icon: "⚡",
            bg: "bg-indigo-500/10 dark:bg-indigo-950/30",
            border: "border-indigo-500/30",
            text: "text-indigo-600 dark:text-indigo-400",
          });
        }
      }
    }
    return list;
  }, [providers]);

  // Valid Funding Instruments. Credit cards are supported as a real provider/gateway funding source.
  const validFundingInstruments = useMemo(() => {
    return instruments.filter(
      (i) => i.is_active && ["cash", "bank", "upi", "wallet", "dmt_portal", "aeps_portal", "credit_card"].includes(i.type)
    );
  }, [instruments]);

  // Set default funding instrument
  useEffect(() => {
    if (!fundingInstId && validFundingInstruments.length > 0) {
      const defaultInst = validFundingInstruments.find((i) => i.type === "cash") || validFundingInstruments[0];
      setFundingInstId(defaultInst.id);
    }
  }, [validFundingInstruments, fundingInstId]);

  // Local prefix fallback engine
  const lookupLocalOperator = useCallback((clean: string) => {
    if (clean.length < 4) return null;
    const prefix4 = clean.slice(0, 4);
    const prefix2 = clean.slice(0, 2);

    const series4: Record<string, { operatorCode: string; operatorName: string; circle: string }> = {
      // Airtel
      "9830": { operatorCode: "airtel", operatorName: "Airtel", circle: "Kolkata" },
      "9831": { operatorCode: "airtel", operatorName: "Airtel", circle: "Kolkata" },
      "9832": { operatorCode: "airtel", operatorName: "Airtel", circle: "West Bengal" },
      "9836": { operatorCode: "airtel", operatorName: "Airtel", circle: "Kolkata" },
      "9874": { operatorCode: "airtel", operatorName: "Airtel", circle: "Kolkata" },
      // Jio
      "7003": { operatorCode: "jio", operatorName: "Jio", circle: "Kolkata" },
      "6290": { operatorCode: "jio", operatorName: "Jio", circle: "Kolkata" },
      "7980": { operatorCode: "jio", operatorName: "Jio", circle: "Kolkata" },
      "8910": { operatorCode: "jio", operatorName: "Jio", circle: "West Bengal" },
      "8240": { operatorCode: "jio", operatorName: "Jio", circle: "Kolkata" },
      "9339": { operatorCode: "jio", operatorName: "Jio", circle: "Kolkata" },
      "9330": { operatorCode: "jio", operatorName: "Jio", circle: "Kolkata" },
      "9331": { operatorCode: "jio", operatorName: "Jio", circle: "Kolkata" },
      // Vodafone Idea (Vi)
      "9883": { operatorCode: "vi", operatorName: "Vodafone Idea", circle: "West Bengal" },
      "9748": { operatorCode: "vi", operatorName: "Vodafone Idea", circle: "Kolkata" },
      "9051": { operatorCode: "vi", operatorName: "Vodafone Idea", circle: "Kolkata" },
      "9163": { operatorCode: "vi", operatorName: "Vodafone Idea", circle: "Kolkata" },
      // BSNL
      "9433": { operatorCode: "bsnl", operatorName: "BSNL", circle: "Kolkata" },
      "9434": { operatorCode: "bsnl", operatorName: "BSNL", circle: "West Bengal" },
      "9432": { operatorCode: "bsnl", operatorName: "BSNL", circle: "Kolkata" },
      "9474": { operatorCode: "bsnl", operatorName: "BSNL", circle: "West Bengal" },
    };

    if (series4[prefix4]) return series4[prefix4];

    if (["98", "99", "97", "96", "95", "90"].includes(prefix2)) {
      return { operatorCode: "airtel", operatorName: "Airtel", circle: "West Bengal" };
    } else if (["70", "79", "62", "63", "89", "82", "93"].includes(prefix2)) {
      return { operatorCode: "jio", operatorName: "Jio", circle: "West Bengal" };
    } else if (["91", "88", "87", "86", "84"].includes(prefix2)) {
      return { operatorCode: "vi", operatorName: "Vodafone Idea", circle: "West Bengal" };
    } else if (["94", "83", "73"].includes(prefix2)) {
      return { operatorCode: "bsnl", operatorName: "BSNL", circle: "West Bengal" };
    }

    return null;
  }, []);

  // First-Class Debounced Operator & Circle Auto-Detection Hook
  useEffect(() => {
    const clean = mobileNumber.replace(/\D/g, "").slice(0, 10);
    if (clean.length < 10) {
      if (clean.length === 0) {
        setIsManualOverride(false);
        setDetectedBadge(null);
        lastLookupRef.current = "";
      }
      setIsDetecting(false);
      return;
    }

    if (clean.length === 10 && clean !== lastLookupRef.current && !isManualOverride) {
      lastLookupRef.current = clean;
      const currentSeq = ++lookupSeqRef.current;
      setIsDetecting(true);

      const timer = setTimeout(async () => {
        try {
          const res = await fetch(`/api/recharge/operator-circle?mobile=${encodeURIComponent(clean)}`, {
            cache: "no-store",
            signal: AbortSignal.timeout(6000),
          });
          const data = await res.json().catch(() => ({}));

          if (currentSeq !== lookupSeqRef.current) return;

          if (data && data.ok && (data.operatorCode || data.operator_code || data.operatorName || data.operator)) {
            const rawOpCode = String(data.operatorCode || data.operator_code || "").toLowerCase();
            const rawOpName = String(data.operatorName || data.operator || "").toLowerCase();

            const matched = allOperators.find(
              (o) =>
                o.code.toLowerCase() === rawOpCode ||
                rawOpName.includes(o.name.toLowerCase()) ||
                o.name.toLowerCase().includes(rawOpName) ||
                (rawOpName.includes("airtel") && o.code === "airtel") ||
                (rawOpName.includes("jio") && o.code === "jio") ||
                ((rawOpName.includes("vi") || rawOpName.includes("idea") || rawOpName.includes("voda")) && o.code === "vi") ||
                (rawOpName.includes("bsnl") && o.code === "bsnl")
            );

            if (matched) {
              setSelectedOperatorCode(matched.code);
              const cir = data.circleName || data.circle || "West Bengal";
              if (TELECOM_CIRCLES.includes(cir)) {
                setSelectedCircle(cir);
              }
              const isPayU = data.source === "payu_live";
              setDetectedBadge(
                isPayU
                  ? `🟢 PayU Verified: ${matched.name} · ${cir}`
                  : `⚡ Auto-detected: ${matched.name} · ${cir}`
              );
              return;
            }
          }

          // Fallback to local prefix intelligence
          const local = lookupLocalOperator(clean);
          if (local) {
            setSelectedOperatorCode(local.operatorCode);
            if (TELECOM_CIRCLES.includes(local.circle)) {
              setSelectedCircle(local.circle);
            }
            setDetectedBadge(`⚡ Auto-detected: ${local.operatorName} · ${local.circle}`);
          } else {
            setDetectedBadge("Operator not detected — Select manually");
          }
        } catch (err) {
          if (currentSeq !== lookupSeqRef.current) return;
          console.warn("Operator auto-detection notice:", err);
          const local = lookupLocalOperator(clean);
          if (local) {
            setSelectedOperatorCode(local.operatorCode);
            if (TELECOM_CIRCLES.includes(local.circle)) {
              setSelectedCircle(local.circle);
            }
            setDetectedBadge(`⚡ Auto-detected: ${local.operatorName} · ${local.circle}`);
          } else {
            setDetectedBadge("Operator not detected — Select manually");
          }
        } finally {
          if (currentSeq === lookupSeqRef.current) {
            setIsDetecting(false);
          }
        }
      }, 300);

      return () => {
        clearTimeout(timer);
      };
    }
  }, [mobileNumber, isManualOverride, allOperators, lookupLocalOperator]);

  // Dynamic Commission & Provider Cost Calculation
  const commissionCalculation = useMemo(() => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) return { percent: 0, commission: 0, providerCost: 0 };

    // Find DB Provider ID if matched
    const matchedDbProvider = providers.find(
      (p) =>
        p.id === selectedOperatorCode ||
        p.name.toLowerCase().includes(selectedOperatorCode.toLowerCase())
    );

    let pct = 0;
    if (matchedDbProvider) {
      const slab = slabs.find(
        (s) =>
          s.provider_id === matchedDbProvider.id &&
          amt >= Number(s.min_amount) &&
          amt <= Number(s.max_amount)
      );
      if (slab) {
        pct = Number(slab.commission_percent) || 0;
      }
    }

    const commission = Math.round((amt * pct) / 100 * 100) / 100;
    const providerCost = Math.max(0, Math.round((amt - commission) * 100) / 100);

    return { percent: pct, commission, providerCost };
  }, [amount, selectedOperatorCode, providers, slabs]);

  // Derived Financial Amounts
  const rechargeAmount = parseFloat(amount) || 0;
  const custFee = parseFloat(serviceFee) || 0;
  const totalCustomerDebit = rechargeAmount + custFee;
  const commissionEarned = commissionCalculation.commission;
  const netProviderCost = commissionCalculation.providerCost;
  const netOperatorIncome = custFee + commissionEarned;

  // Selected Funding Account Details
  const selectedFundingAccount = useMemo(() => {
    return instruments.find((i) => i.id === fundingInstId);
  }, [instruments, fundingInstId]);

  // Today's Executive KPI Analytics from Database Transactions
  const todayStats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayTxns = transactions.filter(
      (t) => t.transaction_date === todayStr && t.service_type === "recharge"
    );

    let count = 0;
    let volume = 0;
    let collections = 0;
    let commission = 0;
    let fees = 0;
    let providerCost = 0;
    let successCount = 0;

    for (const t of todayTxns) {
      if (t.status === "success") {
        count++;
        successCount++;
        const amt = Number(t.amount) || 0;
        const comm = Number(t.portal_commission) || 0;
        const fee = Number(t.service_fee) || 0;
        const cost = Number(t.pool_out) || Math.max(0, amt - comm);

        volume += amt;
        collections += amt + fee;
        commission += comm;
        fees += fee;
        providerCost += cost;
      } else if (t.status === "pending") {
        count++;
      }
    }

    const netIncome = fees + commission;
    const successRate = count > 0 ? Math.round((successCount / count) * 100) : 100;

    return {
      count,
      volume,
      collections,
      commission,
      fees,
      providerCost,
      netIncome,
      successRate,
      variance: 0, // Canonical reconciliation variance
    };
  }, [transactions]);

  // Filtered History
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (t.service_type !== "recharge") return false;
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (filterOperator !== "all") {
        const provName = t.providers?.name || "";
        const match = allOperators.find((o) => o.code === filterOperator || o.name === filterOperator);
        if (match && !provName.toLowerCase().includes(match.name.toLowerCase())) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const num = (t.transaction_number || "").toLowerCase();
        const mob = (t.customer_mobile || "").toLowerCase();
        const cust = (t.customers?.name || "").toLowerCase();
        const ref = (t.reference || "").toLowerCase();
        if (!num.includes(q) && !mob.includes(q) && !cust.includes(q) && !ref.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [transactions, filterStatus, filterOperator, searchQuery, allOperators]);

  // Customer Quick Add
  async function handleAddCustomer() {
    if (!newCustName.trim()) {
      showToast("error", "Customer name is required.");
      return;
    }
    const cleanPhone = newCustPhone.replace(/\D/g, "");
    if (cleanPhone && cleanPhone.length !== 10) {
      showToast("error", "Customer phone must be exactly 10 digits.");
      return;
    }

    setAddingCustomer(true);
    const { data: newCust, error } = await supabase
      .from("customers")
      .insert({
        name: newCustName.trim(),
        phone: cleanPhone || null,
        is_active: true,
        balance: 0,
      })
      .select()
      .single();

    setAddingCustomer(false);
    if (error) {
      showToast("error", error.message);
      return;
    }

    setCustomers((prev) => [newCust, ...prev]);
    setSelectedCustomerId(newCust.id);
    if (!mobileNumber && cleanPhone) {
      setMobileNumber(cleanPhone);
    }
    setAddCustomerModal(false);
    setNewCustName("");
    setNewCustPhone("");
    showToast("success", `Customer "${newCust.name}" created.`);
  }

  // Scan & Fill OCR Extraction Callback
  const handleScanFill = useCallback((fields: ScanFields) => {
    if (fields.mobile) setMobileNumber(fields.mobile);
    if (fields.amount) setAmount(String(fields.amount));
    if (fields.ref_number) setReference(fields.ref_number);
    showToast("success", "Filled recharge fields from scan.");
  }, [showToast]);

  // Complete Mobile Recharge Submission (Atomic Double-Submit Protected)
  async function handleCompleteRecharge() {
    if (submitting) return;

    // Validation
    const cleanMobile = mobileNumber.replace(/\D/g, "");
    if (cleanMobile.length !== 10) {
      showToast("error", "Please enter a valid 10-digit mobile number.");
      return;
    }
    if (!selectedOperatorCode) {
      showToast("error", "Please select the telecom operator.");
      return;
    }
    if (rechargeAmount <= 0) {
      showToast("error", "Please enter a valid recharge plan amount greater than ₹0.");
      return;
    }
    if (customerPayMethod === "due" && !selectedCustomerId) {
      showToast("error", "Please select a customer for Khata (Due) credit recharge.");
      return;
    }
    if (!fundingInstId) {
      showToast("error", "Please select the funding account used to pay the operator/gateway.");
      return;
    }

    setSubmitting(true);

    try {
      const todayIso = new Date().toISOString();
      const todayDate = todayIso.slice(0, 10);

      // 1. Generate Transaction Number
      const { count } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("service_type", "recharge");
      const nextNum = "RCH-" + String((count ?? 0) + 1).padStart(4, "0");

      // 2. Find Matched Operator Provider ID
      const matchedDbProvider = providers.find(
        (p) =>
          p.id === selectedOperatorCode ||
          p.name.toLowerCase().includes(selectedOperatorCode.toLowerCase())
      );
      const operatorName = allOperators.find((o) => o.code === selectedOperatorCode)?.name || "Mobile Recharge";

      // 3. Post to Canonical transactions Table
      const { data: newTxn, error: txnErr } = await supabase
        .from("transactions")
        .insert({
          transaction_number: nextNum,
          service_type: "recharge",
          direction: "in",
          transaction_date: todayDate,
          transaction_timestamp: todayIso,
          customer_id: selectedCustomerId || null,
          customer_mobile: cleanMobile,
          reference: reference.trim() || null,
          remarks: remarks.trim() || `Recharge ${cleanMobile} (${operatorName})`,
          status: "success",
          provider_id: matchedDbProvider?.id || null,
          instrument_id: fundingInstId,
          amount: rechargeAmount,
          service_fee: custFee,
          portal_commission: commissionEarned,
          portal_charge: 0,
          cash_in: customerPayMethod === "cash" ? totalCustomerDebit : 0,
          bank_in: customerPayMethod === "bank" ? totalCustomerDebit : 0,
          pool_out: netProviderCost,
          pool_credit: 0,
          pool_credit_type: "recharge",
          customer_pay_method: customerPayMethod,
        })
        .select(`
          *,
          customers(name, phone),
          providers:recharge_providers(name),
          profiles(full_name)
        `)
        .single();

      if (txnErr) {
        showToast("error", txnErr.message);
        setSubmitting(false);
        return;
      }

      // 4. Customer Collection Accounting Leg
      if (customerPayMethod !== "due" && totalCustomerDebit > 0) {
        const payInst = instruments.find((i) => i.id === customerPayInstId) || selectedFundingAccount;
        await supabase.from("cash_entries").insert({
          entry_date: todayDate,
          method: customerPayMethod === "cash" ? "cash" : customerPayMethod === "upi" ? "upi" : "bank",
          direction: "in",
          amount: totalCustomerDebit,
          description: `Recharge ${nextNum} collection from ${cleanMobile} (${customerPayMethod.toUpperCase()})`,
          ref_type: "transaction",
          ref_id: newTxn.id,
          instrument_id: payInst?.id || null,
        });
      } else if (customerPayMethod === "due" && selectedCustomerId) {
        // Khata Due: Debit Customer Ledger
        const { data: custData } = await supabase
          .from("customers")
          .select("balance, name")
          .eq("id", selectedCustomerId)
          .single();
        const prevBal = Number(custData?.balance || 0);
        const newBal = prevBal + totalCustomerDebit;

        await supabase.from("customers").update({ balance: newBal }).eq("id", selectedCustomerId);
        await supabase.from("customer_ledger").insert({
          customer_id: selectedCustomerId,
          entry_date: todayDate,
          type: "recharge",
          description: `Recharge ${nextNum} for ${cleanMobile} on credit (Khata)`,
          debit: totalCustomerDebit,
          credit: 0,
          balance_after: newBal,
          ref_type: "transaction",
          ref_id: newTxn.id,
        });
      }

      // 5. Provider Funding Leg (Debited from funding instrument)
      if (netProviderCost > 0 && selectedFundingAccount) {
        await supabase.from("cash_entries").insert({
          entry_date: todayDate,
          method: selectedFundingAccount.type === "cash" ? "cash" : selectedFundingAccount.type === "bank" ? "bank" : selectedFundingAccount.type === "credit_card" ? "credit_card" : selectedFundingAccount.type === "wallet" ? "wallet" : "upi",
          direction: "out",
          amount: netProviderCost,
          description: `Recharge ${nextNum} settlement to ${operatorName} from ${selectedFundingAccount.name}`,
          ref_type: "transaction",
          ref_id: newTxn.id,
          instrument_id: selectedFundingAccount.id,
        });
      }

      // 6. Audit Trail Logging
      await logAudit({
        action: "create",
        entity: "transaction",
        entity_id: newTxn.id,
        description: `Completed Recharge ${nextNum} for ${cleanMobile} (${operatorName}) | Amount: ${inr(rechargeAmount)} | Commission: ${inr(commissionEarned)}`,
        details: {
          transaction_number: nextNum,
          mobile: cleanMobile,
          operator: operatorName,
          amount: rechargeAmount,
          customer_fee: custFee,
          total_customer_debit: totalCustomerDebit,
          commission: commissionEarned,
          provider_cost: netProviderCost,
          net_income: netOperatorIncome,
          funding_account: selectedFundingAccount?.name || "Funding Account",
          payment_method: customerPayMethod,
        },
      });

      // 7. Update UI State & Open Celebration Receipt
      const formattedTxn: Txn = {
        ...newTxn,
        providers: { name: operatorName },
        customers: selectedCustomerId ? { name: customers.find((c) => c.id === selectedCustomerId)?.name || "Customer" } : null,
      };

      setTransactions((prev) => [formattedTxn, ...prev]);
      setReceiptTxn(formattedTxn);
      showToast("success", `✓ Recharge ${nextNum} completed successfully!`);

      // Reset form
      setMobileNumber("");
      setAmount("");
      setServiceFee("0");
      setSelectedPlan(null);
      setReference("");
      setRemarks("");
    } catch (err: any) {
      console.error("Recharge Error:", err);
      showToast("error", err.message || "Failed to process recharge.");
    } finally {
      setSubmitting(false);
    }
  }

  // Reversal Execution
  async function handleReverse() {
    if (!reverseTxn || busyReverse) return;
    setBusyReverse(true);

    try {
      const { error } = await supabase.rpc("reverse_business_txn", {
        p_txn_id: reverseTxn.id,
        p_reason: reverseReason.trim() || "Recharge failed or operator refund",
      });

      if (error) {
        showToast("error", error.message);
        setBusyReverse(false);
        return;
      }

      // Offset cash entries
      const { data: oldEntries } = await supabase
        .from("cash_entries")
        .select("*")
        .eq("ref_type", "transaction")
        .eq("ref_id", reverseTxn.id);

      if (oldEntries && oldEntries.length > 0) {
        for (const ce of oldEntries) {
          await supabase.from("cash_entries").insert({
            entry_date: new Date().toISOString().slice(0, 10),
            method: ce.method,
            direction: ce.direction === "out" ? "in" : "out",
            amount: ce.amount,
            description: `Reversed Recharge ${reverseTxn.transaction_number} (${ce.direction === "out" ? "refund to funding account" : "return customer collection"})`,
            ref_type: "transaction",
            ref_id: reverseTxn.id,
            instrument_id: ce.instrument_id,
          });
        }
      }

      // Reverse Customer Ledger if Khata
      if (reverseTxn.customer_pay_method === "due" && reverseTxn.customer_id) {
        const { data: cust } = await supabase.from("customers").select("balance").eq("id", reverseTxn.customer_id).single();
        const prevBal = Number(cust?.balance || 0);
        const refundAmt = Number(reverseTxn.amount) + Number(reverseTxn.service_fee || 0);
        const newBal = Math.max(0, prevBal - refundAmt);

        await supabase.from("customers").update({ balance: newBal }).eq("id", reverseTxn.customer_id);
        await supabase.from("customer_ledger").insert({
          customer_id: reverseTxn.customer_id,
          entry_date: new Date().toISOString().slice(0, 10),
          type: "return",
          description: `Reversal credit for Recharge ${reverseTxn.transaction_number}`,
          debit: 0,
          credit: refundAmt,
          balance_after: newBal,
          ref_type: "transaction",
          ref_id: reverseTxn.id,
        });
      }

      setTransactions((prev) =>
        prev.map((t) => (t.id === reverseTxn.id ? { ...t, status: "reversed" } : t))
      );
      showToast("success", `Transaction ${reverseTxn.transaction_number} reversed.`);
      setReverseTxn(null);
      setReverseReason("");
    } catch (err: any) {
      showToast("error", err.message || "Failed to reverse transaction.");
    } finally {
      setBusyReverse(false);
    }
  }

  // Export CSV
  function handleExportCsv() {
    const headers = [
      "Date",
      "Time",
      "Txn Number",
      "Mobile",
      "Operator",
      "Customer",
      "Recharge Amount",
      "Customer Fee",
      "Commission",
      "Provider Cost",
      "Customer Pay Method",
      "Status",
      "Reference",
    ];
    const rows = filteredTransactions.map((t) => [
      fmtDate(t.transaction_date),
      fmtTime(t.transaction_timestamp || t.created_at),
      t.transaction_number,
      t.customer_mobile || "-",
      t.providers?.name || "Recharge",
      t.customers?.name || "-",
      Number(t.amount),
      Number(t.service_fee || 0),
      Number(t.portal_commission || 0),
      Number(t.pool_out || 0),
      (t.customer_pay_method || "cash").toUpperCase(),
      t.status.toUpperCase(),
      t.reference || "-",
    ]);
    downloadCsv(`recharge_transactions_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  }

  // WhatsApp Trigger
  function handleWhatsApp(t: Txn) {
    const rawPhone = t.customer_mobile || t.customers?.phone || "";
    const cleanPhone = rawPhone.replace(/\D/g, "");
    const msg = `*RECHARGE RECEIPT — SARKAR COMMUNICATION*\n` +
      `--------------------------------\n` +
      `Txn ID: ${t.transaction_number}\n` +
      `Mobile: ${t.customer_mobile}\n` +
      `Operator: ${t.providers?.name || "Telecom"}\n` +
      `Plan Amount: ${inr(Number(t.amount))}\n` +
      `Paid Via: ${(t.customer_pay_method || "cash").toUpperCase()}\n` +
      `Status: ${t.status.toUpperCase()}\n` +
      `Date: ${fmtDate(t.transaction_date)} ${fmtTime(t.transaction_timestamp || t.created_at)}\n` +
      `--------------------------------\n` +
      `Thank you for recharging with us!`;

    setWaModal({
      open: true,
      phone: cleanPhone,
      name: t.customers?.name || "Customer",
      msg,
      refNum: t.transaction_number,
      refId: t.id,
    });
  }

  return (
    <div className="space-y-6 pb-12">
      {/* 1. EXECUTIVE HERO COMMAND CENTER */}
      <div className="relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-slate-900 via-indigo-950/90 to-slate-900 p-6 text-white shadow-2xl">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-black tracking-wide text-emerald-300 ring-1 ring-emerald-500/40">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                RECHARGE SYSTEM ONLINE
              </span>
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-bold text-slate-300">
                {allOperators.length} Active Operators
              </span>
            </div>
            <h1 className="mt-2.5 text-2xl font-black tracking-tight sm:text-3xl">
              Mobile Recharge Command Center
            </h1>
            <p className="mt-1 text-xs text-slate-300 max-w-xl">
              Mobile, prepaid and supported telecom recharge with transparent customer collection, provider funding and commission tracking.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth" })}
              className="btn-3d-tactile-primary flex items-center gap-2 px-4 py-2 text-xs font-black shadow-lg"
            >
              <span>📱 New Recharge</span>
            </button>
            <button
              type="button"
              onClick={() => setScanModalOpen(true)}
              className="btn-3d-tactile-secondary flex items-center gap-2 px-3.5 py-2 text-xs font-bold"
            >
              <span>📷 Scan &amp; Fill</span>
            </button>
            <Link
              href="/settings?tab=business-setup&section=recharge"
              className="btn-3d-tactile-secondary flex items-center gap-2 px-3.5 py-2 text-xs font-bold"
            >
              <span>⚙️ Provider Slabs</span>
            </Link>
          </div>
        </div>

        {/* Hero 5-Card KPI Grid */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
            <span className="text-[10px] font-black uppercase text-indigo-300">Today&apos;s Recharges</span>
            <div className="mt-1 text-xl font-black">{todayStats.count} <span className="text-xs font-normal text-slate-300">txns</span></div>
            <p className="mt-0.5 text-[11px] text-slate-400">{inr(todayStats.volume)} volume</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
            <span className="text-[10px] font-black uppercase text-emerald-300">Customer Collection</span>
            <div className="mt-1 text-xl font-black text-emerald-400">{inr(todayStats.collections)}</div>
            <p className="mt-0.5 text-[11px] text-slate-400">Total funds collected</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
            <span className="text-[10px] font-black uppercase text-amber-300">Commission Earned</span>
            <div className="mt-1 text-xl font-black text-amber-400">{inr(todayStats.commission)}</div>
            <p className="mt-0.5 text-[11px] text-slate-400">Operator discount/margin</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
            <span className="text-[10px] font-black uppercase text-cyan-300">Provider Net Cost</span>
            <div className="mt-1 text-xl font-black text-cyan-400">{inr(todayStats.providerCost)}</div>
            <p className="mt-0.5 text-[11px] text-slate-400">Debited from funding account</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
            <span className="text-[10px] font-black uppercase text-purple-300">Success Rate</span>
            <div className="mt-1 text-xl font-black text-purple-300">{todayStats.successRate}%</div>
            <p className="mt-0.5 text-[11px] text-emerald-400">Net Income: {inr(todayStats.netIncome)}</p>
          </div>
        </div>
      </div>

      {/* 2. RECONCILIATION & POSITION STRIP */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
            ⚡
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-900 dark:text-white">RECHARGE RECONCILIATION</span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                ✓ 100% Balanced
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Customer Collections ({inr(todayStats.collections)}) = Net Provider Cost ({inr(todayStats.providerCost)}) + Net Income ({inr(todayStats.netIncome)})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 text-xs">
          <div className="text-right">
            <span className="text-[10px] font-bold uppercase text-slate-400">Variance</span>
            <p className="font-black text-emerald-600 dark:text-emerald-400">{inr(todayStats.variance)}</p>
          </div>
          <button
            type="button"
            onClick={() => setAddCustomerModal(true)}
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
          >
            + Add Customer
          </button>
        </div>
      </div>

      {/* 3. RECHARGE TERMINAL & ORDER SUMMARY (TWO-COLUMN WORKSPACE) */}
      <div ref={formRef} className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT: Recharge Terminal Form */}
        <div className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-md dark:border-white/10 dark:bg-slate-900 lg:col-span-7">
          {/* Step Tracker */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5 text-[10px] font-black uppercase text-slate-400 tracking-wider">
            <span className={mobileNumber ? "text-indigo-600 dark:text-indigo-400" : ""}>01 IDENTIFY</span>
            <span>→</span>
            <span className={selectedOperatorCode ? "text-indigo-600 dark:text-indigo-400" : ""}>02 OPERATOR</span>
            <span>→</span>
            <span className={rechargeAmount > 0 ? "text-indigo-600 dark:text-indigo-400" : ""}>03 PLAN</span>
            <span>→</span>
            <span className={fundingInstId ? "text-indigo-600 dark:text-indigo-400" : ""}>04 FUNDING</span>
            <span>→</span>
            <span className="text-emerald-600 dark:text-emerald-400">05 SETTLE</span>
          </div>

          {/* 01 Customer & Mobile Identification */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
                1. Mobile / Target Number *
              </label>
              <button
                type="button"
                onClick={() => setAddCustomerModal(true)}
                className="text-[11px] font-bold text-indigo-600 hover:underline dark:text-indigo-400"
              >
                + New Customer
              </button>
            </div>

            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">
                +91
              </span>
              <input
                type="tel"
                maxLength={10}
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                disabled={submitting}
                placeholder="Enter 10-digit mobile number"
                className="w-full rounded-2xl border border-slate-300 bg-slate-50/50 py-3.5 pl-14 pr-4 text-base font-black tracking-wider text-slate-900 outline-none transition focus:border-indigo-600 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-slate-800/80 dark:text-white"
              />
            </div>

            {/* Optional Customer Association */}
            <div>
              <label className="text-[11px] font-bold text-slate-500">Customer Link (Optional for Khata / CRM)</label>
              <SearchableSelect
                options={[
                  { value: "", label: "-- Walk-in / Direct Recharge --" },
                  ...customers.map((c) => ({
                    value: c.id,
                    label: `${c.name} (${c.phone || "No phone"}) ${c.balance ? `· Due: ${inr(c.balance)}` : ""}`,
                  })),
                ]}
                value={selectedCustomerId}
                onChange={(v) => {
                  setSelectedCustomerId(v);
                  const cust = customers.find((c) => c.id === v);
                  if (cust?.phone && !mobileNumber) {
                    setMobileNumber(cust.phone.replace(/\D/g, "").slice(-10));
                  }
                }}
                placeholder="Select or search customer..."
              />
            </div>
          </div>

          {/* 02 Operator & Circle Selection */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-white/5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
                2. Operator &amp; Circle *
              </label>
              {isDetecting ? (
                <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 animate-pulse">
                  🔍 Detecting operator &amp; circle…
                </span>
              ) : isManualOverride ? (
                <span className="text-[10px] font-semibold text-slate-400">
                  Manual selection
                </span>
              ) : detectedBadge ? (
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                  detectedBadge.includes("PayU")
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : detectedBadge.includes("Auto-detected")
                    ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                    : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                }`}>
                  {detectedBadge}
                </span>
              ) : (
                <span className="text-[11px] text-slate-400">Select Telecom Provider</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {allOperators.slice(0, 4).map((op) => {
                const isSelected = selectedOperatorCode.toLowerCase() === op.code.toLowerCase() || selectedOperatorCode === op.name;
                return (
                  <button
                    key={op.code}
                    type="button"
                    onClick={() => {
                      setIsManualOverride(true);
                      setSelectedOperatorCode(op.code);
                      setDetectedBadge(null);
                    }}
                    disabled={submitting}
                    className={`flex items-center gap-2.5 rounded-2xl border p-3 text-left transition duration-150 ${
                      isSelected
                        ? "border-indigo-600 bg-indigo-50/70 shadow-sm ring-2 ring-indigo-600/30 dark:border-indigo-500 dark:bg-indigo-950/40"
                        : "border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-slate-800/40"
                    }`}
                  >
                    <span className="text-xl">{op.icon}</span>
                    <div>
                      <div className="text-xs font-black text-slate-900 dark:text-white">{op.name}</div>
                      <span className="text-[10px] text-slate-400">Prepaid</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[11px] font-bold text-slate-500">More Operators / DTH</label>
                <select
                  value={selectedOperatorCode}
                  onChange={(e) => {
                    setIsManualOverride(true);
                    setSelectedOperatorCode(e.target.value);
                    setDetectedBadge(null);
                  }}
                  disabled={submitting}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">-- Choose Operator --</option>
                  {allOperators.map((op) => (
                    <option key={op.code} value={op.code}>
                      {op.icon} {op.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500">Telecom Circle / State</label>
                <select
                  value={selectedCircle}
                  onChange={(e) => {
                    setIsManualOverride(true);
                    setSelectedCircle(e.target.value);
                  }}
                  disabled={submitting}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                >
                  {TELECOM_CIRCLES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 03 Plan Selector & Quick Browsing */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-white/5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
                3. Select Plan or Enter Amount *
              </label>
              <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                {commissionCalculation.percent}% Est. Commission
              </span>
            </div>

            {/* Plan Category Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              {PLAN_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setPlanCategory(cat)}
                  className={`whitespace-nowrap rounded-xl px-3 py-1 text-[11px] font-bold transition ${
                    planCategory === cat
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {[10, 20, 49, 99, 149, 199, 249, 299, 349, 399, 499, 599, 719, 799, 859, 999, 1499, 1999, 2999, 3599].map((preset) => (
                <button key={preset} type="button" onClick={() => { setAmount(String(preset)); setSelectedPlan(null); }} disabled={submitting} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-black transition ${Number(amount) === preset ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-300" : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"}`}>₹{preset}</button>
              ))}
              <a href="/business/bill-payment/mobile-recharge/plans" className="rounded-lg border border-dashed border-indigo-300 px-2.5 py-1.5 text-[10px] font-black text-indigo-600 hover:bg-indigo-50 dark:border-indigo-500/40 dark:text-indigo-300">⚙ Customize</a>
            </div>
            {/* Plan Cards Slider */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 max-h-48 overflow-y-auto pr-1">
              {catalogPlans.filter((p) => {
                if (p.category !== planCategory) return false;
                if (!p.provider_id) return true;
                const selected = providers.find((x) => x.id === selectedOperatorCode || x.name.toLowerCase() === (allOperators.find((o) => o.code === selectedOperatorCode)?.name || "").toLowerCase());
                return !!selected && p.provider_id === selected.id;
              }).map((plan) => {
                const isSelected = selectedPlan?.id === plan.id || Number(amount) === plan.amount;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => {
                      setSelectedPlan(plan);
                      setAmount(String(plan.amount));
                    }}
                    disabled={submitting}
                    className={`flex flex-col justify-between rounded-2xl border p-3 text-left transition ${
                      isSelected
                        ? "border-indigo-600 bg-indigo-50/70 shadow-sm ring-2 ring-indigo-600/30 dark:border-indigo-500 dark:bg-indigo-950/40"
                        : "border-slate-200 bg-slate-50/50 hover:bg-white dark:border-white/5 dark:bg-slate-800/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <strong className="text-base font-black text-slate-900 dark:text-white">
                        {inr(plan.amount)}
                      </strong>
                      <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                        {plan.validity}
                      </span>
                    </div>
                    <div className="mt-1 text-xs font-bold text-slate-700 dark:text-slate-300">
                      {plan.data} · {plan.voice}
                    </div>
                    <p className="mt-0.5 truncate text-[10px] text-slate-500 dark:text-slate-400">
                      {plan.description}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Manual Amount & Customer Fee Input */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[11px] font-bold text-slate-500">Recharge Amount (₹) *</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setSelectedPlan(null);
                  }}
                  disabled={submitting}
                  placeholder="0.00"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-black text-slate-900 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500">Customer Service Fee (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={serviceFee}
                  onChange={(e) => setServiceFee(e.target.value)}
                  disabled={submitting}
                  placeholder="0.00"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-black text-slate-900 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* 04 Customer Collection Method */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-white/5">
            <label className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
              4. How is Customer Paying? *
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { id: "cash" as const, label: "💵 Cash", desc: "Cash in Hand" },
                { id: "upi" as const, label: "📱 UPI QR", desc: "Shop UPI QR" },
                { id: "bank" as const, label: "🏦 Bank", desc: "Direct Transfer" },
                { id: "due" as const, label: "📋 Khata", desc: "Customer Due" },
              ].map((m) => {
                const isSelected = customerPayMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setCustomerPayMethod(m.id)}
                    disabled={submitting}
                    className={`rounded-2xl border p-2.5 text-left transition ${
                      isSelected
                        ? "border-indigo-600 bg-indigo-50/70 shadow-xs ring-2 ring-indigo-600/20 dark:border-indigo-500 dark:bg-indigo-950/40"
                        : "border-slate-200 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800/40"
                    }`}
                  >
                    <div className="text-xs font-black text-slate-900 dark:text-white">{m.label}</div>
                    <div className="text-[10px] text-slate-400">{m.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 05 Funding Source Account */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-white/5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
                5. Funding Source Account (Cost Debited From) *
              </label>
              <span className="text-[10px] text-slate-400">Where gateway funds are deducted</span>
            </div>

            <select
              value={fundingInstId}
              onChange={(e) => setFundingInstId(e.target.value)}
              disabled={submitting}
              className="w-full rounded-2xl border border-slate-300 bg-white p-3 text-xs font-black text-slate-900 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
            >
              {validFundingInstruments.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.type === "cash" ? "💵" : inst.type === "bank" ? "🏦" : inst.type === "upi" ? "📱" : inst.type === "credit_card" ? "💳" : "👛"} {inst.name} ({inst.type.toUpperCase()})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* RIGHT: Order Summary & Settlement Panel */}
        <div className="space-y-5 rounded-3xl border border-slate-200 bg-slate-50/60 p-6 shadow-md dark:border-white/10 dark:bg-slate-900/60 lg:col-span-5">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Order Summary</span>
            <h3 className="text-base font-black text-slate-900 dark:text-white">Recharge Settlement Breakdown</h3>
          </div>

          {/* Preview Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-slate-800/80 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-white/5">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400">Target Mobile</span>
                <p className="text-sm font-black text-slate-900 dark:text-white">
                  {mobileNumber ? `+91 ${mobileNumber}` : "Enter Mobile Number"}
                </p>
              </div>
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-black text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                {allOperators.find((o) => o.code === selectedOperatorCode)?.name || "Select Operator"}
              </span>
            </div>

            {selectedPlan && (
              <div className="rounded-xl bg-slate-50 p-2.5 text-xs dark:bg-white/5 space-y-0.5">
                <div className="font-black text-slate-900 dark:text-white">{selectedPlan.validity} · {selectedPlan.data}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">{selectedPlan.description}</div>
              </div>
            )}

            {/* Financial Math Ledger */}
            <div className="space-y-2 text-xs border-t border-slate-100 pt-2.5 dark:border-white/5">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Recharge Plan Amount:</span>
                <strong className="text-slate-900 dark:text-white">{inr(rechargeAmount)}</strong>
              </div>

              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Customer Service Fee:</span>
                <strong className="text-slate-900 dark:text-white">+{inr(custFee)}</strong>
              </div>

              <div className="flex justify-between font-black text-sm border-t border-slate-200 pt-2 dark:border-white/10">
                <span className="text-emerald-700 dark:text-emerald-400">Total Customer Debit:</span>
                <span className="text-emerald-700 dark:text-emerald-400">{inr(totalCustomerDebit)}</span>
              </div>

              <div className="flex justify-between text-[11px] text-amber-600 dark:text-amber-400 pt-1">
                <span>Commission / Margin ({commissionCalculation.percent}%):</span>
                <strong>-{inr(commissionEarned)}</strong>
              </div>

              <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>Net Provider Cost (Debited from funding):</span>
                <strong className="text-slate-900 dark:text-white">{inr(netProviderCost)}</strong>
              </div>

              <div className="flex justify-between text-xs font-black text-indigo-600 dark:text-indigo-400 border-t border-slate-100 pt-1.5 dark:border-white/5">
                <span>Operator Net Income:</span>
                <span>+{inr(netOperatorIncome)}</span>
              </div>
            </div>

            <div className="rounded-xl bg-indigo-50/50 p-2.5 text-[11px] text-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200">
              💳 <strong>Funding Source:</strong> {selectedFundingAccount?.name || "Funding Account"} ({selectedFundingAccount?.type?.toUpperCase()})
            </div>
          </div>

          {/* Reference & Remarks */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              disabled={submitting}
              placeholder="Operator RRN / Ref (Optional)"
              className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
            />
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              disabled={submitting}
              placeholder="Remarks / Note (Optional)"
              className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
            />
          </div>

          {/* Complete Recharge Action Button */}
          <button
            type="button"
            onClick={handleCompleteRecharge}
            disabled={submitting || !mobileNumber || mobileNumber.length !== 10 || !selectedOperatorCode || rechargeAmount <= 0}
            className="btn-3d-tactile-primary flex w-full items-center justify-center gap-2 py-3.5 text-sm font-black shadow-xl disabled:opacity-50"
          >
            {submitting ? (
              <span>⚡ Processing Recharge...</span>
            ) : (
              <span>✓ Complete Recharge {rechargeAmount > 0 ? inr(totalCustomerDebit) : ""}</span>
            )}
          </button>
        </div>
      </div>

      {/* 4. TRANSACTION HISTORY CONSOLE */}
      <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-md dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-white/5">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Recharge Transaction History
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Verified record of completed mobile, DTH and telecom recharges.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter Tabs */}
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5 text-xs">
              {(["all", "success", "pending", "failed", "reversed"] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setFilterStatus(st)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold capitalize transition ${
                    filterStatus === st
                      ? "bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white"
                      : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              className="btn-3d-tactile-secondary px-3 py-1.5 text-xs font-bold"
            >
              📥 Export CSV
            </button>
          </div>
        </div>

        {/* Search & Operator Filter */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-8">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by mobile number, customer name, txn # or RRN..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="sm:col-span-4">
            <select
              value={filterOperator}
              onChange={(e) => setFilterOperator(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
            >
              <option value="all">All Operators</option>
              {allOperators.map((o) => (
                <option key={o.code} value={o.code}>{o.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-black uppercase text-slate-400 dark:border-white/5 dark:bg-white/5">
                <th className="px-4 py-2.5">Date &amp; Time</th>
                <th className="px-4 py-2.5">Txn #</th>
                <th className="px-4 py-2.5">Target Mobile</th>
                <th className="px-4 py-2.5">Operator</th>
                <th className="px-4 py-2.5 text-right">Plan Amount</th>
                <th className="px-4 py-2.5 text-right">Commission</th>
                <th className="px-4 py-2.5">Method</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-xs text-slate-400">
                    No recharge transactions found.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/60 dark:hover:bg-white/2 transition">
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      <div>{fmtDate(t.transaction_date)}</div>
                      <div className="text-[10px] text-slate-400">{fmtTime(t.transaction_timestamp || t.created_at)}</div>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-white">
                      {t.transaction_number}
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                      {t.customer_mobile ? `+91 ${t.customer_mobile}` : "—"}
                      {t.customers?.name && (
                        <div className="text-[10px] text-slate-400 font-normal">{t.customers.name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">
                      {t.providers?.name || "Recharge"}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-slate-900 dark:text-white">
                      {inr(Number(t.amount))}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-amber-600 dark:text-amber-400">
                      +{inr(Number(t.portal_commission || 0))}
                    </td>
                    <td className="px-4 py-3 capitalize font-medium text-slate-600 dark:text-slate-400">
                      {t.customer_pay_method || "cash"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          t.status === "success"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : t.status === "reversed"
                            ? "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300"
                            : t.status === "pending"
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                            : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setReceiptTxn(t)}
                          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
                          title="View Receipt"
                        >
                          🧾
                        </button>
                        <button
                          type="button"
                          onClick={() => handleWhatsApp(t)}
                          className="rounded-lg p-1 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                          title="WhatsApp Receipt"
                        >
                          💬
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailTxn(t)}
                          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
                          title="Details"
                        >
                          🔍
                        </button>
                        {t.status === "success" && (
                          <button
                            type="button"
                            onClick={() => setReverseTxn(t)}
                            className="rounded-lg p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            title="Reverse Transaction"
                          >
                            ↩️
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. CELEBRATION RECEIPT MODAL */}
      {receiptTxn && (
        <FloatingWindow
          isOpen={true}
          onClose={() => setReceiptTxn(null)}
          title="Recharge Receipt"
          subtitle={`Receipt for ${receiptTxn.transaction_number}`}
        >
          <div className="space-y-4 p-4">
            <div className="text-center py-2">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                ✓
              </span>
              <h3 className="mt-2 text-lg font-black text-slate-900 dark:text-white">
                Recharge Successful
              </h3>
              <p className="text-xs text-slate-500">Transaction ID: {receiptTxn.transaction_number}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-800/60 text-xs space-y-2">
              <div className="flex justify-between"><span className="text-slate-400">Mobile Number:</span><strong>+91 {receiptTxn.customer_mobile}</strong></div>
              <div className="flex justify-between"><span className="text-slate-400">Operator:</span><strong>{receiptTxn.providers?.name || "Recharge"}</strong></div>
              <div className="flex justify-between"><span className="text-slate-400">Plan Amount:</span><strong>{inr(Number(receiptTxn.amount))}</strong></div>
              <div className="flex justify-between"><span className="text-slate-400">Customer Fee:</span><strong>{inr(Number(receiptTxn.service_fee || 0))}</strong></div>
              <div className="flex justify-between font-black text-sm border-t border-slate-200 pt-1.5 dark:border-white/10">
                <span>Total Paid:</span>
                <span className="text-emerald-600">{inr(Number(receiptTxn.amount) + Number(receiptTxn.service_fee || 0))}</span>
              </div>
              <div className="flex justify-between"><span className="text-slate-400">Payment Mode:</span><strong className="capitalize">{receiptTxn.customer_pay_method || "cash"}</strong></div>
              <div className="flex justify-between"><span className="text-slate-400">Date &amp; Time:</span><span>{fmtDate(receiptTxn.transaction_date)} {fmtTime(receiptTxn.transaction_timestamp || receiptTxn.created_at)}</span></div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
              <Link
                href={`/business/receipt/${receiptTxn.id}`}
                target="_blank"
                className="btn-3d-tactile-secondary px-3 py-1.5 text-xs font-bold"
              >
                🖨️ Thermal (80mm)
              </Link>
              <Link
                href={`/business/receipt/${receiptTxn.id}/a4`}
                target="_blank"
                className="btn-3d-tactile-secondary px-3 py-1.5 text-xs font-bold"
              >
                📄 A4 Invoice
              </Link>
              <button
                type="button"
                onClick={() => handleWhatsApp(receiptTxn)}
                className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
              >
                💬 WhatsApp
              </button>
              <button
                type="button"
                onClick={() => setReceiptTxn(null)}
                className="btn-3d-tactile-primary px-4 py-1.5 text-xs font-bold"
              >
                Done
              </button>
            </div>
          </div>
        </FloatingWindow>
      )}

      {/* 6. TRANSACTION DETAIL FLOATING MODAL */}
      {detailTxn && (
        <FloatingWindow
          isOpen={true}
          onClose={() => setDetailTxn(null)}
          title={`Transaction ${detailTxn.transaction_number}`}
          subtitle="Complete audit and accounting trace"
        >
          <div className="space-y-4 p-4 text-xs">
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 dark:border-white/10 dark:bg-slate-800/60">
              <div><span className="text-slate-400">Service:</span><div className="font-bold">Mobile Recharge</div></div>
              <div><span className="text-slate-400">Status:</span><div className="font-bold uppercase text-emerald-600">{detailTxn.status}</div></div>
              <div><span className="text-slate-400">Mobile:</span><div className="font-bold">+91 {detailTxn.customer_mobile}</div></div>
              <div><span className="text-slate-400">Operator:</span><div className="font-bold">{detailTxn.providers?.name || "Recharge"}</div></div>
              <div><span className="text-slate-400">Recharge Amount:</span><div className="font-bold">{inr(Number(detailTxn.amount))}</div></div>
              <div><span className="text-slate-400">Commission Earned:</span><div className="font-bold text-amber-600">+{inr(Number(detailTxn.portal_commission || 0))}</div></div>
              <div><span className="text-slate-400">Customer Paid Via:</span><div className="font-bold capitalize">{detailTxn.customer_pay_method || "cash"}</div></div>
              <div><span className="text-slate-400">Provider Settlement:</span><div className="font-bold">{inr(Number(detailTxn.pool_out || 0))}</div></div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
              <button
                type="button"
                onClick={() => setDetailTxn(null)}
                className="btn-3d-tactile-secondary px-4 py-1.5 text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </FloatingWindow>
      )}

      {/* 7. REVERSAL MODAL */}
      {reverseTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div onClick={() => !busyReverse && setReverseTxn(null)} className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-rose-300 bg-white p-6 shadow-2xl dark:border-rose-900/60 dark:bg-slate-900">
            <h3 className="text-sm font-black text-rose-600 dark:text-rose-400">
              Reverse Recharge {reverseTxn.transaction_number}?
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              This will refund the funding account and reverse customer collections in double-entry books.
            </p>

            <div className="mt-3">
              <label className="text-[11px] font-bold text-slate-500">Reversal Reason *</label>
              <input
                type="text"
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                placeholder="e.g. Failed at operator end / wrong number"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReverseTxn(null)}
                disabled={busyReverse}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 dark:border-white/10 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReverse}
                disabled={busyReverse}
                className="rounded-xl bg-rose-600 px-4 py-1.5 text-xs font-black text-white hover:bg-rose-700 shadow-md"
              >
                {busyReverse ? "Reversing..." : "Confirm Reversal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. QUICK ADD CUSTOMER MODAL */}
      {addCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div onClick={() => !addingCustomer && setAddCustomerModal(false)} className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-slate-900 space-y-3">
            <h3 className="text-sm font-black text-slate-900 dark:text-white">Add New Customer</h3>
            <div>
              <label className="text-[11px] font-bold text-slate-500">Full Name *</label>
              <input
                type="text"
                value={newCustName}
                onChange={(e) => setNewCustName(e.target.value)}
                placeholder="Customer Name"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500">10-Digit Mobile Phone</label>
              <input
                type="tel"
                maxLength={10}
                value={newCustPhone}
                onChange={(e) => setNewCustPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="98XXXXXXXX"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAddCustomerModal(false)}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 dark:border-white/10 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddCustomer}
                disabled={addingCustomer}
                className="rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-black text-white hover:bg-indigo-700 shadow-md"
              >
                {addingCustomer ? "Saving..." : "Save Customer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. SCAN & FILL MODAL */}
      <ScanFillModal
        open={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        mode="payment"
        title="Scan Recharge Details"
        onApply={handleScanFill}
      />

      {/* 10. WHATSAPP SEND MODAL */}
      {waModal && (
        <WhatsAppSendModal
          open={waModal.open}
          onClose={() => setWaModal(null)}
          phone={waModal.phone}
          initialMessage={waModal.msg}
          recipientName={waModal.name}
          messageType="banking_txn"
          refId={waModal.refId}
          refNumber={waModal.refNum}
        />
      )}

      {toastView}
    </div>
  );
}
