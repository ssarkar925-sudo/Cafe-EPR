import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerWhatsAppConfig } from "@/lib/whatsapp-sender";
import {
  CLOUDFLARE_EDGE_REJECTION_CODE,
  describeEndpointForLog,
  sendCustomerInvoicePdf,
} from "@/lib/whatsapp-document";
import { buildGatewayFallback } from "@/lib/whatsapp-direct-delivery";

export const runtime = "nodejs";

const STORAGE_BUCKET = "customer-invoices";
const SIGNED_URL_TTL_SECONDS = 15 * 60;

import { buildInvoiceCaption, buildInvoicePdf } from "@/lib/invoice-pdf-text";
import { validateClientPdfBytes } from "@/lib/whatsapp-direct-delivery";

export async function POST(req: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager", "staff"])) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const invoiceId = String(body?.invoiceId || "").trim();
    const invoiceNumber = String(body?.invoiceNumber || "").trim();
    const phone = String(body?.phone || "").trim();
    // Optional canonical client-supplied PDF (Task 6): the exact bytes rendered
    // by the shared InvoicePdf generator in the browser.
    const clientDocumentBase64 = String(body?.documentBase64 || "").trim();
    const clientFileName = String(body?.fileName || "").trim();
    const clientMimeType = String(body?.mimeType || "").trim();
    const clientCaption = String(body?.caption || "").trim().slice(0, 800);
    if ((!invoiceId && !invoiceNumber) || !phone) return NextResponse.json({ success: false, error: "Invoice ID (or invoice number) and recipient phone are required." }, { status: 400 });

    const db = createAdminClient();
    let lastLookupError = "";
    async function lookupInvoice() {
      async function enrichCustomer(invoice: any) {
        if (!invoice?.customer_id) return invoice;
        const customerResult = await db.from("customers").select("name, phone, address, code").eq("id", invoice.customer_id).maybeSingle();
        if (!customerResult.error) invoice.customers = customerResult.data || null;
        return invoice;
      }
      if (invoiceId) {
        const plain = await db.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
        if (!plain.error && plain.data) return enrichCustomer(plain.data);
        if (plain.error) lastLookupError = plain.error.message;
        const embedded = await db.from("invoices").select("*, customers(name, phone, address, code)").eq("id", invoiceId).maybeSingle();
        if (!embedded.error && embedded.data) return embedded.data;
        if (embedded.error) lastLookupError = embedded.error.message;
      }
      if (invoiceNumber) {
        const plain = await db.from("invoices").select("*").eq("invoice_number", invoiceNumber).maybeSingle();
        if (!plain.error && plain.data) return enrichCustomer(plain.data);
        if (plain.error) lastLookupError = plain.error.message;
        const normalized = invoiceNumber.replace(/\s+/g, "").trim();
        if (normalized) {
          const fuzzy = await db.from("invoices").select("*").ilike("invoice_number", normalized).maybeSingle();
          if (!fuzzy.error && fuzzy.data) return enrichCustomer(fuzzy.data);
          if (fuzzy.error) lastLookupError = fuzzy.error.message;
        }
      }
      return null;
    }

    let invoice = null as any;
    for (const delayMs of [0, 250, 500, 1000, 1500, 2000]) {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      invoice = await lookupInvoice();
      if (invoice) break;
    }
    if (!invoice) {
      if (lastLookupError) return NextResponse.json({ success: false, error: `Invoice lookup failed: ${lastLookupError}` }, { status: 500 });
      return NextResponse.json({ success: false, error: `Invoice ${invoiceNumber || invoiceId || "(missing identifier)"} could not be resolved after the sale.` }, { status: 404 });
    }

    const resolvedId = invoice.id as string;
    const [{ data: items }, { data: payments }, { data: settings }] = await Promise.all([
      db.from("invoice_items").select("*, products(name, code), services(name)").eq("invoice_id", resolvedId).order("id", { ascending: true }),
      db.from("payments").select("id, method, amount, received_at").eq("invoice_id", resolvedId).order("received_at", { ascending: true }),
      db.from("settings").select("*").single(),
    ]);

    // Canonical client bytes win when supplied AND valid (Task 6): the exact
    // PDF rendered by the shared InvoicePdf generator is used verbatim — never
    // regenerated. Otherwise the legacy server render applies (backward compat).
    let pdf: Uint8Array;
    let fileName = `Invoice-${invoice.invoice_number}.pdf`;
    let captionOverride: string | null = null;
    if (clientDocumentBase64) {
      const checked = validateClientPdfBytes({ documentBase64: clientDocumentBase64, mimeType: clientMimeType || "application/pdf" });
      if (!checked.ok) return NextResponse.json({ success: false, error: checked.error }, { status: checked.status });
      pdf = checked.bytes;
      if (clientFileName) {
        const safe = clientFileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
        if (safe) fileName = safe;
      }
      if (clientCaption) captionOverride = clientCaption;
    } else {
      pdf = buildInvoicePdf(invoice, (items || []) as any[], (payments || []) as any[], settings);
    }
    const storagePath = `${invoice.id}/Invoice-${invoice.invoice_number}.pdf`;
    const upload = await db.storage.from(STORAGE_BUCKET).upload(storagePath, pdf, { contentType: "application/pdf", cacheControl: String(SIGNED_URL_TTL_SECONDS), upsert: true });
    if (upload.error) return NextResponse.json({ success: false, error: "Unable to prepare the invoice PDF for delivery." }, { status: 500 });

    const signed = await db.storage.from(STORAGE_BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
    if (signed.error || !signed.data?.signedUrl) return NextResponse.json({ success: false, error: "Unable to create the secure invoice PDF delivery link." }, { status: 500 });

    const config = await getServerWhatsAppConfig();
    const pdfBase64 = Buffer.from(pdf).toString("base64");
    // Greeting attached to the WhatsApp DOCUMENT message (the PDF itself is
    // still delivered as a document — never downgraded to text-only).
    // A client-supplied caption wins; otherwise the server builds it.
    const caption = captionOverride || buildInvoiceCaption({
      invoiceNumber: invoice.invoice_number,
      invoiceDate: invoice.invoice_date || invoice.created_at,
      customerName: invoice?.customers?.name,
      shopName: (settings as any)?.shop_name || (settings as any)?.business_name || (settings as any)?.company_name,
      total: invoice.total,
      paid: invoice.paid,
      due: invoice.due,
    });

    // Durable delivery guarantee: enqueue the PDF job BEFORE any live send
    // attempt, so a crash or blocked network hop never loses the delivery.
    // The gateway poller pulls PENDING jobs over its proven Supabase path.
    // Reuse an already-queued job for the same invoice + recipient so impatient
    // retaps never queue (or deliver) duplicate PDFs to the customer.
    let jobId: string | null = null;
    try {
      const existing = await db
        .from("whatsapp_pdf_jobs")
        .select("id")
        .eq("invoice_id", resolvedId)
        .eq("recipient_phone", phone)
        .in("status", ["pending", "processing"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!existing.error && existing.data?.id) {
        jobId = String(existing.data.id);
      }
    } catch {
      // Non-blocking: fall through to insert.
    }
    if (jobId) {
      try {
        await db
          .from("whatsapp_pdf_jobs")
          .update({ file_name: fileName, document_base64: pdfBase64, document_url: signed.data.signedUrl, caption, error_message: null, next_attempt_at: new Date().toISOString() })
          .eq("id", jobId)
          .eq("status", "pending");
      } catch {
        // Non-blocking: the existing job remains deliverable as-is.
      }
    }
    if (!jobId) {
      try {
        const enqueued = await db
          .from("whatsapp_pdf_jobs")
          .insert({
            invoice_id: resolvedId,
            invoice_number: invoice.invoice_number,
            recipient_phone: phone,
            file_name: fileName,
            mime_type: "application/pdf",
            document_base64: pdfBase64,
            document_url: signed.data.signedUrl,
            caption,
            provider: config?.provider || "local_gateway",
            status: "pending",
          })
          .select("id")
          .single();
        if (!enqueued.error && enqueued.data?.id) jobId = String(enqueued.data.id);
      } catch (enqueueErr: any) {
        console.error("[whatsapp-send-invoice] job enqueue failed (continuing with live send):", enqueueErr?.message || enqueueErr);
      }
    }

    async function markJob(patch: Record<string, unknown>) {
      if (!jobId) return;
      try {
        await db.from("whatsapp_pdf_jobs").update(patch).eq("id", jobId);
      } catch (markErr: any) {
        console.error("[whatsapp-send-invoice] job status update failed:", markErr?.message || markErr);
      }
    }

    const result = await sendCustomerInvoicePdf(phone, config, signed.data.signedUrl, fileName, pdfBase64);

    // Safe diagnostics: endpoint host/path, provider outcome, invoice identity,
    // recipient, and document metadata. Never logs tokens, API keys, secrets,
    // PDF bytes, or signed-URL query strings.
    const gatewayEndpoint = describeEndpointForLog(`${String(config?.gateway_url || "").replace(/\/$/, "")}/send-document`);
    const documentEndpoint = describeEndpointForLog(signed.data.signedUrl);
    const diagnostic = {
      provider: config?.provider,
      gatewayHost: gatewayEndpoint.host,
      gatewayPath: gatewayEndpoint.path,
      httpStatus: (result as any)?.status ?? null,
      code: (result as any)?.code ?? null,
      invoiceNumber: invoice.invoice_number,
      recipient: phone,
      fileName,
      mimeType: "application/pdf",
      documentHost: documentEndpoint.host,
      documentPath: documentEndpoint.path,
      providerError: result.success ? undefined : String((result as any)?.error || "").slice(0, 300),
    };
    if (!result.success) {
      console.error("[whatsapp-send-invoice] document dispatch failed:", JSON.stringify(diagnostic));
      const failedStatus = (result as any)?.status || 400;
      if (failedStatus === 400) {
        // Client-side defect (bad phone, bad provider config): the queued job
        // could never succeed, so fail it immediately instead of retrying.
        await markJob({ status: "failed", error_message: String((result as any)?.error || "Failed to send invoice PDF.").slice(0, 300) });
      } else {
        // Network/edge/provider failure: leave the job PENDING so the gateway
        // poller delivers it over the proven Supabase path.
        await markJob({
          error_message: String((result as any)?.error || "Failed to send invoice PDF.").slice(0, 300),
          next_attempt_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
        });
      }
      if ((result as any)?.code === CLOUDFLARE_EDGE_REJECTION_CODE) {
        // Workers egress was rejected at the Cloudflare edge before the PDF
        // could reach the gateway. Hand the prepared payload back so the
        // device delivers it directly (browser egress is unaffected).
        const fallback = buildGatewayFallback(config?.gateway_url, {
          phone,
          documentUrl: signed.data.signedUrl,
          fileName,
          documentBase64: pdfBase64,
          caption,
        });
        return NextResponse.json(
          {
            success: false,
            error:
              "The server could not reach the WhatsApp gateway (network edge rejection). Retrying delivery directly from this device.",
            code: CLOUDFLARE_EDGE_REJECTION_CODE,
            hop: "server-to-gateway",
            ...(jobId ? { jobId } : {}),
            ...(fallback ? { fallback } : {}),
          },
          { status: 502 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: (result as any)?.error || "Failed to send invoice PDF.",
          code: (result as any)?.code,
          hop: "server-to-gateway",
          ...(jobId ? { jobId } : {}),
        },
        { status: failedStatus }
      );
    }
    await markJob({ status: "sent", provider_message_id: (result as any)?.messageId || null, sent_at: new Date().toISOString() });
    console.info("[whatsapp-send-invoice] document dispatched:", JSON.stringify({ ...diagnostic, providerError: undefined }));
    return NextResponse.json({ success: true, provider: result.provider, messageId: result.messageId, invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, ...(jobId ? { jobId } : {}) });
  } catch (error: any) {
    console.error("Invoice-only WhatsApp dispatch error:", error);
    return NextResponse.json({ success: false, error: error?.message || "Internal server error." }, { status: 500 });
  }
}
