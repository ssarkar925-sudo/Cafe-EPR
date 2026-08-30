import Link from "next/link";
import type { ReactNode } from "react";

export default function PosV2Shell({
  children,
  mode,
  salesCount,
  salesAmount,
}: {
  children: ReactNode;
  mode: "invoice" | "quick";
  salesCount: number;
  salesAmount: number;
}) {
  const money = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(salesAmount);

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/80 shadow-[0_24px_80px_-35px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/70">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-r from-cyan-500/10 via-violet-500/10 to-fuchsia-500/10" />

      <header className="relative flex flex-col gap-4 border-b border-slate-200/80 px-5 py-4 dark:border-white/10 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-950 text-sm font-bold text-white shadow-lg dark:bg-white dark:text-slate-950">
              POS
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">Counter Sales</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Fast checkout workspace · inventory + accounts synchronized</p>
            </div>
          </div>
        </div>

        <nav className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/90 p-1 dark:border-white/10 dark:bg-white/5" aria-label="POS mode">
          <Link
            href="/pos?mode=invoice"
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${mode === "invoice" ? "bg-white text-slate-950 shadow-sm dark:bg-white dark:text-slate-950" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}
          >
            Invoice Sale
          </Link>
          <Link
            href="/pos?mode=quick"
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${mode === "quick" ? "bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}
          >
            Quick Sale
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 dark:border-white/10 dark:bg-white/5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Today</div>
            <div className="text-sm font-bold text-slate-900 dark:text-white">{salesCount} sales · {money}</div>
          </div>
          <div className="hidden rounded-2xl border border-emerald-200/70 bg-emerald-50 px-3 py-2 sm:block dark:border-emerald-400/20 dark:bg-emerald-400/10">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-300">System</div>
            <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">Ready</div>
          </div>
        </div>
      </header>

      <div className="relative border-b border-slate-200/70 bg-slate-50/60 px-5 py-2 dark:border-white/10 dark:bg-white/[0.025]">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <span><kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[10px] dark:border-white/10 dark:bg-white/5">F2</kbd> switch mode</span>
          <span><kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[10px] dark:border-white/10 dark:bg-white/5">F4</kbd> focus search</span>
          <span><kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[10px] dark:border-white/10 dark:bg-white/5">F9</kbd> exact payment</span>
          <span className="ml-auto hidden md:inline">Quick Sale is optimized for minimum-click counter operation.</span>
        </div>
      </div>

      <div className="relative p-3 sm:p-4 lg:p-5">{children}</div>
    </section>
  );
}
