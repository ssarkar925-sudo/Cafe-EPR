import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateQrDataUrl, generateUpiString } from "@/lib/qr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Canonical invoice PDF data contract (Task 9).
 * Supplies exactly what the shared InvoicePdf renderer needs — invoice,
 * items, payments, settings, qrDataUrl, upiId — so every client (list
 * download, view download, WhatsApp) renders byte-identical PDFs.
 * Only explicit customer-facing columns are selected; no internal ledgers.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager", "staff"])) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    if (!id || !UUID_RE.test(id)) {
      return NextResponse.json({ success: false, error: "Invalid invoice ID." }, { status: 404 });
    }

    const db = createAdminClient();
    const { data: invoice, error: invError } = await db
      .from("invoices")
      .select("id, invoice_number, invoice_date, created_at, customer_id, subtotal, discount, total, paid, due, status")
      .eq("id", id)
      .maybeSingle();
    if (invError || !invoice) {
      return NextResponse.json({ success: false, error: "Invoice not found." }, { status: 404 });
    }

    let customers: any = null;
    if ((invoice as any).customer_id) {
      const { data: cust } = await db
        .from("customers")
        .select("name, phone, address, code")
        .eq("id", (invoice as any).customer_id)
        .maybeSingle();
      customers = cust || null;
    }

    const [{ data: items }, { data: payments }, { data: settings }] = await Promise.all([
      db
        .from("invoice_items")
        .select("id, description, qty, rate, amount, product_id, service_id, products(name), services(name)")
        .eq("invoice_id", id)
        .order("id", { ascending: true }),
      db
        .from("payments")
        .select("id, method, amount, received_at")
        .eq("invoice_id", id)
        .order("received_at", { ascending: true }),
      db.from("settings").select("*").maybeSingle(),
    ]);

    let upiId = String((settings as any)?.upi_id || "");
    if (!upiId) {
      try {
        const { data: qrRow } = await db.from("upi_merchant_qrs").select("upi_id").eq("is_active", true).limit(1).maybeSingle();
        upiId = String(qrRow?.upi_id || "");
      } catch {
        upiId = "";
      }
    }

    const isDue = Number((invoice as any).due || 0) > 0 && (invoice as any).status !== "cancelled";
    let qrDataUrl = "";
    if (upiId && isDue) {
      try {
        const upiString = generateUpiString({
          upiId,
          name: (settings as any)?.shop_name || "Shop",
          amount: Number((invoice as any).due || 0),
          note: `Invoice ${(invoice as any).invoice_number}`,
        });
        if (upiString) qrDataUrl = await generateQrDataUrl(upiString, { width: 220 });
      } catch {
        qrDataUrl = "";
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        invoice: { ...invoice, customers },
        items: items || [],
        payments: payments || [],
        settings: settings || {},
        qrDataUrl,
        upiId,
      },
    });
  } catch (error: any) {
    console.error("Invoice PDF data error:", error?.message || error);
    return NextResponse.json({ success: false, error: "Unable to load invoice data." }, { status: 500 });
  }
}
