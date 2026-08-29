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

// Bank alias normalization dictionary
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

/** Mask mobile numbers for privacy: e.g. 9876543210 -> 98••••••10 */
export function maskMobile(mobile: string | null | undefined): string {
  if (!mobile) return "";
  const clean = mobile.replace(/\D/g, "");
  if (clean.length === 10) {
    return `${clean.slice(0, 2)}••••••${clean.slice(-2)}`;
  }
  return clean;
}

/** Mask account numbers for privacy: e.g. 123456789012 -> •••• •••• 9012 */
export function maskAccount(acc: string | null | undefined): string {
  if (!acc) return "";
  const clean = acc.replace(/\s+/g, "");
  if (clean.length > 4) {
    return `•••• •••• ${clean.slice(-4)}`;
  }
  return clean;
}

export default function DmtWorkspace({
  initialTransactions,
  initialCustomers,
  initialBanks,
  initialPortals,
  paymentInstruments,
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

  useRealtime(["transactions", "aeps_banks", "aeps_portals", "customers", "cash_entries", "saved_contacts"]);

  const [transactions, setTransactions] = useState<Txn[]>(initialTransactions);
  const [customers, setCustomers] = useState<CustomerRow[]>(initialCustomers);
  const [banks, setBanks] = useState<Master[]>(initialBanks);
  const [portals] = useState<Master[]>(initialPortals);
  const [instruments] = useState<any[]>(paymentInstruments || []);

  // Transfer Method: "bank_account" (IMPS/NEFT) vs "upi" (UPI Remittance)
  const [transferMethod, setTransferMethod] = useState<"bank_account" | "upi">("bank_account");

  // Sender / Customer Fields
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [senderName, setSenderName] = useState<string>("");
  const [senderMobile, setSenderMobile] = useState<string>("");

  // Beneficiary Fields
  const [beneficiaryName, setBeneficiaryName] = useState<string>("");
  const [beneficiaryMobile, setBeneficiaryMobile] = useState<string>("");
  const [beneficiaryBank, setBeneficiaryBank] = useState<string>("");
  const [beneficiaryIfsc, setBeneficiaryIfsc] = useState<string>("");
  const [beneficiaryAccount, setBeneficiaryAccount] = useState<string>("");
  const [upiId, setUpiId] = useState<string>("");
  const [receiverName, setReceiverName] = useState<string>("");

  // Financial & Settlement Fields
  const [amount, setAmount] = useState<string>("5000");
  const [serviceFee, setServiceFee] = useState<string>("20");
  const [portalCommission, setPortalCommission] = useState<string>("5");
  const [paidFrom, setPaidFrom] = useState<"portal" | "bank">("portal");
  const [selectedPortalId, setSelectedPortalId] = useState<string>(initialPortals[0]?.id || "");
  const [selectedBankInstrumentId, setSelectedBankInstrumentId] = useState<string>(instruments[0]?.id || "");
  const [customerPayMethod, setCustomerPayMethod] = useState<"cash" | "upi" | "bank" | "due">("cash");

  const [reference, setReference] = useState<string>("");
  const [remarks, setRemarks] = useState<string>("");

  // Receipt Print Preference
  const [receiptMode, setReceiptMode] = useState<"basic" | "detailed">("basic");

  // Modals State
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [confirmWindowOpen, setConfirmWindowOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDetailTxn, setSelectedDetailTxn] = useState<Txn | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Add Customer Modal State
  const [addCustomerWindowOpen, setAddCustomerWindowOpen] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustEmail, setNewCustEmail] = useState("");
  const [newCustAddress, setNewCustAddress] = useState("");
  const [custCreateError, setCustCreateError] = useState("");
  const [custCreateSubmitting, setCustCreateSubmitting] = useState(false);

  // Add Beneficiary Modal State
  const [addBeneficiaryWindowOpen, setAddBeneficiaryWindowOpen] = useState(false);
  const [newBenName, setNewBenName] = useState("");
  const [newBenMobile, setNewBenMobile] = useState("");
  const [newBenBank, setNewBenBank] = useState("");
  const [newBenIfsc, setNewBenIfsc] = useState("");
  const [newBenAccount, setNewBenAccount] = useState("");
  const [newBenUpi, setNewBenUpi] = useState("");
  const [benCreateError, setBenCreateError] = useState("");
  const [benCreateSubmitting, setBenCreateSubmitting] = useState(false);

  // Add Bank Modal State
  const [addBankWindowOpen, setAddBankWindowOpen] = useState(false);
  const [newBankName, setNewBankName] = useState("");
  const [newBankCode, setNewBankCode] = useState("");
  const [bankCreateError, setBankCreateError] = useState("");
  const [bankCreateSubmitting, setBankCreateSubmitting] = useState(false);

  // Edit Transaction Modal State
  const [editTxnWindowOpen, setEditTxnWindowOpen] = useState(false);
  const [editingTxn, setEditingTxn] = useState<Txn | null>(null);
  const [editSenderName, setEditSenderName] = useState<string>("");
  const [editSenderMobile, setEditSenderMobile] = useState<string>("");
  const [editCustomerId, setEditCustomerId] = useState<string>("");
  const [editReference, setEditReference] = useState<string>("");
  const [editRemarks, setEditRemarks] = useState<string>("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Auto-sync sender when customer is picked
  useEffect(() => {
    if (!selectedCustomerId) return;
    const c = customers.find((x) => x.id === selectedCustomerId);
    if (c) {
      setSenderName(c.name || "");
      if (c.phone) setSenderMobile(c.phone);
    }
  }, [selectedCustomerId, customers]);

  // Available float calculation
  const currentFloat = Number(float?.current || (initialPortals.length > 0 ? 50000 : 0));

  // Today's DMT KPI calculations
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayTxns = useMemo(() => {
    return transactions.filter(
      (t) => t.service_type === "dmt" && (t.transaction_date === todayStr || t.transaction_timestamp?.slice(0, 10) === todayStr) && t.status === "success"
    );
  }, [transactions, todayStr]);

  const todayVolume = todayTxns.reduce((s, t) => s + Number(t.amount || 0), 0);
  const todayIncome = todayTxns.reduce((s, t) => s + Number(t.service_fee || 0) + Number(t.portal_commission || 0), 0);
  const todayCount = todayTxns.length;

  // Beneficiary Quick Suggestions derived from past successful transactions
  const beneficiarySuggestions = useMemo(() => {
    const map = new Map<string, { name: string; bank: string; ifsc: string; account: string; upi: string; count: number }>();
    for (const t of transactions) {
      if (t.service_type !== "dmt" || t.status !== "success") continue;
      const key = t.transfer_method === "upi" ? (t.upi_id || "") : `${t.beneficiary_ifsc || ""}|${t.beneficiary_account || ""}`;
      if (!key || key === "|") continue;

      if (map.has(key)) {
        map.get(key)!.count++;
      } else {
        map.set(key, {
          name: t.beneficiary_name || t.receiver_name || "Beneficiary",
          bank: t.beneficiary_bank || "",
          ifsc: t.beneficiary_ifsc || "",
          account: t.beneficiary_account || "",
          upi: t.upi_id || "",
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 6);
  }, [transactions]);

  // Handle Scan & Fill Extraction
  function handleScanApply(fields: ScanFields) {
    if (fields.amount) setAmount(fields.amount);
    if (fields.reference) setReference(fields.reference);
    if (fields.sender_name) setSenderName(fields.sender_name);
    if (fields.sender_mobile) setSenderMobile(fields.sender_mobile);
    if (fields.beneficiary_name) setBeneficiaryName(fields.beneficiary_name);
    if (fields.beneficiary_mobile) setBeneficiaryMobile(fields.beneficiary_mobile);
    if (fields.beneficiary_bank) setBeneficiaryBank(fields.beneficiary_bank);
    if (fields.beneficiary_ifsc) setBeneficiaryIfsc(fields.beneficiary_ifsc.toUpperCase());
    if (fields.beneficiary_account) setBeneficiaryAccount(fields.beneficiary_account);
    if (fields.upi_id) {
      setUpiId(fields.upi_id);
      setTransferMethod("upi");
    }
    if (fields.service_fee) setServiceFee(fields.service_fee);
    if (fields.portal_commission) setPortalCommission(fields.portal_commission);

    showToast("info", "Data applied from Scan & Fill.");
  }

  // Add Customer Modal Handler
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

    const existing = customers.find((c) => c.phone === phone);
    if (existing) {
      setSelectedCustomerId(existing.id);
      setSenderName(existing.name);
      setSenderMobile(existing.phone || phone);
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
          description: `Created customer ${newCust.name} via DMT`,
          details: { name: newCust.name, phone: newCust.phone, source: "dmt_workspace" },
        });

        setCustomers((prev) => [newCust, ...prev]);
        setSelectedCustomerId(newCust.id);
        setSenderName(newCust.name);
        setSenderMobile(newCust.phone || phone);
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

  // Add Beneficiary Modal Handler
  async function handleCreateBeneficiary(e: React.FormEvent) {
    e.preventDefault();
    if (transferMethod === "bank_account") {
      const acc = newBenAccount.trim();
      const ifsc = newBenIfsc.trim().toUpperCase();
      if (!acc || acc.length < 8) {
        setBenCreateError("Please enter a valid bank account number.");
        return;
      }
      if (!ifsc || ifsc.length !== 11) {
        setBenCreateError("Please enter a valid 11-character IFSC code (e.g. SBIN0001234).");
        return;
      }

      setBenCreateSubmitting(true);
      setBenCreateError("");

      try {
        const dedupeKey = `beneficiary|${ifsc}|${acc}`;
        await supabase.from("saved_contacts").upsert({
          key: dedupeKey,
          kind: "beneficiary",
          name: newBenName.trim() || null,
          mobile: newBenMobile.trim() || null,
          bank: newBenBank.trim() || null,
          ifsc: ifsc,
          account_number: acc,
        }, { onConflict: "key" });

        setBeneficiaryName(newBenName.trim());
        setBeneficiaryMobile(newBenMobile.trim());
        setBeneficiaryBank(newBenBank.trim());
        setBeneficiaryIfsc(ifsc);
        setBeneficiaryAccount(acc);

        setAddBeneficiaryWindowOpen(false);
        setNewBenName("");
        setNewBenMobile("");
        setNewBenBank("");
        setNewBenIfsc("");
        setNewBenAccount("");
        showToast("success", "Beneficiary details saved and selected.");
      } catch (err: any) {
        console.error("Beneficiary save error:", err);
        setBenCreateError(err.message || "Failed to save beneficiary.");
      } finally {
        setBenCreateSubmitting(false);
      }
    } else {
      const upi = newBenUpi.trim().toLowerCase();
      if (!upi || !upi.includes("@")) {
        setBenCreateError("Please enter a valid UPI ID (e.g. user@okhdfcbank).");
        return;
      }

      setBenCreateSubmitting(true);
      setBenCreateError("");

      try {
        const dedupeKey = `upi_receiver|${upi}`;
        await supabase.from("saved_contacts").upsert({
          key: dedupeKey,
          kind: "upi_receiver",
          name: newBenName.trim() || null,
          upi_id: upi,
        }, { onConflict: "key" });

        setUpiId(upi);
        setReceiverName(newBenName.trim());

        setAddBeneficiaryWindowOpen(false);
        setNewBenName("");
        setNewBenUpi("");
        showToast("success", "UPI Receiver details saved and selected.");
      } catch (err: any) {
        console.error("UPI receiver save error:", err);
        setBenCreateError(err.message || "Failed to save UPI receiver.");
      } finally {
        setBenCreateSubmitting(false);
      }
    }
  }

  // Add Bank Modal Handler
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
      setBeneficiaryBank(existing.name);
      setAddBankWindowOpen(false);
      setBankCreateSubmitting(false);
      showToast("info", `Selected "${existing.name}" (already in Master List).`);
      return;
    }

    try {
      const { data: newBank, error: insertError } = await supabase
        .from("aeps_banks")
        .insert({
          name: name,
          code: newBankCode.trim() || null,
          is_active: true,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      if (newBank) {
        await logAudit({
          action: "create",
          entity: "bank",
          entity_id: newBank.id,
          description: `Created Bank ${newBank.name} via DMT`,
          details: { name: newBank.name, code: newBank.code, source: "dmt_workspace" },
        });

        setBanks((prev) => [...prev, newBank]);
        setBeneficiaryBank(newBank.name);
        setAddBankWindowOpen(false);
        setNewBankName("");
        setNewBankCode("");
        showToast("success", `"${newBank.name}" added to Master List and selected.`);
      }
    } catch (err: any) {
      console.error("Bank creation error:", err);
      setBankCreateError(err.message || "Failed to create bank.");
    } finally {
      setBankCreateSubmitting(false);
    }
  }

  // Open Edit Modal for a Transaction
  function handleOpenEdit(t: Txn) {
    setEditingTxn(t);
    setEditSenderName(t.sender_name || "");
    setEditSenderMobile(t.sender_mobile || "");
    setEditCustomerId(t.customer_id || "");
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
      const updatedSenderName = editSenderName.trim() || null;
      const updatedSenderMobile = editSenderMobile.trim() || null;

      const { error: updateError } = await supabase
        .from("transactions")
        .update({
          customer_id: updatedCustId,
          sender_name: updatedSenderName,
          sender_mobile: updatedSenderMobile,
          reference: updatedRef,
          remarks: updatedRemarks,
        })
        .eq("id", editingTxn.id);

      if (updateError) throw updateError;

      await logAudit({
        action: "update",
        entity: "transaction",
        entity_id: editingTxn.id,
        description: `Corrected non-financial fields on DMT Txn #${editingTxn.transaction_number}`,
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
                sender_name: updatedSenderName,
                sender_mobile: updatedSenderMobile,
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

  // Pre-submission validation
  function handleInitiateTransfer() {
    const num = Number(amount);
    if (!num || num <= 0) {
      showToast("error", "Please enter a valid transfer amount.");
      return;
    }
    if (!senderName.trim()) {
      showToast("error", "Please enter the sender's full name.");
      return;
    }
    if (transferMethod === "bank_account") {
      if (!beneficiaryAccount.trim() || beneficiaryAccount.trim().length < 6) {
        showToast("error", "Please enter a valid beneficiary account number.");
        return;
      }
      if (!beneficiaryIfsc.trim()) {
        showToast("error", "Please enter the beneficiary bank IFSC code.");
        return;
      }
    } else {
      if (!upiId.trim() || !upiId.includes("@")) {
        showToast("error", "Please enter a valid beneficiary UPI ID.");
        return;
      }
    }

    if (!reference.trim()) {
      showToast("error", "Bank Reference / UTR Number is required for DMT transactions.");
      return;
    }

    if (customerPayMethod === "due" && !selectedCustomerId) {
      showToast("error", "Please select a registered customer to record payment as Due (Khata).");
      return;
    }

    setConfirmWindowOpen(true);
  }

  // Calculations
  const numAmount = Number(amount || 0);
  const numFee = Number(serviceFee || 0);
  const numComm = Number(portalCommission || 0);
  const totalCollected = numAmount + numFee;
  const totalIncome = numFee + numComm;

  // Execute Transfer Transaction
  async function handleProcessTransfer() {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const nowIso = new Date().toISOString();
      const dateStr = nowIso.slice(0, 10);

      const res = await supabase.rpc("create_business_txn", {
        p_service_type: "dmt",
        p_transaction_date: dateStr,
        p_transaction_timestamp: nowIso,
        p_customer_id: selectedCustomerId || null,
        p_customer_mobile: senderMobile.trim() || null,
        p_reference: reference.trim(),
        p_remarks: remarks.trim() || null,
        p_status: "success",
        p_bank_id: paidFrom === "bank" ? selectedBankInstrumentId : null,
        p_portal_id: paidFrom === "portal" ? selectedPortalId : null,
        p_merchant_qr_id: null,
        p_aadhaar_last4: null,
        p_transfer_method: transferMethod,
        p_sender_name: senderName.trim(),
        p_sender_mobile: senderMobile.trim() || null,
        p_beneficiary_name: beneficiaryName.trim() || null,
        p_beneficiary_mobile: beneficiaryMobile.trim() || null,
        p_beneficiary_bank: beneficiaryBank.trim() || null,
        p_beneficiary_ifsc: beneficiaryIfsc.trim().toUpperCase() || null,
        p_beneficiary_account: beneficiaryAccount.trim() || null,
        p_upi_id: transferMethod === "upi" ? upiId.trim() : null,
        p_amount: numAmount,
        p_service_fee: numFee,
        p_portal_commission: numComm,
        p_fee_source: null,
        p_paid_from: paidFrom,
        p_customer_pay_method: customerPayMethod,
        p_receiver_name: receiverName.trim() || null,
      });

      if (res.error) throw res.error;

      const newTxnId = (res.data as any)?.id;
      const newTxnNum = (res.data as any)?.transaction_number || "DMT-NEW";

      const completedRecord: Txn = {
        id: newTxnId || crypto.randomUUID(),
        transaction_number: newTxnNum,
        service_type: "dmt",
        direction: "in",
        transaction_date: dateStr,
        transaction_timestamp: nowIso,
        customer_id: selectedCustomerId || null,
        customer_mobile: senderMobile.trim() || null,
        reference: reference.trim(),
        remarks: remarks.trim() || null,
        status: "success",
        bank_id: paidFrom === "bank" ? selectedBankInstrumentId : null,
        portal_id: paidFrom === "portal" ? selectedPortalId : null,
        merchant_qr_id: null,
        provider_id: null,
        aadhaar_last4: null,
        transfer_method: transferMethod,
        sender_name: senderName.trim(),
        sender_mobile: senderMobile.trim() || null,
        beneficiary_name: beneficiaryName.trim() || null,
        beneficiary_mobile: beneficiaryMobile.trim() || null,
        beneficiary_bank: beneficiaryBank.trim() || null,
        beneficiary_ifsc: beneficiaryIfsc.trim().toUpperCase() || null,
        beneficiary_account: beneficiaryAccount.trim() || null,
        upi_id: transferMethod === "upi" ? upiId.trim() : null,
        amount: numAmount,
        service_fee: numFee,
        portal_commission: numComm,
        fee_source: null,
        paid_from: paidFrom,
        customer_pay_method: customerPayMethod,
        customers: customers.find((c) => c.id === selectedCustomerId) || null,
        banks: null,
        portals: portals.find((p) => p.id === selectedPortalId) || null,
        providers: null,
        merchant_qrs: null,
        profiles: null,
      };

      setTransactions((prev) => [completedRecord, ...prev]);
      setConfirmWindowOpen(false);

      // Reset transaction-specific inputs
      setReference("");
      setRemarks("");

      showToast("success", `₹${numAmount.toLocaleString("en-IN")} DMT transfer completed to ${beneficiaryName || "beneficiary"}.`);
    } catch (err: any) {
      console.error("DMT error:", err);
      showToast("error", err.message || "Failed to complete DMT transfer.");
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
        t.sender_name?.toLowerCase().includes(q) ||
        t.sender_mobile?.includes(q) ||
        t.beneficiary_name?.toLowerCase().includes(q) ||
        t.beneficiary_account?.includes(q) ||
        t.upi_id?.toLowerCase().includes(q) ||
        t.reference?.toLowerCase().includes(q)
    );
  }, [transactions, searchQuery]);

  return (
    <div className="space-y-6 pb-16">
      {/* Toast Notification Container */}
      {toastView}

      {/* ===============================================================================
          1. HEADER & LIVE OPERATIONAL STATUS (Depth 1 Spatial Header)
      =============================================================================== */}
      <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 p-6 text-white shadow-xl ring-1 ring-white/10 sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-0.5 text-xs font-bold text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                ● DMT Remittance Gateway Online
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-slate-300">
                Instant IMPS / NEFT Switch Active
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              Direct Money Transfer (DMT)
            </h1>
            <p className="text-xs text-violet-200/80 sm:text-sm">
              Instant domestic money remittance to any bank account or UPI VPA across India.
            </p>
          </div>

          {/* Available Float Card */}
          <div className="flex flex-col items-end rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">Available Remittance Pool</span>
            <div className="text-2xl font-black text-emerald-400">{inr(currentFloat)}</div>
            <span className="text-[10px] text-slate-400">Live Settlement Wallet</span>
          </div>
        </div>
      </div>

      {/* ===============================================================================
          2. TODAY'S DMT KPI SUMMARY
      =============================================================================== */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bento-surface-interactive flex flex-col justify-between p-5 dark:bg-slate-900/90">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Today's Transfers</span>
          <div className="my-2">
            <div className="text-2xl font-black text-slate-900 sm:text-3xl dark:text-white">{inr(todayVolume)}</div>
            <p className="text-xs text-slate-500">{todayCount} transfers completed</p>
          </div>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">● 100% Settled</span>
        </div>

        <div className="bento-surface-interactive flex flex-col justify-between p-5 dark:bg-slate-900/90">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Earned Income Today</span>
          <div className="my-2">
            <div className="text-2xl font-black text-emerald-600 sm:text-3xl dark:text-emerald-400">+{inr(todayIncome)}</div>
            <p className="text-xs text-slate-500">Service Fees + Portal Commissions</p>
          </div>
          <span className="text-[11px] text-slate-400">Direct Gross Remittance Margin</span>
        </div>

        <div className="bento-surface-interactive flex flex-col justify-between p-5 dark:bg-slate-900/90">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Active DMT Portals</span>
          <div className="my-2">
            <div className="text-2xl font-black text-indigo-950 sm:text-3xl dark:text-white">{portals.length}</div>
            <p className="text-xs text-slate-500">Fino, Spice Money, Payworld, RNFI</p>
          </div>
          <Link href="/business/portals" className="text-[11px] text-blue-600 font-bold hover:underline dark:text-blue-400">Manage Portals →</Link>
        </div>

        <div className="bento-surface-interactive flex flex-col justify-between p-5 dark:bg-slate-900/90">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Beneficiary Network</span>
          <div className="my-2">
            <div className="text-2xl font-black text-amber-600 sm:text-3xl dark:text-amber-400">{banks.length} Banks</div>
            <p className="text-xs text-slate-500">National IMPS / NEFT Routing</p>
          </div>
          <button type="button" onClick={() => setAddBankWindowOpen(true)} className="text-[11px] text-blue-600 font-bold text-left hover:underline dark:text-blue-400">
            + Add Master Bank
          </button>
        </div>
      </div>

      {/* ===============================================================================
          3. MAIN DMT COMMAND CENTER
      =============================================================================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left (8 Cols): Sender, Beneficiary, Amount & Money Flow */}
        <div className="bento-surface p-6 lg:col-span-8 dark:bg-slate-900/90 space-y-6">
          {/* Top Bar: Transfer Mode & Scan & Fill */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-white/5">
            <div className="flex items-center gap-1.5 rounded-2xl bg-slate-100 p-1 dark:bg-white/5">
              {[
                { id: "bank_account", label: "🏦 Bank Account (IMPS/NEFT)" },
                { id: "upi", label: "📱 UPI Instant VPA" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setTransferMethod(m.id as any)}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                    transferMethod === m.id
                      ? "bg-white text-slate-900 shadow-sm dark:bg-violet-600 dark:text-white"
                      : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setScanModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-xs font-black text-white shadow-md shadow-violet-500/25 transition hover:brightness-110 active:scale-95"
            >
              <span>📷 Scan &amp; Fill Receipt / SMS</span>
            </button>
          </div>

          {/* 1. SENDER INFORMATION SECTION */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-white/5">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">1. Sender Information</span>
              <button
                type="button"
                onClick={() => setAddCustomerWindowOpen(true)}
                className="text-[11px] font-bold text-blue-600 hover:underline dark:text-blue-400"
              >
                + Add New Customer to CRM
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Select Registered Customer (Optional)
                </label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <SearchableSelect
                      value={selectedCustomerId}
                      onChange={setSelectedCustomerId}
                      options={[
                        { value: "", label: "-- Walk-in Sender --" },
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
                  >
                    + Add
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Sender Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="Full name of sender"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs font-semibold outline-none focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:bg-slate-900"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Sender Mobile Number
                </label>
                <input
                  type="tel"
                  maxLength={10}
                  value={senderMobile}
                  onChange={(e) => setSenderMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-digit mobile number"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs font-semibold outline-none focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:bg-slate-900"
                />
              </div>
            </div>
          </div>

          {/* 2. BENEFICIARY DESTINATION SECTION */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-white/5">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">2. Beneficiary / Destination</span>
              <button
                type="button"
                onClick={() => setAddBeneficiaryWindowOpen(true)}
                className="text-[11px] font-bold text-violet-600 hover:underline dark:text-violet-400"
              >
                + Save Beneficiary
              </button>
            </div>

            {/* Quick Beneficiary Chips */}
            {beneficiarySuggestions.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400">Recent Beneficiaries:</span>
                <div className="flex flex-wrap gap-1.5">
                  {beneficiarySuggestions.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setBeneficiaryName(s.name);
                        setBeneficiaryBank(s.bank);
                        setBeneficiaryIfsc(s.ifsc);
                        setBeneficiaryAccount(s.account);
                        if (s.upi) {
                          setUpiId(s.upi);
                          setTransferMethod("upi");
                        } else {
                          setTransferMethod("bank_account");
                        }
                      }}
                      className="rounded-xl border border-slate-200 bg-slate-100/70 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-violet-50 hover:border-violet-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                    >
                      {s.name} {s.account ? `(${maskAccount(s.account)})` : s.upi ? `(${s.upi})` : ""}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {transferMethod === "bank_account" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Beneficiary Account Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={beneficiaryAccount}
                    onChange={(e) => setBeneficiaryAccount(e.target.value.replace(/\D/g, ""))}
                    placeholder="e.g. 100023456789"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs font-black tracking-widest outline-none focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:bg-slate-900"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Beneficiary IFSC Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={11}
                    value={beneficiaryIfsc}
                    onChange={(e) => setBeneficiaryIfsc(e.target.value.toUpperCase())}
                    placeholder="e.g. SBIN0001234"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs font-black tracking-wider outline-none focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:bg-slate-900"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Beneficiary Name
                  </label>
                  <input
                    type="text"
                    value={beneficiaryName}
                    onChange={(e) => setBeneficiaryName(e.target.value)}
                    placeholder="Recipient name as per bank records"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs font-semibold outline-none focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:bg-slate-900"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Beneficiary Bank Name
                  </label>
                  <input
                    type="text"
                    value={beneficiaryBank}
                    onChange={(e) => setBeneficiaryBank(e.target.value)}
                    placeholder="e.g. State Bank of India"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs font-semibold outline-none focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:bg-slate-900"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Beneficiary UPI ID (VPA) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value.toLowerCase())}
                    placeholder="e.g. rahul@oksbi / 9876543210@paytm"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs font-black tracking-wide outline-none focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:bg-slate-900"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Receiver Display Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={receiverName}
                    onChange={(e) => setReceiverName(e.target.value)}
                    placeholder="Recipient verified name"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs font-semibold outline-none focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:bg-slate-900"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 3. TRANSFER AMOUNT & MONEY FLOW */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-white/5">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">3. Transfer Amount &amp; Payment Flow</span>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Transfer Amount (₹) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-slate-400">₹</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="5000"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-3.5 pl-10 pr-4 text-2xl font-black text-slate-900 outline-none focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:bg-slate-900"
                />
              </div>

              {/* Quick Amount Chips */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {["500", "1000", "2000", "3000", "5000", "10000", "25000"].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAmount(v)}
                    className={`rounded-xl border px-3 py-1 text-xs font-black transition ${
                      amount === v
                        ? "border-violet-600 bg-violet-600 text-white shadow-xs"
                        : "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                    }`}
                  >
                    ₹{Number(v).toLocaleString("en-IN")}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Portal Charge / Commission (₹)
                </label>
                <input
                  type="number"
                  value={portalCommission}
                  onChange={(e) => setPortalCommission(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-bold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
                  placeholder="Portal commission"
                />
              </div>

              {/* Money Sent From */}
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Money Sent From (Disbursement Source) <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaidFrom("portal")}
                    className={`rounded-2xl border p-3 text-left transition ${
                      paidFrom === "portal"
                        ? "border-violet-600 bg-violet-50/80 shadow-xs dark:border-violet-500 dark:bg-violet-950/30"
                        : "border-slate-200 bg-slate-50/50 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5"
                    }`}
                  >
                    <div className="text-xs font-black text-slate-900 dark:text-white">
                      👛 DMT Portal Wallet
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      Settles from live DMT gateway wallet pool.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaidFrom("bank")}
                    className={`rounded-2xl border p-3 text-left transition ${
                      paidFrom === "bank"
                        ? "border-violet-600 bg-violet-50/80 shadow-xs dark:border-violet-500 dark:bg-violet-950/30"
                        : "border-slate-200 bg-slate-50/50 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5"
                    }`}
                  >
                    <div className="text-xs font-black text-slate-900 dark:text-white">
                      🏦 Our Bank Account
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      Settles from linked shop bank account.
                    </p>
                  </button>
                </div>
              </div>

              {/* Customer Paid You Via */}
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Customer Paid You Via <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { id: "cash", label: "💵 Cash", desc: "Cash drawer inflow" },
                    { id: "upi", label: "📱 UPI QR", desc: "Merchant QR float" },
                    { id: "bank", label: "🏦 Bank", desc: "Direct deposit" },
                    { id: "due", label: "📋 Due", desc: "Customer Khata" },
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

              {/* Bank Reference / UTR Number (Mandatory) */}
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Bank Reference / UTR / RRN Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="12-digit UTR / RRN / IMPS Auth Reference"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs font-black tracking-wider outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right (4 Cols): Live Financial Summary & Action */}
        <div className="bento-surface p-6 lg:col-span-4 dark:bg-slate-900/90 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="border-b border-slate-100 pb-3 dark:border-white/5">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Order Summary</span>
              <h3 className="text-base font-black text-slate-900 dark:text-white">DMT Remittance Summary</h3>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Transfer Mode:</span>
                <strong className="text-slate-900 dark:text-white">
                  {transferMethod === "bank_account" ? "🏦 Bank IMPS/NEFT" : "📱 UPI Remittance"}
                </strong>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Sender:</span>
                <strong className="text-slate-900 dark:text-white truncate max-w-[160px]">
                  {senderName || "Walk-in Sender"}
                </strong>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Beneficiary:</span>
                <strong className="text-slate-900 dark:text-white truncate max-w-[160px]">
                  {transferMethod === "upi" ? (upiId || "Pending") : (beneficiaryName || beneficiaryAccount ? maskAccount(beneficiaryAccount) : "Pending")}
                </strong>
              </div>

              <div className="flex justify-between border-t border-slate-100 pt-2 dark:border-white/5">
                <span className="text-slate-500">Transfer Amount:</span>
                <strong className="text-slate-900 dark:text-white font-black">{inr(numAmount)}</strong>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Customer Service Fee:</span>
                <strong className="text-emerald-600 dark:text-emerald-400 font-bold">+{inr(numFee)}</strong>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Collection Method:</span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-white/10 dark:text-slate-300">
                  {customerPayMethod.toUpperCase()}
                </span>
              </div>

              <div className="flex justify-between border-t border-slate-100 pt-2 dark:border-white/5">
                <span className="font-bold text-slate-700 dark:text-slate-300">Total Money Collected:</span>
                <strong className="text-base font-black text-slate-900 dark:text-white">{inr(totalCollected)}</strong>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Beneficiary Receives:</span>
                <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{inr(numAmount)}</strong>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Portal Commission:</span>
                <strong className="text-emerald-600 dark:text-emerald-400 font-bold">+{inr(numComm)}</strong>
              </div>

              <div className="flex justify-between border-t border-slate-100 pt-1.5 dark:border-white/5">
                <span className="font-bold text-slate-700 dark:text-slate-300">Total Net Income:</span>
                <strong className="text-emerald-600 dark:text-emerald-400 font-black">+{inr(totalIncome)}</strong>
              </div>

              {/* Receipt Print Preference */}
              <div className="border-t border-slate-100 pt-2 dark:border-white/5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 font-bold">Default Receipt Style:</span>
                  <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-white/5">
                    <button
                      type="button"
                      onClick={() => setReceiptMode("basic")}
                      className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition ${
                        receiptMode === "basic" ? "bg-white text-slate-900 shadow-xs dark:bg-violet-600 dark:text-white" : "text-slate-500"
                      }`}
                    >
                      Basic
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptMode("detailed")}
                      className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition ${
                        receiptMode === "detailed" ? "bg-white text-slate-900 shadow-xs dark:bg-violet-600 dark:text-white" : "text-slate-500"
                      }`}
                    >
                      Detailed
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Primary Action Button */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleInitiateTransfer}
              className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3.5 text-sm font-black text-white shadow-lg shadow-violet-500/25 transition hover:brightness-110 active:scale-[0.98]"
            >
              ✓ Confirm &amp; Transfer {inr(numAmount)}
            </button>
            <p className="text-center text-[10px] text-slate-400">
              Deterministic double-entry remittance engine
            </p>
          </div>
        </div>
      </div>

      {/* ===============================================================================
          4. RECENT DMT TRANSACTIONS TABLE
      =============================================================================== */}
      <div className="bento-surface p-6 dark:bg-slate-900/90 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-white/5">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">Recent DMT Transfer Records</h3>
            <p className="text-xs text-slate-400">Live ledger of domestic remittances and beneficiary payouts.</p>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by UTR, sender, beneficiary, or account…"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 dark:border-white/10">
                <th className="pb-2.5 font-bold">Txn # / Time</th>
                <th className="pb-2.5 font-bold">Sender</th>
                <th className="pb-2.5 font-bold">Beneficiary &amp; Destination</th>
                <th className="pb-2.5 font-bold text-right">Transfer</th>
                <th className="pb-2.5 font-bold text-right">Fee</th>
                <th className="pb-2.5 font-bold text-center">Paid Via</th>
                <th className="pb-2.5 font-bold text-right">Total Income</th>
                <th className="pb-2.5 font-bold text-center">Status</th>
                <th className="pb-2.5 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-medium text-slate-700 dark:text-slate-300">
              {filteredTxns.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No DMT transactions found. Process a money transfer above to see records.
                  </td>
                </tr>
              ) : (
                filteredTxns.slice(0, 15).map((t) => {
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
                        <div className="font-bold text-slate-900 dark:text-white">{t.sender_name || t.customers?.name || "Walk-in"}</div>
                        <div className="text-[10px] text-slate-400">
                          {t.sender_mobile ? `📱 ${maskMobile(t.sender_mobile)}` : ""}
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {t.beneficiary_name || t.receiver_name || "Beneficiary"}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {t.transfer_method === "upi" ? (
                            <span>{t.upi_id}</span>
                          ) : (
                            <span>{t.beneficiary_bank || "Bank"} • {maskAccount(t.beneficiary_account)}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 text-right font-black text-slate-900 dark:text-white">
                        {inr(t.amount)}
                      </td>
                      <td className="py-3 text-right font-bold text-emerald-700 dark:text-emerald-400">
                        +{inr(t.service_fee)}
                      </td>
                      <td className="py-3 text-center">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-white/10 dark:text-slate-300">
                          {t.customer_pay_method ? t.customer_pay_method.toUpperCase() : "CASH"}
                        </span>
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
                            title="Edit Non-Financial Reference"
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
          title="Confirm DMT Money Transfer"
          onClose={() => setConfirmWindowOpen(false)}
        >
          <div className="p-5 space-y-4">
            <div className="rounded-2xl bg-slate-50 p-4 text-xs space-y-2 dark:bg-white/5">
              <div className="flex justify-between">
                <span className="text-slate-500">Transfer Mode:</span>
                <strong className="text-slate-900 dark:text-white">
                  {transferMethod === "bank_account" ? "Bank Account (IMPS/NEFT)" : "UPI Remittance"}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Sender Name:</span>
                <strong className="text-slate-900 dark:text-white">{senderName}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Beneficiary:</span>
                <strong className="text-slate-900 dark:text-white">
                  {transferMethod === "upi" ? upiId : `${beneficiaryName || "Beneficiary"} (${maskAccount(beneficiaryAccount)})`}
                </strong>
              </div>
              {transferMethod === "bank_account" && (
                <div className="flex justify-between">
                  <span className="text-slate-500">IFSC &amp; Bank:</span>
                  <strong className="text-slate-900 dark:text-white">{beneficiaryIfsc} · {beneficiaryBank || "Bank"}</strong>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-2 dark:border-white/10">
                <span className="text-slate-500">Transfer Amount:</span>
                <strong className="text-base text-slate-900 dark:text-white">{inr(numAmount)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Customer Service Fee:</span>
                <strong className="text-emerald-600 dark:text-emerald-400 font-bold">+{inr(numFee)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Paid by Customer:</span>
                <strong className="text-slate-900 dark:text-white font-black">{inr(totalCollected)} via {customerPayMethod.toUpperCase()}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Disbursement Source:</span>
                <strong className="text-slate-900 dark:text-white">
                  {paidFrom === "portal" ? "DMT Portal Wallet" : "Our Bank Account"}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Bank Reference / UTR:</span>
                <strong className="text-slate-900 dark:text-white">{reference}</strong>
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              Please verify beneficiary credentials before confirming. Transfers are processed in real-time.
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
                onClick={handleProcessTransfer}
                disabled={isSubmitting}
                className="rounded-xl bg-violet-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-violet-700 disabled:opacity-50"
              >
                {isSubmitting ? "Processing…" : `Confirm & Transfer ${inr(numAmount)}`}
              </button>
            </div>
          </div>
        </FloatingWindow>
      )}

      {/* ===============================================================================
          6. ADD NEW CUSTOMER MODAL
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
                Address (Optional)
              </label>
              <input
                type="text"
                value={newCustAddress}
                onChange={(e) => setNewCustAddress(e.target.value)}
                placeholder="Ward / Village / Town"
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
          7. ADD BENEFICIARY MODAL
      =============================================================================== */}
      {addBeneficiaryWindowOpen && (
        <FloatingWindow
          isOpen={addBeneficiaryWindowOpen}
          size="sm"
          title="Save Beneficiary / Receiver"
          onClose={() => setAddBeneficiaryWindowOpen(false)}
        >
          <form onSubmit={handleCreateBeneficiary} className="p-5 space-y-4">
            {benCreateError && (
              <div className="rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-600 dark:bg-rose-950/30 dark:text-rose-400">
                {benCreateError}
              </div>
            )}

            {transferMethod === "bank_account" ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Beneficiary Account Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newBenAccount}
                    onChange={(e) => setNewBenAccount(e.target.value.replace(/\D/g, ""))}
                    placeholder="e.g. 100023456789"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black tracking-widest outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    IFSC Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={11}
                    value={newBenIfsc}
                    onChange={(e) => setNewBenIfsc(e.target.value.toUpperCase())}
                    placeholder="e.g. SBIN0001234"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black tracking-wider outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Beneficiary Name
                  </label>
                  <input
                    type="text"
                    value={newBenName}
                    onChange={(e) => setNewBenName(e.target.value)}
                    placeholder="Recipient name"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Bank Name
                  </label>
                  <input
                    type="text"
                    value={newBenBank}
                    onChange={(e) => setNewBenBank(e.target.value)}
                    placeholder="e.g. State Bank of India"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Beneficiary UPI ID <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newBenUpi}
                    onChange={(e) => setNewBenUpi(e.target.value.toLowerCase())}
                    placeholder="user@upi"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Receiver Display Name
                  </label>
                  <input
                    type="text"
                    value={newBenName}
                    onChange={(e) => setNewBenName(e.target.value)}
                    placeholder="Recipient verified name"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
                  />
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAddBeneficiaryWindowOpen(false)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={benCreateSubmitting}
                className="rounded-xl bg-violet-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-violet-700 disabled:opacity-50"
              >
                {benCreateSubmitting ? "Saving…" : "Save Beneficiary"}
              </button>
            </div>
          </form>
        </FloatingWindow>
      )}

      {/* ===============================================================================
          8. ADD NEW BANK MODAL
      =============================================================================== */}
      {addBankWindowOpen && (
        <FloatingWindow
          isOpen={addBankWindowOpen}
          size="sm"
          title="Add Master Bank"
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
          9. EDIT TRANSACTION MODAL (Controlled Non-Financial Corrections)
      =============================================================================== */}
      {editTxnWindowOpen && editingTxn && (
        <FloatingWindow
          isOpen={editTxnWindowOpen}
          size="sm"
          title={`Edit DMT Transaction #${editingTxn.transaction_number}`}
          onClose={() => setEditTxnWindowOpen(false)}
        >
          <form onSubmit={handleSaveEdit} className="p-5 space-y-4 text-xs">
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
              <strong>Immutable Audit Safeguard:</strong> Transfer amount ({inr(editingTxn.amount)}) and settlement ledger entries are permanently locked. You may update sender attribution, reference UTR, or remarks.
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Sender Name
              </label>
              <input
                type="text"
                value={editSenderName}
                onChange={(e) => setEditSenderName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Sender Mobile
              </label>
              <input
                type="tel"
                value={editSenderMobile}
                onChange={(e) => setEditSenderMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Bank Reference / UTR Number
              </label>
              <input
                type="text"
                value={editReference}
                onChange={(e) => setEditReference(e.target.value)}
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
          10. TRANSACTION DETAIL VIEW MODAL
      =============================================================================== */}
      {selectedDetailTxn && (
        <FloatingWindow
          isOpen={Boolean(selectedDetailTxn)}
          size="md"
          title={`DMT Transaction #${selectedDetailTxn.transaction_number}`}
          onClose={() => setSelectedDetailTxn(null)}
        >
          {(() => {
            const receiptUrl = `/business/receipt/${selectedDetailTxn.id}${receiptMode === "detailed" ? "?mode=detailed" : ""}`;
            const invoiceUrl = `/business/receipt/${selectedDetailTxn.id}/a4${receiptMode === "detailed" ? "?mode=detailed" : ""}`;

            return (
              <div className="p-5 space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-white/5">
                  <div><span className="text-slate-400">Date:</span> <div className="font-bold">{selectedDetailTxn.transaction_date}</div></div>
                  <div><span className="text-slate-400">Status:</span> <div className="font-bold text-emerald-600">{selectedDetailTxn.status.toUpperCase()}</div></div>
                  <div><span className="text-slate-400">Transfer Amount:</span> <div className="font-black text-sm">{inr(selectedDetailTxn.amount)}</div></div>
                  <div><span className="text-slate-400">Service Fee:</span> <div className="font-bold text-emerald-600">+{inr(selectedDetailTxn.service_fee)}</div></div>
                  <div><span className="text-slate-400">Total Money Collected:</span> <div className="font-black text-sm text-slate-900 dark:text-white">{inr(Number(selectedDetailTxn.amount || 0) + Number(selectedDetailTxn.service_fee || 0))}</div></div>
                  <div><span className="text-slate-400">Paid Via:</span> <div className="font-bold text-slate-700 dark:text-slate-300">{(selectedDetailTxn.customer_pay_method || "CASH").toUpperCase()}</div></div>
                  <div><span className="text-slate-400">Sender:</span> <div className="font-bold">{selectedDetailTxn.sender_name || selectedDetailTxn.customers?.name || "Walk-in"}</div></div>
                  <div><span className="text-slate-400">Sender Mobile:</span> <div className="font-bold">{selectedDetailTxn.sender_mobile ? maskMobile(selectedDetailTxn.sender_mobile) : "N/A"}</div></div>
                  <div><span className="text-slate-400">Beneficiary:</span> <div className="font-bold">{selectedDetailTxn.beneficiary_name || selectedDetailTxn.receiver_name || "Beneficiary"}</div></div>
                  <div><span className="text-slate-400">Account / VPA:</span> <div className="font-bold">{selectedDetailTxn.transfer_method === "upi" ? selectedDetailTxn.upi_id : maskAccount(selectedDetailTxn.beneficiary_account)}</div></div>
                  {selectedDetailTxn.beneficiary_ifsc && <div><span className="text-slate-400">IFSC:</span> <div className="font-bold">{selectedDetailTxn.beneficiary_ifsc}</div></div>}
                  {selectedDetailTxn.beneficiary_bank && <div><span className="text-slate-400">Bank:</span> <div className="font-bold">{selectedDetailTxn.beneficiary_bank}</div></div>}
                  {selectedDetailTxn.reference && <div className="col-span-2"><span className="text-slate-400">Reference / UTR:</span> <div className="font-bold">{selectedDetailTxn.reference}</div></div>}
                  {selectedDetailTxn.remarks && <div className="col-span-2"><span className="text-slate-400">Remarks:</span> <div className="font-semibold">{selectedDetailTxn.remarks}</div></div>}
                </div>

                <div className="flex justify-between items-center pt-2">
                  <div className="flex gap-2">
                    <Link
                      href={receiptUrl}
                      target="_blank"
                      className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white hover:bg-slate-800 dark:bg-violet-600"
                    >
                      🖨️ 80mm Receipt
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
          11. SCAN & FILL MODAL
      =============================================================================== */}
      {scanModalOpen && (
        <ScanFillModal
          open={scanModalOpen}
          mode="dmt"
          onClose={() => setScanModalOpen(false)}
          onApply={handleScanApply}
        />
      )}
    </div>
  );
}
