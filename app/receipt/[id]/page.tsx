import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "@/components/receipt/print-button";
import AutoPrint from "@/components/receipt/auto-print";
import { generateUpiString, generateQrDataUrl } from "@/lib/qr";

export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();
  let invoice: any;
  let items: any[] = [];
  let payments: any[] = [];

  const invoiceResult = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (invoiceResult.error) throw new Error(`Receipt invoice lookup failed: ${invoiceResult.error.message}`);

  if (invoiceResult.data) {
    invoice = invoiceResult.data;
    if (invoice.customer_id) {
      const customerResult = await supabase.from("customers").select("name, phone, address, code").eq("id", invoice.customer_id).maybeSingle();
      if (customerResult.error) throw new Error(`Receipt customer lookup failed: ${customerResult.error.message}`);
      invoice.customers = customerResult.data || null;
    }
    const [itemsResult, paymentsResult] = await Promise.all([
      supabase.from("invoice_items").select("*, products(name, code), services(name)").eq("invoice_id", id).order("created_at", { ascending: true }),
      supabase.from("payments").select("method, amount, received_at").eq("invoice_id", id).order("received_at", { ascending: true }),
    ]);
    if (itemsResult.error) throw new Error(`Receipt item lookup failed: ${itemsResult.error.message}`);
    if (paymentsResult.error) throw new Error(`Receipt payment lookup failed: ${paymentsResult.error.message}`);
    items = itemsResult.data || [];
    payments = paymentsResult.data || [];
  } else {
    const quickResult = await supabase.from("quick_sales").select("*").eq("id", id).maybeSingle();
    if (quickResult.error) throw new Error(`Historical receipt lookup failed: ${quickResult.error.message}`);
    if (!quickResult.data) notFound();
    const quickSale = quickResult.data;
    let customer: any = null;
    if (quickSale.customer_id) {
      const customerResult = await supabase.from("customers").select("name, phone, address, code").eq("id", quickSale.customer_id).maybeSingle();
      if (customerResult.error) throw new Error(`Historical receipt customer lookup failed: ${customerResult.error.message}`);
      customer = customerResult.data || null;
    }
    const [itemsResult, paymentsResult] = await Promise.all([
      supabase.from("quick_sale_items").select("*, products(name, unit), services(name)").eq("quick_sale_id", id),
      supabase.from("payments").select("method, amount, received_at").eq("invoice_id", id).order("received_at", { ascending: true }),
    ]);
    if (itemsResult.error) throw new Error(`Historical receipt item lookup failed: ${itemsResult.error.message}`);
    if (paymentsResult.error) throw new Error(`Historical receipt payment lookup failed: ${paymentsResult.error.message}`);
    invoice = { id: quickSale.id, invoice_number: quickSale.sale_number, invoice_date: quickSale.sale_date, subtotal: quickSale.amount, discount: 0, total: quickSale.amount, paid: quickSale.amount, due: 0, status: "paid", customers: customer };
    items = itemsResult.data?.length ? itemsResult.data : [{ description: quickSale.item_name || "Quick Sale", qty: 1, rate: quickSale.amount, amount: quickSale.amount }];
    payments = paymentsResult.data?.length ? paymentsResult.data : [{ method: quickSale.payment_method || "cash", amount: quickSale.amount }];
  }

  const settingsResult = await supabase.from("settings").select("*").single();
  if (settingsResult.error) throw new Error(`Receipt settings lookup failed: ${settingsResult.error.message}`);
  const settings = settingsResult.data;
  const [merchantQrResult, upiInstrumentResult] = await Promise.all([
    supabase.from("upi_merchant_qrs").select("upi_id, display_name").eq("is_active", true).limit(1).maybeSingle(),
    supabase.from("payment_instruments").select("name, details").eq("type", "upi").eq("is_active", true).limit(1).maybeSingle(),
  ]);
  const currency = settings?.currency_symbol || "₹";
  const money = (n: number | string | null | undefined) => currency + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const upiId = (settings as any)?.upi_id || merchantQrResult.data?.upi_id || (upiInstrumentResult.data?.details as any)?.upi_id || "";
  const due = Number(invoice.due || 0);
  const qrString = due > 0 && upiId ? generateUpiString({ upiId, name: settings?.shop_name || "Shop", amount: due, note: "Inv " + invoice.invoice_number }) : "";
  const qrDataUrl = qrString ? await generateQrDataUrl(qrString, { width: 140 }) : "";

  return (
    <main className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0">
      <AutoPrint />
      <style>{`@page { size: 80mm auto; margin: 3mm; } @media print { body { background:#fff !important; color:#000 !important; } .print\\:hidden { display:none !important; } }`}</style>
      <section className="mx-auto max-w-[340px] rounded-2xl border border-slate-200 bg-white p-5 shadow-lg print:max-w-none print:rounded-none print:border-none print:p-0 print:shadow-none">
        <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-200 pb-2 print:hidden">
          <div><b className="text-xs">Receipt (80mm)</b><p className="text-[10px] text-slate-500">#{invoice.invoice_number}</p></div>
          <div className="flex flex-wrap gap-1"><a href={`/receipt/${id}/a4`} target="_blank" className="rounded border px-2 py-1 text-[10px] font-bold">A4</a><a href={`/api/invoices/${id}/pdf`} download className="rounded border px-2 py-1 text-[10px] font-bold">PDF</a><PrintButton label="Print" /></div>
        </div>
        <div className="font-mono text-xs leading-relaxed text-slate-900">
          <div className="text-center"><p className="text-base font-black">{settings?.shop_name || "Sarkar Communication"}</p>{settings?.address && <p className="text-[10px]">{settings.address}</p>}<p className="text-[10px]">{settings?.phone || ""}{settings?.email ? ` · ${settings.email}` : ""}</p>{(settings?.gstin || settings?.tax_id) && <p className="text-[10px] font-bold">GSTIN: {settings.gstin || settings.tax_id}</p>}</div>
          <div className="my-2 border-t-2 border-dashed border-slate-400" />
          <div className="flex justify-between text-[10px] font-bold"><span>RECEIPT / BILL</span><span>#{invoice.invoice_number}</span></div>
          <div className="flex justify-between text-[10px]"><span>Date</span><span>{invoice.invoice_date}</span></div>
          <div className="flex justify-between text-[10px]"><span>Customer</span><span className="font-bold">{invoice.customers?.name || "Walk-in Customer"}</span></div>
          <div className="my-2 border-t border-dashed border-slate-300" />
          {items.map((it, idx) => { const name = it.products?.name || it.services?.name || it.description || "Item"; return <div key={it.id || idx} className="mb-1 text-[10px]"><div className="font-bold">{name}</div><div className="flex justify-between pl-2 text-slate-600"><span>{Number(it.qty)} x {money(it.rate)}</span><b className="text-slate-900">{money(it.amount)}</b></div></div>; })}
          <div className="my-2 border-t-2 border-dashed border-slate-400" />
          <div className="space-y-0.5 text-[10px]"><div className="flex justify-between"><span>Subtotal</span><span>{money(invoice.subtotal)}</span></div>{Number(invoice.discount || 0) > 0 && <div className="flex justify-between"><span>Discount</span><span>- {money(invoice.discount)}</span></div>}<div className="flex justify-between border-t border-slate-300 pt-1 text-sm font-black"><span>TOTAL</span><span>{money(invoice.total)}</span></div><div className="flex justify-between"><span>Paid</span><span>{money(invoice.paid)}</span></div>{due > 0 && <div className="flex justify-between font-bold text-amber-700"><span>Due</span><span>{money(due)}</span></div>}</div>
          {payments.length > 0 && <div className="mt-2 border-t border-dashed border-slate-300 pt-1 text-[9px]"><b>TENDERED</b>{payments.map((p, idx) => <div key={idx} className="flex justify-between pl-2"><span>{String(p.method).toUpperCase()}</span><span>{money(p.amount)}</span></div>)}</div>}
          {qrDataUrl && <div className="mt-2 border-t-2 border-dashed border-slate-400 pt-2 text-center"><img src={qrDataUrl} alt="UPI payment QR" className="mx-auto h-24 w-24" /><p className="font-black text-[10px]">SCAN & PAY VIA UPI</p><p className="text-[9px]">{upiId}</p><p className="text-[9px] font-bold">Amount: {money(due)}</p></div>}
          {settings?.receipt_footer && <div className="mt-2 border-t border-dashed border-slate-300 pt-2 text-center text-[9px] whitespace-pre-line">{settings.receipt_footer}</div>}
          <p className="mt-2 text-center text-[9px] text-slate-400">*** Thank You! Visit Again ***</p>
        </div>
      </section>
    </main>
  );
}
