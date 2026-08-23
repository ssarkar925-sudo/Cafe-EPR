import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
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
  const supabase = createAdminClient();

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
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 print:min-h-0 print:bg-white print:p-0">
      <style>{`
        @page {
          size: A4 portrait;
          margin: 8mm 10mm;
        }
        @media print {
          html, body {
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          .a4-print-card {
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: avoid !important;
          }
        }
      `}</style>

      <div className="a4-print-card mx-auto max-w-[820px] rounded-2xl border border-slate-200 bg-white p-8 md:p-10 shadow-xl print:max-w-none print:rounded-none print:border-none print:p-0 print:shadow-none">
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
        <div className="relative border-b-2 border-slate-900 pb-4 print:pb-3">
          <div className="flex flex-wrap items-start justify-between gap-4 print:gap-2">
            <div className="flex items-start gap-3.5 print:gap-2.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-base font-black text-white shadow-md print:h-9 print:w-9 print:text-sm">
                {shopInitial}
              </div>
              <div>
                <p className="text-xl font-black tracking-tight text-slate-900 print:text-lg">
                  {settings?.shop_name || "Sarkar Communication"}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">
                  Smart Business Suite · Retail &amp; Digital Services
                </p>
                {settings?.address && <p className="mt-0.5 text-xs text-slate-600 print:text-[11px]">{settings.address}</p>}
                <p className="text-xs text-slate-600 print:text-[11px]">
                  {settings?.phone && <span>Ph: {settings.phone}</span>}
                  {settings?.phone && settings?.email && <span> · </span>}
                  {settings?.email && <span>Email: {settings.email}</span>}
                </p>
                {settings?.tax_id && (
                  <p className="text-xs font-mono font-medium text-slate-700 print:text-[11px]">
                    GSTIN / Tax ID: <span className="font-semibold">{settings.tax_id}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="text-right">
              {isPaid && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-300">
                  ✓ FULLY PAID
                </span>
              )}
              {isDue && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 ring-1 ring-amber-300">
                  ⚠ BALANCE DUE: {money(invoice.due)}
                </span>
              )}
              {isCancelled && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800">
                  CANCELLED
                </span>
              )}

              <p className="mt-1.5 text-lg font-black tracking-tight text-slate-900 print:text-base">TAX INVOICE</p>
              <p className="font-mono text-xs font-bold text-slate-800">#{invoice.invoice_number}</p>
              <p className="text-[11px] text-slate-500">Date: {invoice.invoice_date}</p>
            </div>
          </div>
        </div>

        {/* Metadata Cards: Customer Bill To & Payment Info */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 print:mt-3 print:gap-2.5">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 print:p-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Billed To (Customer)</p>
            <p className="mt-0.5 text-sm font-bold text-slate-900">
              {invoice.customers?.name || "Walk-in Customer"}
            </p>
            {invoice.customers?.phone && (
              <p className="text-xs text-slate-600 print:text-[11px]">Phone: {invoice.customers.phone}</p>
            )}
            {invoice.customers?.address && (
              <p className="text-xs text-slate-600 print:text-[11px]">Address: {invoice.customers.address}</p>
            )}
            {invoice.customers?.code && (
              <p className="text-[10px] font-mono text-slate-400">Customer ID: {invoice.customers.code}</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 print:p-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Invoice &amp; Settlement Details</p>
            <div className="mt-0.5 space-y-0.5 text-xs print:text-[11px] text-slate-700">
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
        <div className="mt-4 overflow-x-auto print:mt-3">
          <table className="w-full text-left text-xs print:text-[11px]">
            <thead>
              <tr className="border-y border-slate-900 bg-slate-900 text-white font-bold">
                <th className="py-2 pl-3 pr-2 w-10 text-center print:py-1.5">#</th>
                <th className="py-2 px-3 print:py-1.5">Item Description</th>
                <th className="py-2 px-3 text-center w-16 print:py-1.5">Qty</th>
                <th className="py-2 px-3 text-right w-24 print:py-1.5">Rate</th>
                <th className="py-2 pl-3 pr-4 text-right w-28 print:py-1.5">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {itemsRows.map((it, idx) => {
                const itemName = it.products?.name || it.services?.name || it.description || "Item";
                const itemCode = it.products?.code ? "[" + it.products.code + "] " : "";
                return (
                  <tr key={it.id || idx} className={idx % 2 === 1 ? "bg-slate-50/50" : "bg-white"}>
                    <td className="py-2 pl-3 pr-2 text-center text-slate-400 font-mono print:py-1.5">{idx + 1}</td>
                    <td className="py-2 px-3 print:py-1.5">
                      <span className="font-bold text-slate-900">{itemName}</span>
                      {itemCode && <span className="ml-1 font-mono text-[10px] text-slate-400">{itemCode}</span>}
                    </td>
                    <td className="py-2 px-3 text-center font-medium text-slate-700 print:py-1.5">{Number(it.qty)}</td>
                    <td className="py-2 px-3 text-right text-slate-600 print:py-1.5">{money(it.rate)}</td>
                    <td className="py-2 pl-3 pr-4 text-right font-bold text-slate-900 print:py-1.5">{money(it.amount)}</td>
                  </tr>
                );
              })}
              {itemsRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-400">
                    No line items recorded on this invoice
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom Section: Left (Words, QR, Payments) vs Right (Financial Summary) */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-start print:mt-3 print:gap-3">
          <div className="space-y-2.5 print:space-y-2">
            {/* Amount in words */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 print:p-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Amount in Words:</p>
              <p className="mt-0.5 text-xs font-bold text-slate-900 print:text-[11px]">{numberToWordsInr(totalNum)}</p>
            </div>

            {/* UPI QR Payment Block */}
            {qrDataUrl && (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-2.5 print:p-2">
                <img
                  src={qrDataUrl}
                  alt="Scan to Pay via UPI"
                  className="h-16 w-16 shrink-0 rounded-lg border border-emerald-300 bg-white p-1 shadow-sm print:h-14 print:w-14"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-emerald-900 print:text-[11px]">Scan &amp; Pay via Any UPI App</p>
                  <p className="text-[10px] text-emerald-700">Google Pay · PhonePe · Paytm · BHIM</p>
                  {upiId && (
                    <p className="mt-0.5 font-mono text-[11px] font-bold text-blue-700 truncate">
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
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 print:p-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment Breakdown</p>
                <div className="mt-1 space-y-0.5 text-xs print:text-[11px]">
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
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm print:p-2.5">
            <div className="space-y-1.5 text-xs print:text-[11px]">
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

              <div className="flex justify-between items-center rounded-lg bg-slate-900 px-3 py-2 text-white font-bold text-xs print:py-1.5">
                <span>Grand Total</span>
                <span className="text-sm font-black">{money(invoice.total)}</span>
              </div>

              <div className="flex justify-between text-slate-700 pt-0.5">
                <span>Amount Paid</span>
                <span className="font-bold text-emerald-700">{money(invoice.paid)}</span>
              </div>

              {Number(invoice.due || 0) > 0 && (
                <div className="flex justify-between text-amber-800 font-bold border-t border-slate-200 pt-1">
                  <span>Balance Due</span>
                  <span className="text-xs">{money(invoice.due)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Receipt Note */}
        {settings?.receipt_footer && (
          <div className="mt-4 rounded-lg bg-slate-50 p-2 text-center text-[11px] text-slate-500 print:mt-2.5 print:p-1.5">
            {settings.receipt_footer}
          </div>
        )}

        {/* Dual Signatures */}
        <div className="mt-6 grid grid-cols-2 gap-8 border-t border-dashed border-slate-300 pt-4 print:mt-4 print:pt-3">
          <div className="text-center">
            <div className="mx-auto h-6 w-36 border-b border-slate-400 print:h-4" />
            <p className="mt-1 text-[11px] font-bold text-slate-700">Customer Acknowledgment</p>
          </div>
          <div className="text-center">
            <div className="mx-auto h-6 w-36 border-b border-slate-400 print:h-4" />
            <p className="mt-1 text-[11px] font-bold text-slate-700">Authorized Signatory (Store Stamp)</p>
          </div>
        </div>

        {/* Bottom Timestamp & Stamp */}
        <div className="mt-4 border-t border-slate-200 pt-2 flex items-center justify-between text-[9px] text-slate-400 print:mt-2">
          <span>Smart Business Suite ERP · Verified Tax Document</span>
          <span>Generated: {new Date().toLocaleString("en-IN")}</span>
          <span>Page 1 of 1</span>
        </div>
      </div>
    </div>
  );
}