"use client";

import { useEffect, type ReactNode } from "react";

type Accent = "blue" | "indigo" | "rose" | "emerald" | "amber" | "violet" | "teal" | "slate";
type ModalSize = "sm" | "md" | "lg" | "xl" | "2xl";

const ACCENTS: Record<Accent, { bar: string; icon: string; glow: string; soft: string }> = {
  blue: { bar: "from-blue-500 via-cyan-500 to-indigo-600", icon: "from-blue-600 to-indigo-600", glow: "shadow-blue-500/30", soft: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" },
  indigo: { bar: "from-indigo-500 via-violet-500 to-purple-600", icon: "from-indigo-600 to-violet-600", glow: "shadow-indigo-500/30", soft: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300" },
  rose: { bar: "from-rose-500 via-pink-500 to-red-500", icon: "from-rose-500 to-red-500", glow: "shadow-rose-500/30", soft: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" },
  emerald: { bar: "from-emerald-500 via-teal-500 to-cyan-500", icon: "from-emerald-500 to-teal-500", glow: "shadow-emerald-500/30", soft: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  amber: { bar: "from-amber-400 via-orange-500 to-rose-500", icon: "from-amber-500 to-orange-500", glow: "shadow-amber-500/30", soft: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  violet: { bar: "from-violet-500 via-purple-500 to-fuchsia-500", icon: "from-violet-500 to-purple-500", glow: "shadow-violet-500/30", soft: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" },
  teal: { bar: "from-teal-500 via-cyan-500 to-blue-500", icon: "from-teal-500 to-emerald-500", glow: "shadow-teal-500/30", soft: "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300" },
  slate: { bar: "from-slate-500 via-slate-700 to-slate-900", icon: "from-slate-700 to-slate-900", glow: "shadow-slate-500/30", soft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
};

const SIZES: Record<ModalSize, string> = {
  sm: "sm:max-w-[440px]",
  md: "sm:max-w-[580px]",
  lg: "sm:max-w-[760px]",
  xl: "sm:max-w-[980px]",
  "2xl": "sm:max-w-[1180px]",
};

function TrafficLights() {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      <span className="h-3 w-3 rounded-full bg-[#ff5f57] shadow-[inset_0_0_0_1px_rgba(0,0,0,.12)]" />
      <span className="h-3 w-3 rounded-full bg-[#febc2e] shadow-[inset_0_0_0_1px_rgba(0,0,0,.12)]" />
      <span className="h-3 w-3 rounded-full bg-[#28c840] shadow-[inset_0_0_0_1px_rgba(0,0,0,.12)]" />
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" onClick={onClose} aria-label="Close" title="Close" className="group flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  );
}

function WindowControls({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center gap-2.5">
      <button type="button" aria-label="Minimize" title="Minimize" className="hidden h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 dark:hover:bg-white/10 sm:flex"><span className="h-px w-3.5 bg-current" /></button>
      <button type="button" aria-label="Maximize" title="Maximize" className="hidden h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 dark:hover:bg-white/10 sm:flex"><span className="h-3 w-3 rounded-[3px] border border-current" /></button>
      <CloseButton onClose={onClose} />
    </div>
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
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const panel = (
    <>
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${a.bar}`} />

      <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200/80 bg-slate-50/90 px-4 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/90 sm:h-14 sm:px-5">
        <div className="absolute left-1/2 flex max-w-[45%] -translate-x-1/2 items-center gap-2 text-center">
          <span className="truncate text-[11px] font-semibold tracking-wide text-slate-400 dark:text-slate-500">Cafe ERP</span>
          {!noHeader && title && <><span className="text-slate-300 dark:text-slate-700">•</span><span className="truncate text-xs font-bold text-slate-600 dark:text-slate-300">{title}</span></>}
        </div>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
          {headerRight}
          <TrafficLights />
          <WindowControls onClose={onClose} />
        </div>
      </div>

      {!noHeader && header !== undefined && <div className="shrink-0">{header}</div>}

      {!noHeader && header === undefined && (title || subtitle || icon) && (
        <div className="relative shrink-0 border-b border-slate-100 bg-white px-5 py-4 dark:border-white/10 dark:bg-slate-900 sm:px-6">
          <div className="flex items-center gap-3">
            {icon && <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${a.icon} text-white shadow-lg ${a.glow}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d={icon} /></svg></div>}
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">{title}</h2>
              {subtitle && <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>}
            </div>
          </div>
        </div>
      )}

      <div className={`min-h-0 flex-1 overflow-y-auto bg-white px-5 py-5 dark:bg-slate-900 sm:px-6 sm:py-6 ${bodyClassName ?? ""}`}>{children}</div>

      {footer !== undefined && <div className="shrink-0 border-t border-slate-200/80 bg-slate-50/90 px-5 py-4 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/80 sm:px-6">{footer}</div>}
    </>
  );

  const panelClass = `relative z-10 my-auto flex max-h-[90vh] w-full ${SIZES[size]} flex-col overflow-hidden rounded-[22px] border border-white/80 bg-white shadow-[0_35px_100px_-20px_rgba(2,6,23,.55)] ring-1 ring-slate-950/5 animate-modal-panel dark:border-white/10 dark:bg-slate-900 dark:ring-white/5 sm:rounded-[26px]`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-3 sm:p-5 lg:p-7">
      <button type="button" aria-label="Close dialog" className="fixed inset-0 cursor-default border-0 bg-slate-950/60 p-0 backdrop-blur-[7px] dark:bg-black/65" onClick={onClose} />
      <div className="pointer-events-none fixed inset-0 overflow-hidden"><div className={`absolute left-1/2 top-1/3 h-80 w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-r ${a.bar} opacity-[.08] blur-3xl`} /></div>
      {as === "form" ? <form onSubmit={onSubmit} onClick={(e) => e.stopPropagation()} className={panelClass}>{panel}</form> : <div onClick={(e) => e.stopPropagation()} className={panelClass}>{panel}</div>}
    </div>
  );
}
