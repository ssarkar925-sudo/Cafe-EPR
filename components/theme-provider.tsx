"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";
export type AccentColor = "blue" | "emerald" | "violet" | "amber" | "rose" | "cyan";
export type DensityMode = "comfortable" | "compact";
export type FontScale = "standard" | "large";
export type DesignStyle = "cafe" | "glass" | "clean" | "midnight" | "organic" | "neon" | "corporate";

export interface AccentOption { key: AccentColor; label: string; colorHex: string; ringClass: string; badgeClass: string; primaryClass: string; }
export const ACCENT_PALETTES: AccentOption[] = [
  { key: "blue", label: "Ocean Sapphire", colorHex: "#2563eb", ringClass: "ring-blue-500/20", badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300", primaryClass: "bg-blue-600 hover:bg-blue-700 text-white" },
  { key: "emerald", label: "Emerald Mint", colorHex: "#059669", ringClass: "ring-emerald-500/20", badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", primaryClass: "bg-emerald-600 hover:bg-emerald-700 text-white" },
  { key: "violet", label: "Royal Violet", colorHex: "#7c3aed", ringClass: "ring-violet-500/20", badgeClass: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300", primaryClass: "bg-violet-600 hover:bg-violet-700 text-white" },
  { key: "amber", label: "Sunset Amber", colorHex: "#d97706", ringClass: "ring-amber-500/20", badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300", primaryClass: "bg-amber-600 hover:bg-amber-700 text-white" },
  { key: "rose", label: "Crimson Rose", colorHex: "#e11d48", ringClass: "ring-rose-500/20", badgeClass: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300", primaryClass: "bg-rose-600 hover:bg-rose-700 text-white" },
  { key: "cyan", label: "Electric Cyan", colorHex: "#0891b2", ringClass: "ring-cyan-500/20", badgeClass: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300", primaryClass: "bg-cyan-600 hover:bg-cyan-700 text-white" },
];

export const DESIGN_STYLES: { key: DesignStyle; label: string; description: string; accent: string; page: string; surface: string; radius: string; bestFor: string }[] = [
  { key: "cafe", label: "Café Premium", description: "Warm, elegant and brand-focused", accent: "#c58a45", page: "#f7f5ef", surface: "rgba(255,255,255,.96)", radius: "18px", bestFor: "Daily counter & café operations" },
  { key: "glass", label: "Luxury Glass", description: "Frosted surfaces and soft glow", accent: "#7c3aed", page: "#f4f3fb", surface: "rgba(255,255,255,.70)", radius: "22px", bestFor: "Modern premium workstation" },
  { key: "clean", label: "Modern Clean", description: "Minimal, spacious enterprise UI", accent: "#2563eb", page: "#f8fafc", surface: "#ffffff", radius: "14px", bestFor: "Fast business & accounting work" },
  { key: "midnight", label: "Midnight Pro", description: "Executive dark control center", accent: "#38bdf8", page: "#080d18", surface: "#101827", radius: "16px", bestFor: "Low-light / long sessions" },
  { key: "organic", label: "Organic Café", description: "Natural cream, sage and coffee tones", accent: "#64866b", page: "#f5f2e9", surface: "#fffdf7", radius: "20px", bestFor: "Hospitality & retail feel" },
  { key: "neon", label: "Neon Tech", description: "Futuristic cyber-café workstation", accent: "#22d3ee", page: "#070b12", surface: "#0d1520", radius: "12px", bestFor: "Tech-heavy service desk" },
  { key: "corporate", label: "Corporate Pro", description: "Conservative, crisp and highly focused", accent: "#1e40af", page: "#f1f5f9", surface: "#ffffff", radius: "12px", bestFor: "Reports, finance & back office" },
];

const THEME_KEY = "sccomm-theme"; const ACCENT_KEY = "sccomm-accent"; const DENSITY_KEY = "sccomm-density"; const FONT_SCALE_KEY = "sccomm-font-scale"; const DESIGN_KEY = "sccomm-design";
interface ThemeContextValue { theme: Theme; resolvedTheme: "light" | "dark"; accent: AccentColor; density: DensityMode; fontScale: FontScale; design: DesignStyle; setTheme: (t: Theme) => void; setAccent: (a: AccentColor) => void; setDensity: (d: DensityMode) => void; setFontScale: (f: FontScale) => void; setDesign: (d: DesignStyle) => void; toggleTheme: () => void; resetToDefaults: () => void; }
const ThemeContext = createContext<ThemeContextValue | null>(null);
export function getStoredTheme(): Theme { if (typeof window === "undefined") return "system"; const stored = localStorage.getItem(THEME_KEY) as Theme | null; return stored === "light" || stored === "dark" || stored === "system" ? stored : "system"; }
export function getStoredAccent(): AccentColor { if (typeof window === "undefined") return "amber"; const stored = localStorage.getItem(ACCENT_KEY) as AccentColor | null; return ACCENT_PALETTES.some((p) => p.key === stored) ? (stored as AccentColor) : "amber"; }
export function getStoredDensity(): DensityMode { if (typeof window === "undefined") return "comfortable"; return localStorage.getItem(DENSITY_KEY) === "compact" ? "compact" : "comfortable"; }
export function getStoredFontScale(): FontScale { if (typeof window === "undefined") return "standard"; return localStorage.getItem(FONT_SCALE_KEY) === "large" ? "large" : "standard"; }
export function getStoredDesign(): DesignStyle { if (typeof window === "undefined") return "cafe"; const stored = localStorage.getItem(DESIGN_KEY) as DesignStyle | null; return DESIGN_STYLES.some((d) => d.key === stored) ? (stored as DesignStyle) : "cafe"; }

function applyDesignVariables(design: DesignStyle, isDark: boolean) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const preset = DESIGN_STYLES.find((d) => d.key === design) || DESIGN_STYLES[0];

  const darkPalettes: Record<DesignStyle, { page: string; surface: string; soft: string; ink: string; muted: string; line: string }> = {
    cafe: { page: "#17110c", surface: "#241a13", soft: "#1d1510", ink: "#fff7ed", muted: "#c5b5a5", line: "rgba(255,231,204,.12)" },
    glass: { page: "#0f0d19", surface: "rgba(31,25,49,.82)", soft: "rgba(24,20,39,.72)", ink: "#faf7ff", muted: "#b7aec9", line: "rgba(196,181,253,.16)" },
    clean: { page: "#111827", surface: "#1f2937", soft: "#172033", ink: "#f8fafc", muted: "#94a3b8", line: "rgba(255,255,255,.10)" },
    midnight: { page: "#080d18", surface: "#101827", soft: "#0d1522", ink: "#f8fafc", muted: "#94a3b8", line: "rgba(255,255,255,.10)" },
    organic: { page: "#142019", surface: "#1d2b23", soft: "#18251e", ink: "#f4f7f1", muted: "#a9b9ad", line: "rgba(213,232,217,.12)" },
    neon: { page: "#070b12", surface: "#0d1520", soft: "#0a111b", ink: "#ecfeff", muted: "#94a3b8", line: "rgba(34,211,238,.16)" },
    corporate: { page: "#0b1220", surface: "#111827", soft: "#0f172a", ink: "#f8fafc", muted: "#94a3b8", line: "rgba(255,255,255,.10)" },
  };
  const palette = isDark ? darkPalettes[design] : { page: preset.page, surface: preset.surface, soft: preset.page, ink: "#172033", muted: "#667085", line: "rgba(15,23,42,.085)" };

  root.setAttribute("data-design", design);
  root.style.setProperty("--design-accent", preset.accent);
  root.style.setProperty("--page", palette.page);
  root.style.setProperty("--surface", palette.surface);
  root.style.setProperty("--surface-soft", palette.soft);
  root.style.setProperty("--ink", palette.ink);
  root.style.setProperty("--muted", palette.muted);
  root.style.setProperty("--line", palette.line);
  root.style.setProperty("--shadow-card", design === "glass" ? "0 18px 50px rgba(76,29,149,.18)" : isDark ? "0 16px 42px rgba(0,0,0,.28)" : "0 12px 32px rgba(15,23,42,.065)");
  root.style.setProperty("--card-radius", preset.radius);

  // Runtime shell bridge: existing hard-coded Tailwind surfaces now follow the selected preset.
  const styleId = "sccomm-theme-runtime";
  let style = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!style) { style = document.createElement("style"); style.id = styleId; document.head.appendChild(style); }
  const sidebar: Record<DesignStyle, { light: string; dark: string }> = {
    cafe: { light: "linear-gradient(180deg,#4a3322 0%,#2d2118 55%,#1b120d 100%)", dark: "linear-gradient(180deg,#3a281a 0%,#24170f 55%,#120b07 100%)" },
    glass: { light: "linear-gradient(180deg,rgba(67,45,104,.94),rgba(30,21,49,.96))", dark: "linear-gradient(180deg,#211832,#120d1d)" },
    clean: { light: "linear-gradient(180deg,#ffffff,#f1f5f9)", dark: "linear-gradient(180deg,#1f2937,#111827)" },
    midnight: { light: "linear-gradient(180deg,#17233a,#0e1728)", dark: "linear-gradient(180deg,#0c1422,#050911)" },
    organic: { light: "linear-gradient(180deg,#304238,#1f3027)", dark: "linear-gradient(180deg,#26382e,#111a15)" },
    neon: { light: "linear-gradient(180deg,#12202b,#0a141d)", dark: "linear-gradient(180deg,#0c1721,#050911)" },
    corporate: { light: "linear-gradient(180deg,#1e3a5f,#12243d)", dark: "linear-gradient(180deg,#172033,#0b1220)" },
  };
  const sb = sidebar[design][isDark ? "dark" : "light"];
  const lightText = design === "clean";
  style.textContent = `
    aside{background:${sb}!important;}
    aside a[aria-current="page"]{box-shadow:inset 3px 0 0 var(--accent-color),0 8px 24px rgba(0,0,0,.12)!important;}
    [data-design="${design}"] .bg-white{background-color:var(--surface)!important;color:var(--ink)}
    [data-design="${design}"] .bg-slate-50{background-color:var(--surface-soft)!important}
    [data-design="${design}"] .border-slate-200,[data-design="${design}"] .border-slate-100{border-color:var(--line)!important}
    [data-design="${design}"] input,[data-design="${design}"] select,[data-design="${design}"] textarea{background-color:color-mix(in srgb,var(--surface) 94%,transparent)!important;color:var(--ink)!important;border-color:var(--line)!important}
    [data-design="${design}"] main>header{background:color-mix(in srgb,var(--surface) 90%,transparent)!important;border-bottom-color:var(--line)!important}
    ${lightText ? `[data-design="clean"] aside{color:#172033!important}[data-design="clean"] aside a{color:#334155!important}[data-design="clean"] aside a[aria-current="page"]{color:#fff!important}` : ""}
  `;
}

export function applyTheme(theme: Theme, accent: AccentColor = "amber", density: DensityMode = "comfortable", fontScale: FontScale = "standard", design: DesignStyle = "cafe") {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", isDark);
  root.setAttribute("data-theme", isDark ? "dark" : "light");
  root.setAttribute("data-accent", accent);
  root.setAttribute("data-density", density);
  root.setAttribute("data-font-scale", fontScale);
  root.classList.toggle("density-compact", density === "compact");
  root.classList.toggle("font-scale-large", fontScale === "large");
  applyDesignVariables(design, isDark);
}

export const getTheme = getStoredTheme;
export const setTheme = (theme: Theme) => { try { localStorage.setItem(THEME_KEY, theme); } catch {} applyTheme(theme, getStoredAccent(), getStoredDensity(), getStoredFontScale(), getStoredDesign()); };

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system"); const [accent, setAccentState] = useState<AccentColor>("amber"); const [density, setDensityState] = useState<DensityMode>("comfortable"); const [fontScale, setFontScaleState] = useState<FontScale>("standard"); const [design, setDesignState] = useState<DesignStyle>("cafe"); const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  useEffect(() => { const t=getStoredTheme(),a=getStoredAccent(),d=getStoredDensity(),f=getStoredFontScale(),s=getStoredDesign(); setThemeState(t);setAccentState(a);setDensityState(d);setFontScaleState(f);setDesignState(s);const dark=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);setResolvedTheme(dark?"dark":"light");applyTheme(t,a,d,f,s);const mq=window.matchMedia("(prefers-color-scheme: dark)");const onChange=()=>{if(getStoredTheme()==="system"){setResolvedTheme(mq.matches?"dark":"light");applyTheme("system",getStoredAccent(),getStoredDensity(),getStoredFontScale(),getStoredDesign());}};mq.addEventListener("change",onChange);return()=>mq.removeEventListener("change",onChange); },[]);
  function handleSetTheme(next:Theme){setThemeState(next);try{localStorage.setItem(THEME_KEY,next);}catch{}const dark=next==="dark"||(next==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);setResolvedTheme(dark?"dark":"light");applyTheme(next,accent,density,fontScale,design);}
  function handleSetAccent(next:AccentColor){setAccentState(next);try{localStorage.setItem(ACCENT_KEY,next);}catch{}applyTheme(theme,next,density,fontScale,design);}
  function handleSetDensity(next:DensityMode){setDensityState(next);try{localStorage.setItem(DENSITY_KEY,next);}catch{}applyTheme(theme,accent,next,fontScale,design);}
  function handleSetFontScale(next:FontScale){setFontScaleState(next);try{localStorage.setItem(FONT_SCALE_KEY,next);}catch{}applyTheme(theme,accent,density,next,design);}
  function handleSetDesign(next:DesignStyle){setDesignState(next);try{localStorage.setItem(DESIGN_KEY,next);}catch{}applyTheme(theme,accent,density,fontScale,next);}
  function toggleTheme(){handleSetTheme(resolvedTheme==="dark"?"light":"dark");}
  function resetToDefaults(){const nextTheme:Theme="system",nextAccent:AccentColor="amber",nextDensity:DensityMode="comfortable",nextFontScale:FontScale="standard",nextDesign:DesignStyle="cafe";setThemeState(nextTheme);setAccentState(nextAccent);setDensityState(nextDensity);setFontScaleState(nextFontScale);setDesignState(nextDesign);setResolvedTheme(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");try{localStorage.setItem(THEME_KEY,nextTheme);localStorage.setItem(ACCENT_KEY,nextAccent);localStorage.setItem(DENSITY_KEY,nextDensity);localStorage.setItem(FONT_SCALE_KEY,nextFontScale);localStorage.setItem(DESIGN_KEY,nextDesign);}catch{}applyTheme(nextTheme,nextAccent,nextDensity,nextFontScale,nextDesign);}
  return <ThemeContext.Provider value={{theme,resolvedTheme,accent,density,fontScale,design,setTheme:handleSetTheme,setAccent:handleSetAccent,setDensity:handleSetDensity,setFontScale:handleSetFontScale,setDesign:handleSetDesign,toggleTheme,resetToDefaults}}>{children}</ThemeContext.Provider>;
}
export function useTheme(){const ctx=useContext(ThemeContext);if(!ctx)throw new Error("useTheme must be used within a ThemeProvider");return ctx;}
