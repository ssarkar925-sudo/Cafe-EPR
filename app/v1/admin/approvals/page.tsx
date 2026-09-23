import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getV1SessionContext, requireV1Admin } from "@/lib/v1/v1-auth-context";
import { listTenantRows } from "@/lib/v1/v1-server-reads";
import V1Forbidden from "@/components/v1/v1-forbidden";
import V1AdminTable from "@/components/v1/v1-admin-table";
import { ApprovalDecision } from "./actions";

interface ApprovalRow {
  id: string;
  scope_hash: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  reason: string | null;
  requester_profile_id: string | null;
  approver_profile_id: string | null;
  requested_at: string;
  expires_at: string;
  decided_at: string | null;
  status: string;
  details: { discount_amount?: number } | null;
}

const STATUSES = ["pending", "consumed", "rejected"] as const;

/**
 * Approval inspection + decisions (server + client islands). Shows
 * requester, approver, scope, reason, expiry, and a derived self-approval
 * marker (requester = approver). Pending rows carry Approve / Reject
 * actions that call approve_override / reject_approval through the V1
 * mutation wrapper; both RPCs enforce admin-only, pending-only,
 * expiry/SoD, and server-side audit.
 */
export default async function V1AdminApprovals({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getV1SessionContext();
  if (!requireV1Admin(session)) return <V1Forbidden surface="Approvals" />;

  const params = await searchParams;
  const status = STATUSES.includes(params.status as (typeof STATUSES)[number])
    ? (params.status as string)
    : "pending";

  const supabase = await createClient();
  const { rows, error } = await listTenantRows<ApprovalRow>(
    supabase,
    "approvals",
    "id, scope_hash, entity_type, entity_id, action, reason, requester_profile_id, approver_profile_id, requested_at, expires_at, decided_at, status, details",
    session.tenantId,
    { column: "requested_at", ascending: false },
    200,
  );

  const filtered = rows.filter((r) => r.status === status);
  const withSelf = filtered.map((r) => ({
    ...r,
    self_approved:
      r.requester_profile_id !== null &&
      r.approver_profile_id !== null &&
      r.requester_profile_id === r.approver_profile_id
        ? "yes"
        : "no",
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">Approvals</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Inspect approval records. Self-approval is derived (requester = approver) under the D5
          sole-Admin rule. Consumption happens in later-phase workflows, not here.
        </p>
      </div>
      <div className="flex gap-2" role="tablist" aria-label="Approval status">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/v1/admin/approvals?status=${s}`}
            aria-current={status === s ? "page" : undefined}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
              status === s
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            }`}
          >
            {s}
          </Link>
        ))}
      </div>
      {error ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      ) : (
        <V1AdminTable
          columns={[
            { key: "requested_at", label: "Requested", mono: true },
            { key: "action", label: "Action", mono: true },
            { key: "entity_type", label: "Entity", mono: true },
            { key: "scope_hash", label: "Scope", mono: true },
            { key: "reason", label: "Reason" },
            { key: "requester_profile_id", label: "Requester", mono: true },
            { key: "approver_profile_id", label: "Approver", mono: true },
            { key: "self_approved", label: "Self" },
            { key: "expires_at", label: "Expires", mono: true },
            { key: "decided_at", label: "Decided", mono: true },
          ]}
          rows={withSelf}
          rowKey={(r) => String(r.id)}
          emptyText={`No ${status} approvals.`}
        />
      )}
      {!error && status === "pending" && filtered.length > 0 && (
        <section aria-label="Decide approvals" className="space-y-2">
          <h2 className="text-sm font-extrabold tracking-tight">Decide</h2>
          {filtered.map((r) => (
            <ApprovalDecision
              key={String(r.id)}
              id={String(r.id)}
              scopeHash={String(r.scope_hash)}
              action={String(r.action)}
              reason={typeof r.reason === "string" ? r.reason : null}
              discountAmount={
                r.details && typeof r.details.discount_amount === "number" ? r.details.discount_amount : null
              }
            />
          ))}
        </section>
      )}
    </div>
  );
}
