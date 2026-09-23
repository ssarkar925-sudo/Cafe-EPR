import { createClient } from "@/lib/supabase/server";
import { getV1SessionContext, requireV1BackOffice } from "@/lib/v1/v1-auth-context";
import { listTenantRows } from "@/lib/v1/v1-server-reads";
import V1Forbidden from "@/components/v1/v1-forbidden";
import ServiceForm, { type ServiceInstrument } from "../service-form";
import { RecentServiceList, type RecentSvcRow } from "../recent-list";

interface SvcRow {
  id: string;
  transaction_number: string;
  transaction_date: string;
  amount: number;
  fee: number;
  commission: number;
  status: string;
  recorded_at: string;
  provider_ref: string | null;
  receiver_number: string | null;
  plan_ref: string | null;
}

/**
 * Recharge records (server, back-office). Frozen refs only; no telecom
 * integration and no status callbacks.
 */
export default async function V1ServicesRecharge() {
  const session = await getV1SessionContext();
  if (!requireV1BackOffice(session)) return <V1Forbidden surface="Recharge services" />;

  const supabase = await createClient();
  const [txns, instruments] = await Promise.all([
    supabase
      .from("service_transactions")
      .select(
        "id, transaction_number, transaction_date, amount, fee, commission, status, recorded_at, provider_ref, receiver_number, plan_ref",
      )
      .eq("tenant_id", session.tenantId)
      .eq("service_type", "recharge")
      .order("recorded_at", { ascending: false })
      .limit(50),
    listTenantRows<{ id: string; name: string; itype: string; is_active: boolean }>(
      supabase,
      "payment_instruments",
      "id, name, itype, is_active",
      session.tenantId,
      { column: "name" },
      100,
    ),
  ]);

  const error = txns.error?.message ?? instruments.error;
  if (error) {
    return (
      <div className="mx-auto max-w-3xl">
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          Recharge records failed to load: {error}
        </p>
      </div>
    );
  }

  const rows: RecentSvcRow[] = ((txns.data ?? []) as SvcRow[]).map((r) => ({
    id: r.id,
    transaction_number: r.transaction_number,
    transaction_date: r.transaction_date,
    amount: Number(r.amount),
    fee: Number(r.fee),
    commission: Number(r.commission),
    status: r.status,
    recorded_at: r.recorded_at,
    refs: [
      { label: "provider", value: r.provider_ref ?? "—" },
      { label: "receiver", value: r.receiver_number ?? "—" },
      ...(r.plan_ref ? [{ label: "plan", value: r.plan_ref }] : []),
    ],
  }));

  const activeInstruments: ServiceInstrument[] = (instruments.rows ?? [])
    .filter((i) => i.is_active === true)
    .map((i) => ({ id: i.id, name: i.name, itype: i.itype }));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">Recharge</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Record-only. Recording here creates a local record only — no recharge is performed by any provider.
        </p>
      </div>
      <section
        aria-label="Record recharge transaction"
        className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"
      >
        <ServiceForm type="recharge" instruments={activeInstruments} />
      </section>
      <section
        aria-label="Recent recharge records"
        className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"
      >
        <h2 className="text-sm font-extrabold tracking-tight">Recent records</h2>
        <RecentServiceList rows={rows} />
      </section>
    </div>
  );
}
