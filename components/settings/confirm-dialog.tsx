"use client";

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#020617]/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        {state.referenced ? (
          <>
            <h3 className="text-lg font-bold text-slate-900">Used by existing transactions</h3>
            <p className="mt-1 text-sm text-slate-500">
              This {noun} is used by existing transactions. Disable it instead to preserve financial
              history.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={onCancel}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={onDisable}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600"
              >
                Disable Account
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-lg font-bold text-slate-900">Delete {kindTitle}?</h3>
            <p className="mt-1 text-sm text-slate-500">
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
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={onCancel}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}