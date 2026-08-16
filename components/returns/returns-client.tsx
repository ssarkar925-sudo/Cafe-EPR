"use client";

import { useMemo, useState } from "react";
import { inr } from "@/lib/format";
import ReturnDetailModal from "./return-detail-modal";

export type ReturnRow = {
  id: string;
  return_number: string;
  return_date: string;
  reason: string | null;
  subtotal: number | string;
  refund: number | string;
  refund_method: string | null;
  status: string;
  created_at: string;
  invoice_id: string;
  invoices: {
    invoice_number: string;
    total: number | string;
    paid: number | string;
    due: number | string;
    returned: number | string;
    refunded: number | string;
    customers: { name: string } | null;
  } | null;
};

const FILTERS = ["all", "refunded", "credit"] as const;

export default function ReturnsClient({
  initialReturns,
}: {
  initialReturns: ReturnRow[];
}) {
  const [returns, setReturns] = useState<ReturnRow[]>(initialReturns);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [viewId, setViewId] = useState<string | null>(null);

  const stats = useMemo(() => {
    let count = 0,
      refunded = 0,
      credit = 0;
    for (const r of returns) {
      count++;
      refunded += Number(r.refund) || 0;
      credit += Number(r.subtotal) - (Number(r.refund) || 0);
    }
    return { count, refunded, credit };
  }, [returns]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return returns.filter((r) => {
      if (filter === "refunded" && !(Number(r.refund) > 0)) return false;
      if (filter === "credit" && !(Number(r.refund) <= 0)) return false;
      if (!needle) return true;
      return (
        r.return_number.toLowerCase().includes(needle) ||
        (r.invoices?.invoice_number ?? "").toLowerCase().includes(needle) ||
        (r.invoices?.customers?.name ?? "").toLowerCase().includes(needle)
      );
    });
  }, [returns, q, filter]);

  const KPI_CARDS = [
    { label: "Total Returns", value: String(stats.count), icon: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5", grad: "from-rose-500 to-pink-600" },
    { label: "Refunded", value: inr(stats.refunded), icon: "M3 7v6h6M3.5 13a9 9 0 1 0 0-6", grad: "from-violet-500 to-purple-600" },
    { label: "Credit / Adjusted", value: inr(stats.credit), icon: "M12 3v18M8 7h7a2 2 0 0 1 0 4H9a2 2 0 0 0 0 4h7", grad: "from-amber-500 to-orange-600" },
    { label: "This Month", value: String(new Date().getMonth() + 1), icon: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z", grad: "from-blue-500 to-indigo-600" },
  ];

  const selectClass =
    "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Returns</h1>
        <p className="text-sm text-slate-500">
          Full and partial returns with refunds, restocked automatically.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
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
            placeholder="Search return no, invoice or customer…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-1 text-xs">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-lg px-3 py-1.5 font-medium capitalize transition ${
                  filter === f
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                {f === "all" ? "All" : f}
              </button>
            ))}
          </div>
          <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
            {filtered.length} returns
          </span>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-5 py-3 font-medium">Return</th>
              <th className="px-5 py-3 font-medium">Invoice</th>
              <th className="px-5 py-3 font-medium">Customer</th>
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Value</th>
              <th className="px-5 py-3 font-medium">Refund</th>
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const hasRefund = Number(r.refund) > 0;
              return (
                <tr
                  key={r.id}
                  className="border-b border-slate-100 transition last:border-0 hover:bg-slate-50"
                >
                  <td className="px-5 py-3 font-medium text-slate-900">
                    {r.return_number}
                  </td>
                  <td className="px-5 py-3 text-slate-700">
                    {r.invoices?.invoice_number ?? "-"}
                  </td>
                  <td className="px-5 py-3 text-slate-700">
                    {r.invoices?.customers?.name ?? "Walk-in"}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{r.return_date}</td>
                  <td className="px-5 py-3 font-medium text-slate-900">
                    {inr(r.subtotal)}
                  </td>
                  <td className="px-5 py-3">
                    {hasRefund ? (
                      <span className="font-semibold text-violet-700">
                        {inr(r.refund)}{" "}
                        <span className="text-xs font-normal text-slate-400">
                          {r.refund_method?.toUpperCase()}
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
                        hasRefund
                          ? "bg-violet-100 text-violet-700 ring-violet-200"
                          : "bg-amber-100 text-amber-700 ring-amber-200"
                      }`}
                    >
                      {hasRefund ? "Refunded" : "Credit"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end">
                      <button
                        onClick={() => setViewId(r.id)}
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
                  No returns yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {viewId && (
        <ReturnDetailModal
          returnId={viewId}
          onClose={() => setViewId(null)}
        />
      )}
    </div>
  );
}
