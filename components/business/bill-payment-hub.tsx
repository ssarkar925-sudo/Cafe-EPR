"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/lib/supabase/realtime";
import { inr } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import { useToast } from "@/components/ui/use-toast";
import FloatingWindow from "@/components/ui/floating-window";
import Modal from "@/components/ui/modal";
import WhatsAppSendModal from "@/components/whatsapp/whatsapp-send-modal";
import CommissionEditModal from "@/components/business/commission-edit-modal";
import RechargeWorkspace from "@/components/business/recharge-workspace";
import UtilityBillWorkspace from "@/components/business/utility-bill-workspace";
import { BILLER_CATEGORIES, POPULAR_BILLERS } from "@/components/business/utility-bill-workspace";
import type { CustomerRow, PaymentInstrument, RechargeProvider, RechargeSlab, Txn } from "@/components/business/recharge-workspace";
import type { BillCommissionConfig } from "@/lib/bill-payment/commission";

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

export function maskMobile(mobile: string | null | undefined): string {
  if (!mobile) return "";
  const clean = mobile.replace(/\D/g, "");
  if (clean.length === 10) {
    return `${clean.slice(0, 2)}••••••${clean.slice(-2)}`;
  }
  return clean;
}

export default function BillPaymentHub({
  initialTransactions,
  initialCustomers = [],
  initialRechargeProviders = [],
  initialRechargeSlabs = [],
  initialPaymentInstruments = [],
  initialBillCommissions = [],
  initialTab = "recharge",
  initialCategory,
  initialProvider,
}: {
  initialTransactions: Txn[];
  initialCustomers?: CustomerRow[];
  initialRechargeProviders?: RechargeProvider[];
  initialRechargeSlabs?: RechargeSlab[];
  initialPaymentInstruments?: PaymentInstrument[];
  initialBillCommissions?: BillCommissionConfig[];
  initialTab?: string;
  initialCategory?: string;
  initialProvider?: string;
}) {
  useRealtime(["transactions", "cash_entries", "recharge_commission_slabs", "bill_payment_commission_config"]);
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast, toastView } = useToast();

  const [activeTab, setActiveTab] = useState<"recharge" | "utility" | "history" | "commission">(() => {
    if (initialTab === "utility" || initialTab === "history" || initialTab === "commission" || initialTab === "recharge") {
      return initialTab;
    }
    return "recharge";
  });

  const [transactions, setTransactions] = useState<Txn[]>(initialTransactions);
  const [customers] = useState<CustomerRow[]>(initialCustomers);
  const [rechargeProviders] = useState<RechargeProvider[]>(initialRechargeProviders);
  const [rechargeSlabs, setRechargeSlabs] = useState<RechargeSlab[]>(initialRechargeSlabs);
  const [paymentInstruments] = useState<PaymentInstrument[]>(initialPaymentInstruments);
  const [billCommissions, setBillCommissions] = useState<BillCommissionConfig[]>(initialBillCommissions);

  // Sync tab with URL
  function handleTabChange(tabKey: "recharge" | "utility" | "history" | "commission") {
    setActiveTab(tabKey);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tabKey);
    window.history.replaceState(null, "", url.toString());
  }

  // --- HISTORY FILTERS & STATE ---
  const [searchQuery, setSearchQuery] = useState("");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [payMethodFilter, setPayMethodFilter] = useState<string>("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Modals
  const [viewTxn, setViewTxn] = useState<Txn | null>(null);
  const [editTxn, setEditTxn] = useState<Txn | null>(null);
  const [printTxn, setPrintTxn] = useState<Txn | null>(null);
  const [whatsAppTxn, setWhatsAppTxn] = useState<Txn | null>(null);
  const [reverseTxn, setReverseTxn] = useState<Txn | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [reversing, setReversing] = useState(false);

  // Commission Edit Modal
  const [commissionModalOpen, setCommissionModalOpen] = useState(false);
  const [selectedCommissionConfig, setSelectedCommissionConfig] = useState<BillCommissionConfig | null>(null);

  // Edit Form Fields
  const [editMobile, setEditMobile] = useState("");
  const [editRef, setEditRef] = useState("");
  const [editRemarks, setEditRemarks] = useState("");
  const [editCommission, setEditCommission] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (editTxn) {
      setEditMobile(editTxn.customer_mobile || "");
      setEditRef(editTxn.reference || "");
      setEditRemarks(editTxn.remarks || "");
      setEditCommission(String(editTxn.portal_commission ?? 0));
    }
  }, [editTxn]);

  // Classification Helper: identifies whether a transaction is Recharge, Utility Bill, or Google Play
  const classifyTxn = useCallback((t: Txn) => {
    const isGooglePlay =
      t.service_type === "google_play_recharge" ||
      t.service_type === "google_play" ||
      (t.service_type === "recharge" && ((t.remarks || "").toLowerCase().includes("google play") || (t.transaction_number || "").startsWith("GPL")));

    const isUtility =
      t.service_type === "bill_payment" ||
      t.service_type === "utility_bill" ||
      t.service_type === "utility" ||
      (t.service_type === "recharge" &&
        ((t as any).pool_credit_type === "utility" ||
          (t.remarks || "").toLowerCase().includes("utility") ||
          (t.remarks || "").toLowerCase().includes("bill") ||
          (t.transaction_number || "").startsWith("BIL")));

    let categoryIcon = "⚡";
    let typeLabel = "Utility Bill";
    let subCategory = "general";

    if (isGooglePlay) {
      typeLabel = "Google Play";
      categoryIcon = "🎮";
      subCategory = "google_play";
    } else if (isUtility) {
      const rem = (t.remarks || "").toLowerCase();
      if (rem.includes("electr") || rem.includes("wbsedcl") || rem.includes("cesc") || rem.includes("power")) {
        typeLabel = "Electricity Bill";
        categoryIcon = "⚡";
        subCategory = "electricity";
      } else if (rem.includes("gas") || rem.includes("lpg") || rem.includes("igl") || rem.includes("indane")) {
        typeLabel = "Gas Bill";
        categoryIcon = "🔥";
        subCategory = "gas";
      } else if (rem.includes("water") || rem.includes("kmc")) {
        typeLabel = "Water Bill";
        categoryIcon = "💧";
        subCategory = "water";
      } else if (rem.includes("broadband") || rem.includes("fiber") || rem.includes("airtel xstream") || rem.includes("jiofiber")) {
        typeLabel = "Broadband Bill";
        categoryIcon = "📡";
        subCategory = "broadband";
      } else if (rem.includes("dth") || rem.includes("tata play") || rem.includes("dish tv")) {
        typeLabel = "DTH Bill";
        categoryIcon = "📺";
        subCategory = "dth";
      } else {
        typeLabel = "Utility Bill";
        categoryIcon = "🏢";
        subCategory = "utility";
      }
    } else {
      typeLabel = "Mobile Recharge";
      categoryIcon = "📱";
      subCategory = "recharge";
    }

    const providerName = t.providers?.name || (t.remarks ? t.remarks.split("-")[1]?.split("(")[0]?.trim() : "") || (isUtility ? "BBPS Biller" : "Telecom Operator");

    return {
      isGooglePlay,
      isUtility,
      isRecharge: !isGooglePlay && !isUtility,
      typeLabel,
      categoryIcon,
      subCategory,
      providerName,
    };
  }, []);

  // Today Statistics
  const todayStr = new Date().toISOString().slice(0, 10);
  const stats = useMemo(() => {
    const todayList = transactions.filter((t) => t.transaction_date === todayStr);
    let totalVol = 0;
    let totalComm = 0;
    let totalFees = 0;
    let successCount = 0;
    let pendingCount = 0;

    for (const t of todayList) {
      if (t.status === "success") {
        successCount++;
        totalVol += Number(t.amount) || 0;
        totalComm += Number(t.portal_commission) || 0;
        totalFees += Number(t.service_fee) || 0;
      } else if (t.status === "pending") {
        pendingCount++;
      }
    }

    const successRate = todayList.length > 0 ? Math.round((successCount / todayList.length) * 100) : 100;
    return {
      todayCount: todayList.length,
      todayVol: totalVol,
      todayMargin: totalComm + totalFees,
      successRate,
      pendingCount,
    };
  }, [transactions, todayStr]);

  // Filtered History Transactions
  const filteredHistory = useMemo(() => {
    let list = [...transactions];

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((t) => {
        const info = classifyTxn(t);
        return (
          t.transaction_number.toLowerCase().includes(q) ||
          (t.customer_mobile || "").includes(q) ||
          (t.reference || "").toLowerCase().includes(q) ||
          (t.remarks || "").toLowerCase().includes(q) ||
          (t.customers?.name || "").toLowerCase().includes(q) ||
          info.providerName.toLowerCase().includes(q)
        );
      });
    }

    // Service Filter
    if (serviceFilter !== "all") {
      list = list.filter((t) => {
        const info = classifyTxn(t);
        if (serviceFilter === "recharge") return info.isRecharge;
        if (serviceFilter === "google_play") return info.isGooglePlay;
        if (serviceFilter === "utility_all") return info.isUtility;
        return info.subCategory === serviceFilter;
      });
    }

    // Status Filter
    if (statusFilter !== "all") {
      list = list.filter((t) => t.status === statusFilter);
    }

    // Date Filter
    if (dateFilter !== "all") {
      const now = new Date();
      if (dateFilter === "today") {
        list = list.filter((t) => t.transaction_date === todayStr);
      } else if (dateFilter === "yesterday") {
        const yest = new Date(now.setDate(now.getDate() - 1)).toISOString().slice(0, 10);
        list = list.filter((t) => t.transaction_date === yest);
      } else if (dateFilter === "last7") {
        const d7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
        list = list.filter((t) => t.transaction_date >= d7);
      } else if (dateFilter === "month") {
        const m = todayStr.slice(0, 7);
        list = list.filter((t) => t.transaction_date.startsWith(m));
      }
    }

    // Payment Method Filter
    if (payMethodFilter !== "all") {
      list = list.filter((t) => (t.customer_pay_method || "").toLowerCase() === payMethodFilter.toLowerCase());
    }

    // Payment Account Filter
    if (accountFilter !== "all") {
      list = list.filter((t) => t.instrument_id === accountFilter);
    }

    return list;
  }, [transactions, searchQuery, serviceFilter, statusFilter, dateFilter, payMethodFilter, accountFilter, todayStr, classifyTxn]);

  // Paginated List
  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / pageSize));
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredHistory.slice(start, start + pageSize);
  }, [filteredHistory, currentPage, pageSize]);

  // --- ACTIONS ---

  // 1. Edit Handler with Atomic Financial Adjustment
  async function handleSaveEdit() {
    if (!editTxn || editing) return;
    setEditing(true);

    try {
      const amt = Number(editTxn.amount) || 0;
      const newComm = Number(editCommission) || 0;
      const fee = Number(editTxn.service_fee) || 0;
      const newProviderCost = Math.max(0, amt - newComm);

      // Update transaction row
      const { data: updated, error } = await supabase
        .from("transactions")
        .update({
          customer_mobile: editMobile.replace(/\D/g, "") || null,
          reference: editRef.trim() || null,
          remarks: editRemarks.trim() || null,
          portal_commission: newComm,
          pool_out: newProviderCost,
        })
        .eq("id", editTxn.id)
        .select("*, customers(name, phone), providers:recharge_providers(name), profiles(full_name)")
        .single();

      if (error) {
        showToast("error", error.message);
        setEditing(false);
        return;
      }

      // Reconcile cash_entries if commission changed
      if (editTxn.instrument_id && newProviderCost !== Number(editTxn.pool_out)) {
        await supabase
          .from("cash_entries")
          .update({ amount: newProviderCost })
          .eq("ref_id", editTxn.id)
          .eq("direction", "out");
      }

      await logAudit({
        action: "edit",
        entity: "transaction",
        entity_id: editTxn.id,
        description: `Updated Bill Payment / Recharge ${editTxn.transaction_number}`,
        details: {
          previous: {
            mobile: editTxn.customer_mobile,
            reference: editTxn.reference,
            commission: editTxn.portal_commission,
          },
          updated: {
            mobile: editMobile,
            reference: editRef,
            commission: newComm,
          },
        },
      });

      setTransactions((prev) => prev.map((t) => (t.id === editTxn.id ? { ...t, ...updated } : t)));
      setEditTxn(null);
      showToast("success", `✓ Transaction ${editTxn.transaction_number} updated successfully.`);
    } catch (err: any) {
      showToast("error", err.message || "Failed to update transaction.");
    } finally {
      setEditing(false);
    }
  }

  // 2. Reverse / Delete Handler
  async function handleConfirmReverse() {
    if (!reverseTxn || reversing) return;
    setReversing(true);

    try {
      const { error } = await supabase.rpc("reverse_business_txn", {
        p_txn_id: reverseTxn.id,
        p_reason: reverseReason.trim() || "User requested cancellation / reversal in Bill Payment Hub",
      });

      if (error) {
        showToast("error", error.message);
        setReversing(false);
        return;
      }

      await logAudit({
        action: "reverse",
        entity: "transaction",
        entity_id: reverseTxn.id,
        description: `Reversed transaction ${reverseTxn.transaction_number} | Reason: ${reverseReason || "User Cancellation"}`,
      });

      setTransactions((prev) =>
        prev.map((t) => (t.id === reverseTxn.id ? { ...t, status: "reversed" } : t))
      );
      setReverseTxn(null);
      setReverseReason("");
      showToast("success", `✓ Transaction ${reverseTxn.transaction_number} has been reversed.`);
    } catch (err: any) {
      showToast("error", err.message || "Failed to reverse transaction.");
    } finally {
      setReversing(false);
    }
  }

  // 3. Print Handler
  function triggerPrint(txn: Txn) {
    setPrintTxn(txn);
    setTimeout(() => {
      window.print();
    }, 200);
  }

  // 4. WhatsApp Message Generator
  function generateWhatsAppText(t: Txn) {
    const info = classifyTxn(t);
    const dateStr = fmtDate(t.transaction_timestamp || t.transaction_date);
    const timeStr = fmtTime(t.transaction_timestamp);
    const amt = inr(Number(t.amount) || 0);

    if (info.isRecharge) {
      return `*RECHARGE RECEIPT — SARKAR COMMUNICATION*\n` +
        `Txn ID: ${t.transaction_number}\n` +
        `Mobile: ${t.customer_mobile || "—"}\n` +
        `Operator: ${info.providerName}\n` +
        `Amount: ${amt}\n` +
        `Date: ${dateStr} ${timeStr}\n` +
        `Status: Successful\n\n` +
        `Thank you for recharging with us!`;
    }

    if (info.isGooglePlay) {
      return `*GOOGLE PLAY RECHARGE RECEIPT — SARKAR COMMUNICATION*\n` +
        `Txn ID: ${t.transaction_number}\n` +
        `Recharge Amount: ${amt}\n` +
        `Voucher / Code: ${t.reference || "—"}\n` +
        `Date: ${dateStr} ${timeStr}\n` +
        `Status: Successful\n\n` +
        `Redeem code in Google Play Store > Payments & Subscriptions.`;
    }

    return `*UTILITY BILL PAYMENT RECEIPT — SARKAR COMMUNICATION*\n` +
      `Txn ID: ${t.transaction_number}\n` +
      `Biller: ${info.providerName}\n` +
      `Consumer / Ref: ${t.reference || "—"}\n` +
      `Bill Amount: ${amt}\n` +
      `Total Paid: ${inr((Number(t.amount) || 0) + (Number(t.service_fee) || 0))}\n` +
      `Date: ${dateStr} ${timeStr}\n` +
      `Status: Successful\n\n` +
      `Thank you for paying your bill with us!`;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8 space-y-6">
      {/* 1. Header & Quick Analytics Banner */}
      <div className="rounded-3xl border border-slate-200/90 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/90">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-500/25 ring-4 ring-indigo-50 dark:ring-indigo-950/50">
              <span className="text-2xl font-black">⚡</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                  Bill Payment &amp; Digital Recharge
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                  BBPS Certified Terminal
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
                Process mobile recharges, BBPS utility bill settlements (Electricity, Gas, Water, Broadband), and manage journal history.
              </p>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-2 dark:border-white/10 dark:bg-slate-800/60">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Today Volume</span>
              <span className="text-base font-black text-slate-900 dark:text-white">{inr(stats.todayVol)}</span>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-2 dark:border-emerald-500/30 dark:bg-emerald-950/40">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Net Margin</span>
              <span className="text-base font-black text-emerald-700 dark:text-emerald-300">+{inr(stats.todayMargin)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Segmented Workspace Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-1">
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
          <button
            onClick={() => handleTabChange("recharge")}
            className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold transition select-none ${
              activeTab === "recharge"
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-2 ring-blue-600"
                : "border border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
            }`}
          >
            <span>📱</span>
            <span>Mobile Recharge</span>
          </button>

          <button
            onClick={() => handleTabChange("utility")}
            className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold transition select-none ${
              activeTab === "utility"
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-2 ring-blue-600"
                : "border border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
            }`}
          >
            <span>🏢</span>
            <span>Utility Bill Payment (BBPS)</span>
          </button>

          <button
            onClick={() => handleTabChange("history")}
            className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold transition select-none ${
              activeTab === "history"
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-2 ring-blue-600"
                : "border border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
            }`}
          >
            <span>📜</span>
            <span>Payment History &amp; Journal</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 dark:bg-white/10 dark:text-slate-300">
              {transactions.length}
            </span>
          </button>

          <button
            onClick={() => handleTabChange("commission")}
            className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold transition select-none ${
              activeTab === "commission"
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-2 ring-blue-600"
                : "border border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
            }`}
          >
            <span>⚙️</span>
            <span>Commission Rules</span>
          </button>
        </div>
      </div>

      {/* 3. Tab Workspace Content */}

      {/* TAB 1: Mobile Recharge */}
      {activeTab === "recharge" && (
        <div className="space-y-6">
          <RechargeWorkspace
            initialTransactions={transactions}
            initialCustomers={customers}
            initialRechargeProviders={rechargeProviders}
            initialRechargeSlabs={rechargeSlabs}
            initialPaymentInstruments={paymentInstruments}
          />
        </div>
      )}

      {/* TAB 2: Utility Bill Payment */}
      {activeTab === "utility" && (
        <div className="space-y-6">
          <UtilityBillWorkspace
            initialTransactions={transactions}
            initialCustomers={customers}
            initialPaymentInstruments={paymentInstruments}
          />
        </div>
      )}

      {/* TAB 3: Payment History & All Journal */}
      {activeTab === "history" && (
        <div className="space-y-6">
          {/* Filter Bar */}
          <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
              {/* Search */}
              <div className="md:col-span-4 relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search Txn #, Mobile, Consumer ID, Biller…"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                </div>
              </div>

              {/* Service Type */}
              <div className="md:col-span-2">
                <select
                  value={serviceFilter}
                  onChange={(e) => {
                    setServiceFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 px-3 text-xs font-semibold text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                >
                  <option value="all">All Services</option>
                  <option value="recharge">📱 Mobile Recharge</option>
                  <option value="utility_all">🏢 All Utility Bills</option>
                  <option value="electricity">⚡ Electricity</option>
                  <option value="gas">🔥 Gas &amp; LPG</option>
                  <option value="water">💧 Water Supply</option>
                  <option value="broadband">📡 Broadband</option>
                  <option value="dth">📺 DTH Cable</option>
                  <option value="google_play">🎮 Google Play</option>
                </select>
              </div>

              {/* Status */}
              <div className="md:col-span-2">
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 px-3 text-xs font-semibold text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                >
                  <option value="all">All Statuses</option>
                  <option value="success">🟢 Success</option>
                  <option value="pending">🟡 Pending</option>
                  <option value="failed">🔴 Failed</option>
                  <option value="reversed">⚪ Reversed</option>
                </select>
              </div>

              {/* Date */}
              <div className="md:col-span-2">
                <select
                  value={dateFilter}
                  onChange={(e) => {
                    setDateFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 px-3 text-xs font-semibold text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="last7">Last 7 Days</option>
                  <option value="month">This Month</option>
                </select>
              </div>

              {/* Payment Method */}
              <div className="md:col-span-2">
                <select
                  value={payMethodFilter}
                  onChange={(e) => {
                    setPayMethodFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 px-3 text-xs font-semibold text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                >
                  <option value="all">All Methods</option>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="bank">Bank</option>
                  <option value="wallet">Wallet</option>
                  <option value="due">Khata Due</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200/80 bg-slate-50/80 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3.5">Date / Time</th>
                    <th className="px-4 py-3.5">Txn No</th>
                    <th className="px-4 py-3.5">Service &amp; Biller</th>
                    <th className="px-4 py-3.5">Target / Consumer</th>
                    <th className="px-4 py-3.5">Bill Amount</th>
                    <th className="px-4 py-3.5">Fee &amp; Margin</th>
                    <th className="px-4 py-3.5">Payment</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-medium">
                  {paginatedList.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        No transactions found matching your filter criteria.
                      </td>
                    </tr>
                  ) : (
                    paginatedList.map((t) => {
                      const info = classifyTxn(t);
                      const amt = Number(t.amount) || 0;
                      const fee = Number(t.service_fee) || 0;
                      const comm = Number(t.portal_commission) || 0;
                      const netMargin = fee + comm;

                      return (
                        <tr key={t.id} className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition">
                          {/* Date / Time */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="block font-bold text-slate-900 dark:text-white">
                              {fmtDate(t.transaction_timestamp || t.transaction_date)}
                            </span>
                            <span className="block text-[10px] text-slate-400">{fmtTime(t.transaction_timestamp)}</span>
                          </td>

                          {/* Txn Number */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                              {t.transaction_number}
                            </span>
                          </td>

                          {/* Service & Biller */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <span className="text-base">{info.categoryIcon}</span>
                              <div className="min-w-0">
                                <span className="block truncate font-bold text-slate-900 dark:text-white">
                                  {info.providerName}
                                </span>
                                <span className="block truncate text-[10px] text-slate-400">{info.typeLabel}</span>
                              </div>
                            </div>
                          </td>

                          {/* Target / Consumer */}
                          <td className="px-4 py-3.5">
                            <div className="min-w-0">
                              <span className="block font-mono font-bold text-slate-800 dark:text-slate-200 truncate">
                                {t.customer_mobile || t.reference || "—"}
                              </span>
                              {t.customers?.name && (
                                <span className="block truncate text-[10px] text-slate-400">{t.customers.name}</span>
                              )}
                            </div>
                          </td>

                          {/* Amount */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="font-bold text-slate-900 dark:text-white">{inr(amt)}</span>
                          </td>

                          {/* Fee & Margin */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="block font-bold text-emerald-600 dark:text-emerald-400">
                              +{inr(netMargin)}
                            </span>
                            <span className="block text-[9px] text-slate-400">
                              {comm > 0 ? `Comm ₹${comm}` : ""} {fee > 0 ? `Fee ₹${fee}` : ""}
                            </span>
                          </td>

                          {/* Payment Method */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="inline-flex rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700 dark:bg-white/10 dark:text-slate-300">
                              {t.customer_pay_method || "CASH"}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                t.status === "success"
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                                  : t.status === "pending"
                                  ? "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                                  : t.status === "reversed"
                                  ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400"
                                  : "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  t.status === "success"
                                    ? "bg-emerald-500"
                                    : t.status === "pending"
                                    ? "bg-amber-500"
                                    : t.status === "reversed"
                                    ? "bg-slate-500"
                                    : "bg-rose-500"
                                }`}
                              />
                              {t.status.toUpperCase()}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              {/* View */}
                              <button
                                onClick={() => setViewTxn(t)}
                                title="View Details"
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/40 dark:hover:text-blue-400 transition"
                              >
                                👁️
                              </button>

                              {/* Edit */}
                              <button
                                onClick={() => setEditTxn(t)}
                                title="Edit Transaction"
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/40 dark:hover:text-amber-400 transition"
                              >
                                ✏️
                              </button>

                              {/* Print */}
                              <button
                                onClick={() => triggerPrint(t)}
                                title="Print Receipt"
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-purple-50 hover:text-purple-600 dark:hover:bg-purple-950/40 dark:hover:text-purple-400 transition"
                              >
                                🖨️
                              </button>

                              {/* WhatsApp */}
                              <button
                                onClick={() => setWhatsAppTxn(t)}
                                title="Send WhatsApp"
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 transition"
                              >
                                💬
                              </button>

                              {/* Reverse / Delete */}
                              <button
                                onClick={() => setReverseTxn(t)}
                                title="Reverse / Cancel"
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 transition"
                              >
                                🗑️
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

            {/* Pagination Controls */}
            <div className="flex flex-col gap-3 border-t border-slate-200/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-white/10">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
                >
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
                <span className="ml-2">
                  Showing {filteredHistory.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} to{" "}
                  {Math.min(currentPage * pageSize, filteredHistory.length)} of {filteredHistory.length}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="rounded-xl border border-slate-200 px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:text-slate-300"
                >
                  Previous
                </button>
                <span className="px-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-xl border border-slate-200 px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:text-slate-300"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Commission Rules Manager */}
      {activeTab === "commission" && (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                BBPS &amp; Recharge Commission Matrix
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Configure retailer commission rules for utility billers and mobile recharge operators. Changes apply strictly to future transactions.
              </p>
            </div>
            <button
              onClick={() => {
                setSelectedCommissionConfig(null);
                setCommissionModalOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/25 hover:bg-blue-700 transition"
            >
              <span>+</span>
              <span>Add Commission Rule</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* BBPS Category Rules */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>🏢</span>
                <span>BBPS Utility Service Categories</span>
              </h3>
              <div className="space-y-2">
                {BILLER_CATEGORIES.map((cat) => {
                  const custom = billCommissions.find((c) => c.category_id === cat.id && !c.biller_id);
                  const isPct = custom ? custom.commission_type === "percentage" : Boolean(cat.isPercentage);
                  const val = custom ? custom.commission_value : cat.defaultCommission;

                  return (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 p-3 dark:border-white/5 dark:bg-slate-800/40"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{cat.icon}</span>
                        <div>
                          <span className="block text-xs font-bold text-slate-900 dark:text-white">{cat.name}</span>
                          <span className="block text-[10px] text-slate-400">{cat.idLabel}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-extrabold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                          {isPct ? `${val}%` : `₹${Number(val).toFixed(2)}`}
                        </span>
                        <button
                          onClick={() => {
                            setSelectedCommissionConfig(
                              custom || ({
                                id: "",
                                category_id: cat.id,
                                category_name: cat.name,
                                service_type: "utility_bill",
                                commission_type: isPct ? "percentage" : "flat",
                                commission_value: Number(val),
                                is_active: true,
                              } as any)
                            );
                            setCommissionModalOpen(true);
                          }}
                          className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white"
                        >
                          ✏️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recharge Operator Slabs */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>📱</span>
                <span>Prepaid Operator Slabs</span>
              </h3>
              <div className="space-y-2">
                {rechargeProviders.map((p) => {
                  const slab = rechargeSlabs.find((s) => s.provider_id === p.id);
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 p-3 dark:border-white/5 dark:bg-slate-800/40"
                    >
                      <div>
                        <span className="block text-xs font-bold text-slate-900 dark:text-white">{p.name}</span>
                        <span className="block text-[10px] text-slate-400">Prepaid All Slabs</span>
                      </div>
                      <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-extrabold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                        {slab ? `${slab.commission_percent}%` : "3.00%"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 1: VIEW TRANSACTION INSPECTOR --- */}
      {viewTxn && (
        <FloatingWindow
          isOpen={Boolean(viewTxn)}
          title={`Transaction ${viewTxn.transaction_number}`}
          onClose={() => setViewTxn(null)}
          size="lg"
        >
          <div className="space-y-6 p-6">
            {/* Header pill */}
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/50">
              <div>
                <span className="block text-base font-black text-slate-900 dark:text-white">
                  {classifyTxn(viewTxn).providerName}
                </span>
                <span className="text-xs text-slate-500">
                  {fmtDate(viewTxn.transaction_timestamp || viewTxn.transaction_date)} at{" "}
                  {fmtTime(viewTxn.transaction_timestamp)}
                </span>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  viewTxn.status === "success"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                    : "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
                }`}
              >
                {viewTxn.status.toUpperCase()}
              </span>
            </div>

            {/* Financial Grid */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-2xl border border-slate-200/80 p-3.5 dark:border-white/10">
                <span className="block text-[10px] uppercase font-bold text-slate-400">Bill Amount</span>
                <span className="text-base font-bold text-slate-900 dark:text-white">
                  {inr(Number(viewTxn.amount) || 0)}
                </span>
              </div>
              <div className="rounded-2xl border border-slate-200/80 p-3.5 dark:border-white/10">
                <span className="block text-[10px] uppercase font-bold text-slate-400">Service Fee</span>
                <span className="text-base font-bold text-slate-900 dark:text-white">
                  {inr(Number(viewTxn.service_fee) || 0)}
                </span>
              </div>
              <div className="rounded-2xl border border-slate-200/80 p-3.5 dark:border-white/10">
                <span className="block text-[10px] uppercase font-bold text-slate-400">Commission</span>
                <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                  +{inr(Number(viewTxn.portal_commission) || 0)}
                </span>
              </div>
              <div className="rounded-2xl border border-slate-200/80 p-3.5 dark:border-white/10">
                <span className="block text-[10px] uppercase font-bold text-slate-400">Provider Cost</span>
                <span className="text-base font-bold text-slate-900 dark:text-white">
                  {inr(Number(viewTxn.pool_out) || 0)}
                </span>
              </div>
            </div>

            {/* Double-Entry Posting Summary */}
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-500/20 dark:bg-indigo-950/20 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-300">
                ⚖️ Financial Posting &amp; Audit Trace
              </h4>
              <div className="text-xs space-y-1.5 text-slate-700 dark:text-slate-300">
                <div className="flex justify-between">
                  <span>Customer Collection:</span>
                  <span className="font-bold">
                    {inr((Number(viewTxn.amount) || 0) + (Number(viewTxn.service_fee) || 0))} via{" "}
                    {(viewTxn.customer_pay_method || "Cash").toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Provider Float Debit:</span>
                  <span className="font-bold">-{inr(Number(viewTxn.pool_out) || 0)}</span>
                </div>
                <div className="flex justify-between border-t border-indigo-200/60 pt-1 font-bold text-emerald-700 dark:text-emerald-300">
                  <span>Net Shop Income:</span>
                  <span>
                    +{inr((Number(viewTxn.service_fee) || 0) + (Number(viewTxn.portal_commission) || 0))}
                  </span>
                </div>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-white/5">
                <span className="text-slate-400">Customer Target / Mobile:</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                  {viewTxn.customer_mobile || viewTxn.reference || "—"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-white/5">
                <span className="text-slate-400">Reference / Operator Txn ID:</span>
                <span className="font-mono text-slate-800 dark:text-slate-200">{viewTxn.reference || "—"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-white/5">
                <span className="text-slate-400">Remarks:</span>
                <span className="text-slate-800 dark:text-slate-200">{viewTxn.remarks || "—"}</span>
              </div>
            </div>
          </div>
        </FloatingWindow>
      )}

      {/* --- MODAL 2: EDIT TRANSACTION --- */}
      {editTxn && (
        <Modal
          title={`Edit Transaction ${editTxn.transaction_number}`}
          onClose={() => setEditTxn(null)}
        >
          <div className="space-y-4 p-2">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Customer Mobile / Phone</label>
              <input
                type="text"
                value={editMobile}
                onChange={(e) => setEditMobile(e.target.value)}
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-semibold dark:border-white/10 dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Operator Reference / Txn ID</label>
              <input
                type="text"
                value={editRef}
                onChange={(e) => setEditRef(e.target.value)}
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-semibold dark:border-white/10 dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Commission Override (₹)</label>
              <input
                type="number"
                step="0.01"
                value={editCommission}
                onChange={(e) => setEditCommission(e.target.value)}
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-semibold dark:border-white/10 dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Remarks</label>
              <textarea
                rows={2}
                value={editRemarks}
                onChange={(e) => setEditRemarks(e.target.value)}
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-semibold dark:border-white/10 dark:bg-slate-800"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditTxn(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold dark:border-white/10"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={editing}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-500/25 hover:bg-blue-700"
              >
                {editing ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* --- MODAL 3: REVERSE TRANSACTION CONFIRMATION --- */}
      {reverseTxn && (
        <Modal
          title={`Reverse Transaction ${reverseTxn.transaction_number}`}
          onClose={() => setReverseTxn(null)}
        >
          <div className="space-y-4 p-2">
            <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-xs text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-300">
              <span className="block font-bold">⚠️ Warning: Financial Reversal</span>
              <p className="mt-1">
                Reversing this transaction will create compensating negative entries in the cashbook and refund the provider float. The record will remain in the audit journal marked as <strong>REVERSED</strong>.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Reason for Reversal</label>
              <input
                type="text"
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                placeholder="e.g. Failed at operator end, customer canceled"
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-semibold dark:border-white/10 dark:bg-slate-800"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setReverseTxn(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold dark:border-white/10"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReverse}
                disabled={reversing}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-rose-500/25 hover:bg-rose-700"
              >
                {reversing ? "Reversing…" : "Confirm Reversal"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* --- MODAL 4: PRINT RECEIPT DIALOG --- */}
      {printTxn && (
        <Modal title="Print Receipt" onClose={() => setPrintTxn(null)}>
          <div className="p-4 space-y-4">
            <div id="printable-receipt" className="rounded-2xl border border-slate-200 p-6 bg-white text-slate-900 space-y-4 font-mono text-xs shadow-sm">
              <div className="text-center border-b pb-3">
                <span className="text-base font-black tracking-tight block">SARKAR COMMUNICATION</span>
                <span className="text-[10px] text-slate-500 block">Digital Financial &amp; Telecom Services</span>
                <span className="text-xs font-bold block mt-1">
                  {classifyTxn(printTxn).typeLabel.toUpperCase()} RECEIPT
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>Txn No:</span>
                  <span className="font-bold">{printTxn.transaction_number}</span>
                </div>
                <div className="flex justify-between">
                  <span>Date:</span>
                  <span>{fmtDate(printTxn.transaction_timestamp || printTxn.transaction_date)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Service:</span>
                  <span className="font-bold">{classifyTxn(printTxn).providerName}</span>
                </div>
                <div className="flex justify-between">
                  <span>Target:</span>
                  <span className="font-bold">{printTxn.customer_mobile || printTxn.reference}</span>
                </div>
              </div>

              <div className="border-t border-b py-2 space-y-1">
                <div className="flex justify-between">
                  <span>Bill Amount:</span>
                  <span>{inr(Number(printTxn.amount) || 0)}</span>
                </div>
                {Number(printTxn.service_fee) > 0 && (
                  <div className="flex justify-between">
                    <span>Service Fee:</span>
                    <span>{inr(Number(printTxn.service_fee) || 0)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm border-t pt-1">
                  <span>Total Paid:</span>
                  <span>{inr((Number(printTxn.amount) || 0) + (Number(printTxn.service_fee) || 0))}</span>
                </div>
              </div>

              <div className="text-center text-[10px] text-slate-500 pt-1">
                <span>Status: {printTxn.status.toUpperCase()}</span>
                <span className="block mt-1">Thank you for visiting!</span>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPrintTxn(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
              >
                Print Now
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* --- MODAL 5: WHATSAPP DISPATCH MODAL --- */}
      {whatsAppTxn && (
        <Modal title="WhatsApp Receipt" onClose={() => setWhatsAppTxn(null)}>
          <div className="p-4 space-y-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 text-xs dark:border-emerald-500/30 dark:bg-emerald-950/30">
              <span className="block font-bold text-emerald-800 dark:text-emerald-300">
                Message Preview:
              </span>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-slate-800 dark:text-slate-200 bg-white/70 dark:bg-slate-900/60 p-3 rounded-xl border border-emerald-200/50">
                {generateWhatsAppText(whatsAppTxn)}
              </pre>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setWhatsAppTxn(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold dark:border-white/10"
              >
                Cancel
              </button>
              <a
                href={`https://wa.me/${whatsAppTxn.customer_mobile ? "91" + whatsAppTxn.customer_mobile.replace(/\D/g, "") : ""}?text=${encodeURIComponent(generateWhatsAppText(whatsAppTxn))}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setWhatsAppTxn(null)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-emerald-500/25 hover:bg-emerald-700"
              >
                <span>💬</span>
                <span>Send via WhatsApp</span>
              </a>
            </div>
          </div>
        </Modal>
      )}

      {/* --- MODAL 6: COMMISSION EDIT MODAL --- */}
      {commissionModalOpen && (
        <CommissionEditModal
          open={commissionModalOpen}
          existingConfig={selectedCommissionConfig}
          onClose={() => {
            setCommissionModalOpen(false);
            setSelectedCommissionConfig(null);
          }}
          onSaved={(newConfig) => {
            setBillCommissions((prev) => {
              const idx = prev.findIndex((c) => c.category_id === newConfig.category_id && c.biller_id === newConfig.biller_id);
              if (idx >= 0) {
                const copy = [...prev];
                copy[idx] = newConfig;
                return copy;
              }
              return [newConfig, ...prev];
            });
            setCommissionModalOpen(false);
            setSelectedCommissionConfig(null);
            showToast("success", "Commission rule saved successfully.");
          }}
        />
      )}

      {toastView}
    </div>
  );
}
