"use client";

/**
 * Retention operations (client islands). All actions run through the
 * documented G10 RPCs: set_legal_hold / release_legal_hold /
 * run_retention_purge. Purge execution is confirm-guarded and always shows
 * whether the run was a dry run; the server enforces Admin authorization,
 * policy gating, and hold suspension.
 */

import { useState } from "react";
import Modal from "@/components/ui/modal";
import { useV1Mutation, V1Confirm, V1Field, v1InputClass } from "@/components/v1/v1-mutation";

const HOLD_ENTITY_TYPES = ["audit_logs", "idempotency_keys"] as const;

export function HoldCreateForm() {
  const [open, setOpen] = useState(false);
  const [entityType, setEntityType] = useState<string>("audit_logs");
  const [entityId, setEntityId] = useState("");
  const [entityKey, setEntityKey] = useState("");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const mutation = useV1Mutation();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason.trim()) {
      setFormError("A reason is required (holds are reason-coded).");
      return;
    }
    const hasId = entityId.trim() !== "";
    const hasKey = entityKey.trim() !== "";
    if (hasId === hasKey) {
      setFormError("Set exactly one of entity id (uuid rows) or entity key (scope:key).");
      return;
    }
    setFormError(null);
    const result = await mutation.run("set_legal_hold", {
      p_entity_type: entityType,
      p_entity_id: hasId ? entityId.trim() : null,
      p_entity_key: hasKey ? entityKey.trim() : null,
      p_reason: reason.trim(),
    });
    if (result !== null) {
      setOpen(false);
      setEntityId("");
      setEntityKey("");
      setReason("");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setFormError(null);
          mutation.reset();
          setOpen(true);
        }}
        className="shrink-0 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
      >
        New hold
      </button>
      {open && (
        <Modal
          as="form"
          onSubmit={submit}
          size="md"
          accent="amber"
          title="Set legal hold"
          subtitle="Held rows skip purge until released. Holds are Admin-set and audited."
          onClose={() => setOpen(false)}
          footer={
            <div className="flex w-full gap-2.5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={mutation.pending}
                className="flex-1 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                {mutation.pending ? "Saving…" : "Set hold"}
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-3 py-2 sm:grid-cols-2">
            <V1Field label="Entity type" htmlFor="hold-entity-type">
              <select
                id="hold-entity-type"
                className={v1InputClass}
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                disabled={mutation.pending}
              >
                {HOLD_ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </V1Field>
            <V1Field label="Reason (required)" htmlFor="hold-reason">
              <input
                id="hold-reason"
                className={v1InputClass}
                value={reason}
                maxLength={240}
                onChange={(e) => setReason(e.target.value)}
                disabled={mutation.pending}
              />
            </V1Field>
            <V1Field label="Entity id (uuid rows)" htmlFor="hold-entity-id">
              <input
                id="hold-entity-id"
                className={v1InputClass}
                value={entityId}
                placeholder="Exactly one of id / key"
                onChange={(e) => setEntityId(e.target.value)}
                disabled={mutation.pending}
              />
            </V1Field>
            <V1Field label="Entity key (scope:key)" htmlFor="hold-entity-key">
              <input
                id="hold-entity-key"
                className={v1InputClass}
                value={entityKey}
                placeholder="e.g. create_sale:abc-123"
                onChange={(e) => setEntityKey(e.target.value)}
                disabled={mutation.pending}
              />
            </V1Field>
          </div>
          {(formError || mutation.error) && (
            <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">
              {formError ?? mutation.error}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}

export function HoldReleaseButton({
  entityType,
  entityId,
  entityKey,
}: {
  entityType: string;
  entityId: string | null;
  entityKey: string | null;
}) {
  const mutation = useV1Mutation();
  return (
    <V1Confirm
      label="Release"
      title="Release legal hold"
      body="The hold lifts; the row becomes purge-eligible under its policy again. The release is audited."
      confirmLabel="Release hold"
      onConfirm={() =>
        mutation.run("release_legal_hold", {
          p_entity_type: entityType,
          p_entity_id: entityId,
          p_entity_key: entityKey,
        })
      }
      disabled={mutation.pending}
    />
  );
}

export function PurgeRunButtons() {
  const mutation = useV1Mutation();
  const [lastRun, setLastRun] = useState<string | null>(null);

  async function run(dryRun: boolean) {
    setLastRun(null);
    const result = await mutation.run("run_retention_purge", { p_dry_run: dryRun });
    if (result !== null) {
      setLastRun(dryRun ? "Dry run completed — nothing was destroyed." : "Purge executed as reported by the server.");
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.02]">
      <h2 className="text-sm font-extrabold tracking-tight">Retention purge</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Acts only on entities with an approved policy row; journals can never be purged (structural
        exclusion); held rows are skipped. Dry-run first, then execute only if the report is
        expected.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void run(true)}
          disabled={mutation.pending}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
        >
          {mutation.pending ? "Working…" : "Dry run"}
        </button>
        <V1Confirm
          label="Execute purge"
          title="Execute retention purge"
          body="This destroys or archives rows per policy, except held rows and journals. Confirm the dry-run report first."
          confirmLabel="Execute purge"
          onConfirm={() => run(false)}
          disabled={mutation.pending}
        />
      </div>
      {mutation.error ? (
        <p role="alert" className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">
          {mutation.error}
        </p>
      ) : null}
      {lastRun ? (
        <p role="status" className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          {lastRun}
        </p>
      ) : null}
    </div>
  );
}
