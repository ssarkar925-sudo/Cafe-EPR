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
import WhatsAppSendModal from "@/components/whatsapp/whatsapp-send-modal";
import { getBillerConfig, getFallbackBillerConfig } from "@/lib/bill-payment/biller-metadata";
import type { NormalizedBillResponse, BillerConfig } from "@/lib/bill-payment/types";
import { resolveBillCommission, type BillCommissionConfig, type CommissionResolution } from "@/lib/bill-payment/commission";
import CommissionEditModal from "@/components/business/commission-edit-modal";
import type { CustomerRow, PaymentInstrument, Txn } from "./recharge-workspace";

export type BillerCategory = {
  id: string;
  name: string;
  icon: string;
  idLabel: string;
  idPlaceholder: string;
  exampleId: string;
  defaultCommission: number; // Flat in ₹ or %
  isPercentage?: boolean;
};

export const BILLER_CATEGORIES: BillerCategory[] = [
  { id: "electricity", name: "Electricity", icon: "⚡", idLabel: "Consumer ID / CA Number", idPlaceholder: "Enter 9 to 11 digit Consumer ID", exampleId: "102345678", defaultCommission: 5 },
  { id: "gas", name: "Piped Gas / LPG", icon: "🔥", idLabel: "BP Number / LPG ID", idPlaceholder: "Enter Customer BP No or 17-digit LPG ID", exampleId: "900123456", defaultCommission: 4 },
  { id: "water", name: "Water Supply", icon: "💧", idLabel: "Consumer Connection No", idPlaceholder: "Enter Connection / RR Number", exampleId: "WTR-88231", defaultCommission: 4 },
  { id: "broadband", name: "Broadband & Fiber", icon: "📡", idLabel: "Account No / User ID", idPlaceholder: "Enter Account / Landline / User ID", exampleId: "03324567890", defaultCommission: 6 },
  { id: "dth", name: "DTH & Cable TV", icon: "📺", idLabel: "Subscriber / SmartCard ID", idPlaceholder: "Enter 10-digit Subscriber ID", exampleId: "1023456789", defaultCommission: 5 },
  { id: "fastag", name: "FASTag Recharge", icon: "🚗", idLabel: "Vehicle Reg Number", idPlaceholder: "Enter Vehicle Number (e.g. WB02AX1234)", exampleId: "WB02AX1234", defaultCommission: 3 },
  { id: "insurance", name: "Insurance Premium", icon: "🛡️", idLabel: "Policy Number", idPlaceholder: "Enter Insurance Policy Number", exampleId: "POL-9923841", defaultCommission: 10 },
  { id: "loan", name: "Loan Repayment / EMI", icon: "🏦", idLabel: "Loan Account No (LAN)", idPlaceholder: "Enter Loan Account Number", exampleId: "LAN-4401928", defaultCommission: 10 },
  { id: "landline", name: "Landline Bill", icon: "☎️", idLabel: "Telephone No with STD", idPlaceholder: "Enter Landline Number with STD code", exampleId: "03324567890", defaultCommission: 4 },
  { id: "postpaid", name: "Postpaid Mobile", icon: "📱", idLabel: "10-digit Mobile Number", idPlaceholder: "Enter 10-digit Mobile Number", exampleId: "9830123456", defaultCommission: 4 },
];

export type BillerItem = {
  id: string;
  categoryId: string;
  name: string;
  shortName: string;
  state?: string;
  commission: number; // Flat ₹ or %
  isPercentage?: boolean;
};

export function isUtilityBillTxn(t: Txn): boolean {
  if (!t) return false;
  if (t.service_type === "bill_payment" || t.service_type === "utility_bill" || t.service_type === "utility") {
    return true;
  }
  if (t.service_type === "recharge" || t.service_type === "recharge_due") {
    if ((t as any).pool_credit_type === "utility") return true;
    if ((t.transaction_number || "").startsWith("BIL")) return true;
    const rem = (t.remarks || "").toLowerCase();
    if (
      rem.includes("utility") ||
      rem.includes("bill") ||
      rem.includes("electricity") ||
      rem.includes("wbsedcl") ||
      rem.includes("cesc") ||
      rem.includes("gas") ||
      rem.includes("water") ||
      rem.includes("broadband") ||
      rem.includes("fastag") ||
      rem.includes("insurance") ||
      rem.includes("consumer")
    ) {
      return true;
    }
  }
  return false;
}

export const POPULAR_BILLERS: BillerItem[] = [
  // Electricity
  { id: "wbsedcl", categoryId: "electricity", name: "West Bengal State Electricity (WBSEDCL)", shortName: "WBSEDCL", state: "West Bengal", commission: 5 },
  { id: "cesc", categoryId: "electricity", name: "CESC Limited (Kolkata & Howrah)", shortName: "CESC", state: "West Bengal", commission: 5 },
  { id: "tatapower_dl", categoryId: "electricity", name: "Tata Power Delhi Distribution (TPDDL)", shortName: "Tata Power", state: "Delhi", commission: 5 },
  { id: "bses_rajdhani", categoryId: "electricity", name: "BSES Rajdhani Power Limited", shortName: "BSES Rajdhani", state: "Delhi", commission: 5 },
  { id: "bses_yamuna", categoryId: "electricity", name: "BSES Yamuna Power Limited", shortName: "BSES Yamuna", state: "Delhi", commission: 5 },
  { id: "msedcl", categoryId: "electricity", name: "Maharashtra State Electricity (MSEDCL)", shortName: "Mahavitaran", state: "Maharashtra", commission: 5 },
  { id: "uppcl_urban", categoryId: "electricity", name: "UPPCL Urban Electricity", shortName: "UPPCL Urban", state: "Uttar Pradesh", commission: 5 },
  { id: "uppcl_rural", categoryId: "electricity", name: "UPPCL Rural Electricity", shortName: "UPPCL Rural", state: "Uttar Pradesh", commission: 5 },
  { id: "bescom", categoryId: "electricity", name: "Bangalore Electricity Supply (BESCOM)", shortName: "BESCOM", state: "Karnataka", commission: 5 },
  { id: "tsspdcl", categoryId: "electricity", name: "Southern Power Telangana (TSSPDCL)", shortName: "TSSPDCL", state: "Telangana", commission: 5 },
  { id: "tneb", categoryId: "electricity", name: "Tamil Nadu Electricity Board (TANGEDCO)", shortName: "TNEB", state: "Tamil Nadu", commission: 5 },
  { id: "nbpdcl", categoryId: "electricity", name: "North Bihar Power Distribution (NBPDCL)", shortName: "NBPDCL", state: "Bihar", commission: 5 },
  { id: "sbpdcl", categoryId: "electricity", name: "South Bihar Power Distribution (SBPDCL)", shortName: "SBPDCL", state: "Bihar", commission: 5 },

  // Gas
  { id: "igl", categoryId: "gas", name: "Indraprastha Gas Limited (IGL)", shortName: "IGL", commission: 4 },
  { id: "mgl", categoryId: "gas", name: "Mahanagar Gas Limited (MGL)", shortName: "MGL", commission: 4 },
  { id: "indane_lpg", categoryId: "gas", name: "Indian Oil (Indane LPG)", shortName: "Indane Gas", commission: 4 },
  { id: "hp_gas", categoryId: "gas", name: "HP Gas (Hindustan Petroleum)", shortName: "HP Gas", commission: 4 },
  { id: "bharat_gas", categoryId: "gas", name: "Bharat Gas (BPCL)", shortName: "Bharat Gas", commission: 4 },
  { id: "adani_gas", categoryId: "gas", name: "Adani Total Gas", shortName: "Adani Gas", commission: 4 },

  // Water
  { id: "kmc_water", categoryId: "water", name: "Kolkata Municipal Corporation (KMC)", shortName: "KMC Water", state: "West Bengal", commission: 4 },
  { id: "djb_water", categoryId: "water", name: "Delhi Jal Board (DJB)", shortName: "Delhi Jal Board", state: "Delhi", commission: 4 },
  { id: "bwssb_water", categoryId: "water", name: "Bangalore Water Supply (BWSSB)", shortName: "BWSSB Water", state: "Karnataka", commission: 4 },

  // Broadband
  { id: "airtel_broadband", categoryId: "broadband", name: "Airtel Xstream Fiber", shortName: "Airtel Fiber", commission: 6 },
  { id: "jio_fiber", categoryId: "broadband", name: "JioFiber Broadband", shortName: "JioFiber", commission: 6 },
  { id: "act_fibernet", categoryId: "broadband", name: "ACT Fibernet", shortName: "ACT Fibernet", commission: 6 },
  { id: "bsnl_broadband", categoryId: "broadband", name: "BSNL Bharat Fiber", shortName: "BSNL Fiber", commission: 6 },
  { id: "alliance_broadband", categoryId: "broadband", name: "Alliance Broadband (Kolkata)", shortName: "Alliance", state: "West Bengal", commission: 6 },

  // DTH
  { id: "tata_play", categoryId: "dth", name: "Tata Play (Tata Sky)", shortName: "Tata Play", commission: 5 },
  { id: "airtel_dth", categoryId: "dth", name: "Airtel Digital TV", shortName: "Airtel DTH", commission: 5 },
  { id: "dish_tv", categoryId: "dth", name: "Dish TV India", shortName: "Dish TV", commission: 5 },
  { id: "sun_direct", categoryId: "dth", name: "Sun Direct DTH", shortName: "Sun Direct", commission: 5 },

  // Postpaid Mobile
  { id: "airtel_postpaid", categoryId: "postpaid", name: "Airtel Postpaid", shortName: "Airtel Postpaid", commission: 4 },
  { id: "jio_postpaid", categoryId: "postpaid", name: "Jio Postpaid Plus", shortName: "Jio Postpaid", commission: 4 },
  { id: "vi_postpaid", categoryId: "postpaid", name: "Vodafone Idea (Vi) Postpaid", shortName: "Vi Postpaid", commission: 4 },
  { id: "bsnl_postpaid", categoryId: "postpaid", name: "BSNL Mobile Postpaid", shortName: "BSNL Postpaid", commission: 4 },

  // FASTag
  { id: "icici_fastag", categoryId: "fastag", name: "ICICI Bank FASTag", shortName: "ICICI FASTag", commission: 3 },
  { id: "paytm_fastag", categoryId: "fastag", name: "Paytm Payments Bank FASTag", shortName: "Paytm FASTag", commission: 3 },
  { id: "sbi_fastag", categoryId: "fastag", name: "State Bank of India FASTag", shortName: "SBI FASTag", commission: 3 },
  { id: "idfc_fastag", categoryId: "fastag", name: "IDFC FIRST Bank FASTag", shortName: "IDFC FASTag", commission: 3 },
  { id: "hdfc_fastag", categoryId: "fastag", name: "HDFC Bank FASTag", shortName: "HDFC FASTag", commission: 3 },

  // Insurance
  { id: "lic_india", categoryId: "insurance", name: "Life Insurance Corporation (LIC)", shortName: "LIC of India", commission: 10 },
  { id: "hdfc_life", categoryId: "insurance", name: "HDFC Life Insurance", shortName: "HDFC Life", commission: 10 },
  { id: "sbi_life", categoryId: "insurance", name: "SBI Life Insurance", shortName: "SBI Life", commission: 10 },
  { id: "star_health", categoryId: "insurance", name: "Star Health & Allied Insurance", shortName: "Star Health", commission: 10 },

  // Loan EMI
  { id: "bajaj_finance", categoryId: "loan", name: "Bajaj Finance Limited", shortName: "Bajaj Finance", commission: 10 },
  { id: "home_credit", categoryId: "loan", name: "Home Credit India", shortName: "Home Credit", commission: 10 },
  { id: "tata_capital", categoryId: "loan", name: "Tata Capital Financial Services", shortName: "Tata Capital", commission: 10 },
  { id: "muthoot_finance", categoryId: "loan", name: "Muthoot Finance Limited", shortName: "Muthoot Finance", commission: 10 },
];

export type FetchedBill = {
  customerName: string;
  billerName: string;
  consumerId: string;
  billNumber: string;
  billDate: string;
  dueDate: string;
  billAmount: number;
  period: string;
  status: "verified" | "unverified";
};

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

export default function UtilityBillWorkspace({
  initialTransactions,
  initialCustomers,
  initialPaymentInstruments,
}: {
  initialTransactions: Txn[];
  initialCustomers: CustomerRow[];
  initialPaymentInstruments: PaymentInstrument[];
}) {
  const supabase = createClient();
  const { showToast, toastView } = useToast();
  const formRef = useRef<HTMLDivElement>(null);

  useRealtime(["transactions", "customers", "cash_entries", "payment_instruments"]);

  // State
  const [transactions, setTransactions] = useState<Txn[]>(initialTransactions);
  const [customers, setCustomers] = useState<CustomerRow[]>(initialCustomers);
  const [instruments] = useState<PaymentInstrument[]>(initialPaymentInstruments);

  // Form Inputs (Zero hardcoded demo values)
  const [selectedCategoryId, setSelectedCategoryId] = useState("electricity");
  const [selectedBillerId, setSelectedBillerId] = useState("");
  const [consumerId, setConsumerId] = useState("");
  const [billerParams, setBillerParams] = useState<Record<string, string>>({});
  const [fetchBadge, setFetchBadge] = useState<{ type: "success" | "unconfigured" | "error" | "manual"; text: string } | null>(null);
  const fetchSeqRef = useRef(0);
  const lastFetchedKeyRef = useRef("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [serviceFee, setServiceFee] = useState("0");
  const [customerPayMethod, setCustomerPayMethod] = useState<"cash" | "upi" | "bank" | "due">("cash");
  const [customerPayInstId, setCustomerPayInstId] = useState("");
  const [fundingInstId, setFundingInstId] = useState("");
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");

  // Bill Fetch State
  const [fetchingBill, setFetchingBill] = useState(false);
  const [fetchedBill, setFetchedBill] = useState<FetchedBill | null>(null);
  const [commissionConfigs, setCommissionConfigs] = useState<BillCommissionConfig[]>([]);
  const [commissionModalOpen, setCommissionModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("bill_payment_commission_config")
          .select("*")
          .order("created_at", { ascending: false });
        if (!cancelled && data && data.length > 0) {
          setCommissionConfigs(data as BillCommissionConfig[]);
        }
      } catch (err) {
        console.warn("Commission config query notice:", err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Selected Category Definition
  const currentCategory = useMemo(() => {
    return BILLER_CATEGORIES.find((c) => c.id === selectedCategoryId) || BILLER_CATEGORIES[0];
  }, [selectedCategoryId]);

  // Billers for current category
  const billersForCategory = useMemo(() => {
    return POPULAR_BILLERS.filter((b) => b.categoryId === selectedCategoryId);
  }, [selectedCategoryId]);

  // Selected Biller Definition
  const selectedBiller = useMemo(() => {
    return POPULAR_BILLERS.find((b) => b.id === selectedBillerId) || null;
  }, [selectedBillerId]);

  const activeBillerConfig: BillerConfig = useMemo(() => {
    return getBillerConfig(selectedBillerId) || getFallbackBillerConfig(selectedCategoryId, selectedBiller?.name || currentCategory.name);
  }, [selectedBillerId, selectedCategoryId, selectedBiller, currentCategory]);

  // Valid Funding Instruments. Credit cards are supported as a real biller funding source.
  const validFundingInstruments = useMemo(() => {
    return instruments.filter(
      (i) => i.is_active && ["cash", "bank", "upi", "wallet", "dmt_portal", "aeps_portal", "credit_card"].includes(i.type)
    );
  }, [instruments]);

  // Default funding instrument initialization
  useEffect(() => {
    if (!fundingInstId && validFundingInstruments.length > 0) {
      const defaultInst = validFundingInstruments.find((i) => i.type === "cash") || validFundingInstruments[0];
      setFundingInstId(defaultInst.id);
    }
  }, [validFundingInstruments, fundingInstId]);

  // Reset biller when category changes
  useEffect(() => {
    const firstBiller = billersForCategory[0];
    setSelectedBillerId(firstBiller ? firstBiller.id : "");
    setFetchedBill(null);
  }, [selectedCategoryId, billersForCategory]);

  // Economics Math
  const billAmount = parseFloat(amount) || 0;
  const custFee = parseFloat(serviceFee) || 0;
  const totalCustomerDebit = billAmount + custFee;

  const commissionResolution: CommissionResolution = useMemo(() => {
    return resolveBillCommission(commissionConfigs, {
      serviceType: "utility_bill",
      categoryId: selectedCategoryId,
      billerId: selectedBillerId,
      amount: billAmount,
      customerServiceFee: custFee,
    });
  }, [commissionConfigs, selectedCategoryId, selectedBillerId, billAmount, custFee]);

  const commissionEarned = commissionResolution.commissionAmount;

  const netProviderCost = Math.max(0, billAmount - commissionEarned);
  const netOperatorIncome = custFee + commissionEarned;

  // Selected Funding Account Details
  const selectedFundingAccount = useMemo(() => {
    return instruments.find((i) => i.id === fundingInstId);
  }, [instruments, fundingInstId]);

  // Today's Executive Analytics
  const todayStats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayTxns = transactions.filter(
      (t) =>
        t.transaction_date === todayStr &&
        isUtilityBillTxn(t)
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
      variance: 0,
    };
  }, [transactions]);

  // Filtered History
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (!isUtilityBillTxn(t)) return false;
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const num = (t.transaction_number || "").toLowerCase();
        const mob = (t.customer_mobile || "").toLowerCase();
        const cust = (t.customers?.name || "").toLowerCase();
        const ref = (t.reference || "").toLowerCase();
        const rem = (t.remarks || "").toLowerCase();
        if (!num.includes(q) && !mob.includes(q) && !cust.includes(q) && !ref.includes(q) && !rem.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [transactions, filterStatus, searchQuery]);

  // Execute Live Bill Fetch (Used by Auto-Fetch & Manual Fetch Button)
  const executeBillFetch = useCallback(async (paramsToFetch: Record<string, string>, isManual = false) => {
    const primaryParam = activeBillerConfig.parameters[0];
    const primaryKey = primaryParam?.key || "consumerId";
    const primaryVal = (paramsToFetch[primaryKey] || consumerId || "").trim();

    if (!primaryVal) {
      if (isManual) showToast("error", `Please enter ${primaryParam?.label || currentCategory.idLabel}.`);
      return;
    }

    const payloadParams = { ...paramsToFetch, [primaryKey]: primaryVal };
    const queryKey = `${selectedBillerId}:${JSON.stringify(payloadParams)}`;
    lastFetchedKeyRef.current = queryKey;
    const currentSeq = ++fetchSeqRef.current;

    setFetchingBill(true);

    try {
      const url = new URL("/api/bill-payment/fetch", window.location.origin);
      url.searchParams.set("billerId", selectedBillerId);
      url.searchParams.set("category", selectedCategoryId);
      for (const [k, v] of Object.entries(payloadParams)) {
        if (v) url.searchParams.set(k, v);
      }

      const res = await fetch(url.toString(), {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });

      const data: NormalizedBillResponse = await res.json().catch(() => ({ ok: false, configured: false, source: "unconfigured" } as any));

      if (currentSeq !== fetchSeqRef.current) return;

      if (data.ok && data.status === "verified") {
        setFetchedBill({
          customerName: data.customerName || "Verified Customer",
          billerName: data.billerName || selectedBiller?.name || currentCategory.name,
          consumerId: primaryVal,
          billNumber: data.billNumber || "—",
          billDate: data.billDate || new Date().toISOString().slice(0, 10),
          dueDate: data.dueDate || new Date().toISOString().slice(0, 10),
          billAmount: Number(data.amount) || 0,
          period: data.billingPeriod || "Current Billing Cycle",
          status: "verified",
        });
        if (data.amount && data.amount > 0) {
          setAmount(String(data.amount));
        }
        setFetchBadge({
          type: "success",
          text: `✓ Bill Found: ${data.customerName || "Verified Customer"} · Due: ${data.dueDate || "Current"} · ${inr(data.amount || 0)}`,
        });
        showToast("success", `✓ Live Bill verified for ${primaryVal}`);
      } else if (!data.configured) {
        setFetchedBill(null);
        setFetchBadge({
          type: "unconfigured",
          text: "⚡ Live bill fetch unavailable — provider not configured. Enter amount manually.",
        });
        if (isManual) showToast("info", "Live provider not configured. Please enter the bill amount manually.");
      } else {
        setFetchedBill(null);
        setFetchBadge({
          type: "error",
          text: `⚠️ ${data.error || "Unable to fetch bill details"} — Enter amount manually`,
        });
        if (isManual) showToast("error", data.error || "Unable to fetch bill details.");
      }
    } catch (err: any) {
      if (currentSeq !== fetchSeqRef.current) return;
      setFetchedBill(null);
      setFetchBadge({
        type: "error",
        text: "⚠️ Live lookup timed out or network error — Enter amount manually",
      });
      if (isManual) showToast("error", "Bill lookup timed out. Enter amount manually.");
    } finally {
      if (currentSeq === fetchSeqRef.current) {
        setFetchingBill(false);
      }
    }
  }, [activeBillerConfig, consumerId, selectedBillerId, selectedCategoryId, selectedBiller, currentCategory, showToast]);

  async function handleFetchBill() {
    await executeBillFetch(billerParams, true);
  }

  // Universal Debounced Auto-Fetch Hook (350ms debounce)
  useEffect(() => {
    const primaryKey = activeBillerConfig.parameters[0]?.key || "consumerId";
    const currentPrimary = (billerParams[primaryKey] || consumerId || "").trim();
    const minLen = activeBillerConfig.parameters[0]?.minLength || 4;

    if (!currentPrimary || currentPrimary.length < minLen) {
      setFetchBadge(null);
      setFetchedBill(null);
      return;
    }

    const payloadParams = { ...billerParams, [primaryKey]: currentPrimary };
    const queryKey = `${selectedBillerId}:${JSON.stringify(payloadParams)}`;
    if (queryKey === lastFetchedKeyRef.current) return;

    const timer = setTimeout(() => {
      executeBillFetch(payloadParams, false);
    }, 350);

    return () => clearTimeout(timer);
  }, [billerParams, consumerId, selectedBillerId, activeBillerConfig, executeBillFetch]);

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
    if (!customerMobile && cleanPhone) {
      setCustomerMobile(cleanPhone);
    }
    setAddCustomerModal(false);
    setNewCustName("");
    setNewCustPhone("");
    showToast("success", `Customer "${newCust.name}" created.`);
  }

  // Scan & Fill
  const handleScanFill = useCallback((fields: ScanFields) => {
    if (fields.mobile) setCustomerMobile(fields.mobile);
    if (fields.amount) setAmount(String(fields.amount));
    if (fields.ref_number) setReference(fields.ref_number);
    if (fields.account_number) setConsumerId(fields.account_number);
    showToast("success", "Filled bill details from scan.");
  }, [showToast]);

  // Complete Utility Bill Payment (Atomic Double-Submit Protected)
  async function handleCompletePayment() {
    if (submitting) return;

    if (!selectedBillerId && billersForCategory.length > 0) {
      showToast("error", "Please choose the utility biller.");
      return;
    }
    if (!consumerId.trim()) {
      showToast("error", `Please enter ${currentCategory.idLabel}.`);
      return;
    }
    if (billAmount <= 0) {
      showToast("error", "Please enter a valid bill amount greater than ₹0.");
      return;
    }
    if (customerPayMethod === "due" && !selectedCustomerId) {
      showToast("error", "Please select a customer for Khata (Due) credit payment.");
      return;
    }
    if (!fundingInstId) {
      showToast("error", "Please select the funding account used to settle the biller.");
      return;
    }

    setSubmitting(true);

    try {
      const todayIso = new Date().toISOString();
      const todayDate = todayIso.slice(0, 10);
      const billerName = selectedBiller?.name || currentCategory.name;

      // 1. Generate Transaction Number
      const { count } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .in("service_type", ["bill_payment", "utility_bill"]);
      const nextNum = "BIL-" + String((count ?? 0) + 1).padStart(4, "0");

      // 2. Post to Canonical transactions Table
      const insertPayload = {
        transaction_number: nextNum,
        service_type: "bill_payment",
        direction: "in",
        transaction_date: todayDate,
        transaction_timestamp: todayIso,
        customer_id: selectedCustomerId || null,
        customer_mobile: customerMobile.replace(/\D/g, "") || null,
        reference: reference.trim() || consumerId.trim(),
        remarks: remarks.trim() || `${currentCategory.name} - ${billerName} (${consumerId.trim()})`,
        status: "success",
        instrument_id: fundingInstId,
        amount: billAmount,
        service_fee: custFee,
        portal_commission: commissionEarned,
        portal_charge: 0,
        cash_in: customerPayMethod === "cash" ? totalCustomerDebit : 0,
        bank_in: customerPayMethod === "bank" ? totalCustomerDebit : 0,
        pool_out: netProviderCost,
        pool_credit: 0,
        pool_credit_type: "utility",
        customer_pay_method: customerPayMethod,
      };

      let newTxn: any = null;
      const { data: primaryTxn, error: txnErr } = await supabase
        .from("transactions")
        .insert(insertPayload)
        .select(`
          *,
          customers(name, phone),
          profiles(full_name)
        `)
        .single();

      if (txnErr) {
        if (txnErr.message.includes("check constraint") || txnErr.message.includes("service_type_check")) {
          const { data: retryTxn, error: retryErr } = await supabase
            .from("transactions")
            .insert({
              ...insertPayload,
              service_type: "recharge",
            })
            .select(`
              *,
              customers(name, phone),
              profiles(full_name)
            `)
            .single();

          if (retryErr) {
            showToast("error", retryErr.message);
            setSubmitting(false);
            return;
          }
          newTxn = retryTxn;
        } else {
          showToast("error", txnErr.message);
          setSubmitting(false);
          return;
        }
      } else {
        newTxn = primaryTxn;
      }

      // 3. Customer Collection Accounting Leg
      if (customerPayMethod !== "due" && totalCustomerDebit > 0) {
        const payInst = instruments.find((i) => i.id === customerPayInstId) || selectedFundingAccount;
        await supabase.from("cash_entries").insert({
          entry_date: todayDate,
          method: customerPayMethod === "cash" ? "cash" : customerPayMethod === "upi" ? "upi" : "bank",
          direction: "in",
          amount: totalCustomerDebit,
          description: `Bill ${nextNum} collection for ${billerName} (${customerPayMethod.toUpperCase()})`,
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
          type: "invoice",
          description: `Utility Bill ${nextNum} (${billerName}) on credit (Khata)`,
          debit: totalCustomerDebit,
          credit: 0,
          balance_after: newBal,
          ref_type: "transaction",
          ref_id: newTxn.id,
        });
      }

      // 4. Provider Funding Leg (Debited from funding instrument)
      if (netProviderCost > 0 && selectedFundingAccount) {
        await supabase.from("cash_entries").insert({
          entry_date: todayDate,
          method: selectedFundingAccount.type === "cash" ? "cash" : selectedFundingAccount.type === "bank" ? "bank" : selectedFundingAccount.type === "credit_card" ? "credit_card" : selectedFundingAccount.type === "wallet" ? "wallet" : "upi",
          direction: "out",
          amount: netProviderCost,
          description: `Bill ${nextNum} settlement to ${billerName} from ${selectedFundingAccount.name}`,
          ref_type: "transaction",
          ref_id: newTxn.id,
          instrument_id: selectedFundingAccount.id,
        });
      }

      // 5. Audit Trail Logging
      await logAudit({
        action: "create",
        entity: "transaction",
        entity_id: newTxn.id,
        description: `Paid Utility Bill ${nextNum} for ${billerName} | Consumer ID: ${consumerId.trim()} | Amount: ${inr(billAmount)} | Commission: ${inr(commissionEarned)}`,
        details: {
          transaction_number: nextNum,
          category: currentCategory.name,
          biller: billerName,
          consumer_id: consumerId.trim(),
          amount: billAmount,
          customer_fee: custFee,
          total_customer_debit: totalCustomerDebit,
          commission: commissionEarned,
          provider_cost: netProviderCost,
          net_income: netOperatorIncome,
          funding_account: selectedFundingAccount?.name || "Funding Account",
          payment_method: customerPayMethod,
        },
      });

      // 6. Update UI State & Open Receipt
      const formattedTxn: Txn = {
        ...newTxn,
        providers: { name: billerName },
        customers: selectedCustomerId ? { name: customers.find((c) => c.id === selectedCustomerId)?.name || "Customer" } : null,
      };

      setTransactions((prev) => [formattedTxn, ...prev]);
      setReceiptTxn(formattedTxn);
      showToast("success", `✓ Bill payment ${nextNum} processed successfully!`);

      // Reset form
      setConsumerId("");
      setAmount("");
      setServiceFee("0");
      setFetchedBill(null);
      setReference("");
      setRemarks("");
    } catch (err: any) {
      console.error("Bill Payment Error:", err);
      showToast("error", err.message || "Failed to process bill payment.");
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
        p_reason: reverseReason.trim() || "Utility bill failed or refunded at biller end",
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
            description: `Reversed Utility Bill ${reverseTxn.transaction_number} (${ce.direction === "out" ? "refund to funding account" : "return customer collection"})`,
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
          description: `Reversal credit for Utility Bill ${reverseTxn.transaction_number}`,
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
      "Biller",
      "Consumer ID / Ref",
      "Customer",
      "Bill Amount",
      "Customer Fee",
      "Commission",
      "Provider Cost",
      "Customer Pay Method",
      "Status",
    ];
    const rows = filteredTransactions.map((t) => [
      fmtDate(t.transaction_date),
      fmtTime(t.transaction_timestamp || t.created_at),
      t.transaction_number,
      t.providers?.name || t.remarks || "Utility Bill",
      t.reference || "-",
      t.customers?.name || "-",
      Number(t.amount),
      Number(t.service_fee || 0),
      Number(t.portal_commission || 0),
      Number(t.pool_out || 0),
      (t.customer_pay_method || "cash").toUpperCase(),
      t.status.toUpperCase(),
    ]);
    downloadCsv(`utility_bills_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  }

  // WhatsApp Trigger
  function handleWhatsApp(t: Txn) {
    const rawPhone = t.customer_mobile || t.customers?.phone || "";
    const cleanPhone = rawPhone.replace(/\D/g, "");
    const msg = `*UTILITY BILL PAYMENT RECEIPT — SARKAR COMMUNICATION*\n` +
      `--------------------------------\n` +
      `Txn ID: ${t.transaction_number}\n` +
      `Biller: ${t.providers?.name || t.remarks || "Utility Service"}\n` +
      `Consumer / Ref: ${t.reference || "-"}\n` +
      `Bill Amount: ${inr(Number(t.amount))}\n` +
      `Customer Fee: ${inr(Number(t.service_fee || 0))}\n` +
      `Total Paid: ${inr(Number(t.amount) + Number(t.service_fee || 0))}\n` +
      `Paid Via: ${(t.customer_pay_method || "cash").toUpperCase()}\n` +
      `Status: ${t.status.toUpperCase()}\n` +
      `Date: ${fmtDate(t.transaction_date)} ${fmtTime(t.transaction_timestamp || t.created_at)}\n` +
      `--------------------------------\n` +
      `Thank you for paying your bill with us!`;

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
      {/* 1. EXECUTIVE HERO */}
      <div className="relative overflow-hidden rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 p-6 text-white shadow-2xl">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-black tracking-wide text-emerald-300 ring-1 ring-emerald-500/40">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                UTILITY BILLING SYSTEM ONLINE
              </span>
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-bold text-slate-300">
                {BILLER_CATEGORIES.length} Service Categories
              </span>
            </div>
            <h1 className="mt-2.5 text-2xl font-black tracking-tight sm:text-3xl">
              Utility Bill Payment Command Center
            </h1>
            <p className="mt-1 text-xs text-slate-300 max-w-xl">
              Electricity, piped gas, water, broadband, DTH, postpaid, FASTag, insurance and institutional bill collections.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth" })}
              className="btn-3d-tactile-primary flex items-center gap-2 px-4 py-2 text-xs font-black shadow-lg"
            >
              <span>🧾 Pay a Bill</span>
            </button>
            <button
              type="button"
              onClick={() => setScanModalOpen(true)}
              className="btn-3d-tactile-secondary flex items-center gap-2 px-3.5 py-2 text-xs font-bold"
            >
              <span>📷 Scan Bill</span>
            </button>
            <button
              type="button"
              onClick={() => setCommissionModalOpen(true)}
              className="btn-3d-tactile-secondary flex items-center gap-2 px-3.5 py-2 text-xs font-bold"
            >
              <span>⚙ Commission / Margin</span>
            </button>
            <Link
              href="/business/bill-payment"
              className="btn-3d-tactile-secondary flex items-center gap-2 px-3.5 py-2 text-xs font-bold"
            >
              <span>← Bill Payment Hub</span>
            </Link>
          </div>
        </div>

        {/* 5-Card KPI Bento Grid */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
            <span className="text-[10px] font-black uppercase text-cyan-300">Today&apos;s Bills Paid</span>
            <div className="mt-1 text-xl font-black">{todayStats.count} <span className="text-xs font-normal text-slate-300">bills</span></div>
            <p className="mt-0.5 text-[11px] text-slate-400">{inr(todayStats.volume)} volume</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
            <span className="text-[10px] font-black uppercase text-emerald-300">Customer Collection</span>
            <div className="mt-1 text-xl font-black text-emerald-400">{inr(todayStats.collections)}</div>
            <p className="mt-0.5 text-[11px] text-slate-400">Total customer receipts</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
            <span className="text-[10px] font-black uppercase text-amber-300">Commission Earned</span>
            <div className="mt-1 text-xl font-black text-amber-400">{inr(todayStats.commission)}</div>
            <p className="mt-0.5 text-[11px] text-slate-400">Biller convenience margin</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
            <span className="text-[10px] font-black uppercase text-indigo-300">Provider Settlement</span>
            <div className="mt-1 text-xl font-black text-indigo-400">{inr(todayStats.providerCost)}</div>
            <p className="mt-0.5 text-[11px] text-slate-400">Debited from funding account</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
            <span className="text-[10px] font-black uppercase text-purple-300">Success Rate</span>
            <div className="mt-1 text-xl font-black text-purple-300">{todayStats.successRate}%</div>
            <p className="mt-0.5 text-[11px] text-emerald-400">Net Income: {inr(todayStats.netIncome)}</p>
          </div>
        </div>
      </div>

      {/* 2. RECONCILIATION STRIP */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300">
            ⚡
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-900 dark:text-white">UTILITY BILLING RECONCILIATION</span>
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
        </div>
      </div>

      {/* 3. UTILITY BILL TERMINAL (TWO-COLUMN WORKSPACE) */}
      <div ref={formRef} className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT: Terminal Form */}
        <div className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-md dark:border-white/10 dark:bg-slate-900 lg:col-span-7">
          {/* Step Tracker */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5 text-[10px] font-black uppercase text-slate-400 tracking-wider">
            <span className={selectedCategoryId ? "text-cyan-600 dark:text-cyan-400" : ""}>01 CATEGORY</span>
            <span>→</span>
            <span className={selectedBillerId ? "text-cyan-600 dark:text-cyan-400" : ""}>02 BILLER</span>
            <span>→</span>
            <span className={consumerId ? "text-cyan-600 dark:text-cyan-400" : ""}>03 ACCOUNT</span>
            <span>→</span>
            <span className={billAmount > 0 ? "text-cyan-600 dark:text-cyan-400" : ""}>04 VERIFY</span>
            <span>→</span>
            <span className="text-emerald-600 dark:text-emerald-400">05 SETTLE</span>
          </div>

          {/* 01 Service Category Selector */}
          <div className="space-y-2.5">
            <label className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
              1. Select Utility Category *
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {BILLER_CATEGORIES.map((cat) => {
                const isSelected = selectedCategoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(cat.id)}
                    disabled={submitting}
                    className={`flex flex-col items-center justify-center rounded-2xl border p-2.5 text-center transition ${
                      isSelected
                        ? "border-cyan-600 bg-cyan-50/70 shadow-xs ring-2 ring-cyan-600/30 dark:border-cyan-500 dark:bg-cyan-950/40"
                        : "border-slate-200 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800/40"
                    }`}
                  >
                    <span className="text-xl">{cat.icon}</span>
                    <span className="mt-1 text-[11px] font-black text-slate-900 dark:text-white">{cat.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 02 Biller Selection */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-white/5">
            <label className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
              2. Select {currentCategory.name} Provider / Biller *
            </label>
            <select
              value={selectedBillerId}
              onChange={(e) => setSelectedBillerId(e.target.value)}
              disabled={submitting}
              className="w-full rounded-2xl border border-slate-300 bg-white p-3 text-xs font-black text-slate-900 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
            >
              {billersForCategory.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} {b.state ? `(${b.state})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* 03 Consumer ID & Mobile */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-white/5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
                  3. {currentCategory.idLabel} *
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    value={consumerId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setConsumerId(val);
                      const pKey = activeBillerConfig.parameters[0]?.key || "consumerId";
                      setBillerParams((prev) => ({ ...prev, [pKey]: val }));
                    }}
                    disabled={submitting}
                    placeholder={activeBillerConfig.parameters[0]?.placeholder || currentCategory.idPlaceholder}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-black text-slate-900 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={handleFetchBill}
                    disabled={fetchingBill || !consumerId.trim()}
                    className="shrink-0 rounded-xl bg-cyan-600 px-3 py-2 text-xs font-bold text-white shadow-xs hover:bg-cyan-500 disabled:opacity-50"
                  >
                    {fetchingBill ? "Fetching..." : "🔍 Fetch"}
                  </button>
                </div>
                {fetchBadge && (
                  <div className="mt-1.5">
                    <span className={`inline-block rounded-lg px-2.5 py-0.5 text-[10px] font-bold ${
                      fetchBadge.type === "success"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : fetchBadge.type === "unconfigured"
                        ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                        : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                    }`}>
                      {fetchBadge.text}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
                  Customer Mobile Phone
                </label>
                <input
                  type="tel"
                  maxLength={10}
                  value={customerMobile}
                  onChange={(e) => setCustomerMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  disabled={submitting}
                  placeholder="10-digit mobile number"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-black text-slate-900 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            {/* Optional Customer Link */}
            <div>
              <label className="text-[11px] font-bold text-slate-500">Customer Link (Optional for Khata / CRM)</label>
              <SearchableSelect
                options={[
                  { value: "", label: "-- Walk-in / Direct Utility Bill --" },
                  ...customers.map((c) => ({
                    value: c.id,
                    label: `${c.name} (${c.phone || "No phone"}) ${c.balance ? `· Due: ${inr(c.balance)}` : ""}`,
                  })),
                ]}
                value={selectedCustomerId}
                onChange={(v) => {
                  setSelectedCustomerId(v);
                  const cust = customers.find((c) => c.id === v);
                  if (cust?.phone && !customerMobile) {
                    setCustomerMobile(cust.phone.replace(/\D/g, "").slice(-10));
                  }
                }}
                placeholder="Select customer..."
              />
            </div>
          </div>

          {/* 04 Bill Amount & Service Fee */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-white/5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[11px] font-bold text-slate-500">Bill Amount (₹) *</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={submitting}
                  placeholder="0.00"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-black text-slate-900 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500">Customer Service / Kiosk Fee (₹)</label>
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

            {/* Active Commission & Margin strip */}
            <div className="flex items-center justify-between rounded-xl border border-indigo-100 bg-indigo-50/60 p-2.5 dark:border-indigo-900/40 dark:bg-indigo-950/20">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600 text-xs font-black text-white">
                  %
                </span>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                    Biller Margin ({commissionResolution.label})
                  </span>
                  <p className="text-xs font-black text-slate-900 dark:text-white">
                    Earns {inr(commissionEarned)} margin on {selectedBiller?.name || currentCategory.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCommissionModalOpen(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-xs font-black text-indigo-700 shadow-xs transition hover:bg-indigo-50 dark:border-indigo-800 dark:bg-slate-800 dark:text-indigo-300"
              >
                ⚙ Edit Margin
              </button>
            </div>
          </div>

          {/* 05 Customer Payment Method */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-white/5">
            <label className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
              5. How is Customer Paying? *
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
                        ? "border-cyan-600 bg-cyan-50/70 shadow-xs ring-2 ring-cyan-600/20 dark:border-cyan-500 dark:bg-cyan-950/40"
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

          {/* 06 Funding Source */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-white/5">
            <label className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
              6. Funding Source Account (Cost Debited From) *
            </label>
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
            <h3 className="text-base font-black text-slate-900 dark:text-white">Bill Settlement Breakdown</h3>
          </div>

          {/* Fetched Bill Verification Box */}
          {fetchedBill && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5 text-xs text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200 space-y-1">
              <div className="flex justify-between font-black">
                <span>✓ Bill Verified</span>
                <span>{fetchedBill.billNumber}</span>
              </div>
              <p>Consumer: <strong>{fetchedBill.customerName}</strong> · Due Date: <strong>{fmtDate(fetchedBill.dueDate)}</strong></p>
            </div>
          )}

          {/* Preview Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-slate-800/80 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-white/5">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400">Biller / Service</span>
                <p className="text-sm font-black text-slate-900 dark:text-white">
                  {selectedBiller?.name || currentCategory.name}
                </p>
              </div>
              <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] font-black text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300">
                {currentCategory.icon} {currentCategory.name}
              </span>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-400">
              {currentCategory.idLabel}: <strong className="text-slate-900 dark:text-white">{consumerId.trim() || "Enter ID"}</strong>
            </div>

            {/* Financial Math Ledger */}
            <div className="space-y-2 text-xs border-t border-slate-100 pt-2.5 dark:border-white/5">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Bill Principal Amount:</span>
                <strong className="text-slate-900 dark:text-white">{inr(billAmount)}</strong>
              </div>

              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Customer Service Fee:</span>
                <strong className="text-slate-900 dark:text-white">+{inr(custFee)}</strong>
              </div>

              <div className="flex justify-between font-black text-sm border-t border-slate-200 pt-2 dark:border-white/10">
                <span className="text-emerald-700 dark:text-emerald-400">Total Customer Debit:</span>
                <span className="text-emerald-700 dark:text-emerald-400">{inr(totalCustomerDebit)}</span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-amber-600 dark:text-amber-400 pt-1">
                <div className="flex items-center gap-1.5">
                  <span>Commission / Margin ({commissionResolution.label}):</span>
                  <button
                    type="button"
                    onClick={() => setCommissionModalOpen(true)}
                    className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/50 transition"
                  >
                    ⚙ Edit Margin
                  </button>
                </div>
                <strong>-{inr(commissionEarned)}</strong>
              </div>

              <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>Net Provider Cost (Debited from funding):</span>
                <strong className="text-slate-900 dark:text-white">{inr(netProviderCost)}</strong>
              </div>

              <div className="flex justify-between text-xs font-black text-cyan-600 dark:text-cyan-400 border-t border-slate-100 pt-1.5 dark:border-white/5">
                <span>Operator Net Income:</span>
                <span>+{inr(netOperatorIncome)}</span>
              </div>
            </div>

            <div className="rounded-xl bg-cyan-50/50 p-2.5 text-[11px] text-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
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
              placeholder="Receipt / Reference ID (Optional)"
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

          {/* Complete Bill Payment Button */}
          <button
            type="button"
            onClick={handleCompletePayment}
            disabled={submitting || !consumerId.trim() || billAmount <= 0}
            className="btn-3d-tactile-primary flex w-full items-center justify-center gap-2 py-3.5 text-sm font-black shadow-xl disabled:opacity-50"
          >
            {submitting ? (
              <span>⚡ Processing Bill Payment...</span>
            ) : (
              <span>✓ Pay Bill {billAmount > 0 ? inr(totalCustomerDebit) : ""}</span>
            )}
          </button>
        </div>
      </div>

      {/* 4. TRANSACTION HISTORY CONSOLE */}
      <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-md dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-white/5">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Utility Bill Payment History
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Verified record of electricity, gas, water, broadband and institutional bill settlements.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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

        {/* Search */}
        <div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by customer name, mobile, consumer ID, txn # or reference..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
          />
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-black uppercase text-slate-400 dark:border-white/5 dark:bg-white/5">
                <th className="px-4 py-2.5">Date &amp; Time</th>
                <th className="px-4 py-2.5">Txn #</th>
                <th className="px-4 py-2.5">Biller / Service</th>
                <th className="px-4 py-2.5">Consumer ID / Ref</th>
                <th className="px-4 py-2.5 text-right">Bill Amount</th>
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
                    No utility bill payment transactions found.
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
                      {t.providers?.name || t.remarks || "Utility Biller"}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                      {t.reference || t.customer_mobile || "—"}
                      {t.customers?.name && (
                        <div className="text-[10px] text-slate-400 font-normal">{t.customers.name}</div>
                      )}
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

      {/* 5. RECEIPT MODAL */}
      {receiptTxn && (
        <FloatingWindow
          isOpen={true}
          onClose={() => setReceiptTxn(null)}
          title="Utility Bill Receipt"
          subtitle={`Receipt for ${receiptTxn.transaction_number}`}
        >
          <div className="space-y-4 p-4">
            <div className="text-center py-2">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                ✓
              </span>
              <h3 className="mt-2 text-lg font-black text-slate-900 dark:text-white">
                Payment Successful
              </h3>
              <p className="text-xs text-slate-500">Transaction ID: {receiptTxn.transaction_number}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-800/60 text-xs space-y-2">
              <div className="flex justify-between"><span className="text-slate-400">Biller:</span><strong>{receiptTxn.providers?.name || receiptTxn.remarks || "Utility Service"}</strong></div>
              <div className="flex justify-between"><span className="text-slate-400">Consumer ID / Ref:</span><strong>{receiptTxn.reference || "—"}</strong></div>
              <div className="flex justify-between"><span className="text-slate-400">Bill Amount:</span><strong>{inr(Number(receiptTxn.amount))}</strong></div>
              <div className="flex justify-between"><span className="text-slate-400">Service Fee:</span><strong>{inr(Number(receiptTxn.service_fee || 0))}</strong></div>
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

      {/* 6. DETAIL MODAL */}
      {detailTxn && (
        <FloatingWindow
          isOpen={true}
          onClose={() => setDetailTxn(null)}
          title={`Transaction ${detailTxn.transaction_number}`}
          subtitle="Complete audit and accounting trace"
        >
          <div className="space-y-4 p-4 text-xs">
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 dark:border-white/10 dark:bg-slate-800/60">
              <div><span className="text-slate-400">Service:</span><div className="font-bold">Utility Bill Payment</div></div>
              <div><span className="text-slate-400">Status:</span><div className="font-bold uppercase text-emerald-600">{detailTxn.status}</div></div>
              <div><span className="text-slate-400">Biller / Ref:</span><div className="font-bold">{detailTxn.providers?.name || detailTxn.remarks}</div></div>
              <div><span className="text-slate-400">Consumer ID:</span><div className="font-bold">{detailTxn.reference || "—"}</div></div>
              <div><span className="text-slate-400">Bill Amount:</span><div className="font-bold">{inr(Number(detailTxn.amount))}</div></div>
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
              Reverse Bill Payment {reverseTxn.transaction_number}?
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
                placeholder="e.g. Biller transaction failed / wrong consumer ID"
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
                className="rounded-xl bg-cyan-600 px-4 py-1.5 text-xs font-black text-white hover:bg-cyan-700 shadow-md"
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
        title="Scan Utility Bill"
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

      <CommissionEditModal
        open={commissionModalOpen}
        onClose={() => setCommissionModalOpen(false)}
        initialCategory={selectedCategoryId}
        initialBillerId={selectedBillerId}
        existingConfig={commissionResolution.config}
        onSaved={(saved) => {
          setCommissionConfigs((prev) => [saved, ...prev.filter((c) => c.id !== saved.id)]);
        }}
      />
      {toastView}
    </div>
  );
}
