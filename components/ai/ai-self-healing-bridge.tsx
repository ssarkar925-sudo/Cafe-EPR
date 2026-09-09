"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Finding = { id: string; severity: "critical" | "high" | "medium" | "info"; area: string; title: string; evidence: string; recommendation: string; autoFixable: boolean; repairKind?: string };
type Diagnosis = { findings: Finding[]; scannedAt: string };

const APPROVAL_KEY = "cafe-epr-self-heal-approval";

async function readJson(response: Response) { return response.json().catch(() => ({} as any)); }

export default function AISelfHealingBridge() {
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [approval, setApproval] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [scanError, setScanError] = useState("");
  const scanBusy = useRef(false);

  const prepareRepair = useCallback(async () => {
    if (scanBusy.current || busy) return;
    setBusy(true);
    setScanError("");
    setMessage("AI is preparing the verified safe repair…");
    try {
      const response = await fetch("/api/ai/self-heal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prepareRepair: true }), cache: "no-store" });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data?.error || `Repair preparation failed (${response.status})`);
      if (data.approval) {
        setApproval(data.approval);
        const finding = data.diagnosis?.findings?.find((item: Finding) => item.autoFixable && item.repairKind);
        if (finding) window.localStorage.setItem(APPROVAL_KEY, `${finding.id}:${finding.repairKind}:${finding.evidence}`);
        setDiagnosis(data.diagnosis || diagnosis);
        setMessage("AI solution is ready. Review the proposed repair below and approve it to apply the change.");
      } else setMessage(data.message || "No safe automatic repair is available for the detected issue.");
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "Repair preparation failed");
      setMessage("");
    } finally { setBusy(false); }
  }, [busy, diagnosis]);

  const scan = useCallback(async () => {
    if (scanBusy.current) return;
    scanBusy.current = true;
    setBusy(true);
    setScanError("");
    setMessage("AI is scanning application health…");
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
        setMessage(nextDiagnosis.findings?.length ? `AI scan completed — ${nextDiagnosis.findings.length} issue(s) detected. See the AI Solution for each finding below.` : "AI scan completed — no repair-worthy application issue detected.");
        return;
      }
      const fingerprint = `${repairable.id}:${repairable.repairKind}:${repairable.evidence}`;
      const previous = window.localStorage.getItem(APPROVAL_KEY);
      if (previous === fingerprint) {
        setMessage(`AI found ${nextDiagnosis.findings.length} issue(s). The previously prepared solution is still awaiting your approval.`);
        return;
      }
      const prepare = await fetch("/api/ai/self-heal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prepareRepair: true }), cache: "no-store" });
      const prepared = await readJson(prepare);
      if (!prepare.ok) throw new Error(prepared?.error || `Repair preparation failed (${prepare.status})`);
      if (prepared.approval) {
        setApproval(prepared.approval);
        window.localStorage.setItem(APPROVAL_KEY, fingerprint);
        setMessage("AI diagnosed the issue and prepared a safe solution. Owner approval is required before applying it.");
      } else setMessage("AI diagnosed the issue, but no safe automatic repair was generated.");
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "AI self-healing scan failed");
      setMessage("");
    } finally { scanBusy.current = false; setBusy(false); }
  }, []);

  useEffect(() => { void scan(); const timer = window.setInterval(() => void scan(), 10 * 60 * 1000); return () => window.clearInterval(timer); }, [scan]);

  async function approveRepair() {
    if (!approval || busy) return;
    setBusy(true); setMessage(""); setScanError("");
    try {
      const response = await fetch(`/api/ai/agent/approval/${approval.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: "Owner approved AI self-healing repair." }) });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data?.error || "Repair approval failed");
      setApproval(null);
      if (data.executed) {
        setMessage(data.repair?.message || "AI repair completed and the fault was verified.");
        window.localStorage.removeItem(APPROVAL_KEY);
        void scan();
      } else setMessage("Approval was recorded, but the repair was not executed.");
    } catch (error) { setScanError(error instanceof Error ? error.message : "Repair failed"); }
    finally { setBusy(false); }
  }

  const findings = diagnosis?.findings || [];
  const actionable = findings.filter((finding) => finding.autoFixable && finding.repairKind);

  return (
    <section className="rounded-3xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm dark:border-amber-500/20 dark:bg-amber-500/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="flex flex-wrap items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${busy ? "animate-pulse bg-amber-500" : "bg-emerald-500"}`} /><h2 className="text-base font-black text-slate-900 dark:text-white">AI Application Guardian</h2><span className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-700 dark:border-amber-500/30 dark:bg-slate-900 dark:text-amber-300">Diagnose → Solve → Approve → Repair → Verify</span></div><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">AI explains the fault and prepares a safe repair. Nothing is changed until you explicitly approve it.</p></div>
        <button type="button" onClick={() => void scan()} disabled={busy} className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-800 hover:bg-amber-100 disabled:cursor-wait disabled:opacity-50 dark:border-amber-500/30 dark:bg-slate-900 dark:text-amber-300">{busy ? "Scanning…" : "Scan now"}</button>
      </div>

      {findings.length > 0 ? <div className="mt-4 space-y-3">{findings.slice(0, 5).map((finding) => <div key={finding.id} className="rounded-2xl border border-white/70 bg-white/90 p-4 dark:border-white/10 dark:bg-slate-900/80">
        <div className="text-xs font-black text-slate-900 dark:text-white">{finding.severity.toUpperCase()} · {finding.area} · {finding.title}</div>
        <div className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300"><b>Evidence:</b> {finding.evidence}</div>
        <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/80 p-3 dark:border-blue-500/20 dark:bg-blue-500/5"><div className="text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-300">AI Solution</div><div className="mt-1 text-xs font-semibold leading-5 text-slate-700 dark:text-slate-200">{finding.recommendation}</div></div>
        {finding.autoFixable && finding.repairKind ? <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">✓ Safe repair available</span><button type="button" onClick={() => void prepareRepair()} disabled={busy || !!approval} className="rounded-xl bg-amber-600 px-3 py-2 text-[11px] font-black text-white disabled:opacity-50">{approval ? "Solution ready below" : "Generate AI fix"}</button></div> : <div className="mt-3 text-[10px] font-bold text-slate-500">AI will not auto-change this finding because the correct replacement cannot be safely inferred.</div>}
      </div>)}</div> : <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs font-semibold text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/5 dark:text-emerald-300">{busy ? "AI is checking configured integrations and data integrity…" : "No application findings from the latest scan."}</div>}

      {actionable.length > 0 && approval && <div className="mt-4 rounded-2xl border-2 border-amber-300 bg-white p-4 dark:border-amber-500/40 dark:bg-slate-950/70"><div className="text-sm font-black text-amber-900 dark:text-amber-200">AI Fix Ready — Owner Approval Required</div><div className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">The AI has diagnosed the issue and prepared the safe repair. Review the solution above, then approve it. After approval the repair is executed and the same health check runs again.</div><button type="button" onClick={() => void approveRepair()} disabled={busy} className="mt-3 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-black text-white shadow-sm hover:bg-amber-700 disabled:cursor-wait disabled:opacity-60">{busy ? "Repairing…" : "Approve & apply AI fix"}</button></div>}
      {message && <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">{message}</div>}
      {scanError && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">AI error: {scanError}</div>}
      {diagnosis?.scannedAt && <div className="mt-2 text-[10px] text-slate-500">Last AI scan: {new Date(diagnosis.scannedAt).toLocaleString()}</div>}
    </section>
  );
}
