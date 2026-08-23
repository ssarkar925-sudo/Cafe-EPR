"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import SearchableSelect from "@/components/ui/searchable-select";
import Modal from "@/components/ui/modal";
import { statusBadge, type InvoiceRow } from "./invoices-client";
import { logAudit } from "@/lib/audit";
import { generateUpiString, generateQrDataUrl } from "@/lib/qr";
import { DEFAULT_WA_TEMPLATES, getWhatsAppConfig, renderWhatsAppTemplate, sendWhatsAppMessage } from "@/lib/whatsapp";
import WhatsAppSendModal from "@/components/whatsapp/whatsapp-send-modal";

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
  customers: { name: string; phone?: string } | null;
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
}) {
  const supabase = createClient();

  const [detail, setDetail] = useState<Detail | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [payMethod, setPayMethod] = useState<string>("cash");
  const [payAmount, setPayAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [upiId, setUpiId] = useState<string>("");
  const [showQr, setShowQr] = useState<boolean>(true);
  const [waModal, setWaModal] = useState<{
    open: boolean;
    phone: string;
    name: string;
    msg: string;
    invNum: string;
    refId: string;
  } | null>(null);

  async function load() {
    const [inv, its, pays, sets, defaultQr, upiInst] = await Promise.all([
      supabase
        .from("invoices")
        .select("*, customers(name, phone)")
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
      supabase.from("settings").select("*").single(),
      supabase.from("upi_merchant_qrs").select("upi_id").eq("is_active", true).limit(1).maybeSingle(),
      supabase.from("payment_instruments").select("account_number").eq("type", "upi").eq("is_active", true).limit(1).maybeSingle(),
    ]);
    if (inv.data) setDetail(inv.data as Detail);
    setItems((its.data ?? []) as Item[]);
    setPayments((pays.data ?? []) as Payment[]);

    const computedUpi =
      (sets.data as any)?.upi_id ||
      defaultQr.data?.upi_id ||
      upiInst.data?.account_number ||
      "";
    setUpiId(computedUpi);

    if (computedUpi && inv.data) {
      const targetAmt = Number(inv.data.due) > 0 ? Number(inv.data.due) : Number(inv.data.total);
      const str = generateUpiString({
        upiId: computedUpi,
        name: sets.data?.shop_name || "Shop",
        amount: targetAmt,
        note: `Invoice ${inv.data.invoice_number}`,
      });
      if (str) {
        generateQrDataUrl(str, { width: 220 }).then(setQrDataUrl);
      }
    }
  }

  function handleSendWhatsApp() {
    if (!detail) return;
    const cfg = getWhatsAppConfig();
    const template = cfg.templates?.pos_invoice || DEFAULT_WA_TEMPLATES.pos_invoice;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const receiptUrl = `${origin}/receipt/${detail.id}/a4`;
    const phone = detail.customers?.phone || "";
    const statusText = detail.status === "paid" ? "✅ Fully Paid" : `⚠️ Balance Due: ${inr(Number(detail.due))}`;
    const msg = renderWhatsAppTemplate(template, {
      shop_name: "Sarkar Communication",
      invoice_number: detail.invoice_number,
      invoice_date: detail.invoice_date,
      customer_name: detail.customers?.name || "Customer",
      customer_name_line: detail.customers?.name ? `👤 Customer: ${detail.customers.name}\n` : "",
      total_amount: inr(Number(detail.total)),
      paid_amount: inr(Number(detail.paid)),
      due_amount: inr(Number(detail.due)),
      status_line: statusText,
      receipt_url: receiptUrl,
    });

    setWaModal({
      open: true,
      phone,
      name: detail.customers?.name || "Customer",
      msg,
      invNum: detail.invoice_number,
      refId: detail.id,
    });
  }

  useEffect(() => {
    setError(null);
    setPayAmount("");
    load();
  }, [invoiceId]);

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!detail || !payAmount || Number(payAmount) <= 0) return;
    setBusy(true);
    setError(null);

    const amt = Number(payAmount);
    const prevPaid = Number(detail.paid) || 0;
    const total = Number(detail.total) || 0;
    const newPaid = prevPaid + amt;
    const newDue = Math.max(0, total - newPaid);
    const newStatus = newDue <= 0 ? "paid" : "partial";

    const { error: pErr } = await supabase.from("payments").insert({
      invoice_id: invoiceId,
      customer_id: detail.customer_id,
      amount: amt,
      method: payMethod,
    });
    if (pErr) {
      setError(pErr.message);
      setBusy(false);
      return;
    }

    const { data: updated, error: iErr } = await supabase
      .from("invoices")
      .update({ paid: newPaid, due: newDue, status: newStatus })
      .eq("id", invoiceId)
      .select("*, customers(name)")
      .single();

    if (iErr) {
      setError(iErr.message);
      setBusy(false);
      return;
    }

    await logAudit({
      action: "payment",
      entity: "invoice",
      entity_id: invoiceId,
      description: `Payment of ${inr(amt)} received (${payMethod})`,
      details: { amount: amt, method: payMethod, invoice_number: detail.invoice_number },
    });

    setPayAmount("");
    setBusy(false);
    if (updated) {
      setDetail(updated as Detail);
      onChanged(updated as InvoiceRow);
    }
    load();
  }

  function returnInvoice() {
    if (!onReturn) return;
    setError(null);
    onReturn(invoiceId);
    onClose();
  }

  const dueNum = detail ? Number(detail.due) : 0;

  return (
    <>
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
        <div className="mr-2 flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={handleSendWhatsApp}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            title="Send A4 Invoice on WhatsApp"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            WhatsApp
          </button>
          <a
            href={`/receipt/${invoiceId}/a4`}
            target="_blank"
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            📄 Invoice (A4)
          </a>
          <a
            href={`/receipt/${invoiceId}`}
            target="_blank"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
          >
            🧾 Receipt (80mm)
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

          {qrDataUrl && detail.status !== "cancelled" && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-slate-800/60">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  📱 UPI Payment QR ({Number(detail.due) > 0 ? `Due: ${inr(detail.due)}` : `Total: ${inr(detail.total)}`})
                </span>
                <button
                  type="button"
                  onClick={() => setShowQr((v) => !v)}
                  className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                >
                  {showQr ? "Hide QR" : "Show QR"}
                </button>
              </div>
              {showQr && (
                <div className="mt-2.5 flex items-center gap-4">
                  <img
                    src={qrDataUrl}
                    alt="UPI Payment QR"
                    className="h-24 w-24 rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-white/10"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Scan with GPay, PhonePe, Paytm or any UPI App
                    </p>
                    {upiId && (
                      <p className="mt-1 font-mono text-[11px] text-blue-600 dark:text-blue-400">
                        {upiId}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-slate-500">
                      Pre-filled with {detail.invoice_number}
                    </p>
                  </div>
                </div>
              )}
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
    {waModal && (
      <WhatsAppSendModal
        open={Boolean(waModal)}
        onClose={() => setWaModal(null)}
        phone={waModal.phone}
        recipientName={waModal.name}
        initialMessage={waModal.msg}
        messageType="pos_invoice"
        refId={waModal.refId}
        refNumber={waModal.invNum}
      />
    )}
    </>
  );
}
