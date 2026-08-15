import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "@/components/receipt/print-button";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({
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
    .select("method, amount")
    .eq("invoice_id", id);
  const { data: settings } = await supabase
    .from("settings")
    .select("*")
    .single();

  const cur = settings?.currency_symbol || "₹";
  const money = (n: number | string) =>
    cur +
    Number(n).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const itemsRows = (items ?? []) as any[];
  const paymentsRows = (payments ?? []) as any[];

  return (
    <div className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0">
      <style>{`
        @page { size: 80mm auto; margin: 4mm; }
        @media print { body { background: #fff !important; } }
      `}</style>
      <div className="mx-auto max-w-sm rounded-lg bg-white p-4 shadow print:max-w-none print:rounded-none print:shadow-none">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <h1 className="text-lg font-semibold text-slate-900">Receipt</h1>
          <PrintButton />
        </div>

        <div className="font-mono text-xs leading-relaxed text-slate-900">
          <div className="text-center">
            <p className="text-sm font-bold">
              {settings?.shop_name || "Shop"}
            </p>
            {settings?.address && <p>{settings.address}</p>}
            {settings?.phone && <p>Ph: {settings.phone}</p>}
          </div>

          <div className="my-2 border-t border-dashed border-slate-400" />
          <div className="flex justify-between">
            <span>Invoice</span>
            <span>{invoice.invoice_number}</span>
          </div>
          <div className="flex justify-between">
            <span>Date</span>
            <span>{invoice.invoice_date}</span>
          </div>
          <div className="flex justify-between">
            <span>Customer</span>
            <span>{invoice.customers?.name || "Walk-in"}</span>
          </div>

          <div className="my-2 border-t border-dashed border-slate-400" />
          {itemsRows.map((it) => (
            <div key={it.id} className="mb-1">
              <p>{it.products?.name || it.services?.name || it.description}</p>
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
            <span>Subtotal</span>
            <span>{money(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Discount</span>
            <span>{money(invoice.discount)}</span>
          </div>
          <div className="flex justify-between text-sm font-bold">
            <span>TOTAL</span>
            <span>{money(invoice.total)}</span>
          </div>
          <div className="flex justify-between">
            <span>Paid</span>
            <span>{money(invoice.paid)}</span>
          </div>
          <div className="flex justify-between">
            <span>Due</span>
            <span>{money(invoice.due)}</span>
          </div>

          {paymentsRows.length > 0 && (
            <div className="my-2 border-t border-dashed border-slate-400" />
          )}
          {paymentsRows.map((p) => (
            <div key={p.id} className="flex justify-between">
              <span>{p.method.toUpperCase()}</span>
              <span>{money(p.amount)}</span>
            </div>
          ))}

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
