import { NextResponse } from "next/server";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import CustomerInvoicePdf from "@/components/pdf/customer-invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getDb() {
  try { return createAdminClient(); } catch { return await createClient(); }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return new NextResponse("Invalid invoice ID.", { status: 404 });
    const url = new URL(req.url);
    const db = await getDb();
    let invoice: any = null;
    let items: any[] = [];
    let payments: any[] = [];
    let isQuick = url.searchParams.get("source") === "quick";

    if (!isQuick) {
      const { data: inv } = await db.from("invoices").select("*").eq("id", id).maybeSingle();
      if (inv) {
        invoice = inv;
        if (inv.customer_id) {
          const { data: customer, error: customerError } = await db.from("customers").select("name, phone, address, code").eq("id", inv.customer_id).maybeSingle();
          if (!customerError) invoice.customers = customer || null;
        }
        const [{ data: itRows, error: itemError }, { data: pRows, error: paymentError }] = await Promise.all([
          db.from("invoice_items").select("id, description, qty, rate, amount, product_id, service_id").eq("invoice_id", id).order("id", { ascending: true }),
          db.from("payments").select("id, method, amount, received_at").eq("invoice_id", id).order("received_at", { ascending: true }),
        ]);
        if (itemError) throw itemError;
        if (paymentError) throw paymentError;
        items = itRows || [];
        payments = pRows || [];
      } else {
        isQuick = true;
      }
    }

    if (isQuick && !invoice) {
      const { data: qs } = await db.from("quick_sales").select("*").eq("id", id).maybeSingle();
      if (!qs) return new NextResponse("Invoice not found.", { status: 404 });
      let quickCustomer: any = null;
      if (qs.customer_id) {
        const { data: customer, error: customerError } = await db.from("customers").select("name, phone, address, code").eq("id", qs.customer_id).maybeSingle();
        if (!customerError) quickCustomer = customer || null;
      }
      const [{ data: qsItems, error: itemError }, { data: qsPayments, error: paymentError }] = await Promise.all([
        db.from("quick_sale_items").select("id, item_name, qty, rate, amount, product_id, service_id").eq("quick_sale_id", id),
        db.from("payments").select("id, method, amount, received_at").eq("invoice_id", id).order("received_at", { ascending: true }),
      ]);
      if (itemError) throw itemError;
      if (paymentError) throw paymentError;
      invoice = { id: qs.id, invoice_number: qs.sale_number, invoice_date: qs.sale_date, subtotal: qs.amount, discount: 0, total: qs.amount, paid: qs.amount, due: 0, status: "paid", customers: quickCustomer };
      items = qsItems?.length
        ? qsItems.map((q: any) => ({ ...q, description: q.item_name || "Quick Sale" }))
        : [{ description: qs.item_name || "Quick Sale", qty: 1, rate: qs.amount, amount: qs.amount }];
      payments = qsPayments?.length ? qsPayments : [{ method: qs.payment_method || "cash", amount: qs.amount }];
    }

    const { data: settings } = await db.from("settings").select("*").maybeSingle();
    const pdfBuffer = await renderToBuffer(createElement(CustomerInvoicePdf, { invoice, items, payments, settings: settings || {} }) as any);
    const isInline = url.searchParams.get("inline") === "true";
    const filename = `Invoice-${invoice.invoice_number || id}.pdf`;
    return new NextResponse(pdfBuffer as unknown as BodyInit, { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": `${isInline ? "inline" : "attachment"}; filename="${filename}"`, "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" } });
  } catch (error: any) {
    console.error("Invoice PDF generation error:", error);
    return new NextResponse("Unable to generate invoice PDF.", { status: 500 });
  }
}
