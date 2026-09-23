"use client";

/**
 * Back-entry history, void, and suspense resolution — V1 Historical
 * Back-entry (client islands).
 *
 * Reads arrive as server snapshots (props). Void uses void_back_entry_batch
 * (admin, posted-only, symmetric stock reversal + journal reversals,
 * batch marked voided — never deleted). Suspense resolution uses
 * resolve_suspense with outcome resolved|excluded plus an optional note;
 * any correcting batch is submitted separately through the batch form.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callV1Mutation } from "@/lib/v1/v1-rpc";
import { V1Confirm } from "@/components/v1/v1-mutation";

export interface HistoryBatch {
  id: string;
  batch_key: string;
  reason: string;
  status: string;
  created_at: string;
  response: { lines_posted?: number; lines_parked?: number } | null;
}

export interface HistoryLine {
  batch_id: string;
  line_no: number;
  line_type: string;
  source_ref: string;
  business_date: string;
  qty: number | null;
  amount: number | null;
  lot_mode: string;
}

export interface SuspenseRow {
  id: string;
  batch_id: string | null;
  source_ref: string;
  kind: string;
  reason: string;
  status: string;
  created_at: string;
  resolution_note: string | null;
  resolved_at: string | null;
}

function VoidBatchButton({ batchId, batchKey }: { batchId: string; batchKey: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voided, setVoided] = useState(false);

  async function onConfirm(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // void_back_entry_batch takes no idempotency key: replay safety comes
      // from the contract itself (a second void rejects as non-posted).
      const res = await callV1Mutation("void_back_entry_batch", { p_batch_id: batchId });
      if (res.error) {
        setError(res.error.message);
        return;
      }
      setVoided(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (voided) {
    return (
      <p role="status" className="text-xs font-bold text-teal-700 dark:text-teal-300">
        Voided. The historical record is preserved with voided status.
      </p>
    );
  }

  return (
    <span>
      <V1Confirm
        label="Void batch"
        title={`Void batch ${batchKey}?`}
        body="Reverses stock effects and batch journals symmetrically and marks the batch voided. The historical record is preserved, never deleted. Fails closed if lots were already consumed."
        confirmLabel="Void batch"
        onConfirm={onConfirm}
        disabled={busy}
      />
      {error && (
        <span role="alert" className="mt-1 block text-xs font-semibold text-rose-600 dark:text-rose-400">
          {error}
        </span>
      )}
    </span>
  );
}

function ResolveSuspenseForm({ suspenseId }: { suspenseId: string }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState("resolved");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function resolve(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await callV1Mutation("resolve_suspense", {
        p_suspense_id: suspenseId,
        p_outcome: outcome,
        p_note: note.trim(),
      });
      if (res.error) {
        setError(res.error.message);
        return;
      }
      setDone(outcome);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p role="status" className="text-xs font-bold text-teal-700 dark:text-teal-300">
        Marked {done}. A correcting batch, if needed, is submitted separately.
      </p>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <select
        value={outcome}
        onChange={(e) => setOutcome(e.target.value)}
        aria-label="Resolution outcome"
        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold dark:border-white/10 dark:bg-white/5"
      >
        <option value="resolved">resolved</option>
        <option value="excluded">excluded</option>
      </select>
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Resolution note (optional)"
        aria-label="Resolution note"
        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-white/10 dark:bg-white/5"
      />
      <button
        type="button"
        onClick={resolve}
        disabled={busy}
        className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
      >
        {busy ? "Resolving…" : "Resolve"}
      </button>
      {error && (
        <span role="alert" className="w-full text-xs font-semibold text-rose-600 dark:text-rose-400">
          {error}
        </span>
      )}
    </span>
  );
}

export function BackEntryHistory({
  batches,
  lines,
}: {
  batches: HistoryBatch[];
  lines: HistoryLine[];
}) {
  if (batches.length === 0) {
    return (
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        No batches submitted yet.
      </p>
    );
  }
  const byBatch = new Map<string, HistoryLine[]>();
  for (const l of lines) {
    const arr = byBatch.get(l.batch_id) ?? [];
    arr.push(l);
    byBatch.set(l.batch_id, arr);
  }
  return (
    <ul className="mt-2 divide-y divide-slate-100 dark:divide-white/5">
      {batches.map((b) => (
        <li key={b.id} className="py-2">
          <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
            <span className="font-mono">{b.batch_key}</span>
            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold dark:bg-white/10">
              {b.status}
            </span>
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
              {b.created_at.slice(0, 19).replace("T", " ")} · posted{" "}
              {b.response?.lines_posted ?? "—"}
              {typeof b.response?.lines_parked === "number" && b.response.lines_parked > 0
                ? ` · parked ${b.response.lines_parked}`
                : ""}
            </span>
            {b.status === "posted" && <VoidBatchButton batchId={b.id} batchKey={b.batch_key} />}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{b.reason}</p>
          {(byBatch.get(b.id) ?? []).length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {(byBatch.get(b.id) ?? []).map((l) => (
                <li key={`${l.batch_id}:${l.line_no}`} className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  #{l.line_no} {l.line_type} · {l.source_ref} · {l.business_date}
                  {l.qty !== null ? ` · qty ${l.qty}` : ""}
                  {l.amount !== null ? ` · amt ${l.amount}` : ""} · {l.lot_mode}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

export function SuspenseList({
  rows,
  batchKeys,
}: {
  rows: SuspenseRow[];
  batchKeys: Map<string, string>;
}) {
  const parked = rows.filter((r) => r.status === "parked");
  const decided = rows.filter((r) => r.status !== "parked");
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-extrabold tracking-tight">Parked ({parked.length})</h3>
        {parked.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Nothing parked.</p>
        ) : (
          <ul className="mt-1 divide-y divide-slate-100 dark:divide-white/5">
            {parked.map((r) => (
              <li key={r.id} className="space-y-1 py-2">
                <p className="text-sm font-bold">
                  {r.source_ref} · <span className="font-mono text-xs">{r.kind}</span>
                  {r.batch_id && batchKeys.get(r.batch_id) ? (
                    <span className="ml-2 font-mono text-[11px] text-slate-500">batch {batchKeys.get(r.batch_id)}</span>
                  ) : null}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{r.reason}</p>
                <ResolveSuspenseForm suspenseId={r.id} />
              </li>
            ))}
          </ul>
        )}
      </div>
      {decided.length > 0 && (
        <div>
          <h3 className="text-sm font-extrabold tracking-tight">Decided ({decided.length})</h3>
          <ul className="mt-1 divide-y divide-slate-100 dark:divide-white/5">
            {decided.map((r) => (
              <li key={r.id} className="py-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-mono font-bold">{r.source_ref}</span> · {r.status}
                {r.resolution_note ? ` · ${r.resolution_note}` : ""}
                {r.resolved_at ? ` · ${r.resolved_at.slice(0, 19).replace("T", " ")}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
