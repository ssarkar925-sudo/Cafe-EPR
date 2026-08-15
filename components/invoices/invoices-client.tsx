"use client";

import { useMemo, useState } from "react";
import { inr } from "@/lib/format";
import InvoiceViewModal from "./invoice-view-modal";

export type InvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total: number | string;
  paid: number | string;
  due: number | string;
  status: string;
  customers: { name: string } | null;
};

const STATUSES = ["all", "paid", "partial", "unpaid", "cancelled"] as const;

export function statusBadge(status: string) {
  const cls: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-700",
    partial: "bg-amber-100 text-amber-700",
    unpaid: "bg-red-100 text-red-700",
    cancelled: "bg-slate-100 text-slate-500",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs ${cls[status] ?? "bg-slate-100 text-slate-500"}`}
    >
      {status}
    </span>
  );
}

export default function InvoicesClient({
  initialInvoices,
}: {
  initialInvoices: InvoiceRow[];
}) {
  const [invoices, setInvoices] = useState<InvoiceRow[]>(initialInvoices);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [viewId, setViewId] = useState<string | null>(null);

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

  const selectClass =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Invoices</h1>
        <span className="text-sm text-slate-500">{filtered.length} invoices</span>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search invoice no or customer..."
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])}
          className={selectClass}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-4 py-3 font-medium">Invoice</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Paid</th>
              <th className="px-4 py-3 font-medium">Due</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((inv) => (
              <tr key={inv.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {inv.invoice_number}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {inv.customers?.name ?? "Walk-in"}
                </td>
                <td className="px-4 py-3 text-slate-500">{inv.invoice_date}</td>
                <td className="px-4 py-3 text-slate-900">{inr(inv.total)}</td>
                <td className="px-4 py-3 text-slate-700">{inr(inv.paid)}</td>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {inr(inv.due)}
                </td>
                <td className="px-4 py-3">{statusBadge(inv.status)}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => setViewId(inv.id)}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No invoices found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {viewId && (
        <InvoiceViewModal
          invoiceId={viewId}
          onClose={() => setViewId(null)}
          onChanged={handleChanged}
        />
      )}
    </div>
  );
}
