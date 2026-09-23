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
  biller_ref: string | null;
  consumer_number: string | null;
  bill_amount: number | null;
}

/**
 * BBPS records (server, back-office). Exactly the frozen G5 field set:
 * biller + consumer + bill amount. No bill-fetch APIs, biller APIs,
 * gateway calls, credentials, or settlement data.
 */
export default async function V1ServicesBbps() {
  const session = await getV1SessionContext();
  if (!requireV1BackOffice(session)) return <V1Forbidden surface="BBPS services" />;

  const supabase = await createClient();
  const [txns, instruments] = await Promise.all([
    supabase
      .from("service_transactions")
      .select(
        "id, transaction_number, transaction_date, amount, fee, commission, status, recorded_at, biller_ref, consumer_number, bill_amount",
      )
      .eq("tenant_id", session.tenantId)
      .eq("service_type", "bbps")
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
          BBPS records failed to load: {error}
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
      { label: "biller", value: r.biller_ref ?? "—" },
      { label: "consumer", value: r.consumer_number ?? "—" },
      { label: "bill", value: r.bill_amount === null ? "—" : Number(r.bill_amount).toFixed(2) },
    ],
  }));

  const activeInstruments: ServiceInstrument[] = (instruments.rows ?? [])
    .filter((i) => i.is_active === true)
    .map((i) => ({ id: i.id, name: i.name, itype: i.itype }));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">BBPS</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Record-only. Recording here creates a local record only — no bill is fetched or paid through any provider.
        </p>
      </div>
      <section
        aria-label="Record BBPS transaction"
        className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"
      >
        <ServiceForm type="bbps" instruments={activeInstruments} />
      </section>
      <section
        aria-label="Recent BBPS records"
        className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"
      >
        <h2 className="text-sm font-extrabold tracking-tight">Recent records</h2>
        <RecentServiceList rows={rows} />
      </section>
    </div>
  );
}
