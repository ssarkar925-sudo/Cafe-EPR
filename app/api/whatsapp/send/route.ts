import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerWhatsAppConfig, sendWhatsAppViaConfig } from "@/lib/whatsapp-sender";
import { buildCustomerInvoiceUrl } from "@/lib/customer-invoice-link";
import { sendCustomerInvoicePdf } from "@/lib/whatsapp-document";

function clientIp(req: Request): string {
  return String(req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "unknown").trim();
}

export async function POST(req: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager", "staff"])) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

    const limited = await createAdminClient().rpc("consume_api_rate_limit", {
      p_key: `whatsapp-send:${clientIp(req)}`,
      p_limit: 20,
      p_window_seconds: 60,
    });
    if (limited.error || limited.data !== true) return NextResponse.json({ success: false, error: "Too many WhatsApp send requests. Please retry shortly." }, { status: 429 });

    const body = await req.json();
    const { phone, message, options, messageType, referenceId } = body as {
      phone: string;
      message?: string;
      messageType?: string;
      referenceId?: string;
      options?: { templateName?: string; templateLang?: string };
    };

    const serverConfig = await getServerWhatsAppConfig();

    // Server-side safety boundary: every POS invoice WhatsApp dispatch becomes
    // one customer-safe PDF attachment. It can be identified explicitly by
    // messageType/referenceId or by the legacy invoice template's A4 URL.
    const legacyInvoiceMatch = String(message || "").match(/\/receipt\/([0-9a-f-]{36})\/a4(?:\b|[?#])/i);
    const invoiceId = messageType === "pos_invoice" && referenceId ? referenceId : legacyInvoiceMatch?.[1] || "";
    if (invoiceId) {
      const { data: invoice, error: invoiceError } = await createAdminClient().from("invoices").select("id, invoice_number").eq("id", invoiceId).maybeSingle();
      if (invoiceError || !invoice) return NextResponse.json({ success: false, error: "Invoice not found." }, { status: 404 });
      const documentUrl = buildCustomerInvoiceUrl(new URL(req.url).origin, invoice.id);
      const result = await sendCustomerInvoicePdf(phone, serverConfig, documentUrl, `Invoice-${invoice.invoice_number}.pdf`);
      if (!result.success) return NextResponse.json({ success: false, error: result.error || "Failed to send invoice PDF." }, { status: result.status || 400 });
      return NextResponse.json({ success: true, provider: result.provider, messageId: result.messageId, invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, documentOnly: true });
    }

    if (!message?.trim() && !options?.templateName) return NextResponse.json({ success: false, error: "Phone number and message text cannot be empty." }, { status: 400 });
    const result = await sendWhatsAppViaConfig(phone, message || "", serverConfig, options);
    if (!result.success) return NextResponse.json({ ...result, success: false, error: result.error || "Failed to send message" }, { status: result.status || 400 });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Internal server error" }, { status: 500 });
  }
}
