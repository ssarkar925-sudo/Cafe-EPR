import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Allowlist model: LEGACY_* entries serve the pre-V1 application runtime and
 * are frozen (removal happens in later application phases, never silently).
 * V1_* entries are the greenfield G0–G13 backend contract; new application
 * code must call ONLY V1 names via lib/v1 (see lib/v1/legacy-boundary.ts).
 * Shared spellings (create_sale/cancel_invoice/edit_invoice) resolve by
 * argument arity on the database; V1 callers must send V1-shaped args.
 */
const LEGACY_FINANCIAL_RPCS = new Set([
  "create_sale",
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

const V1_FINANCIAL_RPCS = new Set([
  // G0 enrollment / devices / numbering
  "issue_enrollment_token",
  "consume_enrollment_token",
  "revoke_device",
  "next_canonical_number",
  // G1 masters
  "mg_customer_upsert",
  "mg_supplier_upsert",
  "mg_product_upsert",
  "mg_instrument_upsert",
  "mg_coa_head_update",
  // G2 inventory
  "intake_lots",
  "reserve_stock",
  "release_reservation",
  "adjust_stock",
  "quarantine_lot",
  "reopen_lot",
  "expire_overdue_lots",
  "release_expired_reservations",
  // G3 documents + idempotency
  "create_purchase",
  "create_sale",
  "cancel_invoice",
  "edit_invoice",
  "idempotency_begin",
  "idempotency_commit",
  // G4 claims / khata
  "record_claim",
  "allocate_claim",
  "recognize_claim",
  // G5 record-only services
  "record_service_txn",
  "reverse_service_txn",
  // G6 journals
  "post_journal",
  "reverse_journal_entry",
  "set_instrument_account",
  // G7 approvals / audit
  "append_audit",
  "request_approval",
  "approve_override",
  "reject_approval",
  // G8 day-close
  "open_day_close",
  "record_day_counts",
  "post_variance_journal",
  "close_day_close",
  "approve_day_close",
  // G9 sync
  "sync_flush",
  "sync_acknowledge",
  "resolve_conflict",
  // G10 retention / holds
  "set_legal_hold",
  "release_legal_hold",
  "run_retention_purge",
  // G12 back-entry
  "acquire_back_entry_lock",
  "submit_back_entry_batch",
  "void_back_entry_batch",
  "resolve_suspense",
  // Returns / refunds
  "request_return",
  "execute_return",
  "cancel_return",
]);

const ALLOWED_FINANCIAL_RPCS = new Set([
  ...LEGACY_FINANCIAL_RPCS,
  ...V1_FINANCIAL_RPCS,
]);

function safeStatus(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("not authenticated") || lower.includes("authentication")) return 401;
  if (lower.includes("forbidden") || lower.includes("permission denied")) return 403;
  return 400;
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) {
      return NextResponse.json(
        { data: null, error: { message: "Cross-origin financial requests are not allowed." } },
        { status: 403 }
      );
    }

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
    return NextResponse.json(
      { data: null, error: { message: error?.message || "Unable to process financial transaction." } },
      { status: 500 }
    );
  }
}
