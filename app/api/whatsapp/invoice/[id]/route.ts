import { NextResponse } from "next/server";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateUpiString, generateQrDataUrl } from "@/lib/qr";
import InvoicePdf from "@/components/pdf/invoice-pdf";
import { verifyCustomerInvoiceToken } from "@/lib/customer-invoice-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = new URL(req.url).searchParams.get("token") || "";
    if (!id || !verifyCustomerInvoiceToken(id, token)) {
      return new NextResponse("Invalid or expired invoice link.", { status: 404 });
    }

    const supabase = createAdminClient();
    let invoiceQuery = supabase.from("invoices").select("*, customers(name, phone, address, code)");
    invoiceQuery = isUuid(id) ? invoiceQuery.eq("id", id) : invoiceQuery.eq("invoice_number", id);
    const { data: invoice, error: invoiceError } = await invoiceQuery.maybeSingle();
    if (invoiceError || !invoice) return new NextResponse("Invoice not found.", { status: 404 });

    const invoiceId = invoice.id;
    const [{ data: items }, { data: payments }, { data: settings }, { data: defaultMerchantQr }, { data: upiInstrument }] = await Promise.all([
      supabase.from("invoice_items").select("*, products(name, code), services(name)").eq("invoice_id", invoiceId).order("created_at", { ascending: true }),
      supabase.from("payments").select("id, method, amount, received_at").eq("invoice_id", invoiceId).order("received_at", { ascending: true }),
      supabase.from("settings").select("*").single(),
      supabase.from("upi_merchant_qrs").select("upi_id, display_name").eq("is_active", true).limit(1).maybeSingle(),
      supabase.from("payment_instruments").select("account_number").eq("type", "upi").eq("is_active", true).limit(1).maybeSingle(),
    ]);

    const upiId =
      (settings as any)?.upi_id ||
      defaultMerchantQr?.upi_id ||
      upiInstrument?.account_number ||
      "";

    const isDue = Number(invoice.due || 0) > 0 && invoice.status !== "cancelled";
    const targetAmount = isDue ? Number(invoice.due) : Number(invoice.total);
    const upiString = isDue && upiId
      ? generateUpiString({
          upiId,
          name: settings?.shop_name || "Shop",
          amount: targetAmount,
          note: `Inv ${invoice.invoice_number}`,
        })
      : "";
    const qrDataUrl = upiString ? await generateQrDataUrl(upiString, { width: 140 }) : "";

    const pdf = await renderToBuffer(
      createElement(InvoicePdf, {
        invoice,
        items: (items ?? []) as any[],
        payments: (payments ?? []) as any[],
        settings,
        qrDataUrl,
        upiId,
      })
    );

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
