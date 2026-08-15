"use client";

export default function ReasonModal({
  title,
  note,
  confirmLabel,
  busy,
  reason,
  setReason,
  onClose,
  onConfirm,
}: {
  title: string;
  note: string;
  confirmLabel: string;
  busy: boolean;
  reason: string;
  setReason: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <p className="mt-1 text-xs text-slate-500">{note}</p>
        <textarea
          rows={3}
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required)"
          className="mt-4 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!reason.trim() || busy}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
