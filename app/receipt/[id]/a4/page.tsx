import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import A4Actions from "@/components/pdf/a4-actions";
import { generateUpiString, generateQrDataUrl } from "@/lib/qr";

export const dynamic = "force-dynamic";

export default async function ReceiptA4Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*, customers(name, phone, address)")
    .eq("id", id)
    .single();
  if (!invoice) notFound();

  const { data: items } = await supabase
    .from("invoice_items")
    .select("*, products(name), services(name)")
    .eq("invoice_id", id);
  const { data: payments } = await supabase
    .from("payments")
    .select("method, amount, received_at")
    .eq("invoice_id", id);
  const { data: settings } = await supabase
    .from("settings")
    .select("*")
    .single();

  const { data: defaultMerchantQr } = await supabase
    .from("upi_merchant_qrs")
    .select("upi_id, display_name")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const { data: upiInstrument } = await supabase
    .from("payment_instruments")
    .select("account_number")
    .eq("type", "upi")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const cur = settings?.currency_symbol || "₹";
  const money = (n: number | string) =>
    cur +
    Number(n).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const itemsRows = (items ?? []) as any[];
  const paymentsRows = (payments ?? []) as any[];

  // UPI QR Code calculation
  const upiId =
    (settings as any)?.upi_id ||
    defaultMerchantQr?.upi_id ||
    upiInstrument?.account_number ||
    "";

  const targetAmount = Number(invoice.due) > 0 ? Number(invoice.due) : Number(invoice.total);
  const upiString = upiId
    ? generateUpiString({
        upiId,
        name: settings?.shop_name || "Shop",
        amount: targetAmount,
        note: `Invoice ${invoice.invoice_number}`,
      })
    : "";

  const qrDataUrl = upiString ? await generateQrDataUrl(upiString, { width: 180 }) : "";

  return (
    <div className="min-h-screen bg-slate-200 p-6 print:bg-white print:p-0">
      <style>{`
        @page { size: A4; margin: 15mm; }
        @media print { body { background: #fff !important; } }
      `}</style>

      <div className="mx-auto max-w-[800px] rounded-lg bg-white p-8 shadow-lg print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <div className="mb-6 flex items-center justify-between print:hidden">
          <h1 className="text-lg font-semibold text-slate-900">A4 Print / PDF</h1>
          <A4Actions
            variant="invoice"
            data={{ invoice, items: itemsRows, payments: paymentsRows, settings, qrDataUrl, upiId }}
            filename={`${invoice.invoice_number}.pdf`}
          />
        </div>

        <div className="border-b-2 border-slate-900 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {settings?.shop_name || "Shop"}
              </p>
              {settings?.address && <p className="mt-1 text-sm text-slate-600">{settings.address}</p>}
              {settings?.phone && <p className="text-sm text-slate-600">Ph: {settings.phone}</p>}
              {settings?.email && <p className="text-sm text-slate-600">{settings.email}</p>}
            </div>
            <div className="text-right">
              <p className="text-xl font-bold tracking-wide text-slate-900">INVOICE</p>
              <p className="mt-1 text-sm text-slate-600">No: {invoice.invoice_number}</p>
              <p className="text-sm text-slate-600">Date: {invoice.invoice_date}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bill To</p>
            <p className="mt-1 font-medium text-slate-900">{invoice.customers?.name || "Walk-in Customer"}</p>
            {invoice.customers?.phone && <p className="text-sm text-slate-600">{invoice.customers.phone}</p>}
            {invoice.customers?.address && <p className="text-sm text-slate-600">{invoice.customers.address}</p>}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Invoice Summary</p>
            <div className="mt-1 space-y-0.5 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-medium text-slate-900">{money(invoice.subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Discount</span>
                <span className="font-medium text-slate-900">{money(invoice.discount)}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900">
                <span>Total</span>
                <span>{money(invoice.total)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Paid</span>
                <span className="font-medium text-slate-900">{money(invoice.paid)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Due</span>
                <span className="font-semibold text-slate-900">{money(invoice.due)}</span>
              </div>
            </div>
          </div>
        </div>

        <table className="mt-8 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-300 bg-slate-50 text-slate-600">
              <th className="py-2 pr-4 font-semibold">Item</th>
              <th className="py-2 pr-4 text-center font-semibold">Qty</th>
              <th className="py-2 pr-4 text-right font-semibold">Rate</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {itemsRows.map((it) => (
              <tr key={it.id} className="border-b border-slate-100">
                <td className="py-2 pr-4 text-slate-900">
                  {it.products?.name || it.services?.name || it.description || "-"}
                </td>
                <td className="py-2 pr-4 text-center text-slate-700">{Number(it.qty)}</td>
                <td className="py-2 pr-4 text-right text-slate-700">{money(it.rate)}</td>
                <td className="py-2 text-right text-slate-900">{money(it.amount)}</td>
              </tr>
            ))}
            {itemsRows.length === 0 && (
              <tr>
                <td className="py-2 text-slate-500">-</td>
              </tr>
            )}
          </tbody>
        </table>

        {paymentsRows.length > 0 && (
          <div className="mt-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payments</p>
            <div className="mt-2 space-y-1 text-sm">
              {paymentsRows.map((p) => (
                <div key={p.id} className="flex justify-between text-slate-700">
                  <span>
                    {p.method.toUpperCase()} ·{" "}
                    {p.received_at ? new Date(p.received_at).toLocaleString("en-IN") : ""}
                  </span>
                  <span className="font-medium text-slate-900">{money(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {qrDataUrl && (
          <div className="mt-8 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex items-center gap-4">
              <img
                src={qrDataUrl}
                alt="Scan to Pay via UPI"
                className="h-28 w-28 rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
              />
              <div>
                <p className="font-bold text-slate-900">Scan &amp; Pay with Any UPI App</p>
                <p className="mt-0.5 text-xs text-slate-600">
                  Google Pay · PhonePe · Paytm · BHIM · Any UPI App
                </p>
                {upiId && (
                  <p className="mt-1 font-mono text-xs font-semibold text-blue-700">
                    UPI ID: {upiId}
                  </p>
                )}
                <p className="mt-1 text-xs font-medium text-slate-700">
                  Amount: <span className="font-bold text-slate-900">{money(targetAmount)}</span>
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                Instant UPI Payment
              </span>
            </div>
          </div>
        )}

        {settings?.receipt_footer && (
          <p className="mt-10 border-t border-slate-200 pt-4 text-center text-sm text-slate-500">
            {settings.receipt_footer}
          </p>
        )}
      </div>
    </div>
  );
}
