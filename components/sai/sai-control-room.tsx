"use client";

import { useEffect, useState } from "react";
import { Activity, ArrowUpRight, Bot, CheckCircle2, Clock3, ShieldCheck, XCircle } from "lucide-react";

type Status = {
  online?: boolean;
  activeTasks?: number;
  pendingApprovals?: number;
  attention?: number;
};

export default function SAIControlRoom() {
  const [status, setStatus] = useState<Status>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/sai/status", { cache: "no-store" });
        const data = response.ok ? await response.json() : {};
        if (!cancelled) setStatus(data || {});
      } catch {
        if (!cancelled) setStatus({ online: false });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const cards = [
    { label: "System", value: loading ? "…" : status.online === false ? "Offline" : "Online", icon: Activity },
    { label: "Active work", value: status.activeTasks ?? 0, icon: Clock3 },
    { label: "Needs approval", value: status.pendingApprovals ?? 0, icon: ShieldCheck },
    { label: "Attention", value: status.attention ?? 0, icon: Bot },
  ];

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            SAI
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Control Room</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Background work, approvals and system attention.</p>
        </div>
        <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Business authority remains CafeERP
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between text-slate-400"><span className="text-[11px]">{label}</span><Icon className="h-4 w-4" /></div>
            <div className="mt-3 text-xl font-semibold text-slate-900 dark:text-white">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 lg:col-span-2 dark:border-white/10 dark:bg-white/[0.03]">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Background operation</h2>
          <div className="mt-4 space-y-3 text-xs text-slate-500 dark:text-slate-400">
            {[
              ["Observe", "SAI watches business events and external evidence."],
              ["Reason", "SAI identifies what needs attention without interrupting normal work."],
              ["Act", "Approved commands use CafeERP domain engines."],
              ["Verify", "Consequential work is checked against actual state."],
            ].map(([title, detail]) => (
              <div key={title} className="flex gap-3 border-b border-slate-100 pb-3 last:border-0 dark:border-white/10">
                <span className="w-16 shrink-0 font-medium text-slate-700 dark:text-slate-200">{title}</span>
                <span>{detail}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Safety</h2>
          <div className="mt-4 space-y-3 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-500" /> Policy gates commands</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Verification follows writes</div>
            <div className="flex items-center gap-2"><XCircle className="h-4 w-4 text-slate-400" /> No direct AI accounting authority</div>
          </div>
          <button className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white">
            View execution details <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}
