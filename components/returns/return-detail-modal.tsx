"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";

type ReturnDetail = {
  id: string;
  return_number: string;
  return_date: string;
  reason: string | null;
  subtotal: number | string;
  refund: number | string;
  refund_method: string | null;
  status: string;
  created_at: string;
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

type ReturnItem = {
  id: string;
  qty: number | string;
  rate: number | string;
  amount: number | string;
  products: { name: string } | null;
  services: { name: string } | null;
  invoice_items: { description: string | null } | null;
};

export default function ReturnDetailModal({
  returnId,
  onClose,
}: {
  returnId: string;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [detail, setDetail] = useState<ReturnDetail | null>(null);
  const [items, setItems] = useState<ReturnItem[]>([]);

  useEffect(() => {
    async function load() {
      const [ret, its] = await Promise.all([
        supabase
          .from("returns")
          .select(
            "*, invoices(invoice_number, total, paid, due, returned, refunded, customers(name))"
          )
          .eq("id", returnId)
          .single(),
        supabase
          .from("return_items")
          .select("*, products(name), services(name), invoice_items(description)")
          .eq("return_id", returnId),
      ]);
      setDetail(ret.data as ReturnDetail);
      setItems((its.data ?? []) as ReturnItem[]);
    }
    load();
  }, [returnId]);

  const hasRefund = Number(detail?.refund) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/60 p-4 backdrop-blur-sm">
      <div
        onClick={onClose}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">
                {detail?.return_number ?? "Loading…"}
              </h2>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
                  hasRefund
                    ? "bg-violet-100 text-violet-700 ring-violet-200"
                    : "bg-amber-100 text-amber-700 ring-amber-200"
                }`}
              >
                {hasRefund ? "Refunded" : "Credit"}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              {detail?.invoices?.invoice_number ?? ""} ·{" "}
              {detail?.invoices?.customers?.name ?? "Walk-in customer"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        {detail && (
          <div className="px-6 py-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-400">Return date</p>
                <p className="text-sm font-semibold text-slate-900">
                  {detail.return_date}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-400">Return value</p>
                <p className="text-sm font-semibold text-rose-600">
                  {inr(detail.subtotal)}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-400">Refund</p>
                <p className="text-sm font-semibold text-violet-700">
                  {hasRefund ? inr(detail.refund) : "—"}
                  {hasRefund && detail.refund_method && (
                    <span className="ml-1 text-xs font-normal text-slate-400">
                      {detail.refund_method.toUpperCase()}
                    </span>
                  )}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-400">Invoice balance</p>
                <p className="text-sm font-semibold text-slate-900">
                  {inr(detail.invoices?.due ?? 0)} due
                </p>
              </div>
            </div>

            {detail.reason && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <span className="font-medium">Reason: </span>
                {detail.reason}
              </div>
            )}

            <div className="mt-4 overflow-hidden rounded-xl ring-1 ring-slate-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="px-4 py-2.5 font-medium">Item</th>
                    <th className="px-4 py-2.5 font-medium">Qty</th>
                    <th className="px-4 py-2.5 font-medium">Rate</th>
                    <th className="px-4 py-2.5 text-right font-medium">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2.5 text-slate-900">
                        {it.products?.name ??
                          it.services?.name ??
                          it.invoice_items?.description ??
                          "-"}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">{it.qty}</td>
                      <td className="px-4 py-2.5 text-slate-700">
                        {inr(it.rate)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-slate-900">
                        {inr(it.amount)}
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                        Loading items…
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50">
                    <td colSpan={3} className="px-4 py-2.5 text-sm font-medium text-slate-700">
                      Total return value
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold text-rose-600">
                      {inr(detail.subtotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="mt-4 flex justify-end">
              <a
                href={`/invoices`}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Back to Invoices
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
