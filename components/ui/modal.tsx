"use client";

import { useEffect, type ReactNode } from "react";

type Accent = "blue" | "indigo" | "rose" | "emerald" | "amber" | "violet" | "teal" | "slate";
type ModalSize = "sm" | "md" | "lg" | "xl" | "2xl";

const ACCENTS: Record<Accent, { bar: string; icon: string; glow: string; soft: string }> = {
  blue: {
    bar: "from-blue-500 to-indigo-600",
    icon: "from-blue-600 to-indigo-600",
    glow: "shadow-blue-500/25",
    soft: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  },
  indigo: {
    bar: "from-indigo-500 to-purple-600",
    icon: "from-indigo-600 to-purple-600",
    glow: "shadow-indigo-500/25",
    soft: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  },
  rose: {
    bar: "from-rose-500 to-red-600",
    icon: "from-rose-600 to-red-600",
    glow: "shadow-rose-500/25",
    soft: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  },
  emerald: {
    bar: "from-emerald-500 to-teal-600",
    icon: "from-emerald-600 to-teal-600",
    glow: "shadow-emerald-500/25",
    soft: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  amber: {
    bar: "from-amber-400 to-orange-500",
    icon: "from-amber-500 to-orange-600",
    glow: "shadow-amber-500/25",
    soft: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  },
  violet: {
    bar: "from-violet-500 to-purple-600",
    icon: "from-violet-600 to-purple-600",
    glow: "shadow-violet-500/25",
    soft: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  },
  teal: {
    bar: "from-teal-500 to-emerald-600",
    icon: "from-teal-600 to-emerald-600",
    glow: "shadow-teal-500/25",
    soft: "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
  },
  slate: {
    bar: "from-slate-600 to-slate-800",
    icon: "from-slate-700 to-slate-900",
    glow: "shadow-slate-500/25",
    soft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
};

const SIZES: Record<ModalSize, string> = {
  sm: "sm:max-w-[440px]",
  md: "sm:max-w-[560px]",
  lg: "sm:max-w-[740px]",
  xl: "sm:max-w-[940px]",
  "2xl": "sm:max-w-[1140px]",
};

export default function Modal({
  onClose,
  as = "div",
  onSubmit,
  title,
  subtitle,
  icon,
  accent = "blue",
  size = "md",
  header,
  headerRight,
  noHeader,
  footer,
  bodyClassName,
  children,
}: {
  onClose: () => void;
  as?: "div" | "form";
  onSubmit?: React.FormEventHandler<HTMLFormElement>;
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: string;
  accent?: Accent;
  size?: ModalSize;
  header?: ReactNode;
  headerRight?: ReactNode;
  noHeader?: boolean;
  footer?: ReactNode;
  bodyClassName?: string;
  children?: ReactNode;
}) {
  const a = ACCENTS[accent];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const panel = (
    <>
      {/* Top Accent Rim */}
      <div className={`h-1 w-full shrink-0 bg-gradient-to-r ${a.bar}`} />

      {/* Header */}
      {!noHeader && (
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200/80 bg-slate-50/90 px-6 py-4 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/90">
          {header !== undefined ? (
            header
          ) : (
            <div className="flex items-center gap-3">
              {icon && (
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${a.icon} text-white shadow-md ${a.glow}`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4.5 w-4.5"
                  >
                    <path d={icon} />
                  </svg>
                </div>
              )}
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {title}
                </h2>
                {subtitle && (
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            {headerRight}
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
              title="Close (Esc)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Body */}
      <div
        className={`min-h-0 flex-1 overflow-y-auto bg-white p-6 dark:bg-slate-900 sm:p-6 ${
          bodyClassName ?? ""
        }`}
      >
        {children}
      </div>

      {/* Footer */}
      {footer !== undefined && (
        <div className="shrink-0 border-t border-slate-200/80 bg-slate-50/90 px-6 py-4 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/90">
          {footer}
        </div>
      )}
    </>
  );

  const panelClass = `relative z-10 my-auto flex max-h-[90vh] w-full ${SIZES[size]} flex-col overflow-hidden rounded-[24px] border border-slate-200/90 bg-white shadow-2xl ring-1 ring-slate-900/5 dark:border-white/10 dark:bg-slate-900 dark:ring-white/10 animate-modal-panel`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      {/* Frosted Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-md transition-opacity animate-modal-backdrop"
        onClick={onClose}
      />

      {as === "form" ? (
        <form
          onSubmit={onSubmit}
          onClick={(e) => e.stopPropagation()}
          className={panelClass}
          role="dialog"
          aria-modal="true"
        >
          {panel}
        </form>
      ) : (
        <div
          onClick={(e) => e.stopPropagation()}
          className={panelClass}
          role="dialog"
          aria-modal="true"
        >
          {panel}
        </div>
      )}
    </div>
  );
}
