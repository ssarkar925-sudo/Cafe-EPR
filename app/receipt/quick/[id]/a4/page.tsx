import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import A4Actions from "@/components/pdf/a4-actions";
import AutoPrint from "@/components/receipt/auto-print";
import { generateUpiString, generateQrDataUrl } from "@/lib/qr";
import { numberToWordsInr } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function QuickReceiptA4Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  let saleQuery = supabase.from("quick_sales").select("*, customers(name, phone, address)");
  if (isUuid) {
    saleQuery = saleQuery.eq("id", id);
  } else {
    saleQuery = saleQuery.eq("sale_number", id);
  }
  const { data: sale } = await saleQuery.maybeSingle();
  if (!sale) notFound();

  const saleId = sale.id;
  const { data: items } = await supabase
    .from("quick_sale_items")
    .select("*, products(name, unit), services(name)")
    .eq("quick_sale_id", saleId);
  const { data: settings } = await supabase.from("settings").select("*").single();
  const { data: defaultMerchantQr } = await supabase
    .from("upi_merchant_qrs")
    .select("upi_id, display_name")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const { data: upiInstrument } = await supabase
    .from("payment_instruments")
    .select("name, details")
    .eq("type", "upi")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const cur = settings?.currency_symbol || "₹";
  const money = (n: number | string | undefined | null) =>
    cur + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const rawItems = (items ?? []) as any[];
  const itemsRows =
    rawItems.length > 0
      ? rawItems.map((it) => ({
          ...it,
          description: it.products?.name || it.services?.name || it.description || sale.item_name || "Quick Sale Item",
          amount: Number(it.amount || it.rate || sale.amount),
        }))
      : [
          {
            id: "1",
            description: sale.item_name || "Retail Counter Sale",
            qty: 1,
            rate: Number(sale.amount),
            amount: Number(sale.amount),
          },
        ];

  const paymentsRows =
    sale.payments && Array.isArray(sale.payments) && sale.payments.length > 0
      ? sale.payments
      : [{ method: sale.payment_method || "cash", amount: Number(sale.amount) }];

  const shopInitial = (settings?.shop_name || "S").charAt(0).toUpperCase();
  const upiId = (settings as any)?.upi_id || defaultMerchantQr?.upi_id || (upiInstrument?.details as any)?.upi_id || "";
  const targetAmount = Number(sale.amount || 0);
  const upiString = upiId
    ? generateUpiString({
        upiId,
        name: settings?.shop_name || "Shop",
        amount: targetAmount,
        note: "Quick Sale " + sale.sale_number,
      })
    : "";
  const qrDataUrl = upiString ? await generateQrDataUrl(upiString, { width: 140 }) : "";

  const invoiceAdapter = {
    id: sale.id,
    invoice_number: sale.sale_number,
    invoice_date: sale.sale_date,
    total: Number(sale.amount),
    subtotal: Number(sale.amount),
    discount: 0,
    paid: Number(sale.amount),
    due: 0,
    status: "paid",
    customers: sale.customers,
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0">
      <AutoPrint />
      <style>{`@page { size: A4; margin: 8mm; } @media print { body { background: #fff !important; color: #000 !important; } .print\\:hidden { display: none !important; } }`}</style>
      <div className="mx-auto max-w-[820px] rounded-2xl border border-slate-200 bg-white p-6 shadow-lg print:max-w-none print:rounded-none print:border-none print:p-0 print:shadow-none a4-print-card">
        <A4Actions
          variant="invoice"
          invoiceId={sale.id}
          data={{
            invoice: invoiceAdapter,
            items: itemsRows,
            payments: paymentsRows,
            settings,
            qrDataUrl,
            upiId,
          }}
          filename={`Invoice-${sale.sale_number}.pdf`}
          receiptUrl={`/receipt/quick/${sale.id}`}
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
                  Smart Business Suite · Retail &amp; Quick Sale
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
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-300">
                ✓ FULLY PAID
              </span>
              <p className="mt-1.5 text-lg font-black tracking-tight text-slate-900 print:text-base">
                TAX INVOICE (QUICK SALE)
              </p>
              <p className="font-mono text-xs font-bold text-slate-800">#{sale.sale_number}</p>
              <p className="text-[11px] text-slate-500">Date: {sale.sale_date}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 print:mt-3 print:gap-2.5">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 print:p-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Billed To (Customer)</p>
            <p className="mt-0.5 text-sm font-bold text-slate-900">{sale.customers?.name || "Walk-in Customer"}</p>
            {sale.customers?.phone && (
              <p className="text-xs text-slate-600 print:text-[11px]">Phone: {sale.customers.phone}</p>
            )}
            {sale.customers?.address && (
              <p className="text-xs text-slate-600 print:text-[11px]">Address: {sale.customers.address}</p>
            )}
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 print:p-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Invoice Details</p>
            <div className="mt-0.5 space-y-0.5 text-xs print:text-[11px] text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500">Sale Date:</span>
                <span className="font-semibold text-slate-900">{sale.sale_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Mode:</span>
                <span className="font-semibold uppercase text-slate-900">
                  {paymentsRows.map((p: any) => String(p.method).toUpperCase()).join(", ")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                <span className="font-semibold uppercase text-emerald-700">PAID</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto print:mt-3">
          <table className="w-full text-left text-xs print:text-[11px]">
            <thead>
              <tr className="border-y border-slate-900 bg-slate-900 text-white font-bold">
                <th className="w-10 py-2 pl-3 pr-2 text-center print:py-1.5">#</th>
                <th className="px-3 py-2 print:py-1.5">Item Description</th>
                <th className="w-16 px-3 py-2 text-center print:py-1.5">Qty</th>
                <th className="w-24 px-3 py-2 text-right print:py-1.5">Rate</th>
                <th className="w-28 py-2 pl-3 pr-4 text-right print:py-1.5">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {itemsRows.map((it: any, idx: number) => (
                <tr key={it.id || idx} className={idx % 2 === 1 ? "bg-slate-50/50" : "bg-white"}>
                  <td className="py-2 pl-3 pr-2 text-center font-mono text-slate-400 print:py-1.5">{idx + 1}</td>
                  <td className="px-3 py-2 print:py-1.5">
                    <span className="font-bold text-slate-900">{it.description || "Item"}</span>
                  </td>
                  <td className="px-3 py-2 text-center font-medium text-slate-700 print:py-1.5">{Number(it.qty || 1)}</td>
                  <td className="px-3 py-2 text-right text-slate-600 print:py-1.5">{money(it.rate || it.amount)}</td>
                  <td className="py-2 pl-3 pr-4 text-right font-bold text-slate-900 print:py-1.5">{money(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid grid-cols-1 items-start gap-4 md:grid-cols-2 print:mt-3 print:gap-3">
          <div className="space-y-2.5 print:space-y-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 print:p-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Amount in Words:</p>
              <p className="mt-0.5 text-xs font-bold text-slate-900 print:text-[11px]">
                {numberToWordsInr(Number(sale.amount))}
              </p>
            </div>
            {qrDataUrl && (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-2.5 print:p-2">
                <img
                  src={qrDataUrl}
                  alt="Scan to Pay via UPI"
                  className="h-16 w-16 shrink-0 rounded-lg border border-emerald-300 bg-white p-1 shadow-sm print:h-14 print:w-14"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-emerald-900 print:text-[11px]">Digital Invoice Verification</p>
                  <p className="text-[10px] text-emerald-700">Google Pay · PhonePe · Paytm · BHIM</p>
                  {upiId && <p className="mt-0.5 truncate font-mono text-[11px] font-bold text-blue-700">UPI ID: {upiId}</p>}
                </div>
              </div>
            )}
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm print:p-2.5">
            <div className="space-y-1.5 text-xs print:text-[11px]">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-semibold text-slate-900">{money(sale.amount)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t-2 border-slate-900 pt-1.5 text-sm font-black text-slate-900">
                <span>Grand Total</span>
                <span>{money(sale.amount)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Paid</span>
                <span className="font-semibold text-emerald-700">{money(sale.amount)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 border-t border-slate-200 pt-3 text-center print:mt-3">
          <p className="text-xs font-semibold text-slate-700">Thank you for your business.</p>
          <p className="mt-1 text-[10px] text-slate-400">This is a computer-generated invoice.</p>
        </div>
      </div>
    </div>
  );
}
