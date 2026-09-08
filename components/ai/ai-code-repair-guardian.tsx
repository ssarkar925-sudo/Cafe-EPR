"use client";

import { useCallback, useEffect, useState } from "react";

type Bug = { id: string; source: string; severity: string; message: string; route?: string; runId?: number; createdAt: string };
type Plan = { path: string; diff: string; explanation: string; tests: string[]; confidence: number; generatedAt: string; bug: Bug };

export default function AICodeRepairGuardian() {
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [selected, setSelected] = useState<Bug | null>(null);
  const [path, setPath] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [approval, setApproval] = useState<any>(null);
  const [commit, setCommit] = useState("");
  const [verification, setVerification] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const scan = useCallback(async () => {
    try {
      const response = await fetch("/api/ai/code-repair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "scan" }), cache: "no-store" });
      const data = await response.json();
      if (response.ok) setBugs(data.bugs || []);
    } catch {}
  }, []);

  useEffect(() => { void scan(); const timer = window.setInterval(() => void scan(), 10 * 60 * 1000); return () => window.clearInterval(timer); }, [scan]);

  async function prepare() {
    if (!selected || !path.trim() || busy) return;
    setBusy(true); setMessage(""); setPlan(null); setApproval(null);
    try {
      const response = await fetch("/api/ai/code-repair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "prepare", bugId: selected.id, path: path.trim() }), cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Could not prepare repair");
      setPlan(data.plan); setApproval(data.approval); setMessage("Repair prepared. Nothing has been changed. Review the exact diff before approving.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Repair preparation failed"); }
    finally { setBusy(false); }
  }

  async function approve() {
    if (!approval || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/ai/agent/approval/${approval.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: "Owner approved the displayed minimal code repair." }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Repair approval failed");
      const sha = data?.repair?.commitSha;
      setApproval(null);
      setCommit(sha || "");
      setMessage(sha ? "Patch applied to main. Waiting for the quality gate and deployment verification." : "Patch was applied, but no commit SHA was returned.");
      if (sha) await verify(sha);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Repair failed"); }
    finally { setBusy(false); }
  }

  async function verify(sha = commit) {
    if (!sha) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/ai/code-repair/verify?commit=${sha}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Verification failed");
      setVerification(data);
      if (data.productionVerified) setMessage("Repair verified: quality gate passed and a READY Vercel deployment was found.");
      else if (data.quality?.status === "in_progress") setMessage("Repair applied. Quality gate is still running; production is not yet verified.");
      else if (data.qualityPassed) setMessage("Quality gate passed. Production deployment is not yet verified.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Verification failed"); }
    finally { setBusy(false); }
  }

  return <section className="rounded-3xl border border-rose-200 bg-white shadow-sm dark:border-rose-500/20 dark:bg-slate-900">
    <div className="border-b border-rose-100 bg-rose-50/70 px-5 py-5 dark:border-rose-500/10 dark:bg-rose-500/5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-300">AI Code Guardian</div><h2 className="mt-1 text-xl font-black text-slate-900 dark:text-white">Detect → Inspect → Patch → Approve → Test → Deploy → Verify</h2><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Runtime/build failures can become a proposed minimal patch. Source changes are blocked until you approve the exact diff.</p></div><button type="button" onClick={() => void scan()} disabled={busy} className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-black text-rose-700 disabled:opacity-50 dark:border-rose-500/20 dark:bg-slate-900 dark:text-rose-300">Scan bugs</button></div>
    </div>
    <div className="p-5 sm:p-6">
      {bugs.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500 dark:border-white/10 dark:bg-slate-950/40">No detected build/runtime errors from the configured monitors.</div> : <div className="space-y-2">{bugs.slice(0, 8).map((bug) => <button key={bug.id} type="button" onClick={() => { setSelected(bug); setPlan(null); setApproval(null); }} className={`block w-full rounded-2xl border p-4 text-left ${selected?.id === bug.id ? "border-rose-400 bg-rose-50 dark:bg-rose-500/10" : "border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950/40"}`}><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-black text-slate-900 dark:text-white">{bug.message}</span><span className="rounded-full bg-rose-100 px-2 py-1 text-[9px] font-black uppercase text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{bug.source}</span></div>{bug.route && <div className="mt-1 text-[11px] text-slate-500">Route: {bug.route}</div>}</button>)}</div>}
      {selected && <div className="mt-4 rounded-2xl border border-slate-200 p-4 dark:border-white/10"><div className="text-xs font-black text-slate-900 dark:text-white">Inspect source for selected failure</div><div className="mt-1 text-[11px] leading-5 text-slate-500">Enter the relevant source file. The server re-fetches it, records its exact SHA, generates a minimal diff, and rejects stale files.</div><div className="mt-3 flex gap-2"><input value={path} onChange={(e) => setPath(e.target.value)} placeholder="e.g. app/api/example/route.ts" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-white/10 dark:bg-slate-950"/><button type="button" onClick={() => void prepare()} disabled={busy || !path.trim()} className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{busy ? "Preparing…" : "Generate patch"}</button></div></div>}
      {plan && <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-950/20"><div className="flex flex-wrap items-center justify-between gap-2"><div className="text-sm font-black text-amber-900 dark:text-amber-200">Exact proposed change: {plan.path}</div><div className="text-[10px] font-black uppercase text-amber-700">Confidence {Math.round(plan.confidence * 100)}%</div></div><p className="mt-2 text-xs leading-5 text-amber-900/80 dark:text-amber-200/80">{plan.explanation}</p><pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-slate-950 p-3 text-[10px] leading-4 text-slate-200">{plan.diff}</pre><div className="mt-3 text-[10px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">Tests: {plan.tests.join(" · ")}</div>{approval && <button type="button" onClick={() => void approve()} disabled={busy} className="mt-4 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{busy ? "Applying…" : "Approve exact patch"}</button>}</div>}
      {verification && <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/5"><div className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Verification</div><div className="mt-2 grid gap-2 sm:grid-cols-3"><div className="rounded-xl bg-white/70 p-3 text-xs"><b>Quality gate</b><div>{verification.quality?.status || "not found"} {verification.quality?.conclusion ? `· ${verification.quality.conclusion}` : ""}</div></div><div className="rounded-xl bg-white/70 p-3 text-xs"><b>Deployment</b><div>{verification.deployment?.state || "not found"}</div></div><div className="rounded-xl bg-white/70 p-3 text-xs"><b>Production</b><div>{verification.productionVerified ? "VERIFIED" : "NOT VERIFIED"}</div></div></div>{commit && <button type="button" onClick={() => void verify()} disabled={busy} className="mt-3 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-black text-emerald-700">Refresh verification</button>}</div>}
      {message && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 dark:border-white/10 dark:bg-slate-950/50 dark:text-slate-300">{message}</div>}
    </div>
  </section>;
}
