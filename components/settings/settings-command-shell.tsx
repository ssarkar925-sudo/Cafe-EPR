"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import SettingsClient from "@/components/settings/settings-client";
import { SETTINGS_GROUPS, tabMeta } from "@/components/settings/settings-config";
import styles from "./settings-command-shell.module.css";

type SettingsClientProps = ComponentProps<typeof SettingsClient>;

function Arrow({ left = false }: { left?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      {left ? <><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></> : <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>}
    </svg>
  );
}

export default function SettingsCommandShell(props: SettingsClientProps) {
  const tab = props.initialTab && tabMeta[props.initialTab] ? props.initialTab : "general";
  const meta = tabMeta[tab];
  const currentGroup = SETTINGS_GROUPS.find((group) => group.items.some((item) => item.key === tab));
  const activeIndex = currentGroup?.items.findIndex((item) => item.key === tab) ?? -1;
  const shopName = props.initial?.shop_name || "Sarkar Communication";

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
      <div className="relative overflow-hidden rounded-[26px] border border-slate-200 bg-slate-950 px-5 py-6 text-white shadow-xl shadow-slate-200/40 dark:border-white/10 dark:shadow-none sm:px-7 lg:px-9">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link href="/settings" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400 transition hover:text-white">
              <Arrow left /> Settings Command Center
            </Link>
            <div className="mt-4 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-sm font-black text-cyan-300 ring-1 ring-white/10">
                {String(activeIndex + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">{currentGroup?.label || "System"}</p>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Settings Command Center</h1>
              </div>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Configure <span className="text-slate-200">{meta.title}</span> for <span className="text-slate-500">{shopName}</span>. All administration controls stay in this workspace.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-bold text-emerald-300 sm:inline-flex">Admin workspace</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {SETTINGS_GROUPS.flatMap((group) => group.items).map((item) => (
          <Link
            key={item.key}
            href={`/settings?tab=${item.key}`}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${item.key === tab ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-indigo-300" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:border-white/10 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-white"}`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className={styles.legacyRoot}>
        <SettingsClient {...props} />
      </div>
    </section>
  );
}
