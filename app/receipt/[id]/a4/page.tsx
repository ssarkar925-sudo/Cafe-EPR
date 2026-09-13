import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import A4Actions from "@/components/pdf/a4-actions";
import AutoPrint from "@/components/receipt/auto-print";
import { generateUpiString, generateQrDataUrl } from "@/lib/qr";
import { numberToWordsInr } from "@/lib/format";

export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = Record<string, any>;

export default async function ReceiptA4Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();
  let invoice!: Row;
  let items: Row[] = [];
  let payments: Row[] = [];

  const invResult = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (invResult.error) throw new Error(`Receipt invoice lookup failed: ${invResult.error.message}`);

  if (invResult.data) {
    invoice = invResult.data;
    if (invoice.customer_id) {
      const customerResult = await supabase.from("customers").select("name, phone, address, code").eq("id", invoice.customer_id).maybeSingle();
      if (!customerResult.error) invoice.customers = customerResult.data || null;
    }
    const [itemsResult, paymentsResult] = await Promise.all([
      supabase.from("invoice_items").select("id, description, qty, rate, amount, product_id, service_id").eq("invoice_id", id).order("created_at", { ascending: true }),
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
    const qs = quickResult.data;
    let customer: Row | null = null;
    if (qs.customer_id) {
      const customerResult = await supabase.from("customers").select("name, phone, address, code").eq("id", qs.customer_id).maybeSingle();
      if (!customerResult.error) customer = customerResult.data || null;
    }
    const [itemsResult, paymentsResult] = await Promise.all([
      supabase.from("quick_sale_items").select("id, description, qty, rate, amount, product_id, service_id").eq("quick_sale_id", id),
      supabase.from("payments").select("method, amount, received_at").eq("invoice_id", id).order("received_at", { ascending: true }),
    ]);
    if (itemsResult.error) throw new Error(`Historical receipt item lookup failed: ${itemsResult.error.message}`);
    if (paymentsResult.error) throw new Error(`Historical receipt payment lookup failed: ${paymentsResult.error.message}`);
    invoice = { id: qs.id, invoice_number: qs.sale_number, invoice_date: qs.sale_date, subtotal: qs.amount, discount: 0, taxable_amount: qs.amount, cgst: 0, sgst: 0, igst: 0, total: qs.amount, paid: qs.amount, due: 0, status: "paid", customers: customer, customer_gstin: null };
    items = itemsResult.data?.length ? itemsResult.data : [{ description: qs.item_name || "Quick Sale", qty: 1, rate: qs.amount, amount: qs.amount }];
    payments = paymentsResult.data?.length ? paymentsResult.data : [{ method: qs.payment_method || "cash", amount: qs.amount }];
  }

  if (!invoice) notFound();
  const settingsResult = await supabase.from("settings").select("*").maybeSingle();
  const settings = settingsResult.data || {};
  const [merchantQrResult, upiInstrumentResult] = await Promise.all([
    supabase.from("upi_merchant_qrs").select("upi_id, display_name").eq("is_active", true).limit(1).maybeSingle(),
    supabase.from("payment_instruments").select("name, details").eq("type", "upi").eq("is_active", true).limit(1).maybeSingle(),
  ]);
  const currency = settings.currency_symbol || "₹";
  const money = (n: number | string | null | undefined) => currency + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const upiId = settings.upi_id || merchantQrResult.data?.upi_id || (upiInstrumentResult.data?.details as any)?.upi_id || "";
  const due = Number(invoice.due || 0);
  const qrAmount = due > 0 ? due : Number(invoice.total || 0);
  const upiString = due > 0 && upiId ? generateUpiString({ upiId, name: settings.shop_name || "Shop", amount: qrAmount, note: "Inv " + invoice.invoice_number }) : "";
  const qrDataUrl = upiString ? await generateQrDataUrl(upiString, { width: 140 }) : "";

  return (
    <main className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0">
      <AutoPrint />
      <style>{`@page { size: A4; margin: 8mm; } @media print { body { background:#fff !important; color:#000 !important; } .print\\:hidden { display:none !important; } }`}</style>
      <section className="mx-auto max-w-[820px] rounded-2xl border border-slate-200 bg-white p-6 shadow-lg print:max-w-none print:rounded-none print:border-none print:p-0 print:shadow-none">
        <A4Actions variant="invoice" invoiceId={invoice.id} data={{ invoice, items, payments, settings, qrDataUrl, upiId }} filename={`Invoice-${invoice.invoice_number}.pdf`} receiptUrl={`/receipt/${invoice.id}`} />
        <header className="flex items-start justify-between gap-6 border-b border-slate-300 pb-4">
          <div><h1 className="text-xl font-black text-slate-900">{settings.shop_name || "Sarkar Communication"}</h1><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Tax Invoice</p>{settings.address && <p className="mt-1 text-xs text-slate-600">{settings.address}</p>}<p className="text-xs text-slate-600">{settings.phone || ""}{settings.email ? ` · ${settings.email}` : ""}</p>{(settings.gstin || settings.tax_id) && <p className="text-xs font-bold">GSTIN / Tax ID: {settings.gstin || settings.tax_id}</p>}</div>
          <div className="text-right text-xs text-slate-700"><p className="font-mono text-sm font-black">#{invoice.invoice_number}</p><p>Date: {invoice.invoice_date}</p><p className="mt-1 font-bold uppercase">{invoice.status || "completed"}</p></div>
        </header>
        <div className="mt-4 grid grid-cols-2 gap-4"><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Billed To</p><p className="font-bold text-slate-900">{invoice.customers?.name || "Walk-in Customer"}</p>{invoice.customers?.phone && <p className="text-xs text-slate-600">Phone: {invoice.customers.phone}</p>}{invoice.customers?.address && <p className="text-xs text-slate-600">{invoice.customers.address}</p>}</div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Settlement</p><p>Payment: {payments.length ? payments.map((p) => String(p.method).toUpperCase()).join(", ") : "CASH"}</p><p>Paid: <b>{money(invoice.paid)}</b></p><p>Due: <b>{money(invoice.due)}</b></p></div></div>
        <table className="mt-5 w-full text-xs"><thead><tr className="border-y border-slate-900 bg-slate-900 text-white"><th className="p-2 text-left">#</th><th className="p-2 text-left">Item</th><th className="p-2 text-center">Qty</th><th className="p-2 text-right">Rate</th><th className="p-2 text-right">Amount</th></tr></thead><tbody>{items.map((it, index) => <tr key={it.id || index} className="border-b border-slate-100"><td className="p-2">{index + 1}</td><td className="p-2 font-semibold">{it.description || "Item"}</td><td className="p-2 text-center">{Number(it.qty)}</td><td className="p-2 text-right">{money(it.rate)}</td><td className="p-2 text-right font-bold">{money(it.amount)}</td></tr>)}{!items.length && <tr><td colSpan={5} className="p-4 text-center text-slate-400">No line items recorded</td></tr>}</tbody></table>
        <div className="mt-5 grid grid-cols-2 gap-5"><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Amount in Words</p><p className="text-xs font-bold">{numberToWordsInr(Number(invoice.total || 0))}</p>{qrDataUrl && <div className="mt-3 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-2"><img src={qrDataUrl} alt="UPI payment QR" className="h-16 w-16" /><div className="text-xs"><b>Scan & Pay via UPI</b><p>{upiId}</p><p>Amount: {money(qrAmount)}</p></div></div>}</div><div className="rounded-xl border border-slate-300 p-3 text-xs"><div className="flex justify-between"><span>Subtotal</span><b>{money(invoice.subtotal)}</b></div>{Number(invoice.discount || 0) > 0 && <div className="flex justify-between"><span>Discount</span><b>- {money(invoice.discount)}</b></div>}{Number(invoice.cgst || 0) > 0 && <div className="flex justify-between"><span>CGST</span><span>{money(invoice.cgst)}</span></div>}{Number(invoice.sgst || 0) > 0 && <div className="flex justify-between"><span>SGST</span><span>{money(invoice.sgst)}</span></div>}{Number(invoice.igst || 0) > 0 && <div className="flex justify-between"><span>IGST</span><span>{money(invoice.igst)}</span></div>}<div className="mt-2 flex justify-between border-t-2 border-slate-900 pt-2 text-sm font-black"><span>Grand Total</span><span>{money(invoice.total)}</span></div><div className="mt-1 flex justify-between"><span>Paid</span><b>{money(invoice.paid)}</b></div><div className="flex justify-between"><span>Balance Due</span><b>{money(invoice.due)}</b></div></div></div>
        <footer className="mt-6 border-t border-slate-200 pt-3 text-center text-[10px] text-slate-500">{settings.receipt_footer || "Thank you for your business."}</footer>
      </section>
    </main>
  );
}
