"use client";

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
  const activeDesign = DESIGN_STYLES.find((d) => d.key === design) || DESIGN_STYLES[0];

  return (
    <div className={active ? "mt-6 space-y-8" : "hidden"}>
      <SettingsSection icon="M4 6h16M4 12h16M4 18h16" tone="amber" title="Design Studio" desc="Choose a complete visual language for your ERP. Your selection is saved on this device and applies across the application.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {DESIGN_STYLES.map((d) => {
            const selected = d.key === design;
            return (
              <button key={d.key} type="button" onClick={() => setDesign(d.key)} className={`group overflow-hidden rounded-2xl border text-left transition duration-200 ${selected ? "border-amber-500 ring-2 ring-amber-500/20 shadow-lg" : "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md dark:border-white/10"}`}>
                <div className={`h-28 p-3 ${previews[d.key]}`}>
                  <div className="flex h-full gap-2">
                    <div className="w-1/4 rounded-lg border border-black/10 bg-black/10 p-2"><div className="mb-2 h-2 w-3/4 rounded bg-current/40" /><div className="space-y-1.5"><div className="h-1.5 rounded bg-current/20" /><div className="h-1.5 rounded bg-current/20" /><div className="h-1.5 w-2/3 rounded bg-current/20" /></div></div>
                    <div className="flex-1 space-y-2"><div className="flex gap-2"><div className="h-7 flex-1 rounded-md border border-black/10 bg-white/50" /><div className="h-7 flex-1 rounded-md border border-black/10 bg-white/40" /></div><div className="h-12 rounded-md border border-black/10 bg-white/50" /></div>
                  </div>
                </div>
                <div className="bg-white p-4 dark:bg-slate-900">
                  <div className="flex items-center justify-between gap-2"><span className="font-bold text-slate-900 dark:text-white">{d.label}</span>{selected && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">ACTIVE</span>}</div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{d.description}</p>
                  <div className="mt-3 flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: d.accent }} /><span className="text-[11px] text-slate-400">{d.key === "cafe" ? "Recommended" : "Design preset"}</span></div>
                </div>
              </button>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection icon="M12 3v18M3 12h18" tone="blue" title="Display Mode" desc="Light, dark, or automatic system appearance.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(["light", "dark", "system"] as Theme[]).map((t) => (
            <button key={t} type="button" onClick={() => setTheme(t)} className={`rounded-2xl border p-4 text-left transition ${theme === t ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/15 dark:bg-blue-950/30" : "border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"}`}>
              <div className="flex items-center justify-between"><span className="font-bold capitalize text-slate-900 dark:text-white">{t}</span>{theme === t && <span className="text-blue-600">✓</span>}</div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t === "system" ? "Follow device settings" : `Use ${t} mode`}</p>
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection icon="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" tone="violet" title="Accent Color" desc="Fine-tune the primary action color independently of the selected design.">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {ACCENT_PALETTES.map((p) => <button key={p.key} type="button" onClick={() => setAccent(p.key as AccentColor)} className={`rounded-2xl border p-3 transition ${accent === p.key ? "border-slate-900 ring-2 ring-slate-900/10 dark:border-white" : "border-slate-200 hover:shadow-sm dark:border-white/10"}`}><span className="mx-auto flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: p.colorHex }}>{accent === p.key && <span className="text-white">✓</span>}</span><span className="mt-2 block text-[11px] font-semibold text-slate-700 dark:text-slate-300">{p.label.split(" ")[0]}</span></button>)}
        </div>
      </SettingsSection>

      <SettingsSection icon="M4 6h16M4 12h16M4 18h16" tone="emerald" title="Density & Typography" desc="Optimize the interface for desktop ERP workstations, tablets, or POS counters.">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div><p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Density</p><div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-white/5">{(["comfortable", "compact"] as DensityMode[]).map((d) => <button key={d} type="button" onClick={() => setDensity(d)} className={`rounded-lg py-2 text-xs font-semibold capitalize ${density === d ? "bg-white shadow-sm dark:bg-slate-800 dark:text-white" : "text-slate-500"}`}>{d}</button>)}</div></div>
          <div><p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Font scale</p><div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-white/5">{(["standard", "large"] as FontScale[]).map((f) => <button key={f} type="button" onClick={() => setFontScale(f)} className={`rounded-lg py-2 text-xs font-semibold capitalize ${fontScale === f ? "bg-white shadow-sm dark:bg-slate-800 dark:text-white" : "text-slate-500"}`}>{f}</button>)}</div></div>
        </div>
      </SettingsSection>

      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-sm font-bold text-slate-900 dark:text-white">Currently using {activeDesign.label}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{activeDesign.description}. Changes are applied immediately.</p></div>
        <button type="button" onClick={resetToDefaults} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Reset appearance</button>
      </div>
    </div>
  );
}
