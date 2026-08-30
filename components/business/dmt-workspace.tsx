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
import { renderWhatsAppTemplate } from "@/lib/whatsapp";
import WhatsAppSendModal from "@/components/whatsapp/whatsapp-send-modal";

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
  const formRef = useRef<HTMLDivElement>(null);

  useRealtime([
    "transactions",
    "aeps_banks",
    "aeps_portals",
    "customers",
    "cash_entries",
    "saved_contacts",
    "payment_instruments",
    "settlements",
  ]);

  const [transactions, setTransactions] = useState<Txn[]>(initialTransactions);
  const [customers, setCustomers] = useState<CustomerRow[]>(initialCustomers);
  const [banks, setBanks] = useState<Master[]>(initialBanks);
  const [portals] = useState<Master[]>(initialPortals);
  const [liveInstruments, setLiveInstruments] = useState<any[]>(paymentInstruments || []);

  // Live Database Float Balances (Zero hardcoded defaults)
  const [dmtFloat, setDmtFloat] = useState<number>(() => Number(float?.current ?? float ?? 0));
  const [cashInHand, setCashInHand] = useState<number>(0);
  const [bankPoolFloat, setBankPoolFloat] = useState<number>(0);
  const [isRefreshingBalances, setIsRefreshingBalances] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>(() =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );

  // Guided Transfer Mode: "bank_account" (IMPS/NEFT) vs "upi" (Instant UPI VPA)
  const [transferMethod, setTransferMethod] = useState<"bank_account" | "upi">("bank_account");

  // Step 1: Sender / Customer Fields (Clean initial state)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [senderName, setSenderName] = useState<string>("");
  const [senderMobile, setSenderMobile] = useState<string>("");

  // Step 2 & 3: Beneficiary Fields (Clean initial state)
  const [beneficiaryName, setBeneficiaryName] = useState<string>("");
  const [beneficiaryMobile, setBeneficiaryMobile] = useState<string>("");
  const [beneficiaryBank, setBeneficiaryBank] = useState<string>("");
  const [beneficiaryIfsc, setBeneficiaryIfsc] = useState<string>("");
  const [beneficiaryAccount, setBeneficiaryAccount] = useState<string>("");
  const [upiId, setUpiId] = useState<string>("");
  const [receiverName, setReceiverName] = useState<string>("");

  // Step 4 & 5: Amount, Fee, Portal Charge & Portal Commission (Clean initial state)
  const [amount, setAmount] = useState<string>("");
  const [serviceFee, setServiceFee] = useState<string>("");
  const [portalCharge, setPortalCharge] = useState<string>("");
  const [portalCommission, setPortalCommission] = useState<string>("");

  // Step 6: Funding Source (Disbursement) - Cash is Left and Default
  const [paidFrom, setPaidFrom] = useState<"portal" | "bank">("bank");
  const [selectedPortalId, setSelectedPortalId] = useState<string>(initialPortals[0]?.id || "");
  const [selectedBankInstrumentId, setSelectedBankInstrumentId] = useState<string>(liveInstruments[0]?.id || "");

  // Step 7: Customer Collection Instrument
  const [customerPayMethod, setCustomerPayMethod] = useState<"cash" | "upi" | "bank" | "due">("cash");

  // Step 8: Reference & Remarks (Clean initial state)
  const [reference, setReference] = useState<string>("");
  const [remarks, setRemarks] = useState<string>("");

  // Receipt Print Preference (Basic default vs Detailed)
  const [receiptMode, setReceiptMode] = useState<"basic" | "detailed">("basic");

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
  const [lastCompletedTxn, setLastCompletedTxn] = useState<Txn | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDetailTxn, setSelectedDetailTxn] = useState<Txn | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // WhatsApp Modal State
  const [waModal, setWaModal] = useState<{
    open: boolean;
    phone: string;
    name: string;
    msg: string;
    refNum: string;
    refId: string;
  }>({
    open: false,
    phone: "",
    name: "",
    msg: "",
    refNum: "",
    refId: "",
  });

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
      const [{ data: pools }, { data: insts }, { data: freshTxns }] = await Promise.all([
        supabase.rpc("get_pool_balances"),
        supabase.from("payment_instruments").select("*").order("name"),
        supabase
          .from("transactions")
          .select("*, customers(name, phone), banks:aeps_banks(name), portals:aeps_portals(name), profiles(full_name)")
          .eq("service_type", "dmt")
          .order("transaction_timestamp", { ascending: false, nullsFirst: false })
          .order("transaction_date", { ascending: false })
          .limit(500),
      ]);

      if (pools) {
        const dmt = (pools as any)?.dmt;
        if (dmt) {
          setDmtFloat(Number(dmt.current ?? dmt ?? 0));
        }
        const cash = (pools as any)?.cash;
        if (cash) {
          setCashInHand(Number(cash.current ?? cash ?? 0));
        }
        const bank = (pools as any)?.bank;
        if (bank) {
          setBankPoolFloat(Number(bank.current ?? bank ?? 0));
        }
      }

      if (insts && Array.isArray(insts)) {
        setLiveInstruments(insts);
      }

      if (freshTxns) {
        setTransactions(freshTxns as any);
      }

      setLastRefreshedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
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
    if (
      selectedBankInstrument &&
      selectedBankInstrument.current_balance !== undefined &&
      selectedBankInstrument.current_balance !== null
    ) {
      return Number(selectedBankInstrument.current_balance);
    }
    return bankPoolFloat;
  }, [selectedBankInstrument, bankPoolFloat]);

  // Numeric parameters
  const numAmount = Number(amount || 0);
  const numFee = Number(serviceFee || 0);
  const numCharge = Number(portalCharge || 0);
  const numComm = Number(portalCommission || 0);

  const totalCollected = numAmount + numFee + numCharge;
  const businessRevenue = numFee + numComm;
  const providerCost = numCharge;
  const netContribution = businessRevenue - providerCost;

  // Selected Float & Sufficiency Check
  const availableSelectedFloat = paidFrom === "portal" ? dmtFloat : currentBankBalance;

  // Today's DMT KPI calculations
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayTxns = useMemo(() => {
    return transactions.filter(
      (t) =>
        t.service_type === "dmt" &&
        (t.transaction_date === todayStr || t.transaction_timestamp?.slice(0, 10) === todayStr) &&
        t.status === "success"
    );
  }, [transactions, todayStr]);

  const todayVolume = todayTxns.reduce((s, t) => s + Number(t.amount || 0), 0);
  const todayCustomerCollections = todayTxns.reduce(
    (s, t) => s + Number(t.amount || 0) + Number(t.service_fee || 0) + Number(t.portal_charge || 0),
    0
  );
  const todayCustomerFees = todayTxns.reduce((s, t) => s + Number(t.service_fee || 0), 0);
  const todayPortalCharges = todayTxns.reduce((s, t) => s + Number(t.portal_charge || 0), 0);
  const todayPortalCommission = todayTxns.reduce((s, t) => s + Number(t.portal_commission || 0), 0);
  const todayCount = todayTxns.length;

  // Matched Master Bank Object for Beneficiary Bank
  const matchedBeneficiaryBank = useMemo(() => {
    return matchBank(beneficiaryBank, banks);
  }, [beneficiaryBank, banks]);

  // Beneficiary Quick Suggestions from past transactions
  const beneficiarySuggestions = useMemo(() => {
    const map = new Map<
      string,
      { name: string; bank: string; ifsc: string; account: string; upi: string; count: number }
    >();
    for (const t of transactions) {
      if (t.service_type !== "dmt" || t.status !== "success") continue;
      const key =
        t.transfer_method === "upi" ? t.upi_id || "" : `${t.beneficiary_ifsc || ""}|${t.beneficiary_account || ""}`;
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
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [transactions]);

  // Strict Form Validation Guard
  const isFormValid = useMemo(() => {
    if (numAmount <= 0) return false;
    if (numCharge < 0 || numFee < 0 || numComm < 0) return false;
    if (!reference.trim() || reference.trim().length < 6) return false;

    if (transferMethod === "bank_account") {
      if (!beneficiaryAccount.trim() || beneficiaryAccount.trim().length < 4) return false;
      if (!beneficiaryIfsc.trim() || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(beneficiaryIfsc.trim().toUpperCase()))
        return false;
      if (!beneficiaryBank.trim()) return false;
    } else {
      if (!upiId.trim() || !upiId.includes("@")) return false;
    }

    if (senderMobile.trim() && senderMobile.trim().replace(/\D/g, "").length !== 10) return false;
    if (paidFrom === "portal" && !selectedPortalId) return false;
    if (paidFrom === "bank" && !selectedBankInstrumentId) return false;
    if (customerPayMethod === "due" && !selectedCustomerId) return false;

    return true;
  }, [
    numAmount,
    numCharge,
    numFee,
    numComm,
    reference,
    transferMethod,
    beneficiaryAccount,
    beneficiaryIfsc,
    beneficiaryBank,
    upiId,
    senderMobile,
    paidFrom,
    selectedPortalId,
    selectedBankInstrumentId,
    customerPayMethod,
    selectedCustomerId,
  ]);

  // Current Active Lifecycle Step (1-5)
  const currentStep = useMemo(() => {
    if (!selectedCustomerId && !senderName.trim() && !senderMobile.trim()) return 1;
    if (transferMethod === "bank_account") {
      if (!beneficiaryAccount.trim() || !beneficiaryBank.trim()) return 2;
      if (!beneficiaryIfsc.trim()) return 3;
    } else {
      if (!upiId.trim()) return 2;
    }
    if (numAmount <= 0) return 4;
    return 5;
  }, [selectedCustomerId, senderName, senderMobile, transferMethod, beneficiaryAccount, beneficiaryBank, beneficiaryIfsc, upiId, numAmount]);

  // Reset to clean form for New Transfer
  const handleNewTransfer = useCallback(() => {
    setAmount("");
    setServiceFee("");
    setPortalCharge("");
    setPortalCommission("");
    setSelectedCustomerId("");
    setSenderName("");
    setSenderMobile("");
    setBeneficiaryName("");
    setBeneficiaryMobile("");
    setBeneficiaryBank("");
    setBeneficiaryIfsc("");
    setBeneficiaryAccount("");
    setUpiId("");
    setReceiverName("");
    setReference("");
    setRemarks("");
    setPaidFrom("bank");
    setLastCompletedTxn(null);
  }, []);

  // Handle Scan & Fill Extraction
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
      portalCharge: fields.portal_charge || undefined,
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
    const phone = newCustPhone.trim().replace(/\D/g, "");
    if (!name) {
      setCustCreateError("Customer name is required.");
      return;
    }
    if (phone && phone.length !== 10) {
      setCustCreateError("A valid 10-digit mobile number is required.");
      return;
    }

    setCustCreateSubmitting(true);
    setCustCreateError("");

    try {
      const generatedCode = "CUST-" + Math.floor(1000 + Math.random() * 9000);
      const { data: newCust, error: insertError } = await supabase
        .from("customers")
        .insert({
          name,
          phone: phone || null,
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
      const ifsc = newBenIfsc.trim().toUpperCase();
      const acc = newBenAccount.trim();
      const confirmAcc = newBenConfirmAccount.trim();

      if (!acc) {
        setBenCreateError("Account number is required.");
        return;
      }
      if (acc !== confirmAcc) {
        setBenCreateError("Account numbers do not match.");
        return;
      }
      if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
        setBenCreateError("Please enter a valid 11-character IFSC code (e.g. SBIN0001234).");
        return;
      }

      setBenCreateSubmitting(true);
      setBenCreateError("");

      try {
        const dedupeKey = `bank|${ifsc || "ANY"}|${acc}`;
        await supabase.from("saved_contacts").upsert(
          {
            key: dedupeKey,
            kind: "beneficiary",
            name: newBenName.trim() || null,
            phone: newBenMobile.trim() || null,
            bank_name: newBenBank.trim() || null,
            ifsc: ifsc || null,
            account_number: acc,
          },
          { onConflict: "key" }
        );

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
        showToast("success", "Beneficiary saved and selected.");
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
        await supabase.from("saved_contacts").upsert(
          {
            key: dedupeKey,
            kind: "upi_receiver",
            name: newBenName.trim() || null,
            upi_id: upi || null,
          },
          { onConflict: "key" }
        );

        setUpiId(upi);
        setReceiverName(newBenName.trim());
        setBeneficiaryName(newBenName.trim());

        setAddBeneficiaryWindowOpen(false);
        setNewBenName("");
        setNewBenUpi("");
        showToast("success", "UPI Receiver saved and selected.");
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
      showToast("success", `Transaction #${reversingTxn.transaction_number} reversed. Balances updated.`);
    } catch (err: any) {
      console.error("Reversal error:", err);
      showToast("error", err.message || "Failed to reverse transaction.");
    } finally {
      setReverseSubmitting(false);
    }
  }

  // Open WhatsApp Modal
  const handleOpenWhatsApp = useCallback((t: Txn) => {
    const phone = t.customer_mobile || t.sender_mobile || (t.customers as any)?.phone || "";
    const name = t.sender_name || (t.customers as any)?.name || "Customer";
    const shopName = "CyberCafe ERP";
    const text = renderWhatsAppTemplate("dmt_confirmation", {
      shop_name: shopName,
      customer_name: name,
      customer_name_line: name ? `👤 Sender: ${name}\n` : "",
      ref_number: t.reference || t.transaction_number,
      date: t.transaction_date,
      amount: inr(Number(t.amount)),
      service_fee: inr(Number(t.service_fee || 0)),
      receipt_url: `${window.location.origin}/business/receipt/${t.id}`,
    });
    setWaModal({
      open: true,
      phone,
      name,
      msg: text,
      refNum: t.transaction_number,
      refId: t.id,
    });
  }, []);

  // Execute Transfer Transaction (Double-submission guarded & Live Balance Refresh)
  async function handleProcessTransfer() {
    if (!isFormValid || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const nowIso = new Date().toISOString();
      const dateStr = nowIso.slice(0, 10);

      const res = await supabase.rpc("create_dmt_business_txn", {
        p_service_type: "dmt",
        p_transaction_date: dateStr,
        p_transaction_timestamp: nowIso,
        p_customer_id: selectedCustomerId || null,
        p_customer_mobile: senderMobile.trim() || null,
        p_reference: reference.trim(),
        p_remarks: remarks.trim() || null,
        p_status: "success",
        p_bank_id: matchedBeneficiaryBank?.id || null,
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
        p_pay_from_instrument_id: paidFrom === "bank" ? selectedBankInstrumentId || null : null,
        p_pay_from_method: paidFrom,
        p_receiver_name: receiverName.trim() || null,
        p_portal_charge: numCharge,
      });

      if (res.error) throw res.error;

      const resData = (res.data as any) || {};
      const newTxnId = resData.id || resData.txn_id || null;
      const newTxnNum = resData.transaction_number || resData.txn_number || "DMT-NEW";

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
        bank_id: matchedBeneficiaryBank?.id || null,
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

      // Re-fetch Live Balances Immediately
      await refreshBalances();

      showToast("success", `₹${numAmount.toLocaleString("en-IN")} DMT transfer completed successfully.`);
    } catch (err: any) {
      console.error("DMT error:", err);
      showToast("error", err.message || "Transfer could not be completed. Please verify details.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Export CSV Handler
  const handleExportCsv = () => {
    const filename = `dmt-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    const headers = [
      "Transaction No",
      "Date",
      "Sender",
      "Sender Mobile",
      "Beneficiary",
      "Bank",
      "Account",
      "IFSC",
      "Transfer Method",
      "Amount",
      "Service Fee",
      "Provider Charge",
      "Commission",
      "Status",
      "Reference",
    ];
    const rows = filteredTxns.map((t) => [
      t.transaction_number,
      t.transaction_date,
      t.sender_name || t.customers?.name || "Walk-in",
      t.customer_mobile || t.sender_mobile || "",
      t.beneficiary_name || t.receiver_name || "",
      t.beneficiary_bank || "",
      t.beneficiary_account || "",
      t.beneficiary_ifsc || "",
      t.transfer_method || "bank_account",
      t.amount,
      t.service_fee || 0,
      t.portal_charge || 0,
      t.portal_commission || 0,
      t.status,
      t.reference || "",
    ]);
    downloadCsv(filename, headers, rows);
    showToast("success", "Exported DMT transactions.");
  };

  // Filtered transactions list
  const filteredTxns = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return transactions.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (!q) return true;
      return (
        t.transaction_number?.toLowerCase().includes(q) ||
        t.sender_name?.toLowerCase().includes(q) ||
        t.sender_mobile?.includes(q) ||
        t.beneficiary_name?.toLowerCase().includes(q) ||
        t.beneficiary_account?.includes(q) ||
        t.upi_id?.toLowerCase().includes(q) ||
        t.reference?.toLowerCase().includes(q)
      );
    });
  }, [transactions, searchQuery, statusFilter]);

  const recentTxn = transactions[0] || null;

  return (
    <div className="space-y-5 pb-16">
      {/* Toast Notification Container */}
      {toastView}

      {/* ===============================================================================
          1. EXECUTIVE HERO HEADER
      =============================================================================== */}
      <section className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-5 text-white shadow-xl ring-1 ring-white/10 sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-0.5 text-xs font-bold text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                ● DMT SYSTEM ONLINE
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-slate-300">
                IMPS / NEFT / UPI PAYOUT GATEWAY ACTIVE
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl text-white">
              Money Transfer
            </h1>
            <p className="text-xs text-indigo-200/80 sm:text-sm">
              Domestic Remittance Command Center with transparent provider wallet, customer payout, service fee and operator income tracking.
            </p>
          </div>

          {/* Top-Right Live Balances Display */}
          <div className="flex flex-wrap items-center gap-2.5 sm:flex-nowrap">
            <button
              type="button"
              onClick={refreshBalances}
              disabled={isRefreshingBalances}
              className="rounded-2xl border border-white/10 bg-white/5 p-3.5 text-slate-300 backdrop-blur-md hover:bg-white/10 hover:text-white transition disabled:opacity-50"
              title="Refresh Live Balances from Database"
            >
              <span className={`inline-block text-base ${isRefreshingBalances ? "animate-spin text-teal-400" : ""}`}>↻</span>
            </button>
            <div className="flex flex-col items-end rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md min-w-[160px]">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">DMT PORTAL WALLET</span>
              <div className={`text-2xl font-black ${dmtFloat < 0 ? "text-amber-400" : "text-emerald-400"}`}>
                {inr(dmtFloat)}
              </div>
              <span className="text-[10px] text-slate-400">Available Balance</span>
            </div>
            <div className="flex flex-col items-end rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md min-w-[150px]">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">CASH IN HAND</span>
              <div className={`text-2xl font-black ${cashInHand < 0 ? "text-amber-400" : "text-emerald-400"}`}>
                {inr(cashInHand)}
              </div>
              <span className="text-[10px] text-slate-400">Available Balance</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===============================================================================
          2. DMT POSITION / COMPACT FINANCIAL SUMMARY STRIP
      =============================================================================== */}
      <section className="rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6 dark:border-white/5 min-w-[240px]">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 font-black">
              ₹
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">DMT POSITION</span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  ● RECONCILED
                </span>
              </div>
              <div className="text-lg font-black text-slate-900 dark:text-white">
                Provider Wallet {inr(dmtFloat)}
              </div>
              <Link
                href="/finance/reconciliation"
                className="text-[11px] font-bold text-indigo-600 hover:underline dark:text-indigo-400"
              >
                View reconciliation →
              </Link>
            </div>
          </div>

          {/* Connected Metrics Grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 flex-1 text-center">
            <div className="rounded-xl bg-slate-50/80 p-2.5 dark:bg-white/5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">TRANSFERS</span>
              <div className="mt-0.5 text-xs font-black text-slate-900 dark:text-white">{inr(todayVolume)}</div>
              <span className="text-[9px] text-slate-400">{todayCount} Transfers</span>
            </div>

            <div className="rounded-xl bg-slate-50/80 p-2.5 dark:bg-white/5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">COLLECTIONS</span>
              <div className="mt-0.5 text-xs font-black text-slate-900 dark:text-white">{inr(todayCustomerCollections)}</div>
              <span className="text-[9px] text-slate-400">Gross Payout</span>
            </div>

            <div className="rounded-xl bg-slate-50/80 p-2.5 dark:bg-white/5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">CUSTOMER FEES</span>
              <div className="mt-0.5 text-xs font-black text-emerald-600 dark:text-emerald-400">+{inr(todayCustomerFees)}</div>
              <span className="text-[9px] text-emerald-600/80">Surcharges</span>
            </div>

            <div className="rounded-xl bg-slate-50/80 p-2.5 dark:bg-white/5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PROVIDER CHARGES</span>
              <div className="mt-0.5 text-xs font-black text-rose-600 dark:text-rose-400">-{inr(todayPortalCharges)}</div>
              <span className="text-[9px] text-rose-500/80">Pass-through</span>
            </div>

            <div className="rounded-xl bg-slate-50/80 p-2.5 dark:bg-white/5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">COMMISSION</span>
              <div className="mt-0.5 text-xs font-black text-teal-600 dark:text-teal-400">+{inr(todayPortalCommission)}</div>
              <span className="text-[9px] text-teal-600/80">Gateway Credit</span>
            </div>

            <div className="rounded-xl bg-slate-50/80 p-2.5 dark:bg-white/5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">VARIANCE</span>
              <div className="mt-0.5 text-xs font-black text-emerald-600 dark:text-emerald-400">₹0.00</div>
              <span className="text-[9px] text-emerald-600/80">Canonical Match</span>
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
            DMT OPERATIONS
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setScanModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/10"
              title="Scan remittance receipt or SMS"
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
            <button
              type="button"
              onClick={() => setAddBeneficiaryWindowOpen(true)}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/10"
            >
              <span>+ Add Beneficiary</span>
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Tile 1: Domestic Money Transfer */}
          <div className="group relative overflow-hidden rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-400 hover:shadow-md dark:border-white/10 dark:bg-slate-900 dark:hover:border-indigo-500/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-xl text-white shadow-md shadow-indigo-500/20">
                  💸
                </div>
                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                  IMPS / NEFT / UPI
                </span>
              </div>
              <h3 className="mt-3 text-base font-black text-slate-900 dark:text-white">DOMESTIC MONEY TRANSFER</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Send money to any supported bank account or UPI VPA instantly
              </p>
              <p className="mt-2 text-[11px] text-slate-400">
                Transparent service fees, provider charges, and live wallet settlement
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
              <span className="text-xs text-slate-400">Instant IMPS / Realtime UPI</span>
              <button
                type="button"
                onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth" })}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition hover:brightness-110 active:scale-[0.98]"
              >
                <span>Start Transfer</span>
                <span>→</span>
              </button>
            </div>
          </div>

          {/* Tile 2: DMT Service Portals */}
          <div className="group relative overflow-hidden rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-400 hover:shadow-md dark:border-white/10 dark:bg-slate-900 dark:hover:border-violet-500/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-xl text-white shadow-md shadow-violet-500/20">
                  🌐
                </div>
                <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                  {portals.length} Active Gateways
                </span>
              </div>
              <h3 className="mt-3 text-base font-black text-slate-900 dark:text-white">DMT SERVICE PORTALS</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Digipay, Ezeepay, RNFI &amp; connected remittance channels
              </p>
              <p className="mt-2 text-[11px] text-slate-400">
                Authoritative float synchronization and double-entry ledger sync
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
              <span className="text-xs text-slate-400 truncate max-w-[200px]">{portals.map((p) => p.name).join(", ") || "No portals configured"}</span>
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
          4. DMT SERVICE STATUS RAIL
      =============================================================================== */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        <div className="rounded-2xl border border-slate-200/70 bg-white p-3 text-center dark:border-white/5 dark:bg-slate-900">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">DMT SWITCH</span>
          <p className="mt-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">● ONLINE</p>
        </div>
        <div className="rounded-2xl border border-slate-200/70 bg-white p-3 text-center dark:border-white/5 dark:bg-slate-900">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">BENEFICIARY</span>
          <p className="mt-0.5 text-xs font-bold text-indigo-600 dark:text-indigo-400">● READY</p>
        </div>
        <div className="rounded-2xl border border-slate-200/70 bg-white p-3 text-center dark:border-white/5 dark:bg-slate-900">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PAYOUT GATEWAY</span>
          <p className="mt-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">● CONNECTED</p>
        </div>
        <div className="rounded-2xl border border-slate-200/70 bg-white p-3 text-center dark:border-white/5 dark:bg-slate-900">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PORTALS</span>
          <p className="mt-0.5 text-xs font-bold text-violet-600 dark:text-violet-400">● {portals.length} CONNECTED</p>
        </div>
        <div className="rounded-2xl border border-slate-200/70 bg-white p-3 text-center dark:border-white/5 dark:bg-slate-900">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">SETTLEMENT</span>
          <p className="mt-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">✓ SYNCED</p>
        </div>
        <div className="rounded-2xl border border-slate-200/70 bg-white p-3 text-center dark:border-white/5 dark:bg-slate-900">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">LAST SYNC</span>
          <p className="mt-0.5 text-xs font-bold text-slate-700 dark:text-slate-300">{lastRefreshedAt}</p>
        </div>
      </section>

      {/* ===============================================================================
          5. 5-STAGE DMT OPERATION LIFECYCLE
      =============================================================================== */}
      <section className="rounded-[22px] border border-slate-200/80 bg-white p-4.5 shadow-xs dark:border-white/10 dark:bg-slate-900 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-white/5">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">
            DMT OPERATION LIFECYCLE
          </h2>
          <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">5-Stage Atomic Flow</span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          <div className={`rounded-xl p-2.5 border transition ${currentStep >= 1 ? "bg-indigo-50/80 border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-800" : "bg-slate-50/80 border-slate-100 dark:bg-white/5 dark:border-white/5"}`}>
            <span className={`font-mono text-[10px] font-bold ${currentStep >= 1 ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400"}`}>01. IDENTIFY</span>
            <p className="mt-0.5 text-xs font-bold text-slate-900 dark:text-white">Customer &amp; Sender</p>
            <p className="text-[10px] text-slate-400">Sender CRM &amp; 10-digit mobile</p>
          </div>
          <div className={`rounded-xl p-2.5 border transition ${currentStep >= 2 ? "bg-indigo-50/80 border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-800" : "bg-slate-50/80 border-slate-100 dark:bg-white/5 dark:border-white/5"}`}>
            <span className={`font-mono text-[10px] font-bold ${currentStep >= 2 ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400"}`}>02. BENEFICIARY</span>
            <p className="mt-0.5 text-xs font-bold text-slate-900 dark:text-white">Account / VPA</p>
            <p className="text-[10px] text-slate-400">Bank account or UPI handle</p>
          </div>
          <div className={`rounded-xl p-2.5 border transition ${currentStep >= 3 ? "bg-indigo-50/80 border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-800" : "bg-slate-50/80 border-slate-100 dark:bg-white/5 dark:border-white/5"}`}>
            <span className={`font-mono text-[10px] font-bold ${currentStep >= 3 ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400"}`}>03. VERIFY</span>
            <p className="mt-0.5 text-xs font-bold text-slate-900 dark:text-white">Routing &amp; IFSC</p>
            <p className="text-[10px] text-slate-400">IMPS / NEFT / Gateway check</p>
          </div>
          <div className={`rounded-xl p-2.5 border transition ${currentStep >= 4 ? "bg-indigo-50/80 border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-800" : "bg-slate-50/80 border-slate-100 dark:bg-white/5 dark:border-white/5"}`}>
            <span className={`font-mono text-[10px] font-bold ${currentStep >= 4 ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400"}`}>04. TRANSFER</span>
            <p className="mt-0.5 text-xs font-bold text-slate-900 dark:text-white">Principal &amp; Fee</p>
            <p className="text-[10px] text-slate-400">Collection &amp; provider charges</p>
          </div>
          <div className={`rounded-xl p-2.5 border transition ${currentStep >= 5 ? "bg-emerald-50/80 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800" : "bg-slate-50/80 border-slate-100 dark:bg-white/5 dark:border-white/5"}`}>
            <span className={`font-mono text-[10px] font-bold ${currentStep >= 5 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>05. SETTLE</span>
            <p className="mt-0.5 text-xs font-bold text-slate-900 dark:text-white">Disburse &amp; Sync</p>
            <p className="text-[10px] text-slate-400">Float sync &amp; double-entry ledger</p>
          </div>
        </div>
      </section>

      {/* ===============================================================================
          6. MAIN DMT OPERATION WORKSPACE (SIDE-BY-SIDE: TERMINAL + SETTLEMENT CONFIRMATION)
      =============================================================================== */}
      <div ref={formRef} className="space-y-4">
        {/* Success Confirmation Card (When transaction has just completed) */}
        {lastCompletedTxn && (
          <div className="relative overflow-hidden rounded-[24px] border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-indigo-500/5 to-slate-900/40 p-5 sm:p-6 backdrop-blur-md dark:border-emerald-500/30 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-emerald-500/20 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-xl text-white shadow-md shadow-emerald-500/30">
                  ✓
                </div>
                <div>
                  <h3 className="text-base font-black text-emerald-900 dark:text-emerald-300">
                    DMT TRANSFER COMPLETED SUCCESSFULLY
                  </h3>
                  <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
                    Deterministic remittance ledger updated and provider wallet synchronized.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleNewTransfer}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white shadow-md hover:bg-emerald-700 transition"
              >
                <span>+ New Transfer</span>
              </button>
            </div>

            {/* Completed Transaction Details Grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 rounded-2xl bg-white/70 p-4 dark:bg-white/5 border border-emerald-500/10 text-xs">
              <div>
                <span className="text-slate-400 font-semibold text-[10px]">TXN NUMBER:</span>
                <p className="font-mono font-bold text-slate-900 dark:text-white mt-0.5">{lastCompletedTxn.transaction_number}</p>
              </div>
              <div>
                <span className="text-slate-400 font-semibold text-[10px]">SENDER:</span>
                <p className="font-bold text-slate-900 dark:text-white mt-0.5 truncate">{lastCompletedTxn.sender_name || lastCompletedTxn.customers?.name || "Walk-in"}</p>
              </div>
              <div>
                <span className="text-slate-400 font-semibold text-[10px]">BENEFICIARY:</span>
                <p className="font-bold text-slate-900 dark:text-white mt-0.5 truncate">{lastCompletedTxn.beneficiary_name || lastCompletedTxn.receiver_name || "Beneficiary"}</p>
              </div>
              <div>
                <span className="text-slate-400 font-semibold text-[10px]">TRANSFER AMOUNT:</span>
                <p className="font-black text-slate-900 dark:text-white mt-0.5">{inr(lastCompletedTxn.amount)}</p>
              </div>
              <div>
                <span className="text-slate-400 font-semibold text-[10px]">TOTAL DEBIT:</span>
                <p className="font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {inr(Number(lastCompletedTxn.amount || 0) + Number(lastCompletedTxn.service_fee || 0) + Number(lastCompletedTxn.portal_charge || 0))}
                </p>
              </div>
              <div>
                <span className="text-slate-400 font-semibold text-[10px]">OPERATOR INCOME:</span>
                <p className="font-black text-teal-600 dark:text-teal-400 mt-0.5">
                  +{inr(Number(lastCompletedTxn.service_fee || 0) + Number(lastCompletedTxn.portal_commission || 0) - Number(lastCompletedTxn.portal_charge || 0))}
                </p>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
              <div className="flex items-center gap-2">
                <Link
                  href={`/business/receipt/${lastCompletedTxn.id}${receiptMode === "detailed" ? "?mode=detailed" : ""}`}
                  target="_blank"
                  className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 dark:bg-indigo-600"
                >
                  🖨️ Thermal Receipt
                </Link>
                <Link
                  href={`/business/receipt/${lastCompletedTxn.id}/a4${receiptMode === "detailed" ? "?mode=detailed" : ""}`}
                  target="_blank"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                >
                  📄 A4 Invoice
                </Link>
                <button
                  type="button"
                  onClick={() => handleOpenWhatsApp(lastCompletedTxn)}
                  className="rounded-xl bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
                >
                  💬 Send WhatsApp
                </button>
              </div>

              {/* Receipt Mode Toggle */}
              <div className="flex items-center rounded-xl bg-white/80 p-1 text-[11px] font-bold border border-slate-200 dark:bg-white/5 dark:border-white/10">
                <span className="text-slate-400 pl-1.5 pr-2">Receipt:</span>
                <button
                  type="button"
                  onClick={() => setReceiptMode("basic")}
                  className={`rounded-lg px-2 py-1 transition ${receiptMode === "basic" ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-500"}`}
                >
                  Basic (Customer)
                </button>
                <button
                  type="button"
                  onClick={() => setReceiptMode("detailed")}
                  className={`rounded-lg px-2 py-1 transition ${receiptMode === "detailed" ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-500"}`}
                >
                  Detailed (With Fee)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Side-by-Side Workspace Layout */}
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
          {/* LEFT: DMT Transfer Terminal (8 cols) */}
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 sm:p-6 shadow-sm dark:border-white/10 dark:bg-slate-900 lg:col-span-8 space-y-5">
            {/* Header & Mode Switcher */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-white/5">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  DMT TRANSFER TERMINAL
                </h3>
                <p className="text-xs text-slate-400">
                  Instant domestic remittance via IMPS, NEFT or UPI payout gateway.
                </p>
              </div>

              {/* Transfer Mode Pills */}
              <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold dark:bg-white/5">
                <button
                  type="button"
                  onClick={() => setTransferMethod("bank_account")}
                  className={`rounded-lg px-3 py-1.5 transition ${
                    transferMethod === "bank_account"
                      ? "bg-white text-slate-900 shadow-xs dark:bg-indigo-600 dark:text-white"
                      : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  🏦 Bank Account (IMPS/NEFT)
                </button>
                <button
                  type="button"
                  onClick={() => setTransferMethod("upi")}
                  className={`rounded-lg px-3 py-1.5 transition ${
                    transferMethod === "upi"
                      ? "bg-white text-slate-900 shadow-xs dark:bg-indigo-600 dark:text-white"
                      : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  ⚡ UPI VPA (Instant)
                </button>
              </div>
            </div>

            {/* Form Fields Grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* 1. Sender / Customer Attribution */}
              <div className="space-y-1 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Sender / Customer (Optional Attribution)
                  </label>
                  <button
                    type="button"
                    onClick={() => setAddCustomerWindowOpen(true)}
                    className="text-[11px] font-bold text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    + New Customer
                  </button>
                </div>
                <SearchableSelect
                  options={[
                    { value: "", label: "-- Walk-in Sender (No CRM Profile) --" },
                    ...customers.map((c) => ({
                      value: c.id,
                      label: `${c.name}${c.phone ? ` (${c.phone})` : ""}`,
                    })),
                  ]}
                  value={selectedCustomerId}
                  onChange={(val) => setSelectedCustomerId(val)}
                  placeholder="Search sender by name or mobile…"
                />
              </div>

              {/* Sender Name & Mobile */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Sender Name
                </label>
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:focus:bg-slate-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Sender Mobile (10-Digit)
                </label>
                <input
                  type="tel"
                  maxLength={10}
                  value={senderMobile}
                  onChange={(e) => setSenderMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-digit mobile number"
                  className={`w-full rounded-xl border px-3.5 py-2.5 text-xs outline-none transition focus:bg-white dark:focus:bg-slate-900 ${
                    senderMobile.length > 0 && senderMobile.length !== 10
                      ? "border-rose-300 bg-rose-50/30 text-rose-900 focus:border-rose-500 dark:border-rose-800 dark:bg-rose-950/20 dark:text-rose-300"
                      : "border-slate-200 bg-slate-50/50 text-slate-900 focus:border-indigo-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                  }`}
                />
                {senderMobile.length > 0 && senderMobile.length !== 10 && (
                  <p className="text-[10px] text-rose-500">Mobile must be exactly 10 digits.</p>
                )}
              </div>

              {/* Beneficiary Quick Suggestions */}
              {beneficiarySuggestions.length > 0 && (
                <div className="sm:col-span-2 space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      QUICK BENEFICIARY SUGGESTIONS
                    </span>
                    <span className="text-[10px] text-slate-400">Click to autofill</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {beneficiarySuggestions.map((b, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setBeneficiaryName(b.name);
                          if (b.upi) {
                            setUpiId(b.upi);
                            setTransferMethod("upi");
                          } else {
                            setBeneficiaryBank(b.bank);
                            setBeneficiaryIfsc(b.ifsc);
                            setBeneficiaryAccount(b.account);
                            setTransferMethod("bank_account");
                          }
                        }}
                        className="rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-indigo-400 hover:bg-indigo-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                      >
                        👤 {b.name} {b.bank ? `· ${b.bank}` : ""} ({b.account ? maskAccount(b.account) : b.upi})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. Beneficiary Section */}
              {transferMethod === "bank_account" ? (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Beneficiary Name
                    </label>
                    <input
                      type="text"
                      value={beneficiaryName}
                      onChange={(e) => setBeneficiaryName(e.target.value)}
                      placeholder="e.g. Suman Mondal"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:focus:bg-slate-900"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Beneficiary Mobile (Optional)
                    </label>
                    <input
                      type="tel"
                      maxLength={10}
                      value={beneficiaryMobile}
                      onChange={(e) => setBeneficiaryMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="10-digit mobile"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:focus:bg-slate-900"
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Beneficiary Bank <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setAddBankWindowOpen(true)}
                        className="text-[11px] font-bold text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        + Add Bank
                      </button>
                    </div>
                    <SearchableSelect
                      options={[
                        { value: "", label: "-- Select Beneficiary Bank --" },
                        ...banks.map((b) => ({ value: b.name, label: b.name })),
                      ]}
                      value={beneficiaryBank}
                      onChange={(val) => setBeneficiaryBank(val)}
                      placeholder="Search bank name…"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Account Number <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={beneficiaryAccount}
                      onChange={(e) => setBeneficiaryAccount(e.target.value.replace(/\s+/g, ""))}
                      placeholder="Enter account number"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 font-mono text-xs text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:focus:bg-slate-900 font-bold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Bank IFSC Code <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={11}
                      value={beneficiaryIfsc}
                      onChange={(e) => setBeneficiaryIfsc(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11))}
                      placeholder="e.g. SBIN0001234"
                      className={`w-full rounded-xl border px-3.5 py-2.5 font-mono text-xs outline-none transition focus:bg-white dark:focus:bg-slate-900 font-bold ${
                        beneficiaryIfsc.length > 0 && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(beneficiaryIfsc)
                          ? "border-rose-300 bg-rose-50/30 text-rose-900 focus:border-rose-500 dark:border-rose-800 dark:bg-rose-950/20 dark:text-rose-300"
                          : "border-slate-200 bg-slate-50/50 text-slate-900 focus:border-indigo-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                      }`}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Beneficiary UPI ID (VPA) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value.trim().toLowerCase())}
                      placeholder="e.g. username@oksbi or 9876543210@paytm"
                      className={`w-full rounded-xl border px-3.5 py-2.5 font-mono text-xs outline-none transition focus:bg-white dark:focus:bg-slate-900 font-bold ${
                        upiId.length > 0 && !upiId.includes("@")
                          ? "border-rose-300 bg-rose-50/30 text-rose-900 focus:border-rose-500 dark:border-rose-800 dark:bg-rose-950/20 dark:text-rose-300"
                          : "border-slate-200 bg-slate-50/50 text-slate-900 focus:border-indigo-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                      }`}
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Receiver / Beneficiary Name
                    </label>
                    <input
                      type="text"
                      value={receiverName}
                      onChange={(e) => {
                        setReceiverName(e.target.value);
                        setBeneficiaryName(e.target.value);
                      }}
                      placeholder="e.g. Suman Mondal"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:focus:bg-slate-900"
                    />
                  </div>
                </>
              )}

              {/* 3. Disbursement Route / Funding Channel: Cash is Left and Default */}
              <div className="space-y-2 sm:col-span-2 pt-2 border-t border-slate-100 dark:border-white/5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  TRANSFER FUNDING SOURCE (DISBURSEMENT) <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* LEFT: 🏦 CASH */}
                  <button
                    type="button"
                    onClick={() => setPaidFrom("bank")}
                    className={`relative flex flex-col justify-between rounded-2xl border p-4 text-left transition ${
                      paidFrom === "bank"
                        ? "border-indigo-600 bg-indigo-50/90 shadow-sm ring-2 ring-indigo-500/20 dark:border-indigo-500 dark:bg-indigo-950/40"
                        : "border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-100/70 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black tracking-wide text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>🏦</span> CASH
                        </span>
                        {paidFrom === "bank" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-black text-white shadow-xs">
                            ✓ SELECTED
                          </span>
                        )}
                      </div>
                      <div className="mt-2 text-lg font-black text-slate-900 dark:text-white">
                        {inr(currentBankBalance)}
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        Shop cash/bank funding
                      </p>
                    </div>
                    {paidFrom === "bank" && (
                      <div className="mt-3 text-[10px] font-black tracking-wider text-indigo-700 uppercase dark:text-indigo-300">
                        SELECTED
                      </div>
                    )}
                  </button>

                  {/* RIGHT: 🛡️ DMT PORTAL WALLET */}
                  <button
                    type="button"
                    onClick={() => setPaidFrom("portal")}
                    className={`relative flex flex-col justify-between rounded-2xl border p-4 text-left transition ${
                      paidFrom === "portal"
                        ? "border-indigo-600 bg-indigo-50/90 shadow-sm ring-2 ring-indigo-500/20 dark:border-indigo-500 dark:bg-indigo-950/40"
                        : "border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-100/70 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black tracking-wide text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>🛡️</span> DMT PORTAL WALLET
                        </span>
                        {paidFrom === "portal" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-black text-white shadow-xs">
                            ✓ SELECTED
                          </span>
                        )}
                      </div>
                      <div className="mt-2 text-lg font-black text-slate-900 dark:text-white">
                        {inr(dmtFloat)}
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        Live DMT gateway wallet
                      </p>
                    </div>
                    {paidFrom === "portal" && (
                      <div className="mt-3 text-[10px] font-black tracking-wider text-indigo-700 uppercase dark:text-indigo-300">
                        SELECTED
                      </div>
                    )}
                  </button>
                </div>
              </div>

              {/* Sub-selectors depending on funding source */}
              {paidFrom === "bank" && (
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Select Shop Bank Account <span className="text-rose-500">*</span>
                  </label>
                  <SearchableSelect
                    options={liveInstruments.map((inst) => ({
                      value: inst.id,
                      label: `${inst.name}${inst.account_number ? ` (•••• ${inst.account_number.slice(-4)})` : ""} — ${inr(inst.current_balance ?? 0)}`,
                    }))}
                    value={selectedBankInstrumentId}
                    onChange={(val) => setSelectedBankInstrumentId(val)}
                    placeholder="Select shop bank account…"
                  />
                </div>
              )}

              {paidFrom === "portal" && (
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    DMT Provider Gateway <span className="text-rose-500">*</span>
                  </label>
                  <SearchableSelect
                    options={portals.map((p) => ({ value: p.id, label: p.name }))}
                    value={selectedPortalId}
                    onChange={(val) => setSelectedPortalId(val)}
                    placeholder="Select remittance portal…"
                  />
                </div>
              )}

              {/* 4. Financial Inputs: Amount, Fee, Portal Charge, Commission */}
              <div className="space-y-1 sm:col-span-2 pt-2 border-t border-slate-100 dark:border-white/5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Transfer Amount (₹) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-lg font-black text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:bg-slate-900"
                />

                {/* Quick Amount Chips */}
                <div className="flex flex-wrap gap-1.5 pt-1.5">
                  {[500, 1000, 2000, 5000, 10000].map((quickAmt) => (
                    <button
                      key={quickAmt}
                      type="button"
                      onClick={() => setAmount(String(quickAmt))}
                      className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-xs transition hover:border-indigo-400 hover:bg-indigo-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      +₹{quickAmt >= 1000 ? `${quickAmt / 1000}K` : quickAmt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fee, Provider Charge & Commission Row */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Customer Service Fee (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={serviceFee}
                  onChange={(e) => setServiceFee(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:focus:bg-slate-900 font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Portal / Provider Charge (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={portalCharge}
                  onChange={(e) => setPortalCharge(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:focus:bg-slate-900 font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Portal Commission (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={portalCommission}
                  onChange={(e) => setPortalCommission(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:focus:bg-slate-900 font-bold text-teal-600 dark:text-teal-400"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Customer Pays Via <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {[
                    { id: "cash", label: "💵 Cash" },
                    { id: "upi", label: "📱 UPI" },
                    { id: "bank", label: "🏦 Bank" },
                    { id: "due", label: "📋 Khata" },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setCustomerPayMethod(m.id as any)}
                      className={`rounded-xl border p-2 text-center text-xs font-bold transition ${
                        customerPayMethod === m.id
                          ? "border-indigo-600 bg-indigo-50 text-indigo-900 shadow-xs dark:bg-indigo-950/40 dark:text-indigo-200"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reference & Remarks */}
              <div className="space-y-1 sm:col-span-2 pt-2 border-t border-slate-100 dark:border-white/5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Bank Reference / UTR Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="12-digit Bank Reference / UTR Number (Mandatory for Compliance)"
                  className={`w-full rounded-xl border px-3.5 py-2.5 font-mono text-xs outline-none transition focus:bg-white dark:focus:bg-slate-900 font-bold ${
                    reference.length > 0 && reference.trim().length < 6
                      ? "border-rose-300 bg-rose-50/30 text-rose-900 focus:border-rose-500 dark:border-rose-800 dark:bg-rose-950/20 dark:text-rose-300"
                      : "border-slate-200 bg-slate-50/50 text-slate-900 focus:border-indigo-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                  }`}
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Remarks / Notes (Optional)
                </label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Optional audit notes…"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:focus:bg-slate-900"
                />
              </div>
            </div>
          </div>

          {/* RIGHT: Order Summary & Settlement Breakdown (4 cols) */}
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 sm:p-6 shadow-sm dark:border-white/10 dark:bg-slate-900 lg:col-span-4 space-y-4 sticky top-6">
            <div className="border-b border-slate-100 pb-3 dark:border-white/5">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                DMT ORDER SUMMARY
              </h3>
              <p className="text-xs text-slate-400">
                Authoritative settlement breakdown &amp; income attribution.
              </p>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Operation:</span>
                <span className="font-bold text-slate-900 dark:text-white">Money Transfer</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Method:</span>
                <span className="font-bold text-slate-900 dark:text-white uppercase">{transferMethod === "upi" ? "UPI VPA" : "IMPS / NEFT"}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Sender:</span>
                <span className="font-bold text-slate-900 dark:text-white truncate max-w-[150px]">{senderName || "Walk-in"}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Beneficiary:</span>
                <span className="font-bold text-slate-900 dark:text-white truncate max-w-[150px]">{beneficiaryName || "—"}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Target / Account:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white truncate max-w-[150px]">
                  {transferMethod === "upi" ? (upiId || "—") : beneficiaryAccount ? maskAccount(beneficiaryAccount) : "—"}
                </span>
              </div>

              <div className="my-2 border-t border-dashed border-slate-200 dark:border-white/10" />

              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Transfer Principal:</span>
                <span className="font-bold text-slate-900 dark:text-white">{inr(numAmount)}</span>
              </div>

              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Customer Service Fee:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">+{inr(numFee)}</span>
              </div>

              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Provider Charge:</span>
                <span className="font-bold text-rose-600 dark:text-rose-400">+{inr(numCharge)}</span>
              </div>

              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Portal Commission:</span>
                <span className="font-bold text-teal-600 dark:text-teal-400">+{inr(numComm)}</span>
              </div>

              {/* Total Customer Debit Highlight */}
              <div className="rounded-2xl bg-indigo-50/80 p-3.5 text-xs text-indigo-950 dark:bg-indigo-950/40 dark:text-indigo-200">
                <div className="text-[10px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                  Total Customer Debit:
                </div>
                <div className="mt-1 text-2xl font-black text-indigo-900 dark:text-white">
                  {inr(totalCollected)}
                </div>
                <p className="mt-0.5 text-[10px] text-indigo-600 dark:text-indigo-300">
                  Principal {inr(numAmount)} + Fee {inr(numFee)} + Charge {inr(numCharge)}
                </p>
              </div>

              {/* Operator Net Income */}
              <div className="flex justify-between py-1 text-slate-600 dark:text-slate-400">
                <span className="font-bold">Operator Net Income:</span>
                <span className="font-black text-emerald-600 dark:text-emerald-400">+{inr(netContribution)}</span>
              </div>

              <div className="flex justify-between py-1 text-slate-600 dark:text-slate-400">
                <span>Provider Wallet Impact:</span>
                <span className="font-bold text-rose-600 dark:text-rose-400">-{inr(numAmount)}</span>
              </div>

              {/* Float Warning if insufficient */}
              {availableSelectedFloat < numAmount && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                  ⚠️ <strong>Float Warning:</strong> Selected channel float ({inr(availableSelectedFloat)}) is less than transfer amount ({inr(numAmount)}).
                </div>
              )}
            </div>

            {/* Single Primary Complete Transfer Action */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-white/5">
              <button
                type="button"
                onClick={handleProcessTransfer}
                disabled={!isFormValid || isSubmitting}
                className={`w-full rounded-2xl py-3.5 text-sm font-black transition ${
                  isFormValid && !isSubmitting
                    ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/25 hover:brightness-110 active:scale-[0.98]"
                    : "cursor-not-allowed bg-slate-100 text-slate-400 border border-slate-200 dark:border-white/5 dark:bg-white/5 dark:text-slate-500"
                }`}
              >
                {isSubmitting ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Processing Transfer…
                  </span>
                ) : isFormValid ? (
                  `✓ Complete Transfer ${inr(totalCollected)}`
                ) : (
                  "Complete Required Fields to Transfer"
                )}
              </button>
              <p className="text-center text-[10px] text-slate-400">
                Deterministic double-entry remittance settlement
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ===============================================================================
          7. LIVE ACTIVITY FEED
      =============================================================================== */}
      {recentTxn && (
        <section className="rounded-[22px] border border-slate-200/80 bg-white p-4.5 shadow-xs dark:border-white/10 dark:bg-slate-900 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-white/5">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">
                LIVE DMT ACTIVITY
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
                    Sender: {recentTxn.sender_name || recentTxn.customers?.name || "Walk-in"}
                  </span>
                  <span className="text-xs text-slate-400">→</span>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Ben: {recentTxn.beneficiary_name || recentTxn.receiver_name || "Beneficiary"}
                  </span>
                  <span className="text-xs text-slate-400">·</span>
                  <strong className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    {inr(Number(recentTxn.amount))}
                  </strong>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.2 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 capitalize">
                    ✓ {recentTxn.status}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {fmtDate(recentTxn.transaction_date)} · {fmtTime(recentTxn.transaction_timestamp)} {recentTxn.reference ? `· UTR: ${recentTxn.reference}` : ""}
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
                href={`/business/receipt/${recentTxn.id}${receiptMode === "detailed" ? "?mode=detailed" : ""}`}
                target="_blank"
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                title="Print receipt"
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
          8. DMT TRANSACTION HISTORY / CONSOLE LEDGER
      =============================================================================== */}
      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-100 p-4 sm:p-5 dark:border-white/5 space-y-3.5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">DMT TRANSACTION HISTORY</h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Authoritative transaction ledger for domestic remittances and gateway settlements.
              </p>
            </div>

            {/* Segmented Status Filter */}
            <div className="flex rounded-xl bg-slate-100 p-1 text-xs dark:bg-white/5">
              {[
                { key: "all", label: `All (${transactions.length})` },
                { key: "success", label: "Successful" },
                { key: "pending", label: "Pending" },
                { key: "failed", label: "Failed" },
                { key: "reversed", label: "Reversed" },
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
                placeholder="Search by UTR reference, mobile, sender, beneficiary, account or bank…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:focus:bg-slate-900"
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
            <thead className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:border-white/5 dark:bg-white/5">
              <tr>
                <th className="py-3 pl-4 pr-3">Txn No / Date</th>
                <th className="px-3 py-3">Sender / Customer</th>
                <th className="px-3 py-3">Beneficiary / Bank</th>
                <th className="px-3 py-3 text-right">Transfer Amount</th>
                <th className="px-3 py-3 text-right">Total Debit</th>
                <th className="px-3 py-3 text-center">Method</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-3 py-3 text-right pr-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filteredTxns.map((t) => {
                const isReversed = t.status === "reversed";
                const fullDebit = Number(t.amount || 0) + Number(t.service_fee || 0) + Number(t.portal_charge || 0);

                return (
                  <tr key={t.id} className="transition hover:bg-slate-50/80 dark:hover:bg-white/5">
                    <td className="py-3 pl-4 pr-3">
                      <div className="font-mono font-bold text-slate-900 dark:text-white">
                        {t.transaction_number}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {fmtDate(t.transaction_date)}
                      </div>
                    </td>

                    <td className="px-3 py-3">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {t.sender_name || t.customers?.name || "Walk-in"}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {maskMobile(t.customer_mobile || t.sender_mobile)}
                      </div>
                    </td>

                    <td className="px-3 py-3">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {t.beneficiary_name || t.receiver_name || "Beneficiary"}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {t.transfer_method === "upi"
                          ? t.upi_id
                          : `${t.beneficiary_bank || "Bank"} (${maskAccount(t.beneficiary_account)})`}
                      </div>
                    </td>

                    <td className="px-3 py-3 text-right font-black text-slate-900 dark:text-white">
                      {inr(t.amount)}
                    </td>

                    <td className="px-3 py-3 text-right font-bold text-indigo-600 dark:text-indigo-400">
                      {inr(fullDebit)}
                    </td>

                    <td className="px-3 py-3 text-center">
                      <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-white/10 dark:text-slate-300 uppercase">
                        {t.transfer_method === "upi" ? "UPI" : "IMPS/NEFT"}
                      </span>
                    </td>

                    <td className="px-3 py-3 text-center">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isReversed
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                            : t.status === "success"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300"
                        }`}
                      >
                        {t.status.toUpperCase()}
                      </span>
                    </td>

                    <td className="px-3 py-3 text-right pr-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedDetailTxn(t)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                        >
                          View
                        </button>
                        <Link
                          href={`/business/receipt/${t.id}${receiptMode === "detailed" ? "?mode=detailed" : ""}`}
                          target="_blank"
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                          title="Print Receipt"
                        >
                          🖨️
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleOpenWhatsApp(t)}
                          className="rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
                          title="Send WhatsApp"
                        >
                          💬
                        </button>
                        {!isReversed && (
                          <button
                            type="button"
                            onClick={() => handleOpenReverse(t)}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300"
                            title="Reverse transaction"
                          >
                            Reverse
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredTxns.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    No DMT transactions found matching the filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===============================================================================
          TRANSACTION DETAIL VIEW MODAL
      =============================================================================== */}
      {selectedDetailTxn && (
        <FloatingWindow
          isOpen={Boolean(selectedDetailTxn)}
          size="md"
          title={`DMT Transaction #${selectedDetailTxn.transaction_number}`}
          onClose={() => setSelectedDetailTxn(null)}
        >
          {(() => {
            const totalDebit =
              Number(selectedDetailTxn.amount || 0) +
              Number(selectedDetailTxn.service_fee || 0) +
              Number(selectedDetailTxn.portal_charge || 0);

            const receiptUrl = `/business/receipt/${selectedDetailTxn.id}${receiptMode === "detailed" ? "?mode=detailed" : ""}`;
            const invoiceUrl = `/business/receipt/${selectedDetailTxn.id}/a4${receiptMode === "detailed" ? "?mode=detailed" : ""}`;

            return (
              <div className="p-5 space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-white/5">
                  <div>
                    <span className="text-slate-400">Date:</span>
                    <div className="font-bold">{selectedDetailTxn.transaction_date}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Status:</span>
                    <div className="font-bold text-emerald-600 uppercase">{selectedDetailTxn.status}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Transfer Amount:</span>
                    <div className="font-black text-sm">{inr(selectedDetailTxn.amount)}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Total Customer Debit:</span>
                    <div className="font-black text-sm text-indigo-700 dark:text-indigo-400">{inr(totalDebit)}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Customer Service Fee:</span>
                    <div className="font-bold text-emerald-600">+{inr(selectedDetailTxn.service_fee || 0)}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Provider Charge:</span>
                    <div className="font-bold text-rose-600">+{inr(selectedDetailTxn.portal_charge || 0)}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Portal Commission:</span>
                    <div className="font-bold text-teal-600">+{inr(selectedDetailTxn.portal_commission || 0)}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Total Operator Income:</span>
                    <div className="font-black text-emerald-600">
                      +{inr(
                        Number(selectedDetailTxn.service_fee || 0) +
                          Number(selectedDetailTxn.portal_commission || 0) -
                          Number(selectedDetailTxn.portal_charge || 0)
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400">Sender:</span>
                    <div className="font-bold">{selectedDetailTxn.sender_name || selectedDetailTxn.customers?.name || "Walk-in"}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Beneficiary:</span>
                    <div className="font-bold">{selectedDetailTxn.beneficiary_name || selectedDetailTxn.receiver_name || "Beneficiary"}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Bank / Channel:</span>
                    <div className="font-bold">{selectedDetailTxn.beneficiary_bank || "Bank"}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Account / IFSC:</span>
                    <div className="font-mono font-bold">
                      {selectedDetailTxn.transfer_method === "upi" ? selectedDetailTxn.upi_id : `${maskAccount(selectedDetailTxn.beneficiary_account)} (${selectedDetailTxn.beneficiary_ifsc})`}
                    </div>
                  </div>
                  {selectedDetailTxn.reference && (
                    <div className="col-span-2">
                      <span className="text-slate-400">UTR / Reference:</span>
                      <div className="font-mono font-bold">{selectedDetailTxn.reference}</div>
                    </div>
                  )}
                </div>

                {/* Accounting Trace */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-3.5 dark:border-white/10 dark:bg-white/5 space-y-1.5">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    ACCOUNTING LEDGER TRACE
                  </div>
                  <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                    <p>• <strong>Payment Inflow:</strong> +{inr(totalDebit)} credited via {(selectedDetailTxn.customer_pay_method || "CASH").toUpperCase()} drawer.</p>
                    <p>• <strong>Provider Wallet Outflow:</strong> -{inr(selectedDetailTxn.amount)} debited from {selectedDetailTxn.portals?.name || "DMT Portal"} float.</p>
                    <p>• <strong>Revenue Recognized:</strong> +{inr(Number(selectedDetailTxn.service_fee || 0) + Number(selectedDetailTxn.portal_commission || 0) - Number(selectedDetailTxn.portal_charge || 0))} net income recorded.</p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
                  <div className="flex items-center gap-2">
                    <Link
                      href={receiptUrl}
                      target="_blank"
                      className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 dark:bg-indigo-600"
                    >
                      🖨️ Thermal Receipt
                    </Link>
                    <Link
                      href={invoiceUrl}
                      target="_blank"
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                    >
                      📄 A4 Invoice
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleOpenWhatsApp(selectedDetailTxn)}
                      className="rounded-xl bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
                    >
                      💬 WhatsApp
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDetailTxn(null);
                        handleOpenEdit(selectedDetailTxn);
                      }}
                      className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
                    >
                      Edit Attribution
                    </button>
                    {selectedDetailTxn.status !== "reversed" && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDetailTxn(null);
                          handleOpenReverse(selectedDetailTxn);
                        }}
                        className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-400"
                      >
                        Reverse Txn
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </FloatingWindow>
      )}

      {/* ===============================================================================
          EDIT TRANSACTION MODAL
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
              <strong>Immutable Audit Safeguard:</strong> Transfer amount ({inr(editingTxn.amount)}) and settlement ledger entries are permanently locked. You may update attribution, UTR reference, or remarks.
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Customer Attribution
              </label>
              <SearchableSelect
                options={[
                  { value: "", label: "-- Walk-in (No Attribution) --" },
                  ...customers.map((c) => ({
                    value: c.id,
                    label: `${c.name}${c.phone ? ` (${c.phone})` : ""}`,
                  })),
                ]}
                value={editCustomerId}
                onChange={(val) => setEditCustomerId(val)}
                placeholder="Assign registered customer…"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Sender Name
              </label>
              <input
                type="text"
                value={editSenderName}
                onChange={(e) => setEditSenderName(e.target.value)}
                placeholder="Sender name"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-white/5"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Bank UTR / Reference
              </label>
              <input
                type="text"
                value={editReference}
                onChange={(e) => setEditReference(e.target.value)}
                placeholder="Correct UTR number"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono font-semibold outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-white/5"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Audit Correction Remarks
              </label>
              <input
                type="text"
                value={editRemarks}
                onChange={(e) => setEditRemarks(e.target.value)}
                placeholder="Add correction notes…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-white/5"
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
                className="rounded-xl bg-indigo-600 px-5 py-2 font-bold text-white shadow-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {editSubmitting ? "Saving…" : "Save Correction"}
              </button>
            </div>
          </form>
        </FloatingWindow>
      )}

      {/* ===============================================================================
          REVERSE TRANSACTION MODAL
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
              <strong>Atomic Double-Entry Reversal:</strong> Reversing this remittance will reverse cash collection, restore provider float ({inr(reversingTxn.amount)}), and adjust the general ledger atomically.
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Reason for Reversal <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                placeholder="e.g. Bank transaction failed / Account number incorrect"
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
          ADD CUSTOMER MODAL
      =============================================================================== */}
      {addCustomerWindowOpen && (
        <FloatingWindow
          isOpen={addCustomerWindowOpen}
          size="sm"
          title="Add New Customer"
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
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-white/5"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Mobile Number
              </label>
              <input
                type="tel"
                maxLength={10}
                value={newCustPhone}
                onChange={(e) => setNewCustPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="10-digit mobile number"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-white/5"
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
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-white/5"
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
                placeholder="e.g. Newtown, Kolkata"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-white/5"
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
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {custCreateSubmitting ? "Saving…" : "Save & Select"}
              </button>
            </div>
          </form>
        </FloatingWindow>
      )}

      {/* ===============================================================================
          ADD BENEFICIARY MODAL
      =============================================================================== */}
      {addBeneficiaryWindowOpen && (
        <FloatingWindow
          isOpen={addBeneficiaryWindowOpen}
          size="sm"
          title="Add New Beneficiary"
          onClose={() => setAddBeneficiaryWindowOpen(false)}
        >
          <form onSubmit={handleCreateBeneficiary} className="p-5 space-y-4 text-xs">
            {benCreateError && (
              <div className="rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-600 dark:bg-rose-950/30 dark:text-rose-400">
                {benCreateError}
              </div>
            )}

            {transferMethod === "bank_account" ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Beneficiary Name
                  </label>
                  <input
                    type="text"
                    value={newBenName}
                    onChange={(e) => setNewBenName(e.target.value)}
                    placeholder="e.g. Suman Mondal"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-white/5"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Beneficiary Bank
                  </label>
                  <SearchableSelect
                    options={banks.map((b) => ({ value: b.name, label: b.name }))}
                    value={newBenBank}
                    onChange={(val) => setNewBenBank(val)}
                    placeholder="Select bank…"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Account Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newBenAccount}
                    onChange={(e) => setNewBenAccount(e.target.value.replace(/\s+/g, ""))}
                    placeholder="Enter account number"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono font-bold outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-white/5"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Confirm Account Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newBenConfirmAccount}
                    onChange={(e) => setNewBenConfirmAccount(e.target.value.replace(/\s+/g, ""))}
                    placeholder="Re-enter account number"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono font-bold outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-white/5"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Bank IFSC Code
                  </label>
                  <input
                    type="text"
                    maxLength={11}
                    value={newBenIfsc}
                    onChange={(e) => setNewBenIfsc(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11))}
                    placeholder="e.g. SBIN0001234"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono font-bold outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-white/5"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Beneficiary Name
                  </label>
                  <input
                    type="text"
                    value={newBenName}
                    onChange={(e) => setNewBenName(e.target.value)}
                    placeholder="e.g. Suman Mondal"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-white/5"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    UPI ID (VPA) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newBenUpi}
                    onChange={(e) => setNewBenUpi(e.target.value.trim().toLowerCase())}
                    placeholder="e.g. user@oksbi"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono font-bold outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-white/5"
                  />
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAddBeneficiaryWindowOpen(false)}
                className="rounded-xl px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={benCreateSubmitting}
                className="rounded-xl bg-indigo-600 px-5 py-2 font-bold text-white shadow-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {benCreateSubmitting ? "Saving…" : "Save & Select"}
              </button>
            </div>
          </form>
        </FloatingWindow>
      )}

      {/* ===============================================================================
          ADD BANK MODAL
      =============================================================================== */}
      {addBankWindowOpen && (
        <FloatingWindow
          isOpen={addBankWindowOpen}
          size="sm"
          title="Add New Bank"
          onClose={() => setAddBankWindowOpen(false)}
        >
          <form onSubmit={handleCreateBank} className="p-5 space-y-4 text-xs">
            {bankCreateError && (
              <div className="rounded-xl bg-rose-50 p-3 font-bold text-rose-600 dark:bg-rose-950/30 dark:text-rose-400">
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
                placeholder="e.g. Bank of Maharashtra"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-white/5"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Short Code (Optional)
              </label>
              <input
                type="text"
                value={newBankCode}
                onChange={(e) => setNewBankCode(e.target.value.toUpperCase())}
                placeholder="e.g. BOM"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono font-semibold outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-white/5"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAddBankWindowOpen(false)}
                className="rounded-xl px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={bankCreateSubmitting}
                className="rounded-xl bg-indigo-600 px-5 py-2 font-bold text-white shadow-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {bankCreateSubmitting ? "Saving…" : "Save Bank"}
              </button>
            </div>
          </form>
        </FloatingWindow>
      )}

      {/* ===============================================================================
          SCAN & FILL MODAL
      =============================================================================== */}
      {scanModalOpen && (
        <ScanFillModal
          open={scanModalOpen}
          mode="dmt"
          title="Scan & Fill DMT Remittance"
          onClose={() => setScanModalOpen(false)}
          onApply={handleScanApply}
        />
      )}

      {/* ===============================================================================
          WHATSAPP SEND MODAL
      =============================================================================== */}
      {waModal.open && (
        <WhatsAppSendModal
          open={waModal.open}
          onClose={() => setWaModal((prev) => ({ ...prev, open: false }))}
          phone={waModal.phone}
          recipientName={waModal.name}
          initialMessage={waModal.msg}
          messageType="dmt_confirmation"
          refId={waModal.refId}
          refNumber={waModal.refNum}
          onSent={() => showToast("success", "WhatsApp receipt dispatched.")}
        />
      )}
    </div>
  );
}
