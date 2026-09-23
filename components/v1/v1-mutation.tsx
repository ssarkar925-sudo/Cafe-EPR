/**
 * Shared V1 mutation hook + field + confirm primitives (client).
 *
 * - useV1Mutation wraps callV1Mutation with pending/error guards and a
 *   duplicate-submit lock. Server errors are surfaced verbatim; success is
 *   reported only from a real error-free response (no fake success).
 * - V1Field: accessible labeled input with error text.
 * - V1Confirm: destructive/admin-sensitive action guarded by the existing
 *   Modal confirm dialog.
 */

"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/modal";
import { callV1Mutation } from "@/lib/v1/v1-rpc";

export function useV1Mutation<T = unknown>() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<T | null>(null);

  const run = useCallback(
    async (functionName: string, args: Record<string, unknown>): Promise<T | null> => {
      if (pending) return null;
      setPending(true);
      setError(null);
      try {
        const result = await callV1Mutation<T>(functionName, args);
        if (result.error) {
          setError(result.error.message);
          setData(null);
          return null;
        }
        setData(result.data);
        router.refresh();
        return result.data;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Mutation failed.";
        setError(message);
        setData(null);
        return null;
      } finally {
        setPending(false);
      }
    },
    [pending, router],
  );

  const reset = useCallback(() => {
    setError(null);
    setData(null);
  }, []);

  return { run, pending, error, data, reset };
}

export function V1Field({
  label,
  error,
  children,
  htmlFor,
}: {
  label: string;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="mt-1 block text-xs font-semibold text-rose-600 dark:text-rose-400">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export const v1InputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:focus:border-white/30";

export function V1Confirm({
  label,
  title,
  body,
  confirmLabel = "Confirm",
  accent = "rose",
  onConfirm,
  disabled,
}: {
  label: string;
  title: string;
  body: string;
  confirmLabel?: string;
  accent?: "rose" | "amber" | "blue";
  onConfirm: () => void | Promise<unknown>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
      >
        {label}
      </button>
      {open && (
        <Modal
          size="sm"
          accent={accent}
          title={title}
          subtitle="This action is recorded and cannot be undone from here."
          onClose={() => (busy ? null : setOpen(false))}
          footer={
            <div className="flex w-full gap-2.5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={busy}
                className="flex-1 rounded-xl bg-rose-600 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-rose-700 disabled:opacity-50"
              >
                {busy ? "Working…" : confirmLabel}
              </button>
            </div>
          }
        >
          <p className="py-2 text-sm text-slate-600 dark:text-slate-300">{body}</p>
        </Modal>
      )}
    </>
  );
}
