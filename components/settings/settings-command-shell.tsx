"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import SettingsClient from "@/components/settings/settings-client";
import { SETTINGS_GROUPS, tabMeta } from "@/components/settings/settings-config";
import styles from "./settings-command-shell.module.css";

type SettingsClientProps = ComponentProps<typeof SettingsClient>;

const GROUP_STYLES = ["from-violet-600 to-indigo-600", "from-sky-600 to-cyan-600", "from-emerald-600 to-teal-600", "from-slate-800 to-slate-950"];

function Gear() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 4.3l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.2.6.77 1 1.51 1H21a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15Z"/></svg>; }
function Arrow() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>; }

export default function SettingsCommandShell(props: SettingsClientProps) {
  const tab = props.initialTab && tabMeta[props.initialTab] ? props.initialTab : "general";
  const meta = tabMeta[tab];
  const activeGroupIndex = Math.max(0, SETTINGS_GROUPS.findIndex((group) => group.items.some((item) => item.key === tab)));
  const activeGroup = SETTINGS_GROUPS[activeGroupIndex] ?? SETTINGS_GROUPS[0];
  const shopName = props.initial?.shop_name || "Sarkar Communication";
  const totalModules = SETTINGS_GROUPS.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <section className="mx-auto max-w-[1500px] px-3 py-4 sm:px-5 lg:px-7 lg:py-6">
      <div className="relative overflow-hidden rounded-[30px] border border-slate-800 bg-[#07111f] text-white shadow-2xl shadow-slate-900/15">
        <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 left-1/3 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative p-5 sm:p-7 lg:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400"><span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5"><Gear /> Administration</span><span className="text-slate-600">/</span><span>Settings Command Center</span></div>
              <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">Everything configured in one place.</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">Manage <span className="font-semibold text-slate-200">{shopName}</span> without leaving the workspace. Choose a module below; its live controls open directly underneath.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex"><div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Modules</div><div className="mt-1 text-xl font-black">{totalModules}</div></div><div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.07] px-4 py-3"><div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300/70">Access</div><div className="mt-1 text-sm font-bold text-emerald-300">Admin</div></div></div>
          </div>
        </div>
        <div className="relative border-t border-white/10 bg-white/[0.025] px-5 py-4 sm:px-7"><div className="flex items-center justify-between gap-4"><div><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">Active module</div><div className="mt-1 text-sm font-bold text-white">{meta.title}</div></div><span className="hidden rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-400 sm:inline-flex">{activeGroup.label}</span></div></div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {SETTINGS_GROUPS.map((group, groupIndex) => (
          <div key={group.label} className={`rounded-2xl border bg-white shadow-sm transition dark:bg-slate-900 ${groupIndex === activeGroupIndex ? "border-slate-300 ring-2 ring-indigo-500/15 dark:border-indigo-400/30" : "border-slate-200 dark:border-white/10"}`}>
            <div className="flex items-center gap-3 border-b border-slate-100 p-4 dark:border-white/10"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${GROUP_STYLES[groupIndex % GROUP_STYLES.length]} text-xs font-black text-white shadow-sm`}>{String(groupIndex + 1).padStart(2, "0")}</span><div className="min-w-0"><div className="truncate text-sm font-bold text-slate-900 dark:text-white">{group.label}</div><div className="text-[11px] text-slate-400">{group.items.length} controls</div></div></div>
            <div className="p-2">{group.items.map((item) => <Link key={item.key} href={`/settings?tab=${item.key}`} className={`group flex items-center justify-between rounded-xl px-3 py-2.5 transition ${item.key === tab ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/[0.04]"}`}><span className="min-w-0"><span className="block truncate text-xs font-semibold">{item.label}</span><span className="block truncate text-[10px] text-slate-400">{item.desc}</span></span><Arrow /></Link>)}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-slate-950/40"><div className="rounded-[22px] bg-slate-50/70 p-2 dark:bg-white/[0.02]"><div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4"><div><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-500">Live settings workspace</div><div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{meta.title}</div><div className="text-xs text-slate-500 dark:text-slate-400">{meta.desc}</div></div><span className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-600"><span className="h-2 w-2 rounded-full bg-emerald-500"/>Connected</span></div><div className={styles.legacyRoot}><SettingsClient key={tab} {...props} /></div></div></div>
    </section>
  );
}
