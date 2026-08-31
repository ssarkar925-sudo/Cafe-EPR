"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const AppearancePanel = dynamic(() => import("@/components/settings/appearance-panel"), {
  ssr: false,
  loading: () => <SettingsPanelSkeleton />,
});

type Section = "overview" | "appearance";

export default function SystemSettingsClient() {
  const [section, setSection] = useState<Section>("overview");

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-8">
      <header className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">System Control Center</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900 dark:text-white">System Settings</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
          Global application controls live here. Operational modules stay in their owning Hub and are not duplicated here.
        </p>
      </header>

      <nav
        aria-label="System settings sections"
        className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-slate-900"
      >
        <button
          type="button"
          onClick={() => setSection("overview")}
          className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold ${
            section === "overview"
              ? "bg-blue-600 text-white"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          }`}
        >
          <span className="mr-2">⚙</span>
          System Overview
        </button>
        <button
          type="button"
          onClick={() => setSection("appearance")}
          className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold ${
            section === "appearance"
              ? "bg-blue-600 text-white"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          }`}
        >
          <span className="mr-2">◐</span>
          Appearance
        </button>
      </nav>

      {section === "overview" && (
        <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Global controls only</p>
              <h2 className="mt-1 text-xl font-black text-slate-900 dark:text-white">Clean System Boundary</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                Security, Staff &amp; Roles, Audit, AI, WhatsApp and all other operational capabilities are accessed from their canonical Hub in the sidebar. This page no longer creates duplicate entry points for them.
              </p>
            </div>
            <span className="inline-flex w-fit shrink-0 items-center rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
              Single-owner navigation
            </span>
          </div>
        </section>
      )}

      {section === "appearance" && <AppearancePanel active />}
    </div>
  );
}

function SettingsPanelSkeleton() {
  return (
    <section className="mt-6 space-y-4" aria-busy="true" aria-label="Loading settings panel">
      <div className="h-32 animate-pulse rounded-3xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900" />
        ))}
      </div>
    </section>
  );
}
