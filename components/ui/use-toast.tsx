"use client";

import { useCallback, useState } from "react";

type ToastType = "success" | "error" | "info";

type Toast = { id: number; type: ToastType; text: string };

const STYLES: Record<ToastType, { bar: string; icon: string; bubble: string }> = {
  success: { bar: "bg-emerald-500", icon: "M5 13l4 4L19 7", bubble: "bg-emerald-100 text-emerald-700" },
  error: { bar: "bg-rose-500", icon: "M12 8v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 0h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z", bubble: "bg-rose-100 text-rose-700" },
  info: { bar: "bg-blue-500", icon: "M12 8v4m0 4h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0-9 0-9 9 0 0 0 0-18Z", bubble: "bg-blue-100 text-blue-700" },
};

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((type: ToastType, text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, type, text }]);

    // A successful DMT posting must leave the next entry screen clean. The
    // transaction is already committed before this toast is shown, so a short
    // page refresh safely restores the canonical blank-entry state and fresh
    // balances/history without touching the posted transaction.
    if (type === "success" && /DMT transfer completed successfully\.?/i.test(text)) {
      setTimeout(() => {
        if (typeof window !== "undefined") window.location.reload();
      }, 900);
    }

    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const dismiss = useCallback(
    (id: number) => setToasts((t) => t.filter((x) => x.id !== id)),
    []
  );

  const toastView = (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6">
      {toasts.map((t) => {
        const s = STYLES[t.type];
        return (
          <div
            key={t.id}
            className="pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-2xl bg-white/95 p-3.5 pr-10 shadow-[0_20px_50px_-12px_rgba(2,6,23,0.4)] ring-1 ring-slate-900/10 backdrop-blur animate-modal-panel dark:bg-slate-900 dark:ring-white/10"
          >
            <div className={`absolute inset-y-0 left-0 w-1 ${s.bar}`} />
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${s.bubble}`}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
              >
                <path d={s.icon} />
              </svg>
            </div>
            <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-slate-800 dark:text-white">
              {t.text}
            </p>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );

  return { showToast, toastView };
}