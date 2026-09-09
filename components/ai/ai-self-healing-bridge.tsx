"use client";

import { useCallback, useEffect, useState } from "react";

type Finding = { id: string; severity: "critical" | "high" | "medium" | "info"; area: string; title: string; evidence: string; recommendation: string; autoFixable: boolean; repairKind?: string };
type Diagnosis = { findings: Finding[]; scannedAt: string };

const APPROVAL_KEY = "cafe-epr-self-heal-approval";

async function readJson(response: Response) {
  return response.json().catch(() => ({} as any));
}

export default function AISelfHealingBridge() {
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [approval, setApproval] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [scanError, setScanError] = useState("");

  const scan = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setScanError("");
    setMessage("Scanning application health…");
    try {
      const response = await fetch("/api/ai/self-heal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prepareRepair: false }), cache: "no-store" });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data?.error || `Scan failed (${response.status})`);
      const nextDiagnosis = data.diagnosis || { findings: [], scannedAt: new Date().toISOString() };
      setDiagnosis(nextDiagnosis);

      const repairable = (nextDiagnosis.findings || []).find((item: Finding) => item.autoFixable && item.repairKind);
      if (!repairable) {
        setApproval(null);
        window.localStorage.removeItem(APPROVAL_KEY);
        setMessage(nextDiagnosis.findings?.length ? `Scan completed — ${nextDiagnosis.findings.length} application issue(s) detected. No repair was applied.` : "Scan completed — no repair-worthy application issue detected.");
        return;
      }

      const fingerprint = `${repairable.id}:${repairable.repairKind}:${repairable.evidence}`;
      const previous = window.localStorage.getItem(APPROVAL_KEY);
      if (previous === fingerprint) {
        setMessage(`Scan completed — ${nextDiagnosis.findings.length} issue(s) detected. Existing approval request is still available.`);
        return;
      }

      const prepare = await fetch("/api/ai/self-heal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prepareRepair: true }), cache: "no-store" });
      const prepared = await readJson(prepare);
      if (!prepare.ok) throw new Error(prepared?.error || `Repair preparation failed (${prepare.status})`);
      if (prepared.approval) {
        setApproval(prepared.approval);
        window.localStorage.setItem(APPROVAL_KEY, fingerprint);
        setMessage("Verified application issue detected. No fix has been applied; owner approval is required.");
        if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("Cafe ERP — AI Repair Approval", { body: `${repairable.area}: ${repairable.title}` });
        else if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
      } else {
        setMessage(`Scan completed — ${nextDiagnosis.findings.length} issue(s) detected. No repair approval was generated.`);
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : "AI self-healing scan failed";
      setScanError(text);
      setMessage("");
    } finally {
      setBusy(false);
    }
  }, [busy]);

  useEffect(() => {
    void scan();
    const timer = window.setInterval(() => { void scan(); }, 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [scan]);

  async function approveRepair() {
    if (!approval || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/ai/agent/approval/${approval.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: "Owner approved AI self-healing repair." }) });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data?.error || "Repair approval failed");
      setApproval(null);
      if (data.executed) {
        setMessage(data.repair?.message || "Repair completed and verified.");
        window.localStorage.removeItem(APPROVAL_KEY);
        void scan();
      } else {
        setMessage("Approval was recorded, but the repair was not executed.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Repair failed");
    } finally {
      setBusy(false);
    }
  }

  const findings = diagnosis?.findings || [];
  const actionable = findings.filter((finding) => finding.autoFixable);

  return (
    <section className="rounded-3xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm dark:border-amber-500/20 dark:bg-amber-500/5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${busy ? "animate-pulse bg-amber-500" : "bg-emerald-500"}`} /><h2 className="text-base font-black text-slate-900 dark:text-white">AI Application Guardian</h2><span className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-700 dark:border-amber-500/30 dark:bg-slate-900 dark:text-amber-300">Diagnose → Ask → Repair → Verify</span></div><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">The AI can detect application/integration faults, but it will never repair them without your explicit approval.</p></div><button type="button" onClick={() => void scan()} disabled={busy} className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-800 hover:bg-amber-100 disabled:cursor-wait disabled:opacity-50 dark:border-amber-500/30 dark:bg-slate-900 dark:text-amber-300">{busy ? "Scanning…" : "Scan now"}</button></div>
      {findings.length > 0 ? <div className="mt-3 space-y-2">{findings.slice(0, 5).map((finding) => <div key={finding.id} className="rounded-2xl border border-white/70 bg-white/80 p-3 dark:border-white/10 dark:bg-slate-900/70"><div className="text-xs font-black text-slate-900 dark:text-white">{finding.severity.toUpperCase()} · {finding.area} · {finding.title}</div><div className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Evidence: {finding.evidence}</div><div className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Plan: {finding.recommendation}</div></div>)}</div> : <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs font-semibold text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/5 dark:text-emerald-300">{busy ? "Checking configured application integrations and data integrity…" : "No application findings from the latest scan."}</div>}
      {actionable.length > 0 && approval && <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-amber-300 bg-white p-4 dark:border-amber-500/30 dark:bg-slate-950/70 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-black text-amber-900 dark:text-amber-200">Owner permission required</div><div className="mt-1 text-xs text-slate-600 dark:text-slate-300">Approve only if you want Cafe AI to apply the verified safe repair and then re-check the same fault.</div></div><button type="button" onClick={() => void approveRepair()} disabled={busy} className="rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-black text-white shadow-sm hover:bg-amber-700 disabled:cursor-wait disabled:opacity-60">{busy ? "Repairing…" : "Approve & repair"}</button></div>}
      {message && <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">{message}</div>}
      {scanError && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">Scan error: {scanError}</div>}
      {diagnosis?.scannedAt && <div className="mt-2 text-[10px] text-slate-500">Last scan: {new Date(diagnosis.scannedAt).toLocaleString()}</div>}
    </section>
  );
}
