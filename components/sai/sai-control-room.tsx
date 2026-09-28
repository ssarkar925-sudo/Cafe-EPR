"use client";

import { useEffect, useState } from "react";
import { Activity, ArrowUpRight, Bot, CheckCircle2, Clock3, ShieldCheck, XCircle } from "lucide-react";

type Status = {
  online?: boolean;
  activeTasks?: number;
  pendingApprovals?: number;
  attention?: number;
};

type Attention = {
  attention_id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail?: string | null;
  diagnosis_category?: string | null;
  diagnosis_explanation?: string | null;
  recommended_action?: string | null;
  diagnosis_status?: string | null;
  created_at: string;
};

export default function SAIControlRoom() {
  const [status, setStatus] = useState<Status>({});
  const [attention, setAttention] = useState<Attention[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const [statusResponse, attentionResponse] = await Promise.all([
        fetch("/api/sai/status", { cache: "no-store" }),
        fetch("/api/sai/attention", { cache: "no-store" }),
      ]);
      const statusData = statusResponse.ok ? await statusResponse.json() : {};
      const attentionData = attentionResponse.ok ? await attentionResponse.json() : { attention: [] };
      setStatus(statusData || {});
      setAttention(Array.isArray(attentionData?.attention) ? attentionData.attention : []);
    } catch {
      setStatus({ online: false });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void load();
    const timer = window.setInterval(() => { if (!cancelled) void load(); }, 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  async function updateAttention(attentionId: string, action: "acknowledge" | "resolve") {
    setBusyId(attentionId);
    try {
      await fetch("/api/sai/attention", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attentionId, action }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const cards = [
    { label: "System", value: loading ? "…" : status.online === false ? "Offline" : "Online", icon: Activity },
    { label: "Active work", value: status.activeTasks ?? 0, icon: Clock3 },
    { label: "Needs approval", value: status.pendingApprovals ?? 0, icon: ShieldCheck },
    { label: "Attention", value: attention.length, icon: Bot },
  ];

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> SAI
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Control Room</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Background work, approvals, diagnosis and system attention.</p>
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

      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Attention Center</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">SAI diagnoses observations; financial corrections remain outside SAI authority.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500 dark:bg-white/10 dark:text-slate-300">{attention.length} open</span>
        </div>

        {attention.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400 dark:border-white/10">
            No open attention items.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {attention.map((item) => (
              <article key={item.attention_id} className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={item.severity === "critical" ? "h-2 w-2 rounded-full bg-rose-500" : item.severity === "warning" ? "h-2 w-2 rounded-full bg-amber-500" : "h-2 w-2 rounded-full bg-sky-500"} />
                      <h3 className="text-sm font-medium text-slate-900 dark:text-white">{item.title}</h3>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{item.diagnosis_explanation || item.detail || "Diagnosis pending."}</p>
                    {item.diagnosis_category && <div className="mt-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">{item.diagnosis_category} · {item.recommended_action || "review"}</div>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {item.diagnosis_status === "diagnosed" && (
                      <button disabled={busyId === item.attention_id} onClick={() => void updateAttention(item.attention_id, "acknowledge")} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Acknowledge</button>
                    )}
                    <button disabled={busyId === item.attention_id} onClick={() => void updateAttention(item.attention_id, "resolve")} className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-[10px] font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900">Resolve</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 lg:col-span-2 dark:border-white/10 dark:bg-white/[0.03]">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Background operation</h2>
          <div className="mt-4 space-y-3 text-xs text-slate-500 dark:text-slate-400">
            {[["Observe","SAI watches business events and external evidence."],["Reason","SAI identifies what needs attention without interrupting normal work."],["Act","Approved commands use CafeERP domain engines."],["Verify","Consequential work is checked against actual state."]].map(([title, detail]) => (
              <div key={title} className="flex gap-3 border-b border-slate-100 pb-3 last:border-0 dark:border-white/10"><span className="w-16 shrink-0 font-medium text-slate-700 dark:text-slate-200">{title}</span><span>{detail}</span></div>
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
          <button className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white">View execution details <ArrowUpRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </section>
  );
}
