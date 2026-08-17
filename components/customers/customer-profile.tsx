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
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
};

type Tab = "overview" | "sales" | "invoices" | "payments" | "ledger" | "returns";

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

const STATUS_PILL: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-700",
  unpaid: "bg-rose-100 text-rose-700",
  cancelled: "bg-slate-200 text-slate-600",
};

const TXN_STATUS: Record<string, string> = {
  success: "text-emerald-600",
  pending: "text-amber-600",
  failed: "text-rose-600",
  reversed: "text-slate-400",
  deleted: "text-slate-400",
};

export default function CustomerProfile({ customer }: { customer: Customer }) {
  const router = useRouter();
  const supabase = createClient();
  useRealtime(["customers", "invoices", "customer_ledger", "payments", "transactions", "returns"]);

  const [cust, setCust] = useState<Customer>(customer);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState(false);
  const [photoModal, setPhotoModal] = useState(false);
  const [advanceModal, setAdvanceModal] = useState<{ mode: "record" | "return" } | null>(null);
  const [data, setData] = useState<{
    invoices: any[];
    ledger: any[];
    payments: any[];
    transactions: any[];
    returns: any[];
  }>({ invoices: [], ledger: [], payments: [], transactions: [], returns: [] });

  async function loadData(force = false) {
    if (!force) setLoading(true);
    const [invRes, ledgerRes, payRes, txnRes, retRes] = await Promise.all([
      supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, total, paid, due, status")
        .eq("customer_id", cust.id)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("customer_ledger")
        .select("entry_date, type, description, debit, credit, balance_after")
        .eq("customer_id", cust.id)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("payments")
        .select("id, invoice_id, method, amount, received_at, invoices(invoice_number)")
        .eq("invoices.customer_id", cust.id)
        .order("received_at", { ascending: false })
        .limit(200),
      supabase
        .from("transactions")
        .select("transaction_number, service_type, transaction_date, amount, service_fee, portal_commission, direction, status")
        .eq("customer_id", cust.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("returns")
        .select("id, return_number, return_date, reason, subtotal, refund, refund_method, status, invoices(invoice_number)")
        .eq("invoices.customer_id", cust.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    setData({
      invoices: (invRes.data ?? []) as any[],
      ledger: (ledgerRes.data ?? []) as any[],
      payments: (payRes.data ?? []) as any[],
      transactions: (txnRes.data ?? []) as any[],
      returns: (retRes.data ?? []) as any[],
    });
    setLoading(false);
  }

  useEffect(() => {
    loadData(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const open = data.invoices.filter((i) => i.status !== "cancelled");
    let sales = 0,
      paid = 0,
      due = 0;
    for (const i of open) {
      sales += Number(i.total);
      paid += Number(i.paid);
      due += Number(i.due);
    }
    const successTxns = data.transactions.filter((t) => t.status === "success");
    const businessTotal = successTxns.reduce((s, t) => s + Number(t.amount), 0);
    return {
      sales,
      paid,
      due,
      transactions: open.length + successTxns.length,
      businessTotal,
      businessCount: successTxns.length,
    };
  }, [data]);

  async function saveCustomer(
    input: {
      name: string;
      phone: string;
      email: string;
      address: string;
      opening_balance: number;
      customer_type: string;
    },
    _customer?: Customer
  ) {
    const { error } = await supabase
      .from("customers")
      .update({
        name: input.name,
        phone: input.phone,
        email: input.email,
        address: input.address,
        customer_type: input.customer_type,
      })
      .eq("id", cust.id);
    if (error) {
      alert(error.message);
      return;
    }
    setCust((c) => ({ ...c, ...input }));
    setEditModal(false);
    logAudit({
      action: "update",
      entity: "customer",
      entity_id: cust.id,
      description: `Customer updated: ${input.name}`,
      details: { name: input.name },
    });
  }

  async function toggleActive() {
    const next = !cust.is_active;
    const { error } = await supabase.from("customers").update({ is_active: next }).eq("id", cust.id);
    if (error) {
      alert(error.message);
      return;
    }
    setCust((c) => ({ ...c, is_active: next }));
    logAudit({
      action: next ? "activate" : "deactivate",
      entity: "customer",
      entity_id: cust.id,
      description: `Customer ${next ? "activated" : "deactivated"}: ${cust.name}`,
    });
  }

  const onPhotoSaved = (url: string | null) => {
    setCust((c) => ({ ...c, avatar_url: url }));
  };

  const onAdvanceDone = (balance: number) => {
    setCust((c) => ({ ...c, balance }));
    loadData(true);
    setAdvanceModal(null);
    logAudit({
      action: advanceModal?.mode === "record" ? "advance_received" : "advance_returned",
      entity: "customer",
      entity_id: cust.id,
      description: `${advanceModal?.mode === "record" ? "Advance received from" : "Advance returned to"} ${cust.name}`,
    });
  };

  const bal = Number(cust.balance);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="mb-4">
        <Link href="/customers" className="text-sm text-slate-500 transition hover:text-blue-600">
          ← Back to customers
        </Link>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="h-24 bg-gradient-to-r from-[#0f172a] via-[#1e293b] to-[#020617]" />
        <div className="px-6 pb-5">
          <div className="-mt-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <div className="relative shrink-0">
                {cust.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cust.avatar_url}
                    alt=""
                    className="h-24 w-24 rounded-2xl object-cover ring-4 ring-white"
                  />
                ) : (
                  <div
                    className={`flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br ${gradient(
                      cust.name
                    )} text-3xl font-bold text-white ring-4 ring-white`}
                  >
                    {cust.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <button
                  onClick={() => setPhotoModal(true)}
                  className="absolute -bottom-1.5 -right-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white ring-2 ring-white transition hover:bg-blue-600"
                  title="Change photo"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d="M3 9a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z M12 11v5M9.5 13.5h5" />
                  </svg>
                </button>
              </div>
              <div className="min-w-0 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold text-slate-900">{cust.name}</h1>
                  {cust.customer_type && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold capitalize text-blue-700 ring-1 ring-blue-200">
                      {cust.customer_type}
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      cust.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {cust.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="mt-0.5 font-mono text-xs text-slate-400">{cust.code ?? ""}</p>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                  {cust.phone && <span>📞 {cust.phone}</span>}
                  {cust.email && <span>✉️ {cust.email}</span>}
                  {cust.address && <span>📍 {cust.address}</span>}
                  <span>Since {new Date(cust.created_at).toLocaleDateString("en-IN")}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pb-1">
              <button
                onClick={() => setEditModal(true)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Edit Customer
              </button>
              <Link
                href={`/pos?customer=${cust.id}`}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                New Sale
              </Link>
              <button
                onClick={() => setTab("ledger")}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                View Ledger
              </button>
              <button
                onClick={() => setTab("invoices")}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                View Invoices
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard label="Total Sales" value={loading ? "…" : inr(stats.sales)} tone="text-slate-900" grad="from-blue-500 to-indigo-600" icon="M6 6h15l-1.5 8h-13L4 3H2M9 20a1 1 0 1 0 0 .01M20 20a1 1 0 1 0 0 .01" />
        <SummaryCard label="Total Paid" value={loading ? "…" : inr(stats.paid)} tone="text-emerald-600" grad="from-emerald-500 to-teal-600" icon="M20 6 9 17l-5-5" />
        <SummaryCard label="Total Due" value={loading ? "…" : inr(stats.due)} tone={stats.due > 0 ? "text-rose-600" : "text-slate-900"} grad="from-rose-500 to-pink-600" icon="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2M3 10h18M16 15h2" />
        <SummaryCard label="Total Transactions" value={loading ? "…" : String(stats.transactions)} tone="text-violet-600" grad="from-violet-500 to-purple-600" icon="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      </div>

      <div className="mt-6 flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-100/80 p-1">
        {(
          [
            { key: "overview", label: "Overview" },
            { key: "sales", label: "Sales" },
            { key: "invoices", label: "Invoices" },
            { key: "payments", label: "Payments" },
            { key: "ledger", label: "Ledger" },
            { key: "returns", label: "Returns" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
              tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {loading ? (
          <p className="py-10 text-center text-sm text-slate-400">Loading…</p>
        ) : tab === "overview" ? (
          <OverviewTab cust={cust} bal={bal} stats={stats} data={data} inr={inr} />
        ) : tab === "sales" ? (
          <SalesTab invoices={data.invoices} inr={inr} />
        ) : tab === "invoices" ? (
          <InvoicesTab invoices={data.invoices} inr={inr} />
        ) : tab === "payments" ? (
          <PaymentsTab payments={data.payments} inr={inr} />
        ) : tab === "ledger" ? (
          <LedgerTab ledger={data.ledger} inr={inr} />
        ) : (
          <ReturnsTab returns={data.returns} inr={inr} />
        )}
      </div>
      {editModal && (
        <CustomerFormModal
          state={{ mode: "edit", customer: cust }}
          onClose={() => setEditModal(false)}
          onSave={saveCustomer}
        />
      )}

      {photoModal && (
        <CustomerPhotoModal
          open
          name={cust.name}
          photoUrl={cust.avatar_url}
          customerId={cust.id}
          onClose={() => setPhotoModal(false)}
          onSaved={onPhotoSaved}
        />
      )}

      {advanceModal && (
        <AdvanceModal
          open
          mode={advanceModal.mode}
          customer={cust}
          onClose={() => setAdvanceModal(null)}
          onDone={onAdvanceDone}
        />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  grad,
  icon,
}: {
  label: string;
  value: string;
  tone: string;
  grad: string;
  icon: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${grad}`} />
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${grad} text-white`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d={icon} />
          </svg>
        </div>
      </div>
      <p className={`mt-1.5 text-xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function OverviewTab({
  cust,
  bal,
  stats,
  data,
  inr,
}: {
  cust: Customer;
  bal: number;
  stats: { sales: number; paid: number; due: number; transactions: number; businessTotal: number; businessCount: number };
  data: { invoices: any[]; ledger: any[]; transactions: any[]; returns: any[] };
  inr: (n: number | string) => string;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">Balance</h3>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Current balance</span>
              <span className={bal > 0 ? "font-semibold text-rose-600" : bal < 0 ? "font-semibold text-emerald-600" : "font-semibold text-slate-900"}>
                {bal > 0 ? inr(bal) + " due" : bal < 0 ? inr(Math.abs(bal)) + " advance" : "Settled"}
              </span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Opening balance</span>
              <span>{inr(cust.opening_balance)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Lifetime purchases</span>
              <span>{inr(stats.sales)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Business volume (AEPS/DMT/UPI)</span>
              <span>{inr(stats.businessTotal)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">Activity</h3>
          <div className="mt-2 space-y-1.5 text-sm text-slate-600">
            <div className="flex justify-between">
              <span>Invoices</span>
              <span className="font-medium text-slate-900">{data.invoices.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Business transactions</span>
              <span className="font-medium text-slate-900">{stats.businessCount}</span>
            </div>
            <div className="flex justify-between">
              <span>Returns</span>
              <span className="font-medium text-slate-900">{data.returns.length}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="lg:col-span-2">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Recent invoices</h3>
        {data.invoices.length > 0 ? (
          <div className="space-y-2">
            {data.invoices.slice(0, 8).map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                <div className="min-w-0">
                  <span className="font-mono text-xs font-medium text-blue-700">{inv.invoice_number}</span>
                  <span className="ml-2 text-xs text-slate-400">{inv.invoice_date}</span>
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_PILL[inv.status] ?? "bg-slate-100 text-slate-600"}`}>
                    {inv.status}
                  </span>
                </div>
                <span className="shrink-0 text-sm font-semibold text-slate-900">{inr(inv.total)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-slate-50 py-8 text-center text-sm text-slate-400">No invoices yet.</p>
        )}
      </div>
    </div>
  );
}

function SalesTab({ invoices, inr }: { invoices: any[]; inr: (n: number | string) => string }) {
  const open = invoices.filter((i) => i.status !== "cancelled");
  if (open.length === 0)
    return <p className="py-10 text-center text-sm text-slate-400">No sales yet.</p>;
  return (
    <div className="space-y-2">
      {open.map((inv) => (
        <div key={inv.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 transition hover:border-blue-200 hover:bg-blue-50/50">
          <div className="min-w-0">
            <span className="font-mono text-xs font-medium text-blue-700">{inv.invoice_number}</span>
            <span className="ml-2 text-xs text-slate-400">{inv.invoice_date}</span>
            <span className="ml-2 text-xs text-slate-400">
              paid {inr(inv.paid)} · due {inr(inv.due)}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{inr(inv.total)}</span>
            <Link href={`/receipt/${inv.id}`} target="_blank" className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50">
              Print
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

function InvoicesTab({ invoices, inr }: { invoices: any[]; inr: (n: number | string) => string }) {
  if (invoices.length === 0)
    return <p className="py-10 text-center text-sm text-slate-400">No invoices yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="px-3 py-2 font-medium">Invoice</th>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 text-right font-medium">Total</th>
            <th className="px-3 py-2 text-right font-medium">Paid</th>
            <th className="px-3 py-2 text-right font-medium">Due</th>
            <th className="px-3 py-2 text-right font-medium">Receipt</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {invoices.map((inv) => (
            <tr key={inv.id} className="transition hover:bg-slate-50">
              <td className="px-3 py-2.5 font-mono text-xs font-medium text-blue-700">{inv.invoice_number}</td>
              <td className="px-3 py-2.5 text-slate-500">{inv.invoice_date}</td>
              <td className="px-3 py-2.5">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_PILL[inv.status] ?? "bg-slate-100 text-slate-600"}`}>
                  {inv.status}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{inr(inv.total)}</td>
              <td className="px-3 py-2.5 text-right text-emerald-600">{inr(inv.paid)}</td>
              <td className="px-3 py-2.5 text-right text-rose-600">{inr(inv.due)}</td>
              <td className="px-3 py-2.5 text-right">
                <Link href={`/receipt/${inv.id}`} target="_blank" className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50">
                  Print
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function PaymentsTab({ payments, inr }: { payments: any[]; inr: (n: number | string) => string }) {
  if (payments.length === 0)
    return <p className="py-10 text-center text-sm text-slate-400">No payments yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Method</th>
            <th className="px-3 py-2 font-medium">Invoice</th>
            <th className="px-3 py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {payments.map((p) => (
            <tr key={p.id} className="transition hover:bg-slate-50">
              <td className="px-3 py-2.5 text-slate-500">
                {p.received_at ? new Date(p.received_at).toLocaleDateString("en-IN") : "-"}
              </td>
              <td className="px-3 py-2.5">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase text-slate-600">
                  {p.method ?? "-"}
                </span>
              </td>
              <td className="px-3 py-2.5 font-mono text-xs text-blue-700">{p.invoices?.invoice_number ?? "-"}</td>
              <td className="px-3 py-2.5 text-right font-semibold text-emerald-600">{inr(p.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LedgerTab({ ledger, inr }: { ledger: any[]; inr: (n: number | string) => string }) {
  if (ledger.length === 0)
    return <p className="py-10 text-center text-sm text-slate-400">No ledger entries.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50">
          <tr className="text-slate-500">
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Description</th>
            <th className="px-3 py-2 text-right font-medium">Dr</th>
            <th className="px-3 py-2 text-right font-medium">Cr</th>
            <th className="px-3 py-2 text-right font-medium">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {ledger.map((l, i) => (
            <tr key={i}>
              <td className="px-3 py-2 text-slate-500">{l.entry_date}</td>
              <td className="px-3 py-2 text-slate-700">{l.description || l.type}</td>
              <td className="px-3 py-2 text-right text-rose-600">{Number(l.debit) > 0 ? inr(l.debit) : "—"}</td>
              <td className="px-3 py-2 text-right text-emerald-600">{Number(l.credit) > 0 ? inr(l.credit) : "—"}</td>
              <td className="px-3 py-2 text-right font-medium text-slate-900">
                {Number(l.balance_after) > 0
                  ? `${inr(l.balance_after)} dr`
                  : Number(l.balance_after) < 0
                    ? `${inr(Math.abs(Number(l.balance_after)))} cr`
                    : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReturnsTab({ returns, inr }: { returns: any[]; inr: (n: number | string) => string }) {
  if (returns.length === 0)
    return <p className="py-10 text-center text-sm text-slate-400">No returns.</p>;
  return (
    <div className="space-y-2">
      {returns.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-medium text-rose-600">{r.return_number}</span>
              <span className="text-xs text-slate-400">{r.return_date}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_PILL[r.status] ?? "bg-slate-100 text-slate-600"}`}>
                {r.status}
              </span>
            </div>
            {r.reason && <p className="mt-0.5 truncate text-xs text-slate-400">{r.reason}</p>}
            {r.invoices?.invoice_number && (
              <p className="mt-0.5 text-[11px] text-slate-400">on {r.invoices.invoice_number}</p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <span className="block text-sm font-semibold text-rose-600">-{inr(r.refund)}</span>
            <span className="text-[11px] capitalize text-slate-400">{r.refund_method ?? ""}</span>
          </div>
        </div>
      ))}
    </div>
  );
}