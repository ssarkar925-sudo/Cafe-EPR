import { createClient } from "@/lib/supabase/server";
import { getV1SessionContext, requireV1Admin } from "@/lib/v1/v1-auth-context";
import { listReferenceRows } from "@/lib/v1/v1-server-reads";
import V1Forbidden from "@/components/v1/v1-forbidden";
import V1AdminTable from "@/components/v1/v1-admin-table";

/**
 * Dormant tax masters (server, read-only). HSN / SAC / effective-dated rates
 * are reference data only: this surface performs no calculations on the
 * dormant masters, posts nothing, and files nothing.
 */
export default async function V1AdminTax() {
  const session = await getV1SessionContext();
  if (!requireV1Admin(session)) return <V1Forbidden surface="Dormant tax masters" />;

  const supabase = await createClient();
  const [hsn, sac, rates] = await Promise.all([
    listReferenceRows<Record<string, unknown>>(supabase, "hsn_codes", "code, description", { column: "code" }, 500),
    listReferenceRows<Record<string, unknown>>(supabase, "sac_codes", "code, description", { column: "code" }, 500),
    listReferenceRows<Record<string, unknown>>(
      supabase,
      "tax_rates",
      "hsn_code, rate, effective_from, effective_to, is_active",
      { column: "hsn_code" },
      500,
    ),
  ]);

  const error = hsn.error ?? sac.error ?? rates.error;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">Dormant tax masters</h1>
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
          Dormant in V1. Reference data only — no tax is calculated, posted, or filed anywhere in
          this application.
        </div>
      </div>
      {error ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-extrabold tracking-tight">HSN codes</h2>
            <V1AdminTable
              columns={[{ key: "code", label: "Code", mono: true }, { key: "description", label: "Description" }]}
              rows={hsn.rows}
              rowKey={(r) => String(r.code)}
              emptyText="No HSN rows."
            />
          </section>
          <section className="space-y-3">
            <h2 className="text-sm font-extrabold tracking-tight">SAC codes</h2>
            <V1AdminTable
              columns={[{ key: "code", label: "Code", mono: true }, { key: "description", label: "Description" }]}
              rows={sac.rows}
              rowKey={(r) => String(r.code)}
              emptyText="No SAC rows."
            />
          </section>
          <section className="space-y-3">
            <h2 className="text-sm font-extrabold tracking-tight">Tax rates (effective-dated)</h2>
            <V1AdminTable
              columns={[
                { key: "hsn_code", label: "HSN", mono: true },
                { key: "rate", label: "Rate" },
                { key: "effective_from", label: "From", mono: true },
                { key: "effective_to", label: "To", mono: true },
                { key: "is_active", label: "Active" },
              ]}
              rows={rates.rows}
              rowKey={(r, i) => `${String(r.hsn_code)}-${String(r.effective_from)}-${i}`}
              emptyText="No rate rows."
            />
          </section>
        </>
      )}
    </div>
  );
}
