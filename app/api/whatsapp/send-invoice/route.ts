import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCustomerInvoiceUrl } from "@/lib/customer-invoice-link";
import { getServerWhatsAppConfig, sendWhatsAppViaConfig } from "@/lib/whatsapp-sender";

export const runtime = "nodejs";

function clientIp(req: Request): string {
  return String(req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "unknown").trim();
}

export async function POST(req: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager", "staff"])) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const limited = await createAdminClient().rpc("consume_api_rate_limit", {
      p_key: `whatsapp-invoice-send:${clientIp(req)}`,
      p_limit: 20,
      p_window_seconds: 60,
    });
    if (limited.error || limited.data !== true) {
      return NextResponse.json({ success: false, error: "Too many WhatsApp invoice requests. Please retry shortly." }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const invoiceId = String(body?.invoiceId || "").trim();
    const phone = String(body?.phone || "").trim();
    if (!invoiceId || !phone) return NextResponse.json({ success: false, error: "Invoice ID and recipient phone are required." }, { status: 400 });

    const db = createAdminClient();
    const { data: invoice, error: invoiceError } = await db
      .from("invoices")
      .select("id, invoice_number, customers(name, phone)")
      .eq("id", invoiceId)
      .maybeSingle();
    if (invoiceError || !invoice) return NextResponse.json({ success: false, error: "Invoice not found." }, { status: 404 });

    const origin = new URL(req.url).origin;
    const documentUrl = buildCustomerInvoiceUrl(origin, invoice.id);
    const serverConfig = await getServerWhatsAppConfig();
    const result = await sendWhatsAppViaConfig(phone, "", serverConfig, {
      documentUrl,
      documentFilename: `Invoice-${invoice.invoice_number}.pdf`,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error || "Failed to send invoice PDF." }, { status: result.status || 400 });
    }

    return NextResponse.json({
      success: true,
      provider: result.provider,
      messageId: result.messageId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      documentUrl,
    });
  } catch (error: any) {
    console.error("Invoice-only WhatsApp dispatch error:", error);
    return NextResponse.json({ success: false, error: error?.message || "Internal server error." }, { status: 500 });
  }
}
