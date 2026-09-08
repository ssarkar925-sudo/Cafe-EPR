"use client";

import { useCallback, useEffect, useState } from "react";

type Finding = {
  id: string;
  severity: "critical" | "high" | "medium" | "info";
  area: string;
  title: string;
  evidence: string;
  recommendation: string;
  autoFixable: boolean;
  repairKind?: string;
};

type Diagnosis = { findings: Finding[]; scannedAt: string };

export default function AISelfHealingBridge() {
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [approval, setApproval] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const scan = useCallback(async () => {
    try {
      const response = await fetch("/api/ai/self-heal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prepareRepair: false }), cache: "no-store" });
      const data = await response.json();
      if (!response.ok) return;
      setDiagnosis(data.diagnosis || null);

      const repairable = (data.diagnosis?.findings || []).find((item: Finding) => item.autoFixable && item.repairKind);
      if (!repairable) {
        setApproval(null);
        return;
      }

      const fingerprint = `${repairable.id}:${data.diagnosis?.scannedAt?.slice(0, 16) || "current"}`;
      const previous = window.localStorage.getItem("cafe-epr-self-heal-approval");
      if (previous?.startsWith(`${repairable.id}:`)) return;

      const prepare = await fetch("/api/ai/self-heal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prepareRepair: true }), cache: "no-store" });
      const prepared = await prepare.json();
      if (prepare.ok && prepared.approval) {
        setApproval(prepared.approval);
        window.localStorage.setItem("cafe-epr-self-heal-approval", fingerprint);
        setMessage("I detected a verified application issue. No fix has been applied. Your approval is required.");
        if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("Cafe ERP — AI Repair Approval", { body: `${repairable.area}: ${repairable.title}` });
        else if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
      }
    } catch {
      // Self-healing monitoring must never block the main AI Agent UI.
    }
  }, []);

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
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Repair approval failed");
      setApproval(null);
      if (data.executed) {
        setMessage(data.repair?.message || "Repair completed and verified.");
        window.localStorage.removeItem("cafe-epr-self-heal-approval");
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
  if (!findings.length && !message) return null;

  return (
    <section className="rounded-3xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm dark:border-amber-500/20 dark:bg-amber-500/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-500" />
            <h2 className="text-base font-black text-slate-900 dark:text-white">AI Application Guardian</h2>
            <span className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-700 dark:border-amber-500/30 dark:bg-slate-900 dark:text-amber-300">Diagnose → Ask → Repair → Verify</span>
          </div>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">The AI can detect application/integration faults, but it will never repair them without your explicit approval.</p>
        </div>
        <button type="button" onClick={() => void scan()} disabled={busy} className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-800 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-500/30 dark:bg-slate-900 dark:text-amber-300">Scan now</button>
      </div>

      {findings.length > 0 && (
        <div className="mt-3 space-y-2">
          {findings.slice(0, 5).map((finding) => (
            <div key={finding.id} className="rounded-2xl border border-white/70 bg-white/80 p-3 dark:border-white/10 dark:bg-slate-900/70">
              <div className="text-xs font-black text-slate-900 dark:text-white">{finding.severity.toUpperCase()} · {finding.area} · {finding.title}</div>
              <div className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Evidence: {finding.evidence}</div>
              <div className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Plan: {finding.recommendation}</div>
            </div>
          ))}
        </div>
      )}

      {actionable.length > 0 && approval && (
        <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-amber-300 bg-white p-4 dark:border-amber-500/30 dark:bg-slate-950/70 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-black text-amber-900 dark:text-amber-200">Owner permission required</div>
            <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">Approve only if you want Cafe AI to apply the verified safe repair and then re-check the same fault.</div>
          </div>
          <button type="button" onClick={() => void approveRepair()} disabled={busy} className="rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-black text-white shadow-sm hover:bg-amber-700 disabled:cursor-wait disabled:opacity-60">{busy ? "Repairing…" : "Approve & repair"}</button>
        </div>
      )}

      {message && <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">{message}</div>}
    </section>
  );
}
