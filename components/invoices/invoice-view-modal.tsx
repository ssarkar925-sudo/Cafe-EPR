"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { statusBadge, type InvoiceRow } from "./invoices-client";

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
}: {
  invoiceId: string;
  onClose: () => void;
  onChanged: (row: InvoiceRow) => void;
}) {
  const supabase = createClient();

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
  }

  async function returnInvoice() {
    if (
      !window.confirm(
        "Return this invoice? Products will be restocked and any outstanding due removed from the customer."
      )
    ) {
      return;
    }
    setError(null);
    setBusy(true);
    const { data, error } = await supabase.rpc("return_invoice", {
      p_invoice_id: invoiceId,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    const r = data as { status: string };
    if (detail) {
      const updated = { ...detail, paid: 0, due: 0, status: r.status };
      setDetail(updated);
      onChanged(updated);
    }
    load();
  }

  const dueNum = detail ? Number(detail.due) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {detail?.invoice_number ?? "Loading..."}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {detail?.invoice_date ?? ""} &middot;{" "}
              {detail?.customers?.name ?? "Walk-in customer"}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <a
              href={`/receipt/${invoiceId}`}
              target="_blank"
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Print
            </a>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600"
            >
              &times;
            </button>
          </div>
        </div>

        {detail && (
          <>
            <div className="mt-4">{statusBadge(detail.status)}</div>

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
                      <td className="py-2 pr-4 text-slate-700">{it.qty}</td>
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
              <div className="mt-5 rounded-lg bg-slate-50 p-4">
                {dueNum > 0 ? (
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      Record Payment
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <select
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value)}
                        className="rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-blue-500"
                      >
                        {METHODS.map((m) => (
                          <option key={m} value={m}>
                            {m.toUpperCase()}
                          </option>
                        ))}
                      </select>
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

            {error && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            {detail.status !== "cancelled" && (
              <div className="mt-4 flex justify-end">
                <button
                  onClick={returnInvoice}
                  disabled={busy}
                  className="rounded-lg px-3 py-2 text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                >
                  Return / Cancel Invoice
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
