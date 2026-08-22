import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import A4Actions from "@/components/pdf/a4-actions";
import { generateUpiString, generateQrDataUrl } from "@/lib/qr";
import { numberToWordsInr } from "@/lib/format";

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
    .select("*, customers(name, phone, address, code)")
    .eq("id", id)
    .single();
  if (!invoice) notFound();

  const { data: items } = await supabase
    .from("invoice_items")
    .select("*, products(name, code), services(name)")
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
  const money = (n: number | string | undefined | null) =>
    cur +
    Number(n || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const itemsRows = (items ?? []) as any[];
  const paymentsRows = (payments ?? []) as any[];

  const isPaid = Number(invoice.due || 0) <= 0 && invoice.status !== "cancelled";
  const isDue = Number(invoice.due || 0) > 0 && invoice.status !== "cancelled";
  const isCancelled = invoice.status === "cancelled";
  const shopInitial = (settings?.shop_name || "S").charAt(0).toUpperCase();
  const totalNum = Number(invoice.total || 0);

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
        note: "Invoice " + invoice.invoice_number,
      })
    : "";

  const qrDataUrl = upiString ? await generateQrDataUrl(upiString, { width: 180 }) : "";

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 print:bg-white print:p-0">
      <style>{`
        @page { size: A4 portrait; margin: 12mm; }
        @media print {
          body { background: #fff !important; color: #000 !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>

      <div className="mx-auto max-w-[820px] rounded-2xl border border-slate-200 bg-white p-8 md:p-10 shadow-xl print:max-w-none print:rounded-none print:border-none print:p-0 print:shadow-none">
        {/* Top Control Bar */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 print:hidden">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-xs font-bold text-blue-700">A4</span>
            <div>
              <h1 className="text-sm font-bold text-slate-900">Tax Invoice / Receipt</h1>
              <p className="text-xs text-slate-500">#{invoice.invoice_number} · Standard Customer A4 Format</p>
            </div>
          </div>
          <A4Actions
            variant="invoice"
            data={{ invoice, items: itemsRows, payments: paymentsRows, settings, qrDataUrl, upiId }}
            filename={invoice.invoice_number + ".pdf"}
          />
        </div>

        {/* Premium Brand Header */}
        <div className="relative border-b-2 border-slate-900 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-lg font-black text-white shadow-md">
                {shopInitial}
              </div>
              <div>
                <p className="text-2xl font-black tracking-tight text-slate-900">
                  {settings?.shop_name || "Sarkar Communication"}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">
                  Smart Business Suite · Retail &amp; Digital Services
                </p>
                {settings?.address && <p className="mt-1 text-xs text-slate-600">{settings.address}</p>}
                <p className="text-xs text-slate-600">
                  {settings?.phone && <span>Ph: {settings.phone}</span>}
                  {settings?.phone && settings?.email && <span> · </span>}
                  {settings?.email && <span>Email: {settings.email}</span>}
                </p>
                {settings?.tax_id && (
                  <p className="text-xs font-mono font-medium text-slate-700">
                    GSTIN / Tax ID: <span className="font-semibold">{settings.tax_id}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="text-right">
              {isPaid && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 ring-1 ring-emerald-300">
                  ✓ FULLY PAID
                </span>
              )}
              {isDue && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-300">
                  ⚠ BALANCE DUE: {money(invoice.due)}
                </span>
              )}
              {isCancelled && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800">
                  CANCELLED
                </span>
              )}

              <p className="mt-2 text-xl font-black tracking-tight text-slate-900">TAX INVOICE</p>
              <p className="font-mono text-sm font-bold text-slate-800">#{invoice.invoice_number}</p>
              <p className="text-xs text-slate-500">Date: {invoice.invoice_date}</p>
            </div>
          </div>
        </div>

        {/* Metadata Cards: Customer Bill To & Payment Info */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Billed To (Customer)</p>
            <p className="mt-1 text-base font-bold text-slate-900">
              {invoice.customers?.name || "Walk-in Customer"}
            </p>
            {invoice.customers?.phone && (
              <p className="mt-0.5 text-xs text-slate-600">Phone: {invoice.customers.phone}</p>
            )}
            {invoice.customers?.address && (
              <p className="text-xs text-slate-600">Address: {invoice.customers.address}</p>
            )}
            {invoice.customers?.code && (
              <p className="text-[11px] font-mono text-slate-400">Customer ID: {invoice.customers.code}</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Invoice &amp; Settlement Details</p>
            <div className="mt-1 space-y-1 text-xs text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500">Invoice Date:</span>
                <span className="font-semibold text-slate-900">{invoice.invoice_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Modes:</span>
                <span className="font-semibold text-slate-900">
                  {paymentsRows.length > 0
                    ? paymentsRows.map((p) => String(p.method).toUpperCase()).join(", ")
                    : "CASH"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Settlement Status:</span>
                <span className="font-semibold uppercase text-slate-900">{invoice.status || "COMPLETED"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Itemized Table */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-y-2 border-slate-900 bg-slate-900 text-white font-bold">
                <th className="py-2.5 pl-3 pr-2 w-10 text-center">#</th>
                <th className="py-2.5 px-3">Item Description</th>
                <th className="py-2.5 px-3 text-center w-16">Qty</th>
                <th className="py-2.5 px-3 text-right w-24">Rate</th>
                <th className="py-2.5 pl-3 pr-4 text-right w-28">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {itemsRows.map((it, idx) => {
                const itemName = it.products?.name || it.services?.name || it.description || "Item";
                const itemCode = it.products?.code ? "[" + it.products.code + "] " : "";
                return (
                  <tr key={it.id || idx} className={idx % 2 === 1 ? "bg-slate-50/50" : "bg-white"}>
                    <td className="py-2.5 pl-3 pr-2 text-center text-slate-400 font-mono">{idx + 1}</td>
                    <td className="py-2.5 px-3">
                      <span className="font-bold text-slate-900">{itemName}</span>
                      {itemCode && <span className="ml-1 font-mono text-[10px] text-slate-400">{itemCode}</span>}
                    </td>
                    <td className="py-2.5 px-3 text-center font-medium text-slate-700">{Number(it.qty)}</td>
                    <td className="py-2.5 px-3 text-right text-slate-600">{money(it.rate)}</td>
                    <td className="py-2.5 pl-3 pr-4 text-right font-bold text-slate-900">{money(it.amount)}</td>
                  </tr>
                );
              })}
              {itemsRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    No line items recorded on this invoice
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom Section: Left (Words, QR, Payments) vs Right (Financial Summary) */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <div className="space-y-4">
            {/* Amount in words */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Amount in Words:</p>
              <p className="mt-0.5 text-xs font-bold text-slate-900">{numberToWordsInr(totalNum)}</p>
            </div>

            {/* UPI QR Payment Block */}
            {qrDataUrl && (
              <div className="flex items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5">
                <img
                  src={qrDataUrl}
                  alt="Scan to Pay via UPI"
                  className="h-20 w-20 shrink-0 rounded-lg border border-emerald-300 bg-white p-1 shadow-sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-emerald-900">Scan &amp; Pay with Any UPI App</p>
                  <p className="text-[10px] text-emerald-700">Google Pay · PhonePe · Paytm · BHIM</p>
                  {upiId && (
                    <p className="mt-1 font-mono text-xs font-bold text-blue-700">
                      UPI ID: {upiId}
                    </p>
                  )}
                  <p className="text-[10px] text-emerald-800">
                    Amount: <span className="font-bold">{money(targetAmount)}</span>
                  </p>
                </div>
              </div>
            )}

            {/* Payments History */}
            {paymentsRows.length > 0 && (
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment Breakdown</p>
                <div className="mt-1.5 space-y-1 text-xs">
                  {paymentsRows.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between text-slate-700">
                      <span className="font-medium">
                        • {String(p.method).toUpperCase()}
                        {p.received_at ? " (" + new Date(p.received_at).toLocaleDateString("en-IN") + ")" : ""}
                      </span>
                      <span className="font-bold text-slate-900">{money(p.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Summary Card */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-semibold text-slate-900">{money(invoice.subtotal)}</span>
              </div>

              {Number(invoice.discount || 0) > 0 && (
                <div className="flex justify-between text-emerald-700 font-bold">
                  <span>Discount Savings</span>
                  <span>- {money(invoice.discount)}</span>
                </div>
              )}

              <div className="flex justify-between items-center rounded-xl bg-slate-900 p-3 text-white font-bold text-sm">
                <span>Grand Total</span>
                <span className="text-base">{money(invoice.total)}</span>
              </div>

              <div className="flex justify-between text-slate-700 pt-1">
                <span>Amount Paid</span>
                <span className="font-bold text-emerald-700">{money(invoice.paid)}</span>
              </div>

              {Number(invoice.due || 0) > 0 && (
                <div className="flex justify-between text-amber-800 font-bold border-t border-slate-200 pt-2">
                  <span>Balance Due</span>
                  <span className="text-sm">{money(invoice.due)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Receipt Note */}
        {settings?.receipt_footer && (
          <div className="mt-8 rounded-lg bg-slate-50 p-2.5 text-center text-xs text-slate-500">
            {settings.receipt_footer}
          </div>
        )}

        {/* Dual Signatures */}
        <div className="mt-10 grid grid-cols-2 gap-10 border-t border-dashed border-slate-300 pt-6">
          <div className="text-center">
            <div className="mx-auto h-10 w-44 border-b-2 border-slate-400" />
            <p className="mt-2 text-xs font-bold text-slate-700">Customer Acknowledgment</p>
          </div>
          <div className="text-center">
            <div className="mx-auto h-10 w-44 border-b-2 border-slate-400" />
            <p className="mt-2 text-xs font-bold text-slate-700">Authorized Signatory (Store Stamp)</p>
          </div>
        </div>

        {/* Bottom Timestamp & Stamp */}
        <div className="mt-8 border-t border-slate-200 pt-3 flex items-center justify-between text-[10px] text-slate-400">
          <span>Smart Business Suite ERP · Verified Tax Document</span>
          <span>Generated: {new Date().toLocaleString("en-IN")}</span>
          <span>Page 1 of 1</span>
        </div>
      </div>
    </div>
  );
}