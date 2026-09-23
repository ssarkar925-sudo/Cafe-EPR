"use client";

/**
 * Lot lifecycle islands. Each action calls exactly one documented G2 RPC:
 * quarantine_lot / reopen_lot / adjust_stock (reason-coded, back-office
 * enforced server-side). The adjust form validates the delta locally for
 * UX only (non-zero); the server re-validates everything.
 */

import { useState } from "react";
import Modal from "@/components/ui/modal";
import { useV1Mutation, V1Confirm, V1Field, v1InputClass } from "@/components/v1/v1-mutation";

const ADJ_TYPES = ["damage", "expiry", "count", "other"] as const;

export function QuarantineButton({ lotId }: { lotId: string }) {
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const mutation = useV1Mutation();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason.trim()) return;
    const result = await mutation.run("quarantine_lot", { p_lot_id: lotId, p_reason: reason.trim() });
    if (result !== null) {
      setOpen(false);
      setReason("");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          mutation.reset();
          setOpen(true);
        }}
        className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-amber-700"
      >
        Quarantine
      </button>
      {open && (
        <Modal
          as="form"
          onSubmit={submit}
          size="sm"
          accent="amber"
          title="Quarantine lot"
          subtitle="Quarantined lots cannot be allocated until reopened."
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
                disabled={mutation.pending || !reason.trim()}
                className="flex-1 rounded-xl bg-amber-600 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-amber-700 disabled:opacity-50"
              >
                {mutation.pending ? "Working…" : "Quarantine"}
              </button>
            </div>
          }
        >
          <div className="py-2">
            <V1Field label="Reason (required)" htmlFor="quarantine-reason">
              <input
                id="quarantine-reason"
                className={v1InputClass}
                value={reason}
                maxLength={240}
                onChange={(e) => setReason(e.target.value)}
                disabled={mutation.pending}
              />
            </V1Field>
            {mutation.error ? (
              <p role="alert" className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">
                {mutation.error}
              </p>
            ) : null}
          </div>
        </Modal>
      )}
    </>
  );
}

export function ReopenButton({ lotId }: { lotId: string }) {
  const mutation = useV1Mutation();
  return (
    <V1Confirm
      label="Reopen"
      title="Reopen lot"
      body="Only quarantined lots can be reopened; the server enforces the lifecycle."
      confirmLabel="Reopen lot"
      accent="blue"
      onConfirm={() => mutation.run("reopen_lot", { p_lot_id: lotId, p_reason: "reopen from V1 inventory" })}
      disabled={mutation.pending}
    />
  );
}

export function AdjustForm({ lotId }: { lotId: string }) {
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState("");
  const [adjType, setAdjType] = useState<string>("count");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const mutation = useV1Mutation();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const num = Number(delta);
    if (!Number.isFinite(num) || num === 0) {
      setFormError("Delta must be a non-zero number (negative removes stock).");
      return;
    }
    if (!reason.trim()) {
      setFormError("A reason is required (reason-coded adjustments).");
      return;
    }
    setFormError(null);
    const result = await mutation.run("adjust_stock", {
      p_lot_id: lotId,
      p_qty_delta: num,
      p_adj_type: adjType,
      p_reason: reason.trim(),
    });
    if (result !== null) {
      setOpen(false);
      setDelta("");
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
        className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
      >
        Adjust stock
      </button>
      {open && (
        <Modal
          as="form"
          onSubmit={submit}
          size="sm"
          accent="blue"
          title="Adjust stock"
          subtitle="Back-office only, reason-coded. The server records actor and history."
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
                {mutation.pending ? "Saving…" : "Apply adjustment"}
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-3 py-2 sm:grid-cols-2">
            <V1Field label="Delta qty (≠ 0)" htmlFor="adjust-delta">
              <input
                id="adjust-delta"
                type="number"
                step="0.01"
                className={v1InputClass}
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                disabled={mutation.pending}
              />
            </V1Field>
            <V1Field label="Type" htmlFor="adjust-type">
              <select
                id="adjust-type"
                className={v1InputClass}
                value={adjType}
                onChange={(e) => setAdjType(e.target.value)}
                disabled={mutation.pending}
              >
                {ADJ_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </V1Field>
          </div>
          <V1Field label="Reason (required)" htmlFor="adjust-reason">
            <input
              id="adjust-reason"
              className={v1InputClass}
              value={reason}
              maxLength={240}
              onChange={(e) => setReason(e.target.value)}
              disabled={mutation.pending}
            />
          </V1Field>
          {(formError || mutation.error) && (
            <p role="alert" className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">
              {formError ?? mutation.error}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
