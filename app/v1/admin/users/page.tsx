import { createClient } from "@/lib/supabase/server";
import { getV1SessionContext, requireV1Admin } from "@/lib/v1/v1-auth-context";
import { listTenantRows } from "@/lib/v1/v1-server-reads";
import V1Forbidden from "@/components/v1/v1-forbidden";
import V1AdminTable from "@/components/v1/v1-admin-table";

interface ProfileRow {
  id: string;
  user_id: string;
  tenant_id: string;
  display_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

/**
 * Users & roles (server, read-only). The V1 baseline exposes no
 * profile-mutation RPC (role/activation changes are not in the G0–G13
 * contract), so this surface lists V1 profiles without edit controls
 * rather than inventing a mutation path.
 */
export default async function V1AdminUsers() {
  const session = await getV1SessionContext();
  if (!requireV1Admin(session)) return <V1Forbidden surface="Users & roles" />;

  const supabase = await createClient();
  const { rows, error } = await listTenantRows<ProfileRow>(
    supabase,
    "profiles",
    "id, user_id, tenant_id, display_name, role, is_active, created_at",
    session.tenantId,
    { column: "display_name" },
    200,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">Users & roles</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          V1 profiles for this tenant. Role changes and activation are not part of the V1 RPC
          contract, so no edit controls are offered here.
        </p>
      </div>
      {error ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      ) : (
        <V1AdminTable
          columns={[
            { key: "display_name", label: "Display name" },
            { key: "role", label: "Role" },
            { key: "is_active", label: "Active" },
            { key: "user_id", label: "User id", mono: true },
            { key: "created_at", label: "Created", mono: true },
          ]}
          rows={rows}
          rowKey={(r) => String(r.id)}
          emptyText="No profiles in this tenant."
        />
      )}
    </div>
  );
}
