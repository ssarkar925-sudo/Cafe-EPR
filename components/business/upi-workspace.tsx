"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/lib/supabase/realtime";
import { inr } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import Modal from "@/components/ui/modal";
import SearchableSelect from "@/components/ui/searchable-select";
import CustomerSearchSelect, { type CustomerSearchResult } from "@/components/customers/customer-search-select";
import { createCustomerRecord, DuplicateCustomerError } from "@/lib/customers";
import ScanFillModal from "@/components/scan-fill/scan-fill-modal";
import type { ScanFields } from "@/lib/scan/extract";
import type { CustomerRow, Master, Txn } from "./business-client";
import ReasonModal from "./business-reason-modal";
import { useToast } from "@/components/ui/use-toast";
import { downloadCsv } from "@/components/ui/csv";
import { getWhatsAppConfig, renderWhatsAppTemplate, DEFAULT_WA_TEMPLATES } from "@/lib/whatsapp";
import WhatsAppSendModal from "@/components/whatsapp/whatsapp-send-modal";
import UpiQrCode from "@/components/ui/upi-qr-code";

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

export default function UpiWorkspace({
  initialTransactions,
  initialCustomers,
  initialQrs = [],
  paymentInstruments = [],
  float,
}: {
  initialTransactions: Txn[];
  initialCustomers: CustomerRow[];
  initialQrs?: Master[];
  paymentInstruments?: any[];
  float: any;
}) {
  const supabase = createClient();
  const { showToast, toastView } = useToast();
  const terminalFormRef = useRef<HTMLDivElement>(null);

  useRealtime(["transactions", "upi_merchant_qrs", "customers", "cash_entries", "payment_instruments", "settlements"]);

  const [transactions, setTransactions] = useState<Txn[]>(initialTransactions);
  const [customers, setCustomers] = useState<CustomerRow[]>(initialCustomers);
  const [qrs, setQrs] = useState<Master[]>(initialQrs);
  const [liveInstruments, setLiveInstruments] = useState<any[]>(paymentInstruments);
  const [livePool, setLivePool] = useState<any>(float);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>(() =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // Modals & UI Lifecycle
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [detailTxn, setDetailTxn] = useState<Txn | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Txn | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [isVoiding, setIsVoiding] = useState(false);
  const [successTxn, setSuccessTxn] = useState<Txn | null>(null);

  // Add Customer Modal
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustEmail, setNewCustEmail] = useState("");
  const [newCustAddress, setNewCustAddress] = useState("");
  const [custCreateError, setCustCreateError] = useState("");
  const [custCreateSubmitting, setCustCreateSubmitting] = useState(false);

  // WhatsApp Modal State
  const [waModal, setWaModal] = useState<{ open: boolean; phone: string; name: string; msg: string; refNum: string; refId: string }>({
    open: false,
    phone: "",
    name: "",
    msg: "",
    refNum: "",
    refId: "",
  });

  // Form State for Terminal / Record Cash Out
  const [formAmount, setFormAmount] = useState<string>("");
  const [formFee, setFormFee] = useState<string>("0");
  const [formCustomerId, setFormCustomerId] = useState<string>("");
  const [formCustomerMobile, setFormCustomerMobile] = useState<string>("");
  const [formReference, setFormReference] = useState<string>("");
  const [formRemarks, setFormRemarks] = useState<string>("");
  const [selectedQrId, setSelectedQrId] = useState<string>(initialQrs[0]?.id || "");
  const [formFeeSource, setFormFeeSource] = useState<"cut_from_withdrawal" | "customer_paid_extra">("cut_from_withdrawal");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit UPI Transaction Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTxn, setEditingTxn] = useState<Txn | null>(null);
  const [editAmount, setEditAmount] = useState<string>("");
  const [editFee, setEditFee] = useState<string>("0");
  const [editFeeSource, setEditFeeSource] = useState<"cut_from_withdrawal" | "customer_paid_extra">("cut_from_withdrawal");
  const [editQrId, setEditQrId] = useState<string>("");
  const [editCustomerId, setEditCustomerId] = useState<string>("");
  const [editCustomerMobile, setEditCustomerMobile] = useState<string>("");
  const [editReference, setEditReference] = useState<string>("");
  const [editRemarks, setEditRemarks] = useState<string>("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Active Merchant QR object
  const activeQr = useMemo(() => {
    if (selectedQrId) {
      const found = qrs.find((q) => q.id === selectedQrId);
      if (found) return found;
    }
    return qrs[0] || null;
  }, [qrs, selectedQrId]);

  // When customer changes, auto-fill phone
  useEffect(() => {
    if (!formCustomerId) return;
    const c = customers.find((x) => x.id === formCustomerId);
    if (c?.phone) setFormCustomerMobile(c.phone);
  }, [formCustomerId, customers]);

  // Canonical directory: server-side search only. `customers` is a bounded
  // cache (seeded rows + selections + creations), never a full preload.
  const formCustomerRecord = useMemo(() => {
    const c = customers.find((x) => x.id === formCustomerId);
    return c ? { id: c.id, code: (c as any).code ?? null, name: c.name, phone: c.phone ?? null, is_active: true } : null;
  }, [customers, formCustomerId]);

  function rememberCustomerRecord(record: CustomerSearchResult) {
    setCustomers((prev) =>
      prev.some((x) => x.id === record.id)
        ? prev.map((x) => (x.id === record.id ? { ...x, name: record.name ?? x.name, phone: record.phone ?? x.phone } : x))
        : [...prev, { id: record.id, name: record.name ?? "Customer", code: record.code ?? "", phone: record.phone } as CustomerRow].sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  function handleFormCustomerSelect(id: string | null, record: CustomerSearchResult | null) {
    setFormCustomerId(id ?? "");
    if (record) {
      rememberCustomerRecord(record);
      if (record.phone) setFormCustomerMobile(record.phone);
    }
  }

  const customerFilterRecord = useMemo(() => {
    const c = customers.find((x) => x.id === customerFilter);
    return c ? { id: c.id, code: (c as any).code ?? null, name: c.name, phone: c.phone ?? null, is_active: true } : null;
  }, [customers, customerFilter]);

  function handleCustomerFilterSelect(id: string | null, record: CustomerSearchResult | null) {
    setCustomerFilter(id ?? "");
    if (record) rememberCustomerRecord(record);
  }

  const editCustomerRecord = useMemo(() => {
    const c = customers.find((x) => x.id === editCustomerId);
    return c ? { id: c.id, code: (c as any).code ?? null, name: c.name, phone: c.phone ?? null, is_active: true } : null;
  }, [customers, editCustomerId]);

  function handleEditCustomerSelect(id: string | null, record: CustomerSearchResult | null) {
    setEditCustomerId(id ?? "");
    if (record) {
      rememberCustomerRecord(record);
      if (record.phone) setEditCustomerMobile(record.phone);
    }
  }

  function selectExistingCustomer(dup: { id: string; name: string; phone?: string | null }, phoneFallback: string) {
    rememberCustomerRecord({ id: dup.id, code: null, name: dup.name, phone: dup.phone ?? phoneFallback, is_active: true });
    setFormCustomerId(dup.id);
    setFormCustomerMobile(dup.phone ?? phoneFallback);
    setCustCreateError(`Customer already exists: ${dup.name} (${dup.phone ?? phoneFallback}). Selected the existing profile — no duplicate created.`);
  }

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [{ data: txns }, { data: poolData }, { data: insts }, { data: merchantQrs }] = await Promise.all([
        supabase
          .from("transactions")
          .select("*, customers(name, phone), merchant_qrs:upi_merchant_qrs(display_name, upi_id), profiles(full_name)")
          .eq("service_type", "upi")
          .order("transaction_timestamp", { ascending: false, nullsFirst: false })
          .order("transaction_date", { ascending: false })
          .limit(500),
        supabase.rpc("get_pool_balances"),
        supabase.from("payment_instruments").select("*").order("name"),
        supabase.from("upi_merchant_qrs").select("*").order("display_name"),
      ]);

      if (txns) setTransactions(txns as any);
      if (poolData) setLivePool((poolData as any)?.upi_qr ?? null);
      if (insts) setLiveInstruments(insts);
      if (merchantQrs) setQrs(merchantQrs);

      setLastRefreshedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch (err) {
      console.error("UPI refresh error:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [supabase]);

  // Realtime balance calculations (Safe fallback to 0)
  const upiCurrentBalance = useMemo(() => {
    if (!livePool) return 0;
    return Number(livePool.current ?? (Number(livePool.opening || 0) + Number(livePool.movements || 0)));
  }, [livePool]);

  // Calculations for current form values
  const numFormAmt = parseFloat(formAmount) || 0;
  const numFormFee = parseFloat(formFee) || 0;
  const cashHanded = formFeeSource === "customer_paid_extra" ? numFormAmt : Math.max(0, numFormAmt - numFormFee);
  const upiAmountToCollect = formFeeSource === "customer_paid_extra" ? numFormAmt + numFormFee : numFormAmt;

  // Validation rules
  const isFormValid = useMemo(() => {
    if (numFormAmt <= 0) return false;
    if (numFormFee < 0) return false;
    if (!activeQr?.id) return false;
    return true;
  }, [numFormAmt, numFormFee, activeQr]);

  // Filtered transactions
  const filteredTxns = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return transactions.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (customerFilter && t.customer_id !== customerFilter) return false;
      if (dateFrom && t.transaction_date < dateFrom) return false;
      if (dateTo && t.transaction_date > dateTo) return false;

      if (q) {
        const num = (t.transaction_number || "").toLowerCase();
        const ref = (t.reference || "").toLowerCase();
        const custName = (t.customers?.name || "").toLowerCase();
        const custMobile = (t.customer_mobile || t.customers?.phone || "").toLowerCase();
        const rem = (t.remarks || "").toLowerCase();
        if (!num.includes(q) && !ref.includes(q) && !custName.includes(q) && !custMobile.includes(q) && !rem.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [transactions, searchQuery, statusFilter, customerFilter, dateFrom, dateTo]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let totalCredits = 0;
    let totalCashOut = 0;
    let totalFees = 0;
    let successCount = 0;

    for (const t of filteredTxns) {
      if (t.status === "success") {
        successCount++;
        const amt = Number(t.amount) || 0;
        const fee = Number(t.service_fee) || Number((t as any).upi_fee) || 0;
        totalCredits += amt;
        totalFees += fee;

        const recordedCashOut = Number((t as any).cash_out) || 0;
        if (recordedCashOut > 0) {
          totalCashOut += recordedCashOut;
        } else if (t.fee_source === "customer_paid_extra") {
          totalCashOut += amt;
        } else {
          totalCashOut += Math.max(0, amt - fee);
        }
      }
    }

    return {
      count: filteredTxns.length,
      successCount,
      totalCredits,
      totalCashOut,
      totalFees,
      netIncome: totalFees,
      variance: 0,
    };
  }, [filteredTxns]);

  // Reset form completely for clean new cash out
  const handleNewCashOut = useCallback(() => {
    setFormAmount("");
    setFormFee("0");
    setFormCustomerId("");
    setFormCustomerMobile("");
    setFormReference("");
    setFormRemarks("");
    setFormFeeSource("cut_from_withdrawal");
    setSuccessTxn(null);
    terminalFormRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Open modal workflow (Preserved for compatibility and quick shortcuts)
  const openCreateModal = () => {
    setFormAmount("");
    setFormFee("0");
    setFormCustomerId("");
    setFormCustomerMobile("");
    setFormReference("");
    setFormRemarks("");
    setFormFeeSource("cut_from_withdrawal");
    setCreateModalOpen(true);
  };

  // Scan & Fill extraction handler
  const handleScanApply = (fields: ScanFields) => {
    if (fields.amount) setFormAmount(fields.amount);
    if (fields.reference) setFormReference(fields.reference);
    const rawMobile = fields.customer_mobile || fields.sender_mobile || "";
    if (rawMobile) setFormCustomerMobile(rawMobile.replace(/\D/g, "").slice(-10));
    setScanModalOpen(false);
    showToast("success", "Extracted details applied to UPI terminal.");
  };

  // Add new customer handler
  const handleCreateCustomer = async (e: React.FormEvent) => {
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
      // Canonical creation: the database assigns the Customer ID (code).
      // Duplicate phones resolve to the existing profile, never a 2nd row.
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
        description: `Created customer "${name}" from UPI terminal`,
      });

      setCustomers((prev) => [...prev, newCust as CustomerRow].sort((a, b) => a.name.localeCompare(b.name)));
      setFormCustomerId(newCust.id);
      if (phone) setFormCustomerMobile(phone);
      setAddCustomerOpen(false);
      setNewCustName("");
      setNewCustPhone("");
      setNewCustEmail("");
      setNewCustAddress("");
      showToast("success", `Customer "${name}" created and assigned.`);
    } catch (err: any) {
      console.error("Customer creation error:", err);
      if (err instanceof DuplicateCustomerError) {
        selectExistingCustomer(err.existing, phone);
        return;
      }
      setCustCreateError(err.message || "Failed to create customer.");
    } finally {
      setCustCreateSubmitting(false);
    }
  };

  // Submit UPI Cash Out (Execution)
  const handleRecordCashOut = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) {
      showToast("error", "Please enter a valid amount greater than ₹0.");
      return;
    }
    const fee = parseFloat(formFee) || 0;
    if (fee < 0) {
      showToast("error", "Service fee cannot be negative.");
      return;
    }

    const qrToUse = selectedQrId || qrs[0]?.id || "";
    if (!qrToUse) {
      showToast("error", "Please configure or select a Merchant QR.");
      return;
    }

    setIsSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const today = nowIso.slice(0, 10);

      const rpcPayload = {
        p_service_type: "upi",
        p_transaction_date: today,
        p_transaction_timestamp: nowIso,
        p_customer_id: formCustomerId || null,
        p_customer_mobile: formCustomerMobile.trim() || null,
        p_reference: formReference.trim() || null,
        p_remarks: formRemarks.trim() || null,
        p_status: "success",
        p_bank_id: null,
        p_portal_id: null,
        p_merchant_qr_id: qrToUse,
        p_aadhaar_last4: null,
        p_transfer_method: null,
        p_sender_name: null,
        p_sender_mobile: null,
        p_beneficiary_name: null,
        p_beneficiary_mobile: null,
        p_beneficiary_bank: null,
        p_beneficiary_ifsc: null,
        p_beneficiary_account: null,
        p_upi_id: null,
        p_receiver_name: null,
        p_amount: amt,
        p_service_fee: fee,
        p_portal_commission: 0,
        p_fee_source: formFeeSource,
        p_paid_from: null,
        p_customer_pay_method: "cash",
        p_pay_from_instrument_id: qrs.find((q) => q.id === qrToUse)?.payment_instrument_id || null,
        p_pay_from_method: liveInstruments.find((i) => i.id === (qrs.find((q) => q.id === qrToUse)?.payment_instrument_id || ""))?.type || "upi_qr",
        p_portal_charge: 0,
      };

      let res = await supabase.rpc("create_business_txn", rpcPayload);
      if (res.error && (res.error.message?.includes("p_portal_charge") || res.error.message?.includes("schema cache"))) {
        const fallback: Record<string, any> = { ...rpcPayload };
        delete fallback.p_portal_charge;
        res = await supabase.rpc("create_business_txn", fallback);
      }
      if (res.error) {
        showToast("error", res.error.message);
        return;
      }

      const d = res.data as any;
      const netCashHandout = formFeeSource === "customer_paid_extra" ? amt : Math.max(0, amt - fee);

      // Synchronize Cashbook Entries (Guard against duplicate inserts)
      const { data: existingLegs } = await supabase
        .from("cash_entries")
        .select("id")
        .eq("ref_type", "transaction")
        .eq("ref_id", d.id);

      if (!existingLegs || existingLegs.length === 0) {
        const defaultCash = liveInstruments.find((i) => i.type === "cash" && i.is_active) || liveInstruments.find((i) => i.type === "cash");
        const selectedQr = qrs.find((q) => q.id === qrToUse);
        const defaultUpi = (selectedQr?.payment_instrument_id
          ? liveInstruments.find((i) => i.id === selectedQr.payment_instrument_id)
          : null) ||
          liveInstruments.find((i) => (i.type === "upi" || i.type === "upi_qr") && i.is_active) ||
          liveInstruments.find((i) => i.type === "upi" || i.type === "upi_qr");

        // Inflow into UPI Pool
        await supabase.from("cash_entries").insert({
          entry_date: today,
          method: "upi",
          direction: "in",
          amount: amt,
          description: `UPI ${d.transaction_number} received via QR`,
          ref_type: "transaction",
          ref_id: d.id,
          instrument_id: defaultUpi?.id || null,
        });

        // Outflow from Cash Till
        await supabase.from("cash_entries").insert({
          entry_date: today,
          method: "cash",
          direction: "out",
          amount: netCashHandout,
          description: `UPI ${d.transaction_number} cash payout`,
          ref_type: "transaction",
          ref_id: d.id,
          instrument_id: defaultCash?.id || null,
        });
      }

      logAudit({
        action: "create",
        entity: "transaction",
        entity_id: d.id,
        description: `Recorded UPI Cash Out ${d.transaction_number}: ${inr(amt)} with fee ${inr(fee)}`,
      });

      const completedRecord: Txn = {
        id: d.id,
        transaction_number: d.transaction_number,
        service_type: "upi",
        direction: "out",
        transaction_date: today,
        transaction_timestamp: nowIso,
        customer_id: formCustomerId || null,
        customer_mobile: formCustomerMobile.trim() || null,
        reference: formReference.trim() || null,
        remarks: formRemarks.trim() || null,
        status: "success",
        bank_id: null,
        portal_id: null,
        merchant_qr_id: qrToUse,
        provider_id: null,
        aadhaar_last4: null,
        transfer_method: null,
        sender_name: null,
        sender_mobile: null,
        beneficiary_name: null,
        beneficiary_mobile: null,
        beneficiary_bank: null,
        beneficiary_ifsc: null,
        beneficiary_account: null,
        upi_id: null,
        amount: amt,
        service_fee: fee,
        portal_commission: 0,
        fee_source: formFeeSource,
        paid_from: null,
        customer_pay_method: "cash",
        customers: customers.find((c) => c.id === formCustomerId) || null,
        banks: null,
        portals: null,
        providers: null,
        merchant_qrs: (qrs.find((q) => q.id === qrToUse) as any) || null,
        profiles: null,
      };

      setSuccessTxn(completedRecord);
      showToast("success", `✓ UPI Cash Out recorded — #${d.transaction_number}. Hand cash: ${inr(netCashHandout)}`);
      setCreateModalOpen(false);

      // Clean inputs
      setFormAmount("");
      setFormFee("0");
      setFormCustomerId("");
      setFormCustomerMobile("");
      setFormReference("");
      setFormRemarks("");

      await refreshData();
    } catch (err: any) {
      console.error("Submission error:", err);
      showToast("error", err.message || "Failed to record cash out.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // WhatsApp receipt modal trigger
  const handleOpenWhatsApp = (t: Txn) => {
    const rawPhone = t.customer_mobile || t.customers?.phone || "";
    const appUrl = typeof window !== "undefined" ? window.location.origin : "";
    const receiptUrl = `${appUrl}/receipt/business/${t.id}`;
    const cfg = getWhatsAppConfig();
    const template = cfg.templates?.banking_txn || DEFAULT_WA_TEMPLATES.banking_txn || "UPI Transaction: {amount} received. Ref: {txn_id}";

    const msg = renderWhatsAppTemplate(template, {
      shop_name: "SC Communications",
      service_name: "UPI Cash Out",
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

  // Handle Open Edit Modal
  const handleOpenEdit = (t: Txn) => {
    setEditingTxn(t);
    setEditAmount(String(t.amount ?? ""));
    setEditFee(String(t.service_fee ?? "0"));
    setEditFeeSource((t.fee_source as any) || "cut_from_withdrawal");
    setEditQrId(t.merchant_qr_id || qrs[0]?.id || "");
    setEditCustomerId(t.customer_id || "");
    setEditCustomerMobile(t.customer_mobile || t.customers?.phone || "");
    setEditReference(t.reference || "");
    setEditRemarks(t.remarks || "");
    setEditModalOpen(true);
  };

  // Handle Save Edit via atomic update_business_txn RPC
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTxn) return;

    const numAmt = parseFloat(editAmount);
    if (isNaN(numAmt) || numAmt <= 0) {
      showToast("error", "Please enter a valid amount greater than ₹0.");
      return;
    }
    const numFee = parseFloat(editFee) || 0;
    if (numFee < 0) {
      showToast("error", "Service fee cannot be negative.");
      return;
    }

    setEditSubmitting(true);
    try {
      const res = await supabase.rpc("update_business_txn", {
        p_txn_id: editingTxn.id,
        p_transaction_date: editingTxn.transaction_date,
        p_transaction_timestamp: editingTxn.transaction_timestamp || new Date().toISOString(),
        p_customer_id: editCustomerId || null,
        p_customer_mobile: editCustomerMobile.trim() || null,
        p_reference: editReference.trim() || null,
        p_remarks: editRemarks.trim() || null,
        p_bank_id: null,
        p_portal_id: null,
        p_merchant_qr_id: editQrId || null,
        p_aadhaar_last4: null,
        p_transfer_method: "upi",
        p_sender_name: null,
        p_sender_mobile: null,
        p_beneficiary_name: null,
        p_beneficiary_mobile: null,
        p_beneficiary_bank: null,
        p_beneficiary_ifsc: null,
        p_beneficiary_account: null,
        p_upi_id: null,
        p_amount: numAmt,
        p_service_fee: numFee,
        p_portal_commission: 0,
        p_fee_source: editFeeSource,
        p_paid_from: null,
        p_customer_pay_method: "qr",
        p_pay_from_instrument_id: null,
        p_pay_from_method: "upi_qr",
        p_receiver_name: null,
      });

      if (res.error) throw res.error;

      // Re-fetch updated row with relations
      const { data: updatedTxn } = await supabase
        .from("transactions")
        .select("*, customers(name, phone), merchant_qrs:upi_merchant_qrs(display_name, upi_id), profiles(full_name)")
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
                  amount: numAmt,
                  service_fee: numFee,
                  fee_source: editFeeSource,
                  merchant_qr_id: editQrId || null,
                  customer_id: editCustomerId || null,
                  customer_mobile: editCustomerMobile.trim() || null,
                  reference: editReference.trim() || null,
                  remarks: editRemarks.trim() || null,
                  customers: customers.find((c) => c.id === editCustomerId) || t.customers,
                  merchant_qrs: qrs.find((q) => q.id === editQrId) || (t as any).merchant_qrs,
                }
              : t
          )
        );
      }

      // Refresh pool balances
      const { data: pools } = await supabase.rpc("get_pool_balances");
      if (pools) setLivePool((pools as any)?.upi_qr ?? null);

      setEditModalOpen(false);
      setEditingTxn(null);
      showToast("success", `✓ UPI Transaction #${editingTxn.transaction_number} reconciled and updated!`);
    } catch (err: any) {
      console.error("UPI edit error:", err);
      showToast("error", err.message || "Failed to update UPI transaction.");
    } finally {
      setEditSubmitting(false);
    }
  };

  // Void / Reversal handler
  const handleConfirmVoid = async () => {
    if (!deleteTarget) return;
    setIsVoiding(true);
    try {
      const res = await supabase.rpc("reverse_business_txn", {
        p_txn_id: deleteTarget.id,
        p_reason: voidReason.trim() || "Operational reversal from UPI console",
      });

      if (res.error) throw res.error;

      setTransactions((prev) =>
        prev.map((t) => (t.id === deleteTarget.id ? { ...t, status: "failed", remarks: `Voided: ${voidReason}` } : t))
      );
      setDeleteTarget(null);
      setVoidReason("");
      showToast("success", `Transaction #${deleteTarget.transaction_number} voided & ledger reversed.`);
      await refreshData();
    } catch (err: any) {
      console.error("Void error:", err);
      showToast("error", err.message || "Failed to void transaction.");
    } finally {
      setIsVoiding(false);
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    const filename = `UPI_Collections_${new Date().toISOString().slice(0, 10)}.csv`;
    const headers = ["Transaction ID", "Date", "Customer", "Mobile", "UPI Amount", "Service Fee", "Cash Handed", "Status", "Reference", "Remarks"];
    const rows = filteredTxns.map((t) => [
      t.transaction_number,
      t.transaction_date,
      t.customers?.name || "Walk-in Customer",
      t.customer_mobile || t.customers?.phone || "",
      Number(t.amount),
      Number(t.service_fee || 0),
      Number((t as any).cash_out) > 0
        ? Number((t as any).cash_out)
        : Number(t.fee_source === "customer_paid_extra" ? t.amount : Math.max(0, Number(t.amount) - Number(t.service_fee || 0))),
      t.status,
      t.reference || "",
      t.remarks || "",
    ]);
    downloadCsv(filename, headers, rows);
    showToast("success", "Exported UPI transactions.");
  };

  const recentTxn = transactions[0] || null;

  return (
    <div className="space-y-5 pb-16">
      {/* Toast Notification View */}
      {toastView}

      {/* ========================================================================= */}
      {/* 1. EXECUTIVE HERO HEADER: UPI Collections */}
      {/* ========================================================================= */}
      <section className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-5 text-white shadow-xl ring-1 ring-white/10 sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-0.5 text-xs font-bold text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                ● LIVE UPI RAIL ONLINE
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-slate-300">
                DYNAMIC QR TERMINAL ACTIVE
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl text-white">
              UPI Collections &amp; Cash Out
            </h1>
            <p className="text-xs text-indigo-200/80 sm:text-sm">
              Instant customer cash withdrawal, live dynamic QR generator and double-entry till settlement.
            </p>
          </div>

          {/* Available Float Display Card */}
          <div className="flex flex-wrap items-center gap-2.5 sm:flex-nowrap">
            <button
              type="button"
              onClick={refreshData}
              disabled={isRefreshing}
              className="rounded-2xl border border-white/10 bg-white/5 p-3.5 text-slate-300 backdrop-blur-md hover:bg-white/15 hover:text-white transition active:scale-95 disabled:opacity-50 shadow-inner"
              title="Refresh Live Balances from Database"
            >
              <span className={`inline-block text-base ${isRefreshing ? "animate-spin text-cyan-400" : ""}`}>↻</span>
            </button>
            <div className="card-glow-cyan flex flex-col items-end rounded-2xl border border-white/10 bg-white/10 p-3.5 backdrop-blur-md min-w-[170px] shadow-lg">
              <span className="text-[10px] font-black uppercase tracking-wider text-cyan-200">AVAILABLE UPI FLOAT</span>
              <div className="text-2xl font-black font-mono tracking-tight text-emerald-400">{inr(upiCurrentBalance)}</div>
              <span className="text-[10px] text-cyan-300/70">Live Settlement Position</span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. UPI FINANCIAL POSITION STRIP */}
      {/* ========================================================================= */}
      <section className="card-glow-indigo relative overflow-hidden rounded-[22px] border border-slate-200/80 bg-white p-4.5 sm:p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 border-b border-slate-200/70 pb-3 dark:border-white/10">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                UPI POSITION
              </span>
              <span className="text-base font-black font-mono text-slate-900 dark:text-white">
                {inr(upiCurrentBalance)}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/40">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                ✓ RECONCILED
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono">Synced {lastRefreshedAt}</span>
              <Link
                href="/finance/reconciliation"
                className="group inline-flex items-center gap-1 font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition"
              >
                <span>View reconciliation</span>
                <span className="transition-transform duration-150 group-hover:translate-x-0.5">→</span>
              </Link>
            </div>
          </div>

          {/* Connected Metrics Grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="card-glow-emerald rounded-xl border border-emerald-500/20 bg-emerald-50/30 p-3 dark:border-emerald-500/20 dark:bg-emerald-950/20">
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">COLLECTIONS</p>
              <p className="mt-0.5 text-lg font-black font-mono text-emerald-600 dark:text-emerald-400">{inr(metrics.totalCredits)}</p>
              <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80">QR Credits Inflow</p>
            </div>
            <div className="card-glow-indigo rounded-xl border border-slate-200/60 bg-slate-50/80 p-3 dark:border-white/5 dark:bg-white/5">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">CASH OUT</p>
              <p className="mt-0.5 text-lg font-black font-mono text-slate-900 dark:text-white">{inr(metrics.totalCashOut)}</p>
              <p className="text-[10px] text-slate-400">Till Cash Disbursed</p>
            </div>
            <div className="card-glow-cyan rounded-xl border border-cyan-500/20 bg-cyan-50/30 p-3 dark:border-cyan-500/20 dark:bg-cyan-950/20">
              <p className="text-[10px] font-black uppercase tracking-wider text-cyan-700 dark:text-cyan-400">FEES</p>
              <p className="mt-0.5 text-lg font-black font-mono text-cyan-600 dark:text-cyan-400">+{inr(metrics.totalFees)}</p>
              <p className="text-[10px] text-cyan-600/80 dark:text-cyan-400/80">Net Shop Earnings</p>
            </div>
            <div className="card-glow-emerald rounded-xl border border-emerald-500/20 bg-emerald-50/40 p-3 dark:border-emerald-500/20 dark:bg-emerald-950/20">
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">VARIANCE</p>
              <p className="mt-0.5 text-lg font-black font-mono text-emerald-700 dark:text-emerald-300">₹0.00</p>
              <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80">Exact Match</p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. PRIMARY QUICK OPERATIONS TILES */}
      {/* ========================================================================= */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">
            QUICK OPERATIONS
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setScanModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 active:scale-95 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/10"
              title="Scan UPI receipt screenshot"
            >
              <span>📷</span>
              <span>Scan Screenshot</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 active:scale-95 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/10"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Tile 1: QR Collection */}
          <div className="card-glow-indigo group relative overflow-hidden rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-400 hover:shadow-md dark:border-white/10 dark:bg-slate-900 dark:hover:border-indigo-500/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-3">
                <div className="icon-box-3d flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-xl text-white shadow-md shadow-indigo-500/25">
                  📱
                </div>
                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700 ring-1 ring-indigo-200/60 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-800/40">
                  {qrs.length} Active QRs
                </span>
              </div>
              <h3 className="mt-3 text-base font-black text-slate-900 dark:text-white">QR COLLECTION</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Receive customer payment via dynamic merchant QR code
              </p>
              <p className="mt-2 font-mono text-[11px] text-slate-400">
                Active: <strong className="text-slate-700 dark:text-slate-300">{activeQr?.display_name || "Default QR"}</strong> ({activeQr?.upi_id || "No UPI configured"})
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Real Scannable QR</span>
              <button
                type="button"
                onClick={() => setQrModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-800 active:scale-95 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 shadow-sm"
              >
                <span>View Fullscreen QR</span>
                <span>→</span>
              </button>
            </div>
          </div>

          {/* Tile 2: UPI Cash Out */}
          <div className="card-glow-emerald group relative overflow-hidden rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-400 hover:shadow-md dark:border-white/10 dark:bg-slate-900 dark:hover:border-emerald-500/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-3">
                <div className="icon-box-3d flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-xl text-white shadow-md shadow-emerald-500/25">
                  💸
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/40">
                  Instant Cash Disbursement
                </span>
              </div>
              <h3 className="mt-3 text-base font-black text-slate-900 dark:text-white">UPI CASH OUT</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Customer cash withdrawal against confirmed UPI receipt
              </p>
              <p className="mt-2 text-[11px] text-slate-400">
                Dynamic QR on-screen · Automatic fee deduction · Double-entry cashbook
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Till Cashout Ready</span>
              <button
                type="button"
                onClick={() => terminalFormRef.current?.scrollIntoView({ behavior: "smooth" })}
                className="btn-3d-tactile-emerald inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-md transition hover:brightness-110 active:scale-[0.98]"
              >
                <span>Record UPI Cash Out</span>
                <span>↓</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. INTEGRATED DUAL-MODE LIVE TERMINAL + DYNAMIC QR DISPLAY */}
      {/* ========================================================================= */}
      <div ref={terminalFormRef} className="space-y-4">
        {/* Success Confirmation Card */}
        {successTxn && (
          <div className="relative overflow-hidden rounded-[24px] border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-slate-900/40 p-5 sm:p-6 backdrop-blur-md dark:border-emerald-500/30 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-emerald-500/20 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-xl text-white shadow-md shadow-emerald-500/30">
                  ✓
                </div>
                <div>
                  <h3 className="text-base font-black text-emerald-900 dark:text-emerald-300">
                    UPI CASH OUT COMPLETED SUCCESSFULLY
                  </h3>
                  <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
                    Cash drawer till debited and UPI pool float credited cleanly.
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
                <span className="text-slate-400 font-semibold text-[10px]">QR TERMINAL:</span>
                <p className="font-bold text-slate-900 dark:text-white mt-0.5 truncate">{successTxn.merchant_qrs?.display_name || "Merchant QR"}</p>
              </div>
              <div>
                <span className="text-slate-400 font-semibold text-[10px]">UPI RECEIVED:</span>
                <p className="font-black text-slate-900 dark:text-white mt-0.5">{inr(successTxn.amount)}</p>
              </div>
              <div>
                <span className="text-slate-400 font-semibold text-[10px]">CASH HANDED:</span>
                <p className="font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {inr(successTxn.fee_source === "customer_paid_extra" ? successTxn.amount : Math.max(0, Number(successTxn.amount) - Number(successTxn.service_fee || 0)))}
                </p>
              </div>
              <div>
                <span className="text-slate-400 font-semibold text-[10px]">NET FEE EARNED:</span>
                <p className="font-black text-teal-600 dark:text-teal-400 mt-0.5">+{inr(Number(successTxn.service_fee || 0))}</p>
              </div>
            </div>

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

        {/* The Dual Column Terminal */}
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
          {/* Left Column: Fast Operation Console (8 Cols) */}
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 lg:col-span-7 shadow-sm dark:border-white/10 dark:bg-slate-900 space-y-4">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                  Step-by-Step Counter Workflow
                </span>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  UPI Cash Out Terminal
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setScanModalOpen(true)}
                  className="btn-3d-tactile-primary inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold shadow-xs"
                >
                  <span>📷 Scan Receipt / SMS</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAddCustomerOpen(true)}
                  className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                >
                  + Add Customer
                </button>
              </div>
            </div>

            {/* Merchant QR Switcher Tabs */}
            {qrs.length > 1 && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Active Merchant QR
                </label>
                <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-slate-100 p-1 text-xs dark:bg-white/5">
                  {qrs.map((qr) => {
                    const isSelected = selectedQrId === qr.id || (!selectedQrId && qrs[0]?.id === qr.id);
                    return (
                      <button
                        key={qr.id}
                        type="button"
                        onClick={() => setSelectedQrId(qr.id)}
                        className={`rounded-xl px-3 py-1.5 font-bold transition ${
                          isSelected
                            ? "bg-white text-slate-900 shadow-xs dark:bg-cyan-600 dark:text-white"
                            : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                        }`}
                      >
                        {qr.display_name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Customer Selector */}
              <div className="space-y-1 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Customer (Optional CRM Profile)
                  </label>
                  <button
                    type="button"
                    onClick={() => setAddCustomerOpen(true)}
                    className="text-[11px] font-bold text-cyan-600 hover:underline dark:text-cyan-400"
                  >
                    + New Customer
                  </button>
                </div>
                <CustomerSearchSelect
                  value={formCustomerId || null}
                  selected={formCustomerRecord}
                  onChange={handleFormCustomerSelect}
                  allowWalkIn
                  walkInLabel="-- Walk-in Customer --"
                  placeholder="Search name, phone, or ID (min 2 chars)…"
                  tone="auto"
                />
              </div>

              {/* Mobile Number */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Customer Mobile Number
                </label>
                <input
                  type="tel"
                  value={formCustomerMobile}
                  onChange={(e) => setFormCustomerMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-digit mobile number"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-semibold outline-none transition focus:border-cyan-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:bg-slate-900"
                />
              </div>

              {/* UTR / Reference */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Bank UTR / Auth Reference Number
                </label>
                <input
                  type="text"
                  value={formReference}
                  onChange={(e) => setFormReference(e.target.value)}
                  placeholder="12-digit UTR from customer app"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-mono font-bold outline-none focus:border-cyan-500 dark:border-white/10 dark:bg-white/5"
                />
              </div>

              {/* Amount Input with Quick Chips */}
              <div className="space-y-1.5 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    UPI Amount (₹) <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] font-bold text-slate-400">
                    Dynamic QR updates in real-time
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-400">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="any"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-3 pl-11 pr-4 text-2xl font-black text-slate-900 outline-none transition focus:border-cyan-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:bg-slate-900"
                  />
                </div>

                {/* Quick Amount Pills */}
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {["100", "200", "500", "1000", "2000", "3000", "5000", "10000"].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setFormAmount(v)}
                      className={`rounded-xl border px-3 py-1 text-xs font-black transition ${
                        formAmount === v
                          ? "border-cyan-600 bg-cyan-600 text-white shadow-xs"
                          : "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                      }`}
                    >
                      ₹{Number(v).toLocaleString("en-IN")}
                    </button>
                  ))}
                </div>
              </div>

              {/* Service Fee & Treatment Model */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Customer Service Fee (₹)
                </label>
                <input
                  type="number"
                  step="any"
                  value={formFee}
                  onChange={(e) => setFormFee(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-bold outline-none focus:border-cyan-500 dark:border-white/10 dark:bg-white/5"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Fee Treatment Model
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFormFeeSource("cut_from_withdrawal")}
                    className={`rounded-xl border p-2 text-left transition ${
                      formFeeSource === "cut_from_withdrawal"
                        ? "border-cyan-600 bg-cyan-50/80 font-bold text-cyan-900 dark:border-cyan-500 dark:bg-cyan-950/40 dark:text-cyan-200 shadow-xs"
                        : "border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5"
                    }`}
                  >
                    <div className="text-[11px] font-bold">✂️ Cut Payout</div>
                    <div className="text-[9.5px] text-slate-500 dark:text-slate-400">Deduct from cash</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormFeeSource("customer_paid_extra")}
                    className={`rounded-xl border p-2 text-left transition ${
                      formFeeSource === "customer_paid_extra"
                        ? "border-cyan-600 bg-cyan-50/80 font-bold text-cyan-900 dark:border-cyan-500 dark:bg-cyan-950/40 dark:text-cyan-200 shadow-xs"
                        : "border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5"
                    }`}
                  >
                    <div className="text-[11px] font-bold">💵 Added to QR</div>
                    <div className="text-[9.5px] text-slate-500 dark:text-slate-400">Customer pays fee</div>
                  </button>
                </div>
              </div>

              {/* Remarks */}
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Optional Notes / Remarks
                </label>
                <input
                  type="text"
                  value={formRemarks}
                  onChange={(e) => setFormRemarks(e.target.value)}
                  placeholder="e.g. Customer requested small denomination notes"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-semibold outline-none focus:border-cyan-500 dark:border-white/10 dark:bg-white/5"
                />
              </div>
            </div>
          </div>

          {/* Right Column: Real-Time Dynamic QR Display & Settlement HUD (5 Cols) */}
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 lg:col-span-5 shadow-sm dark:border-white/10 dark:bg-slate-900 space-y-4">
            <div className="border-b border-slate-100 pb-2.5 dark:border-white/5 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Customer Scan Screen
                </span>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Dynamic UPI QR
                </h3>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                Live Amount Encoded
              </span>
            </div>

            {/* Embedded Dynamic Scannable QR Code */}
            <div className="flex flex-col items-center justify-center p-3 rounded-2xl border border-slate-200/80 bg-slate-50/50 dark:border-white/10 dark:bg-white/5 space-y-3">
              <UpiQrCode
                upiId={activeQr?.upi_id}
                merchantName={activeQr?.display_name}
                amount={upiAmountToCollect > 0 ? upiAmountToCollect : undefined}
                size={200}
                onCopy={() => showToast("success", "UPI ID copied to clipboard.")}
              />

              {upiAmountToCollect > 0 ? (
                <div className="text-center">
                  <span className="inline-block rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-black text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    Scan &amp; Pay {inr(upiAmountToCollect)}
                  </span>
                  <p className="mt-1 text-[10px] text-slate-400">
                    Amount is pre-filled when customer scans this QR
                  </p>
                </div>
              ) : (
                <p className="text-[11px] font-medium text-slate-400 text-center">
                  Enter amount above to generate pre-filled payment QR
                </p>
              )}
            </div>

            {/* Settlement Breakdown HUD */}
            <div className="space-y-2 text-xs border-t border-slate-100 pt-3 dark:border-white/5">
              <div className="flex justify-between">
                <span className="text-slate-500">Merchant QR Inflow:</span>
                <strong className="text-slate-900 dark:text-white font-mono font-bold">
                  {inr(numFormAmt)}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Shop Service Fee:</span>
                <strong className="text-cyan-600 dark:text-cyan-400 font-mono font-bold">
                  +{inr(numFormFee)}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Fee Source:</span>
                <span className="rounded-md bg-slate-100 px-2 py-0.2 text-[10px] font-bold text-slate-700 dark:bg-white/10 dark:text-slate-300">
                  {formFeeSource === "cut_from_withdrawal" ? "✂️ Deducted from Payout" : "💵 Added to QR Amount"}
                </span>
              </div>

              {/* Huge Cash Handout Callout */}
              <div className="rounded-2xl bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-slate-900/10 p-3.5 text-xs border border-emerald-500/20 dark:bg-emerald-950/20">
                <div className="text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                  PHYSICAL CASH TO HAND TO CUSTOMER:
                </div>
                <div className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                  {inr(cashHanded)}
                </div>
                <p className="mt-0.5 text-[10px] text-emerald-700/80 dark:text-emerald-300/80">
                  Till outflow strictly equals ₹{cashHanded.toLocaleString("en-IN")}
                </p>
              </div>
            </div>

            {/* Primary Action Button */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => handleRecordCashOut()}
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
                  `✓ Confirm Payout & Hand ${inr(cashHanded)}`
                ) : (
                  "Enter Amount to Confirm Payout"
                )}
              </button>
              <p className="mt-1.5 text-center text-[10px] text-slate-400">
                Deterministic double-entry cashbook synchronization
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. LIVE ACTIVITY FEED */}
      {/* ========================================================================= */}
      {recentTxn && (
        <section className="card-glow-emerald rounded-[22px] border border-slate-200/80 bg-white p-4.5 shadow-xs dark:border-white/10 dark:bg-slate-900 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-white/5">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">
                LIVE ACTIVITY
              </h2>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <span className="text-[10px] text-slate-400">Latest Completed Event</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50/70 dark:bg-white/5 rounded-xl p-3 border border-slate-200/60 dark:border-white/5">
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
                  <strong className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {inr(Number(recentTxn.amount))}
                  </strong>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Successful
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {fmtDate(recentTxn.transaction_date)} · {fmtTime(recentTxn.transaction_timestamp)} {recentTxn.reference ? `· UTR: ${recentTxn.reference}` : ""} {recentTxn.merchant_qrs?.display_name ? `· QR: ${recentTxn.merchant_qrs.display_name}` : ""}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setDetailTxn(recentTxn)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 active:scale-95 transition dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                View
              </button>
              <Link
                href={`/business/receipt/${recentTxn.id}`}
                target="_blank"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 active:scale-95 transition dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                title="Print thermal receipt"
              >
                🖨️ Receipt
              </Link>
              <button
                type="button"
                onClick={() => handleOpenWhatsApp(recentTxn)}
                className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 active:scale-95 transition dark:bg-emerald-950/40 dark:text-emerald-300"
              >
                💬 WhatsApp
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 6. TRANSACTION HISTORY / LEDGER CONSOLE */}
      {/* ========================================================================= */}
      <section className="card-glow-indigo overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        {/* Ledger Header & Search/Filters */}
        <div className="border-b border-slate-100 p-4 sm:p-5 dark:border-white/5 space-y-3.5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">TRANSACTION HISTORY</h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Authoritative transaction ledger for UPI QR receipts and cash disbursements.
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
                  className={`rounded-lg px-3 py-1 font-bold transition active:scale-95 ${
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

          {/* Search & Secondary Filter Strip */}
          <div className="grid gap-2.5 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <input
                type="text"
                placeholder="Search transaction ID, customer, UTR reference..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs text-slate-900 outline-none transition focus:border-cyan-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:focus:bg-slate-900"
              />
            </div>

            <div>
              <CustomerSearchSelect
                value={customerFilter || null}
                selected={customerFilterRecord}
                onChange={handleCustomerFilterSelect}
                allowWalkIn
                walkInLabel="All Customers"
                placeholder="Search customer…"
                tone="auto"
              />
            </div>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-black uppercase tracking-wider text-slate-400 dark:border-white/5 dark:bg-white/5">
                <th className="px-4 py-3">TRANSACTION</th>
                <th className="px-4 py-3">CUSTOMER</th>
                <th className="px-4 py-3">DATE / TIME</th>
                <th className="px-4 py-3 text-right">UPI AMOUNT</th>
                <th className="px-4 py-3 text-right">CASH OUT</th>
                <th className="px-4 py-3 text-right">FEE</th>
                <th className="px-4 py-3 text-center">STATUS</th>
                <th className="px-4 py-3 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filteredTxns.map((t) => {
                const amt = Number(t.amount) || 0;
                const fee = Number(t.service_fee) || Number((t as any).upi_fee) || 0;
                const netHandout = t.fee_source === "customer_paid_extra" ? amt : Math.max(0, amt - fee);

                return (
                  <tr
                    key={t.id}
                    className="transition hover:bg-slate-50/70 dark:hover:bg-white/5"
                  >
                    <td className="px-4 py-3.5">
                      <div className="font-mono font-bold text-slate-900 dark:text-white">
                        {t.transaction_number}
                      </div>
                      {t.reference && (
                        <span className="text-[10px] text-slate-400 truncate max-w-[140px] block font-mono">
                          Ref: {t.reference}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="font-bold text-slate-800 dark:text-slate-200">
                        {t.customers?.name || "Walk-in"}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {t.customer_mobile || t.customers?.phone || "No phone"}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400">
                      <div>{fmtDate(t.transaction_date)}</div>
                      <span className="text-[10px] text-slate-400">{fmtTime(t.transaction_timestamp)}</span>
                    </td>

                    <td className="px-4 py-3.5 text-right font-mono font-black text-emerald-600 dark:text-emerald-400">
                      {inr(amt)}
                    </td>

                    <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {inr(netHandout)}
                    </td>

                    <td className="px-4 py-3.5 text-right font-mono font-bold text-cyan-600 dark:text-cyan-400">
                      +{inr(fee)}
                    </td>

                    <td className="px-4 py-3.5 text-center">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          t.status === "success"
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/40"
                            : t.status === "pending"
                            ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/40"
                            : "bg-rose-50 text-rose-700 ring-1 ring-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/40"
                        }`}
                      >
                        {t.status === "success" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                        {t.status === "success" ? "Successful" : t.status === "pending" ? "Pending" : "Failed"}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/business/receipt/${t.id}`}
                          target="_blank"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:scale-95 transition dark:hover:bg-white/10 dark:hover:text-white"
                          title="Print thermal receipt"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                            <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                            <path d="M6 14h12v8H6z" />
                          </svg>
                        </Link>

                        <button
                          type="button"
                          onClick={() => handleOpenWhatsApp(t)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 active:scale-95 transition dark:hover:bg-emerald-950/30 dark:hover:text-emerald-400"
                          title="Send WhatsApp receipt"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                          </svg>
                        </button>

                        <button
                          type="button"
                          onClick={() => setDetailTxn(t)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:scale-95 transition dark:hover:bg-white/10 dark:hover:text-white"
                          title="View complete details"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                            <circle cx="12" cy="12" r="1" />
                            <circle cx="19" cy="12" r="1" />
                            <circle cx="5" cy="12" r="1" />
                          </svg>
                        </button>

                        {t.status === "success" && (
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(t)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 active:scale-95 transition dark:hover:bg-blue-950/30 dark:hover:text-blue-400"
                            title="Edit full transaction"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                            </svg>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setDeleteTarget(t)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 active:scale-95 transition dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                          title="Void / Delete transaction"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredTxns.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                    No UPI transactions match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* RECORD CASH OUT MODAL (Preserved for compatibility and direct triggers) */}
      {/* ========================================================================= */}
      {createModalOpen && (
        <Modal
          title="Record UPI Cash Out"
          onClose={() => setCreateModalOpen(false)}
        >
          <form onSubmit={handleRecordCashOut} className="space-y-4 text-xs">
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-50/30 p-3 dark:bg-indigo-950/20 text-slate-700 dark:text-slate-300">
              <p className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                Customer sends UPI payment to shop QR. You hand over cash drawer till currency.
              </p>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                UPI Amount Received (₹) *
              </label>
              <input
                type="number"
                step="0.01"
                min="1"
                required
                placeholder="e.g. 9001.00"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Service Fee (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 10.00"
                  value={formFee}
                  onChange={(e) => setFormFee(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-900 outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Fee Deduction Method
                </label>
                <select
                  value={formFeeSource}
                  onChange={(e) => setFormFeeSource(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-900 outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                >
                  <option value="cut_from_withdrawal">Cut from payout</option>
                  <option value="customer_paid_extra">Customer pays extra</option>
                </select>
              </div>
            </div>

            {/* Calculated Preview */}
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Cash to Hand Over:</span>
                <strong className="text-slate-900 dark:text-white">
                  {inr(cashHanded)}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Shop Fee Earnings:</span>
                <strong className="text-emerald-600 dark:text-emerald-400">
                  +{inr(numFormFee)}
                </strong>
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Customer (Optional)
              </label>
              <CustomerSearchSelect
                value={formCustomerId || null}
                selected={formCustomerRecord}
                onChange={handleFormCustomerSelect}
                allowWalkIn
                walkInLabel="Walk-in Customer"
                placeholder="Search customer…"
                tone="auto"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Customer Mobile
                </label>
                <input
                  type="tel"
                  placeholder="10-digit mobile"
                  value={formCustomerMobile}
                  onChange={(e) => setFormCustomerMobile(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-900 outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  UTR / Reference
                </label>
                <input
                  type="text"
                  placeholder="12-digit UTR"
                  value={formReference}
                  onChange={(e) => setFormReference(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-900 outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Remarks
              </label>
              <input
                type="text"
                placeholder="Optional notes"
                value={formRemarks}
                onChange={(e) => setFormRemarks(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-900 outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-white/5">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 active:scale-95 transition dark:text-slate-300 dark:hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-3d-tactile-primary rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-md active:scale-95 transition disabled:opacity-50"
              >
                {isSubmitting ? "Recording..." : "Confirm & Hand Cash"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* SHOW FULLSCREEN MERCHANT QR MODAL */}
      {/* ========================================================================= */}
      {qrModalOpen && (
        <Modal
          title={activeQr ? `Merchant QR — ${activeQr.display_name}` : "Merchant UPI Payment QR"}
          onClose={() => setQrModalOpen(false)}
        >
          <div className="p-4 space-y-4">
            {qrs.length > 1 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-2xl bg-slate-100 p-1 text-xs dark:bg-white/5">
                {qrs.map((qr) => {
                  const isSelected = selectedQrId === qr.id || (!selectedQrId && qrs[0]?.id === qr.id);
                  return (
                    <button
                      key={qr.id}
                      type="button"
                      onClick={() => setSelectedQrId(qr.id)}
                      className={`rounded-xl px-3 py-1.5 font-bold transition ${
                        isSelected
                          ? "bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white"
                          : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                      }`}
                    >
                      {qr.display_name}
                    </button>
                  );
                })}
              </div>
            )}

            <UpiQrCode
              upiId={activeQr?.upi_id}
              merchantName={activeQr?.display_name}
              size={240}
              onCopy={() => showToast("success", "UPI ID copied to clipboard.")}
            />
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* TRANSACTION DETAILS MODAL */}
      {/* ========================================================================= */}
      {detailTxn && (
        <Modal
          title={`Transaction Details — ${detailTxn.transaction_number}`}
          onClose={() => setDetailTxn(null)}
        >
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 dark:bg-white/5">
              <div>
                <span className="text-slate-400">Status:</span>
                <p className="font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                  {detailTxn.status}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Date &amp; Time:</span>
                <p className="font-bold text-slate-900 dark:text-white">
                  {fmtDate(detailTxn.transaction_date)} {fmtTime(detailTxn.transaction_timestamp)}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Customer:</span>
                <p className="font-bold text-slate-900 dark:text-white">
                  {detailTxn.customers?.name || "Walk-in"}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Customer Mobile:</span>
                <p className="font-mono text-slate-900 dark:text-white">
                  {detailTxn.customer_mobile || detailTxn.customers?.phone || "—"}
                </p>
              </div>
            </div>

            <div className="space-y-1.5 border-t border-slate-100 pt-3 dark:border-white/5">
              <div className="flex justify-between">
                <span className="text-slate-400">UPI Amount Received:</span>
                <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{inr(Number(detailTxn.amount))}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Service Fee:</span>
                <strong className="text-cyan-600 dark:text-cyan-400">+{inr(Number(detailTxn.service_fee || 0))}</strong>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-1 dark:border-white/5">
                <span className="text-slate-500 font-semibold">Cash Handed Payout:</span>
                <strong className="text-slate-900 dark:text-white text-sm font-black">
                  {inr(
                    detailTxn.fee_source === "customer_paid_extra"
                      ? Number(detailTxn.amount)
                      : Math.max(0, Number(detailTxn.amount) - Number(detailTxn.service_fee || 0))
                  )}
                </strong>
              </div>
            </div>

            {detailTxn.reference && (
              <div className="rounded-xl border border-slate-100 p-2.5 dark:border-white/5">
                <span className="text-slate-400">UTR / Reference Number:</span>
                <p className="font-mono font-bold text-slate-900 dark:text-white">{detailTxn.reference}</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Link
                href={`/business/receipt/${detailTxn.id}`}
                target="_blank"
                className="rounded-xl border border-slate-200 px-3.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200"
              >
                Thermal Receipt
              </Link>
              <Link
                href={`/business/receipt/${detailTxn.id}/a4`}
                target="_blank"
                className="rounded-xl border border-slate-200 px-3.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200"
              >
                A4 Receipt
              </Link>
              {detailTxn.status === "success" && (
                <button
                  type="button"
                  onClick={() => {
                    const t = detailTxn;
                    setDetailTxn(null);
                    handleOpenEdit(t);
                  }}
                  className="rounded-xl bg-blue-50 px-3.5 py-1.5 font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300"
                >
                  Edit Transaction
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* EDIT UPI TRANSACTION MODAL */}
      {/* ========================================================================= */}
      {editModalOpen && editingTxn && (
        <Modal
          title={`Edit UPI Transaction — ${editingTxn.transaction_number}`}
          onClose={() => {
            setEditModalOpen(false);
            setEditingTxn(null);
          }}
        >
          {(() => {
            const editNumAmt = parseFloat(editAmount) || 0;
            const editNumFee = parseFloat(editFee) || 0;
            const editCashHanded =
              editFeeSource === "customer_paid_extra"
                ? editNumAmt
                : Math.max(0, editNumAmt - editNumFee);
            const editQrReceived =
              editFeeSource === "customer_paid_extra"
                ? editNumAmt + editNumFee
                : editNumAmt;

            return (
              <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
                <div className="rounded-xl border border-teal-500/20 bg-teal-500/10 p-3 text-teal-900 dark:text-teal-300">
                  <div className="font-bold flex items-center gap-1.5">
                    <span>⚡</span>
                    <span>Full Ledger Reversal &amp; Double-Entry Repost</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-teal-800 dark:text-teal-400">
                    Modifying amounts or fees atomically reverses previous ledger postings and records new entries across Cash Drawer and UPI QR Float Pool with ₹0.00 variance.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Disbursement Amount (₹) <span className="text-rose-500">*</span>
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
                      value={editFee}
                      onChange={(e) => setEditFee(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-teal-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Fee Deduction Method
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditFeeSource("cut_from_withdrawal")}
                      className={`rounded-xl border p-2.5 text-left transition ${
                        editFeeSource === "cut_from_withdrawal"
                          ? "border-teal-600 bg-teal-50/80 font-bold text-teal-900 dark:border-teal-500 dark:bg-teal-950/40 dark:text-teal-200"
                          : "border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5"
                      }`}
                    >
                      <div className="text-xs font-bold">✂️ Deduct from Cash Payout</div>
                      <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                        Customer sends {inr(editNumAmt)} via QR; receives {inr(Math.max(0, editNumAmt - editNumFee))} cash.
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditFeeSource("customer_paid_extra")}
                      className={`rounded-xl border p-2.5 text-left transition ${
                        editFeeSource === "customer_paid_extra"
                          ? "border-teal-600 bg-teal-50/80 font-bold text-teal-900 dark:border-teal-500 dark:bg-teal-950/40 dark:text-teal-200"
                          : "border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5"
                      }`}
                    >
                      <div className="text-xs font-bold">💵 Added to QR Amount</div>
                      <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                        Customer sends {inr(editNumAmt + editNumFee)} via QR; receives {inr(editNumAmt)} full cash.
                      </div>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Merchant QR Terminal
                    </label>
                    <select
                      value={editQrId}
                      onChange={(e) => setEditQrId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold outline-none focus:border-teal-500 dark:border-white/10 dark:bg-white/5"
                    >
                      {qrs.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.display_name} ({q.upi_id})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Bank UTR / Reference Number
                    </label>
                    <input
                      type="text"
                      value={editReference}
                      onChange={(e) => setEditReference(e.target.value)}
                      placeholder="12-digit UTR number"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono font-bold outline-none focus:border-teal-500 dark:border-white/10 dark:bg-white/5"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Customer Attribution
                    </label>
                    <CustomerSearchSelect
                      value={editCustomerId || null}
                      selected={editCustomerRecord}
                      onChange={handleEditCustomerSelect}
                      allowWalkIn
                      walkInLabel="-- Walk-in Customer --"
                      placeholder="Assign customer…"
                      tone="auto"
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
                    Remarks / Correction Notes
                  </label>
                  <input
                    type="text"
                    value={editRemarks}
                    onChange={(e) => setEditRemarks(e.target.value)}
                    placeholder="Reason for correction…"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-teal-500 dark:border-white/10 dark:bg-white/5"
                  />
                </div>

                <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-1.5">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Projected Double-Entry Impact
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400">QR Received:</span>
                      <p className="font-black text-emerald-600 dark:text-emerald-400">{inr(editQrReceived)}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Cash Disbursed:</span>
                      <p className="font-black text-slate-900 dark:text-white">{inr(editCashHanded)}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Shop Fee Profit:</span>
                      <p className="font-black text-cyan-600 dark:text-cyan-400">+{inr(editNumFee)}</p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-white/5">
                  <button
                    type="button"
                    onClick={() => setEditModalOpen(false)}
                    disabled={editSubmitting}
                    className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 active:scale-95 transition dark:text-slate-300 dark:hover:bg-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editSubmitting || editNumAmt <= 0}
                    className="btn-3d-tactile-primary rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-md active:scale-95 transition disabled:opacity-50"
                  >
                    {editSubmitting ? "Reconciling & Saving..." : "Save & Reconcile Transaction"}
                  </button>
                </div>
              </form>
            );
          })()}
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* ADD CUSTOMER MODAL */}
      {/* ========================================================================= */}
      {addCustomerOpen && (
        <Modal
          title="Add New Customer"
          onClose={() => setAddCustomerOpen(false)}
        >
          <form onSubmit={handleCreateCustomer} className="space-y-4 text-xs">
            {custCreateError && (
              <div className="rounded-xl bg-rose-50 p-3 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 font-bold">
                {custCreateError}
              </div>
            )}
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={newCustName}
                onChange={(e) => setNewCustName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-bold text-slate-900 outline-none focus:border-cyan-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Mobile Number (10 Digits)
              </label>
              <input
                type="tel"
                maxLength={10}
                value={newCustPhone}
                onChange={(e) => setNewCustPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="e.g. 9876543210"
                className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-bold text-slate-900 outline-none focus:border-cyan-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Email (Optional)
                </label>
                <input
                  type="email"
                  value={newCustEmail}
                  onChange={(e) => setNewCustEmail(e.target.value)}
                  placeholder="name@domain.com"
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-900 outline-none focus:border-cyan-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Address / City
                </label>
                <input
                  type="text"
                  value={newCustAddress}
                  onChange={(e) => setNewCustAddress(e.target.value)}
                  placeholder="e.g. Kolkata"
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-900 outline-none focus:border-cyan-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
              <button
                type="button"
                onClick={() => setAddCustomerOpen(false)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 active:scale-95 transition dark:text-slate-300 dark:hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={custCreateSubmitting}
                className="btn-3d-tactile-primary rounded-xl px-5 py-2 text-xs font-bold text-white shadow-md active:scale-95 transition disabled:opacity-50"
              >
                {custCreateSubmitting ? "Creating..." : "Save Customer"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* SCAN & FILL MODAL */}
      {/* ========================================================================= */}
      {scanModalOpen && (
        <ScanFillModal
          open={scanModalOpen}
          mode="upi"
          onClose={() => setScanModalOpen(false)}
          onApply={handleScanApply}
        />
      )}

      {/* ========================================================================= */}
      {/* VOID / DELETE REASON MODAL */}
      {/* ========================================================================= */}
      {deleteTarget && (
        <ReasonModal
          title={`Void Transaction #${deleteTarget.transaction_number}`}
          note="This action reverses ledger entries and cannot be undone."
          confirmLabel="Void & Reverse Ledger"
          busy={isVoiding}
          reason={voidReason}
          setReason={setVoidReason}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleConfirmVoid}
        />
      )}

      {/* ========================================================================= */}
      {/* WHATSAPP MODAL */}
      {/* ========================================================================= */}
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
    </div>
  );
}
