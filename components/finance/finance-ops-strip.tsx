"use client";

import Link from "next/link";
import { inr } from "@/lib/format";

export default function FinanceOpsStrip({
  entries = [],
  settlements = [],
}: {
  entries?: any[];
  settlements?: any[];
}) {
  const inTotal = entries
    .filter((e) => e.direction === "in")
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const outTotal = entries
    .filter((e) => e.direction === "out")
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const net = inTotal - outTotal;
  const settlementValue = settlements.reduce((s, e) => s + Number(e.amount || 0), 0);

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <div className="bento-surface card-glow-emerald relative overflow-hidden rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Cash Inflow
          </span>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
        </div>
        <div className="mt-1.5 font-mono text-lg font-black tracking-tight text-emerald-600 dark:text-emerald-400">
          {inr(inTotal)}
        </div>
      </div>

      <div className="bento-surface card-glow-rose relative overflow-hidden rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-rose-500 to-pink-500" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Cash Outflow
          </span>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
          </span>
        </div>
        <div className="mt-1.5 font-mono text-lg font-black tracking-tight text-rose-600 dark:text-rose-400">
          {inr(outTotal)}
        </div>
      </div>

      <div className="bento-surface card-glow-indigo relative overflow-hidden rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-blue-500 to-indigo-500" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Net Movement
          </span>
          <span className="flex h-2 w-2 rounded-full bg-indigo-500" />
        </div>
        <div
          className={`mt-1.5 font-mono text-lg font-black tracking-tight ${
            net >= 0
              ? "text-slate-900 dark:text-white"
              : "text-rose-600 dark:text-rose-400"
          }`}
        >
          {inr(net)}
        </div>
      </div>

      <div className="bento-surface card-glow-purple relative overflow-hidden rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-purple-500 to-violet-500" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Settlements
          </span>
          <span className="flex h-2 w-2 rounded-full bg-purple-500" />
        </div>
        <div className="mt-1.5 font-mono text-lg font-black tracking-tight text-purple-700 dark:text-purple-300">
          {inr(settlementValue)}
        </div>
      </div>

      <Link
        href="/finance/day-close"
        className="group col-span-2 flex flex-col justify-between rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/80 via-blue-50/50 to-indigo-100/50 p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-400 hover:shadow-md active:scale-95 dark:border-indigo-900/40 dark:from-indigo-950/40 dark:via-blue-950/30 dark:to-indigo-900/30 sm:col-span-1"
      >
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            Store Handover
          </div>
          <span className="text-xs text-indigo-500 transition-transform group-hover:translate-x-1">→</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-sm font-black text-indigo-900 dark:text-indigo-200">
          <span>Lock Day Close</span>
        </div>
      </Link>
    </div>
  );
}

