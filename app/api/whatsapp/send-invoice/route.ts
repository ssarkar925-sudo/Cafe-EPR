import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCustomerInvoiceUrl } from "@/lib/customer-invoice-link";
import { getServerWhatsAppConfig } from "@/lib/whatsapp-sender";
import { sendCustomerInvoicePdf } from "@/lib/whatsapp-document";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager", "staff"])) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const invoiceId = String(body?.invoiceId || "").trim();
    const phone = String(body?.phone || "").trim();
    if (!invoiceId || !phone) return NextResponse.json({ success: false, error: "Invoice ID and recipient phone are required." }, { status: 400 });

    const db = createAdminClient();
    const { data: invoice, error } = await db.from("invoices").select("id, invoice_number").eq("id", invoiceId).maybeSingle();
    if (error || !invoice) return NextResponse.json({ success: false, error: "Invoice not found." }, { status: 404 });

    const documentUrl = buildCustomerInvoiceUrl(new URL(req.url).origin, invoice.id);
    const config = await getServerWhatsAppConfig();
    const result = await sendCustomerInvoicePdf(phone, config, documentUrl, `Invoice-${invoice.invoice_number}.pdf`);

    if (!result.success) return NextResponse.json({ success: false, error: result.error || "Failed to send invoice PDF." }, { status: result.status || 400 });
    return NextResponse.json({ success: true, provider: result.provider, messageId: result.messageId, invoiceId: invoice.id, invoiceNumber: invoice.invoice_number });
  } catch (error: any) {
    console.error("Invoice-only WhatsApp dispatch error:", error);
    return NextResponse.json({ success: false, error: error?.message || "Internal server error." }, { status: 500 });
  }
}
