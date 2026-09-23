/**
 * Server-side tenant-scoped reads for V1 admin/master surfaces.
 *
 * Every query filters on the caller's tenant explicitly AND runs under RLS
 * (caller-JWT server client). Never used for writes: all mutations go
 * through the allowlisted RPC proxy from client components.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function listTenantRows<T>(
  client: SupabaseClient,
  table: string,
  columns: string,
  tenantId: string,
  orderBy?: { column: string; ascending?: boolean },
  limit?: number,
): Promise<{ rows: T[]; error: string | null }> {
  try {
    let query = client.from(table).select(columns).eq("tenant_id", tenantId);
    if (orderBy) query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
    if (limit) query = query.limit(limit);
    const { data, error } = await query;
    if (error) return { rows: [], error: error.message };
    return { rows: (data ?? []) as T[], error: null };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : "Read failed." };
  }
}

/** Tenant-scoped read of global (non-tenant) reference tables, e.g. HSN. */
export async function listReferenceRows<T>(
  client: SupabaseClient,
  table: string,
  columns: string,
  orderBy?: { column: string; ascending?: boolean },
  limit?: number,
): Promise<{ rows: T[]; error: string | null }> {
  try {
    let query = client.from(table).select(columns);
    if (orderBy) query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
    if (limit) query = query.limit(limit);
    const { data, error } = await query;
    if (error) return { rows: [], error: error.message };
    return { rows: (data ?? []) as T[], error: null };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : "Read failed." };
  }
}
