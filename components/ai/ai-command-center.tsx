"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Check = { module: string; status: "healthy" | "attention" | "unknown"; summary: string };
type Anomaly = { id: string; severity: string; area: string; title: string; evidence: string; recommendation: string; autoFixable: boolean; repairKind?: string };
type Action = { action: string; title: string; reason: string; requiresApproval: boolean; payload?: Record<string, unknown> };
type Result = { task: string; plan: string[]; checks: Check[]; anomalies: Anomaly[]; actions: Action[]; approvalRequired: boolean; completedAt: string; };

const DEFAULT_TASK = "Run a full command-center health check across business, inventory, receivables, transactions, WhatsApp, and self-audit. Detect anomalies and prepare only safe next actions.";

export default function AICommandCenter() {
  const [task, setTask] = useState(DEFAULT_TASK);
  const [result, setResult] = useState<Result | null>(null);
  const [approval, setApproval] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const busyRef = useRef(false);

  const run = useCallback(async (prepareRepair = false, overrideTask?: string) => {
    const mission = (overrideTask ?? task).trim();
    if (busyRef.current || !mission) return;
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/ai/command-center", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: mission, prepareRepair }), cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Command Center failed");
      setResult(data);
      if (data.approval) {
        setApproval(data.approval);
        setMessage("A consequential repair is ready, but nothing has been changed. Owner approval is required.");
      } else if (prepareRepair) {
        setApproval(null);
        setMessage("No repair was prepared from this scan. No changes were made.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Command Center failed");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [task]);

  useEffect(() => {
    void run(false, DEFAULT_TASK);
    const timer = window.setInterval(() => { void run(false); }, 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [run]);

  async function approve() {
    if (!approval || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const response = await fetch(`/api/ai/agent/approval/${approval.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: "Owner approved Command Center repair after reviewing the detected anomaly." }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Approval failed");
      setApproval(null);
      setMessage(data?.repair?.message || "Approved action completed and verification was attempted.");
      busyRef.current = false;
      setBusy(false);
      await run(false, task);
    } catch (error) {
      busyRef.current = false;
      setBusy(false);
      setMessage(error instanceof Error ? error.message : "Approval failed");
    }
  }

  const attention = result?.checks.filter((item) => item.status !== "healthy").length ?? 0;
  const approvalAction = result?.actions.find((item) => item.requiresApproval);

  return (
    <section className="overflow-hidden rounded-3xl border border-indigo-200 bg-white shadow-sm dark:border-indigo-500/20 dark:bg-slate-900">
      <div className="bg-slate-950 px-5 py-5 text-white sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-indigo-200"><span className="h-2 w-2 animate-pulse rounded-full bg-indigo-400" /> AI Command Center</div>
            <h2 className="mt-2 text-2xl font-black tracking-tight">Plan → Check → Detect → Prepare → Approve → Verify</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-300">Cafe AI can coordinate multiple modules in one mission. Read-only analysis runs without approval; consequential repairs are staged and require explicit owner approval.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center text-[10px] font-black uppercase"><div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"><div className="text-indigo-300">Modules</div><div className="mt-1 text-lg">{result?.checks.length ?? "—"}</div></div><div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"><div className="text-amber-300">Attention</div><div className="mt-1 text-lg">{attention}</div></div></div>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row"><input value={task} onChange={(event) => setTask(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void run(false); }} className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100" placeholder="Tell Command Center what outcome you want…" /><button type="button" onClick={() => void run(false)} disabled={busy} className="rounded-2xl bg-indigo-600 px-5 py-3 text-xs font-black text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50">{busy ? "Working…" : "Run mission"}</button></div>

        {result && <div className="mt-5 grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-950/50"><div className="text-xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-300">Mission plan</div><ol className="mt-3 space-y-2 text-xs leading-5 text-slate-700 dark:text-slate-300">{result.plan.map((step, index) => <li key={step}><span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-black text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">{index + 1}</span>{step}</li>)}</ol></div><div className="space-y-2"><div className="text-xs font-black uppercase tracking-wider text-slate-500">Module checks</div>{result.checks.length ? result.checks.map((check) => <div key={check.module} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-slate-950/40"><div><div className="text-xs font-black text-slate-900 dark:text-white">{check.module}</div><div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{check.summary}</div></div><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${check.status === "healthy" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : check.status === "attention" ? "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300" : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"}`}>{check.status}</span></div>) : <div className="rounded-2xl border border-slate-200 p-4 text-xs text-slate-500 dark:border-white/10">No module matched this mission.</div>}</div></div>}

        {result && result.anomalies.length > 0 && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-500/20 dark:bg-amber-500/5"><div className="text-xs font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">Detected anomalies</div><div className="mt-3 space-y-2">{result.anomalies.slice(0, 8).map((finding) => <div key={finding.id} className="rounded-xl border border-white/80 bg-white/80 p-3 dark:border-white/10 dark:bg-slate-900/70"><div className="text-xs font-black text-slate-900 dark:text-white">{finding.severity.toUpperCase()} · {finding.area} · {finding.title}</div><div className="mt-1 text-[11px] leading-5 text-slate-600 dark:text-slate-300">{finding.evidence}</div><div className="mt-1 text-[11px] leading-5 text-slate-600 dark:text-slate-300">Next: {finding.recommendation}</div></div>)}</div></div>}

        {approvalAction && <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-950/20"><div className="text-sm font-black text-amber-900 dark:text-amber-200">Approval required before action</div><div className="mt-1 text-xs leading-5 text-amber-800 dark:text-amber-300">{approvalAction.title}: {approvalAction.reason}</div><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void run(true)} disabled={busy || !!approval} className="rounded-xl border border-amber-400 bg-white px-3 py-2 text-xs font-black text-amber-800 hover:bg-amber-100 disabled:opacity-50">{approval ? "Approval prepared" : "Prepare approval"}</button>{approval && <button type="button" onClick={() => void approve()} disabled={busy} className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-black text-white hover:bg-amber-700 disabled:opacity-50">{busy ? "Verifying…" : "Approve & verify"}</button>}</div></div>}

        {message && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">{message}</div>}
      </div>
    </section>
  );
}
