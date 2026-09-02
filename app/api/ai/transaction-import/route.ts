import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import {
  buildTransactionFingerprint,
  validateImportedTransaction,
  type ImportedTransaction,
} from "@/lib/ai/transaction-import";

export const dynamic = "force-dynamic";

/**
 * Receives data collected by a trusted browser worker from an external portal.
 * It only stages completed transactions for reconciliation; it never initiates
 * AEPS/UPI/DMT activity and never accepts credentials, OTPs or PINs.
 */
export async function POST(request: Request) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "staff"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const transaction = body?.transaction as ImportedTransaction | undefined;
  if (!transaction || typeof transaction !== "object") {
    return NextResponse.json({ error: "transaction is required" }, { status: 400 });
  }

  const errors = validateImportedTransaction(transaction);
  if (errors.length) {
    return NextResponse.json({
      state: "needs_review",
      error: "Transaction was not staged",
      validationErrors: errors,
    }, { status: 422 });
  }

  const fingerprint = buildTransactionFingerprint(transaction);
  const { data: existing } = await supabase
    .from("ai_transaction_imports")
    .select("id, state, provider_name, external_transaction_id, created_at")
    .eq("created_by", auth.user.id)
    .eq("fingerprint", fingerprint)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      state: "duplicate",
      importId: existing.id,
      existingState: existing.state,
      message: "This external transaction is already in the import inbox.",
    });
  }

  const { data, error } = await supabase.from("ai_transaction_imports").insert({
    created_by: auth.user.id,
    provider_name: transaction.providerName.trim(),
    source_type: transaction.sourceType,
    external_transaction_id: transaction.externalTransactionId.trim(),
    external_reference: transaction.externalReference ?? null,
    status: transaction.status.trim(),
    transaction_type: transaction.transactionType.trim(),
    amount: transaction.amount,
    fee: transaction.fee ?? null,
    commission: transaction.commission ?? null,
    occurred_at: transaction.occurredAt ?? null,
    customer_name: transaction.customerName ?? null,
    customer_mobile: transaction.customerMobile ?? null,
    raw_data: transaction.rawData ?? {},
    fingerprint,
    state: "pending",
  }).select("id, state, provider_name, external_transaction_id, amount").single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ state: "duplicate", message: "Transaction already exists in the import inbox." });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    state: "pending",
    importId: data.id,
    transaction: data,
    message: "Completed transaction collected and staged for Cafe-EPR reconciliation.",
  }, { status: 201 });
}
