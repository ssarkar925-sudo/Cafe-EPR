import { NextResponse } from "next/server";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import CustomerInvoicePdf from "@/components/pdf/customer-invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getDb() {
  try {
    return createAdminClient();
  } catch {
    return await createClient();
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!id || !isUuid) {
      return new NextResponse("Invalid invoice ID.", { status: 404 });
    }

    const url = new URL(req.url);
    const db = await getDb();
    let isQuick = url.searchParams.get("source") === "quick";
    let invoice: any = null;
    let items: any[] = [];
    let payments: any[] = [];

    if (!isQuick) {
      const { data: inv } = await db
        .from("invoices")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (inv) {
        invoice = inv;
        if (inv.customer_id) {
          const { data: customer } = await db
            .from("customers")
            .select("name, phone, address, code")
            .eq("id", inv.customer_id)
            .maybeSingle();
          invoice.customers = customer || null;
        }
        const [{ data: itRows }, { data: pRows }] = await Promise.all([
          db
            .from("invoice_items")
            .select("*, products(name, code), services(name)")
            .eq("invoice_id", id)
            .order("created_at", { ascending: true }),
          db
            .from("payments")
            .select("id, method, amount, received_at")
            .eq("invoice_id", id)
            .order("received_at", { ascending: true }),
        ]);
        items = itRows || [];
        payments = pRows || [];
      } else {
        isQuick = true;
      }
    }

    if (isQuick && !invoice) {
      const { data: qs } = await db
        .from("quick_sales")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (!qs) {
        return new NextResponse("Invoice not found.", { status: 404 });
      }

      let quickCustomer: any = null;
      if (qs.customer_id) {
        const { data: customer } = await db
          .from("customers")
          .select("name, phone, address, code")
          .eq("id", qs.customer_id)
          .maybeSingle();
        quickCustomer = customer || null;
      }

      const [{ data: qsItems }, { data: qsPayments }] = await Promise.all([
        db
          .from("quick_sale_items")
          .select("*, products(name, unit), services(name)")
          .eq("quick_sale_id", id),
        db
          .from("payments")
          .select("id, method, amount, received_at")
          .eq("invoice_id", id)
          .order("received_at", { ascending: true }),
      ]);

      invoice = {
        id: qs.id,
        invoice_number: qs.sale_number,
        invoice_date: qs.sale_date,
        subtotal: qs.amount,
        discount: 0,
        total: qs.amount,
        paid: qs.amount,
        due: 0,
        status: "paid",
        customers: quickCustomer,
      };

      items =
        qsItems && qsItems.length > 0
          ? qsItems
          : [
              {
                description: qs.item_name || "Quick Sale",
                qty: 1,
                rate: qs.amount,
                amount: qs.amount,
              },
            ];

      payments =
        qsPayments && qsPayments.length > 0
          ? qsPayments
          : [{ method: qs.payment_method || "cash", amount: qs.amount }];
    }

    const { data: settings } = await db.from("settings").select("*").single();

    const pdfBuffer = await renderToBuffer(
      createElement(CustomerInvoicePdf, {
        invoice,
        items,
        payments,
        settings,
      }) as any
    );

    const isInline = url.searchParams.get("inline") === "true";
    const filename = `Invoice-${invoice.invoice_number || id}.pdf`;

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${isInline ? "inline" : "attachment"}; filename="${filename}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: any) {
    console.error("Invoice PDF generation error:", error);
    return new NextResponse("Unable to generate invoice PDF.", { status: 500 });
  }
}
