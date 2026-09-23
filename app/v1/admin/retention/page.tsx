import { createClient } from "@/lib/supabase/server";
import { getV1SessionContext, requireV1Admin } from "@/lib/v1/v1-auth-context";
import { listReferenceRows, listTenantRows } from "@/lib/v1/v1-server-reads";
import V1Forbidden from "@/components/v1/v1-forbidden";
import V1AdminTable from "@/components/v1/v1-admin-table";
import { HoldCreateForm, HoldReleaseButton, PurgeRunButtons } from "./forms";

interface PolicyRow {
  entity: string;
  retain_days: number;
  archive_first: boolean;
  note: string | null;
}

interface HoldRow {
  id: string;
  entity_type: string;
  entity_id: string | null;
  entity_key: string | null;
  reason: string;
  set_by_profile: string | null;
  released_at: string | null;
  created_at: string;
}

interface PurgeRow {
  id: string;
  entity: string;
  rows_archived: number;
  rows_purged: number;
  dry_run: boolean;
  actor_label: string | null;
  reason: string | null;
  created_at: string;
}

/**
 * Retention & legal holds (server + client islands). Policies are
 * view-only (periods are owner-approved tiers, never edited here). Holds
 * suspend purge; purge execution is confirm-guarded with dry-run kept
 * visually distinct. Purge log is read-only.
 */
export default async function V1AdminRetention() {
  const session = await getV1SessionContext();
  if (!requireV1Admin(session)) return <V1Forbidden surface="Retention & legal holds" />;

  const supabase = await createClient();
  const [policies, holds, purgeLog] = await Promise.all([
    // retention_policies carries no tenant_id (global approved tiers).
    listReferenceRows<PolicyRow>(
      supabase,
      "retention_policies",
      "entity, retain_days, archive_first, note",
      { column: "entity" },
      100,
    ),
    listTenantRows<HoldRow>(
      supabase,
      "legal_holds",
      "id, entity_type, entity_id, entity_key, reason, set_by_profile, released_at, created_at",
      session.tenantId,
      { column: "created_at", ascending: false },
      200,
    ),
    listTenantRows<PurgeRow>(
      supabase,
      "purge_log",
      "id, entity, rows_archived, rows_purged, dry_run, actor_label, reason, created_at",
      session.tenantId,
      { column: "created_at", ascending: false },
      100,
    ),
  ]);

  const error = policies.error ?? holds.error ?? purgeLog.error;
  const activeHolds = holds.rows.filter((h) => !h.released_at);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">Retention & legal holds</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Admin-only. Policy periods are approved tiers and cannot change here. No direct deletes
          exist in this UI — every action runs through the G10 RPCs.
        </p>
      </div>
      {error ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-extrabold tracking-tight">Retention policies (view only)</h2>
            <V1AdminTable
              columns={[
                { key: "entity", label: "Entity", mono: true },
                { key: "retain_days", label: "Retain days" },
                { key: "archive_first", label: "Archive first" },
                { key: "note", label: "Note" },
              ]}
              rows={policies.rows}
              rowKey={(r) => String(r.entity)}
              emptyText="No policy rows."
            />
          </section>
          <section className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-extrabold tracking-tight">
                Legal holds{activeHolds.length > 0 ? ` (${activeHolds.length} active)` : ""}
              </h2>
              <HoldCreateForm />
            </div>
            <V1AdminTable
              columns={[
                { key: "entity_type", label: "Entity", mono: true },
                { key: "entity_ref", label: "Target", mono: true },
                { key: "reason", label: "Reason" },
                { key: "released_at", label: "Released", mono: true },
              ]}
              rows={activeHolds.map((h) => ({
                ...h,
                entity_ref: h.entity_id ?? h.entity_key ?? null,
              }))}
              rowKey={(r) => String(r.id)}
              emptyText="No active holds. Held rows skip purge until released."
              actions={(row) => (
                <HoldReleaseButton
                  entityType={String(row.entity_type)}
                  entityId={row.entity_id ? String(row.entity_id) : null}
                  entityKey={row.entity_key ? String(row.entity_key) : null}
                />
              )}
            />
          </section>
          <PurgeRunButtons />
          <section className="space-y-3">
            <h2 className="text-sm font-extrabold tracking-tight">Purge log (read-only)</h2>
            <V1AdminTable
              columns={[
                { key: "entity", label: "Entity", mono: true },
                { key: "rows_archived", label: "Archived" },
                { key: "rows_purged", label: "Purged" },
                { key: "dry_run", label: "Dry run" },
                { key: "created_at", label: "At", mono: true },
              ]}
              rows={purgeLog.rows}
              rowKey={(r) => String(r.id)}
              emptyText="No purge runs recorded."
            />
          </section>
        </>
      )}
    </div>
  );
}
