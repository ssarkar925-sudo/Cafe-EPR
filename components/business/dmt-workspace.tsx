"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
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

  useRealtime(["transactions", "aeps_banks", "aeps_portals", "customers", "cash_entries", "saved_contacts", "payment_instruments", "settlements"]);

  const [transactions, setTransactions] = useState<Txn[]>(initialTransactions);
  const [customers, setCustomers] = useState<CustomerRow[]>(initialCustomers);
  const [banks, setBanks] = useState<Master[]>(initialBanks);
  const [portals] = useState<Master[]>(initialPortals);
  const [liveInstruments, setLiveInstruments] = useState<any[]>(paymentInstruments || []);

  // Live Database Float Balances (Zero hardcoded defaults)
  const [dmtFloat, setDmtFloat] = useState<number>(() => Number(float?.current ?? float ?? 0));
  const [bankPoolFloat, setBankPoolFloat] = useState<number>(0);
  const [isRefreshingBalances, setIsRefreshingBalances] = useState(false);

  // Guided Transfer Mode: "bank_account" (IMPS/NEFT) vs "upi" (Instant UPI VPA)
  const [transferMethod, setTransferMethod] = useState<"bank_account" | "upi">("bank_account");

  // Step 1: Sender / Customer Fields
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [senderName, setSenderName] = useState<string>("");
  const [senderMobile, setSenderMobile] = useState<string>("");

  // Step 2 & 3: Beneficiary Fields (All Optional as per instruction)
  const [beneficiaryName, setBeneficiaryName] = useState<string>("");
  const [beneficiaryMobile, setBeneficiaryMobile] = useState<string>("");
  const [beneficiaryBank, setBeneficiaryBank] = useState<string>("");
  const [beneficiaryIfsc, setBeneficiaryIfsc] = useState<string>("");
  const [beneficiaryAccount, setBeneficiaryAccount] = useState<string>("");
  const [upiId, setUpiId] = useState<string>("");
  const [receiverName, setReceiverName] = useState<string>("");

  // Step 4 & 5: Amount, Fee, Portal Charge & Portal Commission
  const [amount, setAmount] = useState<string>("5000");
  const [serviceFee, setServiceFee] = useState<string>("20");
  const [portalCharge, setPortalCharge] = useState<string>("15");
  const [portalCommission, setPortalCommission] = useState<string>("5");

  // Step 6: Funding Source (Disbursement)
  const [paidFrom, setPaidFrom] = useState<"portal" | "bank">("portal");
  const [selectedPortalId, setSelectedPortalId] = useState<string>(initialPortals[0]?.id || "");
  const [selectedBankInstrumentId, setSelectedBankInstrumentId] = useState<string>(liveInstruments[0]?.id || "");

  // Step 7: Customer Collection Instrument
  const [customerPayMethod, setCustomerPayMethod] = useState<"cash" | "upi" | "bank" | "due">("cash");

  // Step 8: Reference & Remarks
  const [reference, setReference] = useState<string>("");
  const [remarks, setRemarks] = useState<string>("");

  // Receipt Print Preference (Basic default vs Detailed)
  const [receiptMode, setReceiptMode] = useState<"basic" | "detailed">("basic");

  // Analytics Active Tab
  const [analyticsTab, setAnalyticsTab] = useState<"overview" | "bank" | "portal" | "method" | "collection" | "funding">("overview");

  // Scan & Fill State
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scannedReviewData, setScannedReviewData] = useState<{
    amount?: string;
    reference?: string;
    senderName?: string;
    senderMobile?: string;
    beneficiaryName?: string;
    beneficiaryBank?: string;
    beneficiaryIfsc?: string;
    beneficiaryAccount?: string;
    upiId?: string;
    serviceFee?: string;
    portalCharge?: string;
  } | null>(null);

  // Modals & UI Lifecycle
  const [confirmWindowOpen, setConfirmWindowOpen] = useState(false);
  const [successWindowOpen, setSuccessWindowOpen] = useState(false);
  const [lastCompletedTxn, setLastCompletedTxn] = useState<Txn | null>(null);
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
  const [newBenConfirmAccount, setNewBenConfirmAccount] = useState("");
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

  // Reverse Transaction Modal State
  const [reverseWindowOpen, setReverseWindowOpen] = useState(false);
  const [reversingTxn, setReversingTxn] = useState<Txn | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [reverseSubmitting, setReverseSubmitting] = useState(false);

  // Authoritative Backend Live Balance Fetcher
  const refreshBalances = useCallback(async () => {
    setIsRefreshingBalances(true);
    try {
      const [{ data: pools }, { data: insts }] = await Promise.all([
        supabase.rpc("get_pool_balances"),
        supabase.from("payment_instruments").select("*").order("name"),
      ]);

      if (pools) {
        const dmt = (pools as any)?.dmt;
        if (dmt) {
          setDmtFloat(Number(dmt.current ?? dmt ?? 0));
        }
        const bank = (pools as any)?.bank;
        if (bank) {
          setBankPoolFloat(Number(bank.current ?? bank ?? 0));
        }
      }

      if (insts && Array.isArray(insts)) {
        setLiveInstruments(insts);
      }
    } catch (err) {
      console.error("Failed to refresh live balances:", err);
    } finally {
      setIsRefreshingBalances(false);
    }
  }, [supabase]);

  // Initial and Periodic Balance Sync
  useEffect(() => {
    refreshBalances();
  }, [refreshBalances]);

  // Auto-sync sender name & phone when customer is selected
  useEffect(() => {
    if (!selectedCustomerId) return;
    const c = customers.find((x) => x.id === selectedCustomerId);
    if (c) {
      setSenderName(c.name || "");
      if (c.phone) setSenderMobile(c.phone);
    }
  }, [selectedCustomerId, customers]);

  // Selected Bank Account & Balance
  const selectedBankInstrument = useMemo(() => {
    return liveInstruments.find((i) => i.id === selectedBankInstrumentId) || liveInstruments[0] || null;
  }, [liveInstruments, selectedBankInstrumentId]);

  const currentBankBalance = useMemo(() => {
    if (selectedBankInstrument && selectedBankInstrument.current_balance !== undefined && selectedBankInstrument.current_balance !== null) {
      return Number(selectedBankInstrument.current_balance);
    }
    return bankPoolFloat;
  }, [selectedBankInstrument, bankPoolFloat]);

  // Calculations for current inputs (Separating Revenue vs Provider Cost)
  const numAmount = Number(amount || 0);
  const numFee = Number(serviceFee || 0);
  const numCharge = Number(portalCharge || 0);
  const numComm = Number(portalCommission || 0);

  const totalCollected = numAmount + numFee + numCharge; // Principal + Fee + Charge (Total Customer Pays)
  const businessRevenue = numFee + numComm; // Our Business Revenue
  const providerCost = numCharge; // Provider Cost / Pass-through Charge
  const netContribution = businessRevenue - providerCost; // Net Contribution to business

  // Live Available Selected Float & Sufficiency Check
  const availableSelectedFloat = paidFrom === "portal" ? dmtFloat : currentBankBalance;
  const isFloatInsufficient = numAmount > availableSelectedFloat;
  const floatShortfall = Math.max(0, numAmount - availableSelectedFloat);

  // Today's DMT KPI calculations
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayTxns = useMemo(() => {
    return transactions.filter(
      (t) => t.service_type === "dmt" && (t.transaction_date === todayStr || t.transaction_timestamp?.slice(0, 10) === todayStr) && t.status === "success"
    );
  }, [transactions, todayStr]);

  const todayVolume = todayTxns.reduce((s, t) => s + Number(t.amount || 0), 0);
  const todayCustomerCollections = todayTxns.reduce((s, t) => s + Number(t.amount || 0) + Number(t.service_fee || 0) + Number(t.portal_charge || 0), 0);
  const todayCustomerFees = todayTxns.reduce((s, t) => s + Number(t.service_fee || 0), 0);
  const todayPortalCharges = todayTxns.reduce((s, t) => s + Number(t.portal_charge || 0), 0);
  const todayPortalCommission = todayTxns.reduce((s, t) => s + Number(t.portal_commission || 0), 0);
  const todayBusinessRevenue = todayCustomerFees + todayPortalCommission;
  const todayNetContribution = todayBusinessRevenue - todayPortalCharges;
  const todayCount = todayTxns.length;

  // Matched Master Bank Object for Beneficiary Bank
  const matchedBeneficiaryBank = useMemo(() => {
    return matchBank(beneficiaryBank, banks);
  }, [beneficiaryBank, banks]);

  // Beneficiary Quick Suggestions from past transactions
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

  // Handle Scan & Fill Extraction with Review Guard
  function handleScanApply(fields: ScanFields) {
    setScannedReviewData({
      amount: fields.amount || undefined,
      reference: fields.reference || undefined,
      senderName: fields.sender_name || undefined,
      senderMobile: fields.sender_mobile || undefined,
      beneficiaryName: fields.beneficiary_name || undefined,
      beneficiaryBank: fields.beneficiary_bank || undefined,
      beneficiaryIfsc: fields.beneficiary_ifsc ? fields.beneficiary_ifsc.toUpperCase() : undefined,
      beneficiaryAccount: fields.beneficiary_account || undefined,
      upiId: fields.upi_id || undefined,
      serviceFee: fields.service_fee || undefined,
    });

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

    showToast("info", "Parsed data applied. Please review before confirmation.");
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
      showToast("info", `Customer "${existing.name}" already in CRM. Selected.`);
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

  // Add Beneficiary Modal Handler with Optional Fields & Confirm Account Check
  async function handleCreateBeneficiary(e: React.FormEvent) {
    e.preventDefault();
    if (transferMethod === "bank_account") {
      const acc = newBenAccount.trim();
      const confirmAcc = newBenConfirmAccount.trim();
      const ifsc = newBenIfsc.trim().toUpperCase();

      if (acc && confirmAcc && acc !== confirmAcc) {
        setBenCreateError("Account number and Confirm Account Number do not match.");
        return;
      }

      if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
        setBenCreateError("Please enter a valid 11-character IFSC code (e.g. SBIN0001234).");
        return;
      }

      setBenCreateSubmitting(true);
      setBenCreateError("");

      try {
        const dedupeKey = `beneficiary|${ifsc || "ANY"}|${acc || "ANY"}`;
        await supabase.from("saved_contacts").upsert({
          key: dedupeKey,
          kind: "beneficiary",
          name: newBenName.trim() || null,
          mobile: newBenMobile.trim() || null,
          bank: newBenBank.trim() || null,
          ifsc: ifsc || null,
          account_number: acc || null,
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
        setNewBenConfirmAccount("");
        showToast("success", "Beneficiary saved to address book.");
      } catch (err: any) {
        console.error("Beneficiary save error:", err);
        setBenCreateError(err.message || "Failed to save beneficiary.");
      } finally {
        setBenCreateSubmitting(false);
      }
    } else {
      const upi = newBenUpi.trim().toLowerCase();
      if (upi && !upi.includes("@")) {
        setBenCreateError("Please enter a valid UPI ID (e.g. user@oksbi).");
        return;
      }

      setBenCreateSubmitting(true);
      setBenCreateError("");

      try {
        const dedupeKey = `upi_receiver|${upi || "ANY"}`;
        await supabase.from("saved_contacts").upsert({
          key: dedupeKey,
          kind: "upi_receiver",
          name: newBenName.trim() || null,
          upi_id: upi || null,
        }, { onConflict: "key" });

        setUpiId(upi);
        setReceiverName(newBenName.trim());

        setAddBeneficiaryWindowOpen(false);
        setNewBenName("");
        setNewBenUpi("");
        showToast("success", "UPI Receiver saved to address book.");
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
        showToast("success", `"${newBank.name}" registered and selected.`);
      }
    } catch (err: any) {
      console.error("Bank creation error:", err);
      setBankCreateError(err.message || "Failed to create bank.");
    } finally {
      setBankCreateSubmitting(false);
    }
  }

  // Open Edit Modal for Non-Financial Field Corrections
  function handleOpenEdit(t: Txn) {
    setEditingTxn(t);
    setEditSenderName(t.sender_name || "");
    setEditSenderMobile(t.sender_mobile || "");
    setEditCustomerId(t.customer_id || "");
    setEditReference(t.reference || "");
    setEditRemarks(t.remarks || "");
    setEditTxnWindowOpen(true);
  }

  // Save Transaction Non-Financial Correction
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
        description: `Corrected non-financial reference on DMT Txn #${editingTxn.transaction_number}`,
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

  // Open Reversal Modal
  function handleOpenReverse(t: Txn) {
    if (t.status === "reversed") {
      showToast("error", "This transaction has already been reversed.");
      return;
    }
    setReversingTxn(t);
    setReverseReason("");
    setReverseWindowOpen(true);
  }

  // Process Transaction Reversal with Atomic Database Guard & Balance Refresh
  async function handleProcessReverse(e: React.FormEvent) {
    e.preventDefault();
    if (!reversingTxn || reverseSubmitting) return;
    setReverseSubmitting(true);

    try {
      const res = await supabase.rpc("reverse_business_txn", {
        p_txn_id: reversingTxn.id,
        p_reason: reverseReason.trim() || "Operator manual reversal",
      });

      if (res.error) throw res.error;

      setTransactions((prev) =>
        prev.map((t) =>
          t.id === reversingTxn.id
            ? { ...t, status: "reversed", remarks: `${t.remarks || ""}\nReversed: ${reverseReason}`.trim() }
            : t
        )
      );

      await refreshBalances();
      setReverseWindowOpen(false);
      showToast("success", `Transaction #${reversingTxn.transaction_number} reversed. Cash legs and balances updated.`);
    } catch (err: any) {
      console.error("Reversal error:", err);
      showToast("error", err.message || "Failed to reverse transaction.");
    } finally {
      setReverseSubmitting(false);
    }
  }

  // Pre-submission Validation & Float Safety Guard (Beneficiary fields optional)
  const handleInitiateTransfer = useCallback(() => {
    if (!numAmount || numAmount <= 0) {
      showToast("error", "Please enter a valid transfer amount.");
      return;
    }
    if (numCharge < 0) {
      showToast("error", "Portal / Provider charge cannot be negative.");
      return;
    }

    // Format validation if non-empty
    if (transferMethod === "bank_account") {
      if (beneficiaryIfsc.trim() && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(beneficiaryIfsc.trim().toUpperCase())) {
        showToast("error", "Please enter a valid 11-character IFSC code (e.g. SBIN0001234).");
        return;
      }
    } else {
      if (upiId.trim() && !upiId.includes("@")) {
        showToast("error", "Please enter a valid beneficiary UPI ID (e.g. user@oksbi).");
        return;
      }
    }

    // Float Safety Check
    if (paidFrom === "portal" && numAmount > dmtFloat) {
      showToast("error", `Insufficient DMT Portal Float. (Available: ${inr(dmtFloat)}, Required: ${inr(numAmount)})`);
      return;
    }
    if (paidFrom === "bank" && numAmount > currentBankBalance) {
      showToast("error", `Insufficient Bank Balance. (Available: ${inr(currentBankBalance)}, Required: ${inr(numAmount)})`);
      return;
    }

    if (!reference.trim() || reference.trim().length < 6) {
      showToast("error", "Bank Reference / UTR Number is mandatory for DMT compliance.");
      return;
    }

    if (customerPayMethod === "due" && !selectedCustomerId) {
      showToast("error", "Please select a registered customer to record payment as Due (Khata).");
      return;
    }

    setConfirmWindowOpen(true);
  }, [numAmount, numCharge, transferMethod, beneficiaryIfsc, upiId, paidFrom, dmtFloat, currentBankBalance, reference, customerPayMethod, selectedCustomerId, showToast]);

  // Keyboard shortcut listener (Ctrl+Enter to submit, Esc to close)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === "Enter") {
        if (!confirmWindowOpen && !addCustomerWindowOpen && !addBeneficiaryWindowOpen && !editTxnWindowOpen && !reverseWindowOpen) {
          e.preventDefault();
          handleInitiateTransfer();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleInitiateTransfer, confirmWindowOpen, addCustomerWindowOpen, addBeneficiaryWindowOpen, editTxnWindowOpen, reverseWindowOpen]);

  // Execute Transfer Transaction (Double-submission guarded & Live Balance Refresh)
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
        p_sender_name: senderName.trim() || "Walk-in Sender",
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

      // If portal charge is present, update transaction record and adjust customer collection
      if (newTxnId && numCharge > 0) {
        try {
          await supabase.from("transactions").update({ portal_charge: numCharge }).eq("id", newTxnId);
        } catch (_) {
          // Graceful fallback if database column migration is pending
        }

        const fullCollection = numAmount + numFee + numCharge;
        try {
          if (customerPayMethod === "cash") {
            await supabase.from("cash_entries").update({ amount: fullCollection }).eq("ref_id", newTxnId).eq("direction", "in");
          } else if (customerPayMethod === "due" && selectedCustomerId) {
            const { data: cust } = await supabase.from("customers").select("balance").eq("id", selectedCustomerId).single();
            const adjustedBal = Number(cust?.balance || 0) + numCharge;
            await supabase.from("customers").update({ balance: adjustedBal }).eq("id", selectedCustomerId);
            await supabase.from("customer_ledger").update({ debit: fullCollection, balance_after: adjustedBal }).eq("ref_id", newTxnId);
          }
        } catch (_) {
          // Graceful adjustment fallback
        }
      }

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
        sender_name: senderName.trim() || "Walk-in Sender",
        sender_mobile: senderMobile.trim() || null,
        beneficiary_name: beneficiaryName.trim() || null,
        beneficiary_mobile: beneficiaryMobile.trim() || null,
        beneficiary_bank: beneficiaryBank.trim() || null,
        beneficiary_ifsc: beneficiaryIfsc.trim().toUpperCase() || null,
        beneficiary_account: beneficiaryAccount.trim() || null,
        upi_id: transferMethod === "upi" ? upiId.trim() : null,
        amount: numAmount,
        service_fee: numFee,
        portal_charge: numCharge,
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
      setLastCompletedTxn(completedRecord);
      setConfirmWindowOpen(false);
      setSuccessWindowOpen(true);

      // Re-fetch Live Balances Immediately
      await refreshBalances();

      // Reset transaction-specific inputs
      setReference("");
      setRemarks("");

      showToast("success", `₹${numAmount.toLocaleString("en-IN")} DMT transfer completed to ${beneficiaryName || "beneficiary"}.`);
    } catch (err: any) {
      console.error("DMT error:", err);
      showToast("error", err.message || "Transfer could not be completed. Please verify UTR and details.");
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
    <div className="space-y-5 pb-16">
      {/* Toast Notification Container */}
      {toastView}

      {/* ===============================================================================
          1. EXECUTIVE HERO HEADER: Money Transfer (Domestic Remittance Command Center)
      =============================================================================== */}
      <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-5 text-white shadow-xl ring-1 ring-white/10 sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-0.5 text-xs font-bold text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                ● DMT SYSTEM ONLINE
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-slate-300">
                IMPS / NEFT / UPI Payout Gateway
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              Money Transfer
            </h1>
            <p className="text-xs text-indigo-200/80 sm:text-sm">
              Domestic Remittance Command Center with distinct service fees, provider charges, and transparent business income.
            </p>
          </div>

          {/* Live Float Display Badges with Refresh Button */}
          <div className="flex flex-wrap items-center gap-2.5 sm:flex-nowrap">
            <button
              type="button"
              onClick={refreshBalances}
              disabled={isRefreshingBalances}
              className="rounded-2xl border border-white/10 bg-white/5 p-3 text-slate-300 backdrop-blur-md hover:bg-white/10 hover:text-white transition disabled:opacity-50"
              title="Refresh Live Balances from Database"
            >
              <span className={`inline-block text-base ${isRefreshingBalances ? "animate-spin" : ""}`}>↻</span>
            </button>
            <div className="flex flex-col items-end rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-md">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">DMT Portal Wallet</span>
              <div className="text-xl font-black text-emerald-400">{inr(dmtFloat)}</div>
              <span className="text-[9px] text-slate-400">Available Balance</span>
            </div>
            <div className="flex flex-col items-end rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-md">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">
                {selectedBankInstrument?.name || "Shop Bank"}
              </span>
              <div className="text-xl font-black text-blue-400">{inr(currentBankBalance)}</div>
              <span className="text-[9px] text-slate-400">Available Balance</span>
            </div>
          </div>
        </div>
      </div>

      {/* ===============================================================================
          2. SPATIAL FINANCIAL POSITION (7 Compact Bento Tiles)
      =============================================================================== */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {/* 1. Transfers */}
        <div className="bento-surface-interactive flex flex-col justify-between p-3.5 dark:bg-slate-900/90">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Transfers</span>
          <div className="my-1">
            <div className="text-2xl font-black text-slate-900 dark:text-white">{todayCount}</div>
            <p className="text-[10px] text-slate-500">Successful today</p>
          </div>
          <span className="text-[10px] text-slate-400 font-medium">100% Settled</span>
        </div>

        {/* 2. Transfer Volume */}
        <div className="bento-surface-interactive flex flex-col justify-between p-3.5 dark:bg-slate-900/90">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Transfer Volume</span>
          <div className="my-1">
            <div className="text-lg font-black text-slate-900 dark:text-white truncate">{inr(todayVolume)}</div>
            <p className="text-[10px] text-slate-500">Principal Turnover</p>
          </div>
          <span className="text-[10px] text-slate-400 font-medium">Fiduciary Money</span>
        </div>

        {/* 3. Customer Collections */}
        <div className="bento-surface-interactive flex flex-col justify-between p-3.5 dark:bg-slate-900/90">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Collections</span>
          <div className="my-1">
            <div className="text-lg font-black text-slate-900 dark:text-white truncate">{inr(todayCustomerCollections)}</div>
            <p className="text-[10px] text-slate-500">Gross Money In</p>
          </div>
          <span className="text-[10px] text-slate-400 font-medium">Principal + Charges</span>
        </div>

        {/* 4. Service Fees */}
        <div className="bento-surface-interactive flex flex-col justify-between p-3.5 dark:bg-slate-900/90">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Service Fees</span>
          <div className="my-1">
            <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 truncate">+{inr(todayCustomerFees)}</div>
            <p className="text-[10px] text-slate-500">Customer Surcharge</p>
          </div>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">Business Income</span>
        </div>

        {/* 5. Provider Charges */}
        <div className="bento-surface-interactive flex flex-col justify-between p-3.5 dark:bg-slate-900/90">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Provider Charges</span>
          <div className="my-1">
            <div className="text-lg font-black text-rose-600 dark:text-rose-400 truncate">-{inr(todayPortalCharges)}</div>
            <p className="text-[10px] text-slate-500">Platform Cost</p>
          </div>
          <span className="text-[10px] text-rose-500 font-medium">Pass-Through Cost</span>
        </div>

        {/* 6. Net Contribution */}
        <div className="bento-surface-interactive flex flex-col justify-between p-3.5 dark:bg-slate-900/90">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Net Contribution</span>
          <div className="my-1">
            <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 truncate">+{inr(todayNetContribution)}</div>
            <p className="text-[10px] text-slate-500">Revenue - Costs</p>
          </div>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">Net Margin</span>
        </div>

        {/* 7. Available Float */}
        <div className="bento-surface-interactive flex flex-col justify-between p-3.5 dark:bg-slate-900/90">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Available Float</span>
          <div className="my-1">
            <div className="text-lg font-black text-indigo-900 dark:text-indigo-300 truncate">{inr(dmtFloat)}</div>
            <p className="text-[10px] text-slate-500">DMT Portal Wallet</p>
          </div>
          <Link href="/finance/settlements" className="text-[10px] text-blue-600 font-bold hover:underline dark:text-blue-400">Top-up Float →</Link>
        </div>
      </div>

      {/* ===============================================================================
          3. MAIN TRANSACTION COMMAND CENTER (8-Step Guided Workflow)
      =============================================================================== */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* Left (8 Cols): Guided Steps 1 to 8 */}
        <div className="bento-surface p-5 lg:col-span-8 dark:bg-slate-900/90 space-y-5">
          {/* Top Bar: Transfer Method Switcher & Scan & Fill CTA */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3 dark:border-white/5">
            <div className="flex items-center gap-1.5 rounded-2xl bg-slate-100 p-1 dark:bg-white/5">
              {[
                { id: "bank_account", label: "🏦 BANK TRANSFER", sub: "IMPS / NEFT" },
                { id: "upi", label: "⚡ UPI TRANSFER", sub: "Instant VPA" },
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
                  <span>{m.label}</span>
                  <span className="ml-1.5 text-[10px] opacity-75">({m.sub})</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setScanModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-3.5 py-1.5 text-xs font-black text-white shadow-md shadow-violet-500/25 transition hover:brightness-110 active:scale-95"
            >
              <span>📷 Scan &amp; Fill Receipt / SMS</span>
            </button>
          </div>

          {/* Scanned Information Review Alert */}
          {scannedReviewData && (
            <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-3 text-xs dark:border-violet-900/40 dark:bg-violet-950/20">
              <div className="flex items-center justify-between">
                <span className="font-bold text-violet-900 dark:text-violet-300">✓ Information Detected from Scan</span>
                <button type="button" onClick={() => setScannedReviewData(null)} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                {scannedReviewData.senderName && <div><span className="text-slate-500">Sender:</span> <strong>{scannedReviewData.senderName}</strong></div>}
                {scannedReviewData.beneficiaryName && <div><span className="text-slate-500">Beneficiary:</span> <strong>{scannedReviewData.beneficiaryName}</strong></div>}
                {scannedReviewData.amount && <div><span className="text-slate-500">Amount:</span> <strong>₹{scannedReviewData.amount}</strong></div>}
                {scannedReviewData.reference && <div><span className="text-slate-500">UTR:</span> <strong>{scannedReviewData.reference}</strong></div>}
              </div>
            </div>
          )}

          {/* STEP 1: SENDER / CUSTOMER (CRM LINK WITH PRIVACY SEARCH >= 2 CHARACTERS) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 dark:border-white/5">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Step 1 · Sender Information</span>
              <button
                type="button"
                onClick={() => setAddCustomerWindowOpen(true)}
                className="text-[11px] font-bold text-blue-600 hover:underline dark:text-blue-400"
              >
                + Add Customer to CRM
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Select Registered Customer (Optional)
                </label>
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
                  >
                    + Add
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Sender Name (Optional)
                </label>
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="Full name of remitter (defaults to Walk-in)"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-semibold outline-none focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:bg-slate-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Sender Mobile Number (Optional)
                </label>
                <input
                  type="tel"
                  maxLength={10}
                  value={senderMobile}
                  onChange={(e) => setSenderMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-digit mobile number"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-semibold outline-none focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:bg-slate-900"
                />
              </div>
            </div>
          </div>

          {/* STEP 2 & 3: BENEFICIARY / DESTINATION (ALL BENEFICIARY IDENTIFIERS OPTIONAL) */}
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 dark:border-white/5">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Step 2 &amp; 3 · Beneficiary &amp; Bank Destination</span>
              <button
                type="button"
                onClick={() => setAddBeneficiaryWindowOpen(true)}
                className="text-[11px] font-bold text-violet-600 hover:underline dark:text-violet-400"
              >
                + Add Beneficiary
              </button>
            </div>

            {/* Quick Beneficiary Chips */}
            {beneficiarySuggestions.length > 0 && (
              <div className="space-y-1">
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
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Beneficiary Account Number (Optional)
                  </label>
                  <input
                    type="text"
                    value={beneficiaryAccount}
                    onChange={(e) => setBeneficiaryAccount(e.target.value.replace(/\D/g, ""))}
                    placeholder="e.g. 100023456789 (Optional)"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-black tracking-widest outline-none focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:bg-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    IFSC Code (Optional)
                  </label>
                  <input
                    type="text"
                    maxLength={11}
                    value={beneficiaryIfsc}
                    onChange={(e) => setBeneficiaryIfsc(e.target.value.toUpperCase())}
                    placeholder="e.g. SBIN0001234 (Optional)"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-black tracking-wider outline-none focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:bg-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Beneficiary Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={beneficiaryName}
                    onChange={(e) => setBeneficiaryName(e.target.value)}
                    placeholder="Recipient name (Optional)"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-semibold outline-none focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:bg-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Beneficiary Bank Name (Optional)
                    </label>
                    {matchedBeneficiaryBank && (
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 truncate max-w-[140px]">
                        ✓ Authoritative Match
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={beneficiaryBank}
                    onChange={(e) => setBeneficiaryBank(e.target.value)}
                    placeholder="e.g. State Bank of India (Optional)"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-semibold outline-none focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:bg-slate-900"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Beneficiary UPI ID (VPA) (Optional)
                  </label>
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value.toLowerCase())}
                    placeholder="e.g. rahul@oksbi / 9876543210@paytm (Optional)"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-black tracking-wide outline-none focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:bg-slate-900"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Receiver Display Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={receiverName}
                    onChange={(e) => setReceiverName(e.target.value)}
                    placeholder="Recipient verified display name (Optional)"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-semibold outline-none focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:bg-slate-900"
                  />
                </div>
              </div>
            )}
          </div>

          {/* STEP 4 & 5: TRANSFER AMOUNT, SERVICE FEE, PORTAL CHARGE & COMMISSION */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 dark:border-white/5">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Step 4 &amp; 5 · Transfer Amount &amp; Charges Breakdown</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Transfer Principal Amount (₹) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-slate-400">₹</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="5000"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-4 text-2xl font-black text-slate-900 outline-none focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:bg-slate-900"
                />
              </div>

              {/* Quick Amount Chips */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* 1. Customer Service Fee */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Customer Service Fee (₹)
                  </label>
                  <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">Our Income</span>
                </div>
                <input
                  type="number"
                  value={serviceFee}
                  onChange={(e) => setServiceFee(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-bold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
                  placeholder="Fee charged to customer"
                />
              </div>

              {/* 2. Portal / Provider Charge */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Portal / Provider Charge (₹)
                  </label>
                  <span className="text-[9px] font-bold text-rose-500">Provider Cost</span>
                </div>
                <input
                  type="number"
                  value={portalCharge}
                  onChange={(e) => setPortalCharge(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-bold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
                  placeholder="Provider fee charged to us"
                />
              </div>

              {/* 3. Portal Commission */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Portal Commission (₹)
                  </label>
                  <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">Our Margin</span>
                </div>
                <input
                  type="number"
                  value={portalCommission}
                  onChange={(e) => setPortalCommission(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-bold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
                  placeholder="Commission from provider"
                />
              </div>
            </div>
          </div>

          {/* STEP 6 & 7: FUNDING SOURCE & COLLECTION METHOD */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 dark:border-white/5">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Step 6 &amp; 7 · Funding Source &amp; Customer Collection</span>
              <button
                type="button"
                onClick={refreshBalances}
                disabled={isRefreshingBalances}
                className="text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition"
              >
                ↻ Refresh Live Float
              </button>
            </div>

            {/* Funding Source (Disbursement) */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Transfer Funding Source (Disbursement) <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setPaidFrom("portal")}
                  className={`rounded-2xl border p-2.5 text-left transition ${
                    paidFrom === "portal"
                      ? "border-violet-600 bg-violet-50/80 shadow-xs dark:border-violet-500 dark:bg-violet-950/30"
                      : "border-slate-200 bg-slate-50/50 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-900 dark:text-white">👛 DMT Portal Wallet</span>
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">{inr(dmtFloat)}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Disburses {inr(numAmount)} principal from live DMT gateway wallet pool.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setPaidFrom("bank")}
                  className={`rounded-2xl border p-2.5 text-left transition ${
                    paidFrom === "bank"
                      ? "border-violet-600 bg-violet-50/80 shadow-xs dark:border-violet-500 dark:bg-violet-950/30"
                      : "border-slate-200 bg-slate-50/50 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-900 dark:text-white">
                      🏦 {selectedBankInstrument?.name || "Shop Bank Account"}
                    </span>
                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">{inr(currentBankBalance)}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Disburses {inr(numAmount)} principal from shop bank account via Net Banking.
                  </p>
                </button>
              </div>
            </div>

            {/* Select Bank Instrument if multiple shop bank accounts */}
            {paidFrom === "bank" && liveInstruments.length > 1 && (
              <div className="space-y-1 pt-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Select Shop Bank Account
                </label>
                <select
                  value={selectedBankInstrumentId}
                  onChange={(e) => setSelectedBankInstrumentId(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-bold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
                >
                  {liveInstruments.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name} ({inr(Number(inst.current_balance ?? bankPoolFloat ?? 0))})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Float Insufficiency Alert Guard */}
            {isFloatInsufficient && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-3 text-xs text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
                <div className="flex items-center gap-1.5 font-black">
                  <span>⚠ INSUFFICIENT {paidFrom === "portal" ? "DMT PORTAL FLOAT" : "BANK BALANCE"}</span>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-2 text-[11px]">
                  <div><span className="text-slate-500">Required:</span> <strong>{inr(numAmount)}</strong></div>
                  <div><span className="text-slate-500">Available:</span> <strong>{inr(availableSelectedFloat)}</strong></div>
                  <div><span className="text-rose-600">Shortfall:</span> <strong className="text-rose-600">{inr(floatShortfall)}</strong></div>
                </div>
                <p className="mt-1 text-[10px] text-slate-500">Transaction submission is blocked to protect against negative settlement float.</p>
              </div>
            )}

            {/* Customer Collection Instrument */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Customer Paid You Via (Collection Method) <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { id: "cash", label: "💵 Cash Drawer", desc: "Cash Inflow" },
                  { id: "upi", label: "📱 UPI QR", desc: "Merchant QR" },
                  { id: "bank", label: "🏦 Bank Deposit", desc: "Direct Bank" },
                  { id: "due", label: "📋 Customer Khata", desc: "Post to Due" },
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

            {/* STEP 8: BANK REFERENCE / UTR */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Bank Reference / UTR Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="12-digit UTR / RRN / IMPS Auth Reference"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-black tracking-wider outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
              />
            </div>
          </div>
        </div>

        {/* Right (4 Cols): DMT Money Flow Visualizer & Live Order Review */}
        <div className="bento-surface p-5 lg:col-span-4 dark:bg-slate-900/90 space-y-4">
          <div className="border-b border-slate-100 pb-2.5 dark:border-white/5">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Step 9 · Review &amp; Settlement</span>
            <h3 className="text-base font-black text-slate-900 dark:text-white">DMT Money Flow Visualizer</h3>
          </div>

          {/* VISUAL MONEY FLOW MAP */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs dark:border-white/10 dark:bg-white/5 space-y-3">
            {/* Leg 1: Customer Collection */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">1. Customer Total Collection</span>
                <div className="font-black text-slate-900 dark:text-white text-base">{inr(totalCollected)}</div>
              </div>
              <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                via {customerPayMethod.toUpperCase()}
              </span>
            </div>

            {/* Leg 2: Principal, Fee & Provider Charge Breakdown */}
            <div className="space-y-1 rounded-xl bg-white p-2.5 text-[11px] shadow-xs dark:bg-slate-900">
              <div className="flex justify-between">
                <span className="text-slate-500">Transfer Principal:</span>
                <span className="font-bold">{inr(numAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Customer Service Fee:</span>
                <span className="font-bold text-emerald-600">+{inr(numFee)}</span>
              </div>
              {numCharge > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Portal / Provider Charge:</span>
                  <span className="font-bold text-rose-500">+{inr(numCharge)}</span>
                </div>
              )}
            </div>

            {/* Leg 3: Beneficiary Disbursed */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-white/10">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">2. Beneficiary Receives</span>
                <div className="font-black text-indigo-900 dark:text-indigo-300 text-sm">{inr(numAmount)}</div>
              </div>
              <span className="rounded-md bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-white/10 dark:text-slate-300">
                from {paidFrom === "portal" ? "PORTAL" : "BANK"}
              </span>
            </div>

            {/* Leg 4: Operator Margin Breakdown */}
            <div className="space-y-1 rounded-xl bg-emerald-50/50 p-2.5 text-[11px] dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Business Revenue (Fee + Comm):</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">+{inr(businessRevenue)}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Provider Cost (Charge):</span>
                <span className="font-bold text-rose-600 dark:text-rose-400">-{inr(providerCost)}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-emerald-200 dark:border-emerald-800/40 text-xs">
                <span className="font-bold text-slate-900 dark:text-white">Net DMT Contribution:</span>
                <span className="font-black text-emerald-600 dark:text-emerald-400">+{inr(netContribution)}</span>
              </div>
            </div>
          </div>

          {/* Detailed Summary Metrics */}
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Customer:</span>
              <strong className="text-slate-900 dark:text-white truncate max-w-[160px]">
                {senderName || "Walk-in Customer"}
              </strong>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-500">Beneficiary:</span>
              <strong className="text-slate-900 dark:text-white truncate max-w-[160px]">
                {transferMethod === "upi" ? (upiId || "Pending / Optional") : (beneficiaryName || beneficiaryAccount ? maskAccount(beneficiaryAccount) : "Pending / Optional")}
              </strong>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-500">Transfer Method:</span>
              <strong className="text-slate-900 dark:text-white">
                {transferMethod === "bank_account" ? "Bank IMPS/NEFT" : "UPI Remittance"}
              </strong>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-500">Funding Balance:</span>
              <strong className="text-emerald-600 dark:text-emerald-400">
                {inr(availableSelectedFloat)} ({paidFrom === "portal" ? "DMT Portal" : "Shop Bank"})
              </strong>
            </div>

            {/* Receipt Print Preference */}
            <div className="border-t border-slate-100 pt-2 dark:border-white/5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500 font-bold">Receipt Format:</span>
                <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-white/5">
                  <button
                    type="button"
                    onClick={() => setReceiptMode("basic")}
                    className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition ${
                      receiptMode === "basic" ? "bg-white text-slate-900 shadow-xs dark:bg-violet-600 dark:text-white" : "text-slate-500"
                    }`}
                  >
                    Basic (Amount Only)
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

          {/* Primary Action Button */}
          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={handleInitiateTransfer}
              disabled={isFloatInsufficient}
              className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3 text-sm font-black text-white shadow-lg shadow-violet-500/25 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ✓ Confirm &amp; Transfer {inr(numAmount)}
            </button>
            <div className="text-center text-[10px] text-slate-400 space-y-0.5">
              <p>Customer Collection: <strong>{inr(totalCollected)}</strong> · Beneficiary: <strong>{inr(numAmount)}</strong> · Net Margin: <strong className="text-emerald-600">+{inr(netContribution)}</strong></p>
              <p>Shortcut: <strong>Ctrl + Enter</strong> to initiate transfer</p>
            </div>
          </div>
        </div>
      </div>

      {/* ===============================================================================
          4. FINANCIAL AUDIT & RECONCILIATION PANEL
      =============================================================================== */}
      <div className="bento-surface p-4 dark:bg-slate-900/90 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-2 dark:border-white/5">
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">DMT Financial Reconciliation</h4>
            <p className="text-[11px] text-slate-400">All remittance transfers are isolated from retail trading revenue and balanced against cash/digital pools.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-bold pt-1 sm:pt-0">
            <Link href="/finance/cashbook" className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-700 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300">View Cashbook →</Link>
            <Link href="/customers" className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-700 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300">Customer Ledger →</Link>
            <Link href="/finance/settlements" className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-700 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300">Settlements →</Link>
            <Link href="/finance/pnl" className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-700 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300">P&amp;L →</Link>
            <Link href="/reports" className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-700 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300">Reports →</Link>
            <Link href="/audit" className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-700 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300">Audit Trail →</Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-6">
          <div className="rounded-xl bg-slate-50 p-2 dark:bg-white/5"><span className="text-slate-400">Transfer Principal:</span> <div className="font-black text-slate-900 dark:text-white">{inr(numAmount)}</div></div>
          <div className="rounded-xl bg-slate-50 p-2 dark:bg-white/5"><span className="text-slate-400">Customer Collection:</span> <div className="font-black text-slate-900 dark:text-white">{inr(totalCollected)}</div></div>
          <div className="rounded-xl bg-slate-50 p-2 dark:bg-white/5"><span className="text-slate-400">Service Fee (Income):</span> <div className="font-black text-emerald-600">+{inr(numFee)}</div></div>
          <div className="rounded-xl bg-slate-50 p-2 dark:bg-white/5"><span className="text-slate-400">Portal Charge (Cost):</span> <div className="font-black text-rose-500">-{inr(numCharge)}</div></div>
          <div className="rounded-xl bg-slate-50 p-2 dark:bg-white/5"><span className="text-slate-400">Portal Commission:</span> <div className="font-black text-emerald-600">+{inr(numComm)}</div></div>
          <div className="rounded-xl bg-slate-50 p-2 dark:bg-white/5"><span className="text-slate-400">Net Contribution:</span> <div className="font-black text-emerald-600">+{inr(netContribution)}</div></div>
        </div>
      </div>

      {/* ===============================================================================
          5. DMT ANALYTICS & TRANSACTION ACTIVITY WORKSPACE
      =============================================================================== */}
      <div className="bento-surface p-5 dark:bg-slate-900/90 space-y-4">
        {/* Navigation Switcher between Activity Ledger & Analytics Dimensions */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3 dark:border-white/5">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "overview", label: "Transaction Activity" },
              { id: "bank", label: "By Bank" },
              { id: "portal", label: "By Portal" },
              { id: "method", label: "By Transfer Method" },
              { id: "collection", label: "By Collection Method" },
              { id: "funding", label: "By Funding Source" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setAnalyticsTab(tab.id as any)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  analyticsTab === tab.id
                    ? "bg-slate-900 text-white shadow-xs dark:bg-violet-600"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-400"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by UTR, customer, beneficiary, or account…"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
          />
        </div>

        {/* Dynamic Content Based on Analytics Tab */}
        {analyticsTab === "overview" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 dark:border-white/10">
                  <th className="pb-2 font-bold">Txn / Time</th>
                  <th className="pb-2 font-bold">Customer</th>
                  <th className="pb-2 font-bold">Beneficiary &amp; Destination</th>
                  <th className="pb-2 font-bold text-right">Transfer</th>
                  <th className="pb-2 font-bold text-center">Collection</th>
                  <th className="pb-2 font-bold text-center">Funding</th>
                  <th className="pb-2 font-bold text-right">Fee</th>
                  <th className="pb-2 font-bold text-right">Charge</th>
                  <th className="pb-2 font-bold text-right">Net</th>
                  <th className="pb-2 font-bold text-center">Status</th>
                  <th className="pb-2 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-medium text-slate-700 dark:text-slate-300">
                {filteredTxns.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-7 text-center text-slate-400">
                      No DMT transactions found. Process a money transfer above to see records.
                    </td>
                  </tr>
                ) : (
                  filteredTxns.slice(0, 15).map((t) => {
                    const receiptUrl = `/business/receipt/${t.id}${receiptMode === "detailed" ? "?mode=detailed" : ""}`;
                    const txnFee = Number(t.service_fee || 0);
                    const txnCharge = Number(t.portal_charge || 0);
                    const txnComm = Number(t.portal_commission || 0);
                    const txnCollection = Number(t.amount || 0) + txnFee + txnCharge;
                    const txnNet = (txnFee + txnComm) - txnCharge;

                    return (
                      <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                        <td className="py-2.5">
                          <div className="font-bold text-slate-900 dark:text-white">{t.transaction_number}</div>
                          <div className="text-[10px] text-slate-400">
                            {t.transaction_timestamp ? new Date(t.transaction_timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : t.transaction_date}
                          </div>
                        </td>
                        <td className="py-2.5">
                          <div className="font-bold text-slate-900 dark:text-white">{t.sender_name || t.customers?.name || "Walk-in"}</div>
                          <div className="text-[10px] text-slate-400">
                            {t.sender_mobile ? `📱 ${maskMobile(t.sender_mobile)}` : ""}
                          </div>
                        </td>
                        <td className="py-2.5">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {t.beneficiary_name || t.receiver_name || "Beneficiary"}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {t.transfer_method === "upi" ? (
                              <span>{t.upi_id || "UPI VPA"}</span>
                            ) : (
                              <span>{t.beneficiary_bank || "Bank"} {t.beneficiary_account ? `• ${maskAccount(t.beneficiary_account)}` : ""}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 text-right font-black text-slate-900 dark:text-white">
                          {inr(t.amount)}
                        </td>
                        <td className="py-2.5 text-center">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-white/10 dark:text-slate-300">
                            {(t.customer_pay_method || "CASH").toUpperCase()} {inr(txnCollection)}
                          </span>
                        </td>
                        <td className="py-2.5 text-center">
                          <span className="rounded-md bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                            {(t.paid_from || "PORTAL").toUpperCase()}
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-bold text-emerald-700 dark:text-emerald-400">
                          +{inr(txnFee)}
                        </td>
                        <td className="py-2.5 text-right font-medium text-rose-600 dark:text-rose-400">
                          -{inr(txnCharge)}
                        </td>
                        <td className="py-2.5 text-right text-emerald-600 dark:text-emerald-400 font-black">
                          +{inr(txnNet)}
                        </td>
                        <td className="py-2.5 text-center">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            t.status === "reversed"
                              ? "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                              : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                          }`}>
                            {t.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
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
                              title="View Transaction Audit Breakdown"
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
                            {t.status === "success" && (
                              <button
                                type="button"
                                onClick={() => handleOpenReverse(t)}
                                className="rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400"
                                title="Reverse Transaction"
                              >
                                ↩️
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* Analytics Breakdown Views */
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(() => {
              const groupingKey =
                analyticsTab === "bank"
                  ? "beneficiary_bank"
                  : analyticsTab === "portal"
                  ? "portal_id"
                  : analyticsTab === "method"
                  ? "transfer_method"
                  : analyticsTab === "collection"
                  ? "customer_pay_method"
                  : "paid_from";

              const map = new Map<string, { count: number; volume: number; revenue: number; cost: number; net: number }>();
              for (const t of transactions) {
                if (t.service_type !== "dmt" || t.status !== "success") continue;
                let rawVal = (t as any)[groupingKey] || "Other / Unassigned";
                if (analyticsTab === "portal") {
                  rawVal = portals.find((p) => p.id === rawVal)?.name || "Default Portal";
                }
                const cur = map.get(rawVal) || { count: 0, volume: 0, revenue: 0, cost: 0, net: 0 };
                cur.count++;
                cur.volume += Number(t.amount || 0);
                const r = Number(t.service_fee || 0) + Number(t.portal_commission || 0);
                const c = Number(t.portal_charge || 0);
                cur.revenue += r;
                cur.cost += c;
                cur.net += (r - c);
                map.set(rawVal, cur);
              }

              const rows = Array.from(map.entries()).sort((a, b) => b[1].volume - a[1].volume);

              if (rows.length === 0) {
                return (
                  <div className="col-span-full py-8 text-center text-xs text-slate-400">
                    No transactions recorded for this breakdown dimension yet.
                  </div>
                );
              }

              return rows.map(([label, metrics], idx) => (
                <div key={idx} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-white/10 dark:bg-white/5 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-900 dark:text-white capitalize text-xs">{label}</span>
                    <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-white/10 dark:text-slate-300">
                      {metrics.count} txns
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Volume:</span>
                    <strong className="text-slate-900 dark:text-white">{inr(metrics.volume)}</strong>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Revenue:</span>
                    <strong className="text-emerald-600 dark:text-emerald-400">+{inr(metrics.revenue)}</strong>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Provider Cost:</span>
                    <strong className="text-rose-600 dark:text-rose-400">-{inr(metrics.cost)}</strong>
                  </div>
                  <div className="flex justify-between text-xs pt-1 border-t border-slate-200 dark:border-white/10">
                    <span className="font-bold text-slate-700 dark:text-slate-300">Net Margin:</span>
                    <strong className="text-emerald-600 dark:text-emerald-400 font-bold">+{inr(metrics.net)}</strong>
                  </div>
                </div>
              ));
            })()}
          </div>
        )}
      </div>

      {/* ===============================================================================
          6. CONFIRMATION REVIEW MODAL
      =============================================================================== */}
      {confirmWindowOpen && (
        <FloatingWindow
          isOpen={confirmWindowOpen}
          size="sm"
          title="CONFIRM DMT TRANSFER"
          onClose={() => setConfirmWindowOpen(false)}
        >
          <div className="p-5 space-y-4">
            <div className="rounded-2xl bg-slate-50 p-4 text-xs space-y-2 dark:bg-white/5">
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <strong className="text-slate-900 dark:text-white">{senderName || "Walk-in Customer"}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Beneficiary:</span>
                <strong className="text-slate-900 dark:text-white">
                  {transferMethod === "upi" ? (upiId || "UPI VPA (Optional)") : `${beneficiaryName || "Beneficiary"} ${beneficiaryAccount ? `(${maskAccount(beneficiaryAccount)})` : ""}`}
                </strong>
              </div>
              {transferMethod === "bank_account" && beneficiaryIfsc && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Bank &amp; IFSC:</span>
                  <strong className="text-slate-900 dark:text-white">{beneficiaryIfsc} · {beneficiaryBank || "Bank"}</strong>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-2 dark:border-white/10">
                <span className="text-slate-500">Transfer Principal:</span>
                <strong className="text-base text-slate-900 dark:text-white">{inr(numAmount)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Customer Service Fee:</span>
                <strong className="text-emerald-600 dark:text-emerald-400 font-bold">+{inr(numFee)}</strong>
              </div>
              {numCharge > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Portal / Provider Charge:</span>
                  <strong className="text-rose-500 font-bold">+{inr(numCharge)}</strong>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-1 dark:border-white/10">
                <span className="text-slate-500">Customer Pays:</span>
                <strong className="text-slate-900 dark:text-white font-black">{inr(totalCollected)} via {customerPayMethod.toUpperCase()}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Funding:</span>
                <strong className="text-slate-900 dark:text-white">
                  {paidFrom === "portal" ? "DMT PORTAL" : (selectedBankInstrument?.name || "SHOP BANK")}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">UTR / Reference:</span>
                <strong className="text-slate-900 dark:text-white">{reference}</strong>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5 dark:border-white/10">
                <span className="text-slate-500 font-bold">Net Business Contribution:</span>
                <strong className="text-emerald-600 dark:text-emerald-400 font-bold">+{inr(netContribution)} (Rev {inr(businessRevenue)} - Cost {inr(providerCost)})</strong>
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              Please verify recipient account details before confirming. Remittances cannot be recalled after submission.
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
                {isSubmitting ? "Processing…" : `Confirm & Send ${inr(numAmount)}`}
              </button>
            </div>
          </div>
        </FloatingWindow>
      )}

      {/* ===============================================================================
          7. TRANSACTION SUCCESS MODAL
      =============================================================================== */}
      {successWindowOpen && lastCompletedTxn && (
        <FloatingWindow
          isOpen={successWindowOpen}
          size="sm"
          title="✓ TRANSFER SUCCESSFUL"
          onClose={() => setSuccessWindowOpen(false)}
        >
          <div className="p-5 space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl dark:bg-emerald-950/40">
              ✓
            </div>
            <div>
              <h4 className="text-lg font-black text-slate-900 dark:text-white">
                {inr(lastCompletedTxn.amount)}
              </h4>
              <p className="text-xs text-slate-500">
                Txn #{lastCompletedTxn.transaction_number} · UTR: {lastCompletedTxn.reference}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-3 text-xs text-left space-y-1 dark:bg-white/5">
              <div className="flex justify-between"><span className="text-slate-400">Transfer:</span> <strong>{inr(lastCompletedTxn.amount)}</strong></div>
              <div className="flex justify-between"><span className="text-slate-400">Beneficiary Received:</span> <strong>{inr(lastCompletedTxn.amount)}</strong></div>
              <div className="flex justify-between"><span className="text-slate-400">Customer Paid:</span> <strong>{inr(Number(lastCompletedTxn.amount || 0) + Number(lastCompletedTxn.service_fee || 0) + Number(lastCompletedTxn.portal_charge || 0))} via {(lastCompletedTxn.customer_pay_method || "CASH").toUpperCase()}</strong></div>
              <div className="flex justify-between"><span className="text-slate-400">Net Business Margin:</span> <strong className="text-emerald-600">+{inr((Number(lastCompletedTxn.service_fee || 0) + Number(lastCompletedTxn.portal_commission || 0)) - Number(lastCompletedTxn.portal_charge || 0))}</strong></div>
            </div>

            <div className="flex justify-center gap-2 pt-2">
              <Link
                href={`/business/receipt/${lastCompletedTxn.id}${receiptMode === "detailed" ? "?mode=detailed" : ""}`}
                target="_blank"
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 dark:bg-violet-600"
              >
                🖨️ Print 80mm
              </Link>
              <Link
                href={`/business/receipt/${lastCompletedTxn.id}/a4${receiptMode === "detailed" ? "?mode=detailed" : ""}`}
                target="_blank"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
              >
                📄 Print A4
              </Link>
              <button
                type="button"
                onClick={() => {
                  setSuccessWindowOpen(false);
                  setSelectedDetailTxn(lastCompletedTxn);
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
              >
                👁 View Transaction
              </button>
              <button
                type="button"
                onClick={() => setSuccessWindowOpen(false)}
                className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300"
              >
                + New Transfer
              </button>
            </div>
          </div>
        </FloatingWindow>
      )}

      {/* ===============================================================================
          8. ADD CUSTOMER MODAL
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
          9. ADD BENEFICIARY MODAL (All Fields Optional & Confirm Account Check)
      =============================================================================== */}
      {addBeneficiaryWindowOpen && (
        <FloatingWindow
          isOpen={addBeneficiaryWindowOpen}
          size="sm"
          title="Add Beneficiary to Address Book"
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
                    Beneficiary Account Number (Optional)
                  </label>
                  <input
                    type="text"
                    value={newBenAccount}
                    onChange={(e) => setNewBenAccount(e.target.value.replace(/\D/g, ""))}
                    placeholder="e.g. 100023456789 (Optional)"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black tracking-widest outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Confirm Account Number (Optional)
                  </label>
                  <input
                    type="text"
                    value={newBenConfirmAccount}
                    onChange={(e) => setNewBenConfirmAccount(e.target.value.replace(/\D/g, ""))}
                    placeholder="Re-enter bank account number"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black tracking-widest outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    IFSC Code (Optional)
                  </label>
                  <input
                    type="text"
                    maxLength={11}
                    value={newBenIfsc}
                    onChange={(e) => setNewBenIfsc(e.target.value.toUpperCase())}
                    placeholder="e.g. SBIN0001234 (Optional)"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black tracking-wider outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Beneficiary Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={newBenName}
                    onChange={(e) => setNewBenName(e.target.value)}
                    placeholder="Recipient name (Optional)"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Bank Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={newBenBank}
                    onChange={(e) => setNewBenBank(e.target.value)}
                    placeholder="e.g. State Bank of India (Optional)"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Beneficiary UPI ID (VPA) (Optional)
                  </label>
                  <input
                    type="text"
                    value={newBenUpi}
                    onChange={(e) => setNewBenUpi(e.target.value.toLowerCase())}
                    placeholder="user@upi (Optional)"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Receiver Display Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={newBenName}
                    onChange={(e) => setNewBenName(e.target.value)}
                    placeholder="Recipient verified name (Optional)"
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
          10. EDIT TRANSACTION MODAL (Non-Financial Corrections)
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
          11. REVERSE TRANSACTION MODAL
      =============================================================================== */}
      {reverseWindowOpen && reversingTxn && (
        <FloatingWindow
          isOpen={reverseWindowOpen}
          size="sm"
          title={`Reverse DMT Transaction #${reversingTxn.transaction_number}`}
          onClose={() => setReverseWindowOpen(false)}
        >
          <form onSubmit={handleProcessReverse} className="p-5 space-y-4 text-xs">
            <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
              <strong>Transaction Reversal Warning:</strong> This will reverse the customer collection of {inr(Number(reversingTxn.amount || 0) + Number(reversingTxn.service_fee || 0) + Number(reversingTxn.portal_charge || 0))} and adjust double-entry ledger postings. The original transaction is permanently preserved as 'REVERSED'.
            </div>

            <div className="rounded-xl bg-slate-50 p-3 space-y-1 dark:bg-white/5">
              <div className="flex justify-between"><span className="text-slate-400">Txn Number:</span> <strong>{reversingTxn.transaction_number}</strong></div>
              <div className="flex justify-between"><span className="text-slate-400">Transfer Principal:</span> <strong>{inr(reversingTxn.amount)}</strong></div>
              <div className="flex justify-between"><span className="text-slate-400">Beneficiary:</span> <strong>{reversingTxn.beneficiary_name || "Beneficiary"}</strong></div>
              <div className="flex justify-between"><span className="text-slate-400">UTR:</span> <strong>{reversingTxn.reference}</strong></div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Reason for Reversal <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                placeholder="e.g. Bank IMPS timeout / Sender cancellation"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold outline-none focus:border-rose-500 dark:border-white/10 dark:bg-white/5"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReverseWindowOpen(false)}
                className="rounded-xl px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={reverseSubmitting}
                className="rounded-xl bg-rose-600 px-5 py-2 font-bold text-white shadow-md hover:bg-rose-700 disabled:opacity-50"
              >
                {reverseSubmitting ? "Reversing…" : "Confirm Reversal"}
              </button>
            </div>
          </form>
        </FloatingWindow>
      )}

      {/* ===============================================================================
          12. DETAILED TRANSACTION AUDIT VIEW MODAL
      =============================================================================== */}
      {selectedDetailTxn && (
        <FloatingWindow
          isOpen={Boolean(selectedDetailTxn)}
          size="md"
          title={`DMT Audit Breakdown #${selectedDetailTxn.transaction_number}`}
          onClose={() => setSelectedDetailTxn(null)}
        >
          {(() => {
            const receiptUrl = `/business/receipt/${selectedDetailTxn.id}${receiptMode === "detailed" ? "?mode=detailed" : ""}`;
            const invoiceUrl = `/business/receipt/${selectedDetailTxn.id}/a4${receiptMode === "detailed" ? "?mode=detailed" : ""}`;
            const dtAmount = Number(selectedDetailTxn.amount || 0);
            const dtFee = Number(selectedDetailTxn.service_fee || 0);
            const dtCharge = Number(selectedDetailTxn.portal_charge || 0);
            const dtComm = Number(selectedDetailTxn.portal_commission || 0);
            const dtCollection = dtAmount + dtFee + dtCharge;
            const dtRevenue = dtFee + dtComm;
            const dtNet = dtRevenue - dtCharge;

            return (
              <div className="p-5 space-y-4 text-xs">
                {/* 1. Transaction Overview */}
                <div className="border-b border-slate-100 pb-2 dark:border-white/5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">1. Transaction Overview</span>
                  <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-slate-400">Date &amp; Time:</span> <div className="font-bold">{selectedDetailTxn.transaction_date} {selectedDetailTxn.transaction_timestamp ? new Date(selectedDetailTxn.transaction_timestamp).toLocaleTimeString() : ""}</div></div>
                    <div><span className="text-slate-400">Status:</span> <div className={`font-bold ${selectedDetailTxn.status === "reversed" ? "text-rose-600" : "text-emerald-600"}`}>{selectedDetailTxn.status.toUpperCase()}</div></div>
                    <div className="col-span-2"><span className="text-slate-400">UTR / Reference:</span> <div className="font-mono font-bold text-slate-900 dark:text-white">{selectedDetailTxn.reference}</div></div>
                  </div>
                </div>

                {/* 2. Sender & Beneficiary */}
                <div className="border-b border-slate-100 pb-2 dark:border-white/5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">2. Parties (Customer &amp; Beneficiary)</span>
                  <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-slate-400">Customer:</span> <div className="font-bold">{selectedDetailTxn.sender_name || selectedDetailTxn.customers?.name || "Walk-in"}</div></div>
                    <div><span className="text-slate-400">Customer Mobile:</span> <div className="font-bold">{selectedDetailTxn.sender_mobile ? maskMobile(selectedDetailTxn.sender_mobile) : "N/A"}</div></div>
                    <div><span className="text-slate-400">Beneficiary:</span> <div className="font-bold">{selectedDetailTxn.beneficiary_name || selectedDetailTxn.receiver_name || "Beneficiary"}</div></div>
                    <div><span className="text-slate-400">Account / VPA:</span> <div className="font-mono font-bold">{selectedDetailTxn.transfer_method === "upi" ? selectedDetailTxn.upi_id : (selectedDetailTxn.beneficiary_account ? maskAccount(selectedDetailTxn.beneficiary_account) : "N/A")}</div></div>
                    {selectedDetailTxn.beneficiary_ifsc && <div><span className="text-slate-400">Bank &amp; IFSC:</span> <div className="font-bold">{selectedDetailTxn.beneficiary_bank || "Bank"} · {selectedDetailTxn.beneficiary_ifsc}</div></div>}
                  </div>
                </div>

                {/* 3. Financial Money Flow Breakdown */}
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">3. Financial Money Flow</span>
                  <div className="mt-1 grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-3 dark:bg-white/5 text-xs">
                    <div><span className="text-slate-400">Transfer Principal:</span> <div className="font-black text-sm">{inr(dtAmount)}</div></div>
                    <div><span className="text-slate-400">Customer Service Fee (Income):</span> <div className="font-bold text-emerald-600">+{inr(dtFee)}</div></div>
                    <div><span className="text-slate-400">Portal / Provider Charge (Cost):</span> <div className="font-bold text-rose-500">-{inr(dtCharge)}</div></div>
                    <div><span className="text-slate-400">Total Customer Collection:</span> <div className="font-black text-sm text-slate-900 dark:text-white">{inr(dtCollection)} via {(selectedDetailTxn.customer_pay_method || "CASH").toUpperCase()}</div></div>
                    <div><span className="text-slate-400">Funding Source:</span> <div className="font-bold">{(selectedDetailTxn.paid_from || "PORTAL").toUpperCase()}</div></div>
                    <div><span className="text-slate-400">Portal Commission (Income):</span> <div className="font-bold text-emerald-600">+{inr(dtComm)}</div></div>
                    <div className="col-span-2 pt-1 border-t border-slate-200 dark:border-white/10 flex justify-between">
                      <span className="font-bold text-slate-700 dark:text-slate-300">Net Business Contribution:</span>
                      <strong className="font-black text-emerald-600">+{inr(dtNet)} (Revenue {inr(dtRevenue)} - Cost {inr(dtCharge)})</strong>
                    </div>
                  </div>
                </div>

                {selectedDetailTxn.remarks && (
                  <div className="rounded-xl border border-slate-200 p-2.5 text-[11px] text-slate-600 dark:border-white/10 dark:text-slate-400">
                    <strong>Remarks:</strong> {selectedDetailTxn.remarks}
                  </div>
                )}

                <div className="flex justify-between items-center pt-2">
                  <div className="flex gap-2">
                    <Link
                      href={receiptUrl}
                      target="_blank"
                      className="rounded-xl bg-slate-900 px-3.5 py-2 font-bold text-white hover:bg-slate-800 dark:bg-violet-600"
                    >
                      🖨️ 80mm Receipt
                    </Link>
                    <Link
                      href={invoiceUrl}
                      target="_blank"
                      className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 font-bold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
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
          13. SCAN & FILL MODAL
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
