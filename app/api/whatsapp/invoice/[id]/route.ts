import { NextResponse } from "next/server";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { createAdminClient } from "@/lib/supabase/admin";
import CustomerInvoicePdf from "@/components/pdf/customer-invoice-pdf";
import { verifyCustomerInvoiceToken } from "@/lib/customer-invoice-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = new URL(req.url).searchParams.get("token") || "";
    if (!id || !verifyCustomerInvoiceToken(id, token)) return new NextResponse("Invalid or expired invoice link.", { status: 404 });

    const db = createAdminClient();
    const { data: invoice, error } = await db.from("invoices").select("*, customers(name, phone, address, code)").eq("id", id).maybeSingle();
    if (error || !invoice) return new NextResponse("Invoice not found.", { status: 404 });

    const [{ data: items }, { data: payments }, { data: settings }] = await Promise.all([
      db.from("invoice_items").select("*, products(name, code), services(name)").eq("invoice_id", id).order("created_at", { ascending: true }),
      db.from("payments").select("id, method, amount, received_at").eq("invoice_id", id).order("received_at", { ascending: true }),
      db.from("settings").select("*").single(),
    ]);

    const pdf = await renderToBuffer(createElement(CustomerInvoicePdf, {
      invoice,
      items: (items || []) as any[],
      payments: (payments || []) as any[],
      settings,
    }));

    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Invoice-${invoice.invoice_number}.pdf"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: any) {
    console.error("Customer invoice PDF error:", error);
    return new NextResponse("Unable to generate invoice PDF.", { status: 500 });
  }
}
