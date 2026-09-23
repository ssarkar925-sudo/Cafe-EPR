import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getV1SessionContext, requireV1BackOffice } from "@/lib/v1/v1-auth-context";
import { listTenantRows } from "@/lib/v1/v1-server-reads";
import V1Forbidden from "@/components/v1/v1-forbidden";
import V1AdminTable from "@/components/v1/v1-admin-table";

interface PurchaseRow {
  id: string;
  supplier_id: string;
  purchase_date: string;
  subtotal: number;
  total: number;
  created_at: string;
}

/** Purchases list (server, back-office). Detail links carry the server ids. */
export default async function V1Purchases() {
  const session = await getV1SessionContext();
  if (!requireV1BackOffice(session)) return <V1Forbidden surface="Purchases" />;

  const supabase = await createClient();
  const [purchases, suppliers] = await Promise.all([
    listTenantRows<PurchaseRow>(
      supabase,
      "purchases",
      "id, supplier_id, purchase_date, subtotal, total, created_at",
      session.tenantId,
      { column: "purchase_date", ascending: false },
      100,
    ),
    listTenantRows<{ id: string; name: string }>(
      supabase,
      "suppliers",
      "id, name",
      session.tenantId,
      { column: "name" },
      500,
    ),
  ]);

  const error = purchases.error ?? suppliers.error;
  const supplierName = new Map(suppliers.rows.map((s) => [s.id, s.name]));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Purchases</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Purchase documents. Each line creates exactly one stock lot server-side.
          </p>
        </div>
        <Link
          href="/v1/purchases/new"
          className="shrink-0 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          New intake
        </Link>
      </div>
      {error ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      ) : (
        <V1AdminTable
          columns={[
            { key: "purchase_date", label: "Date", mono: true },
            { key: "supplier", label: "Supplier" },
            { key: "subtotal", label: "Subtotal" },
            { key: "total", label: "Total" },
          ]}
          rows={purchases.rows.map((p) => ({
            ...p,
            supplier: supplierName.get(p.supplier_id) ?? p.supplier_id.slice(0, 8),
          }))}
          rowKey={(r) => String(r.id)}
          emptyText="No purchases yet."
          actions={(row) => (
            <Link href={`/v1/purchases/${String(row.id)}`} className="text-xs font-bold text-slate-600 underline dark:text-slate-300">
              Open
            </Link>
          )}
        />
      )}
    </div>
  );
}
