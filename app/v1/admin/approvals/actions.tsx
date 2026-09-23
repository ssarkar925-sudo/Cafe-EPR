"use client";

/**
 * Approval decision actions — Phase 6 Step 3 (client island).
 *
 * Completes the existing read-only Admin approvals surface with the
 * decision path the baseline already defines: approve_override and
 * reject_approval, both admin-only, pending-only, and audited
 * server-side. Called exclusively through the V1 mutation wrapper;
 * approvals and audit tables are never written directly.
 */

import { useState } from "react";
import { useV1Mutation } from "@/components/v1/v1-mutation";

export function ApprovalDecision({
  id,
  scopeHash,
  action,
  reason,
  discountAmount,
}: {
  id: string;
  scopeHash: string;
  action: string;
  reason: string | null;
  discountAmount: number | null;
}) {
  const approve = useV1Mutation();
  const reject = useV1Mutation();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [decided, setDecided] = useState<string | null>(null);

  async function onApprove(): Promise<void> {
    const data = await approve.run("approve_override", { p_approval_id: id });
    if (data) setDecided("consumed");
  }

  async function onReject(): Promise<void> {
    if (rejectReason.trim() === "") return;
    const data = await reject.run("reject_approval", { p_approval_id: id, p_reason: rejectReason.trim() });
    if (data) {
      setDecided("rejected");
      setRejectOpen(false);
    }
  }

  if (decided) {
    return (
      <p role="status" className="text-xs font-bold text-teal-700 dark:text-teal-300">
        Decided: {decided}. The list refreshes automatically.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-slate-100 p-3 dark:border-white/5">
      <p className="text-sm font-bold">
        {action} · <span className="font-mono text-xs">{scopeHash.slice(0, 12)}…</span>
      </p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        Reason: {reason ?? "—"}
        {discountAmount !== null ? ` · discount ${discountAmount.toFixed(2)}` : ""}
      </p>
      {(approve.error || reject.error) && (
        <p role="alert" className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
          {approve.error ?? reject.error}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onApprove}
          disabled={approve.pending || reject.pending}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {approve.pending ? "Approving…" : "Approve"}
        </button>
        {!rejectOpen ? (
          <button
            type="button"
            onClick={() => setRejectOpen(true)}
            disabled={approve.pending || reject.pending}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            Reject…
          </button>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Rejection reason (required)"
              aria-label="Rejection reason"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-white/10 dark:bg-white/5"
            />
            <button
              type="button"
              onClick={onReject}
              disabled={reject.pending || rejectReason.trim() === ""}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-rose-700 disabled:opacity-50"
            >
              {reject.pending ? "Rejecting…" : "Confirm reject"}
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
