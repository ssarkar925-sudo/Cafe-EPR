"use client";

import Link from "next/link";
import type { ReactNode } from "react";

function getGlowFromGrad(grad: string, glowProp?: string) {
  if (glowProp) return `card-glow-${glowProp}`;
  if (grad.includes("emerald") || grad.includes("teal")) return "card-glow-emerald";
  if (grad.includes("rose") || grad.includes("pink") || grad.includes("red")) return "card-glow-rose";
  if (grad.includes("amber") || grad.includes("orange") || grad.includes("yellow")) return "card-glow-amber";
  if (grad.includes("cyan") || grad.includes("sky")) return "card-glow-cyan";
  if (grad.includes("violet") || grad.includes("purple") || grad.includes("fuchsia")) return "card-glow-indigo";
  if (grad.includes("blue") || grad.includes("indigo")) return "card-glow-indigo";
  return "";
}

export default function StatCard({
  label,
  value,
  sub,
  icon,
  grad = "from-blue-600 to-indigo-600",
  glow,
  className: customClassName,
  onClick,
  href,
  trend,
  valueClass,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: string;
  grad?: string;
  glow?: string;
  className?: string;
  onClick?: () => void;
  href?: string;
  trend?: { dir: "up" | "down" | "flat"; text: string } | null;
  valueClass?: string;
}) {
  const glowClass = getGlowFromGrad(grad, glow);

  const content = (
    <>
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${grad}`} />
      <div className="relative flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
        <div className={`icon-box-3d flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br ${grad} text-white shadow-sm`}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d={icon} />
          </svg>
        </div>
      </div>
      <p className={`relative mt-2 font-mono text-2xl font-black tracking-tight tabular-nums text-slate-900 dark:text-white ${valueClass ?? ""}`}>
        {value}
      </p>
      <div className="relative mt-1.5 flex min-h-[18px] items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        {trend && trend.dir !== "flat" && (
          <span
            className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ${
              trend.dir === "up"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                : "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5">
              <path d={trend.dir === "up" ? "M5 15l7-7 7 7" : "M5 9l7 7 7-7"} />
            </svg>
            {trend.text}
          </span>
        )}
        {sub}
      </div>
    </>
  );

  const finalClassName = `bento-surface group relative block overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs transition-all duration-200 dark:border-white/10 dark:bg-slate-900 ${glowClass} ${
    onClick || href ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:border-blue-400/40" : ""
  } ${customClassName ?? ""}`;

  if (href) {
    return (
      <Link href={href} onClick={onClick} className={finalClassName}>
        {content}
      </Link>
    );
  }

  return (
    <div onClick={onClick} className={finalClassName}>
      {content}
    </div>
  );
}