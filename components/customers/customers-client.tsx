"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/lib/supabase/realtime";
import { logAudit } from "@/lib/audit";
import CustomerFormModal from "./customer-form-modal";

export type Customer = {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  opening_balance: number | string;
  balance: number | string;
  is_active: boolean;
  created_at: string;
};

type ModalState =
  | { mode: "create" }
  | { mode: "edit"; customer: Customer }
  | null;

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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Customer | null>(null);
  const [detail, setDetail] = useState<{
    invoices: any[];
    ledger: any[];
    totalPurchased: number;
    loading: boolean;
  }>({ invoices: [], ledger: [], totalPurchased: 0, loading: false });

  const supabase = createClient();
  useRealtime(["customers", "invoices", "customer_ledger", "payments"]);

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
    setDetail((d) => ({ ...d, loading: true }));
    const [invRes, ledgerRes] = await Promise.all([
      supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, total, paid, due, status")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("customer_ledger")
        .select("entry_date, type, description, debit, credit, balance_after")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    const invoices = (invRes.data ?? []) as any[];
    setDetail({
      invoices,
      ledger: (ledgerRes.data ?? []) as any[],
      totalPurchased: invoices.reduce((s, i) => s + Number(i.total), 0),
      loading: false,
    });
  }

  function nextCode() {
    let max = 0;
    for (const c of customers) {
      const n = parseInt(String(c.code ?? "").replace(/\D/g, ""), 10);
      if (!Number.isNaN(n)) max = Math.max(max, n);
    }
    return "CUST-" + String(max + 1).padStart(4, "0");
  }

  async function saveCustomer(
    input: {
      name: string;
      phone: string;
      email: string;
      address: string;
      opening_balance: number;
    },
    customer?: Customer
  ) {
    if (customer) {
      const { error } = await supabase
        .from("customers")
        .update(input)
        .eq("id", customer.id);
      if (error) {
        alert(error.message);
        return;
      }
      setCustomers((prev) =>
        prev.map((c) => (c.id === customer.id ? { ...c, ...input } : c))
      );
      setViewing((v) => (v && v.id === customer.id ? { ...v, ...input } : v));
    } else {
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
        alert(error.message);
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
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
                  <path d={c.icon} />
                </svg>
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
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
          >
            <option value="newest">Newest first</option>
            <option value="name">Name A–Z</option>
            <option value="balance">Highest balance</option>
          </select>
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
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradient(c.name)} text-sm font-bold text-white`}>
                        {c.name.slice(0, 1).toUpperCase()}
                      </div>
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

      {viewing && (
        <div className="fixed inset-0 z-50 bg-[#020617]/50 backdrop-blur-sm" onClick={() => setViewing(null)}>
          <div
            className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-100 p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${gradient(viewing.name)} text-lg font-bold text-white`}>
                    {viewing.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-lg font-bold text-slate-900">{viewing.name}</p>
                    <p className="font-mono text-xs text-slate-400">
                      {viewing.code ?? ""} · {viewing.is_active ? "Active" : "Inactive"}
                    </p>
                  </div>
                </div>
                <button onClick={() => setViewing(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                  ✕
                </button>
              </div>
              <div className="mt-3 space-y-1 text-sm text-slate-600">
                {viewing.phone && <p>📞 {viewing.phone}</p>}
                {viewing.email && <p>✉️ {viewing.email}</p>}
                {viewing.address && <p>📍 {viewing.address}</p>}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 border-b border-slate-100 p-5">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-400">Balance</p>
                <p className={`mt-0.5 text-sm font-bold ${Number(viewing.balance) > 0 ? "text-rose-600" : Number(viewing.balance) < 0 ? "text-emerald-600" : "text-slate-900"}`}>
                  {Number(viewing.balance) > 0 ? inr(viewing.balance) : Number(viewing.balance) < 0 ? inr(Math.abs(Number(viewing.balance))) + " adv" : "Settled"}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-400">Purchases</p>
                <p className="mt-0.5 text-sm font-bold text-slate-900">{detail.loading ? "…" : inr(detail.totalPurchased)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-400">Invoices</p>
                <p className="mt-0.5 text-sm font-bold text-slate-900">{detail.loading ? "…" : detail.invoices.length}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="mb-1.5 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Recent Invoices</h3>
                <Link href="/invoices" className="text-xs font-medium text-blue-600 hover:text-blue-700">All →</Link>
              </div>
              {detail.loading ? (
                <p className="text-sm text-slate-400">Loading…</p>
              ) : detail.invoices.length > 0 ? (
                <div className="space-y-2">
                  {detail.invoices.map((inv) => (
                    <Link
                      key={inv.id}
                      href={`/receipt/${inv.id}`}
                      target="_blank"
                      className="block rounded-xl border border-slate-100 p-3 transition hover:border-blue-200 hover:bg-blue-50/50"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-medium text-blue-700">{inv.invoice_number}</span>
                        <span className="text-xs text-slate-400">{inv.invoice_date}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${inv.status === "paid" ? "bg-emerald-100 text-emerald-700" : inv.status === "partial" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>
                          {inv.status}
                        </span>
                        <span className="flex items-center gap-2 text-xs text-slate-400">
                          <span className="text-sm font-semibold text-slate-900">{inr(inv.total)}</span>
                          <a href={`/receipt/${inv.id}/a4`} target="_blank" onClick={(e) => e.stopPropagation()} className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50">
                            A4 / PDF
                          </a>
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No invoices yet.</p>
              )}

              <h3 className="mb-1.5 mt-5 text-sm font-semibold text-slate-900">Ledger</h3>
              {detail.loading ? (
                <p className="text-sm text-slate-400">Loading…</p>
              ) : detail.ledger.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-slate-100">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50">
                      <tr className="text-slate-500">
                        <th className="px-3 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 text-right font-medium">Dr</th>
                        <th className="px-3 py-2 text-right font-medium">Cr</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {detail.ledger.map((l, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-slate-500">{l.entry_date}</td>
                          <td className="px-3 py-2 capitalize text-slate-700">{l.type}</td>
                          <td className="px-3 py-2 text-right text-rose-600">{Number(l.debit) > 0 ? inr(l.debit) : "—"}</td>
                          <td className="px-3 py-2 text-right text-emerald-600">{Number(l.credit) > 0 ? inr(l.credit) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-400">No ledger entries.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-5">
              <Link
                href={`/pos?customer=${viewing.id}`}
                className="rounded-xl bg-blue-600 px-3 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                New Sale
              </Link>
              <button
                onClick={() => setModal({ mode: "edit", customer: viewing })}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Edit
              </button>
              <button
                onClick={() => removeCustomer(viewing.id, viewing.is_active)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                  viewing.is_active
                    ? "border-rose-200 text-rose-600 hover:bg-rose-50"
                    : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                }`}
              >
                {viewing.is_active ? "Deactivate" : "Activate"}
              </button>
              <button
                onClick={() => setViewing(null)}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
