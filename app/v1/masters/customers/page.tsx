import { createClient } from "@/lib/supabase/server";
import { getV1SessionContext, requireV1BackOffice } from "@/lib/v1/v1-auth-context";
import { listTenantRows } from "@/lib/v1/v1-server-reads";
import V1Forbidden from "@/components/v1/v1-forbidden";
import { MasterManager, type MasterEntityConfig } from "../forms";

const CONFIG: MasterEntityConfig = {
  rpc: "mg_customer_upsert",
  idParam: "p_id",
  fields: [
    { key: "name", param: "p_name", label: "Name", type: "text", required: true, placeholder: "Customer name" },
    { key: "phone", param: "p_phone", label: "Phone", type: "text", placeholder: "Optional" },
    { key: "credit_limit", param: "p_credit_limit", label: "Credit limit (₹)", type: "number", placeholder: "Optional" },
    { key: "is_active", param: "p_is_active", label: "Active", type: "checkbox" },
  ],
};

export default async function V1Customers() {
  const session = await getV1SessionContext();
  if (!requireV1BackOffice(session)) return <V1Forbidden surface="Customers" />;

  const supabase = await createClient();
  const { rows, error } = await listTenantRows<Record<string, unknown>>(
    supabase,
    "customers",
    "id, name, phone, credit_limit, is_active",
    session.tenantId,
    { column: "name" },
    300,
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
      title="Customers"
      description="Khata customers. Limits are enforced server-side at sale time; dues are derived, never stored."
      config={CONFIG}
      columns={[
        { key: "name", label: "Name" },
        { key: "phone", label: "Phone" },
        { key: "credit_limit", label: "Credit limit" },
        { key: "is_active", label: "Active" },
      ]}
      rows={rows}
    />
  );
}
