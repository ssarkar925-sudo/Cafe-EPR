import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set(["admin", "manager"]);

function statusFor(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("not authenticated") || lower.includes("authentication")) return 401;
  if (lower.includes("forbidden") || lower.includes("permission denied")) return 403;
  return 400;
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) {
      return NextResponse.json({ data: null, error: { message: "Cross-origin payment requests are not allowed." } }, { status: 403 });
    }

    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ data: null, error: { message: "Authentication required. Please sign in again." } }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.role || !ALLOWED_ROLES.has(profile.role)) {
      return NextResponse.json({ data: null, error: { message: "You do not have permission to record customer payments." } }, { status: 403 });
    }

    const body = await request.json();
    const customerId = String(body?.customer_id || "").trim();
    const entryDate = String(body?.entry_date || "").trim();
    const method = String(body?.method || "cash").trim().toLowerCase();
    const reference = body?.reference == null ? null : String(body.reference).trim() || null;
    const idempotencyKey = String(body?.idempotency_key || "").trim();
    const amount = Number(body?.amount);

    if (!customerId) return NextResponse.json({ data: null, error: { message: "Customer is required." } }, { status: 400 });
    if (!entryDate) return NextResponse.json({ data: null, error: { message: "Payment date is required." } }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ data: null, error: { message: "Payment amount must be greater than zero." } }, { status: 400 });
    if (!idempotencyKey) return NextResponse.json({ data: null, error: { message: "Payment request key is required." } }, { status: 400 });
    if (!["cash", "upi", "bank", "wallet", "debit_card", "credit_card", "card"].includes(method)) {
      return NextResponse.json({ data: null, error: { message: "Invalid payment method." } }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("record_customer_due_payment", {
      p_customer_id: customerId,
      p_entry_date: entryDate,
      p_amount: Number(amount.toFixed(2)),
      p_method: method,
      p_reference: reference,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code ?? null, details: error.details ?? null, hint: error.hint ?? null } },
        { status: statusFor(error.message) }
      );
    }

    return NextResponse.json({ data, error: null }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { data: null, error: { message: error?.message || "Unable to record customer payment." } },
      { status: 500 }
    );
  }
}
