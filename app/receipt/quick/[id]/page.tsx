import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import PrintButton from "@/components/receipt/print-button";
import { generateUpiString, generateQrDataUrl } from "@/lib/qr";

export const dynamic = "force-dynamic";

export default async function QuickReceiptPage({
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
    .select("upi_id")
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
  const paymentsRows = (sale.payments ?? []) as any[];
  const itemsCount = itemsRows.reduce((s, it) => s + Number(it.qty || 0), 0);

  // UPI QR Code calculation
  const upiId =
    (settings as any)?.upi_id ||
    defaultMerchantQr?.upi_id ||
    upiInstrument?.account_number ||
    "";

  const upiString = upiId
    ? generateUpiString({
        upiId,
        name: settings?.shop_name || "Shop",
        amount: Number(sale.amount),
        note: `Receipt ${sale.sale_number}`,
      })
    : "";

  const qrDataUrl = upiString ? await generateQrDataUrl(upiString, { width: 140 }) : "";

  return (
    <div className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0">
      <style>{`
        @page { size: 80mm auto; margin: 4mm; }
        @media print { body { background: #fff !important; } }
      `}</style>
      <div className="mx-auto max-w-sm rounded-lg bg-white p-4 shadow print:max-w-none print:rounded-none print:shadow-none">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <h1 className="text-lg font-semibold text-slate-900">Quick Sale Receipt</h1>
          <PrintButton />
        </div>

        <div className="font-mono text-xs leading-relaxed text-slate-900">
          <div className="text-center">
            <p className="text-sm font-bold">{settings?.shop_name || "Shop"}</p>
            {settings?.address && <p>{settings.address}</p>}
            {settings?.phone && <p>Ph: {settings.phone}</p>}
            {settings?.gstin && <p>GSTIN: {settings.gstin}</p>}
          </div>

          <div className="my-2 border-t border-dashed border-slate-400" />
          <div className="flex justify-between">
            <span>Quick Sale</span>
            <span>{sale.sale_number}</span>
          </div>
          <div className="flex justify-between">
            <span>Date</span>
            <span>{sale.sale_date}</span>
          </div>
          <div className="flex justify-between">
            <span>Customer</span>
            <span>{sale.customers?.name || "Walk-in"}</span>
          </div>

          <div className="my-2 border-t border-dashed border-slate-400" />
          {itemsRows.map((it) => (
            <div key={it.id} className="mb-1">
              <p>{it.products?.name || it.services?.name || it.item_name || "Item"}</p>
              <div className="flex justify-between">
                <span className="pl-3">
                  {it.qty} x {money(it.rate)}
                </span>
                <span>{money(it.amount)}</span>
              </div>
            </div>
          ))}

          <div className="my-2 border-t border-dashed border-slate-400" />
          <div className="flex justify-between">
            <span>Items</span>
            <span>{itemsCount}</span>
          </div>
          <div className="flex justify-between text-sm font-bold">
            <span>TOTAL</span>
            <span>{money(sale.amount)}</span>
          </div>

          {paymentsRows.length > 0 && (
            <div className="my-2 border-t border-dashed border-slate-400" />
          )}
          {paymentsRows.map((p, i) => (
            <div key={i} className="flex justify-between">
              <span>{String(p.method ?? "cash").toUpperCase()}</span>
              <span>{money(Number(p.amount) || 0)}</span>
            </div>
          ))}

          {Number(sale.tendered) > 0 && (
            <>
              <div className="flex justify-between">
                <span>Cash tendered</span>
                <span>{money(sale.tendered)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Change</span>
                <span>{money(sale.change_due)}</span>
              </div>
            </>
          )}

          {sale.status === "cancelled" && (
            <p className="mt-2 rounded border border-rose-300 bg-rose-50 p-1 text-center font-bold text-rose-600">
              CANCELLED
            </p>
          )}

          {qrDataUrl && (
            <>
              <div className="my-2 border-t border-dashed border-slate-400" />
              <div className="flex flex-col items-center justify-center text-center py-1">
                <img
                  src={qrDataUrl}
                  alt="Scan to Pay via UPI"
                  className="h-28 w-28 object-contain"
                />
                <p className="mt-1 font-bold text-[11px]">SCAN &amp; PAY VIA UPI</p>
                {upiId && <p className="text-[10px] text-slate-600">UPI: {upiId}</p>}
                <p className="text-[9px] text-slate-500">GPay · PhonePe · Paytm · BHIM</p>
              </div>
            </>
          )}

          {settings?.receipt_footer && (
            <>
              <div className="my-2 border-t border-dashed border-slate-400" />
              <div className="text-center">{settings.receipt_footer}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}