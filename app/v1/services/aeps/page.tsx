import { createClient } from "@/lib/supabase/server";
import { getV1SessionContext, requireV1BackOffice } from "@/lib/v1/v1-auth-context";
import { listTenantRows } from "@/lib/v1/v1-server-reads";
import V1Forbidden from "@/components/v1/v1-forbidden";
import AepsModernClient from "./aeps-modern-client";
import type { RecentSvcRow } from "../recent-list";

interface SvcRow {
  id: string;
  transaction_number: string;
  transaction_date: string;
  amount: number;
  fee: number;
  commission: number;
  status: string;
  recorded_at: string;
  aadhaar_last4: string | null;
  bank_ref: string | null;
  portal_ref: string | null;
  aeps_txn_type: string | null;
}

/**
 * AEPS records (server, back-office). Frozen G5 fields only; Aadhaar
 * last-4 maximum. Posting follows the approved server-side behavior;
 * the UI never chooses accounts.
 */
export default async function V1ServicesAeps() {
  const session = await getV1SessionContext();
  if (!requireV1BackOffice(session)) return <V1Forbidden surface="AEPS services" />;

  const supabase = await createClient();
  const [txns, instruments] = await Promise.all([
    supabase
      .from("service_transactions")
      .select(
        "id, transaction_number, transaction_date, amount, fee, commission, status, recorded_at, aadhaar_last4, bank_ref, portal_ref, aeps_txn_type",
      )
      .eq("tenant_id", session.tenantId)
      .eq("service_type", "aeps")
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
          AEPS records failed to load: {error}
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
      { label: "aadhaar", value: `•••• ${r.aadhaar_last4 ?? "—"}` },
      { label: "type", value: r.aeps_txn_type ?? "—" },
      ...(r.bank_ref ? [{ label: "bank", value: r.bank_ref }] : []),
      ...(r.portal_ref ? [{ label: "portal", value: r.portal_ref }] : []),
    ],
  }));

  const activeInstruments = (instruments.rows ?? [])
    .filter((i) => i.is_active === true)
    .map((i) => ({ id: i.id, name: i.name, itype: i.itype }));

  return <AepsModernClient rows={rows} instruments={activeInstruments} />
}
