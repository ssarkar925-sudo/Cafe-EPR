"use client";

import type { ComponentProps } from "react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import SettingsClient from "@/components/settings/settings-client";
import { SETTINGS_GROUPS, tabMeta } from "@/components/settings/settings-config";

type SettingsClientProps = ComponentProps<typeof SettingsClient>;
type Props = SettingsClientProps;

function Icon({ path, className = "h-5 w-5" }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function TrafficLights() {
  return (
    <div className="flex items-center gap-2" aria-hidden="true">
      <span className="h-3 w-3 rounded-full bg-[#ff5f57] shadow-[inset_0_0_0_1px_rgba(0,0,0,.12)]" />
      <span className="h-3 w-3 rounded-full bg-[#febc2e] shadow-[inset_0_0_0_1px_rgba(0,0,0,.12)]" />
      <span className="h-3 w-3 rounded-full bg-[#28c840] shadow-[inset_0_0_0_1px_rgba(0,0,0,.12)]" />
    </div>
  );
}

function CloseIcon() {
  return <Icon path="M6 6l12 12M18 6L6 18" className="h-5 w-5" />;
}

function SettingsHub({ onOpen }: { onOpen: (key: string) => void }) {
  const [query, setQuery] = useState("");
  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SETTINGS_GROUPS;
    return SETTINGS_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => `${group.label} ${item.label} ${item.desc}`.toLowerCase().includes(q)),
    })).filter((group) => group.items.length);
  }, [query]);

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,.10),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(99,102,241,.07),transparent_30%)] bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/80 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.14em] text-blue-600 shadow-sm dark:border-blue-900/40 dark:bg-slate-900/70 dark:text-blue-300">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> Control Center
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">System Administration</h1>
            <p className="mt-1.5 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Manage your Cafe ERP from one clean workspace. Choose a module to open it in a dedicated window.</p>
          </div>
          <div className="relative w-full lg:w-[360px]">
            <Icon path="m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search settings modules…" className="h-11 w-full rounded-2xl border border-slate-200 bg-white/90 pl-11 pr-4 text-sm font-medium text-slate-800 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-slate-900/80 dark:text-white" />
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          {filteredGroups.map((group) => (
            <section key={group.id} className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/85 shadow-[0_10px_35px_rgba(15,23,42,.06)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/75">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-white/10">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">Settings Group</p>
                  <h2 className="mt-0.5 text-sm font-extrabold text-slate-900 dark:text-white">{group.label}</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500 dark:bg-white/5 dark:text-slate-400">{group.items.length} modules</span>
              </div>
              <div className="grid gap-2 p-3 sm:grid-cols-2">
                {group.items.map((item) => (
                  <button key={item.key} type="button" onClick={() => onOpen(item.key)} className="group flex min-h-[102px] items-start gap-3 rounded-[18px] border border-transparent p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-100 hover:bg-blue-50/70 hover:shadow-md dark:hover:border-blue-900/40 dark:hover:bg-blue-950/20">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-slate-100 text-slate-500 transition group-hover:bg-blue-600 group-hover:text-white group-hover:shadow-lg group-hover:shadow-blue-600/20 dark:bg-white/5 dark:text-slate-400">
                      <Icon path={item.icon} className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-extrabold text-slate-800 dark:text-slate-100">{item.label}</span>
                        {item.badge && <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-black text-blue-700 dark:bg-blue-950 dark:text-blue-300">{item.badge}</span>}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-slate-400 dark:text-slate-500">{item.desc}</span>
                      <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 opacity-0 transition group-hover:opacity-100 dark:text-blue-400">Open module <span aria-hidden="true">→</span></span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        {!filteredGroups.length && <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-12 text-center dark:border-white/10 dark:bg-slate-900/50"><p className="font-bold text-slate-700 dark:text-slate-200">No settings modules found</p><p className="mt-1 text-sm text-slate-400">Try another search term.</p></div>}
      </div>
    </div>
  );
}

function ModuleWindow({ props, tab, onClose }: { props: Props; tab: string; onClose: () => void }) {
  const meta = tabMeta[tab] ?? { title: "Settings", desc: "", group: "System Administration" };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previous; };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/55 p-2 backdrop-blur-md sm:p-4 lg:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex h-[calc(100vh-16px)] w-full max-w-[1500px] flex-col overflow-hidden rounded-[24px] border border-white/70 bg-white shadow-[0_40px_120px_rgba(15,23,42,.42)] ring-1 ring-slate-950/5 dark:border-white/10 dark:bg-slate-950 sm:h-[calc(100vh-32px)] sm:rounded-[28px] lg:h-[min(930px,calc(100vh-48px))]">
        <div className="flex h-16 shrink-0 items-center border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/90 sm:px-6">
          <div className="flex w-1/3 min-w-0 items-center gap-3"><TrafficLights /><span className="hidden truncate text-xs font-bold text-slate-400 sm:block">Cafe ERP</span></div>
          <div className="min-w-0 flex-1 text-center"><p className="truncate text-[10px] font-black uppercase tracking-[.16em] text-blue-500">{meta.group}</p><h2 className="truncate text-sm font-black text-slate-900 dark:text-white sm:text-base">{meta.title}</h2></div>
          <div className="flex w-1/3 justify-end"><button type="button" onClick={onClose} aria-label="Close module" title="Close module" className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"><CloseIcon /></button></div>
        </div>
        <div className="settings-module-content min-h-0 flex-1 overflow-y-auto bg-slate-50/80 dark:bg-slate-950">
          <SettingsClient {...props} initialTab={tab} key={tab} />
        </div>
        <style jsx>{`
          .settings-module-content > div > div:first-child { display: none !important; }
          .settings-module-content > div > div:nth-child(2) > div:first-child { display: none !important; }
          .settings-module-content > div > div:nth-child(2) > div:last-child { grid-column: 1 / -1 !important; }
          .settings-module-content > div > div:nth-child(2) > div:last-child > div:first-child { display: none !important; }
          .settings-module-content > div { max-width: none !important; padding: 2rem 2.5rem !important; }
          @media (max-width: 640px) {
            .settings-module-content > div { padding: 1rem !important; }
          }
        `}</style>
      </div>
    </div>,
    document.body,
  );
}

export default function SettingsCommandShell(props: Props) {
  const [openTab, setOpenTab] = useState<string | null>(null);

  return (
    <>
      <SettingsHub onOpen={setOpenTab} />
      {openTab && <ModuleWindow props={props} tab={openTab} onClose={() => setOpenTab(null)} />}
    </>
  );
}
