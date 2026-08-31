"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type HubModule = {
  id: string;
  label: string;
  description: string;
  href: string;
  items: { label: string; href: string; description?: string }[];
};

export default function HubWorkspace({
  hub,
  modules,
}: {
  hub: string;
  modules: HubModule[];
}) {
  const pathname = usePathname();
  return (
    <section className="space-y-6">
      <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/80 sm:p-8">
        <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative">
          <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">Hub Workspace</div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">{hub}</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Select a business area to open its working modules. Operational screens remain one level deeper so the sidebar stays clean.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => {
          const active = pathname === module.href || pathname.startsWith(module.href + "/");
          return (
            <Link key={module.id} href={module.href} className={`group rounded-[24px] border p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${active ? "border-blue-500/50 bg-blue-50/70 shadow-blue-500/10 dark:bg-blue-500/10" : "border-slate-200/80 bg-white/90 hover:border-blue-300 dark:border-white/10 dark:bg-slate-900/70 dark:hover:border-blue-500/40"}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-sm font-black text-slate-700 transition group-hover:bg-blue-600 group-hover:text-white dark:bg-white/10 dark:text-slate-200">{module.label.slice(0, 1)}</div>
                <span className="text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-500">→</span>
              </div>
              <h2 className="mt-5 text-base font-black text-slate-900 dark:text-white">{module.label}</h2>
              <p className="mt-1.5 min-h-10 text-xs leading-5 text-slate-500 dark:text-slate-400">{module.description}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {module.items.slice(0, 4).map((item) => <span key={item.href} className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 dark:bg-white/5 dark:text-slate-300">{item.label}</span>)}
                {module.items.length > 4 && <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-400 dark:bg-white/5">+{module.items.length - 4}</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
