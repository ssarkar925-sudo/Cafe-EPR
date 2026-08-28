"use client";

import Link from "next/link";

const controls = [
  ["Access control", "Admin-only security center and role-aware workspace access.", "/security", "◈"],
  ["Settings", "Business identity, invoice, GST and workspace configuration.", "/settings", "⚙"],
  ["Audit & AI", "Review operational anomalies and audit activity.", "/ai/self-audit", "✦"],
];

export default function SecurityHub({ shopName }: { shopName: string }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><div className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">Administration</div><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">Security & Control Center</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Protect {shopName} with a focused administration workspace for access, settings and operational review.</p></div>
        <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">Admin protected</span>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {controls.map(([title, desc, href, icon]) => <Link key={href} href={href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md dark:border-white/10 dark:bg-slate-900"><div className="flex items-start justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-lg dark:bg-white/5">{icon}</span><span className="text-slate-400 transition group-hover:translate-x-1">→</span></div><h2 className="mt-4 font-semibold text-slate-950 dark:text-white">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{desc}</p></Link>)}
      </div>
      <div className="grid gap-4 md:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Recommended</div><h2 className="mt-2 font-semibold text-slate-950 dark:text-white">Review security regularly</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Use the security center to investigate data inconsistencies before they affect billing, stock or settlements.</p></div><div className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm"><div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Safe operations</div><h2 className="mt-2 font-semibold">Least privilege by default</h2><p className="mt-1 text-sm text-slate-400">Keep sensitive administration actions behind the existing role checks.</p></div></div>
    </div>
  );
}
