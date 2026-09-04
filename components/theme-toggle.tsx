"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTheme, type DisplayMode, ACCENT_PALETTES } from "./theme-provider";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { displayMode, resolvedDisplayMode, setDisplayMode, accent, setAccent } = useTheme();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const modeLabel = resolvedDisplayMode === "dark" ? "Dark" : "Light";

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`Theme: ${modeLabel}`}
        aria-label="Change light or dark theme"
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
      >
        {resolvedDisplayMode === "dark" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-amber-400">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-amber-500">
            <circle cx="12" cy="12" r="5" />
            <path d="M12 1v2M12 21v2M1 12h2M21 12h2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[220px] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl ring-1 ring-black/5 dark:border-white/10 dark:bg-slate-900 dark:ring-white/10">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-white/5">
            <div>
              <span className="block text-xs font-extrabold text-slate-900 dark:text-white">Theme</span>
              <span className="text-[10px] text-slate-400">{modeLabel} mode</span>
            </div>
            <Link href="/settings?tab=other" onClick={() => setOpen(false)} className="text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400">
              Settings →
            </Link>
          </div>

          <div className="mt-3">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
              {[{ key: "light" as DisplayMode, label: "☀️ Light" }, { key: "dark" as DisplayMode, label: "🌙 Dark" }].map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => { setDisplayMode(m.key); setOpen(false); }}
                  className={`rounded-lg py-2 text-[11px] font-bold transition ${
                    displayMode === m.key
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                      : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Brand Accent Palette */}
          <div className="mt-3 border-t border-slate-100 pt-2.5 dark:border-white/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-extrabold text-slate-900 dark:text-white">Brand Accent</span>
              <span className="text-[10px] font-bold text-slate-400 capitalize">{accent}</span>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {ACCENT_PALETTES.map((p) => {
                const isCur = accent === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setAccent(p.key)}
                    title={`${p.label} (${p.colorHex})`}
                    className={`relative flex h-7 w-7 items-center justify-center rounded-xl transition-all active:scale-90 ${
                      isCur
                        ? "ring-2 ring-offset-2 ring-slate-900 dark:ring-white dark:ring-offset-slate-900 scale-105 shadow-sm"
                        : "hover:scale-105 opacity-80 hover:opacity-100"
                    }`}
                    style={{ backgroundColor: p.colorHex }}
                  >
                    {isCur && (
                      <span className="text-[11px] text-white font-black leading-none drop-shadow">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
            Instant 1-click theme &amp; accent customization.
          </p>
        </div>
      )}
    </div>
  );
}
