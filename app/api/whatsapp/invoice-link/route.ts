import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCustomerInvoiceUrl } from "@/lib/customer-invoice-link";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager", "staff"])) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const invoiceId = String(body?.invoiceId || "").trim();
    if (!invoiceId) return NextResponse.json({ success: false, error: "Invoice ID is required." }, { status: 400 });

    const db = createAdminClient();
    const { data: invoice, error } = await db.from("invoices").select("id, invoice_number").eq("id", invoiceId).maybeSingle();
    if (error || !invoice) return NextResponse.json({ success: false, error: "Invoice not found." }, { status: 404 });

    const requestUrl = new URL(req.url);
    const origin = requestUrl.origin;
    const url = buildCustomerInvoiceUrl(origin, invoice.id);

    return NextResponse.json({ success: true, invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, url, expiresInSeconds: 900 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Unable to create invoice link." }, { status: 500 });
  }
}
