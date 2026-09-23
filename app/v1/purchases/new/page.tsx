import { createClient } from "@/lib/supabase/server";
import { getV1SessionContext, requireV1BackOffice } from "@/lib/v1/v1-auth-context";
import { listTenantRows } from "@/lib/v1/v1-server-reads";
import V1Forbidden from "@/components/v1/v1-forbidden";
import IntakeTabs from "./tabs";

/** New intake (server option lists + client intake tabs). Back-office only. */
export default async function V1PurchaseNew() {
  const session = await getV1SessionContext();
  if (!requireV1BackOffice(session)) return <V1Forbidden surface="Purchase intake" />;

  const supabase = await createClient();
  const [suppliers, products] = await Promise.all([
    listTenantRows<{ id: string; name: string; is_active: boolean }>(
      supabase,
      "suppliers",
      "id, name, is_active",
      session.tenantId,
      { column: "name" },
      500,
    ),
    listTenantRows<{ id: string; name: string; unit: string; is_active: boolean }>(
      supabase,
      "products",
      "id, name, unit, is_active",
      session.tenantId,
      { column: "name" },
      500,
    ),
  ]);

  const error = suppliers.error ?? products.error;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">New intake</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Expiry is mandatory per line — unknown expiry is rejected server-side and never fabricated
          here. Only active suppliers and products are offered.
        </p>
      </div>
      {error ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      ) : (
        <IntakeTabs
          suppliers={suppliers.rows.filter((s) => s.is_active).map((s) => ({ id: s.id, name: s.name }))}
          products={products.rows.filter((p) => p.is_active).map((p) => ({ id: p.id, name: p.name, unit: p.unit }))}
        />
      )}
    </div>
  );
}
