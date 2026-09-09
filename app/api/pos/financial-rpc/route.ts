import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ALLOWED_FINANCIAL_RPCS = new Set([
  "create_sale",
  "record_quick_sale",
  "create_business_txn",
  "create_recharge",
  "record_invoice_payment",
  "record_invoice_multi_payment",
  "cancel_invoice",
  "cancel_quick_sale",
  "reverse_business_txn",
  "record_bill_payment",
  "edit_bill_payment",
  "update_recharge",
  "edit_invoice",
  "update_business_txn",
  "record_advance",
  "return_advance",
  "process_return",
  "cancel_expense",
  "add_expense",
  "update_expense",
  "set_opening_balance",
  "record_customer_multi_payment",
]);

function safeStatus(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("not authenticated") || lower.includes("authentication")) return 401;
  if (lower.includes("forbidden") || lower.includes("permission denied")) return 403;
  return 400;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { data: null, error: { message: "Authentication required. Please sign in again." } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const functionName = String(body?.function_name || "").trim();
    if (!ALLOWED_FINANCIAL_RPCS.has(functionName)) {
      return NextResponse.json(
        { data: null, error: { message: "Financial RPC is not allowed through this endpoint." } },
        { status: 403 }
      );
    }

    const args = body?.args && typeof body.args === "object" && !Array.isArray(body.args) ? body.args : {};
    const options = body?.options && typeof body.options === "object" && !Array.isArray(body.options) ? body.options : undefined;

    const { data, error } = await supabase.rpc(functionName, args, options);
    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code ?? null, details: error.details ?? null, hint: error.hint ?? null } },
        { status: safeStatus(error.message) }
      );
    }

    return NextResponse.json({ data, error: null }, { status: 200 });
  } catch (error: any) {
    const message = error?.message || "Unable to process financial transaction.";
    return NextResponse.json(
      { data: null, error: { message } },
      { status: safeStatus(message) >= 500 ? 500 : 500 }
    );
  }
}
