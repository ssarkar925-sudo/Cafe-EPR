"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTheme, ACCENT_PALETTES, DESIGN_STYLES, type DisplayMode, type DesignStyle } from "./theme-provider";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { displayMode, resolvedDisplayMode, gradientEnabled, gradientPreset, accent, designStyle, setDisplayMode, setGradientEnabled, setAccent, setDesignStyle } = useTheme();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false); };
    if (open) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const activePalette = ACCENT_PALETTES.find((p) => p.key === accent) || ACCENT_PALETTES[0];
  const activeStyle = DESIGN_STYLES.find((s) => s.id === designStyle) || DESIGN_STYLES[0];

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button type="button" onClick={() => setOpen((v) => !v)} title={`Appearance: ${activeStyle.name}`} aria-label="Toggle theme and appearance" className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200">
        {resolvedDisplayMode === "dark" ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-amber-400"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-amber-500"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M1 12h2M21 12h2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></svg>}
      </button>

      {open && <div className="absolute right-0 top-full z-50 mt-2 w-[310px] rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xl ring-1 ring-black/5 dark:border-white/10 dark:bg-slate-900 dark:ring-white/10">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-white/5">
          <div><span className="block text-xs font-extrabold text-slate-900 dark:text-white">Appearance</span><span className="text-[10px] text-slate-400">{activeStyle.name}</span></div>
          <Link href="/settings?tab=other" onClick={() => setOpen(false)} className="text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400">Full Settings →</Link>
        </div>

        <div className="mt-3"><div className="pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Visual Style</div>
          <div className="grid gap-1.5">
            {DESIGN_STYLES.map((s) => <button key={s.id} type="button" onClick={() => setDesignStyle(s.id as DesignStyle)} className={`flex items-center gap-2.5 rounded-xl border p-2 text-left transition ${designStyle === s.id ? "border-[var(--design-accent)] bg-[color-mix(in_srgb,var(--design-accent)_7%,var(--design-surface))]" : "border-transparent hover:bg-slate-50 dark:hover:bg-white/5"}`}>
              <span className={`design-style-swatch style-${s.id}`}><i /><i /><i /></span><span className="min-w-0 flex-1"><strong className="block text-[11px] font-extrabold text-slate-900 dark:text-white">{s.name}</strong><small className="mt-0.5 block text-[10px] leading-tight text-slate-500 dark:text-slate-400">{s.description}</small></span>{designStyle === s.id && <span className="font-black text-[var(--design-accent)]">✓</span>}
            </button>)}
          </div>
        </div>

        <div className="mt-3"><div className="pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Theme Mode</div><div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
          {[{ key:"light" as DisplayMode,label:"☀️ Light" },{ key:"dark" as DisplayMode,label:"🌙 Dark" },{ key:"system" as DisplayMode,label:"💻 Auto" }].map((m) => <button key={m.key} type="button" onClick={() => setDisplayMode(m.key)} className={`rounded-lg py-1.5 text-[11px] font-bold ${displayMode === m.key ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white" : "text-slate-500"}`}>{m.label}</button>)}
        </div></div>

        <div className="mt-3"><div className="flex items-center justify-between pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400"><span>Atmosphere</span><span>{gradientEnabled ? gradientPreset.replace("-", " ") : "Clean"}</span></div><div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5"><button type="button" onClick={() => setGradientEnabled(false)} className={`rounded-lg py-1.5 text-[11px] font-bold ${!gradientEnabled ? "bg-white shadow-sm dark:bg-slate-800" : "text-slate-500"}`}>Clean</button><button type="button" onClick={() => setGradientEnabled(true)} className={`rounded-lg py-1.5 text-[11px] font-bold ${gradientEnabled ? "bg-white shadow-sm dark:bg-slate-800" : "text-slate-500"}`}>✨ Subtle</button></div></div>

        <div className="mt-3"><div className="flex items-center justify-between pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400"><span>Accent</span><span>{activePalette.label.split(" ")[0]}</span></div><div className="flex justify-between gap-1">{ACCENT_PALETTES.map((p) => <button key={p.key} type="button" onClick={() => setAccent(p.key)} title={p.label} className={`h-7 w-7 rounded-full transition hover:scale-110 ${accent === p.key ? "ring-2 ring-offset-2 ring-slate-900 dark:ring-white dark:ring-offset-slate-900" : ""}`} style={{ backgroundColor: p.colorHex }}>{accent === p.key && <span className="text-[11px] font-black text-white">✓</span>}</button>)}</div></div>
      </div>}
    </div>
  );
}
