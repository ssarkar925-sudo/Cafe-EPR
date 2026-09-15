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

    // Resolve the invoice from the primary table first. Immediately after
    // create_sale commits, a separate server request can briefly observe the
    // write late, so retry the direct lookup for several seconds. The customer
    // relationship is only enrichment and can never block invoice resolution.
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
        const plain = await db.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
        if (!plain.error && plain.data) return enrichCustomer(plain.data);
        if (plain.error) lastLookupError = plain.error.message;

        const embedded = await db
          .from("invoices")
          .select("*, customers(name, phone, address, code)")
          .eq("id", invoiceId)
          .maybeSingle();
        if (!embedded.error && embedded.data) return embedded.data;
        if (embedded.error) lastLookupError = embedded.error.message;
      }

      if (invoiceNumber) {
        const plain = await db
          .from("invoices")
          .select("*")
          .eq("invoice_number", invoiceNumber)
          .maybeSingle();
        if (!plain.error && plain.data) return enrichCustomer(plain.data);
        if (plain.error) lastLookupError = plain.error.message;

        const normalized = invoiceNumber.replace(/\s+/g, "").trim();
        if (normalized) {
          const fuzzy = await db
            .from("invoices")
            .select("*")
            .ilike("invoice_number", normalized)
            .maybeSingle();
          if (!fuzzy.error && fuzzy.data) return enrichCustomer(fuzzy.data);
          if (fuzzy.error) lastLookupError = fuzzy.error.message;
        }
      }

      return null;
    }

    // Bounded retry for a just-committed sale becoming visible to this request.
    let invoice = null as any;
    const retryDelaysMs = [0, 250, 500, 1000, 1500, 2000];
    for (const delayMs of retryDelaysMs) {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      invoice = await lookupInvoice();
      if (invoice) break;
    }

    if (!invoice) {
      if (lastLookupError) {
        console.error(
          "WhatsApp send-invoice: invoice lookup failed after retries.",
          "invoiceId=", invoiceId,
          "invoiceNumber=", invoiceNumber,
          "error=", lastLookupError
        );
        return NextResponse.json(
          { success: false, error: `Invoice lookup failed: ${lastLookupError}` },
          { status: 500 }
        );
      }

      console.error(
        "WhatsApp send-invoice: invoice not found after retries.",
        "invoiceId=", invoiceId,
        "invoiceNumber=", invoiceNumber
      );
      return NextResponse.json(
        { success: false, error: `Invoice ${invoiceNumber || invoiceId || "(missing identifier)"} could not be resolved after the sale.` },
        { status: 404 }
      );
    }

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
