"use client";

import Link from "next/link";

export default function AuditOpsStrip({ latestRun }: { latestRun: any }) {
  const findings = Array.isArray(latestRun?.audit_findings) ? latestRun.audit_findings : [];
  const critical = findings.filter((f: any) => String(f.severity).toLowerCase() === "critical").length;
  const high = findings.filter((f: any) => String(f.severity).toLowerCase() === "high").length;
  const unresolved = findings.filter((f: any) => !["resolved", "fixed", "closed"].includes(String(f.status ?? "").toLowerCase())).length;
  const label = latestRun ? "Audit available" : "No audit run";
  return <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-5">
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Latest audit</div><div className="mt-1 text-sm font-bold text-slate-950 dark:text-white">{label}</div></div>
    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 shadow-sm dark:border-rose-500/20 dark:bg-rose-500/10"><div className="text-[10px] font-bold uppercase tracking-wider text-rose-600">Critical</div><div className="mt-1 text-lg font-bold text-rose-700 dark:text-rose-300">{critical}</div></div>
    <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 shadow-sm dark:border-orange-500/20 dark:bg-orange-500/10"><div className="text-[10px] font-bold uppercase tracking-wider text-orange-600">High</div><div className="mt-1 text-lg font-bold text-orange-700 dark:text-orange-300">{high}</div></div>
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm dark:border-amber-500/20 dark:bg-amber-500/10"><div className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Unresolved</div><div className="mt-1 text-lg font-bold text-amber-700 dark:text-amber-300">{unresolved}</div></div>
    <Link href="/ai/self-audit" className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 shadow-sm transition hover:border-indigo-300 hover:shadow-md dark:border-indigo-500/20 dark:bg-indigo-500/10"><div className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Control</div><div className="mt-1 text-sm font-bold text-indigo-700 dark:text-indigo-300">Open AI Audit →</div></Link>
  </div>;
}
