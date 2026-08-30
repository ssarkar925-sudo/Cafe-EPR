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
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [waTxn, setWaTxn] = useState<Txn | null>(null);
  const [receiptTxn, setReceiptTxn] = useState<Txn | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "success" | "pending" | "failed">("all");
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

  // Standard commission calculation (2.0% baseline margin on Google Play recharges)
  const commissionEarned = useMemo(() => {
    if (rechargeAmount <= 0) return 0;
    return Math.round((rechargeAmount * 2.0) / 100 * 100) / 100;
  }, [rechargeAmount]);

  const netProviderCost = Math.max(0, rechargeAmount - commissionEarned);
  const netOperatorIncome = custFee + commissionEarned;

  const selectedFundingAccount = useMemo(() => {
    return instruments.find((i) => i.id === fundingInstId);
  }, [instruments, fundingInstId]);

  // Analytics
  const todayStats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayTxns = transactions.filter(
      (t) =>
        t.transaction_date === todayStr &&
        ["google_play_recharge", "google_play"].includes(t.service_type)
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
      if (!["google_play_recharge", "google_play"].includes(t.service_type)) return false;
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
        .in("service_type", ["google_play_recharge", "google_play"]);
      const nextNum = "GPL-" + String((count ?? 0) + 1).padStart(4, "0");

      const { data: newTxn, error: txnErr } = await supabase
        .from("transactions")
        .insert({
          transaction_number: nextNum,
          service_type: "google_play_recharge",
          direction: "in",
          transaction_date: todayDate,
          transaction_timestamp: todayIso,
          customer_id: selectedCustomerId || null,
          customer_mobile: cleanMobile || null,
          reference: reference.trim() || voucherCode.trim() || null,
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
        })
        .select(`
          *,
          customers(name, phone),
          profiles(full_name)
        `)
        .single();

      if (txnErr) {
        setSubmitting(false);
        return showToast("error", txnErr.message);
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

      setTransactions((prev) => [newTxn, ...prev]);
      logAudit({
        action: "create",
        entity: "transactions",
        entity_id: newTxn.id,
        description: `Google Play recharge ${nextNum} of ${inr(rechargeAmount)} completed.`,
      });

      showToast("success", `Google Play Recharge ${nextNum} completed successfully!`);
      setReceiptTxn(newTxn);
      setVoucherCode("");
      setReference("");
      setRemarks("");
      setSubmitting(false);
    } catch (err: any) {
      setSubmitting(false);
      showToast("error", err?.message || "Failed to complete recharge.");
    }
  }

  return (
    <div className="space-y-6 pb-12">
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
                Digital Code &amp; Voucher Desk
              </span>
            </div>
            <h1 className="mt-2.5 text-2xl font-black tracking-tight sm:text-3xl">
              Google Play Recharge
            </h1>
            <p className="mt-1 text-xs text-slate-300 max-w-xl">
              Issue Google Play gift codes, balance recharges, and in-app purchase credits with automatic customer receipts and canonical double-entry accounting.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/business/bill-payment"
              className="btn-3d-tactile-secondary flex items-center gap-2 px-3.5 py-2 text-xs font-bold"
            >
              <span>← Bill Payment Hub</span>
            </Link>
            <Link
              href="/business/bill-payment/mobile-recharge/plans"
              className="btn-3d-tactile-secondary flex items-center gap-2 px-3.5 py-2 text-xs font-bold"
            >
              <span>⚙️ Plan Catalog</span>
            </Link>
          </div>
        </div>

        {/* 5-Card Analytics Grid */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
            <span className="text-[10px] font-black uppercase text-emerald-300">Today&apos;s Recharges</span>
            <div className="mt-1 text-xl font-black">{todayStats.count} <span className="text-xs font-normal text-slate-300">txns</span></div>
            <p className="mt-0.5 text-[11px] text-slate-400">{inr(todayStats.volume)} volume</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
            <span className="text-[10px] font-black uppercase text-teal-300">Customer Collection</span>
            <div className="mt-1 text-xl font-black text-teal-400">{inr(todayStats.collections)}</div>
            <p className="mt-0.5 text-[11px] text-slate-400">Total cash/UPI in</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
            <span className="text-[10px] font-black uppercase text-amber-300">Commission</span>
            <div className="mt-1 text-xl font-black text-amber-400">{inr(todayStats.commission)}</div>
            <p className="mt-0.5 text-[11px] text-slate-400">2.0% earned margin</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
            <span className="text-[10px] font-black uppercase text-cyan-300">Provider Cost</span>
            <div className="mt-1 text-xl font-black text-cyan-400">{inr(todayStats.providerCost)}</div>
            <p className="mt-0.5 text-[11px] text-slate-400">Debited from source</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
            <span className="text-[10px] font-black uppercase text-purple-300">Net Profit</span>
            <div className="mt-1 text-xl font-black text-emerald-400">{inr(todayStats.netIncome)}</div>
            <p className="mt-0.5 text-[11px] text-slate-300">{todayStats.successRate}% success rate</p>
          </div>
        </div>
      </div>

      {/* Main Terminal Form */}
      <div ref={formRef} className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Recharge Configuration */}
        <div className="space-y-6 lg:col-span-8">
          <div className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-md dark:border-white/10 dark:bg-slate-900">
            {/* Header & Quick Action */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-white/5">
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-white">
                  Google Play Recharge Terminal
                </h2>
                <p className="text-xs text-slate-500">
                  Select recharge amount or enter custom denomination.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScanModalOpen(true)}
                className="btn-3d-tactile-secondary flex items-center gap-2 px-3 py-1.5 text-xs font-bold"
              >
                <span>📷 Scan &amp; Fill</span>
              </button>
            </div>

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
                    className={`flex items-center gap-2 rounded-2xl border p-2.5 text-left transition ${
                      selectedRegion === r.code
                        ? "border-emerald-600 bg-emerald-50/70 shadow-sm ring-2 ring-emerald-600/30 dark:border-emerald-500 dark:bg-emerald-950/40"
                        : "border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-slate-800/40"
                    }`}
                  >
                    <span className="text-xl">{r.flag}</span>
                    <div>
                      <div className="text-xs font-black text-slate-900 dark:text-white">{r.name}</div>
                      <span className="text-[10px] text-slate-400">{r.currency}{r.min} - {r.currency}{r.max}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Popular Amount Presets */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
                  3. Select Amount (Popular Presets)
                </label>
                <span className="text-[11px] font-bold text-slate-400">Customizable</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {POPULAR_GOOGLE_PLAY_AMOUNTS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmount(String(preset))}
                    disabled={submitting}
                    className={`rounded-xl border px-3.5 py-2 text-xs font-black transition ${
                      Number(amount) === preset
                        ? "border-emerald-600 bg-emerald-50 text-emerald-700 shadow-sm ring-2 ring-emerald-600/30 dark:border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-300"
                        : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {activeRegion.currency}{preset}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Custom Amount Input */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
                  Recharge Denomination ({activeRegion.currency}) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-black text-slate-400">{activeRegion.currency}</span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Enter amount (e.g. 100)"
                    disabled={submitting}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs font-black text-slate-900 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Min: {activeRegion.currency}{activeRegion.min} · Max: {activeRegion.currency}{activeRegion.max}
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
                  Customer Service Fee (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-black text-slate-400">₹</span>
                  <input
                    type="number"
                    value={serviceFee}
                    onChange={(e) => setServiceFee(e.target.value)}
                    placeholder="0"
                    disabled={submitting}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs font-black text-slate-900 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">Extra counter fee charged to customer</p>
              </div>
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
              <div className="flex justify-between text-amber-600 dark:text-amber-400 font-bold">
                <span>Earned Margin (2.0%)</span>
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

      {waModalOpen && waTxn && (
        <WhatsAppSendModal
          open={waModalOpen}
          onClose={() => { setWaModalOpen(false); setWaTxn(null); }}
          phone={waTxn.customer_mobile || ""}
          initialMessage={`Google Play Recharge ${waTxn.transaction_number || ""} of ${inr(Number(waTxn.amount) || 0)} completed.`}
          recipientName={waTxn.customers?.name || "Valued Customer"}
          messageType="banking_txn"
          refId={waTxn.id}
          refNumber={waTxn.transaction_number || ""}
        />
      )}
    </div>
  );
}
