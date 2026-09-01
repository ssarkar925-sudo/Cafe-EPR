"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const AppearancePanel = dynamic(() => import("@/components/settings/appearance-panel"), {
  ssr: false,
  loading: () => <SettingsPanelSkeleton />,
});

type Section = "overview" | "server" | "appearance";

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
          onClick={() => setSection("server")}
          className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold ${
            section === "server"
              ? "bg-blue-600 text-white"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          }`}
        >
          <span className="mr-2">◈</span>
          Server Control Center
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
                Security, Staff &amp; Roles, Audit, AI, WhatsApp and all other operational capabilities are accessed from their canonical Hub in the sidebar. System-level infrastructure controls are managed in the Server Control Center below.
              </p>
            </div>
            <span className="inline-flex w-fit shrink-0 items-center rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
              Single-owner navigation
            </span>
          </div>
        </section>
      )}

      {section === "server" && <ServerControlCenter />}

      {section === "appearance" && <AppearancePanel active />}
    </div>
  );
}

function ServerControlCenter() {
  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">Infrastructure Health</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900 dark:text-white">Server Control Center</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Central infrastructure health console for runtime, database connectivity, realtime transport, background processing, webhooks and integration connectivity. Business Hubs own their operational configuration; this screen does not replace those configuration pages.
            </p>
          </div>
          <span className="inline-flex w-fit shrink-0 items-center rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300">
            System-owned
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ServerStatusCard title="Application Runtime" detail="Next.js application runtime" badge="RUNTIME" />
        <ServerStatusCard title="Database Layer" detail="Supabase PostgreSQL + RLS" badge="DATABASE" />
        <ServerStatusCard title="Realtime Transport" detail="Supabase realtime channels" badge="REALTIME" />
        <ServerStatusCard title="Background Processing" detail="Queue and asynchronous jobs" badge="WORKERS" />
        <ServerStatusCard title="Webhook Gateway" detail="Central inbound integration boundary" badge="WEBHOOKS" />
        <ServerStatusCard title="External Integrations" detail="Integration connectivity status only" badge="INTEGRATIONS" />
      </div>

      <div className="rounded-3xl border border-amber-200 bg-amber-50/70 p-6 dark:border-amber-900/40 dark:bg-amber-950/20">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-lg">🔐</span>
          <div>
            <h3 className="text-sm font-black text-amber-900 dark:text-amber-200">Configuration boundary</h3>
            <p className="mt-1 text-xs leading-5 text-amber-800/90 dark:text-amber-300/90">
              API tokens, provider credentials and other secrets belong on the server side. Configure each business integration from its canonical Hub; this infrastructure console reports system health and does not expose integration secrets or replace business-specific configuration.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ServerStatusCard({ title, detail, badge }: { title: string; detail: string; badge: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-900 dark:text-white">{title}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black tracking-wider text-slate-600 dark:bg-white/10 dark:text-slate-300">
          {badge}
        </span>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">Managed by system</span>
      </div>
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
