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
      const { error } = await supabase
        .from("customers")
        .update(input)
        .eq("id", customer.id);
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
      const { data, error } = await supabase
        .from("customers")
        .insert(payload)
        .select()
        .single();
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
    { label: "Total Customers", value: String(stats.total), icon: "M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM23 21v-2a4 4 0 0 0-3-3.87", grad: "from-blue-500 to-indigo-600" },
    { label: "Active", value: String(stats.active), icon: "M20 6 9 17l-5-5", grad: "from-emerald-500 to-teal-600" },
    { label: "Receivables", value: inr(stats.receivables), icon: "M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2M3 10h18M16 15h2", grad: "from-rose-500 to-pink-600" },
    { label: "Advances", value: inr(stats.advances), icon: "M3 17l6-6 4 4 8-8M15 7h6v6", grad: "from-violet-500 to-purple-600" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
          <p className="text-sm text-slate-500">Manage your customer directory and balances.</p>
        </div>
        <button
          onClick={() => setModal({ mode: "create" })}
          className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
        >
          + Add Customer
        </button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {KPI_CARDS.map((c) => (
          <div key={c.label} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${c.grad}`} />
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">{c.label}</p>
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${c.grad} text-white`}>
                <Icon d={c.icon} className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-1.5 text-xl font-bold text-slate-900">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-[220px] flex-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone, code, email..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-1 text-xs">
            {(["all", "active", "inactive"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`rounded-lg px-3 py-1.5 font-medium capitalize transition ${
                  status === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex rounded-xl bg-slate-100 p-1 text-xs">
            {(["all", "owing", "advance", "settled"] as const).map((b) => (
              <button
                key={b}
                onClick={() => setBalFilter(b)}
                className={`rounded-lg px-3 py-1.5 font-medium capitalize transition ${
                  balFilter === b ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
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
          <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
            {filtered.length} of {customers.length}
          </span>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-5 py-3 font-medium">Customer</th>
              <th className="px-5 py-3 font-medium">Code</th>
              <th className="hidden px-5 py-3 font-medium lg:table-cell">Email</th>
              <th className="px-5 py-3 text-right font-medium">Balance</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const b = Number(c.balance);
              return (
                <tr
                  key={c.id}
                  onClick={() => loadDetail(c)}
                  className={`cursor-pointer border-b border-slate-100 transition last:border-0 hover:bg-slate-50 ${!c.is_active ? "opacity-60" : ""}`}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      {c.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c.avatar_url}
                          alt=""
                          className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-slate-200"
                        />
                      ) : (
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradient(c.name)} text-sm font-bold text-white`}>
                          {c.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{c.name}</p>
                        <p className="text-xs text-slate-400">{c.phone ?? "No phone"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">{c.code ?? "-"}</td>
                  <td className="hidden px-5 py-3 text-slate-600 lg:table-cell">{c.email ?? "-"}</td>
                  <td className="px-5 py-3 text-right">
                    {b > 0 ? (
                      <span className="font-semibold text-rose-600">{inr(b)} due</span>
                    ) : b < 0 ? (
                      <span className="font-semibold text-emerald-600">{inr(Math.abs(b))} advance</span>
                    ) : (
                      <span className="text-slate-400">Settled</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                      {c.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/customers/${c.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-blue-600 transition hover:bg-blue-50"
                      >
                        Profile
                      </Link>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setModal({ mode: "edit", customer: c });
                        }}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
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
                          className="rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
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
                <td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-500">
                  No customers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <CustomerFormModal
          state={modal}
          onClose={() => setModal(null)}
          onSave={saveCustomer}
        />
      )}

      {dupWarning && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#020617]/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">
              Customer with this mobile number already exists.
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              A customer record for <span className="font-semibold text-slate-700">{dupWarning.dup.phone}</span> is
              already in your directory:
            </p>
            <div className="mt-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
              <p className="text-sm font-medium text-slate-900">{dupWarning.dup.name}</p>
              <p className="text-xs text-slate-400">
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
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                View Customer
              </button>
              <button
                onClick={() => {
                  setModal({ mode: "edit", customer: dupWarning.dup });
                  setDupWarning(null);
                }}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                Use Existing Customer
              </button>
              <button
                onClick={() => setDupWarning(null)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50"
              >
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 z-50 bg-[#020617]/50 backdrop-blur-sm" onClick={() => setViewing(null)}>
          <div
            className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative shrink-0 border-b border-slate-100 bg-gradient-to-r from-[#0f172a] via-[#1e293b] to-[#020617] px-6 py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-4">
                  <div className="relative shrink-0">
                    {viewing.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={viewing.avatar_url}
                        alt=""
                        className="h-16 w-16 rounded-2xl object-cover ring-2 ring-white/20"
                      />
                    ) : (
                      <div className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${gradient(viewing.name)} text-xl font-bold text-white ring-2 ring-white/20`}>
                        {viewing.name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <button
                      onClick={() => setPhotoCustomer(viewing)}
                      className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-blue-500 text-white ring-2 ring-[#0f172a] transition hover:bg-blue-600"
                      title="Change photo"
                    >
                      <Icon d={ICONS.camera} className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold text-white">{viewing.name}</p>
                    <p className="font-mono text-xs text-[#94a3b8]">
                      {viewing.code ?? ""} · {viewing.is_active ? "Active" : "Inactive"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[#cbd5e1]">
                      {viewing.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Icon d={ICONS.phone} className="h-3 w-3" /> {viewing.phone}
                        </span>
                      )}
                      {viewing.email && (
                        <span className="inline-flex items-center gap-1">
                          <Icon d={ICONS.mail} className="h-3 w-3" /> {viewing.email}
                        </span>
                      )}
                      {viewing.address && (
                        <span className="inline-flex items-center gap-1">
                          <Icon d={ICONS.pin} className="h-3 w-3" /> {viewing.address}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button onClick={() => setViewing(null)} className="rounded-lg bg-white/10 p-1.5 text-[#cbd5e1] transition hover:bg-white/20 hover:text-white">
                  <Icon d={ICONS.close} className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid shrink-0 grid-cols-2 gap-3 border-b border-slate-100 px-6 py-4 sm:grid-cols-4">
              <Stat label="Lifetime Purchases" value={detail.loading ? "…" : inr(detailStats.purchased)} tone="slate" />
              <Stat label="Total Paid" value={detail.loading ? "…" : inr(detailStats.paid)} tone="emerald" />
              <Stat label="Balance Due" value={detail.loading ? "…" : inr(detailStats.due)} tone={detailStats.due > 0 ? "rose" : "slate"} />
              <Stat label="Advance" value={detail.loading ? "…" : inr(detailStats.advance)} tone={detailStats.advance > 0 ? "blue" : "slate"} />
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-3">
              <div className="flex rounded-xl bg-slate-100 p-1 text-sm">
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
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium capitalize transition ${
                      detailTab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                    }`}
                  >
                    <Icon d={t.icon} className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                ))}
              </div>
              {detailTab === "business" && !detail.loading && (
                <span className="text-xs text-slate-500">
                  {detailStats.businessCount} txns · {inr(detailStats.businessTotal)} · income {inr(detailStats.businessIncome)}
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6">
              {detail.loading ? (
                <p className="py-8 text-center text-sm text-slate-400">Loading…</p>
              ) : detailTab === "invoices" ? (
                detail.invoices.length > 0 ? (
                  <div className="space-y-2">
                    {detail.invoices.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 transition hover:border-blue-200 hover:bg-blue-50/50"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-medium text-blue-700">{inv.invoice_number}</span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{inv.invoice_date}</span>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_PILL[inv.status] ?? "bg-slate-100 text-slate-600"}`}>
                              {inv.status}
                            </span>
                            <span className="text-xs text-slate-400">
                              paid {inr(inv.paid)} · due {inr(inv.due)}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">{inr(inv.total)}</span>
                          <Link
                            href={`/receipt/${inv.id}`}
                            target="_blank"
                            className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50"
                          >
                            Print
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-8 text-center text-sm text-slate-400">No invoices yet.</p>
                )
              ) : detailTab === "business" ? (
                detail.transactions.length > 0 ? (
                  <div className="space-y-2">
                    {detail.transactions.map((t) => (
                      <div
                        key={t.id ?? t.transaction_number}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 transition hover:border-violet-200 hover:bg-violet-50/40"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${TXN_PILL[t.service_type] ?? "bg-slate-100 text-slate-600"}`}>
                              {t.service_type}
                            </span>
                            <span className="font-mono text-xs font-medium text-slate-700">{t.transaction_number}</span>
                          </div>
                          <div className="mt-1 text-xs text-slate-400">
                            {t.transaction_date} · {t.direction === "in" ? "received in" : "paid out"}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className={`block text-sm font-semibold ${TXN_STATUS[t.status] ?? "text-slate-700"}`}>
                            {t.direction === "in" ? "+" : "−"}{inr(t.amount)}
                          </span>
                          <span className="text-[11px] capitalize text-slate-400">{t.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-8 text-center text-sm text-slate-400">No AEPS / DMT / UPI transactions.</p>
                )
              ) : detail.ledger.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50">
                      <tr className="text-slate-500">
                        <th className="whitespace-nowrap px-3 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 font-medium">Description</th>
                        <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Dr</th>
                        <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Cr</th>
                        <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {detail.ledger.map((l, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-slate-500">{l.entry_date}</td>
                          <td className="px-3 py-2 text-slate-700">{l.description || l.type}</td>
                          <td className="px-3 py-2 text-right text-rose-600">{Number(l.debit) > 0 ? inr(l.debit) : "—"}</td>
                          <td className="px-3 py-2 text-right text-emerald-600">{Number(l.credit) > 0 ? inr(l.credit) : "—"}</td>
                          <td className="px-3 py-2 text-right font-medium text-slate-900">
                            {Number(l.balance_after) > 0 ? `${inr(l.balance_after)} dr` : Number(l.balance_after) < 0 ? `${inr(Math.abs(Number(l.balance_after)))} cr` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-slate-400">No ledger entries.</p>
              )}
            </div>

            <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-slate-100 p-5 sm:grid-cols-4">
              <button
                onClick={() => setAdvanceModal({ mode: "record" })}
                className="col-span-2 rounded-xl border border-emerald-200 px-3 py-2.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
              >
                Record advance
              </button>
              <button
                onClick={() => setAdvanceModal({ mode: "return" })}
                disabled={Number(viewing.balance) >= 0}
                className="col-span-2 rounded-xl border border-amber-200 px-3 py-2.5 text-sm font-medium text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Return advance
              </button>
              <Link
                href={`/pos?customer=${viewing.id}`}
                className="col-span-2 rounded-xl bg-blue-600 px-3 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                New Sale
              </Link>
              <button
                onClick={() => setPhotoCustomer(viewing)}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Photo
              </button>
              <button
                onClick={() => setModal({ mode: "edit", customer: viewing })}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Edit
              </button>
              <button
                onClick={() => removeCustomer(viewing.id, viewing.is_active)}
                className={`col-span-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                  viewing.is_active
                    ? "border-rose-200 text-rose-600 hover:bg-rose-50"
                    : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                }`}
              >
                {viewing.is_active ? "Deactivate" : "Activate"}
              </button>
              <button
                onClick={() => setViewing(null)}
                className="col-span-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
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
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "slate" | "emerald" | "rose" | "blue";
}) {
  const color = {
    slate: "text-slate-900",
    emerald: "text-emerald-600",
    rose: "text-rose-600",
    blue: "text-blue-600",
  }[tone];
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="truncate text-xs text-slate-400">{label}</p>
      <p className={`mt-0.5 truncate text-sm font-bold ${color}`}>{value}</p>
    </div>
  );
}
