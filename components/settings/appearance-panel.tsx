"use client";

import { useState } from "react";
import { useTheme, ACCENT_PALETTES, DESIGN_STYLES, type Theme, type AccentColor, type DensityMode, type FontScale, type DesignStyle } from "@/components/theme-provider";
import SettingsSection from "@/components/settings/settings-section";

const icon = (d: string) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d={d} /></svg>;

const previews: Record<DesignStyle, string> = {
  cafe: "bg-[#f7f5ef] border-[#e5d8c5] text-[#2b2118]",
  glass: "bg-gradient-to-br from-violet-50 to-slate-100 border-violet-200 text-slate-800",
  clean: "bg-slate-50 border-slate-200 text-slate-800",
  midnight: "bg-[#080d18] border-slate-700 text-white",
  organic: "bg-[#f5f2e9] border-[#d7ddcf] text-[#35443a]",
  neon: "bg-[#070b12] border-cyan-700/60 text-cyan-50",
  corporate: "bg-slate-100 border-slate-300 text-slate-800",
};

export default function AppearancePanel({ active }: { active: boolean }) {
  const { theme, accent, density, fontScale, design, setTheme, setAccent, setDensity, setFontScale, setDesign, resetToDefaults } = useTheme();
  const [showDesignChanges, setShowDesignChanges] = useState(false);
  const activeDesign = DESIGN_STYLES.find((d) => d.key === design) || DESIGN_STYLES[0];

  return (
    <div className={active ? "mt-6 space-y-6" : "hidden"}>
      <SettingsSection icon="M12 3v18M3 12h18" tone="blue" title="Theme" desc="Control the overall display mode and primary interface color. Changes apply immediately on this device.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(["light", "dark", "system"] as Theme[]).map((t) => (
            <button key={t} type="button" onClick={() => setTheme(t)} className={`group rounded-2xl border p-4 text-left transition duration-200 ${theme === t ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/15 shadow-sm dark:bg-blue-950/30" : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm dark:border-white/10 dark:bg-slate-900 dark:hover:bg-white/5"}`}>
              <div className="flex items-center justify-between"><span className="font-bold capitalize text-slate-900 dark:text-white">{t}</span>{theme === t && <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">✓</span>}</div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t === "system" ? "Follow device settings" : `Use ${t} mode`}</p>
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">{icon("M12 3v18M3 12h18")}</span>
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">Accent Color</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Change the primary action color without changing your layout.</p>
              </div>
            </div>
            <div className="grid grid-cols-6 gap-2 sm:w-auto">
              {ACCENT_PALETTES.map((p) => (
                <button key={p.key} type="button" aria-label={`Use ${p.label}`} title={p.label} onClick={() => setAccent(p.key as AccentColor)} className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition hover:scale-105 ${accent === p.key ? "border-slate-900 ring-2 ring-slate-900/10 dark:border-white" : "border-transparent"}`}>
                  <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ backgroundColor: p.colorHex }}>{accent === p.key && <span className="text-xs font-bold text-white">✓</span>}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div><p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Density</p><div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-white/5">{(["comfortable", "compact"] as DensityMode[]).map((d) => <button key={d} type="button" onClick={() => setDensity(d)} className={`rounded-lg py-2 text-xs font-semibold capitalize transition ${density === d ? "bg-white shadow-sm dark:bg-slate-800 dark:text-white" : "text-slate-500 hover:text-slate-700 dark:text-slate-400"}`}>{d}</button>)}</div></div>
          <div><p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Font scale</p><div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-white/5">{(["standard", "large"] as FontScale[]).map((f) => <button key={f} type="button" onClick={() => setFontScale(f)} className={`rounded-lg py-2 text-xs font-semibold capitalize transition ${fontScale === f ? "bg-white shadow-sm dark:bg-slate-800 dark:text-white" : "text-slate-500 hover:text-slate-700 dark:text-slate-400"}`}>{f}</button>)}</div></div>
        </div>
      </SettingsSection>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <button type="button" onClick={() => setShowDesignChanges((v) => !v)} aria-expanded={showDesignChanges} className="flex w-full items-center justify-between gap-4 p-5 text-left transition hover:bg-slate-50 dark:hover:bg-white/[0.03]">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">{icon("M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2l-6.1 3.4 1.4-6.8L2.2 9.1l6.9-.8L12 2z")}</span>
            <div className="min-w-0"><p className="text-sm font-bold text-slate-900 dark:text-white">Design Changes</p><p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">Choose a complete visual preset · Currently {activeDesign.label}</p></div>
          </div>
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-transform dark:bg-white/5 dark:text-slate-300 ${showDesignChanges ? "rotate-180" : ""}`}>⌄</span>
        </button>

        {showDesignChanges && (
          <div className="border-t border-slate-200 p-5 dark:border-white/10">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div><h3 className="text-sm font-bold text-slate-900 dark:text-white">Visual presets</h3><p className="text-xs text-slate-500 dark:text-slate-400">This changes the visual language across the ERP. Your data and business logic remain unchanged.</p></div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{DESIGN_STYLES.length} presets</span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {DESIGN_STYLES.map((d) => {
                const selected = d.key === design;
                return (
                  <button key={d.key} type="button" onClick={() => setDesign(d.key)} aria-pressed={selected} className={`group overflow-hidden rounded-2xl border text-left transition duration-200 ${selected ? "border-amber-500 ring-2 ring-amber-500/20 shadow-lg" : "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md dark:border-white/10"}`}>
                    <div className={`h-28 p-3 ${previews[d.key]}`}>
                      <div className="flex h-full gap-2">
                        <div className="w-1/4 rounded-lg border border-black/10 bg-black/10 p-2"><div className="mb-2 h-2 w-3/4 rounded bg-current/40" /><div className="space-y-1.5"><div className="h-1.5 rounded bg-current/20" /><div className="h-1.5 rounded bg-current/20" /><div className="h-1.5 w-2/3 rounded bg-current/20" /></div></div>
                        <div className="flex-1 space-y-2"><div className="flex gap-2"><div className="h-7 flex-1 rounded-md border border-black/10 bg-white/50" /><div className="h-7 flex-1 rounded-md border border-black/10 bg-white/40" /></div><div className="h-12 rounded-md border border-black/10 bg-white/50" /></div>
                      </div>
                    </div>
                    <div className="bg-white p-4 dark:bg-slate-900">
                      <div className="flex items-center justify-between gap-2"><span className="truncate font-bold text-slate-900 dark:text-white">{d.label}</span>{selected && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">ACTIVE</span>}</div>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{d.description}</p>
                      <div className="mt-3 flex items-center justify-between gap-2"><span className="text-[11px] text-slate-400">Best for: {d.bestFor}</span><span className="h-3 w-3 shrink-0 rounded-full" style={{ background: d.accent }} /></div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-sm font-bold text-slate-900 dark:text-white">Currently using {activeDesign.label}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{activeDesign.description}. Changes are applied immediately.</p></div>
        <button type="button" onClick={resetToDefaults} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Reset appearance</button>
      </div>
    </div>
  );
}
