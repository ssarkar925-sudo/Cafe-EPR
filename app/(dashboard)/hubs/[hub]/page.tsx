import Link from "next/link";
import { notFound } from "next/navigation";
import { getHub } from "@/lib/navigation/hub-navigation";

export default async function HubPage({ params }: { params: Promise<{ hub: string }> }) {
  const { hub: hubId } = await params;
  const hub = getHub(hubId);
  if (!hub) notFound();

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/dashboard" className="text-xs font-bold text-slate-400 hover:text-blue-600">← Dashboard</Link>
          <div className="mt-4 flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-xl text-white shadow-sm dark:bg-white dark:text-slate-900">{hub.icon}</span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">{hub.label}</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{hub.description}</p>
            </div>
          </div>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {hub.modules.map((module) => (
          <Link key={module.id} href={`/hubs/${hub.id}/${module.id}`} className="group rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg dark:border-white/10 dark:bg-white/[.04] dark:hover:border-blue-500/50">
            <div className="flex items-start justify-between gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-sm font-black text-slate-700 dark:bg-white/10 dark:text-slate-200">{module.label.slice(0, 1)}</div>
              <span className="text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-500">→</span>
            </div>
            <h2 className="mt-5 text-base font-black text-slate-900 dark:text-white">{module.label}</h2>
            <p className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-400">{module.description}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {module.items.slice(0, 4).map((item) => <span key={item.label} className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">{item.label}</span>)}
              {module.items.length > 4 && <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-400 dark:bg-white/10">+{module.items.length - 4}</span>}
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
