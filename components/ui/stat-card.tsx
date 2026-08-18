"use client";

import type { ReactNode } from "react";

export default function StatCard({
  label,
  value,
  sub,
  icon,
  grad = "from-blue-600 to-indigo-600",
  onClick,
  trend,
  valueClass,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: string;
  grad?: string;
  onClick?: () => void;
  trend?: { dir: "up" | "down" | "flat"; text: string } | null;
  valueClass?: string;
}) {
  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition dark:border-white/10 dark:bg-slate-900 ${
        onClick ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg" : ""
      }`}
    >
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${grad}`} />
      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-gradient-to-br from-slate-100 to-transparent blur-2xl" />
      <div className="relative flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${grad} text-white shadow-lg shadow-black/10`}>
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
      </div>
      <p className={`relative mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white ${valueClass ?? ""}`}>
        {value}
      </p>
      <div className="relative mt-1 flex min-h-[16px] items-center gap-1.5 text-xs text-slate-400">
        {trend && trend.dir !== "flat" && (
          <span
            className={`flex h-4 w-4 items-center justify-center rounded-full ${
              trend.dir === "up" ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5">
              <path d={trend.dir === "up" ? "M5 15l7-7 7 7" : "M5 9l7 7 7-7"} />
            </svg>
          </span>
        )}
        {sub}
      </div>
    </div>
  );
}