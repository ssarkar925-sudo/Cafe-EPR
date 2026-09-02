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

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  let invQuery = supabase.from("invoices").select("*, customers(name, phone, address, code)");
  if (isUuid) {
    invQuery = invQuery.eq("id", id);
  } else {
    invQuery = invQuery.eq("invoice_number", id);
  }
  const { data: invoice } = await invQuery.maybeSingle();
  if (!invoice) notFound();

  const invoiceId = invoice.id;
  const { data: items } = await supabase
    .from("invoice_items")
    .select("*, products(name, code), services(name)")
    .eq("invoice_id", invoiceId);
  const { data: payments } = await supabase
    .from("payments")
    .select("method, amount, received_at")
    .eq("invoice_id", invoiceId);
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

  const upiId =
    (settings as any)?.upi_id ||
    defaultMerchantQr?.upi_id ||
    upiInstrument?.account_number ||
    "";

  // A paid invoice is already settled; show the customer payment QR only when money remains due.
  const targetAmount = Number(invoice.due) > 0 ? Number(invoice.due) : Number(invoice.total);
  const upiString = isDue && upiId
    ? generateUpiString({
        upiId,
        name: settings?.shop_name || "Shop",
        amount: targetAmount,
        note: "Inv " + invoice.invoice_number,
      })
    : "";

  const qrDataUrl = upiString ? await generateQrDataUrl(upiString, { width: 140 }) : "";

  return (
    <div className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0">
      <style>{`
        @page { size: A4; margin: 8mm; }
        @media print {
          body { background: #fff !important; color: #000 !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
      <div className="mx-auto max-w-[820px] rounded-2xl border border-slate-200 bg-white p-6 shadow-lg print:max-w-none print:rounded-none print:border-none print:p-0 print:shadow-none a4-print-card">
        <A4Actions
          variant="invoice"
          data={{
            invoice,
            items: itemsRows,
            payments: paymentsRows,
            settings,
            qrDataUrl,
            upiId,
          }}
          filename={`Invoice-${invoice.invoice_number}.pdf`}
          receiptUrl={`/receipt/${invoiceId}`}
        />

        <div className="border-b border-slate-200 pb-4 print:pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-lg font-black text-white print:h-9 print:w-9">
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

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 print:mt-3 print:gap-2.5">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 print:p-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Billed To (Customer)</p>
            <p className="mt-0.5 text-sm font-bold text-slate-900">{invoice.customers?.name || "Walk-in Customer"}</p>
            {invoice.customers?.phone && <p className="text-xs text-slate-600 print:text-[11px]">Phone: {invoice.customers.phone}</p>}
            {invoice.customers?.address && <p className="text-xs text-slate-600 print:text-[11px]">Address: {invoice.customers.address}</p>}
            {invoice.customer_gstin && <p className="text-xs font-mono font-bold text-blue-700 print:text-[11px]">GSTIN: {invoice.customer_gstin}</p>}
            {invoice.customers?.code && <p className="text-[10px] font-mono text-slate-400">Customer ID: {invoice.customers.code}</p>}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 print:p-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Invoice &amp; Supply Details</p>
            <div className="mt-0.5 space-y-0.5 text-xs print:text-[11px] text-slate-700">
              <div className="flex justify-between"><span className="text-slate-500">Invoice Date:</span><span className="font-semibold text-slate-900">{invoice.invoice_date}</span></div>
              {invoice.place_of_supply && <div className="flex justify-between"><span className="text-slate-500">Place of Supply:</span><span className="font-semibold text-slate-900">{invoice.place_of_supply}</span></div>}
              {invoice.supply_type && <div className="flex justify-between"><span className="text-slate-500">Supply Type:</span><span className="font-semibold uppercase text-slate-900">{invoice.supply_type.replace("_", " ")}</span></div>}
              <div className="flex justify-between"><span className="text-slate-500">Payment Modes:</span><span className="font-semibold text-slate-900">{paymentsRows.length > 0 ? paymentsRows.map((p) => String(p.method).toUpperCase()).join(", ") : "CASH"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Settlement Status:</span><span className="font-semibold uppercase text-slate-900">{invoice.status || "COMPLETED"}</span></div>
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto print:mt-3">
          <table className="w-full text-left text-xs print:text-[11px]">
            <thead><tr className="border-y border-slate-900 bg-slate-900 text-white font-bold">
              <th className="w-10 py-2 pl-3 pr-2 text-center print:py-1.5">#</th>
              <th className="px-3 py-2 print:py-1.5">Item Description</th>
              <th className="w-16 px-3 py-2 text-center print:py-1.5">Qty</th>
              <th className="w-24 px-3 py-2 text-right print:py-1.5">Rate</th>
              <th className="w-28 py-2 pl-3 pr-4 text-right print:py-1.5">Amount</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {itemsRows.map((it, idx) => {
                const itemName = it.products?.name || it.services?.name || it.description || "Item";
                const itemCode = it.products?.code ? "[" + it.products.code + "] " : "";
                return <tr key={it.id || idx} className={idx % 2 === 1 ? "bg-slate-50/50" : "bg-white"}>
                  <td className="py-2 pl-3 pr-2 text-center font-mono text-slate-400 print:py-1.5">{idx + 1}</td>
                  <td className="px-3 py-2 print:py-1.5"><span className="font-bold text-slate-900">{itemName}</span>{itemCode && <span className="ml-1 font-mono text-[10px] text-slate-400">{itemCode}</span>}</td>
                  <td className="px-3 py-2 text-center font-medium text-slate-700 print:py-1.5">{Number(it.qty)}</td>
                  <td className="px-3 py-2 text-right text-slate-600 print:py-1.5">{money(it.rate)}</td>
                  <td className="py-2 pl-3 pr-4 text-right font-bold text-slate-900 print:py-1.5">{money(it.amount)}</td>
                </tr>;
              })}
              {itemsRows.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-slate-400">No line items recorded on this invoice</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid grid-cols-1 items-start gap-4 md:grid-cols-2 print:mt-3 print:gap-3">
          <div className="space-y-2.5 print:space-y-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 print:p-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Amount in Words:</p>
              <p className="mt-0.5 text-xs font-bold text-slate-900 print:text-[11px]">{numberToWordsInr(Number(invoice.total))}</p>
            </div>

            {qrDataUrl && (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-2.5 print:p-2">
                <img src={qrDataUrl} alt="Scan to Pay via UPI" className="h-16 w-16 shrink-0 rounded-lg border border-emerald-300 bg-white p-1 shadow-sm print:h-14 print:w-14" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-emerald-900 print:text-[11px]">Scan &amp; Pay via Any UPI App</p>
                  <p className="text-[10px] text-emerald-700">Google Pay · PhonePe · Paytm · BHIM</p>
                  {upiId && <p className="mt-0.5 truncate font-mono text-[11px] font-bold text-blue-700">UPI ID: {upiId}</p>}
                  <p className="text-[10px] text-emerald-800">Amount: <span className="font-bold">{money(targetAmount)}</span></p>
                </div>
              </div>
            )}

            {paymentsRows.length > 0 && (
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 print:p-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment Breakdown</p>
                <div className="mt-1 space-y-0.5 text-xs print:text-[11px]">
                  {paymentsRows.map((p, idx) => <div key={idx} className="flex items-center justify-between text-slate-700"><span className="font-medium">• {String(p.method).toUpperCase()}{p.received_at ? " (" + new Date(p.received_at).toLocaleDateString("en-IN") + ")" : ""}</span><span className="font-bold text-slate-900">{money(p.amount)}</span></div>)}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm print:p-2.5">
            <div className="space-y-1.5 text-xs print:text-[11px]">
              <div className="flex justify-between text-slate-600"><span>Subtotal</span><span className="font-semibold text-slate-900">{money(invoice.subtotal)}</span></div>
              {Number(invoice.discount || 0) > 0 && <div className="flex justify-between font-bold text-emerald-700"><span>Discount Savings</span><span>- {money(invoice.discount)}</span></div>}
              <div className="flex items-center justify-between rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-black text-white print:py-2"><span>Grand Total</span><span>{money(invoice.total)}</span></div>
              <div className="flex justify-between text-slate-600"><span>Paid</span><span className="font-semibold text-emerald-700">{money(invoice.paid)}</span></div>
              <div className="flex justify-between font-bold text-amber-700"><span>Balance Due</span><span>{money(invoice.due)}</span></div>
              {Number(invoice.returned || 0) > 0 && <div className="flex justify-between text-rose-600"><span>Returned</span><span>- {money(invoice.returned)}</span></div>}
              {Number(invoice.refunded || 0) > 0 && <div className="flex justify-between text-violet-600"><span>Refunded</span><span>- {money(invoice.refunded)}</span></div>}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-8 print:mt-4 print:gap-6">
          <div className="text-center">
            <div className="mx-auto h-8 w-40 border-b border-slate-400" />
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Customer Signature</p>
          </div>
          <div className="text-center">
            <div className="mx-auto h-8 w-40 border-b border-slate-400" />
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Authorized Signature</p>
          </div>
        </div>

        <div className="mt-4 border-t border-slate-200 pt-2 text-center text-[10px] text-slate-400 print:mt-3">
          Thank you for your business · Computer-generated invoice
        </div>
      </div>
    </div>
  );
}
