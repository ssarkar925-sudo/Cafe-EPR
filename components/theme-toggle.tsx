"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Sun,
  Moon,
  Laptop,
  Check,
  X,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import {
  useTheme,
  ACCENT_PALETTES,
  GRADIENT_PRESETS,
  type AccentColor,
  type DisplayMode,
  type GradientPreset,
  type DensityMode,
  type FontScale,
} from "./theme-provider";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const {
    displayMode,
    resolvedDisplayMode,
    setDisplayMode,
    accent,
    setAccent,
    gradientEnabled,
    setGradientEnabled,
    gradientPreset,
    setGradientPreset,
    density,
    setDensity,
    fontScale,
    setFontScale,
  } = useTheme();

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  const activePresetObj =
    GRADIENT_PRESETS.find((p) => p.id === gradientPreset) || GRADIENT_PRESETS[0];

  const modeLabel = resolvedDisplayMode === "dark" ? "Dark" : "Light";

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Unified Trigger Button: Sun/Moon with live atmosphere status dot */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title={`Theme & Atmosphere: ${modeLabel} mode (${activePresetObj.name})`}
        aria-label="Toggle Theme & Atmosphere Control Center"
        className="group relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:scale-105 active:scale-95 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
      >
        {resolvedDisplayMode === "dark" ? (
          <Moon className="h-4 w-4 text-amber-400 group-hover:rotate-12 transition-transform duration-300" />
        ) : (
          <Sun className="h-4 w-4 text-amber-500 group-hover:rotate-45 transition-transform duration-300" />
        )}

        {/* Atmosphere glow indicator dot */}
        <span
          className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-900 ${
            gradientEnabled
              ? "bg-gradient-to-r from-violet-500 to-cyan-400 animate-pulse"
              : "bg-slate-300 dark:bg-slate-600"
          }`}
          title={gradientEnabled ? "Atmosphere Glow: ON" : "Atmosphere Glow: OFF"}
        />
      </button>

      {/* Unified Control Center Popover */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2.5 w-[340px] sm:w-[380px] rounded-3xl border border-slate-200/90 bg-white/95 p-4 shadow-2xl backdrop-blur-2xl ring-1 ring-black/5 dark:border-white/10 dark:bg-slate-900/95 dark:ring-white/10 animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-xs">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  Theme &amp; Atmosphere
                </h3>
                <p className="text-[10px] text-slate-400">
                  Instant visual systems &amp; radiant atmosphere controls
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white transition"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-3.5 space-y-4 max-h-[75vh] overflow-y-auto pr-1">
            {/* 1. LIGHTING THEME (LIGHT / DARK / AUTO) */}
            <div>
              <span className="block text-[11px] font-black uppercase tracking-wider text-slate-900 dark:text-white mb-2">
                Lighting Theme
              </span>
              <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-slate-100/80 p-1 dark:bg-white/5">
                {[
                  { key: "light" as DisplayMode, label: "Light", icon: Sun },
                  { key: "dark" as DisplayMode, label: "Dark", icon: Moon },
                  { key: "system" as DisplayMode, label: "Auto", icon: Laptop },
                ].map((m) => {
                  const Icon = m.icon;
                  const isCurrent = displayMode === m.key;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setDisplayMode(m.key)}
                      className={`flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs font-bold transition-all ${
                        isCurrent
                          ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                          : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. ATMOSPHERE & AMBIENT BACKDROP (ON / OFF + 6 PRESETS) */}
            <div className="border-t border-slate-100 pt-3 dark:border-white/5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="block text-[11px] font-black uppercase tracking-wider text-slate-900 dark:text-white">
                    Atmosphere &amp; Backdrop
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Luminescent radial ambient aura behind cards
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setGradientEnabled(!gradientEnabled)}
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
                    gradientEnabled ? "bg-violet-600" : "bg-slate-300 dark:bg-slate-700"
                  }`}
                  aria-pressed={gradientEnabled}
                  title="Toggle atmosphere glow"
                >
                  <span
                    className={`h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform ${
                      gradientEnabled ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>

              {/* 6 Presets */}
              <div className={`mt-2.5 grid grid-cols-2 gap-2 transition-opacity ${gradientEnabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
                {GRADIENT_PRESETS.map((p) => {
                  const isCurrent = gradientPreset === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setGradientPreset(p.id as GradientPreset)}
                      className={`relative flex flex-col rounded-2xl border p-2.5 text-left transition-all ${
                        isCurrent
                          ? "border-violet-500 bg-violet-50/80 shadow-xs ring-2 ring-violet-500/20 dark:bg-violet-950/40 dark:border-violet-400"
                          : "border-slate-200/90 bg-white/60 hover:border-slate-300 dark:border-white/10 dark:bg-slate-800/40 dark:hover:border-white/20"
                      }`}
                    >
                      {/* Mini color swatch preview bar */}
                      <div className="flex h-2.5 w-full overflow-hidden rounded-md shadow-2xs mb-2">
                        <span className="h-full flex-1" style={{ backgroundColor: p.primary }} />
                        <span className="h-full flex-1" style={{ backgroundColor: p.secondary }} />
                        <span className="h-full flex-1" style={{ backgroundColor: p.highlight }} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                          {p.name}
                        </span>
                        {isCurrent && (
                          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-violet-600 text-[9px] font-black text-white">
                            ✓
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] text-slate-400 mt-0.5 truncate leading-tight">
                        {p.mood}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. BRAND ACCENT PALETTES */}
            <div className="border-t border-slate-100 pt-3 dark:border-white/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  Brand Accent Colour
                </span>
                <span className="text-[10px] font-bold text-slate-400 capitalize">
                  {accent}
                </span>
              </div>
              <div className="grid grid-cols-6 gap-2">
                {ACCENT_PALETTES.map((p) => {
                  const isCurrent = accent === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setAccent(p.key as AccentColor)}
                      title={`${p.label} (${p.colorHex})`}
                      className={`relative flex h-8 w-full items-center justify-center rounded-xl shadow-xs transition-all active:scale-90 ${
                        isCurrent
                          ? "ring-2 ring-offset-2 ring-slate-900 dark:ring-white dark:ring-offset-slate-900 scale-105"
                          : "hover:scale-105 opacity-80 hover:opacity-100"
                      }`}
                      style={{ backgroundColor: p.colorHex }}
                    >
                      {isCurrent && <Check className="h-3.5 w-3.5 text-white stroke-[3]" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. UI DENSITY & TYPOGRAPHY SCALE */}
            <div className="border-t border-slate-100 pt-3 dark:border-white/5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                    UI Density
                  </span>
                  <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100/80 p-1 dark:bg-white/5">
                    {(["comfortable", "compact"] as DensityMode[]).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDensity(d)}
                        className={`rounded-lg py-1 text-[10px] font-bold capitalize transition ${
                          density === d
                            ? "bg-white text-slate-900 shadow-2xs dark:bg-slate-800 dark:text-white"
                            : "text-slate-500 dark:text-slate-400 hover:text-slate-900"
                        }`}
                      >
                        {d === "compact" ? "⚡ Compact" : "🛋️ Spaced"}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                    Font Scale
                  </span>
                  <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100/80 p-1 dark:bg-white/5">
                    {(["standard", "large"] as FontScale[]).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFontScale(f)}
                        className={`rounded-lg py-1 text-[10px] font-bold capitalize transition ${
                          fontScale === f
                            ? "bg-white text-slate-900 shadow-2xs dark:bg-slate-800 dark:text-white"
                            : "text-slate-500 dark:text-slate-400 hover:text-slate-900"
                        }`}
                      >
                        {f === "large" ? "A+ Large" : "A Standard"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Link to Settings */}
          <div className="mt-4 border-t border-slate-100 pt-3 flex items-center justify-between dark:border-white/5">
            <span className="text-[10px] text-slate-400">
              Active: <strong className="text-slate-700 dark:text-slate-200">{activePresetObj.name}</strong>
            </span>
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 transition"
            >
              <span>Full Settings</span>
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
