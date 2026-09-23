import { createClient } from "@/lib/supabase/server";
import { getV1SessionContext, requireV1Admin } from "@/lib/v1/v1-auth-context";
import { listTenantRows } from "@/lib/v1/v1-server-reads";
import V1Forbidden from "@/components/v1/v1-forbidden";
import V1AdminTable from "@/components/v1/v1-admin-table";

interface AuditRow {
  id: string;
  actor_profile_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  description: string | null;
  device_id: string | null;
  created_at: string;
}

/**
 * Audit trail (server, read-only). Both live logs and the archive are
 * append-only backend-side; this surface displays the latest 100 rows of
 * each for this tenant.
 */
export default async function V1AdminAudit() {
  const session = await getV1SessionContext();
  if (!requireV1Admin(session)) return <V1Forbidden surface="Audit trail" />;

  const supabase = await createClient();
  const columns = "id, actor_profile_id, action, entity, entity_id, description, device_id, created_at";
  const [live, archive] = await Promise.all([
    listTenantRows<AuditRow>(supabase, "audit_logs", columns, session.tenantId, {
      column: "created_at",
      ascending: false,
    }, 100),
    listTenantRows<AuditRow & { archived_at: string }>(
      supabase,
      "audit_archive",
      `${columns}, archived_at`,
      session.tenantId,
      { column: "created_at", ascending: false },
      100,
    ),
  ]);

  const error = live.error ?? archive.error;
  const tableColumns = [
    { key: "created_at", label: "At", mono: true },
    { key: "action", label: "Action", mono: true },
    { key: "entity", label: "Entity", mono: true },
    { key: "entity_id", label: "Entity id", mono: true },
    { key: "description", label: "Description" },
    { key: "actor_profile_id", label: "Actor", mono: true },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">Audit trail</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Append-only. Latest 100 rows per store; full history remains queryable server-side.
        </p>
      </div>
      {error ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-extrabold tracking-tight">Audit logs</h2>
            <V1AdminTable columns={tableColumns} rows={live.rows} rowKey={(r) => String(r.id)} emptyText="No audit rows." />
          </section>
          <section className="space-y-3">
            <h2 className="text-sm font-extrabold tracking-tight">Audit archive</h2>
            <V1AdminTable columns={tableColumns} rows={archive.rows} rowKey={(r) => String(r.id)} emptyText="No archived rows." />
          </section>
        </>
      )}
    </div>
  );
}
