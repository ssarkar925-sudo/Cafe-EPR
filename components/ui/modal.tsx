"use client";

import { useEffect, type ReactNode } from "react";

type Accent = "blue" | "indigo" | "rose" | "emerald" | "amber" | "violet" | "teal" | "slate";

const ACCENTS: Record<Accent, { bar: string; icon: string; glow: string; bubble: string }> = {
  blue: { bar: "from-blue-600 to-indigo-600", icon: "from-blue-600 to-indigo-600", glow: "shadow-blue-600/40", bubble: "bg-blue-50 text-blue-600" },
  indigo: { bar: "from-indigo-600 to-violet-600", icon: "from-indigo-600 to-violet-600", glow: "shadow-indigo-600/40", bubble: "bg-indigo-50 text-indigo-600" },
  rose: { bar: "from-rose-500 to-red-500", icon: "from-rose-500 to-red-500", glow: "shadow-rose-500/40", bubble: "bg-rose-50 text-rose-600" },
  emerald: { bar: "from-emerald-500 to-teal-500", icon: "from-emerald-500 to-teal-500", glow: "shadow-emerald-500/40", bubble: "bg-emerald-50 text-emerald-600" },
  amber: { bar: "from-amber-500 to-orange-500", icon: "from-amber-500 to-orange-500", glow: "shadow-amber-500/40", bubble: "bg-amber-50 text-amber-600" },
  violet: { bar: "from-violet-500 to-purple-500", icon: "from-violet-500 to-purple-500", glow: "shadow-violet-500/40", bubble: "bg-violet-50 text-violet-600" },
  teal: { bar: "from-teal-500 to-emerald-500", icon: "from-teal-500 to-emerald-500", glow: "shadow-teal-500/40", bubble: "bg-teal-50 text-teal-600" },
  slate: { bar: "from-slate-700 to-slate-900", icon: "from-slate-700 to-slate-900", glow: "shadow-slate-700/40", bubble: "bg-slate-100 text-slate-600" },
};

const SIZES: Record<"sm" | "md" | "lg" | "xl" | "2xl", string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-2xl",
  "2xl": "sm:max-w-3xl",
};

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="group -mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90"
      >
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

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
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  header?: ReactNode;
  headerRight?: ReactNode;
  noHeader?: boolean;
  footer?: ReactNode;
  bodyClassName?: string;
  children?: ReactNode;
}) {
  const a = ACCENTS[accent];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const panel = (
    <>
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${a.bar}`} />

      {!noHeader &&
        (header !== undefined ? (
          header
        ) : (
          <div className="relative shrink-0 border-b border-slate-100 px-6 py-4 dark:border-white/10">
            <div className="flex items-center gap-3.5">
              {icon && (
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${a.icon} text-white shadow-lg ${a.glow}`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5"
                  >
                    <path d={icon} />
                  </svg>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                  {title}
                </h2>
                {subtitle && (
                  <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-400">
                    {subtitle}
                  </p>
                )}
              </div>
              {headerRight}
              <CloseButton onClose={onClose} />
            </div>
          </div>
        ))}

      <div className={`flex-1 overflow-y-auto px-6 py-5 ${bodyClassName ?? ""}`}>{children}</div>

      {footer !== undefined && (
        <div className="shrink-0 border-t border-slate-100 bg-slate-50/80 px-6 py-4 dark:border-white/10 dark:bg-white/5">
          {footer}
        </div>
      )}
    </>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div
        className="fixed inset-0 animate-modal-backdrop bg-[#020617]/75 backdrop-blur-md"
        onClick={onClose}
      />
      <div className="pointer-events-none fixed inset-0 animate-modal-backdrop">
        <div className="absolute left-1/2 top-1/3 h-72 w-[38rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/15 blur-3xl dark:bg-indigo-500/10" />
      </div>
      {as === "form" ? (
        <form
          onSubmit={onSubmit}
          onClick={(e) => e.stopPropagation()}
          className={`relative z-10 my-auto flex max-h-[92vh] w-full ${SIZES[size]} flex-col overflow-hidden rounded-3xl bg-white shadow-[0_30px_80px_-15px_rgba(2,6,23,0.55)] ring-1 ring-slate-900/10 animate-modal-panel dark:bg-slate-900 dark:ring-white/10`}
        >
          {panel}
        </form>
      ) : (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`relative z-10 my-auto flex max-h-[92vh] w-full ${SIZES[size]} flex-col overflow-hidden rounded-3xl bg-white shadow-[0_30px_80px_-15px_rgba(2,6,23,0.55)] ring-1 ring-slate-900/10 animate-modal-panel dark:bg-slate-900 dark:ring-white/10`}
        >
          {panel}
        </div>
      )}
    </div>
  );
}