"use client";

import Modal from "@/components/ui/modal";

type ConfirmState = {
  row: { name?: string; label?: string };
  referenced: boolean;
  linkedChildCardName?: string | null;
} | null;

export default function ConfirmDeleteModal({
  state,
  kind,
  onCancel,
  onConfirm,
  onDisable,
}: {
  state: ConfirmState;
  kind: "account" | "method";
  onCancel: () => void;
  onConfirm: () => void;
  onDisable: () => void;
}) {
  if (!state) return null;
  const noun = kind === "account" ? "payment account" : "payment method";
  const kindTitle = kind === "account" ? "Payment Account" : "Payment Method";
  const name = state.row.name ?? state.row.label ?? "";

  return (
    <Modal
      onClose={onCancel}
      title={state.referenced ? "Used by existing transactions" : `Delete ${kindTitle}?`}
      subtitle={state.referenced ? "Preserve financial integrity" : "Permanent deletion warning"}
      icon={state.referenced ? "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3Z" : "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"}
      accent={state.referenced ? "amber" : "rose"}
      size="sm"
      footer={
        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5 transition"
          >
            Cancel
          </button>
          {state.referenced ? (
            <button
              type="button"
              onClick={onDisable}
              className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-amber-600"
            >
              Disable Account
            </button>
          ) : (
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-rose-700"
            >
              Delete
            </button>
          )}
        </div>
      }
    >
      <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2">
        {state.referenced ? (
          <p>
            This {noun} is used by existing transactions. Disable it instead to preserve financial history.
          </p>
        ) : (
          <p>
            {state.linkedChildCardName ? (
              <>
                Deleting this bank account will also remove its linked debit card (<strong>“{state.linkedChildCardName}”</strong>). Continue?
              </>
            ) : (
              <>
                “{name}” has no transaction history and will be permanently removed. This cannot be undone.
              </>
            )}
          </p>
        )}
      </div>
    </Modal>
  );
}