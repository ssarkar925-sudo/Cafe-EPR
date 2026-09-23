import { createClient } from "@/lib/supabase/server";
import { getV1SessionContext, requireV1Admin } from "@/lib/v1/v1-auth-context";
import { listReferenceRows, listTenantRows } from "@/lib/v1/v1-server-reads";
import V1Forbidden from "@/components/v1/v1-forbidden";
import V1AdminTable from "@/components/v1/v1-admin-table";
import { CoaActiveToggle, CoaEditButton, InstrumentMapForm } from "./forms";

interface CoaRow {
  id: string;
  code: string;
  name: string;
  account_type: string;
  is_active: boolean;
}

interface InstrumentRow {
  id: string;
  name: string;
  itype: string;
  is_active: boolean;
  current_balance: number;
}

interface MapRow {
  instrument_id: string;
  account_id: string;
}

/**
 * Financial configuration (server + client islands). CoA heads: rename and
 * activate/deactivate only (mg_coa_head_update; code/type structural).
 * Instrument→account mapping via set_instrument_account. No posting math,
 * no journal computation in the UI — server state displayed as returned.
 */
export default async function V1AdminFinance() {
  const session = await getV1SessionContext();
  if (!requireV1Admin(session)) return <V1Forbidden surface="Financial configuration" />;

  const supabase = await createClient();
  const [coa, instruments, mappings] = await Promise.all([
    listTenantRows<CoaRow>(
      supabase,
      "chart_of_accounts",
      "id, code, name, account_type, is_active",
      session.tenantId,
      { column: "code" },
      200,
    ),
    listTenantRows<InstrumentRow>(
      supabase,
      "payment_instruments",
      "id, name, itype, is_active, current_balance",
      session.tenantId,
      { column: "name" },
      200,
    ),
    // instrument_account_map carries no tenant_id (scoped server-side via its
    // instrument join); filter to this tenant's instruments after the read.
    listReferenceRows<MapRow>(supabase, "instrument_account_map", "instrument_id, account_id"),
  ]);

  const error = coa.error ?? instruments.error ?? mappings.error;
  const accountById = new Map(coa.rows.map((a) => [a.id, a]));
  const tenantInstrumentIds = new Set(instruments.rows.map((i) => i.id));
  const codeByInstrument = new Map(
    mappings.rows
      .filter((m) => tenantInstrumentIds.has(m.instrument_id))
      .map((m) => [m.instrument_id, accountById.get(m.account_id)?.code ?? null]),
  );
  const accountOptions = coa.rows
    .filter((a) => a.is_active)
    .map((a) => ({ id: a.id, code: a.code, name: a.name }));

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">Chart of Accounts & mapping</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Admin-only. Heads can be renamed or activated/deactivated; codes and types never change
          here. Balances are server-maintained and shown as returned.
        </p>
      </div>
      {error ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-extrabold tracking-tight">Chart of Accounts</h2>
            <V1AdminTable
              columns={[
                { key: "code", label: "Code", mono: true },
                { key: "name", label: "Name" },
                { key: "account_type", label: "Type" },
                { key: "is_active", label: "Active" },
              ]}
              rows={coa.rows}
              rowKey={(r) => String(r.id)}
              emptyText="No CoA heads."
              actions={(row) => {
                const head = row as unknown as CoaRow;
                return (
                  <span className="flex gap-2">
                    <CoaEditButton head={head} />
                    <CoaActiveToggle head={head} />
                  </span>
                );
              }}
            />
          </section>
          <section className="space-y-3">
            <h2 className="text-sm font-extrabold tracking-tight">Instrument → account mapping</h2>
            <V1AdminTable
              columns={[
                { key: "name", label: "Instrument" },
                { key: "itype", label: "Type" },
                { key: "mapped", label: "Mapped account" },
                { key: "current_balance", label: "Balance" },
              ]}
              rows={instruments.rows.map((i) => ({
                ...i,
                mapped: codeByInstrument.get(i.id) ?? null,
              }))}
              rowKey={(r) => String(r.id)}
              emptyText="No instruments."
              actions={(row) => (
                <InstrumentMapForm
                  instrumentId={String(row.id)}
                  instrumentName={String(row.name)}
                  currentCode={(row.mapped as string | null) ?? null}
                  accounts={accountOptions}
                />
              )}
            />
          </section>
        </>
      )}
    </div>
  );
}
