import type { SupabaseClient } from "@supabase/supabase-js";

export function digitsOnly(phone: string): string {
  return (phone ?? "").replace(/\D/g, "");
}

export async function findDuplicateCustomer(
  supabase: SupabaseClient,
  phone: string
): Promise<{ id: string; name: string; phone?: string | null } | null> {
  const digits = digitsOnly(phone);
  if (!digits) return null;

  const { data, error } = await supabase.rpc("find_duplicate_customer", {
    p_phone: phone,
  });
  if (!error && data) return data as { id: string; name: string; phone?: string | null };
  if (error && !String(error.message).includes("Could not find the function")) {
    throw new Error(error.message);
  }

  const { data: exact } = await supabase
    .from("customers")
    .select("id, name")
    .eq("phone", digits)
    .maybeSingle();
  return exact;
}

export function isDuplicateKeyError(message: string): boolean {
  return /duplicate key value violates unique constraint|customers_active_phone_unique/i.test(message ?? "");
}

/**
 * Canonical customer creation (single source of truth for ALL flows:
 * CRM, POS, AEPS, DMT, UPI, Recharge, Utility, Google Play, and any future
 * path).
 *
 * Contract: backend/database generates the canonical customer ID (`code`
 * via the trg_assign_customer_code trigger + customer_code_seq sequence).
 * Callers MUST NOT send `code` — it is omitted here by construction.
 * The returned row always carries the generated code; a missing code is a
 * hard failure, never a silent NULL-code customer.
 */
export interface CanonicalCustomerInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  gstin?: string | null;
  customer_type?: string | null;
  balance?: number | null;
  /** Extra columns for forward-compatible inserts (e.g. state_code). */
  extra?: Record<string, unknown>;
}

export interface CanonicalCustomerRow {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  [key: string]: unknown;
}

export class DuplicateCustomerError extends Error {
  existing: { id: string; name: string; phone?: string | null };
  constructor(existing: { id: string; name: string; phone?: string | null }) {
    super(`Customer already exists: ${existing.name}${existing.phone ? ` (${existing.phone})` : ""}. Reusing the existing profile.`);
    this.name = "DuplicateCustomerError";
    this.existing = existing;
  }
}

export async function createCustomerRecord(
  supabase: SupabaseClient,
  input: CanonicalCustomerInput,
): Promise<CanonicalCustomerRow> {
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("Customer name is required.");
  const digits = digitsOnly(input.phone ?? "");

  // Canonical duplicate protection: normalized-phone pre-check.
  // Name-only matches stay weak signals (handled by callers, never auto-merge).
  if (digits) {
    const dup = await findDuplicateCustomer(supabase, digits);
    if (dup) throw new DuplicateCustomerError(dup);
  }

  // NOTE: no `code` key anywhere here — the database trigger assigns the
  // canonical CUST-<n> ID atomically (sequence-backed, race-safe).
  const row: Record<string, unknown> = { name, is_active: true };
  row.phone = digits || null;
  const email = String(input.email ?? "").trim();
  if (email) row.email = email;
  const address = String(input.address ?? "").trim();
  if (address) row.address = address;
  const gstin = String(input.gstin ?? "").trim().toUpperCase();
  if (gstin) row.gstin = gstin;
  if (input.customer_type) row.customer_type = input.customer_type;
  if (input.balance !== undefined && input.balance !== null) row.balance = input.balance;
  if (input.extra) Object.assign(row, input.extra);

  let { data, error } = await supabase.from("customers").insert(row).select().single();
  if (error && error.message.includes("credit_limit")) {
    // Schema-drift tolerance (older DBs without credit_limit): retry without it.
    const { credit_limit, ...rest } = row as any;
    void credit_limit;
    const res = await supabase.from("customers").insert(rest).select().single();
    data = res.data;
    error = res.error;
  }
  if (error) {
    // Unique race: another terminal created the same phone concurrently.
    if (isDuplicateKeyError(error.message) && digits) {
      const dup = await findDuplicateCustomer(supabase, digits).catch(() => null);
      if (dup) throw new DuplicateCustomerError(dup);
    }
    throw new Error(error.message);
  }
  // Failure handling: never hand out a codeless customer as "created".
  if (!data || !String((data as any).code ?? "").trim()) {
    throw new Error("Customer was saved without a canonical Customer ID. Please retry — no codeless record was returned.");
  }
  return data as CanonicalCustomerRow;
}