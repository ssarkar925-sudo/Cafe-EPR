"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import SearchableSelect from "@/components/ui/searchable-select";
import Modal from "@/components/ui/modal";
import { statusBadge, type InvoiceRow } from "./invoices-client";
import { logAudit } from "@/lib/audit";

type Detail = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  customer_id: string | null;
  subtotal: number | string;
  discount: number | string;
  total: number | string;
  paid: number | string;
  due: number | string;
  returned: number | string;
  refunded: number | string;
  status: string;
  customers: { name: string } | null;
};

type Item = {
  id: string;
  description: string | null;
  product_id: string | null;
  service_id: string | null;
  qty: number | string;
  rate: number | string;
  amount: number | string;
  returned_qty: number | string;
  products: { name: string } | null;
  services: { name: string } | null;
};

type Payment = {
  id: string;
  method: string;
  amount: number | string;
  received_at: string;
};

const METHODS = ["cash", "upi", "card"] as const;

export default function InvoiceViewModal({
  invoiceId,
  onClose,
  onChanged,
  onReturn,
}: {
  invoiceId: string;
  onClose: () => void;
  onChanged: (row: InvoiceRow) => void;
  onReturn?: (invoiceId: string) => void;
}) {  const supabase = createClient();

  const [detail, setDetail] = useState<Detail | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [payMethod, setPayMethod] = useState<string>("cash");
  const [payAmount, setPayAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [inv, its, pays] = await Promise.all([
      supabase
        .from("invoices")
        .select("*, customers(name)")
        .eq("id", invoiceId)
        .single(),
      supabase
        .from("invoice_items")
        .select("*, products(name), services(name)")
        .eq("invoice_id", invoiceId),
      supabase
        .from("payments")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("received_at", { ascending: true }),
    ]);
    if (inv.data) setDetail(inv.data as Detail);
    setItems((its.data ?? []) as Item[]);
    setPayments((pays.data ?? []) as Payment[]);
  }

  useEffect(() => {
    setError(null);
    setPayAmount("");
    load();
  }, [invoiceId]);

  async function recordPayment() {
    setError(null);
    const amt = Number(payAmount) || 0;
    if (amt <= 0) {
      setError("Enter an amount");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("record_invoice_payment", {
      p_invoice_id: invoiceId,
      p_method: payMethod,
      p_amount: amt,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    const r = data as { paid: number; due: number; status: string };
    if (detail) {
      const updated = { ...detail, paid: r.paid, due: r.due, status: r.status };
      setDetail(updated);
      onChanged(updated);
    }
    setPayAmount("");
    load();
    logAudit({
      action: "payment",
      entity: "invoice",
      entity_id: invoiceId,
      description: `Payment of ${inr(amt)} received (${payMethod})`,
      details: { invoice_number: detail?.invoice_number ?? null, method: payMethod, amount: amt },
    });
  }

  async function returnInvoice() {
    if (!onReturn) return;
    setError(null);
    onReturn(invoiceId);
    onClose();
  }

  const dueNum = detail ? Number(detail.due) : 0;

  return (
    <Modal
      onClose={onClose}
      title={detail?.invoice_number ?? "Loading..."}
      subtitle={
        <>
          {detail?.invoice_date ?? ""} &middot;{" "}
          {detail?.customers?.name ?? "Walk-in customer"}
        </>
      }
      icon="M7 3h10a1 1 0 0 1 1 1v17l-3-2-2 2-3-2-3 2-3-2V4a1 1 0 0 1 1-1Z"
      accent="blue"
      size="xl"
      headerRight={
        <div className="mr-2 flex items-center gap-1 text-xs">
          <a
            href={`/receipt/${invoiceId}`}
            target="_blank"
            className="rounded-lg border border-slate-200 px-2.5 py-1 font-medium text-blue-600 transition hover:bg-blue-50"
          >
            80mm
          </a>
          <a
            href={`/receipt/${invoiceId}/a4`}
            target="_blank"
            className="rounded-lg border border-slate-200 px-2.5 py-1 font-medium text-blue-600 transition hover:bg-blue-50"
          >
            A4 / PDF
          </a>
        </div>
      }
      footer={
        detail && detail.status !== "cancelled" ? (
          <div className="flex items-center justify-between gap-3">
            {error ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : (
              <p className="text-xs text-slate-400">
                {Number(detail.due) > 0
                  ? `${inr(detail.due)} outstanding on this invoice`
                  : "Invoice settled"}
              </p>
            )}
            <button
              onClick={returnInvoice}
              className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
            >
              Return Items
            </button>
          </div>
        ) : undefined
      }
    >
      {detail && (
        <>
          <div>{statusBadge(detail.status)}</div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4 font-medium">Item</th>
                  <th className="py-2 pr-4 font-medium">Qty</th>
                  <th className="py-2 pr-4 font-medium">Rate</th>
                  <th className="py-2 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-900">
                      {it.products?.name ?? it.services?.name ?? it.description ?? "-"}
                    </td>
                    <td className="py-2 pr-4 text-slate-700">
                      {it.qty}
                      {Number(it.returned_qty) > 0 && (
                        <span className="ml-1 text-xs text-rose-600">
                          ({Number(it.returned_qty)} returned)
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-slate-700">{inr(it.rate)}</td>
                    <td className="py-2 text-slate-900">{inr(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between text-slate-700">
              <span>Subtotal</span>
              <span>{inr(detail.subtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-700">
              <span>Discount</span>
              <span>{inr(detail.discount)}</span>
            </div>
            <div className="flex justify-between font-medium text-slate-900">
              <span>Total</span>
              <span>{inr(detail.total)}</span>
            </div>
            <div className="flex justify-between text-slate-700">
              <span>Paid</span>
              <span>{inr(detail.paid)}</span>
            </div>
            <div className="flex justify-between font-semibold text-slate-900">
              <span>Due</span>
              <span>{inr(detail.due)}</span>
            </div>
            {Number(detail.returned) > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>Returned</span>
                <span>- {inr(detail.returned)}</span>
              </div>
            )}
            {Number(detail.refunded) > 0 && (
              <div className="flex justify-between text-violet-600">
                <span>Refunded</span>
                <span>- {inr(detail.refunded)}</span>
              </div>
            )}
          </div>

          {payments.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-slate-900">Payments</h3>
              <div className="mt-2 space-y-1 text-sm">
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex justify-between text-slate-700"
                  >
                    <span>
                      {p.method.toUpperCase()} &middot;{" "}
                      {new Date(p.received_at).toLocaleString("en-IN")}
                    </span>
                    <span className="font-medium">{inr(p.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {detail.status !== "cancelled" && (
            <div className="mt-5 rounded-lg bg-slate-50 p-4 dark:bg-white/5">
              {dueNum > 0 ? (
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    Record Payment
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <SearchableSelect
                      value={payMethod}
                      onChange={setPayMethod}
                      options={METHODS.map((m) => ({ value: m, label: m.toUpperCase() }))}
                      searchPlaceholder="Search method…"
                      showClear={false}
                      className="w-28"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      placeholder={String(Number(detail.due))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={recordPayment}
                      disabled={busy}
                      className="whitespace-nowrap rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
                    >
                      {busy ? "..." : "Pay"}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-emerald-700">Fully paid.</p>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
