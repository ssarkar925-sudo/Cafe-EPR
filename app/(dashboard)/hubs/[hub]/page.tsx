import Link from "next/link";
import { notFound } from "next/navigation";
import { getHub } from "@/lib/navigation/hub-navigation";

export default async function HubPage({ params }: { params: Promise<{ hub: string }> }) {
  const { hub: hubId } = await params;
  const hub = getHub(hubId);
  if (!hub) notFound();

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <header className="relative overflow-hidden rounded-[30px] border border-slate-200/80 bg-white/90 p-7 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/80 sm:p-9">
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative">
          <Link href="/dashboard" className="text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-600">← Dashboard</Link>
          <div className="mt-5 flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-xl text-white shadow-lg dark:bg-white dark:text-slate-950">{hub.icon}</span>
            <div><h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">{hub.label}</h1><p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{hub.description}</p></div>
          </div>
          <div className="mt-7 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400"><span className="rounded-full bg-slate-100 px-3 py-1.5 dark:bg-white/5">{hub.modules.length} Main Modules</span><span className="rounded-full bg-slate-100 px-3 py-1.5 dark:bg-white/5">Choose a working area</span></div>
        </div>
      </header>

      <section>
        <div className="mb-3 flex items-end justify-between"><div><h2 className="text-sm font-black text-slate-900 dark:text-white">Main Modules</h2><p className="mt-1 text-xs text-slate-500">Select an area to access its working modules.</p></div></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {hub.modules.map((module, index) => (
            <Link key={module.id} href={`/hubs/${hub.id}/${module.id}`} className="group relative overflow-hidden rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-blue-300 hover:shadow-xl hover:shadow-slate-200/50 dark:border-white/10 dark:bg-white/[.04] dark:hover:border-blue-500/50 dark:hover:shadow-black/20">
              <div className="flex items-start justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-sm font-black text-slate-700 dark:bg-white/10 dark:text-slate-200">{String(index + 1).padStart(2, "0")}</div><span className="text-lg text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-500">→</span></div>
              <h3 className="mt-5 text-base font-black text-slate-900 dark:text-white">{module.label}</h3><p className="mt-1.5 min-h-10 text-xs leading-5 text-slate-500 dark:text-slate-400">{module.description}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">{module.items.slice(0, 4).map((item) => <span key={item.label} className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 dark:bg-white/5 dark:text-slate-300">{item.label}</span>)}{module.items.length > 4 && <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-400 dark:bg-white/5">+{module.items.length - 4}</span>}</div>
              <div className="mt-5 border-t border-slate-100 pt-3 text-[10px] font-black uppercase tracking-wider text-slate-300 group-hover:text-blue-500 dark:border-white/5">Open module</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
