"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import Modal from "@/components/ui/modal";

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
    <Modal
      onClose={onClose}
      title={detail?.return_number ?? "Loading…"}
      subtitle={
        <>
          {detail?.invoices?.invoice_number ?? ""} ·{" "}
          {detail?.invoices?.customers?.name ?? "Walk-in customer"}
        </>
      }
      icon="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"
      accent={hasRefund ? "violet" : "amber"}
      size="xl"
      headerRight={
        <div className="mr-2">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
              hasRefund
                ? "bg-violet-100 text-violet-700 ring-violet-200"
                : "bg-amber-100 text-amber-700 ring-amber-200"
            }`}
          >
            {hasRefund ? "Refunded" : "Credit"}
          </span>
        </div>
      }
      footer={
        <div className="flex justify-end">
          <a
            href={`/invoices`}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Back to Invoices
          </a>
        </div>
      }
    >
      {detail && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
              <p className="text-xs text-slate-400">Return date</p>
              <p className="text-sm font-semibold text-slate-900">
                {detail.return_date}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
              <p className="text-xs text-slate-400">Return value</p>
              <p className="text-sm font-semibold text-rose-600">
                {inr(detail.subtotal)}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
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
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
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

          <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-slate-200 dark:ring-white/10">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:bg-white/5">
                  <th className="px-4 py-2.5 font-medium">Item</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">Qty</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">Rate</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b border-slate-100 last:border-0">
                    <td className="max-w-[180px] px-4 py-2.5 text-slate-900">
                      <span className="block truncate">
                        {it.products?.name ??
                          it.services?.name ??
                          it.invoice_items?.description ??
                          "-"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-700">{it.qty}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-700">
                      {inr(it.rate)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-slate-900">
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
                <tr className="border-t border-slate-200 bg-slate-50 dark:bg-white/5">
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
        </>
      )}
    </Modal>
  );
}
