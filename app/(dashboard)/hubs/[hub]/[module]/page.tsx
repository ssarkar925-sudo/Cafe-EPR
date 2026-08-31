import Link from "next/link";
import { notFound } from "next/navigation";
import { getHub, getModule } from "@/lib/navigation/hub-navigation";

export default async function ModulePage({ params }: { params: Promise<{ hub: string; module: string }> }) {
  const { hub: hubId, module: moduleId } = await params;
  const hub = getHub(hubId);
  const module = getModule(hubId, moduleId);
  if (!hub || !module) notFound();

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <header className="rounded-[26px] border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/80 sm:p-7">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-400"><Link href={`/hubs/${hub.id}`} className="hover:text-blue-600">{hub.label}</Link><span>/</span><span className="text-blue-600 dark:text-blue-400">{module.label}</span></div>
        <div className="mt-5 flex items-end justify-between gap-4"><div><h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">{module.label}</h1><p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{module.description}</p></div><Link href={`/hubs/${hub.id}`} className="hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:border-blue-300 sm:block dark:border-white/10 dark:bg-white/[.04] dark:text-slate-300">← Hub</Link></div>
      </header>

      <section><div className="mb-3"><h2 className="text-sm font-black text-slate-900 dark:text-white">Working Modules</h2><p className="mt-1 text-xs text-slate-500">Open a working place to perform the task.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {module.items.map((item, index) => (
            <Link key={item.label} href={item.href} className="group min-h-40 rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg dark:border-white/10 dark:bg-white/[.04] dark:hover:border-blue-500/50">
              <div className="flex items-start justify-between gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-[10px] font-black text-slate-600 dark:bg-white/10 dark:text-slate-300">{String(index + 1).padStart(2, "0")}</span>{item.shortcut && <kbd className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-black text-slate-400 dark:border-white/10 dark:bg-white/5">{item.shortcut}</kbd>}</div>
              <h3 className="mt-4 text-sm font-black text-slate-900 group-hover:text-blue-600 dark:text-white">{item.label}</h3><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{item.description}</p><div className="mt-4 text-[10px] font-black uppercase tracking-wider text-slate-300 group-hover:text-blue-500">Open workspace →</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
