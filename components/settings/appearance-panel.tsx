"use client";

import { useEffect, useState } from "react";
import SettingsSection from "@/components/settings/settings-section";
import { useToast } from "@/components/ui/use-toast";
import {
  ACCENT_PALETTES,
  DESIGN_STYLES,
  GRADIENT_PRESETS,
  type AccentColor,
  type DesignStyle,
  type DisplayMode,
  type DensityMode,
  type FontScale,
  type GradientPreset,
  type MotionMode,
  useTheme,
} from "@/components/theme-provider";

const QUICK_ACCESS_STORAGE_KEY = "cafe_erp_custom_quick_access";

function Swatch({ style }: { style: (typeof DESIGN_STYLES)[number] }) {
  return <div className="flex h-14 items-end gap-1.5 rounded-xl border border-slate-200/80 bg-slate-100/80 p-2 dark:border-white/10 dark:bg-white/5"><span className="h-7 flex-1 rounded-md" style={{ background: style.primary }} /><span className="h-10 flex-1 rounded-md" style={{ background: style.secondary }} /><span className="h-8 flex-1 rounded-md" style={{ background: style.accent }} /></div>;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return <button type="button" aria-label={label} aria-pressed={checked} onClick={onChange} className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-violet-600" : "bg-slate-300 dark:bg-slate-700"}`}><span className={`h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition ${checked ? "translate-x-5" : "translate-x-0.5"}`} /></button>;
}

export default function AppearancePanel({ active }: { active: boolean }) {
  const { displayMode, gradientEnabled, gradientPreset, motion, accent, density, fontScale, designStyle, setDisplayMode, setGradientEnabled, setGradientPreset, setMotion, setAccent, setDensity, setFontScale, setDesignStyle, resetToDefaults } = useTheme();
  const { showToast, toastView } = useToast();
  const [soundFeedback, setSoundFeedback] = useState(true);
  const [autoPrintThermal, setAutoPrintThermal] = useState(false);
  const [highContrast, setHighContrast] = useState(false);

  useEffect(() => {
    try {
      setSoundFeedback(localStorage.getItem("sccomm-sound-feedback") !== "false");
      setAutoPrintThermal(localStorage.getItem("sccomm-autoprint-thermal") === "true");
      const enabled = localStorage.getItem("sccomm-high-contrast") === "true";
      setHighContrast(enabled);
      document.documentElement.classList.toggle("contrast-more", enabled);
    } catch {}
  }, []);

  function persist(key: string, value: boolean, message: string) {
    try { localStorage.setItem(key, String(value)); } catch {}
    showToast("success", message);
  }

  function clearLegacyQuickAccess() {
    try { localStorage.removeItem(QUICK_ACCESS_STORAGE_KEY); } catch {}
    showToast("success", "Legacy Settings Quick Access state cleared. Dashboard Quick Access remains managed by the dashboard module.");
  }

  const activeStyle = DESIGN_STYLES.find((style) => style.id === designStyle) ?? DESIGN_STYLES[9];

  return (
    <div className={active ? "mt-6 space-y-6" : "hidden"}>
      <SettingsSection icon="M12 3v18M3 12h18" tone="violet" title="Visual Style" desc="Choose one of the ten canonical Cafe ERP visual systems. Presentation changes only; business logic and data remain untouched.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {DESIGN_STYLES.map((style) => {
            const selected = designStyle === style.id;
            return <button key={style.id} type="button" onClick={() => setDesignStyle(style.id as DesignStyle)} aria-pressed={selected} className={`group rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md ${selected ? "border-violet-500 bg-violet-50/70 ring-2 ring-violet-500/20 dark:border-violet-400 dark:bg-violet-950/20" : "border-slate-200/80 bg-white/70 dark:border-white/10 dark:bg-white/[0.03]"}`}><Swatch style={style} /><div className="mt-3 flex items-start justify-between gap-2"><div><div className="text-xs font-extrabold text-slate-900 dark:text-white">{style.name}</div><p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{style.description}</p></div>{selected && <span className="shrink-0 rounded-full bg-violet-600 px-2 py-0.5 text-[9px] font-black text-white">ACTIVE</span>}</div></button>;
          })}
        </div>
        <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-500/20 dark:bg-violet-950/20"><div className="text-xs font-extrabold text-slate-900 dark:text-white">Current visual system: {activeStyle.name}</div><p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">The same canonical style is applied across desktop and mobile workspace surfaces.</p></div>
      </SettingsSection>

      <SettingsSection icon="M12 3v2m0 14v2M5.6 5.6l1.4 1.4m9.9 9.9 1.4 1.4M3 12h2m14 0h2M5.6 18.4l-1.4-1.4m11.3-9.9 1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" tone="blue" title="Theme & Display" desc="Set the base lighting mode, accent and workspace density. Visual style is configured above.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{([ ["light", "☀️", "Light", "Bright, high-clarity workspace"], ["dark", "🌙", "Dark", "Deep tinted workspace for low-glare focus"] ] as const).map(([id, icon, title, desc]) => <button key={id} type="button" onClick={() => setDisplayMode(id as DisplayMode)} className={`rounded-2xl border p-4 text-left transition ${displayMode === id ? "border-blue-500 bg-blue-50/70 ring-2 ring-blue-500/20 dark:border-blue-400 dark:bg-blue-950/20" : "border-slate-200/80 bg-white/70 dark:border-white/10 dark:bg-white/[0.03]"}`}><div className="flex items-center gap-3"><span className="text-xl">{icon}</span><span className="text-sm font-extrabold text-slate-900 dark:text-white">{title}</span></div><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{desc}</p></button>)}</div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div><label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">Accent</label><div className="grid grid-cols-3 gap-2">{ACCENT_PALETTES.map((item) => <button key={item.key} type="button" onClick={() => setAccent(item.key as AccentColor)} className={`rounded-xl border px-2 py-2 text-[10px] font-bold ${accent === item.key ? "border-violet-500 ring-2 ring-violet-500/15" : "border-slate-200 dark:border-white/10"}`}><span className="mx-auto mb-1 block h-4 w-4 rounded-full" style={{ background: item.colorHex }} />{item.label.replace(/^(Ocean|Emerald|Royal|Sunset|Crimson|Electric) /, "")}</button>)}</div></div>
          <div><label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">Density</label><div className="grid grid-cols-2 gap-2">{(["comfortable", "compact"] as DensityMode[]).map((value) => <button key={value} type="button" onClick={() => setDensity(value)} className={`rounded-xl border px-3 py-2.5 text-xs font-bold capitalize ${density === value ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300" : "border-slate-200 dark:border-white/10 dark:text-slate-300"}`}>{value}</button>)}</div></div>
        </div>
      </SettingsSection>

      <SettingsSection icon="M4 6h16M4 12h16M4 18h16" tone="cyan" title="Atmosphere & Motion" desc="Optional ambient gradients, motion preferences and typography scale.">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/70 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:bg-white/[0.03]"><div><div className="text-xs font-extrabold text-slate-900 dark:text-white">Ambient gradient</div><p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Adds controlled colour atmosphere behind the workspace.</p></div><Toggle checked={gradientEnabled} onChange={() => setGradientEnabled(!gradientEnabled)} label="Toggle ambient gradient" /></div>
          {gradientEnabled && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{GRADIENT_PRESETS.map((preset) => <button key={preset.id} type="button" onClick={() => setGradientPreset(preset.id as GradientPreset)} className={`rounded-xl border p-3 text-left ${gradientPreset === preset.id ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-950/20" : "border-slate-200 dark:border-white/10"}`}><div className="text-xs font-bold text-slate-900 dark:text-white">{preset.name}</div><div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{preset.mood}</div></button>)}</div>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]"><div><div className="text-xs font-extrabold text-slate-900 dark:text-white">Motion</div><p className="text-[11px] text-slate-500 dark:text-slate-400">Enable subtle interaction movement.</p></div><div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-white/5"><button type="button" onClick={() => setMotion("on" as MotionMode)} className={`rounded-md px-2 py-1 text-[10px] font-bold ${motion === "on" ? "bg-white shadow-sm dark:bg-slate-800" : "text-slate-400"}`}>ON</button><button type="button" onClick={() => setMotion("off" as MotionMode)} className={`rounded-md px-2 py-1 text-[10px] font-bold ${motion === "off" ? "bg-white shadow-sm dark:bg-slate-800" : "text-slate-400"}`}>OFF</button></div></div><div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]"><div className="text-xs font-extrabold text-slate-900 dark:text-white">Font scale</div><div className="mt-2 grid grid-cols-2 gap-2">{(["standard", "large"] as FontScale[]).map((value) => <button key={value} type="button" onClick={() => setFontScale(value)} className={`rounded-lg border px-2 py-1.5 text-[10px] font-bold capitalize ${fontScale === value ? "border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-950/20 dark:text-cyan-300" : "border-slate-200 dark:border-white/10 dark:text-slate-300"}`}>{value}</button>)}</div></div></div>
        </div>
      </SettingsSection>

      <SettingsSection icon="M5 12h14M12 5l7 7-7 7" tone="slate" title="Counter Preferences" desc="Operational preferences that remain separate from visual styling.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]"><div><div className="text-xs font-extrabold text-slate-900 dark:text-white">Sound feedback</div><p className="text-[11px] text-slate-500 dark:text-slate-400">Play confirmation sounds for counter actions.</p></div><Toggle checked={soundFeedback} onChange={() => { const next = !soundFeedback; setSoundFeedback(next); persist("sccomm-sound-feedback", next, next ? "Audio feedback enabled" : "Audio feedback muted"); }} label="Toggle sound feedback" /></div><div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]"><div><div className="text-xs font-extrabold text-slate-900 dark:text-white">Thermal auto-print</div><p className="text-[11px] text-slate-500 dark:text-slate-400">Automatically print completed counter sales.</p></div><Toggle checked={autoPrintThermal} onChange={() => { const next = !autoPrintThermal; setAutoPrintThermal(next); persist("sccomm-autoprint-thermal", next, next ? "Instant auto-print enabled" : "Auto-print disabled"); }} label="Toggle thermal auto-print" /></div><div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]"><div><div className="text-xs font-extrabold text-slate-900 dark:text-white">High contrast</div><p className="text-[11px] text-slate-500 dark:text-slate-400">Increase contrast for accessibility.</p></div><Toggle checked={highContrast} onChange={() => { const next = !highContrast; setHighContrast(next); document.documentElement.classList.toggle("contrast-more", next); persist("sccomm-high-contrast", next, next ? "High contrast enabled" : "High contrast disabled"); }} label="Toggle high contrast" /></div></div>
      </SettingsSection>

      <SettingsSection icon="M5 12h14M12 5l7 7-7 7" tone="amber" title="Quick Access Ownership" desc="Dashboard Quick Access is owned by the dashboard navigation module to prevent duplicate state and editors inside Settings."><div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:bg-white/[0.03]"><div><div className="text-xs font-extrabold text-slate-900 dark:text-white">One canonical Quick Access editor</div><p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Open the Dashboard Quick Access editor to pin, reorder and reset shortcuts. Settings no longer maintains a second copy.</p></div><button type="button" onClick={clearLegacyQuickAccess} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200">Clear legacy Settings state</button></div></SettingsSection>

      <div className="flex justify-end"><button type="button" onClick={() => { resetToDefaults(); showToast("success", "Appearance settings reset to Cafe ERP defaults."); }} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200">Reset appearance defaults</button></div>
      {toastView}
    </div>
  );
}
