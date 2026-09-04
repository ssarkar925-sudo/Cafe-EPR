"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/lib/supabase/realtime";
import { logAudit } from "@/lib/audit";
import CustomerFormModal from "./customer-form-modal";
import CustomerPhotoModal from "./customer-photo-modal";
import AdvanceModal from "./advance-modal";
import SearchableSelect from "@/components/ui/searchable-select";
import { findDuplicateCustomer, digitsOnly, isDuplicateKeyError } from "@/lib/customers";
import { DEFAULT_WA_TEMPLATES, getWhatsAppConfig, renderWhatsAppTemplate } from "@/lib/whatsapp";
import WhatsAppSendModal from "@/components/whatsapp/whatsapp-send-modal";

export type Customer = {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  opening_balance: number | string;
  balance: number | string;
  customer_type: string | null;
  credit_limit?: number | string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
};

type ModalState =
  | { mode: "create" }
  | { mode: "edit"; customer: Customer }
  | null;

type DetailTab = "invoices" | "business" | "ledger";

function inr(n: number | string) {
  return (
    "₹" +
    Number(n).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
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

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-5 w-5"}
    >
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  camera: "M3 9a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z M12 11v5M9.5 13.5h5",
  check: "M20 6 9 17l-5-5",
  receipt: "M6 2h12a1 1 0 0 1 1 1v18l-2.5-1.5L14 21l-2.5-1.5L9 21l-2.5-1.5L5 21V3a1 1 0 0 1 1-1Z",
  txn: "M22 2 11 13M22 2 15 22l-4-9-9-4z",
  ledger: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.4 2.1L8.1 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.6 2Z",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 3 8 6 8-6",
  pin: "M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11Z M12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  close: "M6 6l12 12M18 6L6 18",
};

const STATUS_PILL: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-700",
  unpaid: "bg-rose-100 text-rose-700",
  cancelled: "bg-slate-200 text-slate-600",
};

const TXN_PILL: Record<string, string> = {
  aeps: "bg-blue-100 text-blue-700",
  dmt: "bg-violet-100 text-violet-700",
  upi: "bg-fuchsia-100 text-fuchsia-700",
};

const TXN_STATUS: Record<string, string> = {
  success: "text-emerald-600",
  pending: "text-amber-600",
  failed: "text-rose-600",
  reversed: "text-slate-400",
  deleted: "text-slate-400",
};

type BalanceFilter = "all" | "owing" | "advance" | "settled";
type SortBy = "newest" | "name" | "balance";

export default function CustomersClient({
  initialCustomers,
}: {
  initialCustomers: Customer[];
}) {
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [balFilter, setBalFilter] = useState<BalanceFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [modal, setModal] = useState<ModalState>(null);
  const [dupWarning, setDupWarning] = useState<{ dup: Customer; input: any } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Customer | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("invoices");
  const [photoCustomer, setPhotoCustomer] = useState<Customer | null>(null);
  const [advanceModal, setAdvanceModal] = useState<{ mode: "record" | "return" } | null>(null);
  const [detail, setDetail] = useState<{
    invoices: any[];
    ledger: any[];
    transactions: any[];
    loading: boolean;
  }>({ invoices: [], ledger: [], transactions: [], loading: false });

  const [waModal, setWaModal] = useState<{
    open: boolean;
    phone: string;
    name: string;
    msg: string;
    invNum?: string;
    refId?: string;
  } | null>(null);

  function sendKhataReminder(c: Customer, inv?: any) {
    if (!c.phone) return;
    const cfg = getWhatsAppConfig();
    const template = cfg.templates?.due_reminder || DEFAULT_WA_TEMPLATES.due_reminder;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const dueAmt = inv ? Number(inv.due) : Number(c.balance);
    const invoiceNum = inv?.invoice_number || (c.code ? `Khata (${c.code})` : "Khata Balance");
    const invoiceDt = inv?.invoice_date || new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const receiptUrl = inv ? `${origin}/receipt/${inv.id}/a4` : `${origin}/customers/${c.id}`;

    const msg = renderWhatsAppTemplate(template, {
      shop_name: "Sarkar Communication",
      customer_name: c.name || "Customer",
      customer_name_line: c.name ? `👤 Customer: ${c.name}\n` : "",
      due_amount: inr(dueAmt),
      invoice_number: invoiceNum,
      invoice_date: invoiceDt,
      receipt_url: receiptUrl,
    });

    setWaModal({
      open: true,
      phone: c.phone,
      name: c.name || "Customer",
      msg,
      invNum: invoiceNum,
      refId: inv?.id || c.id,
    });
  }

  const supabase = createClient();
  const router = useRouter();
  useRealtime(["customers", "invoices", "customer_ledger", "payments", "transactions"]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return customers
      .filter((c) => {
        if (status === "active" && !c.is_active) return false;
        if (status === "inactive" && c.is_active) return false;
        if (balFilter === "owing" && Number(c.balance) <= 0) return false;
        if (balFilter === "advance" && Number(c.balance) >= 0) return false;
        if (balFilter === "settled" && Number(c.balance) !== 0) return false;
        if (!needle) return true;
        return (
          c.name.toLowerCase().includes(needle) ||
          (c.phone ?? "").includes(needle) ||
          (c.code ?? "").toLowerCase().includes(needle) ||
          (c.email ?? "").toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => {
        if (sortBy === "name") return a.name.localeCompare(b.name);
        if (sortBy === "balance") return Number(b.balance) - Number(a.balance);
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [customers, q, status, balFilter, sortBy]);

  const stats = useMemo(() => {
    let active = 0,
      receivables = 0,
      advances = 0;
    for (const c of customers) {
      const b = Number(c.balance);
      if (c.is_active) active++;
      if (b > 0) receivables += b;
      else if (b < 0) advances += Math.abs(b);
    }
    return { total: customers.length, active, receivables, advances };
  }, [customers]);

  async function loadDetail(customer: Customer) {
    setViewing(customer);
    setDetailTab("invoices");
    setDetail((d) => ({ ...d, loading: true }));
    const [invRes, ledgerRes, txnRes] = await Promise.all([
      supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, total, paid, due, status")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .rpc("get_customer_ledger", { p_customer_id: customer.id }),
      supabase
        .rpc("get_customer_transactions", { p_customer_id: customer.id }),
    ]);
    setDetail({
      invoices: (invRes.data ?? []) as any[],
      ledger: (ledgerRes.data ?? []) as any[],
      transactions: (txnRes.data ?? []) as any[],
      loading: false,
    });
  }

  const detailStats = useMemo(() => {
    const open = detail.invoices.filter((i) => i.status !== "cancelled");
    let purchased = 0,
      paid = 0,
      due = 0,
      count = 0;
    for (const i of open) {
      purchased += Number(i.total);
      paid += Number(i.paid);
      due += Number(i.due);
      count++;
    }
    const successTxns = detail.transactions.filter((t) => t.status === "success");
    const businessTotal = successTxns.reduce((s, t) => s + Number(t.amount), 0);
    const businessIncome = successTxns.reduce(
      (s, t) => s + Number(t.service_fee) + Number(t.portal_commission),
      0
    );
    const bal = viewing ? Number(viewing.balance) : 0;
    return {
      purchased,
      paid,
      due,
      count,
      businessTotal,
      businessIncome,
      businessCount: successTxns.length,
      advance: bal < 0 ? Math.abs(bal) : 0,
    };
  }, [detail, viewing]);

  function nextCode() {
    let max = 0;
    for (const c of customers) {
      const n = parseInt(String(c.code ?? "").replace(/\D/g, ""), 10);
      if (!Number.isNaN(n)) max = Math.max(max, n);
    }
    return "CUST-" + String(max + 1).padStart(4, "0");
  }

  async function saveCustomer(
    raw: {
      name: string;
      phone: string;
      email: string;
      address: string;
      opening_balance: number;
      customer_type: string;
    },
    customer?: Customer
  ) {
    const input = { ...raw, phone: digitsOnly(raw.phone) };
    if (customer) {
      let { error } = await supabase
        .from("customers")
        .update(input)
        .eq("id", customer.id);
      if (error && error.message.includes("credit_limit")) {
        const { credit_limit, ...rest } = input as any;
        const res = await supabase.from("customers").update(rest).eq("id", customer.id);
        error = res.error;
      }
      if (error) {
        if (isDuplicateKeyError(error.message)) {
          alert("A customer with this phone number already exists.");
        } else {
          alert(error.message);
        }
        return;
      }
      setCustomers((prev) =>
        prev.map((c) => (c.id === customer.id ? { ...c, ...input } : c))
      );
      setViewing((v) => (v && v.id === customer.id ? { ...v, ...input } : v));
    } else {
      if (input.phone) {
        let dup: { id: string; name: string; phone?: string | null } | null = null;
        try {
          dup = await findDuplicateCustomer(supabase, input.phone);
        } catch (e: any) {
          alert(e.message);
          return;
        }
        if (dup) {
          const existing = customers.find((c) => c.id === dup.id) ?? {
            ...dup,
            code: null,
            phone: dup.phone ?? null,
            email: null,
            address: null,
            opening_balance: 0,
            balance: 0,
            customer_type: "retail",
            avatar_url: null,
            is_active: true,
            created_at: "",
          };
          setDupWarning({ dup: existing, input });
          return;
        }
      }
      const payload = {
        ...input,
        code: nextCode(),
        balance: input.opening_balance,
        is_active: true,
      };
      let { data, error } = await supabase
        .from("customers")
        .insert(payload)
        .select()
        .single();
      if (error && error.message.includes("credit_limit")) {
        const { credit_limit, ...rest } = payload as any;
        const res = await supabase.from("customers").insert(rest).select().single();
        data = res.data;
        error = res.error;
      }
      if (error) {
        if (isDuplicateKeyError(error.message)) {
          alert("A customer with this phone number already exists.");
        } else {
          alert(error.message);
        }
        return;
      }
      setCustomers((prev) => [data as Customer, ...prev]);
    }
    setModal(null);
    logAudit({
      action: customer ? "update" : "create",
      entity: "customer",
      entity_id: customer?.id ?? null,
      description: customer ? `Customer updated: ${input.name}` : `Customer created: ${input.name}`,
      details: { name: input.name },
    });
  }

  async function removeCustomer(id: string, active: boolean) {
    setDeletingId(id);
    const { error } = await supabase
      .from("customers")
      .update({ is_active: !active })
      .eq("id", id);
    setDeletingId(null);
    if (error) {
      alert(error.message);
      return;
    }
    setCustomers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, is_active: !active } : c))
    );
    setViewing((v) => (v && v.id === id ? { ...v, is_active: !active } : v));
  }

  const onPhotoSaved = (url: string | null) => {
    if (!photoCustomer) return;
    setCustomers((prev) =>
      prev.map((c) => (c.id === photoCustomer.id ? { ...c, avatar_url: url } : c))
    );
    setViewing((v) => (v && v.id === photoCustomer.id ? { ...v, avatar_url: url } : v));
    setPhotoCustomer((p) => (p ? { ...p, avatar_url: url } : p));
  };

  const onAdvanceDone = (balance: number) => {
    if (!advanceModal || !viewing) return;
    const id = viewing.id;
    const updated = { ...viewing, balance };
    setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, balance } : c)));
    setViewing(updated);
    logAudit({
      action: advanceModal.mode === "record" ? "advance_received" : "advance_returned",
      entity: "customer",
      entity_id: id,
      description: `${advanceModal.mode === "record" ? "Advance received from" : "Advance returned to"} ${updated.name}`,
      details: { balance },
    });
    loadDetail(updated);
    setAdvanceModal(null);
  };

  const KPI_CARDS = [
    {
      label: "Total Customers",
      value: String(stats.total),
      icon: "M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM23 21v-2a4 4 0 0 0-3-3.87",
      grad: "from-blue-500 to-indigo-600",
      glow: "card-glow-indigo",
      onClick: () => {
        setStatus("all");
        setBalFilter("all");
        setQ("");
      },
    },
    {
      label: "Active",
      value: String(stats.active),
      icon: "M20 6 9 17l-5-5",
      grad: "from-emerald-500 to-teal-600",
      glow: "card-glow-emerald",
      onClick: () => {
        setStatus("active");
        setBalFilter("all");
      },
    },
    {
      label: "Receivables",
      value: inr(stats.receivables),
      icon: "M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2M3 10h18M16 15h2",
      grad: "from-rose-500 to-pink-600",
      glow: "card-glow-rose",
      textColor: "text-rose-600 dark:text-rose-400",
      sub: "Outstanding Due",
      onClick: () => {
        setStatus("all");
        setBalFilter("owing");
      },
    },
    {
      label: "Advances",
      value: inr(stats.advances),
      icon: "M3 17l6-6 4 4 8-8M15 7h6v6",
      grad: "from-violet-500 to-purple-600",
      glow: "card-glow-purple",
      textColor: "text-purple-600 dark:text-purple-400",
      sub: "Customer Credit Pool",
      onClick: () => {
        setStatus("all");
        setBalFilter("advance");
      },
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      {/* =========================================================================
          TOP EXECUTIVE HEADER (Glowing Bento Surface & Tactile Triggers)
      ========================================================================= */}
      <div className="card-glow-indigo rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-xs backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/90 transition-all">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="icon-box-3d flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md shadow-indigo-500/20">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Café ERP / Sales Hub / Customer Directory
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Khata Directory
                </span>
              </div>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                Customers &amp; Khata Master
              </h1>
              <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                Customer directory, individual credit ledgers, receivables, and WhatsApp reminder dispatch.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/pos"
              className="btn-3d-tactile-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 text-indigo-500">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
              </svg>
              <span>POS Billing</span>
            </Link>
            <button
              onClick={() => setModal({ mode: "create" })}
              className="btn-3d-tactile-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition-all"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>Add Customer</span>
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          HERO BENTO KPI GRID (4 Multi-Tone Glowing Bento Surfaces)
      ========================================================================= */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPI_CARDS.map((c) => (
          <div
            key={c.label}
            onClick={c.onClick}
            className={`group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-slate-900/90 ${c.glow}`}
          >
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${c.grad}`} />
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {c.label}
              </span>
              <div className={`icon-box-3d flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${c.grad} text-white shadow-sm`}>
                <Icon d={c.icon} className="h-4 w-4" />
              </div>
            </div>
            <p className={`mt-2 font-mono text-2xl font-black tracking-tight ${c.textColor || "text-slate-900 dark:text-white"}`}>
              {c.value}
            </p>
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-white/5 pt-2">
              <span>{c.sub || "Directory Filter"}</span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition-transform">Filter →</span>
            </div>
          </div>
        ))}
      </div>

      {/* =========================================================================
          FILTER & SEARCH TOOLBAR (Tactile Buttons & High-Contrast Input)
      ========================================================================= */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-[240px] flex-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search customer name, phone, code, email..."
            className="w-full rounded-xl border border-slate-200/90 bg-white/90 py-2.5 pl-10 pr-3 text-xs font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-slate-900/90 dark:text-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Segmented Pills */}
          <div className="flex rounded-xl border border-slate-200/80 bg-slate-100/70 p-1 text-xs dark:border-white/10 dark:bg-white/[0.04]">
            {(["all", "active", "inactive"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`rounded-lg px-3 py-1 text-xs font-bold capitalize transition-all duration-150 active:scale-95 ${
                  status === s
                    ? "bg-white text-indigo-600 shadow-xs dark:bg-slate-800 dark:text-indigo-400"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Balance Filter Segmented Pills */}
          <div className="flex rounded-xl border border-slate-200/80 bg-slate-100/70 p-1 text-xs dark:border-white/10 dark:bg-white/[0.04]">
            {(["all", "owing", "advance", "settled"] as const).map((b) => (
              <button
                key={b}
                onClick={() => setBalFilter(b)}
                className={`rounded-lg px-3 py-1 text-xs font-bold capitalize transition-all duration-150 active:scale-95 ${
                  balFilter === b
                    ? "bg-white text-indigo-600 shadow-xs dark:bg-slate-800 dark:text-indigo-400"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                {b}
              </button>
            ))}
          </div>

          <SearchableSelect
            value={sortBy}
            onChange={(v) => setSortBy(v as SortBy)}
            options={[
              { value: "newest", label: "Newest first" },
              { value: "name", label: "Name A–Z" },
              { value: "balance", label: "Highest balance" },
            ]}
            searchPlaceholder="Search sort…"
            className="w-44"
          />

          <span className="rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-1.5 font-mono text-xs font-bold text-slate-600 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300">
            {filtered.length} / {customers.length}
          </span>
        </div>
      </div>

      {/* =========================================================================
          CUSTOMERS DIRECTORY TABLE (Monospace Codes & Soft-Ring Badges)
      ========================================================================= */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-sm dark:border-white/10 dark:bg-slate-900/90">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/70 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-400">
                <th className="px-5 py-3.5">Customer</th>
                <th className="px-5 py-3.5">Code</th>
                <th className="hidden px-5 py-3.5 lg:table-cell">Email</th>
                <th className="px-5 py-3.5 text-right">Khata Balance</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filtered.map((c) => {
                const b = Number(c.balance);
                return (
                  <tr
                    key={c.id}
                    onClick={() => loadDetail(c)}
                    className={`group cursor-pointer transition-colors hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 ${!c.is_active ? "opacity-60" : ""}`}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        {c.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={c.avatar_url}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-xl object-cover ring-2 ring-slate-200/80 dark:ring-white/10 shadow-xs"
                          />
                        ) : (
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient(c.name)} text-sm font-black text-white shadow-xs`}>
                            {c.name.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {c.name}
                          </p>
                          <p className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                            {c.phone ?? "No phone"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs font-semibold text-slate-600 dark:text-slate-400">
                      {c.code ?? "-"}
                    </td>
                    <td className="hidden px-5 py-3.5 text-slate-600 dark:text-slate-400 lg:table-cell">
                      {c.email ?? "-"}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {b > 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-0.5 font-mono text-xs font-bold text-rose-700 dark:text-rose-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                          {inr(b)} due
                        </span>
                      ) : b < 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          {inr(Math.abs(b))} advance
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                          Settled
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                        c.is_active
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : "border-slate-500/20 bg-slate-500/10 text-slate-600 dark:text-slate-400"
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${c.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
                        {c.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {b > 0 && c.phone && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              sendKhataReminder(c);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-700 transition hover:bg-emerald-500/20 active:scale-95 dark:text-emerald-300"
                            title={`Send WhatsApp Khata Due Reminder (${inr(b)})`}
                          >
                            <span>💬 Remind</span>
                          </button>
                        )}
                        <Link
                          href={`/customers/${c.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-1 text-xs font-bold text-indigo-600 transition hover:bg-indigo-50 active:scale-95 dark:border-white/10 dark:bg-slate-800 dark:text-indigo-400"
                        >
                          Profile
                        </Link>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setModal({ mode: "edit", customer: c });
                          }}
                          className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-1 text-xs font-bold text-slate-600 transition hover:bg-slate-50 active:scale-95 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
                        >
                          Edit
                        </button>
                        {c.is_active && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeCustomer(c.id, true);
                            }}
                            disabled={deletingId === c.id}
                            className="rounded-lg border border-rose-200/80 bg-white px-2.5 py-1 text-xs font-bold text-rose-600 transition hover:bg-rose-50 active:scale-95 disabled:opacity-50 dark:border-rose-900/30 dark:bg-slate-800 dark:text-rose-400"
                          >
                            {deletingId === c.id ? "..." : "Deactivate"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-xs text-slate-400">
                    No customers found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <CustomerFormModal
          state={modal}
          onClose={() => setModal(null)}
          onSave={saveCustomer}
        />
      )}

      {dupWarning && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900">
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Customer with this mobile number already exists
            </h3>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              A customer record for <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{dupWarning.dup.phone}</span> is
              already present in your directory:
            </p>
            <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-white/5 dark:bg-white/[0.03]">
              <p className="text-sm font-bold text-slate-900 dark:text-white">{dupWarning.dup.name}</p>
              <p className="font-mono text-xs text-slate-400">
                {dupWarning.dup.code ?? ""} · {dupWarning.dup.phone ?? ""}
              </p>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => {
                  router.push(`/customers/${dupWarning.dup.id}`);
                  setDupWarning(null);
                  setModal(null);
                }}
                className="btn-3d-tactile-secondary rounded-xl px-3 py-2 text-xs font-bold"
              >
                View Customer
              </button>
              <button
                onClick={() => {
                  setModal({ mode: "edit", customer: dupWarning.dup });
                  setDupWarning(null);
                }}
                className="btn-3d-tactile-primary rounded-xl px-3.5 py-2 text-xs font-bold text-white shadow-sm"
              >
                Use Existing
              </button>
              <button
                onClick={() => setDupWarning(null)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:text-slate-400"
              >
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          SLIDE-OVER CUSTOMER DETAIL DRAWER (Modern Bento Surface & Live Ledger)
      ========================================================================= */}
      {viewing && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm" onClick={() => setViewing(null)}>
          <div
            className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col bg-white shadow-2xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Top Header */}
            <div className="relative shrink-0 border-b border-slate-200/80 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-6 py-5 text-white dark:border-white/10">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-4">
                  <div className="relative shrink-0">
                    {viewing.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={viewing.avatar_url}
                        alt=""
                        className="h-16 w-16 rounded-2xl object-cover ring-2 ring-white/20 shadow-md"
                      />
                    ) : (
                      <div className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${gradient(viewing.name)} text-2xl font-black text-white ring-2 ring-white/20 shadow-md`}>
                        {viewing.name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <button
                      onClick={() => setPhotoCustomer(viewing)}
                      className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500 text-white ring-2 ring-slate-900 transition hover:bg-indigo-600 shadow-sm"
                      title="Change photo"
                    >
                      <Icon d={ICONS.camera} className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-black text-white">{viewing.name}</p>
                    <div className="mt-0.5 flex items-center gap-2 font-mono text-xs text-indigo-200">
                      <span>{viewing.code ?? "CUST-0000"}</span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1 font-sans">
                        <span className={`h-1.5 w-1.5 rounded-full ${viewing.is_active ? "bg-emerald-400" : "bg-slate-400"}`} />
                        {viewing.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-300">
                      {viewing.phone && (
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Icon d={ICONS.phone} className="h-3 w-3 text-indigo-300" /> {viewing.phone}
                        </span>
                      )}
                      {viewing.email && (
                        <span className="inline-flex items-center gap-1">
                          <Icon d={ICONS.mail} className="h-3 w-3 text-indigo-300" /> {viewing.email}
                        </span>
                      )}
                      {viewing.address && (
                        <span className="inline-flex items-center gap-1">
                          <Icon d={ICONS.pin} className="h-3 w-3 text-indigo-300" /> {viewing.address}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setViewing(null)}
                  className="rounded-xl bg-white/10 p-2 text-slate-300 transition hover:bg-white/20 hover:text-white"
                >
                  <Icon d={ICONS.close} className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* 4 Lifetime Summary Bento Cards */}
            <div className="grid shrink-0 grid-cols-2 gap-3 border-b border-slate-100 bg-slate-50/50 p-4 dark:border-white/5 dark:bg-white/[0.02] sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs dark:border-white/10 dark:bg-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Purchases</span>
                <p className="mt-1 font-mono text-sm font-black text-slate-900 dark:text-white">
                  {detail.loading ? "…" : inr(detailStats.purchased)}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 shadow-2xs dark:bg-emerald-950/20">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Total Paid</span>
                <p className="mt-1 font-mono text-sm font-black text-emerald-700 dark:text-emerald-300">
                  {detail.loading ? "…" : inr(detailStats.paid)}
                </p>
              </div>
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 shadow-2xs dark:bg-rose-950/20">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Balance Due</span>
                <p className="mt-1 font-mono text-sm font-black text-rose-700 dark:text-rose-300">
                  {detail.loading ? "…" : inr(detailStats.due)}
                </p>
              </div>
              <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3 shadow-2xs dark:bg-purple-950/20">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">Advance</span>
                <p className="mt-1 font-mono text-sm font-black text-purple-700 dark:text-purple-300">
                  {detail.loading ? "…" : inr(detailStats.advance)}
                </p>
              </div>
            </div>

            {/* WhatsApp Khata Reminder Alert Tray */}
            {detailStats.due > 0 && viewing.phone && (
              <div className="mx-6 mt-4 flex items-center justify-between rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 dark:bg-emerald-950/30">
                <div className="flex items-center gap-2.5 text-xs">
                  <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-500 text-white font-black text-xs shadow-xs">💬</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    Outstanding Khata Due: <span className="font-mono font-black text-rose-600 dark:text-rose-400">{inr(detailStats.due)}</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => sendKhataReminder(viewing)}
                  className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-3.5 py-1.5 text-xs font-black text-white shadow-md shadow-emerald-600/20 hover:brightness-110 active:scale-95 transition-all"
                >
                  Send Reminder
                </button>
              </div>
            )}

            {/* Segmented Navigation Tab Bar */}
            <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-3 border-b border-slate-100 dark:border-white/5">
              <div className="flex rounded-xl border border-slate-200/80 bg-slate-100/70 p-1 text-xs dark:border-white/10 dark:bg-white/[0.04]">
                {(
                  [
                    { key: "invoices", label: "Invoices", icon: ICONS.receipt },
                    { key: "business", label: "Business", icon: ICONS.txn },
                    { key: "ledger", label: "Ledger", icon: ICONS.ledger },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setDetailTab(t.key)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition-all duration-150 active:scale-95 ${
                      detailTab === t.key
                        ? "bg-white text-indigo-600 shadow-xs dark:bg-slate-800 dark:text-indigo-400"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    }`}
                  >
                    <Icon d={t.icon} className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                ))}
              </div>
              {detailTab === "business" && !detail.loading && (
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                  {detailStats.businessCount} txns · {inr(detailStats.businessTotal)}
                </span>
              )}
            </div>

            {/* Tab Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {detail.loading ? (
                <p className="py-8 text-center text-xs text-slate-400">Loading details…</p>
              ) : detailTab === "invoices" ? (
                detail.invoices.length > 0 ? (
                  <div className="space-y-2">
                    {detail.invoices.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3 transition hover:border-indigo-200 hover:bg-indigo-50/20 dark:border-white/10 dark:bg-slate-800/60"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">{inv.invoice_number}</span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-white/10 dark:text-slate-400">{inv.invoice_date}</span>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${STATUS_PILL[inv.status] ?? "bg-slate-100 text-slate-600"}`}>
                              {inv.status}
                            </span>
                            <span className="font-mono text-[11px] text-slate-400">
                              paid {inr(inv.paid)} · due {inr(inv.due)}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="font-mono text-sm font-black text-slate-900 dark:text-white">{inr(inv.total)}</span>
                          {Number(inv.due) > 0 && viewing.phone && (
                            <button
                              type="button"
                              onClick={() => sendKhataReminder(viewing, inv)}
                              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-500/20 active:scale-95 transition-all dark:text-emerald-300"
                              title="Send WhatsApp Invoice Due Reminder"
                            >
                              💬 Remind
                            </button>
                          )}
                          <Link
                            href={`/receipt/${inv.id}/a4`}
                            target="_blank"
                            className="btn-3d-tactile-secondary rounded-lg px-2 py-1 text-[11px] font-bold"
                          >
                            Print
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-8 text-center text-xs text-slate-400">No invoices yet.</p>
                )
              ) : detailTab === "business" ? (
                detail.transactions.length > 0 ? (
                  <div className="space-y-2">
                    {detail.transactions.map((t) => (
                      <div
                        key={t.id ?? t.transaction_number}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3 transition hover:border-violet-200 hover:bg-violet-50/20 dark:border-white/10 dark:bg-slate-800/60"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${TXN_PILL[t.service_type] ?? "bg-slate-100 text-slate-600"}`}>
                              {t.service_type}
                            </span>
                            <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">{t.transaction_number}</span>
                          </div>
                          <div className="mt-1 font-mono text-[11px] text-slate-400">
                            {t.transaction_date} · {t.direction === "in" ? "inward" : "outward"}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className={`font-mono block text-sm font-black ${TXN_STATUS[t.status] ?? "text-slate-700"}`}>
                            {t.direction === "in" ? "+" : "−"}{inr(t.amount)}
                          </span>
                          <span className="text-[10px] font-bold uppercase text-slate-400">{t.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-8 text-center text-xs text-slate-400">No AEPS / DMT / UPI transactions.</p>
                )
              ) : detail.ledger.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-white/10">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 font-mono text-[10px] uppercase text-slate-400 dark:bg-white/5">
                      <tr>
                        <th className="px-3 py-2.5">Date</th>
                        <th className="px-3 py-2.5">Description</th>
                        <th className="px-3 py-2.5 text-right">Dr</th>
                        <th className="px-3 py-2.5 text-right">Cr</th>
                        <th className="px-3 py-2.5 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono dark:divide-white/5">
                      {detail.ledger.map((l, i) => (
                        <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                          <td className="px-3 py-2 text-slate-500">{l.entry_date}</td>
                          <td className="px-3 py-2 font-sans font-medium text-slate-700 dark:text-slate-300">{l.description || l.type}</td>
                          <td className="px-3 py-2 text-right text-rose-600">{Number(l.debit) > 0 ? inr(l.debit) : "—"}</td>
                          <td className="px-3 py-2 text-right text-emerald-600">{Number(l.credit) > 0 ? inr(l.credit) : "—"}</td>
                          <td className="px-3 py-2 text-right font-black text-slate-900 dark:text-white">
                            {Number(l.balance_after) > 0 ? `${inr(l.balance_after)} dr` : Number(l.balance_after) < 0 ? `${inr(Math.abs(Number(l.balance_after)))} cr` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="py-8 text-center text-xs text-slate-400">No ledger entries recorded.</p>
              )}
            </div>

            {/* Bottom Actions Dock */}
            <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-slate-200/80 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-800/60 sm:grid-cols-4">
              <button
                onClick={() => setAdvanceModal({ mode: "record" })}
                className="btn-3d-tactile-secondary col-span-2 rounded-xl py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300"
              >
                Record Advance
              </button>
              <button
                onClick={() => setAdvanceModal({ mode: "return" })}
                disabled={Number(viewing.balance) >= 0}
                className="btn-3d-tactile-secondary col-span-2 rounded-xl py-2 text-xs font-bold text-amber-700 disabled:opacity-40 dark:text-amber-300"
              >
                Return Advance
              </button>
              <Link
                href={`/pos?customer=${viewing.id}`}
                className="btn-3d-tactile-primary col-span-2 rounded-xl py-2 text-center text-xs font-bold text-white shadow-sm shadow-indigo-500/20"
              >
                New POS Sale
              </Link>
              <button
                onClick={() => setPhotoCustomer(viewing)}
                className="btn-3d-tactile-secondary rounded-xl py-2 text-xs font-bold text-slate-700 dark:text-slate-300"
              >
                Photo
              </button>
              <button
                onClick={() => setModal({ mode: "edit", customer: viewing })}
                className="btn-3d-tactile-secondary rounded-xl py-2 text-xs font-bold text-slate-700 dark:text-slate-300"
              >
                Edit
              </button>
              <button
                onClick={() => removeCustomer(viewing.id, viewing.is_active)}
                className={`col-span-2 rounded-xl border py-2 text-xs font-bold transition-all active:scale-95 ${
                  viewing.is_active
                    ? "border-rose-200/80 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-400"
                    : "border-emerald-200/80 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400"
                }`}
              >
                {viewing.is_active ? "Deactivate" : "Activate"}
              </button>
              <button
                onClick={() => setViewing(null)}
                className="btn-3d-tactile-secondary col-span-2 rounded-xl py-2 text-xs font-bold text-slate-600 dark:text-slate-400"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {photoCustomer && (
        <CustomerPhotoModal
          open
          name={photoCustomer.name}
          photoUrl={photoCustomer.avatar_url}
          customerId={photoCustomer.id}
          onClose={() => setPhotoCustomer(null)}
          onSaved={onPhotoSaved}
        />
      )}

      {advanceModal && viewing && (
        <AdvanceModal
          open
          mode={advanceModal.mode}
          customer={viewing}
          onClose={() => setAdvanceModal(null)}
          onDone={onAdvanceDone}
        />
      )}

      {waModal && (
        <WhatsAppSendModal
          open
          onClose={() => setWaModal(null)}
          phone={waModal.phone}
          recipientName={waModal.name}
          initialMessage={waModal.msg}
          messageType="due_reminder"
          refId={waModal.refId}
          refNumber={waModal.invNum}
        />
      )}
    </div>
  );
}

