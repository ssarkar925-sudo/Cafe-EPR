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
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            Cash Inflow
          </span>
          <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
        </div>
        <div className="mt-1.5 text-lg font-black text-emerald-600 dark:text-emerald-400">
          {inr(inTotal)}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            Cash Outflow
          </span>
          <span className="flex h-2 w-2 rounded-full bg-rose-500" />
        </div>
        <div className="mt-1.5 text-lg font-black text-rose-600 dark:text-rose-400">
          {inr(outTotal)}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            Net Movement
          </span>
          <span className="flex h-2 w-2 rounded-full bg-blue-500" />
        </div>
        <div
          className={`mt-1.5 text-lg font-black ${
            net >= 0
              ? "text-slate-900 dark:text-white"
              : "text-rose-600 dark:text-rose-400"
          }`}
        >
          {inr(net)}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            Settlements
          </span>
          <span className="flex h-2 w-2 rounded-full bg-indigo-500" />
        </div>
        <div className="mt-1.5 text-lg font-black text-slate-900 dark:text-white">
          {inr(settlementValue)}
        </div>
      </div>

      <Link
        href="/finance/day-close"
        className="group col-span-2 flex flex-col justify-between rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50/60 p-4 shadow-xs transition hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md dark:border-blue-900/40 dark:from-blue-950/40 dark:to-indigo-950/30 sm:col-span-1"
      >
        <div className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
          Store Handover
        </div>
        <div className="mt-1 flex items-center justify-between text-sm font-extrabold text-blue-700 dark:text-blue-300">
          <span>Lock Day Close</span>
          <span className="transition group-hover:translate-x-1">→</span>
        </div>
      </Link>
    </div>
  );
}
