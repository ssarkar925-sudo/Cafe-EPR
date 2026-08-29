"use client";

import type { ReactNode } from "react";

type Tone = "blue" | "violet" | "emerald" | "cyan" | "amber" | "indigo" | "slate" | "rose";

const TONES: Record<Tone, string> = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400",
  cyan: "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/60 dark:text-cyan-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400",
  indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400",
  slate: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400",
};

export default function SettingsSection({
  icon,
  tone = "blue",
  title,
  desc,
  action,
  className,
  children,
}: {
  icon: string;
  tone?: Tone;
  title: string;
  desc?: string;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section
      className={`overflow-hidden rounded-[22px] border border-slate-200/90 bg-white p-6 shadow-[0_4px_20px_rgba(15,23,42,.03)] dark:border-white/10 dark:bg-slate-900 ${
        className ?? ""
      }`}
    >
      <div className="mb-5 flex items-center gap-3.5">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${TONES[tone]}`}>
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
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-white">
            {title}
          </h2>
          {desc && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {desc}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}