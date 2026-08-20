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