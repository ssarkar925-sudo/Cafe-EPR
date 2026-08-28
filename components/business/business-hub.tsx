"use client";

import Link from "next/link";

const areas = [
  ["Service Portals", "Configure cybercafe service providers and commissions.", "/business/portals", "↗"],
  ["Bank Accounts", "Manage business banking and settlement accounts.", "/business/banks", "₹"],
  ["Merchant QR", "Keep payment QR profiles ready for counter collections.", "/business/merchant-qrs", "▣"],
];

export default function BusinessHub() {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-bold uppercase tracking-[0.18em] text-violet-600">Operations control</div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">Business Command Center</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Central access to the business infrastructure behind your cybercafe, payments and service operations.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {areas.map(([title, desc, href, icon]) => <Link key={href} href={href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md dark:border-white/10 dark:bg-slate-900"><div className="flex items-start justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-lg text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">{icon}</span><span className="text-slate-400 transition group-hover:translate-x-1">→</span></div><h2 className="mt-4 font-semibold text-slate-950 dark:text-white">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{desc}</p></Link>)}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm dark:border-white/10"><div className="text-xs font-bold uppercase tracking-wider text-slate-400">Operational tip</div><h2 className="mt-2 text-xl font-bold">Keep payment infrastructure current</h2><p className="mt-1 max-w-2xl text-sm text-slate-400">Review active bank and QR profiles whenever settlement details change, so counter staff always use the correct collection channel.</p></div>
    </div>
  );
}
