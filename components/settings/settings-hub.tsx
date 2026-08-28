"use client";

import Link from "next/link";

const sections = [
  ["Business profile", "Shop identity, invoice and GST configuration.", "business", "▣"],
  ["Payments & accounts", "Payment methods, instruments, banks and merchant QR.", "payments", "₹"],
  ["Catalog & services", "Products, services, categories and quick-sale setup.", "catalog", "▦"],
  ["Recharge & portals", "Service providers, commission slabs and portal configuration.", "services", "↗"],
];

export default function SettingsHub({ shopName }: { shopName: string }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><div className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Workspace configuration</div><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">Settings Command Center</h1><p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Configure {shopName} from one organized administration workspace.</p></div>
        <Link href="/settings?tab=business" className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700">Open settings →</Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {sections.map(([title, desc, tab, icon]) => <Link key={tab} href={`/settings?tab=${tab}`} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md dark:border-white/10 dark:bg-slate-900"><div className="flex items-start justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-lg text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">{icon}</span><span className="text-slate-400 transition group-hover:translate-x-1">→</span></div><h2 className="mt-4 font-semibold text-slate-950 dark:text-white">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{desc}</p></Link>)}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm dark:border-white/10"><div className="text-xs font-bold uppercase tracking-wider text-slate-400">Administration principle</div><h2 className="mt-2 text-xl font-bold">Change configuration deliberately</h2><p className="mt-1 max-w-2xl text-sm text-slate-400">Payment accounts, GST details and pricing affect live transactions. Review configuration changes before using them at the counter.</p></div>
    </div>
  );
}
