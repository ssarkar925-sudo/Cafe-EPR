/**
 * V1 typed RPC integration layer.
 *
 * - Mutations (V1_MUTATION_RPCS) MUST go through POST /api/pos/financial-rpc
 *   (authenticated, allowlisted, same-origin checked). The browser singleton
 *   (`lib/supabase/client`) auto-injects `p_idempotency_key`, which matches
 *   the V1 `p_idempotency_key` parameter name on every idempotent RPC.
 * - Pure reads (V1_READ_RPCS) go direct via supabase.rpc with the caller's
 *   session (RLS still applies; backend remains authoritative).
 * - Server components/route handlers use callV1Server* with the server
 *   client. Never use the service-role client for V1 app calls.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { JsonValue, V1RpcResult } from "./v1-contracts";

/** Documented V1 mutations. Proxy allowlist MUST be a superset of this list. */
export const V1_MUTATION_RPCS: readonly string[] = [
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
  // G9 sync (server side of the approved protocol)
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
];

/** Documented V1 pure reads (direct rpc; RLS enforced). */
export const V1_READ_RPCS: readonly string[] = [
  "current_tenant",
  "is_back_office",
  "is_admin",
  "dues_of",
  "allocate_fifo",
  "stuck_holds",
  "expected_instrument_balance",
  "sync_handshake",
];

export const V1_MUTATION_RPC_SET: ReadonlySet<string> = new Set(V1_MUTATION_RPCS);
export const V1_READ_RPC_SET: ReadonlySet<string> = new Set(V1_READ_RPCS);

/**
 * V1 mutations whose signature includes p_idempotency_key (verified in
 * V1_004/005/006/007/009). callV1Mutation auto-generates the key when the
 * caller does not supply one — same behavior as the browser singleton.
 * RPCs absent here take no key parameter; passing one would be rejected
 * by the database, so no injection is attempted for them.
 */
export const V1_IDEMPOTENT_RPCS: ReadonlySet<string> = new Set([
  "create_purchase",
  "create_sale",
  "cancel_invoice",
  "edit_invoice",
  "record_claim",
  "recognize_claim",
  "record_service_txn",
  "reverse_service_txn",
  "reverse_journal_entry",
  "record_day_counts",
  "close_day_close",
  "approve_day_close",
]);

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

export function isV1MutationRpc(name: string): boolean {
  return V1_MUTATION_RPC_SET.has(name);
}

export function isV1ReadRpc(name: string): boolean {
  return V1_READ_RPC_SET.has(name);
}

export function isV1Rpc(name: string): boolean {
  return isV1MutationRpc(name) || isV1ReadRpc(name);
}

type RpcArgs = Record<string, unknown>;

function toRpcError(error: unknown): { message: string; code?: string | null } {
  if (error && typeof error === "object") {
    const err = error as { message?: unknown; code?: unknown };
    return {
      message: typeof err.message === "string" ? err.message : "V1 RPC failed.",
      code: typeof err.code === "string" ? err.code : null,
    };
  }
  return { message: "V1 RPC failed." };
}

/**
 * Browser mutation call via the allowlisted proxy. Only V1 mutation names
 * are accepted here — anything else is rejected client-side before fetch.
 */
export async function callV1Mutation<T>(
  functionName: string,
  args: RpcArgs,
  options?: Record<string, JsonValue>,
): Promise<V1RpcResult<T>> {
  if (!isV1MutationRpc(functionName)) {
    return { data: null, error: { message: `Not a V1 mutation RPC: ${functionName}.` } };
  }
  const finalArgs: RpcArgs = { ...args };
  if (V1_IDEMPOTENT_RPCS.has(functionName) && typeof finalArgs.p_idempotency_key !== "string") {
    finalArgs.p_idempotency_key = newIdempotencyKey();
  }
  try {
    const response = await fetch("/api/pos/financial-rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ function_name: functionName, args: finalArgs, options }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      data?: T;
      error?: { message?: string; code?: string | null } | null;
    };
    if (!response.ok) {
      return {
        data: null,
        error: { message: payload?.error?.message ?? `V1 RPC failed (HTTP ${response.status}).` },
      };
    }
    return { data: (payload?.data as T) ?? null, error: null } as V1RpcResult<T>;
  } catch (error: unknown) {
    const mapped = toRpcError(error);
    return { data: null, error: { message: mapped.message } };
  }
}

/**
 * Browser/server direct read call. Only V1 read names are accepted here.
 * RLS applies; backend remains authoritative.
 */
export async function callV1Read<T>(
  client: SupabaseClient,
  functionName: string,
  args?: RpcArgs,
): Promise<V1RpcResult<T>> {
  if (!isV1ReadRpc(functionName)) {
    return { data: null, error: { message: `Not a V1 read RPC: ${functionName}.` } };
  }
  const { data, error } = await client.rpc(functionName, args ?? {});
  if (error) {
    const mapped = toRpcError(error);
    return { data: null, error: { message: mapped.message, code: mapped.code ?? null } };
  }
  return { data: data as T, error: null };
}

/**
 * Server-side mutation call (route handlers / server actions). Uses the
 * caller's authenticated server client — never the service-role client.
 */
export async function callV1ServerMutation<T>(
  client: SupabaseClient,
  functionName: string,
  args: RpcArgs,
): Promise<V1RpcResult<T>> {
  if (!isV1MutationRpc(functionName)) {
    return { data: null, error: { message: `Not a V1 mutation RPC: ${functionName}.` } };
  }
  const { data, error } = await client.rpc(functionName, args);
  if (error) {
    const mapped = toRpcError(error);
    return { data: null, error: { message: mapped.message, code: mapped.code ?? null } };
  }
  return { data: data as T, error: null };
}
