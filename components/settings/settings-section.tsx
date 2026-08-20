"use client";

import type { ReactNode } from "react";

type Tone = "blue" | "violet" | "emerald" | "cyan" | "amber" | "indigo" | "slate" | "rose";

const TONES: Record<Tone, string> = {
  blue: "bg-blue-100 text-blue-600",
  violet: "bg-violet-100 text-violet-600",
  emerald: "bg-emerald-100 text-emerald-600",
  cyan: "bg-cyan-100 text-cyan-600",
  amber: "bg-amber-100 text-amber-600",
  indigo: "bg-indigo-100 text-indigo-600",
  slate: "bg-slate-100 text-slate-600",
  rose: "bg-rose-100 text-rose-600",
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
    <section className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${className ?? ""}`}>
      <div className="mb-4 flex items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TONES[tone]}`}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4.5 w-4.5"
          >
            <path d={icon} />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {desc && <p className="text-xs text-slate-400">{desc}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}