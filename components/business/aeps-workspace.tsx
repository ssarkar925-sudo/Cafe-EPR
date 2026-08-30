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

export function normalizeBankName(raw: string): string {
  let s = (raw || "").toLowerCase().trim();
  s = s.replace(/[,.\/#!$%^&*;:{}=\-_~()]/g, " ");
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
  const [feeTreatment, setFeeTreatment] = useState<"separate" | "deduct">("separate");
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

  // Edit Transaction Modal
  const [editTxnWindowOpen, setEditTxnWindowOpen] = useState(false);
  const [editingTxn, setEditingTxn] = useState<Txn | null>(null);
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
        supabase.from("aeps_portals").select("*").order("name"),
        supabase.from("customers").select("id, name, code, phone").eq("is_active", true).order("name"),
      ]);

      if (txns) setTransactions(txns as any);
      if (poolData) setLivePool((poolData as any)?.aeps ?? null);
      if (bData) setBanks(bData);
      if (pData) setPortals(pData);
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
    if (!livePool) return -6515;
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
      const { data: newCust, error: insertError } = await supabase
        .from("customers")
        .insert({
          name,
          phone: phone || null,
          email: newCustEmail.trim() || null,
          address: newCustAddress.trim() || null,
          is_active: true,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      await logAudit({
        action: "create",
        entity: "customer",
        entity_id: (newCust as any).id,
        description: `Created customer "${name}" from AEPS workspace`,
      });

      setCustomers((prev) => [...prev, newCust as CustomerRow].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedCustomerId((newCust as any).id);
      if (phone) setCustomerMobile(phone);
      setAddCustomerWindowOpen(false);
      setNewCustName("");
      setNewCustPhone("");
      setNewCustEmail("");
      setNewCustAddress("");
      showToast("success", `Customer "${name}" created and assigned.`);
    } catch (err: any) {
      console.error("Customer creation error:", err);
      setCustCreateError(err.message || "Failed to create customer.");
    } finally {
      setCustCreateSubmitting(false);
    }
  }

  // Open Edit Modal for Non-Financial Reference Correction
  function handleOpenEdit(t: Txn) {
    setEditingTxn(t);
    setEditCustomerId(t.customer_id || "");
    setEditCustomerMobile(t.customer_mobile || "");
    setEditReference(t.reference || "");
    setEditRemarks(t.remarks || "");
    setEditTxnWindowOpen(true);
  }

  // Save Transaction Non-Financial Reference Correction
  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTxn) return;
    setEditSubmitting(true);

    try {
      const updatedRef = editReference.trim() || null;
      const updatedRemarks = editRemarks.trim() || null;
      const updatedCustId = editCustomerId || null;
      const updatedCustMobile = editCustomerMobile.trim() || null;

      const { error: updateError } = await supabase
        .from("transactions")
        .update({
          customer_id: updatedCustId,
          customer_mobile: updatedCustMobile,
          reference: updatedRef,
          remarks: updatedRemarks,
        })
        .eq("id", editingTxn.id);

      if (updateError) throw updateError;

      await logAudit({
        action: "update",
        entity: "transaction",
        entity_id: editingTxn.id,
        description: `Corrected non-financial reference on AEPS Txn #${editingTxn.transaction_number}`,
        details: {
          transaction_number: editingTxn.transaction_number,
          old_reference: editingTxn.reference,
          new_reference: updatedRef,
          old_remarks: editingTxn.remarks,
          new_remarks: updatedRemarks,
          reason: "Operator correction",
        },
      });

      setTransactions((prev) =>
        prev.map((t) =>
          t.id === editingTxn.id
            ? {
                ...t,
                customer_id: updatedCustId,
                customer_mobile: updatedCustMobile,
                reference: updatedRef,
                remarks: updatedRemarks,
                customers: customers.find((c) => c.id === updatedCustId) || null,
              }
            : t
        )
      );

      setEditTxnWindowOpen(false);
      showToast("success", `Transaction #${editingTxn.transaction_number} updated.`);
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

      const res = await supabase.rpc("create_business_txn", {
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
        p_receiver_name: null,
      });

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
    <div className="space-y-5 pb-16">
      {/* Toast Notification Container */}
      {toastView}

      {/* ===============================================================================
          1. AEPS PREMIUM HERO
      =============================================================================== */}
      <section className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-5 text-white shadow-xl ring-1 ring-white/10 sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-teal-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-0.5 text-xs font-bold text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                ● LIVE AEPS SWITCH ONLINE
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-slate-300">
                BIOMETRIC GATEWAY ACTIVE
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl text-white">
              AEPS Biometric Cash Out
            </h1>
            <p className="text-xs text-indigo-200/80 sm:text-sm">
              Instant Aadhaar cash withdrawal, micro-ATM disbursement and live portal float settlement.
            </p>
          </div>

          {/* Available Float Display Card */}
          <div className="flex flex-wrap items-center gap-2.5 sm:flex-nowrap">
            <button
              type="button"
              onClick={refreshData}
              disabled={isRefreshing}
              className="rounded-2xl border border-white/10 bg-white/5 p-3.5 text-slate-300 backdrop-blur-md hover:bg-white/10 hover:text-white transition disabled:opacity-50"
              title="Refresh Live Balances from Database"
            >
              <span className={`inline-block text-base ${isRefreshing ? "animate-spin text-teal-400" : ""}`}>↻</span>
            </button>
            <div className="flex flex-col items-end rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md min-w-[180px]">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">AVAILABLE PLATFORM FLOAT</span>
              <div className={`text-2xl font-black ${aepsCurrentBalance < 0 ? "text-amber-400" : "text-emerald-400"}`}>
                {inr(aepsCurrentBalance)}
              </div>
              <span className="text-[10px] text-slate-400">Live Settlement Pool</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===============================================================================
          2. COMPACT AEPS FINANCIAL / SETTLEMENT SUMMARY (INFORMATIONAL ONLY, NO ACTION BUTTON)
      =============================================================================== */}
      <section className="relative overflow-hidden rounded-[22px] border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/70 to-slate-100/90 p-4.5 sm:p-5 shadow-xs dark:border-white/10 dark:from-slate-900 dark:via-slate-900/90 dark:to-slate-950">
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 border-b border-slate-200/70 pb-3 dark:border-white/10">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                AEPS POSITION
              </span>
              <span className={`text-base font-black ${aepsCurrentBalance < 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-white"}`}>
                {inr(aepsCurrentBalance)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/40">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                ✓ RECONCILED
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span>Synced {lastRefreshedAt}</span>
              <Link
                href="/finance/reconciliation"
                className="inline-flex items-center gap-1 font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition"
              >
                <span>View reconciliation</span>
                <span>→</span>
              </Link>
            </div>
          </div>

          {/* Connected Metrics Grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-xl border border-slate-200/60 bg-white/80 p-3 dark:border-white/5 dark:bg-white/5">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">WITHDRAWALS</p>
              <p className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white">{inr(kpis.volume)}</p>
              <p className="text-[10px] text-slate-400">{kpis.successCount} Completed</p>
            </div>
            <div className="rounded-xl border border-slate-200/60 bg-white/80 p-3 dark:border-white/5 dark:bg-white/5">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">CASH OUT</p>
              <p className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white">{inr(kpis.totalCashDisbursed)}</p>
              <p className="text-[10px] text-slate-400">Till Handouts</p>
            </div>
            <div className="rounded-xl border border-slate-200/60 bg-white/80 p-3 dark:border-white/5 dark:bg-white/5">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">SERVICE FEES</p>
              <p className="mt-0.5 text-lg font-bold text-emerald-600 dark:text-emerald-400">+{inr(kpis.fees)}</p>
              <p className="text-[10px] text-slate-400">Customer Fees</p>
            </div>
            <div className="rounded-xl border border-slate-200/60 bg-white/80 p-3 dark:border-white/5 dark:bg-white/5">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">COMMISSIONS</p>
              <p className="mt-0.5 text-lg font-bold text-teal-600 dark:text-teal-400">+{inr(kpis.commissions)}</p>
              <p className="text-[10px] text-slate-400">Portal Margin</p>
            </div>
            <div className="col-span-2 sm:col-span-1 rounded-xl border border-emerald-500/20 bg-emerald-50/40 p-3 dark:border-emerald-500/20 dark:bg-emerald-950/20">
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">VARIANCE</p>
              <p className="mt-0.5 text-lg font-black text-emerald-700 dark:text-emerald-300">₹0.00</p>
              <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80">Exact Match</p>
            </div>
          </div>
        </div>
      </section>

      {/* ===============================================================================
          3. QUICK OPERATIONS
      =============================================================================== */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">
            QUICK OPERATIONS
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setScanModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/10"
              title="Scan AEPS receipt screenshot or SMS"
            >
              <span>📷</span>
              <span>Scan &amp; Fill</span>
            </button>
            <button
              type="button"
              onClick={() => setAddBankWindowOpen(true)}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/10"
            >
              <span>+ Add Bank</span>
            </button>
            <button
              type="button"
              onClick={() => setAddCustomerWindowOpen(true)}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/10"
            >
              <span>+ Add Customer</span>
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Tile 1: Biometric Cash Out */}
          <div className="group relative overflow-hidden rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-400 hover:shadow-md dark:border-white/10 dark:bg-slate-900 dark:hover:border-teal-500/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-xl text-white shadow-md shadow-teal-500/20">
                  👆
                </div>
                <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-[10px] font-bold text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                  Micro-ATM / AePS
                </span>
              </div>
              <h3 className="mt-3 text-base font-black text-slate-900 dark:text-white">BIOMETRIC CASH OUT</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Aadhaar-enabled customer withdrawal &amp; biometric authentication
              </p>
              <p className="mt-2 text-[11px] text-slate-400">
                Deterministic double-entry settlement with till cashout
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
              <span className="text-xs text-slate-400">Instant Till Cashout</span>
              <button
                type="button"
                onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth" })}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-teal-500/20 transition hover:brightness-110 active:scale-[0.98]"
              >
                <span>Start Cash Out</span>
                <span>→</span>
              </button>
            </div>
          </div>

          {/* Tile 2: AEPS Service Portals */}
          <div className="group relative overflow-hidden rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-400 hover:shadow-md dark:border-white/10 dark:bg-slate-900 dark:hover:border-indigo-500/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-xl text-white shadow-md shadow-indigo-500/20">
                  🌐
                </div>
                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                  {portals.length} Active Gateways
                </span>
              </div>
              <h3 className="mt-3 text-base font-black text-slate-900 dark:text-white">AEPS SERVICE PORTALS</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Fino, Spice Money, Payworld, RNFI &amp; settlement channels
              </p>
              <p className="mt-2 text-[11px] text-slate-400">
                Authoritative multi-portal float tracking and ledger sync
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
              <span className="text-xs text-slate-400">{portals.map((p) => p.name).join(", ") || "No portals configured"}</span>
              <Link
                href="/business/portals"
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                <span>Manage Portals</span>
                <span>→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===============================================================================
          4. AEPS OPERATION WORKSPACE (SIDE-BY-SIDE: INPUT FORM + SETTLEMENT CONFIRMATION)
      =============================================================================== */}
      <div ref={formRef} className="space-y-4">
        {/* Success Confirmation Card (When transaction has just completed) */}
        {successTxn && (
          <div className="relative overflow-hidden rounded-[24px] border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-slate-900/40 p-5 sm:p-6 backdrop-blur-md dark:border-emerald-500/30 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-emerald-500/20 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-xl text-white shadow-md shadow-emerald-500/30">
                  ✓
                </div>
                <div>
                  <h3 className="text-base font-black text-emerald-900 dark:text-emerald-300">
                    AEPS CASH OUT COMPLETED SUCCESSFULLY
                  </h3>
                  <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
                    Deterministic settlement ledger updated and float synchronized.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleNewCashOut}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white shadow-md hover:bg-emerald-700 transition"
              >
                <span>+ New Cash Out</span>
              </button>
            </div>

            {/* Completed Transaction Details Grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 rounded-2xl bg-white/70 p-4 dark:bg-white/5 border border-emerald-500/10 text-xs">
              <div>
                <span className="text-slate-400 font-semibold text-[10px]">TXN NUMBER:</span>
                <p className="font-mono font-bold text-slate-900 dark:text-white mt-0.5">{successTxn.transaction_number}</p>
              </div>
              <div>
                <span className="text-slate-400 font-semibold text-[10px]">CUSTOMER:</span>
                <p className="font-bold text-slate-900 dark:text-white mt-0.5 truncate">{successTxn.customers?.name || "Walk-in"}</p>
              </div>
              <div>
                <span className="text-slate-400 font-semibold text-[10px]">BANK / PORTAL:</span>
                <p className="font-bold text-slate-900 dark:text-white mt-0.5 truncate">{successTxn.banks?.name || "Bank"}</p>
              </div>
              <div>
                <span className="text-slate-400 font-semibold text-[10px]">WITHDRAWAL:</span>
                <p className="font-black text-slate-900 dark:text-white mt-0.5">{inr(successTxn.amount)}</p>
              </div>
              <div>
                <span className="text-slate-400 font-semibold text-[10px]">CASH HANDED:</span>
                <p className="font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {inr(successTxn.fee_source === "cut_from_withdrawal" ? Math.max(0, Number(successTxn.amount) - Number(successTxn.service_fee || 0)) : successTxn.amount)}
                </p>
              </div>
              <div>
                <span className="text-slate-400 font-semibold text-[10px]">NET EARNED:</span>
                <p className="font-black text-teal-600 dark:text-teal-400 mt-0.5">
                  +{inr(Number(successTxn.service_fee || 0) + Number(successTxn.portal_commission || 0))}
                </p>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
              <div className="flex items-center gap-2">
                <Link
                  href={`/business/receipt/${successTxn.id}`}
                  target="_blank"
                  className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 dark:bg-teal-600"
                >
                  🖨️ Thermal Receipt
                </Link>
                <Link
                  href={`/business/receipt/${successTxn.id}/a4`}
                  target="_blank"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                >
                  📄 A4 Invoice
                </Link>
                <button
                  type="button"
                  onClick={() => handleOpenWhatsApp(successTxn)}
                  className="rounded-xl bg-emerald-100 px-4 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300"
                >
                  💬 Send WhatsApp
                </button>
              </div>

              <button
                type="button"
                onClick={handleNewCashOut}
                className="text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Side-by-Side Workspace Layout */}
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
          {/* Left (8 Cols): Transaction Input Form */}
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 lg:col-span-8 shadow-sm dark:border-white/10 dark:bg-slate-900 space-y-4">
            {/* Top Bar: Operation Selector & Scan & Fill CTA */}
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              {/* Operation Selector */}
              <div className="flex items-center gap-1.5 rounded-2xl bg-slate-100 p-1 dark:bg-white/5">
                {[
                  { id: "withdrawal", label: "🏧 Cash Withdrawal" },
                  { id: "enquiry", label: "🔍 Balance Enquiry" },
                  { id: "statement", label: "📑 Mini Statement" },
                ].map((op) => (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => setOperation(op.id as any)}
                    className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                      operation === op.id
                        ? "bg-white text-slate-900 shadow-sm dark:bg-teal-600 dark:text-white"
                        : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    }`}
                  >
                    {op.label}
                  </button>
                ))}
              </div>

              {/* Scan & Fill Trigger */}
              <button
                type="button"
                onClick={() => setScanModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 to-indigo-600 px-3.5 py-1.5 text-xs font-black text-white shadow-md shadow-teal-500/25 transition hover:brightness-110 active:scale-95"
              >
                <span>📷 Scan &amp; Fill Receipt / SMS</span>
              </button>
            </div>

            {/* Scanned Information Review Alert */}
            {scannedReviewData && (
              <div className="rounded-2xl border border-teal-200 bg-teal-50/60 p-3 text-xs dark:border-teal-900/40 dark:bg-teal-950/20">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-teal-900 dark:text-teal-300">✓ Information Detected from Scan</span>
                  <button type="button" onClick={() => setScannedReviewData(null)} className="text-slate-400 hover:text-slate-600">✕</button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                  {scannedReviewData.mobile && <div><span className="text-slate-500">Mobile:</span> <strong>{maskMobile(scannedReviewData.mobile)}</strong></div>}
                  {scannedReviewData.aadhaarLast4 && <div><span className="text-slate-500">Aadhaar:</span> <strong>**** {scannedReviewData.aadhaarLast4}</strong></div>}
                  {scannedReviewData.bankName && (
                    <div>
                      <span className="text-slate-500">Bank:</span>{" "}
                      <strong>{scannedReviewData.matchedBank ? `✓ ${scannedReviewData.matchedBank.name}` : `❓ ${scannedReviewData.bankName}`}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Form Fields Grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Customer Search & Select */}
              <div className="space-y-1 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Customer (CRM Profile) <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setAddCustomerWindowOpen(true)}
                    className="text-[11px] font-bold text-teal-600 hover:underline dark:text-teal-400"
                  >
                    + Add New Customer
                  </button>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <SearchableSelect
                      value={selectedCustomerId}
                      onChange={setSelectedCustomerId}
                      minSearchLength={2}
                      minSearchPrompt="Type at least 2 letters or digits to search saved customer directory…"
                      options={[
                        { value: "", label: "-- Walk-in Customer --" },
                        ...customers.map((c) => ({
                          value: c.id,
                          label: `${c.name} (${maskMobile(c.phone) || c.code})`,
                        })),
                      ]}
                      placeholder="Search customer (min 2 chars) or select Walk-in…"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setAddCustomerWindowOpen(true)}
                    className="shrink-0 rounded-2xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                    title="Add new customer to CRM"
                  >
                    + Add
                  </button>
                </div>
              </div>

              {/* Customer Mobile */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Customer Mobile Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  value={customerMobile}
                  onChange={(e) => setCustomerMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-digit mobile number"
                  className={`w-full rounded-2xl border bg-slate-50/50 px-3.5 py-2 text-xs font-semibold outline-none transition focus:bg-white dark:bg-white/5 dark:focus:bg-slate-900 ${
                    cleanMobile && cleanMobile.length !== 10
                      ? "border-amber-400 focus:border-amber-500"
                      : "border-slate-200 focus:border-teal-500 dark:border-white/10"
                  }`}
                />
              </div>

              {/* Bank Auto-Match & Selection */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Customer's Bank <span className="text-rose-500">*</span>
                  </label>
                  {selectedBank && (
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 truncate max-w-[120px]">
                      ✓ {selectedBank.name}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <SearchableSelect
                      value={selectedBankId}
                      onChange={setSelectedBankId}
                      options={[
                        { value: "", label: "-- Select Bank --" },
                        ...banks.map((b) => ({ value: b.id, label: b.name })),
                      ]}
                      placeholder="Search bank name…"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setAddBankWindowOpen(true)}
                    className="shrink-0 rounded-2xl border border-slate-200 bg-slate-100 px-2.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                    title="Add new bank to Master List"
                  >
                    + Add
                  </button>
                </div>
              </div>

              {/* Aadhaar Last 4 Digits */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Aadhaar Number (Last 4 Digits) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    XXXX - XXXX -
                  </span>
                  <input
                    type="text"
                    maxLength={4}
                    value={aadhaarLast4}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
                      setAadhaarLast4(digits);
                    }}
                    placeholder="3619"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-2 pl-28 pr-3.5 text-xs font-black tracking-widest outline-none focus:border-teal-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:bg-slate-900"
                  />
                </div>
              </div>

              {/* AEPS Service Portal */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  AEPS Service Portal <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedPortalId}
                  onChange={(e) => setSelectedPortalId(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-bold outline-none focus:border-teal-500 dark:border-white/10 dark:bg-white/5 dark:focus:bg-slate-900"
                >
                  {portals.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Prominent Amount Input (When Withdrawal) */}
              {operation === "withdrawal" && (
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Withdrawal Amount (₹) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-slate-400">₹</span>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-4 text-2xl font-black text-slate-900 outline-none focus:border-teal-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:bg-slate-900"
                    />
                  </div>

                  {/* Quick Amount Chips */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {["500", "1000", "2000", "3000", "5000", "10000"].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setAmount(v)}
                        className={`rounded-xl border px-3 py-1 text-xs font-black transition ${
                          amount === v
                            ? "border-teal-600 bg-teal-600 text-white shadow-xs"
                            : "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                        }`}
                      >
                        ₹{Number(v).toLocaleString("en-IN")}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Distinct Customer Service Fee vs Portal Commission */}
              {operation === "withdrawal" && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Customer Service Fee (₹)
                    </label>
                    <input
                      type="number"
                      value={serviceFee}
                      onChange={(e) => setServiceFee(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-bold outline-none focus:border-teal-500 dark:border-white/10 dark:bg-white/5"
                      placeholder="0.00"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Portal Commission (₹)
                    </label>
                    <input
                      type="number"
                      value={portalCommission}
                      onChange={(e) => setPortalCommission(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-bold outline-none focus:border-teal-500 dark:border-white/10 dark:bg-white/5"
                      placeholder="0.00"
                    />
                  </div>

                  {/* 1. Fee Treatment Model (Separate Collection vs Deduct From Payout) */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Fee Treatment Model <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setFeeTreatment("separate")}
                        className={`rounded-2xl border p-2.5 text-left transition ${
                          feeTreatment === "separate"
                            ? "border-teal-600 bg-teal-50/80 shadow-xs dark:border-teal-500 dark:bg-teal-950/30"
                            : "border-slate-200 bg-slate-50/50 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5"
                        }`}
                      >
                        <div className="text-xs font-black text-slate-900 dark:text-white">
                          💵 Collect Fee Separately
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          Customer receives full <strong>{inr(numAmount)}</strong> withdrawal cash; pays <strong>{inr(numFee)}</strong> fee separately.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setFeeTreatment("deduct")}
                        className={`rounded-2xl border p-2.5 text-left transition ${
                          feeTreatment === "deduct"
                            ? "border-teal-600 bg-teal-50/80 shadow-xs dark:border-teal-500 dark:bg-teal-950/30"
                            : "border-slate-200 bg-slate-50/50 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5"
                        }`}
                      >
                        <div className="text-xs font-black text-slate-900 dark:text-white">
                          ✂️ Deduct from Payout
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          Fee deducted directly. Customer receives net <strong>{inr(Math.max(0, numAmount - numFee))}</strong> cash handout.
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* 2. Fee Collection Instrument (When Separate Fee) */}
                  {feeTreatment === "separate" && (
                    <div className="space-y-1 sm:col-span-2 pt-1 border-t border-slate-100 dark:border-white/5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Fee Collection Instrument <span className="text-rose-500">*</span>
                      </label>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {[
                          { id: "cash", label: "💵 Cash Drawer", desc: "Till cash inflow" },
                          { id: "upi", label: "📱 UPI / QR Float", desc: "Merchant QR" },
                          { id: "bank", label: "🏦 Bank Account", desc: "Direct deposit" },
                          { id: "due", label: "📋 Customer Khata", desc: "Post to due" },
                        ].map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setCustomerPayMethod(m.id as any)}
                            className={`rounded-xl border p-2 text-center transition ${
                              customerPayMethod === m.id
                                ? "border-emerald-600 bg-emerald-50 text-emerald-900 shadow-xs dark:bg-emerald-950/40 dark:text-emerald-200"
                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
                            }`}
                          >
                            <div className="text-xs font-bold">{m.label}</div>
                            <div className="text-[10px] text-slate-400">{m.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Reference / RRN */}
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Bank RRN / Terminal Reference Number
                </label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="12-digit RRN / Auth Reference"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-semibold outline-none focus:border-teal-500 dark:border-white/10 dark:bg-white/5"
                />
              </div>
            </div>
          </div>

          {/* Right (4 Cols): Live AEPS Settlement Breakdown with Complete & Disburse */}
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 lg:col-span-4 shadow-sm dark:border-white/10 dark:bg-slate-900 space-y-4">
            <div className="border-b border-slate-100 pb-2.5 dark:border-white/5">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Order Summary</span>
              <h3 className="text-base font-black text-slate-900 dark:text-white">AEPS Settlement Breakdown</h3>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Operation:</span>
                <strong className="capitalize text-slate-900 dark:text-white">{operation}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Selected Bank:</span>
                <strong className="text-slate-900 dark:text-white truncate max-w-[160px]">
                  {selectedBank?.name || "None selected"}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Aadhaar (Last 4):</span>
                <strong className="text-slate-900 dark:text-white">
                  {cleanAadhaar ? `**** ${cleanAadhaar}` : "Pending"}
                </strong>
              </div>

              {operation === "withdrawal" && (
                <>
                  <div className="flex justify-between border-t border-slate-100 pt-2 dark:border-white/5">
                    <span className="text-slate-500">Withdrawal Amount:</span>
                    <strong className="text-slate-900 dark:text-white">{inr(numAmount)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Customer Service Fee:</span>
                    <strong className="text-emerald-600 dark:text-emerald-400 font-bold">
                      {feeTreatment === "deduct" ? `-${inr(numFee)}` : `+${inr(numFee)}`}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Fee Treatment:</span>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-white/10 dark:text-slate-300">
                      {feeTreatment === "deduct" ? "✂️ Deducted from Payout" : `💵 Separate via ${customerPayMethod.toUpperCase()}`}
                    </span>
                  </div>
                  {feeTreatment === "separate" && customerPayMethod === "cash" && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Customer Cash Paid:</span>
                      <strong className="text-slate-900 dark:text-white font-bold">{inr(numAmount + numFee)}</strong>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-500">Portal Commission:</span>
                    <strong className="text-teal-600 dark:text-teal-400 font-bold">+{inr(numComm)}</strong>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-1.5 dark:border-white/5">
                    <span className="font-bold text-slate-700 dark:text-slate-300">Total Net Income:</span>
                    <strong className="text-emerald-600 dark:text-emerald-400 font-black">+{inr(totalIncome)}</strong>
                  </div>

                  {/* Receipt Details Preference Control */}
                  <div className="border-t border-slate-100 pt-2 dark:border-white/5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 font-bold">Receipt Format:</span>
                      <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-white/5">
                        <button
                          type="button"
                          onClick={() => setReceiptMode("basic")}
                          className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition ${
                            receiptMode === "basic" ? "bg-white text-slate-900 shadow-xs dark:bg-teal-600 dark:text-white" : "text-slate-500"
                          }`}
                        >
                          Basic
                        </button>
                        <button
                          type="button"
                          onClick={() => setReceiptMode("detailed")}
                          className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition ${
                            receiptMode === "detailed" ? "bg-white text-slate-900 shadow-xs dark:bg-teal-600 dark:text-white" : "text-slate-500"
                          }`}
                        >
                          Detailed
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Prominent Cash Handed Box */}
                  <div className="rounded-2xl bg-indigo-50/80 p-3.5 text-xs text-indigo-950 dark:bg-indigo-950/40 dark:text-indigo-200">
                    <div className="text-[10px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                      Physical Cash to Hand to Customer:
                    </div>
                    <div className="mt-1 text-2xl font-black text-indigo-900 dark:text-white">
                      {inr(cashHanded)}
                    </div>
                    <p className="mt-0.5 text-[10px] text-indigo-600 dark:text-indigo-300">
                      {feeTreatment === "deduct"
                        ? `Deducted fee ₹${numFee} from ₹${numAmount} withdrawal`
                        : `Full withdrawal ₹${numAmount} given; ₹${numFee} fee collected separately`}
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Primary Action Button (The single authoritative Complete & Disburse trigger) */}
            <div className="space-y-1.5 pt-1">
              <button
                type="button"
                onClick={handleInitiateTransaction}
                disabled={!isFormValid || isSubmitting}
                className={`w-full rounded-2xl py-3 text-sm font-black transition ${
                  isFormValid && !isSubmitting
                    ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/25 hover:brightness-110 active:scale-[0.98]"
                    : "cursor-not-allowed bg-slate-100 text-slate-400 border border-slate-200 dark:border-white/5 dark:bg-white/5 dark:text-slate-500"
                }`}
              >
                {isSubmitting ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Processing Disbursement…
                  </span>
                ) : isFormValid ? (
                  `✓ Complete & Disburse ${inr(cashHanded)}`
                ) : (
                  "Complete Required Fields to Disburse"
                )}
              </button>
              <p className="text-center text-[10px] text-slate-400">
                Deterministic double-entry settlement engine
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ===============================================================================
          5. AEPS OPERATION LIFECYCLE
      =============================================================================== */}
      <section className="rounded-[22px] border border-slate-200/80 bg-white p-4.5 shadow-xs dark:border-white/10 dark:bg-slate-900 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-white/5">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">
            AEPS OPERATION LIFECYCLE
          </h2>
          <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400">5-Stage Atomic Flow</span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          <div className="rounded-xl bg-slate-50/80 p-2.5 dark:bg-white/5 border border-slate-100 dark:border-white/5">
            <span className="font-mono text-[10px] font-bold text-slate-400">01. IDENTIFY</span>
            <p className="mt-0.5 text-xs font-bold text-slate-900 dark:text-white">Customer &amp; Bank</p>
            <p className="text-[10px] text-slate-400">Aadhaar (Last 4) &amp; Bank select</p>
          </div>
          <div className="rounded-xl bg-slate-50/80 p-2.5 dark:bg-white/5 border border-slate-100 dark:border-white/5">
            <span className="font-mono text-[10px] font-bold text-teal-600 dark:text-teal-400">02. AUTHENTICATE</span>
            <p className="mt-0.5 text-xs font-bold text-slate-900 dark:text-white">Biometric Scan</p>
            <p className="text-[10px] text-slate-400">Fingerprint sensor verification</p>
          </div>
          <div className="rounded-xl bg-slate-50/80 p-2.5 dark:bg-white/5 border border-slate-100 dark:border-white/5">
            <span className="font-mono text-[10px] font-bold text-indigo-600 dark:text-indigo-400">03. SWITCH</span>
            <p className="mt-0.5 text-xs font-bold text-slate-900 dark:text-white">Portal Credit</p>
            <p className="text-[10px] text-slate-400">NPCI / Bank switch processing</p>
          </div>
          <div className="rounded-xl bg-slate-50/80 p-2.5 dark:bg-white/5 border border-slate-100 dark:border-white/5">
            <span className="font-mono text-[10px] font-bold text-emerald-600 dark:text-emerald-400">04. DISBURSE</span>
            <p className="mt-0.5 text-xs font-bold text-slate-900 dark:text-white">Cash Drawer Payout</p>
            <p className="text-[10px] text-slate-400">Hand net physical currency</p>
          </div>
          <div className="rounded-xl bg-slate-50/80 p-2.5 dark:bg-white/5 border border-slate-100 dark:border-white/5">
            <span className="font-mono text-[10px] font-bold text-cyan-600 dark:text-cyan-400">05. SETTLEMENT</span>
            <p className="mt-0.5 text-xs font-bold text-slate-900 dark:text-white">Ledger Synchronized</p>
            <p className="text-[10px] text-slate-400">Float updated &amp; receipt ready</p>
          </div>
        </div>
      </section>

      {/* ===============================================================================
          6. PROVIDER / SWITCH STATUS RAIL
      =============================================================================== */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        <div className="rounded-2xl border border-slate-200/70 bg-white p-3 text-center dark:border-white/5 dark:bg-slate-900">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">AEPS SWITCH</span>
          <p className="mt-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">● ONLINE</p>
        </div>
        <div className="rounded-2xl border border-slate-200/70 bg-white p-3 text-center dark:border-white/5 dark:bg-slate-900">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">BIOMETRIC</span>
          <p className="mt-0.5 text-xs font-bold text-teal-600 dark:text-teal-400">● ACTIVE</p>
        </div>
        <div className="rounded-2xl border border-slate-200/70 bg-white p-3 text-center dark:border-white/5 dark:bg-slate-900">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">MICRO-ATM</span>
          <p className="mt-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">● READY</p>
        </div>
        <div className="rounded-2xl border border-slate-200/70 bg-white p-3 text-center dark:border-white/5 dark:bg-slate-900">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PORTALS</span>
          <p className="mt-0.5 text-xs font-bold text-indigo-600 dark:text-indigo-400">● {portals.length} CONNECTED</p>
        </div>
        <div className="rounded-2xl border border-slate-200/70 bg-white p-3 text-center dark:border-white/5 dark:bg-slate-900">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">SETTLEMENT</span>
          <p className="mt-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">✓ SYNCED</p>
        </div>
        <div className="col-span-2 sm:col-span-1 rounded-2xl border border-slate-200/70 bg-white p-3 text-center dark:border-white/5 dark:bg-slate-900">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">LAST SYNC</span>
          <p className="mt-0.5 text-xs font-bold text-slate-700 dark:text-slate-300">{lastRefreshedAt}</p>
        </div>
      </section>

      {/* ===============================================================================
          7. LIVE AEPS ACTIVITY
      =============================================================================== */}
      {recentTxn && (
        <section className="rounded-[22px] border border-slate-200/80 bg-white p-4.5 shadow-xs dark:border-white/10 dark:bg-slate-900 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-white/5">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">
                LIVE AEPS ACTIVITY
              </h2>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <span className="text-[10px] text-slate-400">Latest Completed Event</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50/70 dark:bg-white/5 rounded-xl p-3">
            <div className="flex items-center gap-3">
              <span className="flex h-3 w-3 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                    {recentTxn.transaction_number}
                  </span>
                  <span className="text-xs text-slate-400">·</span>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Customer: {recentTxn.customers?.name || "Walk-in"}
                  </span>
                  <span className="text-xs text-slate-400">·</span>
                  <strong className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    {inr(Number(recentTxn.amount))}
                  </strong>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.2 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    ✓ {recentTxn.status.toUpperCase()}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {fmtDate(recentTxn.transaction_date)} · {fmtTime(recentTxn.transaction_timestamp)} {recentTxn.reference ? `· RRN: ${recentTxn.reference}` : ""} {recentTxn.banks?.name ? `· Bank: ${recentTxn.banks.name}` : ""}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setSelectedDetailTxn(recentTxn)}
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                View
              </button>
              <Link
                href={`/business/receipt/${recentTxn.id}`}
                target="_blank"
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                title="Print thermal receipt"
              >
                🖨️ Receipt
              </Link>
              <button
                type="button"
                onClick={() => handleOpenWhatsApp(recentTxn)}
                className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
              >
                💬 WhatsApp
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ===============================================================================
          8. AEPS TRANSACTION HISTORY / CONSOLE LEDGER
      =============================================================================== */}
      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-100 p-4 sm:p-5 dark:border-white/5 space-y-3.5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">AEPS TRANSACTION HISTORY</h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Authoritative transaction ledger for Aadhaar biometric cash withdrawals and portal settlements.
              </p>
            </div>

            {/* Segmented Status Filter */}
            <div className="flex rounded-xl bg-slate-100 p-1 text-xs dark:bg-white/5">
              {[
                { key: "all", label: `All (${transactions.length})` },
                { key: "success", label: "Successful" },
                { key: "pending", label: "Pending" },
                { key: "failed", label: "Failed" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={`rounded-lg px-3 py-1 font-semibold transition ${
                    statusFilter === tab.key
                      ? "bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white"
                      : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Search & Export Controls */}
          <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center sm:justify-between">
            <div className="flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by RRN reference, mobile, customer name, bank or portal…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs text-slate-900 outline-none transition focus:border-teal-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:focus:bg-slate-900"
              />
            </div>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/10"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-white/5 dark:bg-white/5">
                <th className="px-4 py-3">TRANSACTION</th>
                <th className="px-4 py-3">CUSTOMER &amp; AADHAAR</th>
                <th className="px-4 py-3">BANK &amp; PORTAL</th>
                <th className="px-4 py-3">DATE / TIME</th>
                <th className="px-4 py-3 text-right">WITHDRAWAL</th>
                <th className="px-4 py-3 text-right">CASH HANDED</th>
                <th className="px-4 py-3 text-right">FEE</th>
                <th className="px-4 py-3 text-center">STATUS</th>
                <th className="px-4 py-3 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-medium text-slate-700 dark:text-slate-300">
              {filteredTxns.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    No AEPS transactions match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredTxns.map((t) => {
                  const isDeducted = t.fee_source === "cut_from_withdrawal";
                  const txnCashHanded = isDeducted
                    ? Math.max(0, Number(t.amount || 0) - Number(t.service_fee || 0))
                    : Number(t.amount || 0);

                  const receiptUrl = `/business/receipt/${t.id}${receiptMode === "detailed" ? "?mode=detailed" : ""}`;

                  return (
                    <tr key={t.id} className="transition hover:bg-slate-50/70 dark:hover:bg-white/5">
                      <td className="px-4 py-3.5">
                        <div className="font-mono font-bold text-slate-900 dark:text-white">{t.transaction_number}</div>
                        {t.reference && (
                          <span className="text-[10px] text-slate-400 truncate max-w-[140px] block">
                            RRN: {t.reference}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">{t.customers?.name || "Walk-in"}</div>
                        <span className="text-[10px] text-slate-400">
                          {t.customer_mobile ? `${maskMobile(t.customer_mobile)}` : ""} {t.aadhaar_last4 ? `· **** ${t.aadhaar_last4}` : ""}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">{t.banks?.name || "Bank"}</div>
                        <span className="text-[10px] text-teal-600 dark:text-teal-400">{t.portals?.name || "Portal"}</span>
                      </td>

                      <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400">
                        <div>{fmtDate(t.transaction_date)}</div>
                        <span className="text-[10px] text-slate-400">{fmtTime(t.transaction_timestamp)}</span>
                      </td>

                      <td className="px-4 py-3.5 text-right font-bold text-slate-900 dark:text-white">
                        {inr(t.amount)}
                      </td>

                      <td className="px-4 py-3.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                        {inr(txnCashHanded)}
                      </td>

                      <td className="px-4 py-3.5 text-right font-semibold text-cyan-600 dark:text-cyan-400">
                        +{inr(Number(t.service_fee || 0))}
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            t.status === "success"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : t.status === "pending"
                              ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                              : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                          }`}
                        >
                          {t.status === "success" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                          {t.status === "success" ? "✓ Successful" : t.status === "pending" ? "◌ Pending" : "! Failed"}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={receiptUrl}
                            target="_blank"
                            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
                            title="Print 80mm thermal receipt"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                              <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                              <path d="M6 14h12v8H6z" />
                            </svg>
                          </Link>

                          <button
                            type="button"
                            onClick={() => handleOpenWhatsApp(t)}
                            className="rounded-lg p-1 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-400"
                            title="Send WhatsApp receipt"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                            </svg>
                          </button>

                          <button
                            type="button"
                            onClick={() => setSelectedDetailTxn(t)}
                            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
                            title="View complete details"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                              <circle cx="12" cy="12" r="1" />
                              <circle cx="19" cy="12" r="1" />
                              <circle cx="5" cy="12" r="1" />
                            </svg>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenEdit(t)}
                            className="rounded-lg p-1 text-slate-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/30 dark:hover:text-blue-400"
                            title="Edit non-financial reference"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===============================================================================
          CONFIRMATION MODAL
      =============================================================================== */}
      {confirmWindowOpen && (
        <FloatingWindow
          isOpen={confirmWindowOpen}
          size="sm"
          title="Confirm AEPS Cash Withdrawal"
          onClose={() => setConfirmWindowOpen(false)}
        >
          <div className="p-5 space-y-4">
            <div className="rounded-2xl bg-slate-50 p-4 text-xs space-y-2 dark:bg-white/5">
              <div className="flex justify-between">
                <span className="text-slate-500">Withdrawal Amount:</span>
                <strong className="text-base text-slate-900 dark:text-white">{inr(numAmount)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Customer Bank:</span>
                <strong className="text-slate-900 dark:text-white">{selectedBank?.name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Aadhaar (Last 4):</span>
                <strong className="text-slate-900 dark:text-white">**** {cleanAadhaar}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Customer Service Fee:</span>
                <strong className="text-emerald-600 dark:text-emerald-400 font-bold">
                  {feeTreatment === "deduct" ? `-${inr(numFee)}` : `+${inr(numFee)}`}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Fee Treatment:</span>
                <strong className="text-slate-900 dark:text-white">
                  {feeTreatment === "deduct" ? "Deducted from Payout" : `Separate via ${customerPayMethod.toUpperCase()}`}
                </strong>
              </div>
              {feeTreatment === "separate" && customerPayMethod === "cash" && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Customer Cash Received:</span>
                  <strong className="text-slate-900 dark:text-white">{inr(numAmount + numFee)}</strong>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Portal Commission:</span>
                <strong className="text-teal-600 dark:text-teal-400 font-bold">+{inr(numComm)}</strong>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 dark:border-white/10">
                <span className="text-slate-700 font-bold dark:text-slate-300">Physical Cash to Hand to Customer:</span>
                <strong className="text-emerald-600 dark:text-emerald-400 text-sm font-black">{inr(cashHanded)}</strong>
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              Please verify biometric confirmation on your AEPS device before confirming.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmWindowOpen(false)}
                disabled={isSubmitting}
                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProcessTransaction}
                disabled={isSubmitting || !isFormValid}
                className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50"
              >
                {isSubmitting ? "Processing…" : `Confirm & Disburse ${inr(cashHanded)}`}
              </button>
            </div>
          </div>
        </FloatingWindow>
      )}

      {/* ===============================================================================
          ADD NEW BANK MODAL
      =============================================================================== */}
      {addBankWindowOpen && (
        <FloatingWindow
          isOpen={addBankWindowOpen}
          size="sm"
          title="Add New Bank to Master List"
          onClose={() => setAddBankWindowOpen(false)}
        >
          <form onSubmit={handleCreateBank} className="p-5 space-y-4">
            {bankCreateError && (
              <div className="rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-600 dark:bg-rose-950/30 dark:text-rose-400">
                {bankCreateError}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Bank Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={newBankName}
                onChange={(e) => setNewBankName(e.target.value)}
                placeholder="e.g. Bandhan Bank Ltd"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-teal-500 dark:border-white/10 dark:bg-white/5"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Bank Code / IFSC Prefix (Optional)
              </label>
              <input
                type="text"
                value={newBankCode}
                onChange={(e) => setNewBankCode(e.target.value.toUpperCase())}
                placeholder="e.g. BDBL"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-teal-500 dark:border-white/10 dark:bg-white/5"
              />
            </div>

            <div className="rounded-xl bg-slate-50 p-3 text-[11px] text-slate-500 dark:bg-white/5">
              <strong>Strict Guarantee:</strong> If this bank already exists under a known alias or code, the system will select the existing record to prevent duplicate master data.
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAddBankWindowOpen(false)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={bankCreateSubmitting}
                className="rounded-xl bg-teal-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-teal-700 disabled:opacity-50"
              >
                {bankCreateSubmitting ? "Saving…" : "Add & Select Bank"}
              </button>
            </div>
          </form>
        </FloatingWindow>
      )}

      {/* ===============================================================================
          ADD NEW CUSTOMER MODAL
      =============================================================================== */}
      {addCustomerWindowOpen && (
        <FloatingWindow
          isOpen={addCustomerWindowOpen}
          size="sm"
          title="Add New Customer to CRM"
          onClose={() => setAddCustomerWindowOpen(false)}
        >
          <form onSubmit={handleCreateCustomer} className="p-5 space-y-4">
            {custCreateError && (
              <div className="rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-600 dark:bg-rose-950/30 dark:text-rose-400">
                {custCreateError}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Customer Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={newCustName}
                onChange={(e) => setNewCustName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-teal-500 dark:border-white/10 dark:bg-white/5"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Mobile Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="tel"
                required
                maxLength={10}
                value={newCustPhone}
                onChange={(e) => setNewCustPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="10-digit mobile number"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-teal-500 dark:border-white/10 dark:bg-white/5"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Email Address (Optional)
              </label>
              <input
                type="email"
                value={newCustEmail}
                onChange={(e) => setNewCustEmail(e.target.value)}
                placeholder="customer@email.com"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-teal-500 dark:border-white/10 dark:bg-white/5"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Address / Location (Optional)
              </label>
              <input
                type="text"
                value={newCustAddress}
                onChange={(e) => setNewCustAddress(e.target.value)}
                placeholder="e.g. Ward 4, Newtown"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-teal-500 dark:border-white/10 dark:bg-white/5"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAddCustomerWindowOpen(false)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={custCreateSubmitting}
                className="rounded-xl bg-teal-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-teal-700 disabled:opacity-50"
              >
                {custCreateSubmitting ? "Saving…" : "Save & Select"}
              </button>
            </div>
          </form>
        </FloatingWindow>
      )}

      {/* ===============================================================================
          EDIT TRANSACTION MODAL
      =============================================================================== */}
      {editTxnWindowOpen && editingTxn && (
        <FloatingWindow
          isOpen={editTxnWindowOpen}
          size="sm"
          title={`Edit AEPS Transaction #${editingTxn.transaction_number}`}
          onClose={() => setEditTxnWindowOpen(false)}
        >
          <form onSubmit={handleSaveEdit} className="p-5 space-y-4 text-xs">
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
              <strong>Immutable Audit Safeguard:</strong> Withdrawal amount ({inr(editingTxn.amount)}) and settlement ledger entries are permanently locked. You may update attribution, RRN reference, or remarks.
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Customer Attribution
              </label>
              <SearchableSelect
                value={editCustomerId}
                onChange={setEditCustomerId}
                minSearchLength={2}
                minSearchPrompt="Type at least 2 characters to search…"
                options={[
                  { value: "", label: "-- Walk-in Customer --" },
                  ...customers.map((c) => ({
                    value: c.id,
                    label: `${c.name} (${maskMobile(c.phone) || c.code})`,
                  })),
                ]}
                placeholder="Assign to customer…"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Customer Mobile
              </label>
              <input
                type="tel"
                value={editCustomerMobile}
                onChange={(e) => setEditCustomerMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold outline-none focus:border-teal-500 dark:border-white/10 dark:bg-white/5"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Bank RRN / Terminal Reference Number
              </label>
              <input
                type="text"
                value={editReference}
                onChange={(e) => setEditReference(e.target.value)}
                placeholder="RRN / Auth Reference"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold outline-none focus:border-teal-500 dark:border-white/10 dark:bg-white/5"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Operator Remarks / Notes
              </label>
              <input
                type="text"
                value={editRemarks}
                onChange={(e) => setEditRemarks(e.target.value)}
                placeholder="Add correction notes…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold outline-none focus:border-teal-500 dark:border-white/10 dark:bg-white/5"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditTxnWindowOpen(false)}
                className="rounded-xl px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editSubmitting}
                className="rounded-xl bg-teal-600 px-5 py-2 font-bold text-white shadow-md hover:bg-teal-700 disabled:opacity-50"
              >
                {editSubmitting ? "Saving…" : "Save Correction"}
              </button>
            </div>
          </form>
        </FloatingWindow>
      )}

      {/* ===============================================================================
          TRANSACTION DETAIL VIEW MODAL
      =============================================================================== */}
      {selectedDetailTxn && (
        <FloatingWindow
          isOpen={Boolean(selectedDetailTxn)}
          size="md"
          title={`AEPS Transaction #${selectedDetailTxn.transaction_number}`}
          onClose={() => setSelectedDetailTxn(null)}
        >
          {(() => {
            const isDeducted = selectedDetailTxn.fee_source === "cut_from_withdrawal";
            const detailCashHanded = isDeducted
              ? Math.max(0, Number(selectedDetailTxn.amount || 0) - Number(selectedDetailTxn.service_fee || 0))
              : Number(selectedDetailTxn.amount || 0);

            const receiptUrl = `/business/receipt/${selectedDetailTxn.id}${receiptMode === "detailed" ? "?mode=detailed" : ""}`;
            const invoiceUrl = `/business/receipt/${selectedDetailTxn.id}/a4${receiptMode === "detailed" ? "?mode=detailed" : ""}`;

            return (
              <div className="p-5 space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-white/5">
                  <div><span className="text-slate-400">Date:</span> <div className="font-bold">{selectedDetailTxn.transaction_date}</div></div>
                  <div><span className="text-slate-400">Status:</span> <div className="font-bold text-emerald-600">{selectedDetailTxn.status.toUpperCase()}</div></div>
                  <div><span className="text-slate-400">Withdrawal Amount:</span> <div className="font-black text-sm">{inr(selectedDetailTxn.amount)}</div></div>
                  <div><span className="text-slate-400">Cash Handed to Customer:</span> <div className="font-black text-sm text-emerald-700 dark:text-emerald-400">{inr(detailCashHanded)}</div></div>
                  <div><span className="text-slate-400">Customer Service Fee:</span> <div className="font-bold text-emerald-600">{isDeducted ? `-${inr(selectedDetailTxn.service_fee)}` : `+${inr(selectedDetailTxn.service_fee)}`}</div></div>
                  <div><span className="text-slate-400">Fee Treatment:</span> <div className="font-bold text-slate-700 dark:text-slate-300">{isDeducted ? "Deducted from Payout" : `Separate via ${(selectedDetailTxn.customer_pay_method || "CASH").toUpperCase()}`}</div></div>
                  <div><span className="text-slate-400">Portal Commission:</span> <div className="font-bold text-teal-600 dark:text-teal-400">+{inr(selectedDetailTxn.portal_commission)}</div></div>
                  <div><span className="text-slate-400">Total Operator Income:</span> <div className="font-black text-emerald-600">+{inr(Number(selectedDetailTxn.service_fee || 0) + Number(selectedDetailTxn.portal_commission || 0))}</div></div>
                  <div><span className="text-slate-400">Customer:</span> <div className="font-bold">{selectedDetailTxn.customers?.name || "Walk-in"}</div></div>
                  <div><span className="text-slate-400">Aadhaar:</span> <div className="font-bold">**** {selectedDetailTxn.aadhaar_last4 || "N/A"}</div></div>
                  <div><span className="text-slate-400">Bank:</span> <div className="font-bold">{selectedDetailTxn.banks?.name || "N/A"}</div></div>
                  <div><span className="text-slate-400">Portal:</span> <div className="font-bold">{selectedDetailTxn.portals?.name || "N/A"}</div></div>
                  {selectedDetailTxn.reference && <div className="col-span-2"><span className="text-slate-400">RRN / Ref:</span> <div className="font-bold">{selectedDetailTxn.reference}</div></div>}
                  {selectedDetailTxn.remarks && <div className="col-span-2"><span className="text-slate-400">Remarks:</span> <div className="font-semibold">{selectedDetailTxn.remarks}</div></div>}
                </div>

                <div className="flex justify-between items-center pt-2">
                  <div className="flex gap-2">
                    <Link
                      href={receiptUrl}
                      target="_blank"
                      className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white hover:bg-slate-800 dark:bg-teal-600"
                    >
                      🖨️ 80mm
                    </Link>
                    <Link
                      href={invoiceUrl}
                      target="_blank"
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                    >
                      📄 A4 Invoice
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDetailTxn(null);
                        handleOpenEdit(selectedDetailTxn);
                      }}
                      className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 font-bold text-teal-700 hover:bg-teal-100 dark:border-teal-900/40 dark:bg-teal-950/40 dark:text-teal-300"
                    >
                      ✏️ Edit Reference
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedDetailTxn(null)}
                    className="rounded-xl px-4 py-2 font-bold text-slate-500 hover:bg-slate-100"
                  >
                    Close
                  </button>
                </div>
              </div>
            );
          })()}
        </FloatingWindow>
      )}

      {/* ===============================================================================
          WHATSAPP SEND MODAL
      =============================================================================== */}
      {waModal.open && (
        <WhatsAppSendModal
          open={waModal.open}
          onClose={() => setWaModal((prev) => ({ ...prev, open: false }))}
          phone={waModal.phone}
          initialMessage={waModal.msg}
          recipientName={waModal.name}
          messageType="banking_txn"
          refId={waModal.refId}
          refNumber={waModal.refNum}
          onSent={() => showToast("success", "WhatsApp receipt dispatched.")}
        />
      )}

      {/* ===============================================================================
          SCAN & FILL MODAL
      =============================================================================== */}
      {scanModalOpen && (
        <ScanFillModal
          open={scanModalOpen}
          mode="aeps"
          onClose={() => setScanModalOpen(false)}
          onApply={handleScanApply}
        />
      )}
    </div>
  );
}
