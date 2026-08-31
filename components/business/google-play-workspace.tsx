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
import type { CustomerRow, PaymentInstrument, Txn } from "./recharge-workspace";
import { resolveBillCommission, type BillCommissionConfig, type CommissionResolution } from "@/lib/bill-payment/commission";
import CommissionEditModal from "@/components/business/commission-edit-modal";

export const GOOGLE_PLAY_REGIONS = [
  { code: "IN", name: "India (₹ INR)", currency: "₹", flag: "🇮🇳", min: 10, max: 5000 },
  { code: "US", name: "United States ($ USD)", currency: "$", flag: "🇺🇸", min: 5, max: 100 },
  { code: "UK", name: "United Kingdom (£ GBP)", currency: "£", flag: "🇬🇧", min: 5, max: 100 },
  { code: "AE", name: "UAE (AED)", currency: "AED", flag: "🇦🇪", min: 20, max: 500 },
];

export const POPULAR_GOOGLE_PLAY_AMOUNTS = [10, 20, 50, 100, 150, 200, 250, 300, 500, 800, 1000, 1500, 2000, 5000];

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

export default function GooglePlayWorkspace({
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

  const [transactions, setTransactions] = useState<Txn[]>(initialTransactions);
  const [commissionConfigs, setCommissionConfigs] = useState<BillCommissionConfig[]>([]);
  const [commissionModalOpen, setCommissionModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadCommissions() {
      try {
        const { data } = await supabase.from("bill_payment_commission_config").select("*");
        if (!cancelled && data && data.length > 0) {
          setCommissionConfigs(data as BillCommissionConfig[]);
        }
      } catch (err) {
        console.warn("Commission rules load notice:", err);
      }
    }
    loadCommissions();
    return () => { cancelled = true; };
  }, []);
  const [customers, setCustomers] = useState<CustomerRow[]>(initialCustomers);
  const [instruments] = useState<PaymentInstrument[]>(initialPaymentInstruments);

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("IN");
  const [amount, setAmount] = useState("100");
  const [serviceFee, setServiceFee] = useState("0");
  const [customerPayMethod, setCustomerPayMethod] = useState<"cash" | "upi" | "bank" | "due">("cash");
  const [customerPayInstId, setCustomerPayInstId] = useState("");
  const [fundingInstId, setFundingInstId] = useState("");
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  const [voucherCode, setVoucherCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Modals & UI
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [addCustomerModal, setAddCustomerModal] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [receiptTxn, setReceiptTxn] = useState<Txn | null>(null);
  const [detailTxn, setDetailTxn] = useState<Txn | null>(null);
  const [reverseTxn, setReverseTxn] = useState<Txn | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [busyReverse, setBusyReverse] = useState(false);
  const [waModal, setWaModal] = useState<{ open: boolean; phone: string; name: string; msg: string; refNum: string; refId: string } | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "success" | "pending" | "failed" | "reversed">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const activeRegion = useMemo(() => {
    return GOOGLE_PLAY_REGIONS.find((r) => r.code === selectedRegion) || GOOGLE_PLAY_REGIONS[0];
  }, [selectedRegion]);

  // Valid Funding Instruments (Exposes Cash, Bank, UPI, Wallets, and Credit Cards)
  const validFundingInstruments = useMemo(() => {
    return instruments.filter(
      (i) => i.is_active && ["cash", "bank", "upi", "wallet", "dmt_portal", "aeps_portal", "credit_card"].includes(i.type)
    );
  }, [instruments]);

  // Default Funding Account Init
  useEffect(() => {
    if (!fundingInstId && validFundingInstruments.length > 0) {
      const defaultInst = validFundingInstruments.find((i) => i.type === "cash") || validFundingInstruments[0];
      setFundingInstId(defaultInst.id);
    }
  }, [validFundingInstruments, fundingInstId]);

  // Financial Math
  const rechargeAmount = parseFloat(amount) || 0;
  const custFee = parseFloat(serviceFee) || 0;
  const totalCustomerDebit = rechargeAmount + custFee;

  const commissionResolution: CommissionResolution = useMemo(() => {
    return resolveBillCommission(commissionConfigs, {
      serviceType: "google_play_recharge",
      categoryId: "google_play",
      amount: rechargeAmount,
      customerServiceFee: custFee,
    });
  }, [commissionConfigs, rechargeAmount, custFee]);

  const commissionEarned = commissionResolution.commissionAmount;
  const netProviderCost = commissionResolution.netProviderCost;
  const netOperatorIncome = commissionResolution.shopNetIncome;

  const selectedFundingAccount = useMemo(() => {
    return instruments.find((i) => i.id === fundingInstId);
  }, [instruments, fundingInstId]);

  // Analytics
  const todayStats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayTxns = transactions.filter(
      (t) =>
        t.transaction_date === todayStr &&
        (["google_play_recharge", "google_play"].includes(t.service_type) ||
          (t.service_type === "recharge" && ((t.remarks || "").toLowerCase().includes("google play") || (t.transaction_number || "").startsWith("GPL"))))
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
    };
  }, [transactions]);

  // Filtered History
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const isGP = ["google_play_recharge", "google_play"].includes(t.service_type) ||
        (t.service_type === "recharge" && ((t.remarks || "").toLowerCase().includes("google play") || (t.transaction_number || "").startsWith("GPL")));
      if (!isGP) return false;
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

  // Quick Customer Add
  async function handleAddCustomer() {
    if (!newCustName.trim()) return showToast("error", "Customer name is required.");
    const cleanPhone = newCustPhone.replace(/\D/g, "");
    if (cleanPhone && cleanPhone.length !== 10) return showToast("error", "Phone must be 10 digits.");

    setAddingCustomer(true);
    const { data: newCust, error } = await supabase
      .from("customers")
      .insert({ name: newCustName.trim(), phone: cleanPhone || null, is_active: true, balance: 0 })
      .select()
      .single();

    setAddingCustomer(false);
    if (error) return showToast("error", error.message);

    setCustomers((prev) => [newCust, ...prev]);
    setSelectedCustomerId(newCust.id);
    if (!customerMobile && cleanPhone) setCustomerMobile(cleanPhone);
    setAddCustomerModal(false);
    setNewCustName("");
    setNewCustPhone("");
    showToast("success", `Customer "${newCust.name}" created.`);
  }

  // Scan & Fill OCR
  const handleScanFill = useCallback((fields: ScanFields) => {
    if (fields.mobile) setCustomerMobile(fields.mobile);
    if (fields.amount) setAmount(String(fields.amount));
    if (fields.ref_number) setReference(fields.ref_number);
    showToast("success", "Filled Google Play fields from scan.");
  }, [showToast]);

  // Complete Google Play Recharge Submission
  async function handleCompleteRecharge() {
    if (submitting) return;

    const cleanMobile = customerMobile.replace(/\D/g, "");
    if (cleanMobile && cleanMobile.length !== 10) {
      return showToast("error", "Please enter a valid 10-digit customer mobile number.");
    }
    if (rechargeAmount < activeRegion.min || rechargeAmount > activeRegion.max) {
      return showToast("error", `Recharge amount must be between ${activeRegion.currency}${activeRegion.min} and ${activeRegion.currency}${activeRegion.max}.`);
    }
    if (customerPayMethod === "due" && !selectedCustomerId) {
      return showToast("error", "Please select a customer for Khata (Due) credit recharge.");
    }
    if (!fundingInstId) {
      return showToast("error", "Please select the funding account used to fund this recharge.");
    }

    setSubmitting(true);

    try {
      const todayIso = new Date().toISOString();
      const todayDate = todayIso.slice(0, 10);

      const { count } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .in("service_type", ["google_play_recharge", "google_play", "recharge"]);
      const nextNum = "GPL-" + String((count ?? 0) + 1).padStart(4, "0");

      const insertPayload = {
        transaction_number: nextNum,
        service_type: "google_play_recharge",
        direction: "in",
        transaction_date: todayDate,
        transaction_timestamp: todayIso,
        customer_id: selectedCustomerId || null,
        customer_mobile: cleanMobile || null,
        reference: voucherCode.trim() || reference.trim() || null,
        remarks: remarks.trim() || `Google Play Recharge ${activeRegion.currency}${rechargeAmount} (${activeRegion.name})`,
        status: "success",
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
            setSubmitting(false);
            return showToast("error", retryErr.message);
          }
          newTxn = retryTxn;
        } else {
          setSubmitting(false);
          return showToast("error", txnErr.message);
        }
      } else {
        newTxn = primaryTxn;
      }

      // Customer Collection Leg
      if (customerPayMethod !== "due" && totalCustomerDebit > 0) {
        const payInst = instruments.find((i) => i.id === customerPayInstId) || selectedFundingAccount;
        await supabase.from("cash_entries").insert({
          entry_date: todayDate,
          method: customerPayMethod === "cash" ? "cash" : customerPayMethod === "upi" ? "upi" : "bank",
          direction: "in",
          amount: totalCustomerDebit,
          description: `Google Play ${nextNum} collection (${customerPayMethod.toUpperCase()})`,
          ref_type: "transaction",
          ref_id: newTxn.id,
          instrument_id: payInst?.id || null,
        });
      } else if (customerPayMethod === "due" && selectedCustomerId) {
        const { data: custData } = await supabase
          .from("customers")
          .select("balance")
          .eq("id", selectedCustomerId)
          .single();
        const prevBal = Number(custData?.balance || 0);
        const newBal = prevBal + totalCustomerDebit;

        await supabase.from("customers").update({ balance: newBal }).eq("id", selectedCustomerId);
        await supabase.from("customer_ledger").insert({
          customer_id: selectedCustomerId,
          entry_date: todayDate,
          type: "recharge",
          description: `Google Play ${nextNum} on credit (Khata)`,
          debit: totalCustomerDebit,
          credit: 0,
          balance_after: newBal,
          ref_type: "transaction",
          ref_id: newTxn.id,
        });
      }

      // Provider Funding Leg
      if (netProviderCost > 0 && selectedFundingAccount) {
        await supabase.from("cash_entries").insert({
          entry_date: todayDate,
          method: selectedFundingAccount.type === "cash" ? "cash" : selectedFundingAccount.type === "bank" ? "bank" : selectedFundingAccount.type === "credit_card" ? "credit_card" : selectedFundingAccount.type === "wallet" ? "wallet" : "upi",
          direction: "out",
          amount: netProviderCost,
          description: `Google Play ${nextNum} provider debit (${selectedFundingAccount.name})`,
          ref_type: "transaction",
          ref_id: newTxn.id,
          instrument_id: selectedFundingAccount.id,
        });
      }

      const formattedTxn: Txn = {
        ...newTxn,
        providers: { name: "Google Play" },
        customers: selectedCustomerId ? { name: customers.find((c) => c.id === selectedCustomerId)?.name || "Customer" } : null,
      };

      setTransactions((prev) => [formattedTxn, ...prev]);
      logAudit({
        action: "create",
        entity: "transactions",
        entity_id: newTxn.id,
        description: `Google Play recharge ${nextNum} of ${inr(rechargeAmount)} completed.`,
      });

      showToast("success", `Google Play Recharge ${nextNum} completed successfully!`);
      setReceiptTxn(formattedTxn);
      setVoucherCode("");
      setReference("");
      setRemarks("");
      setSubmitting(false);
    } catch (err: any) {
      setSubmitting(false);
      showToast("error", err?.message || "Failed to complete recharge.");
    }
  }

  // Reversal Execution
  async function handleReverse() {
    if (!reverseTxn || busyReverse) return;
    setBusyReverse(true);

    try {
      const { error } = await supabase.rpc("reverse_business_txn", {
        p_txn_id: reverseTxn.id,
        p_reason: reverseReason.trim() || "Google Play code failed or refunded",
      });

      if (error) {
        showToast("error", error.message);
        setBusyReverse(false);
        return;
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
      "Customer",
      "Mobile",
      "Recharge Amount",
      "Customer Fee",
      "Total Paid",
      "Commission",
      "Provider Cost",
      "Voucher / Ref",
      "Pay Method",
      "Status",
    ];
    const rows = filteredTransactions.map((t) => [
      fmtDate(t.transaction_date),
      fmtTime(t.transaction_timestamp || t.created_at),
      t.transaction_number,
      t.customers?.name || "-",
      t.customer_mobile || "-",
      Number(t.amount),
      Number(t.service_fee || 0),
      Number(t.amount) + Number(t.service_fee || 0),
      Number(t.portal_commission || 0),
      Number(t.pool_out || 0),
      t.reference || "-",
      (t.customer_pay_method || "cash").toUpperCase(),
      t.status.toUpperCase(),
    ]);
    downloadCsv(`google_play_recharges_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  }

  // WhatsApp Trigger
  function handleWhatsApp(t: Txn) {
    const rawPhone = t.customer_mobile || t.customers?.phone || "";
    const cleanPhone = rawPhone.replace(/\D/g, "");
    const voucher = t.reference || "";
    const msg = `*GOOGLE PLAY RECHARGE RECEIPT — SARKAR COMMUNICATION*\n` +
      `--------------------------------\n` +
      `Txn ID: ${t.transaction_number}\n` +
      `Customer: ${t.customers?.name || "Customer"}\n` +
      `Mobile: ${t.customer_mobile || "-"}\n` +
      `Recharge Amount: ${inr(Number(t.amount))}\n` +
      (Number(t.service_fee) > 0 ? `Customer Fee: ${inr(Number(t.service_fee))}\n` : "") +
      `Total Paid: ${inr(Number(t.amount) + Number(t.service_fee || 0))}\n` +
      (voucher ? `*Voucher / Gift Code:* \`${voucher}\`\n` : "") +
      `Paid Via: ${(t.customer_pay_method || "cash").toUpperCase()}\n` +
      `Status: ${t.status.toUpperCase()}\n` +
      `Date: ${fmtDate(t.transaction_date)} ${fmtTime(t.transaction_timestamp || t.created_at)}\n` +
      `--------------------------------\n` +
      `*Redeem Code:* Open Google Play Store > Profile Icon > Payments & Subscriptions > Redeem code\n` +
      `Thank you for choosing Sarkar Communication!`;

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
      <CommissionEditModal
        open={commissionModalOpen}
        onClose={() => setCommissionModalOpen(false)}
        initialCategory="google_play"
        initialServiceType="google_play_recharge"
        existingConfig={commissionResolution.config}
        onSaved={(saved) => {
          setCommissionConfigs((prev) => [saved, ...prev.filter((c) => c.id !== saved.id)]);
        }}
      />
      {toastView}

      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-slate-900 via-teal-950/80 to-slate-900 p-6 text-white shadow-2xl">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-black tracking-wide text-emerald-300 ring-1 ring-emerald-500/40">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                GOOGLE PLAY RECHARGE ONLINE
              </span>
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-bold text-slate-300">
                Instant Voucher Generation
              </span>
            </div>
            <h1 className="mt-2.5 text-2xl font-black tracking-tight sm:text-3xl">
              Google Play Recharge Terminal
            </h1>
            <p className="mt-1 text-xs text-slate-300 max-w-xl">
              Sell Google Play redeem codes, game top-ups, and balance recharges with real-time margin calculation, double-entry ledger, and WhatsApp receipt delivery.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth" })}
              className="btn-3d-tactile-primary flex items-center gap-2 px-3.5 py-2 text-xs font-black shadow-lg"
            >
              <span>▶️ New Recharge</span>
            </button>
            <button
              type="button"
              onClick={() => setScanModalOpen(true)}
              className="btn-3d-tactile-secondary flex items-center gap-2 px-3.5 py-2 text-xs font-bold"
            >
              <span>📷 Scan Code</span>
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
            <span className="text-[10px] font-black uppercase text-emerald-300">Today&apos;s Codes</span>
            <div className="mt-1 text-xl font-black">{todayStats.count} <span className="text-xs font-normal text-slate-300">issued</span></div>
            <p className="mt-0.5 text-[11px] text-slate-400">{inr(todayStats.volume)} volume</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
            <span className="text-[10px] font-black uppercase text-emerald-300">Customer Collection</span>
            <div className="mt-1 text-xl font-black text-emerald-400">{inr(todayStats.collections)}</div>
            <p className="mt-0.5 text-[11px] text-slate-400">Total customer receipts</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
            <span className="text-[10px] font-black uppercase text-amber-300">Earned Margin</span>
            <div className="mt-1 text-xl font-black text-amber-400">{inr(todayStats.commission)}</div>
            <p className="mt-0.5 text-[11px] text-slate-400">{commissionResolution.label} rate</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
            <span className="text-[10px] font-black uppercase text-cyan-300">Net Provider Cost</span>
            <div className="mt-1 text-xl font-black text-cyan-400">{inr(todayStats.providerCost)}</div>
            <p className="mt-0.5 text-[11px] text-slate-400">Debited from funding</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
            <span className="text-[10px] font-black uppercase text-purple-300">Success Rate</span>
            <div className="mt-1 text-xl font-black text-purple-300">{todayStats.successRate}%</div>
            <p className="mt-0.5 text-[11px] text-emerald-400">Net Income: {inr(todayStats.netIncome)}</p>
          </div>
        </div>
      </div>

      {/* Main Workspace Split View */}
      <div ref={formRef} className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Form Details */}
        <div className="space-y-6 lg:col-span-8">
          <div className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-md dark:border-white/10 dark:bg-slate-900">
            <h2 className="text-base font-black text-slate-900 dark:text-white">
              Google Play Recharge Details
            </h2>

            {/* 1. Customer & Region */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
                    1. Customer (Optional)
                  </label>
                  <button
                    type="button"
                    onClick={() => setAddCustomerModal(true)}
                    className="text-[11px] font-bold text-emerald-600 hover:underline dark:text-emerald-400"
                  >
                    + New Customer
                  </button>
                </div>
                <SearchableSelect
                  options={customers.map((c) => ({
                    value: c.id,
                    label: `${c.name} ${c.phone ? `(${c.phone})` : ""}`,
                  }))}
                  value={selectedCustomerId}
                  onChange={(v) => {
                    setSelectedCustomerId(v);
                    const c = customers.find((cust) => cust.id === v);
                    if (c?.phone && !customerMobile) {
                      setCustomerMobile(c.phone.replace(/\D/g, "").slice(-10));
                    }
                  }}
                  placeholder="Select or search customer..."
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
                  Customer Mobile Number
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-black text-slate-400">🇮🇳 +91</span>
                  <input
                    type="tel"
                    value={customerMobile}
                    onChange={(e) => setCustomerMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="Enter 10-digit mobile"
                    disabled={submitting}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-16 pr-3 text-xs font-black tracking-wider text-slate-900 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>
            </div>

            {/* 2. Region Selection */}
            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
                2. Google Play Region
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {GOOGLE_PLAY_REGIONS.map((r) => (
                  <button
                    key={r.code}
                    type="button"
                    onClick={() => setSelectedRegion(r.code)}
                    className={`flex items-center gap-2 rounded-2xl border p-3 text-left transition ${
                      selectedRegion === r.code
                        ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-950/50 dark:text-emerald-200 shadow-xs ring-2 ring-emerald-500/20"
                        : "border-slate-200 bg-slate-50/50 text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-300"
                    }`}
                  >
                    <span className="text-xl">{r.flag}</span>
                    <div>
                      <div className="text-xs font-black">{r.name}</div>
                      <div className="text-[10px] text-slate-400">{r.currency}{r.min} - {r.currency}{r.max}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Popular Amount Chips */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
                  3. Select Amount (Popular Presets)
                </label>
                <span className="text-[11px] font-bold text-slate-400">Customizable</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {POPULAR_GOOGLE_PLAY_AMOUNTS.filter((a) => a >= activeRegion.min && a <= activeRegion.max).map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setAmount(String(amt))}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-black transition ${
                      amount === String(amt)
                        ? "border-emerald-600 bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                        : "border-slate-200 bg-white text-slate-700 hover:border-emerald-500 hover:bg-emerald-50/50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {activeRegion.currency}{amt}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Custom Amount Input */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
                  4. Custom Amount ({activeRegion.currency}) *
                </label>
                <input
                  type="number"
                  min={activeRegion.min}
                  max={activeRegion.max}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={submitting}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
                  5. Customer Service Fee ({activeRegion.currency})
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={serviceFee}
                  onChange={(e) => setServiceFee(e.target.value)}
                  disabled={submitting}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            {/* Active Commission & Margin strip */}
            <div className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50/60 p-2.5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-600 text-xs font-black text-white">
                  %
                </span>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                    Google Play Margin ({commissionResolution.label})
                  </span>
                  <p className="text-xs font-black text-slate-900 dark:text-white">
                    Earns {inr(commissionEarned)} margin on {inr(rechargeAmount)} recharge
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCommissionModalOpen(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-xs font-black text-emerald-700 shadow-xs transition hover:bg-emerald-50 dark:border-emerald-800 dark:bg-slate-800 dark:text-emerald-300"
              >
                ⚙ Edit Margin
              </button>
            </div>

            {/* 5. Optional Reference & Voucher */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
                  Voucher / Gift Code (Optional)
                </label>
                <input
                  type="text"
                  value={voucherCode}
                  onChange={(e) => setVoucherCode(e.target.value)}
                  placeholder="e.g. ABCD-EFGH-IJKL-MNOP"
                  disabled={submitting}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white uppercase tracking-wider"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
                  Provider Reference / RRN
                </label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. TXN99823481"
                  disabled={submitting}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Funding & Settlement Summary */}
        <div className="space-y-6 lg:col-span-4">
          <div className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-md dark:border-white/10 dark:bg-slate-900">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
              Funding &amp; Settlement
            </h3>

            {/* Customer Payment Method */}
            <div>
              <label className="mb-2 block text-xs font-bold text-slate-600 dark:text-slate-300">
                Customer Payment Received Via
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "cash", label: "💵 Cash Till" },
                  { id: "upi", label: "⚡ Shop UPI" },
                  { id: "bank", label: "🏦 Bank Transfer" },
                  { id: "due", label: "📒 Khata (Due)" },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setCustomerPayMethod(m.id as any)}
                    className={`rounded-xl border p-2.5 text-xs font-black transition ${
                      customerPayMethod === m.id
                        ? "border-emerald-600 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Funding Source Account (Cost Debited From) */}
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">
                Funding Account (Cost Debited From) *
              </label>
              <select
                value={fundingInstId}
                onChange={(e) => setFundingInstId(e.target.value)}
                disabled={submitting}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
              >
                {validFundingInstruments.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.type === "cash" ? "💵" : inst.type === "credit_card" ? "💳" : inst.type === "wallet" ? "👛" : "🏦"} {inst.name} ({inst.type.toUpperCase()})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-slate-400">
                Supports Cash, Bank, Digital Wallets, and Credit Cards.
              </p>
            </div>

            {/* Economics Breakdown */}
            <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-xs dark:border-white/5 dark:bg-slate-800/40">
              <div className="flex justify-between font-bold text-slate-600 dark:text-slate-300">
                <span>Recharge Denomination</span>
                <span>{inr(rechargeAmount)}</span>
              </div>
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Customer Service Fee</span>
                <span>+{inr(custFee)}</span>
              </div>
              <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 font-bold">
                <div className="flex items-center gap-1.5">
                  <span>Earned Margin ({commissionResolution.label})</span>
                  <button
                    type="button"
                    onClick={() => setCommissionModalOpen(true)}
                    className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-950/60 transition"
                  >
                    ⚙ Edit Margin
                  </button>
                </div>
                <span>-{inr(commissionEarned)}</span>
              </div>
              <div className="border-t border-slate-200 pt-2 font-black dark:border-white/10">
                <div className="flex justify-between text-slate-900 dark:text-white">
                  <span>Customer Total Collection</span>
                  <span className="text-emerald-600 dark:text-emerald-400">{inr(totalCustomerDebit)}</span>
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                  <span>Provider Net Cost</span>
                  <span>{inr(netProviderCost)}</span>
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-indigo-600 dark:text-indigo-400">
                  <span>Shop Net Income</span>
                  <span>{inr(netOperatorIncome)}</span>
                </div>
              </div>
            </div>

            {/* Provider Status Callout */}
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50/50 p-3 text-[11px] text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/20 dark:text-emerald-300">
              <span className="font-bold">⚡ Counter Fulfillment:</span> Active. Full double-entry ledger &amp; cashbook sync verified.
            </div>

            {/* Submit Button */}
            <button
              type="button"
              onClick={handleCompleteRecharge}
              disabled={submitting || rechargeAmount <= 0}
              className="btn-3d-tactile-primary flex w-full items-center justify-center gap-2 py-3 text-xs font-black shadow-lg"
            >
              <span>{submitting ? "Processing..." : `Complete Recharge (${inr(totalCustomerDebit)}) →`}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Google Play Recharge History Section */}
      <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-md dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
              Google Play Recharge History
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Complete record of Google Play vouchers, game credits and gift code issuances.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-white/10 dark:bg-slate-800 text-xs">
              {(["all", "success", "pending", "failed", "reversed"] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setFilterStatus(st)}
                  className={`rounded-lg px-2.5 py-1 font-bold capitalize transition ${
                    filterStatus === st
                      ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              className="btn-3d-tactile-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold"
            >
              <span>📥 Export CSV</span>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by customer name, mobile, voucher code, txn #, or reference..."
            className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-xs font-bold text-slate-900 outline-none focus:border-emerald-500 focus:bg-white dark:border-white/10 dark:bg-slate-800/50 dark:text-white"
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-white/5">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:border-white/5 dark:bg-slate-800/80 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Date &amp; Time</th>
                <th className="px-4 py-3">Txn #</th>
                <th className="px-4 py-3">Customer &amp; Mobile</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Voucher / Ref</th>
                <th className="px-4 py-3">Margin</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No Google Play recharge transactions found.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition">
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      <div>{fmtDate(t.transaction_date)}</div>
                      <div className="text-[10px] text-slate-400">{fmtTime(t.transaction_timestamp || t.created_at)}</div>
                    </td>
                    <td className="px-4 py-3 font-mono font-black text-slate-900 dark:text-white">
                      {t.transaction_number}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900 dark:text-white">{t.customers?.name || "Walk-in Customer"}</div>
                      <div className="text-[10px] text-slate-400">{t.customer_mobile || "-"}</div>
                    </td>
                    <td className="px-4 py-3 font-black text-slate-900 dark:text-white">
                      {inr(Number(t.amount))}
                      {Number(t.service_fee) > 0 && (
                        <span className="ml-1 text-[10px] font-normal text-slate-400">
                          (+{inr(Number(t.service_fee))})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {t.reference ? (
                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          {t.reference}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-bold text-amber-600 dark:text-amber-400">
                      +{inr(Number(t.portal_commission || 0))}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase text-slate-700 dark:bg-white/10 dark:text-slate-300">
                        {t.customer_pay_method || "cash"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                          t.status === "success"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : t.status === "reversed"
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                            : t.status === "pending"
                            ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
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

      {/* Modals */}
      {scanModalOpen && (
        <ScanFillModal
          open={scanModalOpen}
          onClose={() => setScanModalOpen(false)}
          mode="payment"
          title="Scan Google Play Details"
          onApply={handleScanFill}
        />
      )}

      {/* Receipt Modal */}
      {receiptTxn && (
        <FloatingWindow
          isOpen={true}
          onClose={() => setReceiptTxn(null)}
          title="Google Play Recharge Receipt"
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
              <div className="flex justify-between"><span className="text-slate-400">Service:</span><strong>Google Play Recharge</strong></div>
              {receiptTxn.customer_mobile && (
                <div className="flex justify-between"><span className="text-slate-400">Customer Mobile:</span><strong>{receiptTxn.customer_mobile}</strong></div>
              )}
              {receiptTxn.reference && (
                <div className="flex justify-between rounded-xl bg-emerald-100/60 p-2 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <span className="font-bold">Voucher Code:</span>
                  <strong className="font-mono tracking-wider">{receiptTxn.reference}</strong>
                </div>
              )}
              <div className="flex justify-between"><span className="text-slate-400">Recharge Amount:</span><strong>{inr(Number(receiptTxn.amount))}</strong></div>
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
                className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-md"
              >
                💬 WhatsApp Receipt
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

      {/* Details Modal */}
      {detailTxn && (
        <FloatingWindow
          isOpen={true}
          onClose={() => setDetailTxn(null)}
          title={`Transaction ${detailTxn.transaction_number}`}
          subtitle="Google Play recharge audit details"
        >
          <div className="space-y-4 p-4 text-xs">
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 dark:border-white/10 dark:bg-slate-800/60">
              <div><span className="text-slate-400">Service:</span><div className="font-bold">Google Play Recharge</div></div>
              <div><span className="text-slate-400">Status:</span><div className="font-bold uppercase text-emerald-600">{detailTxn.status}</div></div>
              <div><span className="text-slate-400">Customer:</span><div className="font-bold">{detailTxn.customers?.name || "Walk-in"}</div></div>
              <div><span className="text-slate-400">Mobile:</span><div className="font-bold">{detailTxn.customer_mobile || "—"}</div></div>
              <div><span className="text-slate-400">Voucher / Code:</span><div className="font-bold font-mono">{detailTxn.reference || "—"}</div></div>
              <div><span className="text-slate-400">Recharge Amount:</span><div className="font-bold">{inr(Number(detailTxn.amount))}</div></div>
              <div><span className="text-slate-400">Margin Earned:</span><div className="font-bold text-amber-600">+{inr(Number(detailTxn.portal_commission || 0))}</div></div>
              <div><span className="text-slate-400">Customer Paid Via:</span><div className="font-bold capitalize">{detailTxn.customer_pay_method || "cash"}</div></div>
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

      {/* Reversal Modal */}
      {reverseTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div onClick={() => !busyReverse && setReverseTxn(null)} className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-rose-300 bg-white p-6 shadow-2xl dark:border-rose-900/60 dark:bg-slate-900">
            <h3 className="text-sm font-black text-rose-600 dark:text-rose-400">
              Reverse Google Play Recharge {reverseTxn.transaction_number}?
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
                placeholder="e.g. Google Play code defective / customer refund"
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

      {/* Quick Add Customer */}
      {addCustomerModal && (
        <FloatingWindow
          isOpen={addCustomerModal}
          onClose={() => setAddCustomerModal(false)}
          title="Create New Customer"
        >
          <div className="space-y-4 p-4">
            <div>
              <label className="text-xs font-bold">Customer Full Name *</label>
              <input
                type="text"
                value={newCustName}
                onChange={(e) => setNewCustName(e.target.value)}
                placeholder="Enter customer name"
                className="w-full rounded-xl border p-2 text-xs font-bold outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold">10-Digit Mobile Number</label>
              <input
                type="tel"
                value={newCustPhone}
                onChange={(e) => setNewCustPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="9830123456"
                className="w-full rounded-xl border p-2 text-xs font-bold outline-none"
              />
            </div>
            <button
              type="button"
              onClick={handleAddCustomer}
              disabled={addingCustomer}
              className="btn-3d-tactile-primary w-full py-2.5 text-xs font-black"
            >
              {addingCustomer ? "Saving..." : "Create Customer"}
            </button>
          </div>
        </FloatingWindow>
      )}

      {/* WhatsApp Send Modal */}
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
    </div>
  );
}
