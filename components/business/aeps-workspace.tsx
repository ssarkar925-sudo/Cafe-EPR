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
      return (
        t.transaction_number?.toLowerCase().includes(q) ||
        t.customer_mobile?.includes(q) ||
        t.customers?.name?.toLowerCase().includes(q) ||
        t.banks?.name?.toLowerCase().includes(q) ||
        t.reference?.toLowerCase().includes(q)
      );
    });
  }, [transactions, searchQuery, statusFilter]);

  // Aggregated KPIs
  const kpis = useMemo(() => {
    let volume = 0;
    let totalCashDisbursed = 0;
    let fees = 0;
    let commissions = 0;
    let successCount = 0;

    for (const t of filteredTxns) {
      if (t.status === "success") {
        successCount++;
        const a = Number(t.amount || 0);
        const f = Number(t.service_fee || 0);
        const c = Number(t.portal_commission || 0);
        volume += a;
        fees += f;
        commissions += c;
        if (t.fee_source === "cut_from_withdrawal") {
          totalCashDisbursed += Math.max(0, a - f);
        } else {
          totalCashDisbursed += a;
        }
      }
    }

    return {
      count: filteredTxns.length,
      successCount,
      volume,
      totalCashDisbursed,
      fees,
      commissions,
      totalIncome: fees + commissions,
      variance: 0,
    };
  }, [filteredTxns]);

  // Reset form completely for a clean new cash out
  const handleNewCashOut = useCallback(() => {
    setSelectedCustomerId("");
    setCustomerMobile("");
    setSelectedBankId("");
    setAadhaarLast4("");
    setAmount("");
    setServiceFee("");
    setPortalCommission("");
    setReference("");
    setRemarks("");
    setScannedReviewData(null);
    setSuccessTxn(null);
    formRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Handle Scan & Fill Extraction
  function handleScanApply(fields: ScanFields) {
    const detectedName = fields.customer_name || fields.sender_name || "";
    const detectedMobile = fields.customer_mobile || fields.sender_mobile || "";
    const rawAadhaar = fields.aadhaar_last4 || "";
    const cleanScanAadhaar = rawAadhaar.replace(/\D/g, "").slice(-4);
    const detectedBank = fields.bank_name || fields.beneficiary_bank || "";

    const matched = matchBank(detectedBank, banks);

    setScannedReviewData({
      customerName: detectedName,
      mobile: detectedMobile,
      aadhaarLast4: cleanScanAadhaar,
      bankName: detectedBank,
      matchedBank: matched,
    });

    if (detectedMobile) setCustomerMobile(detectedMobile);
    if (cleanScanAadhaar) setAadhaarLast4(cleanScanAadhaar);
    if (fields.amount) setAmount(fields.amount);
    if (fields.reference) setReference(fields.reference);

    if (matched) {
      setSelectedBankId(matched.id);
    } else if (detectedBank) {
      setNewBankName(detectedBank);
    }
  }

  // Add New Bank
  async function handleCreateBank(e: React.FormEvent) {
    e.preventDefault();
    const name = newBankName.trim();
    if (!name) {
      setBankCreateError("Please enter a valid bank name.");
      return;
    }

    setBankCreateSubmitting(true);
    setBankCreateError("");

    const existing = matchBank(name, banks);
    if (existing) {
      setSelectedBankId(existing.id);
      setAddBankWindowOpen(false);
      setBankCreateSubmitting(false);
      showToast("info", `Selected "${existing.name}" (already in Master List).`);
      return;
    }

    try {
      const { data: newBank, error: insertError } = await supabase
        .from("aeps_banks")
        .insert({
          name,
          code: newBankCode.trim() || null,
          is_active: true,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      await logAudit({
        action: "create",
        entity: "aeps_bank",
        entity_id: (newBank as any).id,
        description: `Added new bank "${name}" to Master List`,
      });

      setBanks((prev) => [...prev, newBank as Master].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedBankId((newBank as any).id);
      setAddBankWindowOpen(false);
      setNewBankName("");
      setNewBankCode("");
      showToast("success", `Bank "${name}" added and selected.`);
    } catch (err: any) {
      console.error("Bank creation error:", err);
      setBankCreateError(err.message || "Failed to create bank.");
    } finally {
      setBankCreateSubmitting(false);
    }
  }

  // Add New Customer
  async function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault();
    const name = newCustName.trim();
    const phone = newCustPhone.trim().replace(/\D/g, "");

    if (!name) {
      setCustCreateError("Please enter a valid customer name.");
      return;
    }
    if (phone && phone.length !== 10) {
      setCustCreateError("Mobile number must be exactly 10 digits.");
      return;
    }

    setCustCreateSubmitting(true);
    setCustCreateError("");

    try {
      const newCust = await createCustomerRecord(supabase, {
        name,
        phone: phone || null,
        email: newCustEmail.trim() || null,
        address: newCustAddress.trim() || null,
      });

      await logAudit({
        action: "create",
        entity: "customer",
        entity_id: newCust.id,
        description: `Created customer "${name}" from AEPS workspace`,
      });

      setCustomers((prev) => [...prev, newCust as unknown as CustomerRow].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedCustomerId(newCust.id);
      if (phone) setCustomerMobile(phone);
      setAddCustomerWindowOpen(false);
      setNewCustName("");
      setNewCustPhone("");
      setNewCustEmail("");
      setNewCustAddress("");
      showToast("success", `Customer "${name}" created and assigned.`);
    } catch (err: any) {
      if (err instanceof DuplicateCustomerError) {
        showToast("info", `Customer with this phone already exists: ${err.existing.name}`);
        setSelectedCustomerId(err.existing.id);
        if (err.existing.phone) setCustomerMobile(err.existing.phone);
        setAddCustomerWindowOpen(false);
      } else {
        console.error("Customer creation error:", err);
        setCustCreateError(err.message || "Failed to create customer.");
      }
    } finally {
      setCustCreateSubmitting(false);
    }
  }

  // Open Edit Modal for Complete Financial & Operational Edit
  function handleOpenEdit(t: Txn) {
    setEditingTxn(t);
    setEditAmount(String(t.amount ?? ""));
    setEditServiceFee(String(t.service_fee ?? "0"));
    setEditPortalCommission(String(t.portal_commission ?? "0"));
    const isDeduct = t.fee_source === "cut_from_withdrawal" || t.fee_source === "deducted_from_cash";
    setEditFeeTreatment(isDeduct ? "deduct" : "separate");
    setEditCustomerPayMethod((t.customer_pay_method as any) || (t.fee_source === "upi" ? "upi" : "cash"));
    setEditBankId(t.bank_id || "");
    setEditPortalId(t.portal_id || portals[0]?.id || "");
    setEditAadhaarLast4(t.aadhaar_last4 || "");
    setEditCustomerId(t.customer_id || "");
    setEditCustomerMobile(t.customer_mobile || t.customers?.phone || "");
    setEditReference(t.reference || "");
    setEditRemarks(t.remarks || "");
    setEditTxnWindowOpen(true);
  }

  // Save Complete Financial & Operational Edit
  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTxn) return;

    const parsedAmt = parseFloat(editAmount);
    if (isNaN(parsedAmt) || parsedAmt <= 0) {
      showToast("error", "Please enter a valid withdrawal amount.");
      return;
    }
    const parsedFee = parseFloat(editServiceFee) || 0;
    if (parsedFee < 0) {
      showToast("error", "Service fee cannot be negative.");
      return;
    }
    const parsedComm = parseFloat(editPortalCommission) || 0;
    if (!editBankId) {
      showToast("error", "Please select customer's bank.");
      return;
    }
    if (!editPortalId) {
      showToast("error", "Please select AEPS portal.");
      return;
    }
    if (!/^\d{4}$/.test(editAadhaarLast4)) {
      showToast("error", "Aadhaar must be exactly 4 digits.");
      return;
    }

    setEditSubmitting(true);

    try {
      const effectiveFeeSource = editFeeTreatment === "deduct" ? "cut_from_withdrawal" : "customer_paid_extra";
      const effectivePayMethod = editFeeTreatment === "separate" ? editCustomerPayMethod : "cash";

      const res = await supabase.rpc("update_business_txn", {
        p_txn_id: editingTxn.id,
        p_transaction_date: editingTxn.transaction_date,
        p_transaction_timestamp: editingTxn.transaction_timestamp || new Date().toISOString(),
        p_customer_id: editCustomerId || null,
        p_customer_mobile: editCustomerMobile.trim() || null,
        p_reference: editReference.trim() || null,
        p_remarks: editRemarks.trim() || null,
        p_bank_id: editBankId,
        p_portal_id: editPortalId,
        p_merchant_qr_id: null,
        p_aadhaar_last4: editAadhaarLast4,
        p_transfer_method: null,
        p_sender_name: null,
        p_sender_mobile: null,
        p_beneficiary_name: null,
        p_beneficiary_mobile: null,
        p_beneficiary_bank: null,
        p_beneficiary_ifsc: null,
        p_beneficiary_account: null,
        p_upi_id: null,
        p_amount: parsedAmt,
        p_service_fee: parsedFee,
        p_portal_commission: parsedComm,
        p_fee_source: effectiveFeeSource,
        p_paid_from: "portal",
        p_customer_pay_method: effectivePayMethod,
        p_pay_from_instrument_id: portals.find((p) => p.id === editPortalId)?.payment_instrument_id || null,
        p_pay_from_method: "aeps_portal",
      });

      if (res.error) throw res.error;

      // Re-fetch updated row with relations
      const { data: updatedTxn } = await supabase
        .from("transactions")
        .select("*, customers(name, phone), banks:aeps_banks(name, code), portals:aeps_portals(name, code), profiles(full_name)")
        .eq("id", editingTxn.id)
        .single();

      if (updatedTxn) {
        setTransactions((prev) => prev.map((t) => (t.id === editingTxn.id ? (updatedTxn as any) : t)));
      } else {
        setTransactions((prev) =>
          prev.map((t) =>
            t.id === editingTxn.id
              ? {
                  ...t,
                  amount: parsedAmt,
                  service_fee: parsedFee,
                  portal_commission: parsedComm,
                  fee_source: effectiveFeeSource,
                  customer_pay_method: effectivePayMethod,
                  bank_id: editBankId,
                  portal_id: editPortalId,
                  aadhaar_last4: editAadhaarLast4,
                  customer_id: editCustomerId || null,
                  customer_mobile: editCustomerMobile.trim() || null,
                  reference: editReference.trim() || null,
                  remarks: editRemarks.trim() || null,
                  banks: banks.find((b) => b.id === editBankId) || t.banks,
                  portals: portals.find((p) => p.id === editPortalId) || t.portals,
                  customers: customers.find((c) => c.id === editCustomerId) || t.customers,
                }
              : t
          )
        );
      }

      // Refresh pool balance
      const { data: freshPool } = await supabase.rpc("get_pool_balances");
      if (freshPool) setLivePool((freshPool as any)?.aeps ?? null);

      setEditTxnWindowOpen(false);
      setEditingTxn(null);
      showToast("success", `✓ AEPS Transaction #${editingTxn.transaction_number} reconciled and updated!`);
    } catch (err: any) {
      console.error("Transaction edit error:", err);
      showToast("error", err.message || "Failed to update transaction.");
    } finally {
      setEditSubmitting(false);
    }
  }

  // Submit Initiation Guarded by Full Form Validation
  function handleInitiateTransaction() {
    if (!isFormValid || isSubmitting) {
      if (!selectedBankId) showToast("error", "Please select customer's bank.");
      else if (cleanAadhaar.length !== 4) showToast("error", "Please enter exactly 4 digits for Aadhaar.");
      else if (cleanMobile.length !== 10) showToast("error", "Please enter a valid 10-digit mobile number.");
      else if (operation === "withdrawal" && numAmount <= 0) showToast("error", "Please enter a withdrawal amount greater than ₹0.");
      return;
    }

    setConfirmWindowOpen(true);
  }

  // Process Completed AEPS Withdrawal with Double-Submit Lock
  async function handleProcessTransaction() {
    if (isSubmitting || !isFormValid) return;
    setIsSubmitting(true);

    try {
      const nowIso = new Date().toISOString();
      const dateStr = nowIso.slice(0, 10);

      const effectiveFeeSource = feeTreatment === "deduct" ? "cut_from_withdrawal" : "customer_paid_extra";
      const effectivePayMethod = feeTreatment === "separate" ? customerPayMethod : "cash";

      const rpcPayload: Record<string, any> = {
        p_service_type: "aeps",
        p_transaction_date: dateStr,
        p_transaction_timestamp: nowIso,
        p_customer_id: selectedCustomerId || null,
        p_customer_mobile: customerMobile.trim() || null,
        p_reference: reference.trim() || null,
        p_remarks: remarks.trim() || null,
        p_status: "success",
        p_bank_id: selectedBankId,
        p_portal_id: selectedPortalId,
        p_merchant_qr_id: null,
        p_aadhaar_last4: cleanAadhaar,
        p_transfer_method: null,
        p_sender_name: null,
        p_sender_mobile: null,
        p_beneficiary_name: null,
        p_beneficiary_mobile: null,
        p_beneficiary_bank: null,
        p_beneficiary_ifsc: null,
        p_beneficiary_account: null,
        p_upi_id: null,
        p_amount: numAmount,
        p_service_fee: numFee,
        p_portal_commission: numComm,
        p_fee_source: effectiveFeeSource,
        p_paid_from: "portal",
        p_customer_pay_method: effectivePayMethod,
        p_pay_from_instrument_id: portals.find((p) => p.id === selectedPortalId)?.payment_instrument_id || null,
        p_pay_from_method: "aeps_portal",
        p_receiver_name: null,
        p_portal_charge: 0,
      };

      let res = await supabase.rpc("create_business_txn", rpcPayload);
      if (res.error && (res.error.message?.includes("p_portal_charge") || res.error.message?.includes("schema cache"))) {
        const fallback = { ...rpcPayload };
        delete fallback.p_portal_charge;
        res = await supabase.rpc("create_business_txn", fallback);
      }

      if (res.error) throw res.error;

      const newTxnId = (res.data as any)?.id;
      const newTxnNum = (res.data as any)?.transaction_number || "AEP-NEW";

      const completedRecord: Txn = {
        id: newTxnId || crypto.randomUUID(),
        transaction_number: newTxnNum,
        service_type: "aeps",
        direction: "out",
        transaction_date: dateStr,
        transaction_timestamp: nowIso,
        customer_id: selectedCustomerId || null,
        customer_mobile: customerMobile.trim() || null,
        reference: reference.trim() || null,
        remarks: remarks.trim() || null,
        status: "success",
        bank_id: selectedBankId,
        portal_id: selectedPortalId,
        merchant_qr_id: null,
        provider_id: null,
        aadhaar_last4: cleanAadhaar,
        transfer_method: null,
        sender_name: null,
        sender_mobile: null,
        beneficiary_name: null,
        beneficiary_mobile: null,
        beneficiary_bank: null,
        beneficiary_ifsc: null,
        beneficiary_account: null,
        upi_id: null,
        amount: numAmount,
        service_fee: numFee,
        portal_commission: numComm,
        fee_source: effectiveFeeSource,
        paid_from: "portal",
        customer_pay_method: effectivePayMethod,
        customers: customers.find((c) => c.id === selectedCustomerId) || null,
        banks: banks.find((b) => b.id === selectedBankId) || null,
        portals: portals.find((p) => p.id === selectedPortalId) || null,
        providers: null,
        merchant_qrs: null,
        profiles: null,
      };

      setTransactions((prev) => [completedRecord, ...prev]);
      setConfirmWindowOpen(false);
      setSuccessTxn(completedRecord);

      // Clear input state after successful transaction
      setSelectedCustomerId("");
      setCustomerMobile("");
      setSelectedBankId("");
      setAadhaarLast4("");
      setAmount("");
      setServiceFee("");
      setPortalCommission("");
      setReference("");
      setRemarks("");
      setScannedReviewData(null);

      showToast("success", `₹${numAmount.toLocaleString("en-IN")} cash withdrawal completed. Cash handed: ₹${cashHanded.toLocaleString("en-IN")}`);
      await refreshData();
    } catch (err: any) {
      console.error("AEPS error:", err);
      showToast("error", err.message || "Failed to complete AEPS transaction.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Open WhatsApp Modal
  const handleOpenWhatsApp = (t: Txn) => {
    const rawPhone = t.customer_mobile || t.customers?.phone || "";
    const appUrl = typeof window !== "undefined" ? window.location.origin : "";
    const receiptUrl = `${appUrl}/receipt/business/${t.id}`;
    const cfg = getWhatsAppConfig();
    const template = cfg.templates?.aeps_confirmation || DEFAULT_WA_TEMPLATES.aeps_confirmation || "AEPS Cash Withdrawal: {amount} successful for {customer_name}. Ref: {txn_id}";

    const msg = renderWhatsAppTemplate(template, {
      shop_name: "SC Communications",
      service_name: "AEPS Cash Out",
      txn_id: t.transaction_number,
      txn_date: t.transaction_date,
      customer_name: t.customers?.name || "Customer",
      customer_name_line: t.customers?.name ? `👤 Customer: ${t.customers.name}\n` : "",
      amount: inr(Number(t.amount)),
      ref_number: t.reference || "-",
      status: t.status.toUpperCase(),
      receipt_url: receiptUrl,
    });

    setWaModal({
      open: true,
      phone: rawPhone,
      name: t.customers?.name || "Customer",
      msg,
      refNum: t.transaction_number,
      refId: t.id,
    });
  };

  // Export CSV
  const handleExportCsv = () => {
    const filename = `AEPS_CashOut_${new Date().toISOString().slice(0, 10)}.csv`;
    const headers = ["Txn Number", "Date", "Customer", "Mobile", "Aadhaar", "Bank", "Portal", "Amount", "Fee", "Commission", "Cash Handed", "Status", "RRN Reference"];
    const rows = filteredTxns.map((t) => [
      t.transaction_number,
      t.transaction_date,
      t.customers?.name || "Walk-in Customer",
      t.customer_mobile || t.customers?.phone || "",
      t.aadhaar_last4 ? `**** ${t.aadhaar_last4}` : "",
      t.banks?.name || "",
      t.portals?.name || "",
      Number(t.amount),
      Number(t.service_fee || 0),
      Number(t.portal_commission || 0),
      Number(t.fee_source === "cut_from_withdrawal" ? Math.max(0, Number(t.amount) - Number(t.service_fee || 0)) : t.amount),
      t.status,
      t.reference || "",
    ]);
    downloadCsv(filename, headers, rows);
    showToast("success", "Exported AEPS transactions.");
  };

  const recentTxn = transactions[0] || null;

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
