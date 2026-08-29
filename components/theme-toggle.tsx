"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTheme, ACCENT_PALETTES, type Theme, type AccentColor } from "./theme-provider";

export default function ThemeToggle({
  className = "",
}: {
  className?: string;
}) {
  const { theme, resolvedTheme, accent, setTheme, setAccent } = useTheme();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const activePalette = ACCENT_PALETTES.find((p) => p.key === accent) || ACCENT_PALETTES[0];

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title={`Theme: ${theme} (Click to customize)`}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/5"
        aria-label="Toggle theme and appearance"
      >
        {resolvedTheme === "dark" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-amber-400">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-amber-500">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        )}
      </button>

      {/* Theme & Palette Dropdown Menu */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl ring-1 ring-black/5 dark:border-white/10 dark:bg-slate-900 dark:ring-white/10 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/5">
            <span className="text-xs font-bold text-slate-900 dark:text-white">Appearance &amp; Theme</span>
            <Link
              href="/settings?tab=other"
              onClick={() => setOpen(false)}
              className="text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Full Settings →
            </Link>
          </div>

          {/* Theme Modes */}
          <div className="mt-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 pb-1.5">
              Display Mode
            </div>
            <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
              {(
                [
                  { key: "light", label: "Light", icon: "M12 3v2m0 14v2M5.6 5.6l1.4 1.4m9.9 9.9 1.4 1.4M3 12h2m14 0h2M5.6 18.4l1.4-1.4m9.9-9.9 1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" },
                  { key: "dark", label: "Dark", icon: "M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" },
                  { key: "system", label: "Auto", icon: "M12 3a9 9 0 0 0 0 18c.5-2 .5-3.5 0-5a4.5 4.5 0 0 1 0-8c.5-1.5.5-3 0-5ZM3.5 12h17" },
                  { key: "gradient", label: "Gradient", icon: "M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2l-6.1 3.4 1.4-6.8L2.2 9.1l6.9-.8L12 2z" },
                ] as const
              ).map((m) => {
                const active = theme === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setTheme(m.key)}
                    className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-bold transition ${
                      active
                        ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                        : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    }`}
                  >
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Accent Color Palette Dots */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 pb-1.5">
              <span>Brand Accent</span>
              <span className="text-[10px] font-normal text-slate-500">{activePalette.label.split(" ")[0]}</span>
            </div>
            <div className="flex items-center justify-between gap-1">
              {ACCENT_PALETTES.map((p) => {
                const isSelected = accent === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setAccent(p.key)}
                    title={p.label}
                    className={`relative flex h-7 w-7 items-center justify-center rounded-full transition hover:scale-110 ${
                      isSelected ? "ring-2 ring-offset-2 ring-slate-900 dark:ring-white dark:ring-offset-slate-900" : ""
                    }`}
                    style={{ backgroundColor: p.colorHex }}
                  >
                    {isSelected && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 drop-shadow">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

