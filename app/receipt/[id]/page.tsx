import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import PrintButton from "@/components/receipt/print-button";
import { generateUpiString, generateQrDataUrl } from "@/lib/qr";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({
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
        note: "Inv " + invoice.invoice_number,
      })
    : "";

  const qrDataUrl = upiString ? await generateQrDataUrl(upiString, { width: 140 }) : "";

  return (
    <div className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0">
      <style>{`
        @page { size: 80mm auto; margin: 3mm; }
        @media print {
          body { background: #fff !important; color: #000 !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
      <div className="mx-auto max-w-[340px] rounded-2xl border border-slate-200 bg-white p-5 shadow-lg print:max-w-none print:rounded-none print:border-none print:p-0 print:shadow-none">
        <div className="mb-4 flex items-center justify-between gap-2 border-b border-slate-100 pb-3 print:hidden">
          <div>
            <h1 className="text-sm font-bold text-slate-900">Receipt (80mm)</h1>
            <p className="text-[11px] text-slate-500">#{invoice.invoice_number}</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`/receipt/${id}/a4`}
              target="_blank"
              className="inline-flex items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100"
            >
              📄 Invoice (A4)
            </a>
            <PrintButton />
          </div>
        </div>

        <div className="font-mono text-xs leading-relaxed text-slate-900">
          <div className="text-center">
            <p className="text-base font-black tracking-tight">
              {settings?.shop_name || "Sarkar Communication"}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Smart Business Suite</p>
            {settings?.address && <p className="mt-0.5 text-[11px]">{settings.address}</p>}
            <p className="text-[11px]">
              {settings?.phone && <span>Ph: {settings.phone}</span>}
              {settings?.phone && settings?.email && <span> · </span>}
              {settings?.email && <span>{settings.email}</span>}
            </p>
            {settings?.gstin && <p className="text-[11px] font-bold">GSTIN: {settings.gstin}</p>}
          </div>

          <div className="my-2 border-t-2 border-dashed border-slate-400" />
          <div className="flex justify-between items-center text-[11px]">
            <span className="font-bold">RECEIPT / BILL</span>
            <span className="font-bold font-mono">#{invoice.invoice_number}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-600">Date:</span>
            <span>{invoice.invoice_date}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-600">Customer:</span>
            <span className="font-bold">{invoice.customers?.name || "Walk-in Customer"}</span>
          </div>
          {invoice.customers?.phone && (
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-600">Phone:</span>
              <span>{invoice.customers.phone}</span>
            </div>
          )}

          <div className="my-2 border-t border-dashed border-slate-300" />

          {/* Items Table Header */}
          <div className="flex justify-between font-bold text-[11px] pb-1 border-b border-slate-300">
            <span className="flex-1">ITEM</span>
            <span className="w-12 text-center">QTY</span>
            <span className="w-16 text-right">AMOUNT</span>
          </div>

          {/* Items List */}
          <div className="py-1 space-y-1">
            {itemsRows.map((it, idx) => {
              const name = it.products?.name || it.services?.name || it.description || "Item";
              return (
                <div key={it.id || idx} className="text-[11px]">
                  <div className="font-medium text-slate-900">{name}</div>
                  <div className="flex justify-between text-slate-600 pl-2">
                    <span>
                      {Number(it.qty)} x {money(it.rate)}
                    </span>
                    <span className="font-bold text-slate-900">{money(it.amount)}</span>
                  </div>
                </div>
              );
            })}
            {itemsRows.length === 0 && (
              <p className="py-2 text-center text-slate-400">No items recorded</p>
            )}
          </div>

          <div className="my-2 border-t-2 border-dashed border-slate-400" />

          {/* Financial Totals */}
          <div className="space-y-0.5 text-[11px]">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal:</span>
              <span>{money(invoice.subtotal)}</span>
            </div>

            {Number(invoice.discount || 0) > 0 && (
              <div className="flex justify-between text-emerald-700 font-bold">
                <span>Discount:</span>
                <span>- {money(invoice.discount)}</span>
              </div>
            )}

            <div className="flex justify-between text-sm font-black pt-1 border-t border-slate-300">
              <span>TOTAL:</span>
              <span>{money(invoice.total)}</span>
            </div>

            <div className="flex justify-between font-bold pt-0.5">
              <span>Amount Paid:</span>
              <span className="text-emerald-700">{money(invoice.paid)}</span>
            </div>

            {Number(invoice.due || 0) > 0 && (
              <div className="flex justify-between font-bold text-amber-700 border-t border-slate-200 pt-0.5">
                <span>Balance Due:</span>
                <span>{money(invoice.due)}</span>
              </div>
            )}
          </div>

          {/* Payment breakdown */}
          {paymentsRows.length > 0 && (
            <>
              <div className="my-2 border-t border-dashed border-slate-300" />
              <div className="space-y-0.5 text-[10px]">
                <span className="font-bold text-slate-600">TENDERED:</span>
                {paymentsRows.map((p, idx) => (
                  <div key={idx} className="flex justify-between pl-2">
                    <span>• {String(p.method).toUpperCase()}</span>
                    <span>{money(p.amount)}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Dynamic UPI QR Code */}
          {qrDataUrl && (
            <>
              <div className="my-2.5 border-t-2 border-dashed border-slate-400" />
              <div className="flex flex-col items-center justify-center text-center py-1 bg-slate-50/70 rounded-xl p-2.5">
                <img
                  src={qrDataUrl}
                  alt="Scan to Pay via UPI"
                  className="h-28 w-28 object-contain rounded-lg border border-slate-300 bg-white p-1"
                />
                <p className="mt-1.5 font-black text-[11px] tracking-wider text-slate-900">
                  SCAN &amp; PAY VIA UPI
                </p>
                <p className="text-[10px] font-bold text-emerald-800">
                  Amount: {money(targetAmount)}
                </p>
                {upiId && <p className="text-[9px] font-mono text-slate-600 truncate max-w-full">UPI: {upiId}</p>}
                <p className="text-[8px] text-slate-500">Google Pay · PhonePe · Paytm · BHIM</p>
              </div>
            </>
          )}

          {/* Footer message */}
          {settings?.receipt_footer && (
            <>
              <div className="my-2 border-t border-dashed border-slate-300" />
              <div className="text-center text-[10px] text-slate-600 whitespace-pre-line">
                {settings.receipt_footer}
              </div>
            </>
          )}

          <div className="mt-2 text-center text-[9px] text-slate-400">
            *** Thank You! Visit Again ***
          </div>
        </div>
      </div>
    </div>
  );
}
