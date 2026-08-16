"use client";

import { useMemo, useState } from "react";
import { inr } from "@/lib/format";
import InvoiceViewModal from "./invoice-view-modal";
import ReturnModal from "./return-modal";

export type InvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total: number | string;
  paid: number | string;
  due: number | string;
  returned: number | string;
  refunded: number | string;
  status: string;
  created_at?: string;
  customers: { name: string } | null;
};

const STATUSES = ["all", "paid", "partial", "unpaid", "cancelled"] as const;

export function statusBadge(status: string) {
  const cls: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-700 ring-emerald-200",
    partial: "bg-amber-100 text-amber-700 ring-amber-200",
    unpaid: "bg-rose-100 text-rose-700 ring-rose-200",
    cancelled: "bg-slate-100 text-slate-500 ring-slate-200",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ${
        cls[status] ?? "bg-slate-100 text-slate-500 ring-slate-200"
      }`}
    >
      {status}
    </span>
  );
}

const STATUS_TAB: Record<string, string> = {
  all: "text-[#64748b]",
  paid: "text-emerald-700",
  partial: "text-amber-700",
  unpaid: "text-rose-700",
  cancelled: "text-slate-500",
};

export default function InvoicesClient({
  initialInvoices,
}: {
  initialInvoices: InvoiceRow[];
}) {
  const [invoices, setInvoices] = useState<InvoiceRow[]>(initialInvoices);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [viewId, setViewId] = useState<string | null>(null);
  const [returnId, setReturnId] = useState<string | null>(null);

  const stats = useMemo(() => {
    let total = 0,
      paid = 0,
      due = 0,
      returned = 0,
      refunded = 0,
      count = 0;
    for (const i of invoices) {
      if (i.status === "cancelled") continue;
      total += Number(i.total) || 0;
      paid += Number(i.paid) || 0;
      due += Number(i.due) || 0;
      returned += Number(i.returned) || 0;
      refunded += Number(i.refunded) || 0;
      count++;
    }
    return { total, paid, due, returned, refunded, count };
  }, [invoices]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (status !== "all" && inv.status !== status) return false;
      if (!needle) return true;
      return (
        inv.invoice_number.toLowerCase().includes(needle) ||
        (inv.customers?.name ?? "").toLowerCase().includes(needle)
      );
    });
  }, [invoices, q, status]);

  function handleChanged(row: InvoiceRow) {
    setInvoices((prev) =>
      prev.map((x) => (x.id === row.id ? { ...x, ...row } : x))
    );
  }

  function handleReturned(row: InvoiceRow) {
    setInvoices((prev) =>
      prev.map((x) => (x.id === row.id ? { ...x, ...row } : x))
    );
  }

  const KPI_CARDS = [
    { label: "Total Sales", value: inr(stats.total), icon: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6", grad: "from-blue-500 to-indigo-600" },
    { label: "Collected", value: inr(stats.paid), icon: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6", grad: "from-emerald-500 to-teal-600" },
    { label: "Outstanding", value: inr(stats.due), icon: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z", grad: "from-amber-500 to-orange-600" },
    { label: "Returned", value: inr(stats.returned), icon: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5", grad: "from-rose-500 to-pink-600" },
    { label: "Refunded", value: inr(stats.refunded), icon: "M3 7v6h6M3.5 13a9 9 0 1 0 0-6", grad: "from-violet-500 to-purple-600" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
          <p className="text-sm text-slate-500">
            Track sales, payments and returns.
          </p>
        </div>
        <a
          href="/pos"
          className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
        >
          + New Sale
        </a>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        {KPI_CARDS.map((c) => (
          <div
            key={c.label}
            className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div
              className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${c.grad}`}
            />
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">{c.label}</p>
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br ${c.grad} text-white`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <path d={c.icon} />
                </svg>
              </div>
            </div>
            <p className="mt-1.5 text-lg font-bold text-slate-900">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-[220px] flex-1">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search invoice no or customer…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-1 text-xs">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`rounded-lg px-3 py-1.5 font-medium capitalize transition ${
                  status === s
                    ? "bg-white text-slate-900 shadow-sm"
                    : `text-slate-500 ${STATUS_TAB[s]}`
                }`}
              >
                {s === "all" ? "All" : s}
              </button>
            ))}
          </div>
          <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
            {filtered.length} invoices
          </span>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-5 py-3 font-medium">Invoice</th>
              <th className="px-5 py-3 font-medium">Customer</th>
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Total</th>
              <th className="px-5 py-3 font-medium">Paid</th>
              <th className="px-5 py-3 font-medium">Due</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((inv) => {
              const hasReturn = Number(inv.returned) > 0;
              return (
                <tr
                  key={inv.id}
                  className="border-b border-slate-100 transition last:border-0 hover:bg-slate-50"
                >
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-900">
                      {inv.invoice_number}
                    </p>
                    {hasReturn && (
                      <p className="text-xs text-rose-600">
                        returned {inr(inv.returned)}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-700">
                    {inv.customers?.name ?? "Walk-in"}
                  </td>
                  <td className="px-5 py-3 text-slate-500">
                    {inv.invoice_date}
                  </td>
                  <td className="px-5 py-3 font-medium text-slate-900">
                    {inr(inv.total)}
                  </td>
                  <td className="px-5 py-3 text-slate-700">{inr(inv.paid)}</td>
                  <td className="px-5 py-3 font-medium text-slate-900">
                    {inr(inv.due)}
                  </td>
                  <td className="px-5 py-3">{statusBadge(inv.status)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {inv.status !== "cancelled" && (
                        <button
                          onClick={() => setReturnId(inv.id)}
                          className="rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
                          title="Return items"
                        >
                          Return
                        </button>
                      )}
                      <button
                        onClick={() => setViewId(inv.id)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                      >
                        View
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-5 py-12 text-center text-slate-500"
                >
                  No invoices found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {returnId && (
        <ReturnModal
          invoiceId={returnId}
          onClose={() => setReturnId(null)}
          onReturned={handleReturned}
        />
      )}
      {viewId && (
        <InvoiceViewModal
          invoiceId={viewId}
          onClose={() => setViewId(null)}
          onChanged={handleChanged}
          onReturn={setReturnId}
        />
      )}
    </div>
  );
}
