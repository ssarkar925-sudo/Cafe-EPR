"use client";

import { useState, useMemo, useEffect } from "react";
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

  // 1. Exact or normalized string match
  for (const b of bankList) {
    if (!b.name) continue;
    const normB = normalizeBankName(b.name);
    if (normB === normInput) return b;
    if (normB.includes(normInput) || normInput.includes(normB)) {
      if (normInput.length >= 3 && normB.length >= 3) return b;
    }
  }

  // 2. Code match
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

  useRealtime(["transactions", "aeps_banks", "aeps_portals", "customers", "cash_entries"]);

  const [transactions, setTransactions] = useState<Txn[]>(initialTransactions);
  const [customers, setCustomers] = useState<CustomerRow[]>(initialCustomers);
  const [banks, setBanks] = useState<Master[]>(initialBanks);
  const [portals] = useState<Master[]>(initialPortals);

  // Operation selection: "withdrawal" (Cash Out), "enquiry" (Balance Enquiry), "statement" (Mini Statement)
  const [operation, setOperation] = useState<"withdrawal" | "enquiry" | "statement">("withdrawal");

  // Canonical Form State (Single Source of Truth)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [customerMobile, setCustomerMobile] = useState<string>("");
  const [selectedBankId, setSelectedBankId] = useState<string>("");
  const [selectedPortalId, setSelectedPortalId] = useState<string>(initialPortals[0]?.id || "");
  const [aadhaarLast4, setAadhaarLast4] = useState<string>("");
  const [amount, setAmount] = useState<string>("1000");
  const [serviceFee, setServiceFee] = useState<string>("10");
  const [portalCommission, setPortalCommission] = useState<string>("5");
  
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
  const [, setLastCompletedTxn] = useState<Txn | null>(null);
  const [selectedDetailTxn, setSelectedDetailTxn] = useState<Txn | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // When customer changes, auto-fill mobile
  useEffect(() => {
    if (!selectedCustomerId) return;
    const c = customers.find((x) => x.id === selectedCustomerId);
    if (c?.phone) setCustomerMobile(c.phone);
  }, [selectedCustomerId, customers]);

  // Available float calculation
  const currentFloat = Number(float?.current || (initialPortals.length > 0 ? 45000 : 0));

  // Today's AEPS KPI calculations
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayTxns = useMemo(() => {
    return transactions.filter(
      (t) => t.service_type === "aeps" && (t.transaction_date === todayStr || t.transaction_timestamp?.slice(0, 10) === todayStr) && t.status === "success"
    );
  }, [transactions, todayStr]);

  const todayVolume = todayTxns.reduce((s, t) => s + Number(t.amount || 0), 0);
  const todayIncome = todayTxns.reduce((s, t) => s + Number(t.service_fee || 0) + Number(t.portal_commission || 0), 0);
  const todayCount = todayTxns.length;

  // Selected Bank Object
  const selectedBank = useMemo(() => {
    return banks.find((b) => b.id === selectedBankId);
  }, [banks, selectedBankId]);

  // Handle Scan & Fill Extraction
  function handleScanApply(fields: ScanFields) {
    const detectedName = fields.customer_name || fields.sender_name || "";
    const detectedMobile = fields.customer_mobile || fields.sender_mobile || "";
    const rawAadhaar = fields.aadhaar_last4 || "";
    const cleanAadhaar = rawAadhaar.replace(/\D/g, "").slice(-4);
    const detectedBank = fields.bank_name || fields.beneficiary_bank || "";

    const matched = matchBank(detectedBank, banks);

    setScannedReviewData({
      customerName: detectedName,
      mobile: detectedMobile,
      aadhaarLast4: cleanAadhaar,
      bankName: detectedBank,
      matchedBank: matched,
    });

    // Auto-apply fields to canonical state
    if (detectedMobile) setCustomerMobile(detectedMobile);
    if (cleanAadhaar) setAadhaarLast4(cleanAadhaar);
    if (fields.amount) setAmount(fields.amount);
    if (fields.reference) setReference(fields.reference);

    if (matched) {
      setSelectedBankId(matched.id);
    } else if (detectedBank) {
      setNewBankName(detectedBank);
    }
  }

  // Add New Bank with strict duplicate prevention (NO "ADD ANYWAY")
  async function handleCreateBank(e: React.FormEvent) {
    e.preventDefault();
    const name = newBankName.trim();
    if (!name) {
      setBankCreateError("Please enter a valid bank name.");
      return;
    }

    setBankCreateSubmitting(true);
    setBankCreateError("");

    // 1. UI Layer Duplicate Protection (NO "ADD ANYWAY")
    const existing = matchBank(name, banks);
    if (existing) {
      setSelectedBankId(existing.id);
      setAddBankWindowOpen(false);
      setBankCreateSubmitting(false);
      showToast("info", `Selected "${existing.name}" (already in your Bank List).`);
      return;
    }

    try {
      // 2. Database Layer Insert with race-condition handling
      const { data: newBank, error: insertError } = await supabase
        .from("aeps_banks")
        .insert({
          name: name,
          code: newBankCode.trim() || null,
          is_active: true,
        })
        .select()
        .single();

      if (insertError) {
        if (insertError.code === "23505" || insertError.message.toLowerCase().includes("unique")) {
          const { data: refetched } = await supabase
            .from("aeps_banks")
            .select("*")
            .ilike("name", name)
            .limit(1)
            .maybeSingle();

          if (refetched) {
            setBanks((prev) => [...prev.filter((b) => b.id !== refetched.id), refetched]);
            setSelectedBankId(refetched.id);
            setAddBankWindowOpen(false);
            showToast("info", `Bank already exists. Selected "${refetched.name}".`);
            return;
          }
        }
        throw insertError;
      }

      if (newBank) {
        await logAudit({
          action: "create",
          entity: "aeps_bank",
          entity_id: newBank.id,
          description: `Created AEPS Bank ${newBank.name}`,
          details: { name: newBank.name, code: newBank.code, source: "aeps_scan_and_fill" },
        });

        setBanks((prev) => [...prev, newBank]);
        setSelectedBankId(newBank.id);
        setAddBankWindowOpen(false);
        setNewBankName("");
        setNewBankCode("");
        showToast("success", `"${newBank.name}" added to Master Bank List and selected.`);
      }
    } catch (err: any) {
      console.error("Bank creation error:", err);
      setBankCreateError(err.message || "Failed to create bank. Please try again.");
    } finally {
      setBankCreateSubmitting(false);
    }
  }

  // Add New Customer with duplicate protection
  async function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault();
    const name = newCustName.trim();
    const phone = newCustPhone.trim();
    if (!name) {
      setCustCreateError("Customer name is required.");
      return;
    }
    if (!phone || phone.length < 10) {
      setCustCreateError("A valid 10-digit mobile number is required.");
      return;
    }

    setCustCreateSubmitting(true);
    setCustCreateError("");

    // Duplicate check in CRM
    const existing = customers.find((c) => c.phone === phone);
    if (existing) {
      setSelectedCustomerId(existing.id);
      setCustomerMobile(existing.phone || phone);
      setAddCustomerWindowOpen(false);
      setCustCreateSubmitting(false);
      showToast("info", `Customer already exists: "${existing.name}". Selected.`);
      return;
    }

    try {
      const generatedCode = "CUST-" + Math.floor(1000 + Math.random() * 9000);
      const { data: newCust, error: insertError } = await supabase
        .from("customers")
        .insert({
          name,
          phone,
          email: newCustEmail.trim() || null,
          address: newCustAddress.trim() || null,
          code: generatedCode,
          customer_type: "retail",
          is_active: true,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      if (newCust) {
        await logAudit({
          action: "create",
          entity: "customer",
          entity_id: newCust.id,
          description: `Created customer ${newCust.name} via AEPS`,
          details: { name: newCust.name, phone: newCust.phone, source: "aeps_workspace" },
        });

        setCustomers((prev) => [newCust, ...prev]);
        setSelectedCustomerId(newCust.id);
        setCustomerMobile(newCust.phone || phone);
        setAddCustomerWindowOpen(false);
        setNewCustName("");
        setNewCustPhone("");
        setNewCustEmail("");
        setNewCustAddress("");
        showToast("success", `Customer "${newCust.name}" registered and selected.`);
      }
    } catch (err: any) {
      console.error("Customer creation error:", err);
      setCustCreateError(err.message || "Failed to create customer.");
    } finally {
      setCustCreateSubmitting(false);
    }
  }

  // Open Edit Modal for a Transaction
  function handleOpenEdit(t: Txn) {
    setEditingTxn(t);
    setEditCustomerId(t.customer_id || "");
    setEditCustomerMobile(t.customer_mobile || "");
    setEditReference(t.reference || "");
    setEditRemarks(t.remarks || "");
    setEditTxnWindowOpen(true);
  }

  // Save Transaction Corrections with Audit Trail
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
        description: `Corrected non-financial fields on AEPS Txn #${editingTxn.transaction_number}`,
        details: {
          transaction_number: editingTxn.transaction_number,
          old_reference: editingTxn.reference,
          new_reference: updatedRef,
          old_remarks: editingTxn.remarks,
          new_remarks: updatedRemarks,
          reason: "Operator correction",
        },
      });

      // Update local state
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
      showToast("success", `Transaction #${editingTxn.transaction_number} updated with audit trail.`);
    } catch (err: any) {
      console.error("Transaction edit error:", err);
      showToast("error", err.message || "Failed to update transaction.");
    } finally {
      setEditSubmitting(false);
    }
  }

  // Authoritative Validation before opening confirmation
  function handleInitiateTransaction() {
    const num = Number(amount);
    if (operation === "withdrawal" && (!num || num <= 0)) {
      showToast("error", "Please enter a valid withdrawal amount.");
      return;
    }
    if (!selectedBankId) {
      showToast("error", "Please select the customer's bank.");
      return;
    }
    if (!selectedPortalId) {
      showToast("error", "Please choose an AEPS service portal.");
      return;
    }

    // Canonical Aadhaar Validation: must be exactly 4 numeric ASCII digits (e.g. "3619", "0427")
    const cleanAadhaar = (aadhaarLast4 || "").trim();
    if (!/^[0-9]{4}$/.test(cleanAadhaar)) {
      showToast("error", "Please enter the last 4 digits of Aadhaar (4 digits).");
      return;
    }

    if (feeTreatment === "separate" && customerPayMethod === "due" && !selectedCustomerId) {
      showToast("error", "Please select a registered customer to record fee as Due (Khata).");
      return;
    }

    setConfirmWindowOpen(true);
  }

  // Effective financial amounts
  const numAmount = Number(amount || 0);
  const numFee = Number(serviceFee || 0);
  const numComm = Number(portalCommission || 0);
  const totalIncome = numFee + numComm;

  // Exact Cash Handed to Customer calculation
  const cashHanded =
    operation !== "withdrawal"
      ? 0
      : feeTreatment === "deduct"
      ? Math.max(0, numAmount - numFee)
      : numAmount;

  // Effective backend fee_source
  const effectiveFeeSource =
    feeTreatment === "deduct"
      ? "cut_from_withdrawal"
      : customerPayMethod === "upi"
      ? "upi"
      : "separate_cash";

  // Effective customer collection method
  const effectivePayMethod = feeTreatment === "deduct" ? "cash" : customerPayMethod;

  // Execute Transaction
  async function handleProcessTransaction() {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const cleanAadhaar = (aadhaarLast4 || "").trim();
      const nowIso = new Date().toISOString();
      const dateStr = nowIso.slice(0, 10);

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
      setLastCompletedTxn(completedRecord);
      setConfirmWindowOpen(false);

      // Reset form
      setAadhaarLast4("");
      setReference("");
      setRemarks("");

      showToast("success", `₹${numAmount.toLocaleString("en-IN")} cash withdrawal completed. Cash handed: ₹${cashHanded.toLocaleString("en-IN")}`);
    } catch (err: any) {
      console.error("AEPS error:", err);
      showToast("error", err.message || "Failed to complete AEPS transaction.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Filtered transactions list
  const filteredTxns = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return transactions;
    return transactions.filter(
      (t) =>
        t.transaction_number?.toLowerCase().includes(q) ||
        t.customer_mobile?.includes(q) ||
        t.customers?.name?.toLowerCase().includes(q) ||
        t.banks?.name?.toLowerCase().includes(q) ||
        t.reference?.toLowerCase().includes(q)
    );
  }, [transactions, searchQuery]);

  return (
    <div className="space-y-6 pb-16">
      {/* Toast Notification Container */}
      {toastView}

      {/* ===============================================================================
          1. HEADER & LIVE OPERATIONAL STATUS
      =============================================================================== */}
      <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-6 text-white shadow-xl ring-1 ring-white/10 sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-0.5 text-xs font-bold text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                ● Live AEPS Switch Online
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-slate-300">
                Biometric Gateway Active
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              AEPS Biometric Cash Out
            </h1>
            <p className="text-xs text-indigo-200/80 sm:text-sm">
              Instant Aadhaar cash withdrawal, micro-ATM disbursement, and live portal float settlement.
            </p>
          </div>

          {/* Available Float Card */}
          <div className="flex flex-col items-end rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">Available Platform Float</span>
            <div className="text-2xl font-black text-emerald-400">{inr(currentFloat)}</div>
            <span className="text-[10px] text-slate-400">Live Settlement Pool</span>
          </div>
        </div>
      </div>

      {/* ===============================================================================
          2. TODAY'S AEPS KPI SUMMARY
      =============================================================================== */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bento-surface-interactive flex flex-col justify-between p-5 dark:bg-slate-900/90">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Today's Withdrawals</span>
          <div className="my-2">
            <div className="text-2xl font-black text-slate-900 sm:text-3xl dark:text-white">{inr(todayVolume)}</div>
            <p className="text-xs text-slate-500">{todayCount} completed transactions</p>
          </div>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">● 100% Settled</span>
        </div>

        <div className="bento-surface-interactive flex flex-col justify-between p-5 dark:bg-slate-900/90">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Earned Income Today</span>
          <div className="my-2">
            <div className="text-2xl font-black text-emerald-600 sm:text-3xl dark:text-emerald-400">+{inr(todayIncome)}</div>
            <p className="text-xs text-slate-500">Service Fees + Portal Commissions</p>
          </div>
          <span className="text-[11px] text-slate-400">Direct Gross Profit Margin</span>
        </div>

        <div className="bento-surface-interactive flex flex-col justify-between p-5 dark:bg-slate-900/90">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Active Service Portals</span>
          <div className="my-2">
            <div className="text-2xl font-black text-indigo-950 sm:text-3xl dark:text-white">{portals.length}</div>
            <p className="text-xs text-slate-500">Fino, Spice Money, Payworld, RNFI</p>
          </div>
          <Link href="/business/portals" className="text-[11px] text-blue-600 font-bold hover:underline dark:text-blue-400">Manage Portals →</Link>
        </div>

        <div className="bento-surface-interactive flex flex-col justify-between p-5 dark:bg-slate-900/90">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Registered Banks</span>
          <div className="my-2">
            <div className="text-2xl font-black text-amber-600 sm:text-3xl dark:text-amber-400">{banks.length}</div>
            <p className="text-xs text-slate-500">Authoritative Master Bank List</p>
          </div>
          <button type="button" onClick={() => setAddBankWindowOpen(true)} className="text-[11px] text-blue-600 font-bold text-left hover:underline dark:text-blue-400">
            + Add New Bank
          </button>
        </div>
      </div>

      {/* ===============================================================================
          3. MAIN AEPS TRANSACTION WORKSPACE
      =============================================================================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left (8 Cols): Transaction Form & Scan & Fill */}
        <div className="bento-surface p-6 lg:col-span-8 dark:bg-slate-900/90 space-y-6">
          {/* Top Bar: Operation Selector & Scan & Fill CTA */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-white/5">
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
                      ? "bg-white text-slate-900 shadow-sm dark:bg-blue-600 dark:text-white"
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
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-black text-white shadow-md shadow-blue-500/25 transition hover:brightness-110 active:scale-95"
            >
              <span>📷 Scan &amp; Fill Receipt / SMS</span>
            </button>
          </div>

          {/* Scanned Information Review Alert */}
          {scannedReviewData && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 text-xs dark:border-blue-900/40 dark:bg-blue-950/20">
              <div className="flex items-center justify-between">
                <span className="font-bold text-blue-900 dark:text-blue-300">✓ Information Detected from Scan</span>
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
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {/* Customer Search & Select (Masked for Privacy) + Add Customer Button */}
            <div className="space-y-1.5 sm:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Customer (CRM Profile)
                </label>
                <button
                  type="button"
                  onClick={() => setAddCustomerWindowOpen(true)}
                  className="text-[11px] font-bold text-blue-600 hover:underline dark:text-blue-400"
                >
                  + Add New Customer
                </button>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <SearchableSelect
                    value={selectedCustomerId}
                    onChange={setSelectedCustomerId}
                    options={[
                      { value: "", label: "-- Walk-in Customer --" },
                      ...customers.map((c) => ({
                        value: c.id,
                        label: `${c.name} (${maskMobile(c.phone) || c.code})`,
                      })),
                    ]}
                    placeholder="Search customer by name or phone…"
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
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Customer Mobile Number
              </label>
              <input
                type="tel"
                value={customerMobile}
                onChange={(e) => setCustomerMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="10-digit mobile number"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs font-semibold outline-none focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:bg-slate-900"
              />
            </div>

            {/* Bank Auto-Match & Selection */}
            <div className="space-y-1.5">
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

            {/* Aadhaar Last 4 Digits (Canonical Input) */}
            <div className="space-y-1.5">
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
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-2.5 pl-28 pr-3.5 text-xs font-black tracking-widest outline-none focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:bg-slate-900"
                />
              </div>
              <p className="text-[10px] text-slate-400">Enter exactly the last 4 digits of Aadhaar.</p>
            </div>

            {/* AEPS Service Portal */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                AEPS Service Portal <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedPortalId}
                onChange={(e) => setSelectedPortalId(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs font-bold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5 dark:focus:bg-slate-900"
              >
                {portals.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Prominent Amount Input (When Withdrawal) */}
            {operation === "withdrawal" && (
              <div className="space-y-2 sm:col-span-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Withdrawal Amount (₹) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-slate-400">₹</span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="1000"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-3.5 pl-10 pr-4 text-2xl font-black text-slate-900 outline-none focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:bg-slate-900"
                  />
                </div>

                {/* Quick Amount Chips */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {["500", "1000", "2000", "3000", "5000", "10000"].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAmount(v)}
                      className={`rounded-xl border px-3 py-1 text-xs font-black transition ${
                        amount === v
                          ? "border-blue-600 bg-blue-600 text-white shadow-xs"
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
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Customer Service Fee (₹)
                  </label>
                  <input
                    type="number"
                    value={serviceFee}
                    onChange={(e) => setServiceFee(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-bold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
                    placeholder="Fee charged to customer"
                  />
                  <p className="text-[10px] text-slate-400">Direct surcharge charged to customer.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Portal Commission (₹)
                  </label>
                  <input
                    type="number"
                    value={portalCommission}
                    onChange={(e) => setPortalCommission(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-bold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
                    placeholder="Commission from portal"
                  />
                  <p className="text-[10px] text-slate-400">Commission credited by AEPS portal.</p>
                </div>

                {/* 1. Fee Treatment Model (Separate Collection vs Deduct From Payout) */}
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Fee Treatment Model <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setFeeTreatment("separate")}
                      className={`rounded-2xl border p-3 text-left transition ${
                        feeTreatment === "separate"
                          ? "border-blue-600 bg-blue-50/80 shadow-xs dark:border-blue-500 dark:bg-blue-950/30"
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
                      className={`rounded-2xl border p-3 text-left transition ${
                        feeTreatment === "deduct"
                          ? "border-blue-600 bg-blue-50/80 shadow-xs dark:border-blue-500 dark:bg-blue-950/30"
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
                  <div className="space-y-1.5 sm:col-span-2 pt-1 border-t border-slate-100 dark:border-white/5">
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
                          className={`rounded-xl border p-2.5 text-center transition ${
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
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Bank RRN / Terminal Reference Number
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="12-digit RRN / Auth Reference"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-semibold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
              />
            </div>
          </div>
        </div>

        {/* Right (4 Cols): Live Transaction Summary & Action */}
        <div className="bento-surface p-6 lg:col-span-4 dark:bg-slate-900/90 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="border-b border-slate-100 pb-3 dark:border-white/5">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Order Summary</span>
              <h3 className="text-base font-black text-slate-900 dark:text-white">AEPS Settlement Breakdown</h3>
            </div>

            <div className="space-y-2.5 text-xs">
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
                  {aadhaarLast4 ? `**** ${aadhaarLast4}` : "Pending"}
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
                      <span className="text-slate-500">Total Cash Received:</span>
                      <strong className="text-slate-900 dark:text-white font-bold">{inr(numAmount + numFee)}</strong>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-500">Portal Commission:</span>
                    <strong className="text-emerald-600 dark:text-emerald-400 font-bold">+{inr(numComm)}</strong>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-1.5 dark:border-white/5">
                    <span className="font-bold text-slate-700 dark:text-slate-300">Total Net Income:</span>
                    <strong className="text-emerald-600 dark:text-emerald-400 font-black">+{inr(totalIncome)}</strong>
                  </div>

                  {/* Receipt Details Preference Control */}
                  <div className="border-t border-slate-100 pt-2 dark:border-white/5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 font-bold">Default Receipt Style:</span>
                      <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-white/5">
                        <button
                          type="button"
                          onClick={() => setReceiptMode("basic")}
                          className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition ${
                            receiptMode === "basic" ? "bg-white text-slate-900 shadow-xs dark:bg-blue-600 dark:text-white" : "text-slate-500"
                          }`}
                        >
                          Basic
                        </button>
                        <button
                          type="button"
                          onClick={() => setReceiptMode("detailed")}
                          className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition ${
                            receiptMode === "detailed" ? "bg-white text-slate-900 shadow-xs dark:bg-blue-600 dark:text-white" : "text-slate-500"
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
          </div>

          {/* Primary Action Button */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleInitiateTransaction}
              className="w-full rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 py-3.5 text-sm font-black text-white shadow-lg shadow-emerald-500/25 transition hover:brightness-110 active:scale-[0.98]"
            >
              ✓ Complete &amp; Disburse {inr(cashHanded)}
            </button>
            <p className="text-center text-[10px] text-slate-400">
              Deterministic double-entry settlement engine
            </p>
          </div>
        </div>
      </div>

      {/* ===============================================================================
          4. RECENT AEPS TRANSACTIONS TABLE
      =============================================================================== */}
      <div className="bento-surface p-6 dark:bg-slate-900/90 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-white/5">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">Recent AEPS Cash Out Records</h3>
            <p className="text-xs text-slate-400">Live ledger of biometric withdrawals and portal credits.</p>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by RRN, mobile, customer or bank…"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 dark:border-white/10">
                <th className="pb-2.5 font-bold">Txn # / Time</th>
                <th className="pb-2.5 font-bold">Customer &amp; Aadhaar</th>
                <th className="pb-2.5 font-bold">Bank &amp; Portal</th>
                <th className="pb-2.5 font-bold text-right">Withdrawal</th>
                <th className="pb-2.5 font-bold text-center">Fee Treatment</th>
                <th className="pb-2.5 font-bold text-right">Cash Handed</th>
                <th className="pb-2.5 font-bold text-right">Total Income</th>
                <th className="pb-2.5 font-bold text-center">Status</th>
                <th className="pb-2.5 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-medium text-slate-700 dark:text-slate-300">
              {filteredTxns.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No AEPS transactions found. Process a withdrawal above to see records.
                  </td>
                </tr>
              ) : (
                filteredTxns.slice(0, 15).map((t) => {
                  const isDeducted = t.fee_source === "cut_from_withdrawal";
                  const txnCashHanded = isDeducted
                    ? Math.max(0, Number(t.amount || 0) - Number(t.service_fee || 0))
                    : Number(t.amount || 0);

                  const receiptUrl = `/business/receipt/${t.id}${receiptMode === "detailed" ? "?mode=detailed" : ""}`;

                  return (
                    <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                      <td className="py-3">
                        <div className="font-bold text-slate-900 dark:text-white">{t.transaction_number}</div>
                        <div className="text-[10px] text-slate-400">
                          {t.transaction_timestamp ? new Date(t.transaction_timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : t.transaction_date}
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="font-bold text-slate-900 dark:text-white">{t.customers?.name || "Walk-in"}</div>
                        <div className="text-[10px] text-slate-400">
                          {t.customer_mobile ? `📱 ${maskMobile(t.customer_mobile)}` : ""} {t.aadhaar_last4 ? `• **** ${t.aadhaar_last4}` : ""}
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="font-bold text-slate-900 dark:text-white">{t.banks?.name || "Bank"}</div>
                        <div className="text-[10px] text-slate-400">{t.portals?.name || "Portal"}</div>
                      </td>
                      <td className="py-3 text-right font-black text-slate-900 dark:text-white">
                        {inr(t.amount)}
                      </td>
                      <td className="py-3 text-center">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-white/10 dark:text-slate-300">
                          {isDeducted
                            ? "✂️ Deducted"
                            : t.customer_pay_method === "upi"
                            ? "📱 UPI"
                            : t.customer_pay_method === "bank"
                            ? "🏦 Bank"
                            : t.customer_pay_method === "due"
                            ? "📋 Due"
                            : "💵 Cash"}
                        </span>
                      </td>
                      <td className="py-3 text-right font-bold text-emerald-700 dark:text-emerald-400">
                        {inr(txnCashHanded)}
                      </td>
                      <td className="py-3 text-right text-emerald-600 dark:text-emerald-400 font-black">
                        +{inr(Number(t.service_fee || 0) + Number(t.portal_commission || 0))}
                      </td>
                      <td className="py-3 text-center">
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                          {t.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={receiptUrl}
                            target="_blank"
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                            title="Print 80mm Receipt"
                          >
                            🖨️
                          </Link>
                          <button
                            type="button"
                            onClick={() => setSelectedDetailTxn(t)}
                            className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-400"
                            title="View Transaction Breakdown"
                          >
                            👁
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(t)}
                            className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-blue-600 hover:bg-blue-50 dark:bg-white/5 dark:text-blue-400"
                            title="Edit Non-Financial Fields"
                          >
                            ✏️
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
      </div>

      {/* ===============================================================================
          5. CONFIRMATION MODAL
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
                <strong className="text-slate-900 dark:text-white">**** {aadhaarLast4}</strong>
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
                <strong className="text-emerald-600 dark:text-emerald-400 font-bold">+{inr(numComm)}</strong>
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
                disabled={isSubmitting}
                className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50"
              >
                {isSubmitting ? "Processing…" : `Confirm & Disburse ${inr(cashHanded)}`}
              </button>
            </div>
          </div>
        </FloatingWindow>
      )}

      {/* ===============================================================================
          6. ADD NEW BANK MODAL (Strict Duplicate Protection — NO "ADD ANYWAY")
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
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
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
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
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
                className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50"
              >
                {bankCreateSubmitting ? "Saving…" : "Add & Select Bank"}
              </button>
            </div>
          </form>
        </FloatingWindow>
      )}

      {/* ===============================================================================
          7. ADD NEW CUSTOMER MODAL (From AEPS Workspace)
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
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
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
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
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
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
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
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
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
                className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50"
              >
                {custCreateSubmitting ? "Saving…" : "Save & Select"}
              </button>
            </div>
          </form>
        </FloatingWindow>
      )}

      {/* ===============================================================================
          8. EDIT TRANSACTION MODAL (Controlled Non-Financial Corrections)
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
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
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
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
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
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
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
                className="rounded-xl bg-blue-600 px-5 py-2 font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50"
              >
                {editSubmitting ? "Saving…" : "Save Correction"}
              </button>
            </div>
          </form>
        </FloatingWindow>
      )}

      {/* ===============================================================================
          9. TRANSACTION DETAIL VIEW MODAL
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
                  <div><span className="text-slate-400">Portal Commission:</span> <div className="font-bold text-emerald-600">+{inr(selectedDetailTxn.portal_commission)}</div></div>
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
                      className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white hover:bg-slate-800 dark:bg-blue-600"
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
                      className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 font-bold text-blue-700 hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-300"
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
          10. SCAN & FILL MODAL
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
