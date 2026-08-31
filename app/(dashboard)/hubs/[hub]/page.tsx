"use client";

import Link from "next/link";
import { useState } from "react";
import { getHub } from "@/lib/navigation/hub-navigation";

export default function HubPage({ params }: { params: Promise<{ hub: string }> }) {
  // Hub pages intentionally keep module navigation in-place. The module route is not used for navigation.
  const [hubId, setHubId] = useState<string | null>(null);
  const [hub, setHub] = useState<ReturnType<typeof getHub>>(null);

  if (!hubId) {
    void params.then(({ hub: id }) => { setHubId(id); setHub(getHub(id)); });
    return <div className="mx-auto max-w-7xl p-8"><div className="h-32 animate-pulse rounded-[28px] bg-slate-100 dark:bg-white/5" /></div>;
  }
  if (!hub) return <div className="p-8 text-sm font-bold">Hub not found.</div>;

  return <HubContent hub={hub} />;
}

function HubContent({ hub }: { hub: NonNullable<ReturnType<typeof getHub>> }) {
  const [openId, setOpenId] = useState<string | null>(hub.modules[0]?.id ?? null);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="relative overflow-hidden rounded-[30px] border border-slate-200/70 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:p-9">
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/dashboard" className="text-[10px] font-black uppercase tracking-[.18em] text-slate-400 hover:text-blue-600">← Dashboard</Link>
            <div className="mt-5 flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-xl text-white shadow-lg dark:bg-white dark:text-slate-950">{hub.icon}</div>
              <div><h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">{hub.label}</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{hub.description}</p></div>
            </div>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-right dark:bg-white/5"><div className="text-lg font-black text-slate-900 dark:text-white">{hub.modules.length}</div><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Main Modules</div></div>
        </div>
      </header>

      <section className="space-y-3">
        <div className="px-1"><h2 className="text-sm font-black text-slate-900 dark:text-white">Work Areas</h2><p className="mt-1 text-xs text-slate-500">Choose a module. Its working places open directly inside this Hub.</p></div>
        {hub.modules.map((module, index) => {
          const open = openId === module.id;
          return <div key={module.id} className={`overflow-hidden rounded-[24px] border bg-white transition-all dark:bg-slate-900 ${open ? "border-blue-400/50 shadow-lg shadow-blue-500/5" : "border-slate-200/80 shadow-sm dark:border-white/10"}`}>
            <button type="button" onClick={() => setOpenId(open ? null : module.id)} className="flex w-full items-center gap-4 p-5 text-left sm:p-6">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xs font-black ${open ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"}`}>{String(index + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1"><span className="block text-base font-black text-slate-900 dark:text-white">{module.label}</span><span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{module.description}</span></span>
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-400 transition-transform dark:bg-white/5 ${open ? "rotate-180 text-blue-600" : ""}`}>⌄</span>
            </button>
            {open && <div className="border-t border-slate-100 bg-slate-50/60 p-4 dark:border-white/5 dark:bg-white/[.02] sm:p-5">
              <div className="mb-3 flex items-center justify-between"><div><div className="text-[10px] font-black uppercase tracking-[.16em] text-blue-600">Working Places</div><div className="mt-1 text-xs text-slate-500">Open the task directly from this Hub.</div></div><span className="text-[10px] font-black text-slate-400">{module.items.length} available</span></div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {module.items.map((item, itemIndex) => <Link key={item.label} href={item.href} className="group rounded-2xl border border-slate-200/80 bg-white p-4 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md dark:border-white/10 dark:bg-slate-900 dark:hover:border-blue-500/50">
                  <div className="flex items-center justify-between"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-[9px] font-black text-slate-500 dark:bg-white/10 dark:text-slate-300">{String(itemIndex + 1).padStart(2, "0")}</span><span className="text-slate-300 group-hover:text-blue-500">↗</span></div>
                  <div className="mt-3 text-sm font-black text-slate-900 group-hover:text-blue-600 dark:text-white">{item.label}</div>
                  <div className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">{item.description}</div>
                </Link>)}
              </div>
            </div>}
          </div>;
        })}
      </section>
    </div>
  );
}
