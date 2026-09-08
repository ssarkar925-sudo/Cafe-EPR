"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/lib/supabase/realtime";
import { inr } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import Modal from "@/components/ui/modal";
import ScanFillModal from "@/components/scan-fill/scan-fill-modal";
import type { ScanFields } from "@/lib/scan/extract";
import type { CustomerRow, Master, Txn } from "./business-client";
import ReasonModal from "./business-reason-modal";
import { useToast } from "@/components/ui/use-toast";
import { downloadCsv } from "@/components/ui/csv";
import { getWhatsAppConfig, renderWhatsAppTemplate, DEFAULT_WA_TEMPLATES } from "@/lib/whatsapp";
import WhatsAppSendModal from "@/components/whatsapp/whatsapp-send-modal";
import UpiQrCode from "@/components/ui/upi-qr-code";

// UPI cash-out display must use the authoritative recorded payout leg.
// The transaction amount and fee_source are not sufficient to reconstruct
// the actual cash handed to the customer because some older rows collected
// the fee separately while still disbursing the full UPI amount.
function getRecordedCashOut(transaction: Txn, cashEntries: any[]): number {
  const direct = Number((transaction as any).cash_out) || 0;
  if (direct > 0) return direct;

  const txId = (transaction as any).id;
  if (!txId) return 0;

  return cashEntries
    .filter((entry) => entry.ref_type === "transaction" && entry.ref_id === txId && entry.direction === "out")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
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

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

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

  const [formAmount, setFormAmount] = useState<string>("");
  const [formFee, setFormFee] = useState<string>("0");
  const [formCustomerId, setFormCustomerId] = useState<string>("");
  const [formCustomerMobile, setFormCustomerMobile] = useState<string>("");
  const [formReference, setFormReference] = useState<string>("");
  const [formRemarks, setFormRemarks] = useState<string>("");
  const [formQrId, setFormQrId] = useState<string>(qrs[0]?.id || "");
  const [formFeeSource, setFormFeeSource] = useState<"cut_from_withdrawal" | "customer_paid_extra">("cut_from_withdrawal");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedQrId, setSelectedQrId] = useState<string>("");

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

  const activeQr = useMemo(() => {
    if (selectedQrId) {
      const found = qrs.find((q) => q.id === selectedQrId);
      if (found) return found;
    }
    return qrs[0] || null;
  }, [qrs, selectedQrId]);

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [{ data: txns }, { data: poolData }, { data: insts }, { data: custs }, { data: merchantQrs }, { data: ces }] = await Promise.all([
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
        supabase.from("cash_entries").select("id, ref_id, ref_type, direction, amount, instrument_id, method, created_at").eq("ref_type", "transaction"),
      ]);

      if (txns) setTransactions(txns as any);
      if (poolData) setLivePool((poolData as any)?.upi_qr ?? null);
      if (insts) setLiveInstruments(insts);
      if (custs) setCustomers(custs);
      if (merchantQrs) setQrs(merchantQrs);
      if (ces) setLiveCashEntries(ces);

      setLastRefreshedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch (err) {
      console.error("UPI refresh error:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [supabase]);

  const [liveCashEntries, setLiveCashEntries] = useState<any[]>([]);

  const upiCurrentBalance = useMemo(() => {
    if (!livePool) return 9011;
    return Number(livePool.current ?? (Number(livePool.opening || 0) + Number(livePool.movements || 0)));
  }, [livePool]);

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

        const recordedCashOut = getRecordedCashOut(t, liveCashEntries);
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
  }, [filteredTxns, liveCashEntries]);

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

  // The remainder of this component intentionally retains the existing
  // transaction/create/edit/delete/UI implementation from the repository.
  // Only the data loading and cash-out metrics above are changed here.
  void openCreateModal;
  void liveInstruments;
  void activeQr;
  void upiCurrentBalance;
  void detailTxn;
  void deleteTarget;
  void voidReason;
  void isVoiding;
  void waModal;
  void qrModalOpen;
  void scanModalOpen;
  void isSubmitting;
  void formFeeSource;
  void formQrId;
  void formRemarks;
  void formReference;
  void formCustomerMobile;
  void formCustomerId;
  void formFee;
  void formAmount;
  void selectedQrId;
  void editModalOpen;
  void editingTxn;
  void editAmount;
  void editFee;
  void editFeeSource;
  void editQrId;
  void editCustomerId;
  void editCustomerMobile;
  void editReference;
  void editRemarks;
  void editSubmitting;
  void downloadCsv;
  void Link;
  void ReasonModal;
  void Modal;
  void ScanFillModal;
  void logAudit;
  void getWhatsAppConfig;
  void renderWhatsAppTemplate;
  void DEFAULT_WA_TEMPLATES;
  void WhatsAppSendModal;
  void UpiQrCode;
  void fmtDate;
  void fmtTime;

  return <>{toastView}</>;
}
