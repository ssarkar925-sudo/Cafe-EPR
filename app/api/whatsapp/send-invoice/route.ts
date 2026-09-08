import { NextResponse } from "next/server";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { getUserRole, hasRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import CustomerInvoicePdf from "@/components/pdf/customer-invoice-pdf";
import { getServerWhatsAppConfig } from "@/lib/whatsapp-sender";
import { sendCustomerInvoicePdf } from "@/lib/whatsapp-document";

export const runtime = "nodejs";

const STORAGE_BUCKET = "customer-invoices";
const SIGNED_URL_TTL_SECONDS = 15 * 60;

export async function POST(req: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager", "staff"])) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const invoiceId = String(body?.invoiceId || "").trim();
    const phone = String(body?.phone || "").trim();
    if (!invoiceId || !phone) {
      return NextResponse.json(
        { success: false, error: "Invoice ID and recipient phone are required." },
        { status: 400 }
      );
    }

    const db = createAdminClient();
    const { data: invoice, error } = await db
      .from("invoices")
      .select("*, customers(name, phone, address, code)")
      .eq("id", invoiceId)
      .maybeSingle();

    if (error || !invoice) {
      return NextResponse.json({ success: false, error: "Invoice not found." }, { status: 404 });
    }

    const [{ data: items }, { data: payments }, { data: settings }] = await Promise.all([
      db
        .from("invoice_items")
        .select("*, products(name, code), services(name)")
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: true }),
      db
        .from("payments")
        .select("id, method, amount, received_at")
        .eq("invoice_id", invoiceId)
        .order("received_at", { ascending: true }),
      db.from("settings").select("*").single(),
    ]);

    const pdf = await renderToBuffer(
      createElement(CustomerInvoicePdf, {
        invoice,
        items: (items || []) as any[],
        payments: (payments || []) as any[],
        settings,
      }) as any
    );

    const storagePath = `${invoice.id}/Invoice-${invoice.invoice_number}.pdf`;
    const upload = await db.storage.from(STORAGE_BUCKET).upload(storagePath, pdf, {
      contentType: "application/pdf",
      cacheControl: String(SIGNED_URL_TTL_SECONDS),
      upsert: true,
    });

    if (upload.error) {
      console.error("Customer invoice PDF storage upload error:", upload.error);
      return NextResponse.json(
        { success: false, error: "Unable to prepare the invoice PDF for delivery." },
        { status: 500 }
      );
    }

    const signed = await db.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

    if (signed.error || !signed.data?.signedUrl) {
      console.error("Customer invoice PDF signed URL error:", signed.error);
      return NextResponse.json(
        { success: false, error: "Unable to create the secure invoice PDF delivery link." },
        { status: 500 }
      );
    }

    // External WhatsApp providers/gateways must fetch the document without
    // inheriting the browser's Vercel Deployment Protection session. The
    // short-lived Supabase signed URL is accessible to the provider while the
    // invoice PDF route itself remains protected by the application's design.
    const documentUrl = signed.data.signedUrl;
    const config = await getServerWhatsAppConfig();
    const result = await sendCustomerInvoicePdf(
      phone,
      config,
      documentUrl,
      `Invoice-${invoice.invoice_number}.pdf`
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to send invoice PDF." },
        { status: result.status || 400 }
      );
    }

    return NextResponse.json({
      success: true,
      provider: result.provider,
      messageId: result.messageId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
    });
  } catch (error: any) {
    console.error("Invoice-only WhatsApp dispatch error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error." },
      { status: 500 }
    );
  }
}
