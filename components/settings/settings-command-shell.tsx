"use client";

import type { ComponentProps } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import SettingsClient from "@/components/settings/settings-client";
import { tabMeta } from "@/components/settings/settings-config";

type SettingsClientProps = ComponentProps<typeof SettingsClient>;

function TrafficLights() {
  return (
    <div className="flex items-center gap-2" aria-hidden="true">
      <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
      <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
      <span className="h-3 w-3 rounded-full bg-[#28c840]" />
    </div>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export default function SettingsCommandShell(props: SettingsClientProps) {
  const [mounted, setMounted] = useState(false);
  const tab = props.initialTab && tabMeta[props.initialTab] ? props.initialTab : "general";
  const meta = tabMeta[tab] ?? { title: "Settings", desc: "", group: "" };

  useEffect(() => {
    setMounted(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") window.location.href = "/dashboard";
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 p-2 backdrop-blur-[7px] sm:p-4 lg:p-6">
      <div role="dialog" aria-modal="true" aria-label={`${meta.title} settings`} className="relative flex h-[calc(100vh-16px)] w-full max-w-[1460px] flex-col overflow-hidden rounded-[24px] border border-white/70 bg-white shadow-[0_40px_120px_rgba(15,23,42,.42)] ring-1 ring-black/10 dark:border-white/10 dark:bg-slate-950 dark:ring-white/10 sm:h-[calc(100vh-32px)] sm:rounded-[28px] lg:h-[min(920px,calc(100vh-48px))]">
        <div className="flex h-14 shrink-0 items-center border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/95 sm:h-16 sm:px-5">
          <div className="flex w-1/3 min-w-0 items-center gap-3">
            <TrafficLights />
            <span className="hidden truncate text-xs font-semibold text-slate-400 sm:block">Cafe ERP</span>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-center">
            <div className="min-w-0 text-center">
              <div className="truncate text-sm font-bold text-slate-900 dark:text-white">{meta.title}</div>
              <div className="hidden truncate text-[10px] text-slate-400 sm:block">{meta.group || "System Administration"}</div>
            </div>
          </div>
          <div className="flex w-1/3 justify-end">
            <Link href="/dashboard" aria-label="Close settings" title="Close settings" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white">
              <CloseIcon />
            </Link>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/90 dark:bg-slate-950">
          <div className="mx-auto max-w-[1400px] p-2 sm:p-4 lg:p-5">
            <div className="overflow-hidden rounded-[20px] border border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/70">
              <SettingsClient key={tab} {...props} />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
