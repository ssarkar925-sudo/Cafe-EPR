"use client";

import Link from "next/link";

export default function AIAgentLauncher({ role }: { role: string }) {
  if (role !== "admin" && role !== "staff") return null;

  return (
    <Link
      href="/ai-agent"
      aria-label="Open Cafe AI Agent"
      title="Open Cafe AI Agent"
      className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-2xl border border-indigo-400/30 bg-slate-950 px-4 py-3 text-xs font-black text-white shadow-xl shadow-indigo-500/20 ring-1 ring-white/10 backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-slate-900 hover:shadow-2xl hover:shadow-indigo-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:bottom-6 sm:right-6"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-indigo-500/20 text-base">✦</span>
      <span className="hidden sm:inline">Cafe AI Agent</span>
      <span className="sm:hidden">AI Agent</span>
    </Link>
  );
}
