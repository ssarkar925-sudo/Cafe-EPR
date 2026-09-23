import { createClient } from "@/lib/supabase/server";
import { getV1SessionContext, requireV1BackOffice } from "@/lib/v1/v1-auth-context";
import { listTenantRows } from "@/lib/v1/v1-server-reads";
import V1Forbidden from "@/components/v1/v1-forbidden";
import { MasterManager, type MasterEntityConfig } from "../forms";

const CONFIG: MasterEntityConfig = {
  rpc: "mg_instrument_upsert",
  idParam: "p_id",
  fields: [
    { key: "name", param: "p_name", label: "Name", type: "text", required: true, placeholder: "e.g. Cash Drawer" },
    {
      key: "itype",
      param: "p_itype",
      label: "Type",
      type: "select",
      required: true,
      options: ["cash", "bank", "upi_qr", "wallet", "card", "aeps_portal", "dmt_portal"],
    },
    { key: "is_active", param: "p_is_active", label: "Active", type: "checkbox" },
  ],
};

export default async function V1Instruments() {
  const session = await getV1SessionContext();
  if (!requireV1BackOffice(session)) return <V1Forbidden surface="Instruments" />;

  const supabase = await createClient();
  const { rows, error } = await listTenantRows<Record<string, unknown>>(
    supabase,
    "payment_instruments",
    "id, name, itype, is_active, current_balance",
    session.tenantId,
    { column: "name" },
    200,
  );

  if (error) {
    return (
      <div className="mx-auto max-w-4xl">
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      </div>
    );
  }

  return (
    <MasterManager
      title="Instruments"
      description="Payment accounts. Balances are server-maintained and shown as returned; account mapping lives under Admin → Financial configuration."
      config={CONFIG}
      columns={[
        { key: "name", label: "Name" },
        { key: "itype", label: "Type" },
        { key: "current_balance", label: "Balance" },
        { key: "is_active", label: "Active" },
      ]}
      rows={rows}
    />
  );
}
