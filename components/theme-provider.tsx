"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type DisplayMode = "light" | "dark" | "system";
export type GradientPreset = "aurora" | "ocean-luxe" | "royal" | "sunset-luxe" | "emerald-luxe" | "cosmic";
export type MotionMode = "on" | "off";
export type AccentColor = "blue" | "emerald" | "violet" | "amber" | "rose" | "cyan";
export type DensityMode = "comfortable" | "compact";
export type FontScale = "standard" | "large";
export type DesignStyle = "chromatic-calm" | "neo-minimal" | "colorful-bento";
export type Theme = DisplayMode;

export interface DesignStyleOption {
  id: DesignStyle;
  name: string;
  description: string;
  primary: string;
  secondary: string;
  accent: string;
}

export const DESIGN_STYLES: DesignStyleOption[] = [
  { id: "chromatic-calm", name: "Chromatic Calm", description: "Soft colour, warm canvas, premium and easy on the eyes", primary: "#6758e8", secondary: "#2aa198", accent: "#6758e8" },
  { id: "neo-minimal", name: "Neo Minimal", description: "Quiet luxury, sharper hierarchy and restrained colour", primary: "#243447", secondary: "#64748b", accent: "#3b82f6" },
  { id: "colorful-bento", name: "Colorful Bento", description: "Layered pastel modules with expressive, modern energy", primary: "#7c3aed", secondary: "#0ea5e9", accent: "#7c3aed" },
];

export interface AccentOption {
  key: AccentColor;
  label: string;
  colorHex: string;
  ringClass: string;
  badgeClass: string;
  primaryClass: string;
}

export const ACCENT_PALETTES: AccentOption[] = [
  { key: "blue", label: "Ocean Sapphire", colorHex: "#2563eb", ringClass: "ring-blue-500/20", badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300", primaryClass: "bg-blue-600 hover:bg-blue-700 text-white" },
  { key: "emerald", label: "Emerald Mint", colorHex: "#059669", ringClass: "ring-emerald-500/20", badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", primaryClass: "bg-emerald-600 hover:bg-emerald-700 text-white" },
  { key: "violet", label: "Royal Violet", colorHex: "#7c3aed", ringClass: "ring-violet-500/20", badgeClass: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300", primaryClass: "bg-violet-600 hover:bg-violet-700 text-white" },
  { key: "amber", label: "Sunset Amber", colorHex: "#d97706", ringClass: "ring-amber-500/20", badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300", primaryClass: "bg-amber-600 hover:bg-amber-700 text-white" },
  { key: "rose", label: "Crimson Rose", colorHex: "#e11d48", ringClass: "ring-rose-500/20", badgeClass: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300", primaryClass: "bg-rose-600 hover:bg-rose-700 text-white" },
  { key: "cyan", label: "Electric Cyan", colorHex: "#0891b2", ringClass: "ring-cyan-500/20", badgeClass: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300", primaryClass: "bg-cyan-600 hover:bg-cyan-700 text-white" },
];

export interface GradientPresetOption {
  id: GradientPreset;
  name: string;
  mood: string;
  primaryName: string;
  secondaryName: string;
  highlightName: string;
  primary: string;
  secondary: string;
  highlight: string;
  previewBg: string;
}

export const GRADIENT_PRESETS: GradientPresetOption[] = [
  { id: "aurora", name: "Aurora", mood: "Sapphire Blue, Violet & Cyan", primaryName: "Sapphire Blue", secondaryName: "Violet", highlightName: "Cyan", primary: "#2563eb", secondary: "#7c3aed", highlight: "#06b6d4", previewBg: "from-blue-600/30 via-violet-600/30 to-cyan-500/30" },
  { id: "ocean-luxe", name: "Ocean Luxe", mood: "Deep Blue, Teal & Cyan", primaryName: "Deep Blue", secondaryName: "Teal", highlightName: "Cyan", primary: "#1d4ed8", secondary: "#0d9488", highlight: "#06b6d4", previewBg: "from-blue-700/30 via-teal-600/30 to-cyan-500/30" },
  { id: "royal", name: "Royal", mood: "Indigo, Violet & Soft Blue", primaryName: "Indigo", secondaryName: "Violet", highlightName: "Soft Blue", primary: "#4f46e5", secondary: "#9333ea", highlight: "#38bdf8", previewBg: "from-indigo-600/30 via-purple-600/30 to-sky-400/30" },
  { id: "sunset-luxe", name: "Sunset Luxe", mood: "Amber, Rose & Violet", primaryName: "Amber", secondaryName: "Rose", highlightName: "Violet", primary: "#d97706", secondary: "#e11d48", highlight: "#8b5cf6", previewBg: "from-amber-500/30 via-rose-500/30 to-purple-600/30" },
  { id: "emerald-luxe", name: "Emerald Luxe", mood: "Emerald, Teal & Cyan", primaryName: "Emerald", secondaryName: "Teal", highlightName: "Cyan", primary: "#059669", secondary: "#0d9488", highlight: "#06b6d4", previewBg: "from-emerald-600/30 via-teal-600/30 to-cyan-500/30" },
  { id: "cosmic", name: "Cosmic", mood: "Deep Violet, Blue & Magenta", primaryName: "Deep Violet", secondaryName: "Blue", highlightName: "Magenta", primary: "#6d28d9", secondary: "#2563eb", highlight: "#d946ef", previewBg: "from-purple-700/30 via-blue-600/30 to-fuchsia-500/30" },
];

const DISPLAY_MODE_KEY = "sccomm-display-mode";
const LEGACY_THEME_KEY = "sccomm-theme";
const GRADIENT_ENABLED_KEY = "sccomm-gradient-enabled";
const GRADIENT_PRESET_KEY = "sccomm-gradient-preset";
const MOTION_KEY = "sccomm-motion-enabled";
const ACCENT_KEY = "sccomm-accent";
const DENSITY_KEY = "sccomm-density";
const FONT_SCALE_KEY = "sccomm-font-scale";
const DESIGN_STYLE_KEY = "cafe-erp-design-style";

interface ThemeContextValue {
  displayMode: DisplayMode; resolvedDisplayMode: "light" | "dark";
  gradientEnabled: boolean; gradientPreset: GradientPreset; motion: MotionMode; accent: AccentColor; density: DensityMode; fontScale: FontScale; designStyle: DesignStyle;
  setDisplayMode: (m: DisplayMode) => void; setGradientEnabled: (v: boolean) => void; setGradientPreset: (p: GradientPreset) => void; setMotion: (m: MotionMode) => void; setAccent: (a: AccentColor) => void; setDensity: (d: DensityMode) => void; setFontScale: (f: FontScale) => void; setDesignStyle: (s: DesignStyle) => void;
  toggleDisplayMode: () => void; resetToDefaults: () => void;
  theme: DisplayMode; resolvedTheme: "light" | "dark"; designStyleLegacy: "modern-spatial"; design: "modern-spatial"; setTheme: (t: DisplayMode) => void; toggleTheme: () => void;
}
const ThemeContext = createContext<ThemeContextValue | null>(null);

function validDesign(value: string | null): DesignStyle {
  return value === "neo-minimal" || value === "colorful-bento" || value === "chromatic-calm" ? value : "chromatic-calm";
}
function stored<T extends string>(key: string, fallback: T, values: readonly T[]): T {
  if (typeof window === "undefined") return fallback;
  const value = localStorage.getItem(key) as T | null;
  return value && values.includes(value) ? value : fallback;
}
export function getStoredDisplayMode(): DisplayMode { return stored(DISPLAY_MODE_KEY, "light", ["light", "dark", "system"]); }
export function getStoredGradientEnabled(): boolean { return typeof window === "undefined" ? false : localStorage.getItem(GRADIENT_ENABLED_KEY) === "true"; }
export function getStoredGradientPreset(): GradientPreset { return stored(GRADIENT_PRESET_KEY, "aurora", GRADIENT_PRESETS.map((p) => p.id)); }
export function getStoredMotion(): MotionMode { return stored(MOTION_KEY, "on", ["on", "off"]); }
export function getStoredAccent(): AccentColor { return stored(ACCENT_KEY, "violet", ACCENT_PALETTES.map((p) => p.key)); }
export function getStoredDensity(): DensityMode { return stored(DENSITY_KEY, "comfortable", ["comfortable", "compact"]); }
export function getStoredFontScale(): FontScale { return stored(FONT_SCALE_KEY, "standard", ["standard", "large"]); }
export function getStoredDesignStyle(): DesignStyle { return typeof window === "undefined" ? "chromatic-calm" : validDesign(localStorage.getItem(DESIGN_STYLE_KEY)); }

export function applyTheme(displayMode: DisplayMode, gradientEnabled = false, gradientPreset: GradientPreset = "aurora", motion: MotionMode = "on", accent: AccentColor = "violet", density: DensityMode = "comfortable", fontScale: FontScale = "standard", designStyle: DesignStyle = "chromatic-calm") {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const isDark = displayMode === "dark" || (displayMode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", isDark);
  root.setAttribute("data-display-mode", isDark ? "dark" : "light");
  root.setAttribute("data-theme", isDark ? "dark" : "light");
  root.setAttribute("data-design-style", designStyle);
  root.setAttribute("data-gradient-enabled", String(gradientEnabled));
  root.setAttribute("data-gradient-preset", gradientPreset);
  root.setAttribute("data-motion", motion);
  root.classList.toggle("motion-reduce", motion === "off");
  root.setAttribute("data-accent", accent);
  root.setAttribute("data-density", density);
  root.setAttribute("data-font-scale", fontScale);
  root.classList.toggle("density-compact", density === "compact");
  root.classList.toggle("font-scale-large", fontScale === "large");
}

export const getTheme = getStoredDisplayMode;
export const setTheme = (displayMode: DisplayMode) => { try { localStorage.setItem(DISPLAY_MODE_KEY, displayMode); localStorage.setItem(LEGACY_THEME_KEY, displayMode); } catch {} applyTheme(displayMode, getStoredGradientEnabled(), getStoredGradientPreset(), getStoredMotion(), getStoredAccent(), getStoredDensity(), getStoredFontScale(), getStoredDesignStyle()); };

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [displayMode, setDisplayModeState] = useState<DisplayMode>("light");
  const [gradientEnabled, setGradientEnabledState] = useState(false);
  const [gradientPreset, setGradientPresetState] = useState<GradientPreset>("aurora");
  const [motion, setMotionState] = useState<MotionMode>("on");
  const [accent, setAccentState] = useState<AccentColor>("violet");
  const [density, setDensityState] = useState<DensityMode>("comfortable");
  const [fontScale, setFontScaleState] = useState<FontScale>("standard");
  const [designStyle, setDesignStyleState] = useState<DesignStyle>("chromatic-calm");
  const [resolvedDisplayMode, setResolvedDisplayMode] = useState<"light" | "dark">("light");

  useEffect(() => {
    const m = getStoredDisplayMode(), grad = getStoredGradientEnabled(), preset = getStoredGradientPreset(), mot = getStoredMotion(), a = getStoredAccent(), d = getStoredDensity(), f = getStoredFontScale(), style = getStoredDesignStyle();
    setDisplayModeState(m); setGradientEnabledState(grad); setGradientPresetState(preset); setMotionState(mot); setAccentState(a); setDensityState(d); setFontScaleState(f); setDesignStyleState(style);
    const sync = () => { const dark = m === "dark" || (m === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches); setResolvedDisplayMode(dark ? "dark" : "light"); };
    sync(); applyTheme(m, grad, preset, mot, a, d, f, style);
    const mq = window.matchMedia("(prefers-color-scheme: dark)"), onChange = () => { if (getStoredDisplayMode() === "system") { const dark = mq.matches; setResolvedDisplayMode(dark ? "dark" : "light"); applyTheme("system", getStoredGradientEnabled(), getStoredGradientPreset(), getStoredMotion(), getStoredAccent(), getStoredDensity(), getStoredFontScale(), getStoredDesignStyle()); } };
    mq.addEventListener("change", onChange); return () => mq.removeEventListener("change", onChange);
  }, []);

  function update(partial: { displayMode?: DisplayMode; gradientEnabled?: boolean; gradientPreset?: GradientPreset; motion?: MotionMode; accent?: AccentColor; density?: DensityMode; fontScale?: FontScale; designStyle?: DesignStyle }) {
    const next = { displayMode, gradientEnabled, gradientPreset, motion, accent, density, fontScale, designStyle, ...partial };
    if (partial.displayMode) setDisplayModeState(partial.displayMode);
    if (partial.gradientEnabled !== undefined) setGradientEnabledState(partial.gradientEnabled);
    if (partial.gradientPreset) setGradientPresetState(partial.gradientPreset);
    if (partial.motion) setMotionState(partial.motion);
    if (partial.accent) setAccentState(partial.accent);
    if (partial.density) setDensityState(partial.density);
    if (partial.fontScale) setFontScaleState(partial.fontScale);
    if (partial.designStyle) setDesignStyleState(partial.designStyle);
    try {
      const map: Record<string, string> = { displayMode: DISPLAY_MODE_KEY, gradientEnabled: GRADIENT_ENABLED_KEY, gradientPreset: GRADIENT_PRESET_KEY, motion: MOTION_KEY, accent: ACCENT_KEY, density: DENSITY_KEY, fontScale: FONT_SCALE_KEY, designStyle: DESIGN_STYLE_KEY };
      Object.entries(partial).forEach(([k, v]) => localStorage.setItem(map[k], String(v)));
      if (partial.displayMode) localStorage.setItem(LEGACY_THEME_KEY, partial.displayMode);
    } catch {}
    const dark = next.displayMode === "dark" || (next.displayMode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches); setResolvedDisplayMode(dark ? "dark" : "light");
    applyTheme(next.displayMode, next.gradientEnabled, next.gradientPreset, next.motion, next.accent, next.density, next.fontScale, next.designStyle);
  }
  const resetToDefaults = () => update({ displayMode: "light", gradientEnabled: false, gradientPreset: "aurora", motion: "on", accent: "violet", density: "comfortable", fontScale: "standard", designStyle: "chromatic-calm" });
  const toggleDisplayMode = () => update({ displayMode: resolvedDisplayMode === "dark" ? "light" : "dark" });

  return <ThemeContext.Provider value={{ displayMode, resolvedDisplayMode, gradientEnabled, gradientPreset, motion, accent, density, fontScale, designStyle, setDisplayMode: (v) => update({ displayMode: v }), setGradientEnabled: (v) => update({ gradientEnabled: v }), setGradientPreset: (v) => update({ gradientPreset: v }), setMotion: (v) => update({ motion: v }), setAccent: (v) => update({ accent: v }), setDensity: (v) => update({ density: v }), setFontScale: (v) => update({ fontScale: v }), setDesignStyle: (v) => update({ designStyle: v }), toggleDisplayMode, resetToDefaults, theme: displayMode, resolvedTheme: resolvedDisplayMode, designStyleLegacy: "modern-spatial", design: "modern-spatial", setTheme: (v) => update({ displayMode: v }), toggleTheme: toggleDisplayMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme() { const ctx = useContext(ThemeContext); if (!ctx) throw new Error("useTheme must be used within a ThemeProvider"); return ctx; }
