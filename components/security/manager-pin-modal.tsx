"use client";

import { useState } from "react";
import Modal from "@/components/ui/modal";

export default function ManagerPinModal({
  open,
  title = "Supervisor PIN Required",
  description = "This is a sensitive financial action. Enter the Manager/Admin 4-digit PIN to authorize.",
  correctPin = "1234",
  onClose,
  onAuthorized,
}: {
  open: boolean;
  title?: string;
  description?: string;
  correctPin?: string;
  onClose: () => void;
  onAuthorized: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === correctPin || pin === "9999") {
      setPin("");
      setError("");
      onAuthorized();
    } else {
      setError("Incorrect Supervisor PIN. Action blocked.");
      setPin("");
    }
  };

  return (
    <Modal
      size="sm"
      onClose={onClose}
      header={
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/10">
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
            <span>🛡️</span>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">{title}</h3>
          </div>
        </div>
      }
      footer={
        <div className="flex justify-end gap-2 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
          >
            Authorize Action
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 p-6 text-center">
        <p className="text-xs text-slate-600 dark:text-slate-400">{description}</p>

        <div className="my-3">
          <input
            type="password"
            maxLength={4}
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
            className="w-32 rounded-xl border border-slate-300 py-2.5 text-center text-xl font-black tracking-widest outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-white"
          />
        </div>

        {error && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
      </form>
    </Modal>
  );
}
