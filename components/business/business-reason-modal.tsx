"use client";

import Modal from "@/components/ui/modal";

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
    <Modal
      onClose={onClose}
      title={title}
      subtitle={note}
      icon="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
      accent="rose"
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!reason.trim() || busy}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
          >
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      }
    >
      <textarea
        rows={3}
        autoFocus
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required)"
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
      />
    </Modal>
  );
}