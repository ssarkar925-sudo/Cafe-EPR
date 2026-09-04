"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function AIAgentLauncher({ role }: { role: string }) {
  const [critical, setCritical] = useState(0);

  useEffect(() => {
    if (role !== "admin" && role !== "staff") return;
    let active = true;
    let firstTimer: number | null = null;

    async function load() {
      try {
        const response = await fetch("/api/ai/monitor", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        const count = Array.isArray(data?.events) ? data.events.filter((e: any) => e?.severity === "critical").length : 0;
        if (active) setCritical(count);
      } catch {
        // Keep the launcher usable when the monitor endpoint is temporarily unavailable.
      }
    }

    // The monitor is auxiliary UI. Let the page become interactive first,
    // then fetch the alert count in the background.
    firstTimer = window.setTimeout(() => {
      void load();
    }, 1500);

    const timer = window.setInterval(load, 5 * 60 * 1000);
    return () => {
      active = false;
      if (firstTimer !== null) window.clearTimeout(firstTimer);
      window.clearInterval(timer);
    };
  }, [role]);

  if (role !== "admin" && role !== "staff") return null;

  return (
    <Link
      href="/ai-agent"
      aria-label={critical > 0 ? `Open Cafe AI Agent — ${critical} critical alert${critical === 1 ? "" : "s"}` : "Open Cafe AI Agent"}
      title={critical > 0 ? `${critical} critical business alert${critical === 1 ? "" : "s"}` : "Open Cafe AI Agent"}
      className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-2xl border border-indigo-400/30 bg-slate-950 px-4 py-3 text-xs font-black text-white shadow-xl shadow-indigo-500/20 ring-1 ring-white/10 backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-slate-900 hover:shadow-2xl hover:shadow-indigo-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:bottom-6 sm:right-6"
    >
      <span className="relative flex h-7 w-7 items-center justify-center rounded-xl bg-indigo-500/20 text-base">
        ✦
        {critical > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white ring-2 ring-slate-950">{critical > 9 ? "9+" : critical}</span>}
      </span>
      <span className="hidden sm:inline">Cafe AI Agent</span>
      <span className="sm:hidden">AI Agent</span>
    </Link>
  );
}