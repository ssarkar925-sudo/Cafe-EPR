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

function pdfSafe(value: unknown): string {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/[\\()]/g, (m) => `\\${m}`)
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

function makePdf(lines: string[]): Uint8Array {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 42;
  const lineHeight = 15;
  const maxLinesPerPage = 48;
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += maxLinesPerPage) pages.push(lines.slice(i, i + maxLinesPerPage));
  if (!pages.length) pages.push([]);

  const objects: string[] = [];
  const pageObjectNumbers: number[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("PLACEHOLDER_PAGES");

  for (const pageLines of pages) {
    const contentCommands: string[] = ["BT", "/F1 10 Tf", `${margin} ${pageHeight - margin} Td`];
    pageLines.forEach((line, index) => {
      if (index > 0) contentCommands.push(`0 -${lineHeight} Td`);
      contentCommands.push(`(${pdfSafe(line)}) Tj`);
    });
    contentCommands.push("ET");
    const content = contentCommands.join("\\n");
    const contentObjectNumber = objects.length + 1;
    objects.push(`<< /Length ${content.length} >>\\nstream\\n${content}\\nendstream`);
    const pageObjectNumber = objects.length + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 FONT_OBJECT >> >> /Contents ${contentObjectNumber} 0 R >>`);
    pageObjectNumbers.push(pageObjectNumber);
  }

  const fontObjectNumber = objects.length + 1;
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  for (let i = 0; i < objects.length; i++) objects[i] = objects[i].replace(/FONT_OBJECT/g, `${fontObjectNumber} 0 R`);
  objects[1] = `<< /Type /Pages /Kids [${pageObjectNumbers.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageObjectNumbers.length} >>`;

  const chunks: string[] = ["%PDF-1.4\\n% CafeERP\\n"];
  const offsets: number[] = [0];
  let currentOffset = chunks[0].length;
  objects.forEach((object, index) => {
    const objectText = `${index + 1} 0 obj\\n${object}\\nendobj\\n`;
    offsets.push(currentOffset);
    chunks.push(objectText);
    currentOffset += objectText.length;
  });
  const xrefOffset = currentOffset;
  chunks.push(`xref\\n0 ${objects.length + 1}\\n0000000000 65535 f \\n`);
  for (let i = 1; i < offsets.length; i++) chunks.push(`${String(offsets[i]).padStart(10, "0")} 00000 n \\n`);
  chunks.push(`trailer\\n<< /Size ${objects.length + 1} /Root 1 0 R >>\\nstartxref\\n${xrefOffset}\\n%%EOF\\n`);
  return new TextEncoder().encode(chunks.join(""));
}

function buildInvoicePdf(invoice: any, items: any[], payments: any[], settings: any): Uint8Array {
  const lines: string[] = [];
  const storeName = settings?.shop_name || settings?.business_name || settings?.company_name || "CafeERP";
  const customer = invoice?.customers?.name || "Walk-in Customer";
  const phone = invoice?.customers?.phone || "";
  lines.push(storeName, "INVOICE", `Invoice No: ${invoice?.invoice_number || ""}`, `Date: ${invoice?.invoice_date || invoice?.created_at || ""}`, `Customer: ${customer}${phone ? ` (${phone})` : ""}`, "", "Item                         Qty      Rate       Amount", "---------------------------------------------------------");
  for (const item of items || []) {
    const name = String(item?.description || item?.products?.name || item?.services?.name || "Item").slice(0, 28).padEnd(28);
    lines.push(`${name} ${Number(item?.qty || 0).toFixed(2).padStart(6)} ${Number(item?.rate || 0).toFixed(2).padStart(10)} ${Number(item?.amount || 0).toFixed(2).padStart(11)}`);
  }
  lines.push("", `Subtotal: INR ${Number(invoice?.subtotal || 0).toFixed(2)}`, `Discount: INR ${Number(invoice?.discount || 0).toFixed(2)}`, `Tax: INR ${Number(invoice?.tax || 0).toFixed(2)}`, `TOTAL: INR ${Number(invoice?.total || 0).toFixed(2)}`, `PAID: INR ${Number(invoice?.paid || 0).toFixed(2)}`, `DUE: INR ${Number(invoice?.due || 0).toFixed(2)}`, `Status: ${invoice?.status || ""}`);
  if ((payments || []).length) {
    lines.push("", "Payments");
    for (const payment of payments) lines.push(`${payment?.method || "payment"}: INR ${Number(payment?.amount || 0).toFixed(2)}`);
  }
  lines.push("", "Generated securely by CafeERP");
  return makePdf(lines);
}

export async function POST(req: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager", "staff"])) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const invoiceId = String(body?.invoiceId || "").trim();
    const invoiceNumber = String(body?.invoiceNumber || "").trim();
    const phone = String(body?.phone || "").trim();
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

    const pdf = buildInvoicePdf(invoice, (items || []) as any[], (payments || []) as any[], settings);
    const storagePath = `${invoice.id}/Invoice-${invoice.invoice_number}.pdf`;
    const upload = await db.storage.from(STORAGE_BUCKET).upload(storagePath, pdf, { contentType: "application/pdf", cacheControl: String(SIGNED_URL_TTL_SECONDS), upsert: true });
    if (upload.error) return NextResponse.json({ success: false, error: "Unable to prepare the invoice PDF for delivery." }, { status: 500 });

    const signed = await db.storage.from(STORAGE_BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
    if (signed.error || !signed.data?.signedUrl) return NextResponse.json({ success: false, error: "Unable to create the secure invoice PDF delivery link." }, { status: 500 });

    const config = await getServerWhatsAppConfig();
    const pdfBase64 = Buffer.from(pdf).toString("base64");
    const fileName = `Invoice-${invoice.invoice_number}.pdf`;
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
      if ((result as any)?.code === CLOUDFLARE_EDGE_REJECTION_CODE) {
        // Workers egress was rejected at the Cloudflare edge before the PDF
        // could reach the gateway. Hand the prepared payload back so the
        // device delivers it directly (browser egress is unaffected).
        const fallback = buildGatewayFallback(config?.gateway_url, {
          phone,
          documentUrl: signed.data.signedUrl,
          fileName,
          documentBase64: pdfBase64,
        });
        return NextResponse.json(
          {
            success: false,
            error:
              "The server could not reach the WhatsApp gateway (network edge rejection). Retrying delivery directly from this device.",
            code: CLOUDFLARE_EDGE_REJECTION_CODE,
            hop: "server-to-gateway",
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
        },
        { status: (result as any)?.status || 400 }
      );
    }
    console.info("[whatsapp-send-invoice] document dispatched:", JSON.stringify({ ...diagnostic, providerError: undefined }));
    return NextResponse.json({ success: true, provider: result.provider, messageId: result.messageId, invoiceId: invoice.id, invoiceNumber: invoice.invoice_number });
  } catch (error: any) {
    console.error("Invoice-only WhatsApp dispatch error:", error);
    return NextResponse.json({ success: false, error: error?.message || "Internal server error." }, { status: 500 });
  }
}
