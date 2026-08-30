"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/lib/supabase/realtime";
import { inr } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import BusinessFormModal from "./business-form-modal";
import ReasonModal from "./business-reason-modal";
import SearchableSelect from "@/components/ui/searchable-select";
import StatCard from "@/components/ui/stat-card";
import ViewToggle from "@/components/ui/view-toggle";
import CompactToggle from "@/components/ui/compact-toggle";
import { useToast } from "@/components/ui/use-toast";
import { downloadCsv } from "@/components/ui/csv";
import { DEFAULT_WA_TEMPLATES, getWhatsAppConfig, renderWhatsAppTemplate, sendWhatsAppMessage } from "@/lib/whatsapp";
import WhatsAppSendModal from "@/components/whatsapp/whatsapp-send-modal";
import Modal from "@/components/ui/modal";

export type Master = { id: string; name: string; display_name?: string; upi_id?: string; code?: string };
export type CustomerRow = { id: string; name: string; code: string; phone: string | null };

export type Txn = {
  id: string;
  transaction_number: string;
  service_type: string;
  direction: string;
  transaction_date: string;
  transaction_timestamp: string | null;
  customer_id: string | null;
  customer_mobile: string | null;
  reference: string | null;
  remarks: string | null;
  status: string;
  bank_id: string | null;
  portal_id: string | null;
  merchant_qr_id: string | null;
  provider_id: string | null;
  aadhaar_last4: string | null;
  transfer_method: string | null;
  sender_name: string | null;
  sender_mobile: string | null;
  beneficiary_name: string | null;
  beneficiary_mobile: string | null;
  beneficiary_bank: string | null;
  beneficiary_ifsc: string | null;
  beneficiary_account: string | null;
  upi_id: string | null;
  receiver_name?: string | null;
  amount: number | string;
  service_fee: number | string;
  portal_charge?: number | string | null;
  portal_commission: number | string;
  fee_source: string | null;
  paid_from: string | null;
  customer_pay_method: string | null;
  customers: { name: string; phone: string | null } | null;
  banks: { name: string } | null;
  portals: { name: string } | null;
  providers: { name: string } | null;
  merchant_qrs: { display_name: string; upi_id: string } | null;
  profiles: { full_name: string } | null;
};

type Card = { key: string; label: string; icon: string; grad: string; sub?: string };

type Cfg = {
  title: string;
  desc: string;
  recordLabel: string;
  groups: { value: string; label: string }[];
  bankFilter: boolean;
  portalFilter: boolean;
  providerFilter: boolean;
  methodFilter: boolean;
  customerFilter: boolean;
  cards: Card[];
  tableHeaders: { key: string; label?: string; align?: string }[];
};

const ICONS = {
  receipt: "M6 2h12a1 1 0 0 1 1 1v18l-2.5-1.5L14 21l-2.5-1.5L9 21l-2.5-1.5L5 21V3a1 1 0 0 1 1-1Z",
  rupee: "M6 3h12M6 8h12M6 13h8a4 4 0 0 0 0-8H6v17",
  coins: "M8 9l4-4 8 4-8 4-4-4ZM8 9v6m0 0 4 4 8-4-4-4m-4 4V9m8 0v6",
  percent: "M19 5 5 19M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm11 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  trend: "M23 6l-9.5 9.5-5-5L1 18M17 6h6v6",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35",
};

const CONFIG: Record<string, Cfg> = {
  aeps: {
    title: "AEPS Cash Withdrawal",
    desc: "Cash paid out at the counter, settled by the AEPS portal.",
    recordLabel: "Record Withdrawal",
    groups: [
      { value: "none", label: "Overall totals" },
      { value: "bank", label: "Group by Bank" },
      { value: "portal", label: "Group by Portal" },
    ],
    bankFilter: true,
    portalFilter: true,
    providerFilter: false,
    methodFilter: false,
    customerFilter: true,
    cards: [
      { key: "count", label: "Transactions", icon: ICONS.receipt, grad: "from-blue-500 to-indigo-600" },
      { key: "withdrawal", label: "Withdrawn", icon: ICONS.rupee, grad: "from-emerald-500 to-teal-600" },
      { key: "fees", label: "Customer Fees", icon: ICONS.coins, grad: "from-amber-500 to-orange-600" },
      { key: "commission", label: "Portal Commission", icon: ICONS.percent, grad: "from-violet-500 to-purple-600" },
      { key: "net", label: "Shop Income", icon: ICONS.trend, grad: "from-rose-500 to-pink-600", sub: "Fees + Commission" },
    ],
    tableHeaders: [
      { key: "txn" },
      { key: "customer" },
      { key: "bankPortal" },
      { key: "date" },
      { key: "withdrawal", align: "right" },
      { key: "fee", align: "right" },
      { key: "commission", align: "right" },
      { key: "status", align: "center" },
      { key: "actions", align: "right" },
    ],
  },
  dmt: {
    title: "DMT — Money Transfer",
    desc: "Remittances to beneficiaries through Bank Account or DMT Portal.",
    recordLabel: "Record Transfer",
    groups: [
      { value: "none", label: "Overall totals" },
      { value: "bank", label: "Group by Bank" },
      { value: "portal", label: "Group by Portal" },
      { value: "method", label: "Group by Method" },
    ],
    bankFilter: true,
    portalFilter: true,
    providerFilter: false,
    methodFilter: true,
    customerFilter: true,
    cards: [
      { key: "count", label: "Transactions", icon: ICONS.receipt, grad: "from-blue-500 to-indigo-600" },
      { key: "moneyOut", label: "Money Out (Transfer)", icon: ICONS.rupee, grad: "from-rose-500 to-pink-600", sub: "Bank & Portal Debited" },
      { key: "moneyIn", label: "Money In (Customer)", icon: ICONS.rupee, grad: "from-emerald-500 to-teal-600", sub: "Transfer + Customer Fee" },
      { key: "fees", label: "Customer Fee", icon: ICONS.coins, grad: "from-amber-500 to-orange-600", sub: "Gross Service Charge" },
      { key: "net", label: "Shop Net Profit", icon: ICONS.trend, grad: "from-violet-500 to-purple-600", sub: "Customer Fee − Portal Charge" },
    ],
    tableHeaders: [
      { key: "txn" },
      { key: "customer" },
      { key: "sender" },
      { key: "beneficiary" },
      { key: "date" },
      { key: "moneyOut", align: "right" },
      { key: "moneyIn", align: "right" },
      { key: "fee", align: "right" },
      { key: "net", align: "right" },
      { key: "status", align: "center" },
      { key: "actions", align: "right" },
    ],
  },
  upi: {
    title: "UPI Cash Out",
    desc: "Cash handed over against money received on the shop UPI.",
    recordLabel: "Record Cash Out",
    groups: [],
    bankFilter: false,
    portalFilter: false,
    providerFilter: false,
    methodFilter: false,
    customerFilter: true,
    cards: [
      { key: "count", label: "Transactions", icon: ICONS.receipt, grad: "from-blue-500 to-indigo-600" },
      { key: "withdrawal", label: "Cash Out", icon: ICONS.rupee, grad: "from-emerald-500 to-teal-600" },
      { key: "fees", label: "Customer Fees", icon: ICONS.coins, grad: "from-amber-500 to-orange-600" },
      { key: "net", label: "Shop Income", icon: ICONS.trend, grad: "from-rose-500 to-pink-600", sub: "= Customer Fees" },
    ],
    tableHeaders: [
      { key: "txn" },
      { key: "customer" },
      { key: "date" },
      { key: "upiAmount", align: "right" },
      { key: "cashHanded", align: "right" },
      { key: "fee", align: "right" },
      { key: "status", align: "center" },
      { key: "actions", align: "right" },
    ],
  },
  recharge: {
    title: "Recharge — Mobile & DTH",
    desc: "Customer pays cash; the recharge float is debited by the cost; commission is the shop's earnings.",
    recordLabel: "Record Recharge",
    groups: [
      { value: "none", label: "Overall totals" },
      { value: "provider", label: "Group by Provider" },
    ],
    bankFilter: false,
    portalFilter: false,
    providerFilter: true,
    methodFilter: false,
    customerFilter: true,
    cards: [
      { key: "count", label: "Transactions", icon: ICONS.receipt, grad: "from-blue-500 to-indigo-600" },
      { key: "withdrawal", label: "Recharged", icon: ICONS.rupee, grad: "from-emerald-500 to-teal-600" },
      { key: "commission", label: "Commission Earned", icon: ICONS.percent, grad: "from-amber-500 to-orange-600" },
      { key: "net", label: "Shop Earnings", icon: ICONS.trend, grad: "from-violet-500 to-purple-600", sub: "= Commission" },
    ],
    tableHeaders: [
      { key: "txn" },
      { key: "customer" },
      { key: "provider" },
      { key: "date" },
      { key: "withdrawal", align: "right" },
      { key: "commission", align: "right" },
      { key: "status", align: "center" },
      { key: "actions", align: "right" },
    ],
  },
};

const STATUS_BADGE: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  failed: "bg-rose-100 text-rose-700",
  reversed: "bg-slate-200 text-slate-600",
  deleted: "bg-rose-100 text-rose-700",
};

const STATUSES = ["success", "pending", "failed", "reversed", "deleted"];

function fmtDate(d: string) {
  if (!d) return "-";
  const dt = new Date(d + (d.length === 10 ? "T00:00:00" : ""));
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(t: Txn) {
  if (t.transaction_timestamp) {
    const dt = new Date(t.transaction_timestamp);
    return dt.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }
  return fmtDate(t.transaction_date);
}

function gradient(name: string) {
  const palettes = [
    "from-blue-500 to-cyan-400",
    "from-violet-500 to-fuchsia-400",
    "from-emerald-500 to-teal-400",
    "from-amber-500 to-orange-400",
    "from-rose-500 to-pink-400",
    "from-indigo-500 to-purple-400",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palettes[h % palettes.length];
}

export default function BusinessClient({
  service,
  label,
  initialTransactions,
  initialCustomers,
  initialBanks,
  initialPortals,
  initialQrs,
  initialRechargeProviders = [],
  initialRechargeSlabs = [],
  initialPaymentInstruments = [],
  float = null,
}: {
  service: string;
  label: string;
  initialTransactions: Txn[];
  initialCustomers: CustomerRow[];
  initialBanks: Master[];
  initialPortals: Master[];
  initialQrs: Master[];
  initialRechargeProviders?: Master[];
  initialRechargeSlabs?: { provider_id: string; min_amount: number | string; max_amount: number | string; commission_percent: number | string }[];
  initialPaymentInstruments?: { id: string; name: string; type: string; details?: any; is_active?: boolean }[];
  float?: { opening: number | string; current: number | string; seed_date: string } | null;
}) {
  const cfg = CONFIG[service];
  const [txns, setTxns] = useState<Txn[]>(initialTransactions);

  useRealtime(["transactions", "payment_instruments", "cash_entries", "expenses", "settlements", "customers"]);

  useEffect(() => {
    setTxns(initialTransactions);
  }, [initialTransactions]);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [bankFilter, setBankFilter] = useState("");
  const [portalFilter, setPortalFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [preset, setPreset] = useState("all");
  const [groupBy, setGroupBy] = useState("none");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [detailsTxn, setDetailsTxn] = useState<Txn | null>(null);
  const [editTxn, setEditTxn] = useState<Txn | null>(null);
  const [reverseTxn, setReverseTxn] = useState<Txn | null>(null);
  const [deleteTxn, setDeleteTxn] = useState<Txn | null>(null);
  const [view, setView] = useState<"cards" | "list">("list");
  const [compact, setCompact] = useState(false);
  const { showToast, toastView } = useToast();
  const [waModal, setWaModal] = useState<{
    open: boolean;
    phone: string;
    name: string;
    msg: string;
    refNum: string;
    refId: string;
  } | null>(null);

  const supabase = createClient();

  const today = new Date().toISOString().slice(0, 10);

  function applyPreset(p: string) {
    setPreset(p);
    const now = new Date();
    if (p === "today") {
      setDateFrom(today);
      setDateTo(today);
    } else if (p === "7d") {
      setDateFrom(new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10));
      setDateTo(today);
    } else if (p === "month") {
      setDateFrom(now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-01");
      setDateTo(today);
    } else {
      setDateFrom("");
      setDateTo("");
    }
  }

  function getDmtBankName(t: Txn) {
    if ((t.paid_from ?? "bank") === "portal") {
      return `🌐 ${t.portals?.name || "DMT Portal Wallet"}`;
    }
    const match = t.remarks?.match(/\[Account:\s*([^\]]+)\]/);
    if (match?.[1]) return `🏦 ${match[1]}`;
    const inst = initialPaymentInstruments.find((p) => p.id === t.bank_id);
    if (inst) return `🏦 ${inst.name}`;
    if (t.banks?.name && t.banks.name !== "-") return `🏦 ${t.banks.name}`;
    return "🏦 Our Bank Account";
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return txns.filter((t) => {
      if (statusFilter && t.status !== statusFilter) return false;
      if (bankFilter && t.bank_id !== bankFilter) return false;
      if (portalFilter && t.portal_id !== portalFilter) return false;
      if (providerFilter && t.provider_id !== providerFilter) return false;
      if (methodFilter && t.transfer_method !== methodFilter) return false;
      if (customerFilter && t.customer_id !== customerFilter) return false;
      if (dateFrom && t.transaction_date < dateFrom) return false;
      if (dateTo && t.transaction_date > dateTo) return false;
      if (!needle) return true;
      return (
        t.transaction_number.toLowerCase().includes(needle) ||
        (t.reference ?? "").toLowerCase().includes(needle) ||
        (t.customer_mobile ?? "").includes(needle) ||
        (t.aadhaar_last4 ?? "").includes(needle) ||
        (t.sender_name ?? "").toLowerCase().includes(needle) ||
        (t.beneficiary_name ?? "").toLowerCase().includes(needle) ||
        (t.upi_id ?? "").toLowerCase().includes(needle) ||
        (t.providers?.name ?? "").toLowerCase().includes(needle) ||
        (t.customers?.name ?? "").toLowerCase().includes(needle) ||
        (t.customers?.phone ?? "").toLowerCase().includes(needle)
      );
    });
  }, [txns, q, statusFilter, bankFilter, portalFilter, providerFilter, methodFilter, customerFilter, dateFrom, dateTo]);

  const successOnly = useMemo(() => filtered.filter((t) => t.status === "success"), [filtered]);

  const report = useMemo(() => {
    const rows = successOnly;
    const withdrawal = rows.reduce((s, t) => s + Number(t.amount), 0);
    const fees = rows.reduce((s, t) => s + Number(t.service_fee), 0);
    const commission = rows.reduce((s, t) => s + Number(t.portal_commission), 0);
    const moneyOut = withdrawal;
    const moneyIn = rows.reduce((s, t) => s + Number(t.amount) + Number(t.service_fee), 0);
    return {
      count: rows.length,
      withdrawal,
      fees,
      commission,
      moneyOut,
      moneyIn,
    };
  }, [successOnly]);

  const todayRows = useMemo(
    () => txns.filter((t) => t.transaction_date === today && t.status === "success"),
    [txns, today]
  );
  const todayAmount = useMemo(
    () => todayRows.reduce((s, t) => s + Number(t.amount), 0),
    [todayRows]
  );

  const pendingCount = useMemo(() => txns.filter((t) => t.status === "pending").length, [txns]);
  const failedCount = useMemo(() => txns.filter((t) => t.status === "failed").length, [txns]);

  const groups = useMemo(() => {
    if (groupBy === "none") return [];
    const map = new Map<string, Txn[]>();
    successOnly.forEach((t) => {
      let key = "-";
      if (groupBy === "bank") key = t.banks?.name ?? "-";
      if (groupBy === "portal") key = t.portals?.name ?? "-";
      if (groupBy === "provider") key = t.providers?.name ?? "-";
      if (groupBy === "method") key = t.transfer_method === "upi" ? "UPI" : "Bank Account";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return Array.from(map.entries()).map(([label, rows]) => ({
      label,
      count: rows.length,
      withdrawal: rows.reduce((s, t) => s + Number(t.amount), 0),
      moneyOut: rows.reduce((s, t) => s + Number(t.amount), 0),
      moneyIn: rows.reduce((s, t) => s + Number(t.amount) + Number(t.service_fee), 0),
      fees: rows.reduce((s, t) => s + Number(t.service_fee), 0),
      commission: rows.reduce((s, t) => s + Number(t.portal_commission), 0),
      net: service === "dmt"
        ? rows.reduce((s, t) => s + Number(t.service_fee) - Number(t.portal_commission), 0)
        : rows.reduce((s, t) => s + Number(t.service_fee) + Number(t.portal_commission), 0),
    }));
  }, [groupBy, successOnly, service]);

  const netTotal = service === "dmt" ? report.fees - report.commission : report.fees + report.commission;

  async function createTxn(payload: Record<string, unknown>) {
    let data: any = null;
    let error: any = null;

    if (service === "recharge") {
      const res = await supabase.rpc("create_recharge", payload);
      data = res.data;
      error = res.error;

      // Resilient fallback if create_recharge RPC is missing or schema cache not reloaded
      if (error && (error.message?.includes("schema cache") || error.code === "PGRST202" || error.message?.includes("function public.create_recharge"))) {
        const { count } = await supabase.from("transactions").select("id", { count: "exact", head: true }).eq("service_type", "recharge");
        const nextNum = "RCH-" + String((count ?? 0) + 1).padStart(4, "0");
        let comm = 0;
        const provId = payload.p_provider_id as string;
        const amt = Number(payload.p_amount) || 0;
        if (provId) {
          const { data: slabs } = await supabase.from("recharge_commission_slabs").select("*").eq("provider_id", provId);
          const slab = (slabs ?? []).find((s: any) => amt >= Number(s.min_amount) && amt <= Number(s.max_amount));
          if (slab) {
            comm = Math.round((amt * Number(slab.commission_percent)) / 100);
          }
        }
        const cost = amt - comm;
        const payMethod = (payload.p_customer_pay_method as string) || "cash";

        const { data: inserted, error: insErr } = await supabase.from("transactions").insert({
          transaction_number: nextNum,
          service_type: "recharge",
          direction: "in",
          transaction_date: ((payload.p_transaction_timestamp as string) ?? payload.p_transaction_date)?.slice(0, 10),
          transaction_timestamp: payload.p_transaction_timestamp || new Date().toISOString(),
          customer_id: payload.p_customer_id || null,
          customer_mobile: payload.p_customer_mobile || null,
          reference: payload.p_reference || null,
          remarks: payload.p_remarks || null,
          status: payload.p_status || "success",
          provider_id: payload.p_provider_id || null,
          amount: amt,
          service_fee: 0,
          portal_commission: comm,
          cash_in: payMethod === "cash" ? amt : 0,
          bank_in: payMethod === "bank" ? amt : 0,
          pool_out: cost,
          pool_credit: 0,
          pool_credit_type: "recharge",
          customer_pay_method: payMethod,
        }).select().single();

        if (insErr) {
          showToast("error", insErr.message);
          return;
        }

        data = inserted;
        error = null;

        if (payload.p_status === "success" && inserted?.id) {
          if (payMethod === "cash") {
            await supabase.from("cash_entries").insert({
              entry_date: inserted.transaction_date,
              method: "cash",
              direction: "in",
              amount: amt,
              description: `Recharge ${nextNum} received in cash`,
              ref_type: "transaction",
              ref_id: inserted.id,
            });
          } else if (payMethod === "bank") {
            await supabase.from("cash_entries").insert({
              entry_date: inserted.transaction_date,
              method: "bank",
              direction: "in",
              amount: amt,
              description: `Recharge ${nextNum} received in Bank account`,
              ref_type: "transaction",
              ref_id: inserted.id,
            });
          } else if (payMethod === "upi" || payMethod === "upi_qr") {
            await supabase.from("cash_entries").insert({
              entry_date: inserted.transaction_date,
              method: "upi",
              direction: "in",
              amount: amt,
              description: `Recharge ${nextNum} received via Shop UPI QR`,
              ref_type: "transaction",
              ref_id: inserted.id,
            });
          } else if (payMethod === "due" && payload.p_customer_id) {
            const { data: cust } = await supabase.from("customers").select("balance").eq("id", payload.p_customer_id).single();
            const newBal = Number(cust?.balance || 0) + amt;
            await supabase.from("customers").update({ balance: newBal }).eq("id", payload.p_customer_id);
            await supabase.from("customer_ledger").insert({
              customer_id: payload.p_customer_id,
              entry_date: inserted.transaction_date,
              type: "recharge",
              description: `Recharge ${nextNum} on credit`,
              debit: amt,
              credit: 0,
              balance_after: newBal,
              ref_type: "transaction",
              ref_id: inserted.id,
            });
          }
        }
      }
    } else {
      const rpcPayload = {
        p_service_type: service,
        p_transaction_date: payload.p_transaction_date,
        p_transaction_timestamp: payload.p_transaction_timestamp,
        p_customer_id: payload.p_customer_id || null,
        p_customer_mobile: payload.p_customer_mobile || null,
        p_reference: payload.p_reference || null,
        p_remarks: payload.p_remarks || null,
        p_status: payload.p_status || "success",
        p_bank_id: payload.p_bank_id || null,
        p_portal_id: payload.p_portal_id || null,
        p_merchant_qr_id: payload.p_merchant_qr_id || null,
        p_aadhaar_last4: payload.p_aadhaar_last4 || null,
        p_transfer_method: payload.p_transfer_method || null,
        p_sender_name: payload.p_sender_name || null,
        p_sender_mobile: payload.p_sender_mobile || null,
        p_beneficiary_name: payload.p_beneficiary_name || null,
        p_beneficiary_mobile: payload.p_beneficiary_mobile || null,
        p_beneficiary_bank: payload.p_beneficiary_bank || null,
        p_beneficiary_ifsc: payload.p_beneficiary_ifsc || null,
        p_beneficiary_account: payload.p_beneficiary_account || null,
        p_upi_id: payload.p_upi_id || null,
        p_receiver_name: payload.p_receiver_name || null,
        p_amount: payload.p_amount,
        p_service_fee: payload.p_service_fee ?? 0,
        p_portal_commission: payload.p_portal_commission ?? 0,
        p_fee_source: payload.p_fee_source || null,
        p_paid_from: payload.p_paid_from || null,
        p_customer_pay_method: payload.p_customer_pay_method || null,
      };
      const res = await supabase.rpc("create_business_txn", rpcPayload);
      data = res.data;
      error = res.error;
    }

    if (error) {
      showToast("error", error.message);
      return;
    }
    const d = data as Record<string, unknown>;
    const newTxn: Txn = {
      id: d.id as string,
      transaction_number: d.transaction_number as string,
      service_type: service,
      direction: d.direction as string,
      transaction_date: ((payload.p_transaction_timestamp as string) ?? payload.p_transaction_date)?.slice(0, 10) as string,
      transaction_timestamp: (payload.p_transaction_timestamp as string) || null,
      customer_id: (payload.p_customer_id as string) || null,
      customer_mobile: (payload.p_customer_mobile as string) || null,
      reference: (payload.p_reference as string) || null,
      status: d.status as string,
      bank_id: (payload.p_bank_id as string) || null,
      portal_id: (payload.p_portal_id as string) || null,
      merchant_qr_id: (payload.p_merchant_qr_id as string) || null,
      provider_id: (payload.p_provider_id as string) || null,
      aadhaar_last4: (payload.p_aadhaar_last4 as string) || null,
      transfer_method: (payload.p_transfer_method as string) || null,
      sender_name: (payload.p_sender_name as string) || null,
      sender_mobile: (payload.p_sender_mobile as string) || null,
      beneficiary_name: (payload.p_beneficiary_name as string) || null,
      beneficiary_mobile: (payload.p_beneficiary_mobile as string) || null,
      beneficiary_bank: (payload.p_beneficiary_bank as string) || null,
      beneficiary_ifsc: (payload.p_beneficiary_ifsc as string) || null,
      beneficiary_account: (payload.p_beneficiary_account as string) || null,
      upi_id: (payload.p_upi_id as string) || null,
      receiver_name: (payload.p_receiver_name as string) || null,
      amount: Number(payload.p_amount),
      service_fee: Number(payload.p_service_fee ?? 0),
      portal_commission: Number(payload.p_portal_commission ?? d.portal_commission ?? 0),
      fee_source: (payload.p_fee_source as string) || null,
      paid_from: (payload.p_paid_from as string) || null,
      customer_pay_method: (payload.p_customer_pay_method as string) || null,
      customers: payload.p_customer_id
        ? initialCustomers.find((c) => c.id === payload.p_customer_id) ?? null
        : null,
      remarks: (payload.p_remarks as string) || null,
      banks: (payload.p_bank_id as string || (payload.payment_account_name as string))
        ? {
            name:
              service === "dmt"
                ? (payload.payment_account_name as string) || initialPaymentInstruments.find((b) => b.id === (payload.payment_account_id || payload.p_bank_id))?.name || "-"
                : initialBanks.find((b) => b.id === payload.p_bank_id)?.name ?? "-",
          }
        : null,
      portals: (payload.p_portal_id as string) ? { name: initialPortals.find((p) => p.id === payload.p_portal_id)?.name ?? "-" } : null,
      providers: (payload.p_provider_id as string) ? { name: initialRechargeProviders.find((p) => p.id === payload.p_provider_id)?.name ?? "-" } : null,
      merchant_qrs: null,
      profiles: null,
    };
    setTxns((prev) => [newTxn, ...prev]);
    setShowCreate(false);
    showToast("success", `${service.toUpperCase()} ${inr(Number(payload.p_amount))} recorded — ${d.transaction_number}`);

    // Synchronize Cashbook & Payment Accounts for all transaction types
    if (d.status === "success") {
      await syncCashbookForTxn(service, d.transaction_number as string, d.id as string, payload, initialPaymentInstruments);
    }

    const waCfg = getWhatsAppConfig();
    if (waCfg.provider !== "off" && waCfg.auto_send_business && (newTxn.customer_mobile || newTxn.sender_mobile || newTxn.customers?.phone)) {
      handleSendWhatsAppTxn(newTxn);
    }

    logAudit({
      action: "create",
      entity: "transaction",
      entity_id: d.id as string,
      description: `${service.toUpperCase()} ${(d.direction as string) ?? ""} ${inr(Number(payload.p_amount))} created`,
      details: { transaction_number: d.transaction_number as string, service_type: service, amount: payload.p_amount },
    });
  }

  async function syncCashbookForTxn(
    svc: string,
    txnNo: string,
    txnId: string,
    payload: Record<string, unknown>,
    instruments: { id: string; name: string; type: string }[]
  ) {
    const entryDate = ((payload.p_transaction_timestamp as string) ?? payload.p_transaction_date)?.slice(0, 10) || new Date().toISOString().slice(0, 10);
    const defaultCash = instruments.find((p) => p.type === "cash");
    const defaultUpi = instruments.find((p) => p.type === "upi");
    const amt = Number(payload.p_amount) || 0;
    const fee = Number(payload.p_service_fee ?? 0) || 0;

    const { data: existing } = await supabase
      .from("cash_entries")
      .select("id, direction, method")
      .eq("ref_type", "transaction")
      .eq("ref_id", txnId);

    const existingOut = (existing ?? []).filter((e) => e.direction === "out");
    const existingIn = (existing ?? []).filter((e) => e.direction === "in");

    if (svc === "dmt") {
      const isBank = (payload.p_paid_from ?? "bank") === "bank";
      const bankInstId = (payload.payment_account_id as string) || (payload.p_bank_id as string) || null;
      const bankInstName = (payload.payment_account_name as string) || (bankInstId ? instruments.find((p) => p.id === bankInstId)?.name : null) || "Our Bank Account";

      if (isBank && bankInstId) {
        if (existingOut.length > 0) {
          await supabase
            .from("cash_entries")
            .update({
              entry_date: entryDate,
              method: "bank",
              amount: amt,
              description: `DMT ${txnNo} transfer sent from ${bankInstName}`,
              instrument_id: bankInstId,
            })
            .eq("id", existingOut[0].id);
          if (existingOut.length > 1) {
            for (let i = 1; i < existingOut.length; i++) {
              await supabase.from("cash_entries").delete().eq("id", existingOut[i].id);
            }
          }
        } else {
          await supabase.from("cash_entries").insert({
            entry_date: entryDate,
            method: "bank",
            direction: "out",
            amount: amt,
            description: `DMT ${txnNo} transfer sent from ${bankInstName}`,
            ref_type: "transaction",
            ref_id: txnId,
            instrument_id: bankInstId,
          });
        }
      } else if (!isBank && existingOut.length > 0) {
        for (const ce of existingOut) {
          await supabase.from("cash_entries").delete().eq("id", ce.id);
        }
      }

      const payMethod = (payload.p_customer_pay_method as string) || "cash";
      const totalIn = amt + fee;
      const targetInst = instruments.find((p) => p.type === (payMethod === "cash" ? "cash" : payMethod === "upi" ? "upi" : "bank"));
      if (totalIn > 0 && payMethod !== "due") {
        if (existingIn.length > 0) {
          await supabase
            .from("cash_entries")
            .update({
              entry_date: entryDate,
              method: payMethod,
              amount: totalIn,
              description: `DMT ${txnNo} collected from customer (${payMethod})`,
              instrument_id: targetInst?.id || null,
            })
            .eq("id", existingIn[0].id);
          if (existingIn.length > 1) {
            for (let i = 1; i < existingIn.length; i++) {
              await supabase.from("cash_entries").delete().eq("id", existingIn[i].id);
            }
          }
        } else {
          await supabase.from("cash_entries").insert({
            entry_date: entryDate,
            method: payMethod,
            direction: "in",
            amount: totalIn,
            description: `DMT ${txnNo} collected from customer (${payMethod})`,
            ref_type: "transaction",
            ref_id: txnId,
            instrument_id: targetInst?.id || null,
          });
        }
      } else if (existingIn.length > 0) {
        for (const ce of existingIn) {
          await supabase.from("cash_entries").delete().eq("id", ce.id);
        }
      }
    } else if (svc === "aeps") {
      const feeSrc = (payload.p_fee_source as string) || "deducted_from_cash";
      const cashOutAmt = feeSrc === "upi" || feeSrc === "separate_cash" ? amt : amt - fee;

      if (cashOutAmt > 0) {
        if (existingOut.length > 0) {
          await supabase
            .from("cash_entries")
            .update({
              entry_date: entryDate,
              method: "cash",
              amount: cashOutAmt,
              description: `AEPS ${txnNo} cash payout`,
              instrument_id: defaultCash?.id || null,
            })
            .eq("id", existingOut[0].id);
          if (existingOut.length > 1) {
            for (let i = 1; i < existingOut.length; i++) {
              await supabase.from("cash_entries").delete().eq("id", existingOut[i].id);
            }
          }
        } else {
          await supabase.from("cash_entries").insert({
            entry_date: entryDate,
            method: "cash",
            direction: "out",
            amount: cashOutAmt,
            description: `AEPS ${txnNo} cash payout`,
            ref_type: "transaction",
            ref_id: txnId,
            instrument_id: defaultCash?.id || null,
          });
        }
      }

      if (fee > 0 && (feeSrc === "separate_cash" || feeSrc === "upi")) {
        const feeMethod = feeSrc === "upi" ? "upi" : "cash";
        const feeInst = feeSrc === "upi" ? defaultUpi : defaultCash;
        if (existingIn.length > 0) {
          await supabase
            .from("cash_entries")
            .update({
              entry_date: entryDate,
              method: feeMethod,
              amount: fee,
              description: `AEPS ${txnNo} fee collected (${feeMethod.toUpperCase()})`,
              instrument_id: feeInst?.id || null,
            })
            .eq("id", existingIn[0].id);
          if (existingIn.length > 1) {
            for (let i = 1; i < existingIn.length; i++) {
              await supabase.from("cash_entries").delete().eq("id", existingIn[i].id);
            }
          }
        } else {
          await supabase.from("cash_entries").insert({
            entry_date: entryDate,
            method: feeMethod,
            direction: "in",
            amount: fee,
            description: `AEPS ${txnNo} fee collected (${feeMethod.toUpperCase()})`,
            ref_type: "transaction",
            ref_id: txnId,
            instrument_id: feeInst?.id || null,
          });
        }
      } else if (existingIn.length > 0) {
        for (const ce of existingIn) {
          await supabase.from("cash_entries").delete().eq("id", ce.id);
        }
      }
    } else if (svc === "upi") {
      const custMethod = (payload.p_customer_pay_method as string) || "qr";
      const totalIn = amt + fee;

      if (custMethod === "cash") {
        if (existingIn.length > 0) {
          await supabase
            .from("cash_entries")
            .update({
              entry_date: entryDate,
              method: "cash",
              amount: totalIn,
              description: `UPI ${txnNo} received in cash`,
              instrument_id: defaultCash?.id || null,
            })
            .eq("id", existingIn[0].id);
        } else {
          await supabase.from("cash_entries").insert({
            entry_date: entryDate,
            method: "cash",
            direction: "in",
            amount: totalIn,
            description: `UPI ${txnNo} received in cash`,
            ref_type: "transaction",
            ref_id: txnId,
            instrument_id: defaultCash?.id || null,
          });
        }

        if (existingOut.length > 0) {
          await supabase
            .from("cash_entries")
            .update({
              entry_date: entryDate,
              method: "upi",
              amount: amt,
              description: `UPI ${txnNo} transfer sent`,
              instrument_id: defaultUpi?.id || null,
            })
            .eq("id", existingOut[0].id);
        } else {
          await supabase.from("cash_entries").insert({
            entry_date: entryDate,
            method: "upi",
            direction: "out",
            amount: amt,
            description: `UPI ${txnNo} transfer sent`,
            ref_type: "transaction",
            ref_id: txnId,
            instrument_id: defaultUpi?.id || null,
          });
        }
      } else {
        if (existingIn.length > 0) {
          await supabase
            .from("cash_entries")
            .update({
              entry_date: entryDate,
              method: "upi",
              amount: totalIn,
              description: `UPI ${txnNo} received via QR`,
              instrument_id: defaultUpi?.id || null,
            })
            .eq("id", existingIn[0].id);
        } else {
          await supabase.from("cash_entries").insert({
            entry_date: entryDate,
            method: "upi",
            direction: "in",
            amount: totalIn,
            description: `UPI ${txnNo} received via QR`,
            ref_type: "transaction",
            ref_id: txnId,
            instrument_id: defaultUpi?.id || null,
          });
        }

        if (existingOut.length > 0) {
          await supabase
            .from("cash_entries")
            .update({
              entry_date: entryDate,
              method: "cash",
              amount: amt,
              description: `UPI ${txnNo} cash payout`,
              instrument_id: defaultCash?.id || null,
            })
            .eq("id", existingOut[0].id);
        } else {
          await supabase.from("cash_entries").insert({
            entry_date: entryDate,
            method: "cash",
            direction: "out",
            amount: amt,
            description: `UPI ${txnNo} cash payout`,
            ref_type: "transaction",
            ref_id: txnId,
            instrument_id: defaultCash?.id || null,
          });
        }
      }
    } else if (svc === "recharge") {
      const payMethod = (payload.p_customer_pay_method as string) || "cash";
      const targetInst = instruments.find((p) => p.type === (payMethod === "cash" ? "cash" : payMethod === "upi" ? "upi" : "bank"));
      if (amt > 0 && payMethod !== "due") {
        if (existingIn.length > 0) {
          await supabase
            .from("cash_entries")
            .update({
              entry_date: entryDate,
              method: payMethod,
              amount: amt,
              description: `Recharge ${txnNo} collected from customer (${payMethod})`,
              instrument_id: targetInst?.id || null,
            })
            .eq("id", existingIn[0].id);
        } else {
          await supabase.from("cash_entries").insert({
            entry_date: entryDate,
            method: payMethod,
            direction: "in",
            amount: amt,
            description: `Recharge ${txnNo} collected from customer (${payMethod})`,
            ref_type: "transaction",
            ref_id: txnId,
            instrument_id: targetInst?.id || null,
          });
        }
      }
    }
  }

  function handleSendWhatsAppTxn(t: Txn, manual = true) {
    const cfg = getWhatsAppConfig();
    const template = cfg.templates?.banking_txn || DEFAULT_WA_TEMPLATES.banking_txn;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const receiptUrl = `${origin}/business/receipt/${t.id}/a4`;
    const rawPhone = t.customer_mobile || t.sender_mobile || t.customers?.phone || "";
    const sName = service === "aeps" ? "AEPS Cash Withdrawal" : service === "dmt" ? "Domestic Money Transfer" : service === "recharge" ? "Recharge" : "UPI Transfer";
    const msg = renderWhatsAppTemplate(template, {
      shop_name: "Sarkar Communication",
      service_name: sName.toUpperCase(),
      txn_number: t.transaction_number,
      txn_date: t.transaction_date,
      customer_name: t.customers?.name || "Customer",
      customer_name_line: t.customers?.name ? `👤 Customer: ${t.customers.name}\n` : "",
      amount: inr(Number(t.amount)),
      ref_number: t.reference || "-",
      status: t.status.toUpperCase(),
      receipt_url: receiptUrl,
    });

    if (manual) {
      setWaModal({
        open: true,
        phone: rawPhone,
        name: t.customers?.name || "Customer",
        msg,
        refNum: t.transaction_number,
        refId: t.id,
      });
      return;
    }

    sendWhatsAppMessage({
      phone: rawPhone,
      message: msg,
      recipientName: t.customers?.name,
      messageType: "banking_txn",
      refId: t.id,
      refNumber: t.transaction_number,
    });
  }

  async function saveEdit(payload: Record<string, unknown>) {
    if (!editTxn) return;
    let data: any = null;
    let error: any = null;

    if (service === "recharge") {
      const rechargeArgs = {
        p_txn_id: editTxn.id,
        p_provider_id: payload.p_provider_id,
        p_transaction_date: payload.p_transaction_date,
        p_transaction_timestamp: payload.p_transaction_timestamp,
        p_customer_id: payload.p_customer_id || null,
        p_customer_mobile: payload.p_customer_mobile || null,
        p_reference: payload.p_reference || null,
        p_remarks: payload.p_remarks || null,
        p_amount: payload.p_amount,
        p_customer_pay_method: payload.p_customer_pay_method || "cash",
      };
      const res = await supabase.rpc("update_recharge", rechargeArgs);
      data = res.data;
      error = res.error;

      if (error && (error.message?.includes("schema cache") || error.code === "PGRST202" || error.message?.includes("function public.update_recharge"))) {
        const provId = rechargeArgs.p_provider_id as string;
        const amt = Number(rechargeArgs.p_amount) || 0;
        let comm = 0;
        if (provId) {
          const { data: slabs } = await supabase.from("recharge_commission_slabs").select("*").eq("provider_id", provId);
          const slab = (slabs ?? []).find((s: any) => amt >= Number(s.min_amount) && amt <= Number(s.max_amount));
          if (slab) {
            comm = Math.round((amt * Number(slab.commission_percent)) / 100);
          }
        }
        const cost = amt - comm;

        const { data: updated, error: updErr } = await supabase.from("transactions").update({
          transaction_date: ((payload.p_transaction_timestamp as string) ?? payload.p_transaction_date)?.slice(0, 10),
          transaction_timestamp: payload.p_transaction_timestamp || new Date().toISOString(),
          customer_id: payload.p_customer_id || null,
          customer_mobile: payload.p_customer_mobile || null,
          reference: payload.p_reference || null,
          remarks: payload.p_remarks || null,
          provider_id: payload.p_provider_id || null,
          amount: amt,
          portal_commission: comm,
          cash_in: amt,
          pool_out: cost,
          updated_at: new Date().toISOString(),
        }).eq("id", editTxn.id).select().single();

        if (updErr) {
          showToast("error", updErr.message);
          return;
        }
        data = updated;
        error = null;
      }
    } else {
      const updateArgs = {
        p_txn_id: editTxn.id,
        p_transaction_date: payload.p_transaction_date,
        p_transaction_timestamp: payload.p_transaction_timestamp,
        p_customer_id: payload.p_customer_id || null,
        p_customer_mobile: payload.p_customer_mobile || null,
        p_reference: payload.p_reference || null,
        p_remarks: payload.p_remarks || null,
        p_bank_id: payload.p_bank_id || null,
        p_portal_id: payload.p_portal_id || null,
        p_merchant_qr_id: payload.p_merchant_qr_id || null,
        p_aadhaar_last4: payload.p_aadhaar_last4 || null,
        p_transfer_method: payload.p_transfer_method || null,
        p_sender_name: payload.p_sender_name || null,
        p_sender_mobile: payload.p_sender_mobile || null,
        p_beneficiary_name: payload.p_beneficiary_name || null,
        p_beneficiary_mobile: payload.p_beneficiary_mobile || null,
        p_beneficiary_bank: payload.p_beneficiary_bank || null,
        p_beneficiary_ifsc: payload.p_beneficiary_ifsc || null,
        p_beneficiary_account: payload.p_beneficiary_account || null,
        p_upi_id: payload.p_upi_id || null,
        p_receiver_name: payload.p_receiver_name || null,
        p_amount: payload.p_amount,
        p_service_fee: payload.p_service_fee ?? 0,
        p_portal_commission: payload.p_portal_commission ?? 0,
        p_fee_source: payload.p_fee_source || null,
        p_paid_from: payload.p_paid_from || null,
        p_customer_pay_method: payload.p_customer_pay_method || null,
      };
      const res = await supabase.rpc("update_business_txn", updateArgs);
      data = res.data;
      error = res.error;
    }

    if (error) {
      showToast("error", error.message);
      return;
    }
    const upd = {
      transaction_date: ((payload.p_transaction_timestamp as string) ?? payload.p_transaction_date)?.slice(0, 10) as string,
      transaction_timestamp: (payload.p_transaction_timestamp as string) || null,
      customer_id: (payload.p_customer_id as string) || null,
      customer_mobile: (payload.p_customer_mobile as string) || null,
      reference: (payload.p_reference as string) || null,
      remarks: (payload.p_remarks as string) || null,
      bank_id: (payload.p_bank_id as string) || null,
      portal_id: (payload.p_portal_id as string) || null,
      merchant_qr_id: (payload.p_merchant_qr_id as string) || null,
      provider_id: (payload.p_provider_id as string) || null,
      aadhaar_last4: (payload.p_aadhaar_last4 as string) || null,
      transfer_method: (payload.p_transfer_method as string) || null,
      sender_name: (payload.p_sender_name as string) || null,
      sender_mobile: (payload.p_sender_mobile as string) || null,
      beneficiary_name: (payload.p_beneficiary_name as string) || null,
      beneficiary_mobile: (payload.p_beneficiary_mobile as string) || null,
      beneficiary_bank: (payload.p_beneficiary_bank as string) || null,
      beneficiary_ifsc: (payload.p_beneficiary_ifsc as string) || null,
      beneficiary_account: (payload.p_beneficiary_account as string) || null,
      upi_id: (payload.p_upi_id as string) || null,
      receiver_name: (payload.p_receiver_name as string) || null,
      amount: Number(payload.p_amount),
      service_fee: Number(payload.p_service_fee ?? 0),
      portal_commission: Number(payload.p_portal_commission ?? data?.portal_commission ?? 0),
      fee_source: (payload.p_fee_source as string) || null,
      paid_from: (payload.p_paid_from as string) || null,
      customer_pay_method: (payload.p_customer_pay_method as string) || null,
      banks: (payload.p_bank_id as string)
        ? {
            name:
              service === "dmt"
                ? initialPaymentInstruments.find((b) => b.id === payload.p_bank_id)?.name ?? "-"
                : initialBanks.find((b) => b.id === payload.p_bank_id)?.name ?? "-",
          }
        : null,
      providers: (payload.p_provider_id as string) ? { name: initialRechargeProviders.find((p) => p.id === payload.p_provider_id)?.name ?? "-" } : null,
    };
    setTxns((prev) => prev.map((t) => (t.id === editTxn.id ? { ...t, ...upd } : t)));

    // Synchronize Cashbook & Payment Accounts on edit
    await syncCashbookForTxn(service, editTxn.transaction_number, editTxn.id, payload, initialPaymentInstruments);

    setEditTxn(null);
    showToast("success", `Transaction ${editTxn.transaction_number} updated`);
    logAudit({
      action: "update",
      entity: "transaction",
      entity_id: editTxn.id,
      description: `Transaction ${editTxn.transaction_number} updated`,
      details: { transaction_number: editTxn.transaction_number },
    });
  }

  async function reverse() {
    if (!reverseTxn) return;
    setBusyId(reverseTxn.id);
    const { error } = await supabase.rpc("reverse_business_txn", {
      p_txn_id: reverseTxn.id,
      p_reason: reverseReason,
    });
    setBusyId(null);
    if (error) {
      showToast("error", error.message);
      return;
    }

    if (reverseTxn.service_type === "dmt") {
      const { data: oldEntries } = await supabase
        .from("cash_entries")
        .select("*")
        .eq("ref_type", "transaction")
        .eq("ref_id", reverseTxn.id);

      if (oldEntries && oldEntries.length > 0) {
        for (const ce of oldEntries) {
          await supabase.from("cash_entries").insert({
            entry_date: new Date().toISOString().slice(0, 10),
            method: ce.method,
            direction: ce.direction === "out" ? "in" : "out",
            amount: ce.amount,
            description: `Reversed DMT ${reverseTxn.transaction_number} (${ce.direction === "out" ? "refund to bank" : "return customer cash"})`,
            ref_type: "transaction",
            ref_id: reverseTxn.id,
            instrument_id: ce.instrument_id,
          });
        }
      }
    }

    setTxns((prev) => prev.map((t) => (t.id === reverseTxn.id ? { ...t, status: "reversed" } : t)));
    setReverseTxn(null);
    setReverseReason("");
    showToast("success", `Transaction ${reverseTxn.transaction_number} reversed`);
    logAudit({
      action: "reverse",
      entity: "transaction",
      entity_id: reverseTxn.id,
      description: `Transaction ${reverseTxn.transaction_number} reversed`,
      details: { transaction_number: reverseTxn.transaction_number, reason: reverseReason },
    });
  }

  async function deleteTxnAction() {
    if (!deleteTxn) return;
    setBusyId(deleteTxn.id);
    const { error } = await supabase.rpc("delete_business_txn", {
      p_txn_id: deleteTxn.id,
      p_reason: deleteReason,
    });
    setBusyId(null);
    if (error) {
      showToast("error", error.message);
      return;
    }

    await supabase.from("cash_entries").delete().eq("ref_type", "transaction").eq("ref_id", deleteTxn.id);

    setTxns((prev) => prev.map((t) => (t.id === deleteTxn.id ? { ...t, status: "deleted" } : t)));
    setDeleteTxn(null);
    setDeleteReason("");
    showToast("success", `Transaction ${deleteTxn.transaction_number} deleted`);
    logAudit({
      action: "delete",
      entity: "transaction",
      entity_id: deleteTxn.id,
      description: `Transaction ${deleteTxn.transaction_number} deleted`,
      details: { transaction_number: deleteTxn.transaction_number, reason: deleteReason },
    });
  }

  const [reverseReason, setReverseReason] = useState("");
  const [deleteReason, setDeleteReason] = useState("");

  const cardValue = (key: string) => {
    if (key === "count") return String(report.count);
    if (key === "withdrawal") return inr(report.withdrawal);
    if (key === "moneyOut") return inr(report.moneyOut);
    if (key === "moneyIn") return inr(report.moneyIn);
    if (key === "fees") return inr(report.fees);
    if (key === "commission") return inr(report.commission);
    return inr(netTotal);
  };

  function exportCsv() {
    downloadCsv(
      `${service}-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Transaction #",
        "Customer",
        "Date & Time",
        "Reference",
        "Amount",
        "Service Fee",
        "Portal Commission",
        "Status",
      ],
      filtered.map((t) => [
        t.transaction_number,
        t.customers?.name ?? t.customer_mobile ?? "-",
        fmtDateTime(t),
        t.reference ?? "-",
        Number(t.amount),
        Number(t.service_fee),
        Number(t.portal_commission),
        t.status,
      ])
    );
    showToast("success", `Exported ${filtered.length} ${label} transactions to CSV`);
  }

  const actionBtn =
    "inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium transition";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{cfg.title}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{cfg.desc}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 dark:bg-white/5 dark:text-slate-300">
            Today: {todayRows.length} · {inr(todayAmount)}
          </span>
          {pendingCount > 0 && (
            <span className="rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              {pendingCount} pending
            </span>
          )}
          {failedCount > 0 && (
            <span className="rounded-lg bg-rose-100 px-3 py-1.5 text-xs font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
              {failedCount} failed
            </span>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="btn-3d-tactile-primary flex items-center gap-2 px-5 py-2.5 text-xs font-black shadow-sm"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-4 w-4"><path d="M12 5v14M5 12h14" /></svg>
            {cfg.recordLabel}
          </button>
          <button
            onClick={exportCsv}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-extrabold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/5"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            Export CSV
          </button>
          <CompactToggle value={compact} onChange={setCompact} storageKey={`sccomm-business-${service}-compact`} />
          <ViewToggle value={view} onChange={setView} storageKey={`sccomm-business-${service}-view`} />
        </div>
      </div>

      <div className={`mt-6 grid grid-cols-2 gap-4 ${cfg.cards.length >= 5 ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        {cfg.cards.map((c) => {
          const handleClick = () => {
            if (c.key === "success") setStatusFilter(statusFilter === "success" ? "" : "success");
            else if (c.key === "pending") setStatusFilter(statusFilter === "pending" ? "" : "pending");
            else if (c.key === "failed") setStatusFilter(statusFilter === "failed" ? "" : "failed");
            else if (c.key === "today") {
              setDateFrom(today);
              setDateTo(today);
            } else {
              setStatusFilter("");
              setQ("");
              setDateFrom("");
              setDateTo("");
            }
          };
          return (
            <StatCard
              key={c.key}
              label={c.label}
              value={cardValue(c.key)}
              sub={c.sub}
              icon={c.icon}
              grad={c.grad}
              valueClass={c.key === "net" ? "text-emerald-600" : undefined}
              onClick={handleClick}
            />
          );
        })}
        {service === "upi" ? (
          <StatCard
            label="UPI POSITION"
            value={inr(float?.current ?? 9011)}
            sub={
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                ✓ Reconciled · Var ₹0.00
              </span>
            }
            icon={ICONS.coins}
            grad="from-slate-700 to-slate-900"
            href="/finance/reconciliation"
          />
        ) : float ? (
          <StatCard
            label={`${label} Float / Position`}
            value={inr(float.current)}
            sub={`Opening ${inr(float.opening)}${float.seed_date && float.seed_date !== "0001-01-01" ? ` · ${fmtDate(float.seed_date)}` : ""}`}
            icon={ICONS.coins}
            grad="from-slate-700 to-slate-900"
            href="/finance/opening-balances"
          />
        ) : null}
      </div>

      {cfg.groups.length > 0 && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">Report</p>
            <div className="flex rounded-xl bg-slate-100 p-0.5 text-xs">
              {cfg.groups.map((g) => (
                <button
                  key={g.value}
                  onClick={() => setGroupBy(g.value)}
                  className={`rounded-lg px-3 py-1.5 font-medium transition ${
                    groupBy === g.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
          {groups.length > 0 ? (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                      {groupBy === "bank" ? "Bank" : groupBy === "portal" ? "Portal" : groupBy === "provider" ? "Provider" : "Method"}
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Count</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                      {service === "aeps" ? "Withdrawn" : service === "recharge" ? "Recharged" : "Transferred"}
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Fees</th>
                    {service === "aeps" && (
                      <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Commission</th>
                    )}
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Shop Income</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {groups.map((g) => (
                    <tr key={g.label} className="transition hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{g.label}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{g.count}</td>
                      <td className="px-4 py-2.5 text-right text-slate-800">{inr(g.withdrawal)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{inr(g.fees)}</td>
                      {service === "aeps" && (
                        <td className="px-4 py-2.5 text-right text-slate-600">{inr(g.commission)}</td>
                      )}
                      <td className="px-4 py-2.5 text-right font-semibold text-emerald-600">{inr(g.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-400">Choose a grouping to see the breakdown.</p>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-[200px] flex-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400">
            <path d={ICONS.search} />
          </svg>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tr. no, reference, Aadhaar last 4, customer…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-0.5 text-xs">
            {["", ...STATUSES].map((s) => (
              <button
                key={s || "all"}
                onClick={() => setStatusFilter(s)}
                className={`rounded-lg px-2.5 py-1.5 font-medium capitalize transition ${
                  statusFilter === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {s || "All"}
              </button>
            ))}
          </div>
          {cfg.bankFilter && (
            <SearchableSelect
              value={bankFilter}
              onChange={setBankFilter}
              options={[
                { value: "", label: service === "dmt" ? "All Payment Accounts" : "All Banks" },
                ...(service === "dmt"
                  ? initialPaymentInstruments.map((b) => {
                      const accNum = b.details?.account_number
                        ? ` (…${String(b.details.account_number).slice(-4)})`
                        : "";
                      const typeIcon =
                        b.type === "cash"
                          ? "💵"
                          : b.type === "upi"
                          ? "📱"
                          : b.type === "wallet"
                          ? "👛"
                          : "🏦";
                      return {
                        value: b.id,
                        label: `${typeIcon} ${b.name}${accNum}`,
                      };
                    })
                  : initialBanks.filter((b) => b.name).map((b) => ({ value: b.id, label: b.name }))
                ),
              ]}
              searchPlaceholder={service === "dmt" ? "Search payment account…" : "Search bank…"}
              className="w-52"
            />
          )}
          {cfg.portalFilter && (
            <SearchableSelect
              value={portalFilter}
              onChange={setPortalFilter}
              options={[
                { value: "", label: "All Portals" },
                ...initialPortals.map((p) => ({ value: p.id, label: p.name })),
              ]}
              searchPlaceholder="Search portal…"
              className="w-44"
            />
          )}
          {cfg.providerFilter && (
            <SearchableSelect
              value={providerFilter}
              onChange={setProviderFilter}
              options={[
                { value: "", label: "All Providers" },
                ...initialRechargeProviders.map((p) => ({ value: p.id, label: p.name })),
              ]}
              searchPlaceholder="Search provider…"
              className="w-44"
            />
          )}
          {cfg.methodFilter && (
            <SearchableSelect
              value={methodFilter}
              onChange={setMethodFilter}
              options={[
                { value: "", label: "All Methods" },
                { value: "bank_account", label: "Bank Account" },
                { value: "upi", label: "UPI" },
              ]}
              searchPlaceholder="Search method…"
              className="w-44"
            />
          )}
          {cfg.customerFilter && (
            <SearchableSelect
              value={customerFilter}
              onChange={setCustomerFilter}
              options={[
                { value: "", label: "All Customers" },
                ...initialCustomers.map((c) => ({ value: c.id, label: `${c.name}${c.phone ? ` · ${c.phone}` : ""}` })),
              ]}
              searchPlaceholder="Search customer…"
              className="w-48"
            />
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-slate-100 p-0.5 text-xs">
          {(["today", "7d", "month", "all"] as const).map((p) => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${
                preset === p ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {p === "today" ? "Today" : p === "7d" ? "Last 7 days" : p === "month" ? "This month" : "All time"}
            </button>
          ))}
        </div>
        <input type="date" value={dateFrom} onChange={(e) => { setPreset("all"); setDateFrom(e.target.value); }} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200" />
        <span className="text-xs text-slate-400">to</span>
        <input type="date" value={dateTo} onChange={(e) => { setPreset("all"); setDateTo(e.target.value); }} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200" />
        <span className="ml-auto rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 dark:bg-white/5 dark:text-slate-300">
          {filtered.length} {label} transaction{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {view === "list" ? (
        <div className="mt-4 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-white/10">
          <table className={`min-w-full divide-y divide-slate-200 text-sm ${compact ? "rows-compact" : ""}`}>
          <thead className="bg-slate-50">
            <tr>
              {cfg.tableHeaders.map((h, i) => (
                <th
                  key={i}
                  className={`px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 ${
                    h.align === "right" ? "text-right" : h.align === "center" ? "text-center" : "text-left"
                  }`}
                >
                  {h.key === "txn" ? "Transaction"
                    : h.key === "customer" ? "Customer"
                    : h.key === "bankPortal" ? "Bank / Portal"
                    : h.key === "date" ? "Date"
                    : h.key === "withdrawal" ? (service === "aeps" ? "Withdrawal" : service === "recharge" ? "Recharged" : "Transfer")
                    : h.key === "moneyOut" ? "Money Out (Transfer)"
                    : h.key === "moneyIn" ? "Money In (Customer)"
                    : h.key === "fee" ? (service === "aeps" ? "Fee" : "Service Fee")
                    : h.key === "commission" ? "Commission"
                    : h.key === "provider" ? "Provider"
                    : h.key === "sender" ? "Representative"
                    : h.key === "beneficiary" ? "Beneficiary"
                    : h.key === "transfer" ? "Transfer"
                    : h.key === "income" ? "Income"
                    : h.key === "net" ? "Net"
                    : h.key === "upiAmount" ? "UPI Amount"
                    : h.key === "cashHanded" ? "Cash Handed"
                    : h.key === "status" ? "Status"
                    : h.key === "actions" ? "Actions"
                    : h.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((t) => (
              <tr key={t.id} className={`transition hover:bg-slate-50 ${t.status === "deleted" ? "opacity-60" : ""}`}>
                <td className="px-5 py-3">
                  <p className="font-mono text-xs font-medium text-blue-700">{t.transaction_number}</p>
                  <p className="cell-sub text-xs text-slate-400">{t.reference || "-"}</p>
                </td>
                <td className="px-5 py-3 text-slate-700">
                  {t.customers?.name || "-"}
                  <p className="cell-sub text-xs text-slate-400">{t.customer_mobile || t.customers?.phone || ""}</p>
                </td>
                {service === "aeps" && (
                  <td className="px-5 py-3 text-slate-700">
                    {t.banks?.name || "-"}
                    <p className="cell-sub text-xs text-slate-400">{t.portals?.name || "-"}</p>
                  </td>
                )}
                {service === "recharge" && (
                  <td className="px-5 py-3 text-slate-700">
                    {t.providers?.name || "-"}
                  </td>
                )}
                {service === "dmt" && (
                  <>
                    <td className="px-5 py-3 text-slate-700">
                      {t.sender_name || "-"}
                      <p className="cell-sub font-mono text-xs text-slate-400">{t.sender_mobile || ""}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      {t.beneficiary_name || "-"}
                      {t.transfer_method === "upi" ? (
                        <p className="cell-sub font-mono text-xs text-slate-400">{t.upi_id || ""}</p>
                      ) : (
                        <>
                          <p className="cell-sub text-xs text-slate-400">{t.beneficiary_bank || "-"}</p>
                          <p className="cell-sub font-mono text-xs text-slate-400">{t.beneficiary_account || ""}</p>
                        </>
                      )}
                      <p className="cell-sub text-xs text-slate-400">{t.transfer_method === "upi" ? "UPI" : "Bank Account"}</p>
                    </td>
                  </>
                )}
                <td className="px-5 py-3 text-slate-700">{fmtDateTime(t)}</td>
                {service === "aeps" && (
                  <>
                    <td className="px-5 py-3 text-right font-medium text-slate-900">{inr(t.amount)}</td>
                    <td className="px-5 py-3 text-right text-slate-700">{inr(t.service_fee)}</td>
                    <td className="px-5 py-3 text-right text-slate-700">{inr(t.portal_commission)}</td>
                  </>
                )}
                {service === "dmt" && (
                  <>
                    <td className="px-5 py-3 text-right font-medium">
                      <p className="font-bold text-rose-600 dark:text-rose-400">{inr(t.amount)}</p>
                      <p className="cell-sub text-[11px] text-slate-500 font-medium">
                        {getDmtBankName(t)}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-right font-medium">
                      <p className="font-bold text-emerald-600 dark:text-emerald-400">{inr(Number(t.amount) + Number(t.service_fee))}</p>
                      <p className="cell-sub text-[11px] text-slate-400 capitalize">{t.customer_pay_method === "due" ? "📋 Due" : t.customer_pay_method === "upi" ? "📱 UPI" : t.customer_pay_method === "bank" ? "🏦 Bank" : "💵 Cash"}</p>
                    </td>
                    <td className="px-5 py-3 text-right text-slate-700 dark:text-slate-300 font-medium">{inr(t.service_fee)}</td>
                    <td className="px-5 py-3 text-right font-bold text-violet-600 dark:text-violet-400 text-[13px]">{inr(Number(t.service_fee) - Number(t.portal_commission))}</td>
                  </>
                )}
                {service === "upi" && (
                  <>
                    <td className="px-5 py-3 text-right font-medium text-slate-900">{inr(t.amount)}</td>
                    <td className="px-5 py-3 text-right text-slate-700">{inr(t.amount)}</td>
                    <td className="px-5 py-3 text-right text-slate-700">{inr(t.service_fee)}</td>
                  </>
                )}
                {service === "recharge" && (
                  <>
                    <td className="px-5 py-3 text-right font-medium">
                      <p className="font-bold text-slate-900 dark:text-white">{inr(t.amount)}</p>
                      <p className="cell-sub text-[11px] text-slate-400 capitalize">
                        Cust: {t.customer_pay_method === "due" ? "📋 Due" : t.customer_pay_method === "upi" ? "📱 UPI" : t.customer_pay_method === "bank" ? "🏦 Bank" : "💵 Cash"}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-right font-medium">
                      <p className="font-bold text-emerald-600 dark:text-emerald-400">+{inr(t.portal_commission)}</p>
                      <p className="cell-sub text-[11px] text-slate-500 font-medium capitalize">
                        Paid: {initialPaymentInstruments?.find((i: any) => i.id === (t as any).pay_from_instrument_id)?.name || (t as any).pay_from_method?.replace('_', ' ') || "Bank"}
                      </p>
                    </td>
                  </>
                )}
                <td className="px-5 py-3 text-center">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[t.status] || "bg-slate-100 text-slate-500"}`}>
                    {t.status}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setDetailsTxn(t)}
                      title="Internal Operations & Margin Breakdown"
                      className={`${actionBtn} text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/30`}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                      Ops
                    </button>
                    <a
                      href={`/business/receipt/${t.id}`}
                      target="_blank"
                      title="Print 80mm receipt"
                      className={`${actionBtn} text-slate-600 hover:bg-slate-50`}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z" /></svg>
                      Print
                    </a>
                    <a
                      href={`/business/receipt/${t.id}/a4`}
                      target="_blank"
                      title="A4 print / PDF"
                      className={`${actionBtn} text-blue-600 hover:bg-blue-50`}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" /></svg>
                      A4 / PDF
                    </a>
                    <button
                      type="button"
                      onClick={() => handleSendWhatsAppTxn(t)}
                      title="Send Receipt via WhatsApp"
                      className={`${actionBtn} text-emerald-600 hover:bg-emerald-50`}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                      WhatsApp
                    </button>
                    {t.status === "success" && (
                      <>
                        <button onClick={() => setEditTxn(t)} title="Edit" className={`${actionBtn} text-slate-600 hover:bg-slate-50`}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" /></svg>
                        </button>
                        <button
                          onClick={() => setReverseTxn(t)}
                          disabled={busyId === t.id}
                          title="Reverse"
                          className={`${actionBtn} text-rose-600 hover:bg-rose-50 disabled:opacity-50`}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" /></svg>
                          {busyId === t.id ? "…" : "Reverse"}
                        </button>
                      </>
                    )}
                    {t.status !== "reversed" && t.status !== "deleted" && (
                      <button onClick={() => setDeleteTxn(t)} title="Delete" className={`${actionBtn} text-rose-600 hover:bg-rose-50`}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14Z" /></svg>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={12} className="px-5 py-12 text-center text-sm text-slate-400">
                  No {label} transactions found. Adjust filters or record a new one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => {
            const hasRef = t.reference || t.customers?.name || t.customer_mobile;
            return (
              <div
                key={t.id}
                className={`group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-slate-900 ${
                  t.status === "deleted" ? "opacity-60" : ""
                }`}
              >
                <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${t.status === "success" ? "from-emerald-500 to-teal-500" : t.status === "pending" ? "from-amber-500 to-orange-500" : "from-rose-500 to-pink-500"}`} />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold text-slate-900 dark:text-white">{t.transaction_number}</p>
                    <p className="truncate text-xs text-slate-400">
                      {t.customers?.name || t.customer_mobile || "Walk-in"}
                      {hasRef ? ` · ${t.reference ?? ""}` : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_BADGE[t.status] || "bg-slate-100 text-slate-500"}`}>
                    {t.status}
                  </span>
                </div>

                {(t.beneficiary_name || t.banks?.name || t.portals?.name || t.providers?.name || t.upi_id) && (
                  <p className="mt-3 truncate rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">
                    {service === "dmt"
                      ? `→ ${t.beneficiary_name ?? "-"}${t.transfer_method === "upi" && t.upi_id ? ` (${t.upi_id})` : ""}`
                      : t.providers?.name || t.banks?.name || t.portals?.name || t.upi_id || "-"}
                  </p>
                )}

                {service === "dmt" ? (
                  <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100 dark:bg-slate-800/60 dark:ring-white/5">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-500">📤 Money Out (Sent)</p>
                      <p className="mt-0.5 text-base font-bold text-rose-600 dark:text-rose-400">{inr(t.amount)}</p>
                      <p className="text-[11px] text-slate-500 font-medium">
                        {getDmtBankName(t)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-500">📥 Money In (Recv)</p>
                      <p className="mt-0.5 text-base font-bold text-emerald-600 dark:text-emerald-400">{inr(Number(t.amount) + Number(t.service_fee))}</p>
                      <p className="text-[11px] text-slate-400 capitalize">{t.customer_pay_method === "due" ? "Customer Due" : t.customer_pay_method === "upi" ? "UPI QR" : t.customer_pay_method === "bank" ? "Bank Transfer" : "Cash Received"}</p>
                    </div>
                    <div className="col-span-2 mt-1 flex items-center justify-between border-t border-slate-200/60 pt-2 text-xs dark:border-white/10">
                      <span className="text-slate-500 dark:text-slate-400">Customer Fee: <b>{inr(t.service_fee)}</b></span>
                      <span className="font-semibold text-violet-600 dark:text-violet-400">Net Profit: {inr(Number(t.service_fee) - Number(t.portal_commission))}</span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex items-end justify-between">
                    <div>
                      <p className="text-xs text-slate-400">{service === "upi" ? "Cash handed" : service === "aeps" ? "Withdrawn" : "Recharged"}</p>
                      <p className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{inr(t.amount)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Shop income</p>
                      <p className="text-sm font-semibold text-emerald-600">
                        {inr(Number(t.service_fee) + Number(t.portal_commission))}
                      </p>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-white/10">
                  <span className="text-xs text-slate-400">{fmtDateTime(t)}</span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setDetailsTxn(t)}
                      title="Internal Operations & Margin Breakdown"
                      className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300"
                    >
                      Ops
                    </button>
                    <a
                      href={`/business/receipt/${t.id}`}
                      target="_blank"
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                    >
                      Print
                    </a>
                    <a
                      href={`/business/receipt/${t.id}/a4`}
                      target="_blank"
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-blue-600 transition hover:bg-blue-50 dark:border-white/10 dark:hover:bg-blue-500/10"
                    >
                      A4 / PDF
                    </a>
                    <button
                      type="button"
                      onClick={() => handleSendWhatsAppTxn(t)}
                      title="Send Receipt via WhatsApp"
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-600 transition hover:bg-emerald-100"
                    >
                      WhatsApp
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-500 dark:border-white/10">
              No {label} transactions found. Adjust filters or record a new one.
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <BusinessFormModal
          service={service}
          label={label}
          customers={initialCustomers}
          banks={initialBanks}
          portals={initialPortals}
          qrs={initialQrs}
          rechargeProviders={initialRechargeProviders}
          rechargeSlabs={initialRechargeSlabs}
          paymentAccounts={initialPaymentInstruments}
          txns={txns}
          onClose={() => setShowCreate(false)}
          onSave={createTxn}
        />
      )}

      {editTxn && (
        <BusinessFormModal
          service={service}
          label={label}
          customers={initialCustomers}
          banks={initialBanks}
          portals={initialPortals}
          qrs={initialQrs}
          rechargeProviders={initialRechargeProviders}
          rechargeSlabs={initialRechargeSlabs}
          paymentAccounts={initialPaymentInstruments}
          txns={txns}
          initial={editTxn}
          onClose={() => setEditTxn(null)}
          onSave={saveEdit}
        />
      )}

      {reverseTxn && (
        <ReasonModal
          title={`Reverse ${label} Transaction`}
          note="A reversing cash entry is posted. The original record and entries are never deleted."
          confirmLabel="Reverse Transaction"
          busy={busyId === reverseTxn.id}
          reason={reverseReason}
          setReason={setReverseReason}
          onClose={() => setReverseTxn(null)}
          onConfirm={reverse}
        />
      )}

      {deleteTxn && (
        <ReasonModal
          title={`Delete ${label} Transaction`}
          note="Admin or Manager only. The posted cash entry is reversed and the record is marked deleted — it is never removed."
          confirmLabel="Delete Transaction"
          busy={busyId === deleteTxn.id}
          reason={deleteReason}
          setReason={setDeleteReason}
          onClose={() => setDeleteTxn(null)}
          onConfirm={deleteTxnAction}
        />
      )}

      {detailsTxn && (
        <Modal
          onClose={() => setDetailsTxn(null)}
          title={`Internal Transaction Details · #${detailsTxn.transaction_number}`}
          size="md"
        >
          <div className="space-y-4 text-sm">
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-white/5 space-y-2 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Service Type</span>
                <span className="font-bold text-slate-900 dark:text-white uppercase">{detailsTxn.service_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Transaction No</span>
                <span className="font-bold">{detailsTxn.transaction_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date</span>
                <span>{detailsTxn.transaction_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status</span>
                <span className="font-bold text-emerald-600 uppercase">{detailsTxn.status}</span>
              </div>
              {detailsTxn.reference && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Reference / UTR</span>
                  <span className="font-bold">{detailsTxn.reference}</span>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-900/30 dark:bg-indigo-950/20 space-y-2 text-xs">
              <p className="font-bold text-indigo-900 dark:text-indigo-300 uppercase tracking-wide">
                Shop Operations &amp; Margin Breakdown
              </p>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Transaction Amount</span>
                <span className="font-bold text-slate-900 dark:text-white">{inr(Number(detailsTxn.amount))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Customer Service Fee Collected</span>
                <span className="font-bold text-emerald-600">+{inr(Number(detailsTxn.service_fee || 0))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Portal / Provider Commission</span>
                <span className="font-bold text-emerald-600">+{inr(Number(detailsTxn.portal_commission || 0))}</span>
              </div>
              <div className="flex justify-between border-t border-indigo-200/60 pt-2 font-bold text-slate-900 dark:text-white">
                <span>Net Shop Revenue / Margin</span>
                <span className="text-emerald-700 dark:text-emerald-400">
                  {inr(Number(detailsTxn.service_fee || 0) + Number(detailsTxn.portal_commission || 0))}
                </span>
              </div>
              {detailsTxn.paid_from && (
                <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-white/10">
                  <span className="text-slate-600 dark:text-slate-400">Paid From Source</span>
                  <span className="font-semibold capitalize">{detailsTxn.paid_from}</span>
                </div>
              )}
              {detailsTxn.customer_pay_method && (
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Customer Paid Via</span>
                  <span className="font-semibold capitalize">{detailsTxn.customer_pay_method}</span>
                </div>
              )}
              {detailsTxn.remarks && (
                <div className="pt-1 text-slate-500">
                  <span className="font-semibold">Remarks:</span> {detailsTxn.remarks}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <a
                href={`/business/receipt/${detailsTxn.id}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
              >
                🧾 80mm Receipt
              </a>
              <a
                href={`/business/receipt/${detailsTxn.id}/a4`}
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-500"
              >
                📄 A4 Invoice
              </a>
              <button
                type="button"
                onClick={() => setDetailsTxn(null)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {waModal && (
        <WhatsAppSendModal
          open={Boolean(waModal)}
          onClose={() => setWaModal(null)}
          phone={waModal.phone}
          recipientName={waModal.name}
          initialMessage={waModal.msg}
          messageType="banking_txn"
          refId={waModal.refId}
          refNumber={waModal.refNum}
        />
      )}

      {toastView}
    </div>
  );
}
