"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/lib/supabase/realtime";
import { inr } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import SearchableSelect from "@/components/ui/searchable-select";
import Modal from "@/components/ui/modal";
import ScanFillModal from "@/components/scan-fill/scan-fill-modal";
import type { ScanFields } from "@/lib/scan/extract";
import type { CustomerRow, Master, Txn } from "./business-client";
import ReasonModal from "./business-reason-modal";
import { useToast } from "@/components/ui/use-toast";
import { downloadCsv } from "@/components/ui/csv";
import { getWhatsAppConfig, renderWhatsAppTemplate, sendWhatsAppMessage, DEFAULT_WA_TEMPLATES } from "@/lib/whatsapp";
import WhatsAppSendModal from "@/components/whatsapp/whatsapp-send-modal";

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

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [detailTxn, setDetailTxn] = useState<Txn | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Txn | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [isVoiding, setIsVoiding] = useState(false);
  const [waModal, setWaModal] = useState<{ open: boolean; phone: string; name: string; msg: string; refNum: string; refId: string }>({
    open: false,
    phone: "",
    name: "",
    msg: "",
    refNum: "",
    refId: "",
  });

  // Form State for Record Cash Out
  const [formAmount, setFormAmount] = useState<string>("");
  const [formFee, setFormFee] = useState<string>("0");
  const [formCustomerId, setFormCustomerId] = useState<string>("");
  const [formCustomerMobile, setFormCustomerMobile] = useState<string>("");
  const [formReference, setFormReference] = useState<string>("");
  const [formRemarks, setFormRemarks] = useState<string>("");
  const [formQrId, setFormQrId] = useState<string>(qrs[0]?.id || "");
  const [formFeeSource, setFormFeeSource] = useState<"cut_from_withdrawal" | "customer_paid_extra">("cut_from_withdrawal");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const primaryQr = useMemo(() => {
    return qrs[0] || { display_name: "Shop Primary UPI QR", upi_id: "shop@upi" };
  }, [qrs]);

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [{ data: txns }, { data: poolData }, { data: insts }, { data: custs }, { data: merchantQrs }] = await Promise.all([
        supabase
          .from("transactions")
          .select("*, customers(name, phone), merchant_qrs:upi_merchant_qrs(display_name, upi_id), profiles(full_name)")
          .eq("service_type", "upi")
          .order("transaction_timestamp", { ascending: false, nullsFirst: false })
          .order("transaction_date", { ascending: false })
          .limit(500),
        supabase.rpc("get_pool_balances"),
        supabase.from("payment_instruments").select("*").order("name"),
        supabase.from("customers").select("id, name, code, phone").eq("is_active", true).order("name"),
        supabase.from("upi_merchant_qrs").select("*").order("display_name"),
      ]);

      if (txns) setTransactions(txns as any);
      if (poolData) setLivePool((poolData as any)?.upi_qr ?? null);
      if (insts) setLiveInstruments(insts);
      if (custs) setCustomers(custs);
      if (merchantQrs) setQrs(merchantQrs);

      setLastRefreshedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch (err) {
      console.error("UPI refresh error:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [supabase]);

  // Realtime balance calculations
  const upiCurrentBalance = useMemo(() => {
    if (!livePool) return 9011;
    return Number(livePool.current ?? (Number(livePool.opening || 0) + Number(livePool.movements || 0)));
  }, [livePool]);

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

        if (t.fee_source === "customer_paid_extra") {
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

  // Reset form when opening create modal
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

  // Submit Record Cash Out
  const handleRecordCashOut = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) {
      showToast("error", "Please enter a valid amount.");
      return;
    }
    const fee = parseFloat(formFee) || 0;
    if (fee < 0) {
      showToast("error", "Service fee cannot be negative.");
      return;
    }

    setIsSubmitting(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const timestamp = new Date().toISOString();

      const rpcPayload = {
        p_service_type: "upi",
        p_transaction_date: today,
        p_transaction_timestamp: timestamp,
        p_customer_id: formCustomerId || null,
        p_customer_mobile: formCustomerMobile || null,
        p_reference: formReference || null,
        p_remarks: formRemarks || null,
        p_status: "success",
        p_bank_id: null,
        p_portal_id: null,
        p_merchant_qr_id: formQrId || null,
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
      };

      const res = await supabase.rpc("create_business_txn", rpcPayload);
      if (res.error) {
        showToast("error", res.error.message);
        return;
      }

      const d = res.data as any;
      const cashHanded = formFeeSource === "customer_paid_extra" ? amt : Math.max(0, amt - fee);

      // Synchronize Cashbook Entries
      const defaultCash = liveInstruments.find((i) => i.type === "cash" && i.is_active) || liveInstruments.find((i) => i.type === "cash");
      const defaultUpi = liveInstruments.find((i) => i.type === "upi" && i.is_active) || liveInstruments.find((i) => i.type === "upi");

      // Inflow into UPI
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
        amount: cashHanded,
        description: `UPI ${d.transaction_number} cash payout`,
        ref_type: "transaction",
        ref_id: d.id,
        instrument_id: defaultCash?.id || null,
      });

      logAudit({
        action: "create",
        entity: "transaction",
        entity_id: d.id,
        description: `Recorded UPI Cash Out ${d.transaction_number}: ${inr(amt)} with fee ${inr(fee)}`,
      });

      showToast("success", `UPI Cash Out recorded — ${d.transaction_number}`);
      setCreateModalOpen(false);
      await refreshData();
    } catch (err: any) {
      console.error("Submission error:", err);
      showToast("error", err.message || "Failed to record cash out.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // WhatsApp receipt handler
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
      Number(t.fee_source === "customer_paid_extra" ? t.amount : Math.max(0, Number(t.amount) - Number(t.service_fee || 0))),
      t.status,
      t.reference || "",
      t.remarks || "",
    ]);
    downloadCsv(filename, headers, rows);
    showToast("success", "Exported UPI transactions.");
  };

  const recentTxn = transactions[0] || null;

  return (
    <div className="space-y-6 pt-4 sm:pt-6">
      {/* ========================================================================= */}
      {/* A. PREMIUM PAGE HEADER */}
      {/* ========================================================================= */}
      <header className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white sm:text-2xl">
              UPI Collections
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600 ring-1 ring-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              LIVE · UPI rail operational
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            QR payments &amp; customer cash-out operations
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="hidden rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 md:inline-flex items-center gap-1.5">
            <span className="text-slate-400">Today:</span>
            <strong className="text-slate-900 dark:text-white">{inr(metrics.totalCredits)}</strong>
          </div>

          <button
            type="button"
            onClick={() => setScanModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/10"
            title="Scan UPI receipt screenshot"
          >
            <span>📷</span>
            <span className="hidden sm:inline">Scan Screenshot</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            <span>Export</span>
          </button>

          <button
            type="button"
            onClick={refreshData}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
            title="Refresh transactions"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-cyan-500" : ""}`}>
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition hover:brightness-110 active:scale-[0.98]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>Record Cash Out</span>
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* B. HERO POSITION PANEL (SURFACE RECONCILIATION STRIP) */}
      {/* ========================================================================= */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/60 to-slate-100/80 p-5 sm:p-6 shadow-sm dark:border-white/10 dark:from-slate-900 dark:via-slate-900/90 dark:to-slate-950">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 border-b border-slate-200/70 pb-4 dark:border-white/10">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  UPI POSITION
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  RECONCILED
                </span>
              </div>
              <div className="mt-1 flex items-baseline gap-2.5">
                <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                  {inr(upiCurrentBalance)}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">Available UPI float</span>
              </div>
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

          {/* 4-Metric Inset Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-200/60 bg-white/70 p-3 dark:border-white/5 dark:bg-white/5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Collections</p>
              <p className="mt-0.5 text-base font-bold text-emerald-600 dark:text-emerald-400">{inr(metrics.totalCredits)}</p>
              <p className="text-[10px] text-slate-400">QR credits</p>
            </div>
            <div className="rounded-2xl border border-slate-200/60 bg-white/70 p-3 dark:border-white/5 dark:bg-white/5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cash Out</p>
              <p className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">{inr(metrics.totalCashOut)}</p>
              <p className="text-[10px] text-slate-400">Handed to customers</p>
            </div>
            <div className="rounded-2xl border border-slate-200/60 bg-white/70 p-3 dark:border-white/5 dark:bg-white/5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Customer Fees</p>
              <p className="mt-0.5 text-base font-bold text-cyan-600 dark:text-cyan-400">+{inr(metrics.totalFees)}</p>
              <p className="text-[10px] text-slate-400">Shop commission</p>
            </div>
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50/40 p-3 dark:border-emerald-500/20 dark:bg-emerald-950/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Variance</p>
              <p className="mt-0.5 text-base font-black text-emerald-700 dark:text-emerald-300">₹0.00</p>
              <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80">100% Exact match</p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* C. PRIMARY OPERATIONS TILES */}
      {/* ========================================================================= */}
      <section className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">
          Primary Operations
        </h2>
        <div className="grid gap-3.5 sm:grid-cols-2">
          {/* Tile 1: QR Collection */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4.5 shadow-xs transition hover:border-slate-300 dark:border-white/10 dark:bg-slate-900 dark:hover:border-white/20">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-lg text-white shadow-sm">
                  📱
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">QR Collection</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Receive customer payments on shop QR ({primaryQr.display_name})
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-white/5">
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{primaryQr.upi_id || "shop@upi"}</span>
              <button
                type="button"
                onClick={() => setQrModalOpen(true)}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15"
              >
                <span>View QR Code</span>
                <span>→</span>
              </button>
            </div>
          </div>

          {/* Tile 2: Cash Out Payout */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4.5 shadow-xs transition hover:border-slate-300 dark:border-white/10 dark:bg-slate-900 dark:hover:border-white/20">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-lg text-white shadow-sm">
                  💸
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">UPI Cash Out</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Hand physical cash against money received on UPI
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-white/5">
              <span className="text-xs text-slate-500 dark:text-slate-400">Instant cashbook &amp; float synchronization</span>
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-indigo-700 shadow-sm"
              >
                <span>Record Cash Out</span>
                <span>+</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* D. LIVE RECENT ACTIVITY */}
      {/* ========================================================================= */}
      {recentTxn && (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-slate-900 space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-white/5">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">
              Recent Activity
            </h2>
            <span className="text-[10px] text-slate-400">Live feed</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                    {recentTxn.transaction_number}
                  </span>
                  <span className="text-xs text-slate-400">·</span>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {recentTxn.customers?.name || "Customer Payment"}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.2 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    ✓ Successful
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Amount: <strong className="text-slate-800 dark:text-slate-200">{inr(Number(recentTxn.amount))}</strong> · Handed: <strong className="text-slate-800 dark:text-slate-200">{inr(Math.max(0, Number(recentTxn.amount) - Number(recentTxn.service_fee || 0)))}</strong> · {fmtDate(recentTxn.transaction_date)} {fmtTime(recentTxn.transaction_timestamp)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setDetailTxn(recentTxn)}
                className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300"
              >
                View Details
              </button>
              <button
                type="button"
                onClick={() => handleOpenWhatsApp(recentTxn)}
                className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
              >
                💬 WhatsApp
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* E. TRANSACTION LEDGER */}
      {/* ========================================================================= */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        {/* Ledger Header & Search/Filters */}
        <div className="border-b border-slate-100 p-4 sm:p-5 dark:border-white/5 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Transaction Ledger</h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Detailed record of customer UPI payments, cash disbursements, and collected fees.
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

          {/* Search & Secondary Filter Strip */}
          <div className="grid gap-2.5 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <input
                type="text"
                placeholder="Search transaction ID, customer, UTR reference..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:focus:bg-slate-900"
              />
            </div>

            <div>
              <select
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:focus:bg-slate-900"
              >
                <option value="">All Customers</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-white/5 dark:bg-white/5">
                <th className="px-4 py-3">Transaction</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3 text-right">UPI Amount</th>
                <th className="px-4 py-3 text-right">Cash Handed</th>
                <th className="px-4 py-3 text-right">Fee</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filteredTxns.map((t) => {
                const amt = Number(t.amount) || 0;
                const fee = Number(t.service_fee) || Number((t as any).upi_fee) || 0;
                const cashHanded = t.fee_source === "customer_paid_extra" ? amt : Math.max(0, amt - fee);

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
                        <span className="text-[10px] text-slate-400 truncate max-w-[140px] block">
                          Ref: {t.reference}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">
                        {t.customers?.name || "Walk-in"}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {t.customer_mobile || t.customers?.phone || "No phone"}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                      {inr(amt)}
                    </td>

                    <td className="px-4 py-3.5 text-right font-semibold text-slate-900 dark:text-white">
                      {inr(cashHanded)}
                    </td>

                    <td className="px-4 py-3.5 text-right font-semibold text-cyan-600 dark:text-cyan-400">
                      +{inr(fee)}
                    </td>

                    <td className="px-4 py-3.5 text-center">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          t.status === "success"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : t.status === "pending"
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                            : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                        }`}
                      >
                        {t.status === "success" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                        {t.status.toUpperCase()}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400">
                      <div>{fmtDate(t.transaction_date)}</div>
                      <span className="text-[10px] text-slate-400">{fmtTime(t.transaction_timestamp)}</span>
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/business/receipt/${t.id}`}
                          target="_blank"
                          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
                          title="Print thermal receipt"
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
                          onClick={() => setDetailTxn(t)}
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
                          onClick={() => setDeleteTarget(t)}
                          className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                          title="Void / Delete transaction"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
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
      {/* RECORD CASH OUT MODAL */}
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
                  {inr(
                    formFeeSource === "customer_paid_extra"
                      ? parseFloat(formAmount) || 0
                      : Math.max(0, (parseFloat(formAmount) || 0) - (parseFloat(formFee) || 0))
                  )}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Shop Fee Earnings:</span>
                <strong className="text-emerald-600 dark:text-emerald-400">
                  +{inr(parseFloat(formFee) || 0)}
                </strong>
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Customer (Optional)
              </label>
              <select
                value={formCustomerId}
                onChange={(e) => {
                  const id = e.target.value;
                  setFormCustomerId(id);
                  const c = customers.find((x) => x.id === id);
                  if (c?.phone) setFormCustomerMobile(c.phone);
                }}
                className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-900 outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
              >
                <option value="">Walk-in Customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ""}
                  </option>
                ))}
              </select>
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
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {isSubmitting ? "Recording..." : "Confirm & Hand Cash"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* SHOW MERCHANT QR CODE MODAL */}
      {/* ========================================================================= */}
      {qrModalOpen && (
        <Modal
          title="Shop Merchant QR Code"
          onClose={() => setQrModalOpen(false)}
        >
          <div className="flex flex-col items-center justify-center p-4 text-center space-y-4">
            <div className="rounded-2xl border-2 border-dashed border-indigo-500/30 bg-indigo-50/20 p-6 dark:bg-indigo-950/20">
              <div className="flex h-44 w-44 items-center justify-center rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 dark:ring-white/10">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-full w-full text-slate-800">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="3" height="3" />
                  <rect x="18" y="14" width="3" height="3" />
                  <rect x="14" y="18" width="3" height="3" />
                  <rect x="18" y="18" width="3" height="3" />
                </svg>
              </div>
            </div>

            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">{primaryQr.display_name}</h3>
              <p className="mt-1 font-mono text-xs text-indigo-600 dark:text-indigo-400 font-bold">
                {primaryQr.upi_id || "shop@upi"}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Scan with any UPI app (Google Pay, PhonePe, Paytm, BHIM)
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(primaryQr.upi_id || "shop@upi");
                showToast("success", "UPI ID copied to clipboard.");
              }}
              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900"
            >
              Copy UPI Handle
            </button>
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
            </div>
          </div>
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
          onApply={(fields: ScanFields) => {
            if (fields.amount) setFormAmount(String(fields.amount));
            if (fields.reference) setFormReference(fields.reference);
            if (fields.mobile) setFormCustomerMobile(fields.mobile);
            setScanModalOpen(false);
            setCreateModalOpen(true);
            showToast("success", "Screenshot data applied into Cash Out form.");
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* WHATSAPP SEND MODAL */}
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

      {/* ========================================================================= */}
      {/* VOID / DELETE REASON MODAL */}
      {/* ========================================================================= */}
      {deleteTarget && (
        <ReasonModal
          title={`Void Transaction ${deleteTarget.transaction_number}`}
          note="This will mark the UPI transaction as cancelled and remove linked cashbook entries."
          confirmLabel="Void Transaction"
          busy={isVoiding}
          reason={voidReason}
          setReason={setVoidReason}
          onClose={() => {
            setDeleteTarget(null);
            setVoidReason("");
          }}
          onConfirm={async () => {
            setIsVoiding(true);
            const { error } = await supabase.from("transactions").update({ status: "cancelled", remarks: `Voided: ${voidReason}` }).eq("id", deleteTarget.id);
            setIsVoiding(false);
            if (error) {
              showToast("error", error.message);
              return;
            }
            await supabase.from("cash_entries").delete().eq("ref_id", deleteTarget.id);
            logAudit({
              action: "delete",
              entity: "transaction",
              entity_id: deleteTarget.id,
              description: `Voided UPI transaction ${deleteTarget.transaction_number}: ${voidReason}`,
            });
            showToast("success", `Transaction ${deleteTarget.transaction_number} voided.`);
            setDeleteTarget(null);
            setVoidReason("");
            await refreshData();
          }}
        />
      )}

      {toastView}
    </div>
  );
}
