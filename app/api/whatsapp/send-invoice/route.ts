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
    const invoiceNumber = String(body?.invoiceNumber || "").trim();
    const phone = String(body?.phone || "").trim();
    if ((!invoiceId && !invoiceNumber) || !phone) {
      return NextResponse.json(
        { success: false, error: "Invoice ID (or invoice number) and recipient phone are required." },
        { status: 400 }
      );
    }

    const db = createAdminClient();
    let lastLookupError = "";

    // Resolve the invoice using the strongest available identifier. The embedded
    // customer relationship is convenient, but a relationship/schema-cache issue
    // must never be misreported to the operator as "Invoice not found".
    async function lookupInvoice() {
      async function enrichCustomer(invoice: any) {
        if (!invoice?.customer_id) return invoice;
        const customerResult = await db
          .from("customers")
          .select("name, phone, address, code")
          .eq("id", invoice.customer_id)
          .maybeSingle();
        if (!customerResult.error) invoice.customers = customerResult.data || null;
        return invoice;
      }

      if (invoiceId) {
        const embedded = await db
          .from("invoices")
          .select("*, customers(name, phone, address, code)")
          .eq("id", invoiceId)
          .maybeSingle();
        if (!embedded.error && embedded.data) return embedded.data;
        if (embedded.error) lastLookupError = embedded.error.message;

        const plain = await db.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
        if (!plain.error && plain.data) return enrichCustomer(plain.data);
        if (plain.error) lastLookupError = plain.error.message;
      }

      if (invoiceNumber) {
        const embedded = await db
          .from("invoices")
          .select("*, customers(name, phone, address, code)")
          .eq("invoice_number", invoiceNumber)
          .maybeSingle();
        if (!embedded.error && embedded.data) return embedded.data;
        if (embedded.error) lastLookupError = embedded.error.message;

        const plain = await db
          .from("invoices")
          .select("*")
          .eq("invoice_number", invoiceNumber)
          .maybeSingle();
        if (!plain.error && plain.data) return enrichCustomer(plain.data);
        if (plain.error) lastLookupError = plain.error.message;
      }

      return null;
    }

    // Try immediately, then retry once after 600ms to handle DB commit race
    // conditions immediately after the create_sale transaction commits.
    let invoice = await lookupInvoice();
    if (!invoice) {
      await new Promise((r) => setTimeout(r, 600));
      invoice = await lookupInvoice();
    }

    if (!invoice) {
      if (lastLookupError) {
        console.error(
          "WhatsApp send-invoice: invoice lookup failed.",
          "invoiceId=",
          invoiceId,
          "invoiceNumber=",
          invoiceNumber,
          "error=",
          lastLookupError
        );
        return NextResponse.json(
          { success: false, error: `Invoice lookup failed: ${lastLookupError}` },
          { status: 500 }
        );
      }

      console.error("WhatsApp send-invoice: invoice not found.", "invoiceId=", invoiceId, "invoiceNumber=", invoiceNumber);
      return NextResponse.json({ success: false, error: "Invoice not found." }, { status: 404 });
    }

    // Always use the resolved invoice.id — never the raw input.
    const resolvedId = invoice.id as string;

    const [{ data: items }, { data: payments }, { data: settings }] = await Promise.all([
      db
        .from("invoice_items")
        .select("*, products(name, code), services(name)")
        .eq("invoice_id", resolvedId)
        .order("id", { ascending: true }),
      db
        .from("payments")
        .select("id, method, amount, received_at")
        .eq("invoice_id", resolvedId)
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
    // inheriting the browser's Deployment Protection session. The short-lived
    // Supabase signed URL is accessible to the provider while the invoice PDF
    // route itself remains protected by the application's design.
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
