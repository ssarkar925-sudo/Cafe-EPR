"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type DisplayMode = "light" | "dark" | "system";
export type GradientPreset = "aurora" | "ocean-luxe" | "royal" | "sunset-luxe" | "emerald-luxe" | "cosmic";
export type MotionMode = "on" | "off";
export type AccentColor = "blue" | "emerald" | "violet" | "amber" | "rose" | "cyan";
export type DensityMode = "comfortable" | "compact";
export type FontScale = "standard" | "large";

// Backward compatibility alias
export type Theme = DisplayMode;

export interface AccentOption {
  key: AccentColor;
  label: string;
  colorHex: string;
  ringClass: string;
  badgeClass: string;
  primaryClass: string;
}

export const ACCENT_PALETTES: AccentOption[] = [
  {
    key: "blue",
    label: "Ocean Sapphire",
    colorHex: "#2563eb",
    ringClass: "ring-blue-500/20",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    primaryClass: "bg-blue-600 hover:bg-blue-700 text-white",
  },
  {
    key: "emerald",
    label: "Emerald Mint",
    colorHex: "#059669",
    ringClass: "ring-emerald-500/20",
    badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    primaryClass: "bg-emerald-600 hover:bg-emerald-700 text-white",
  },
  {
    key: "violet",
    label: "Royal Violet",
    colorHex: "#7c3aed",
    ringClass: "ring-violet-500/20",
    badgeClass: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
    primaryClass: "bg-violet-600 hover:bg-violet-700 text-white",
  },
  {
    key: "amber",
    label: "Sunset Amber",
    colorHex: "#d97706",
    ringClass: "ring-amber-500/20",
    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    primaryClass: "bg-amber-600 hover:bg-amber-700 text-white",
  },
  {
    key: "rose",
    label: "Crimson Rose",
    colorHex: "#e11d48",
    ringClass: "ring-rose-500/20",
    badgeClass: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
    primaryClass: "bg-rose-600 hover:bg-rose-700 text-white",
  },
  {
    key: "cyan",
    label: "Electric Cyan",
    colorHex: "#0891b2",
    ringClass: "ring-cyan-500/20",
    badgeClass: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
    primaryClass: "bg-cyan-600 hover:bg-cyan-700 text-white",
  },
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
  {
    id: "aurora",
    name: "Aurora",
    mood: "Sapphire Blue, Violet & Cyan",
    primaryName: "Sapphire Blue",
    secondaryName: "Violet",
    highlightName: "Cyan",
    primary: "#2563eb",
    secondary: "#7c3aed",
    highlight: "#06b6d4",
    previewBg: "from-blue-600/30 via-violet-600/30 to-cyan-500/30",
  },
  {
    id: "ocean-luxe",
    name: "Ocean Luxe",
    mood: "Deep Blue, Teal & Cyan",
    primaryName: "Deep Blue",
    secondaryName: "Teal",
    highlightName: "Cyan",
    primary: "#1d4ed8",
    secondary: "#0d9488",
    highlight: "#06b6d4",
    previewBg: "from-blue-700/30 via-teal-600/30 to-cyan-500/30",
  },
  {
    id: "royal",
    name: "Royal",
    mood: "Indigo, Violet & Soft Blue",
    primaryName: "Indigo",
    secondaryName: "Violet",
    highlightName: "Soft Blue",
    primary: "#4f46e5",
    secondary: "#9333ea",
    highlight: "#38bdf8",
    previewBg: "from-indigo-600/30 via-purple-600/30 to-sky-400/30",
  },
  {
    id: "sunset-luxe",
    name: "Sunset Luxe",
    mood: "Amber, Rose & Violet",
    primaryName: "Amber",
    secondaryName: "Rose",
    highlightName: "Violet",
    primary: "#d97706",
    secondary: "#e11d48",
    highlight: "#8b5cf6",
    previewBg: "from-amber-500/30 via-rose-500/30 to-purple-600/30",
  },
  {
    id: "emerald-luxe",
    name: "Emerald Luxe",
    mood: "Emerald, Teal & Cyan",
    primaryName: "Emerald",
    secondaryName: "Teal",
    highlightName: "Cyan",
    primary: "#059669",
    secondary: "#0d9488",
    highlight: "#06b6d4",
    previewBg: "from-emerald-600/30 via-teal-600/30 to-cyan-500/30",
  },
  {
    id: "cosmic",
    name: "Cosmic",
    mood: "Deep Violet, Blue & Magenta",
    primaryName: "Deep Violet",
    secondaryName: "Blue",
    highlightName: "Magenta",
    primary: "#6d28d9",
    secondary: "#2563eb",
    highlight: "#d946ef",
    previewBg: "from-purple-700/30 via-blue-600/30 to-fuchsia-500/30",
  },
];

const DISPLAY_MODE_KEY = "sccomm-display-mode";
const LEGACY_THEME_KEY = "sccomm-theme";
const GRADIENT_ENABLED_KEY = "sccomm-gradient-enabled";
const GRADIENT_PRESET_KEY = "sccomm-gradient-preset";
const MOTION_KEY = "sccomm-motion-enabled";
const ACCENT_KEY = "sccomm-accent";
const DENSITY_KEY = "sccomm-density";
const FONT_SCALE_KEY = "sccomm-font-scale";

interface ThemeContextValue {
  displayMode: DisplayMode;
  resolvedDisplayMode: "light" | "dark";
  gradientEnabled: boolean;
  gradientPreset: GradientPreset;
  motion: MotionMode;
  accent: AccentColor;
  density: DensityMode;
  fontScale: FontScale;
  setDisplayMode: (m: DisplayMode) => void;
  setGradientEnabled: (enabled: boolean) => void;
  setGradientPreset: (p: GradientPreset) => void;
  setMotion: (m: MotionMode) => void;
  setAccent: (a: AccentColor) => void;
  setDensity: (d: DensityMode) => void;
  setFontScale: (f: FontScale) => void;
  toggleDisplayMode: () => void;
  resetToDefaults: () => void;

  // Compatibility aliases
  theme: DisplayMode;
  resolvedTheme: "light" | "dark";
  designStyle: "modern-spatial";
  design: "modern-spatial";
  setTheme: (t: DisplayMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function getStoredDisplayMode(): DisplayMode {
  if (typeof window === "undefined") return "system";
  // Auto-migrate old values
  const stored = (localStorage.getItem(DISPLAY_MODE_KEY) || localStorage.getItem(LEGACY_THEME_KEY)) as string | null;
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

export function getStoredGradientEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem(GRADIENT_ENABLED_KEY);
  if (stored !== null) return stored === "true";
  return true; // enabled by default
}

export function getStoredGradientPreset(): GradientPreset {
  if (typeof window === "undefined") return "aurora";
  const stored = localStorage.getItem(GRADIENT_PRESET_KEY) as GradientPreset | null;
  return GRADIENT_PRESETS.some((p) => p.id === stored) ? (stored as GradientPreset) : "aurora";
}

export function getStoredMotion(): MotionMode {
  if (typeof window === "undefined") return "on";
  return localStorage.getItem(MOTION_KEY) === "off" ? "off" : "on";
}

export function getStoredAccent(): AccentColor {
  if (typeof window === "undefined") return "blue";
  const stored = localStorage.getItem(ACCENT_KEY) as AccentColor | null;
  return ACCENT_PALETTES.some((p) => p.key === stored) ? (stored as AccentColor) : "blue";
}

export function getStoredDensity(): DensityMode {
  if (typeof window === "undefined") return "comfortable";
  return localStorage.getItem(DENSITY_KEY) === "compact" ? "compact" : "comfortable";
}

export function getStoredFontScale(): FontScale {
  if (typeof window === "undefined") return "standard";
  return localStorage.getItem(FONT_SCALE_KEY) === "large" ? "large" : "standard";
}

export function applyTheme(
  displayMode: DisplayMode,
  gradientEnabled: boolean = true,
  gradientPreset: GradientPreset = "aurora",
  motion: MotionMode = "on",
  accent: AccentColor = "blue",
  density: DensityMode = "comfortable",
  fontScale: FontScale = "standard"
) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const isDark =
    displayMode === "dark" ||
    (displayMode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  root.classList.toggle("dark", isDark);
  root.setAttribute("data-display-mode", isDark ? "dark" : "light");
  root.setAttribute("data-theme", isDark ? "dark" : "light");
  root.setAttribute("data-design-style", "modern-spatial");
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
export const setTheme = (displayMode: DisplayMode) => {
  try {
    localStorage.setItem(DISPLAY_MODE_KEY, displayMode);
    localStorage.setItem(LEGACY_THEME_KEY, displayMode);
  } catch {}
  applyTheme(
    displayMode,
    getStoredGradientEnabled(),
    getStoredGradientPreset(),
    getStoredMotion(),
    getStoredAccent(),
    getStoredDensity(),
    getStoredFontScale()
  );
};

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [displayMode, setDisplayModeState] = useState<DisplayMode>("system");
  const [gradientEnabled, setGradientEnabledState] = useState<boolean>(true);
  const [gradientPreset, setGradientPresetState] = useState<GradientPreset>("aurora");
  const [motion, setMotionState] = useState<MotionMode>("on");
  const [accent, setAccentState] = useState<AccentColor>("blue");
  const [density, setDensityState] = useState<DensityMode>("comfortable");
  const [fontScale, setFontScaleState] = useState<FontScale>("standard");
  const [resolvedDisplayMode, setResolvedDisplayMode] = useState<"light" | "dark">("light");

  useEffect(() => {
    // Auto-migrate legacy storage
    try {
      if (localStorage.getItem("sccomm-design-style") === "classic") {
        localStorage.removeItem("sccomm-design-style");
      }
    } catch {}

    const m = getStoredDisplayMode();
    const grad = getStoredGradientEnabled();
    const preset = getStoredGradientPreset();
    const mot = getStoredMotion();
    const a = getStoredAccent();
    const d = getStoredDensity();
    const f = getStoredFontScale();

    setDisplayModeState(m);
    setGradientEnabledState(grad);
    setGradientPresetState(preset);
    setMotionState(mot);
    setAccentState(a);
    setDensityState(d);
    setFontScaleState(f);

    const dark =
      m === "dark" || (m === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setResolvedDisplayMode(dark ? "dark" : "light");
    applyTheme(m, grad, preset, mot, a, d, f);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (getStoredDisplayMode() === "system") {
        const isD = mq.matches;
        setResolvedDisplayMode(isD ? "dark" : "light");
        applyTheme("system", getStoredGradientEnabled(), getStoredGradientPreset(), getStoredMotion(), getStoredAccent(), getStoredDensity(), getStoredFontScale());
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function handleSetDisplayMode(next: DisplayMode) {
    setDisplayModeState(next);
    const dark =
      next === "dark" || (next === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setResolvedDisplayMode(dark ? "dark" : "light");
    try {
      localStorage.setItem(DISPLAY_MODE_KEY, next);
      localStorage.setItem(LEGACY_THEME_KEY, next);
    } catch {}
    applyTheme(next, gradientEnabled, gradientPreset, motion, accent, density, fontScale);
  }

  function handleSetGradientEnabled(enabled: boolean) {
    setGradientEnabledState(enabled);
    try {
      localStorage.setItem(GRADIENT_ENABLED_KEY, String(enabled));
    } catch {}
    applyTheme(displayMode, enabled, gradientPreset, motion, accent, density, fontScale);
  }

  function handleSetGradientPreset(preset: GradientPreset) {
    setGradientPresetState(preset);
    try {
      localStorage.setItem(GRADIENT_PRESET_KEY, preset);
    } catch {}
    applyTheme(displayMode, gradientEnabled, preset, motion, accent, density, fontScale);
  }

  function handleSetMotion(next: MotionMode) {
    setMotionState(next);
    try {
      localStorage.setItem(MOTION_KEY, next);
    } catch {}
    applyTheme(displayMode, gradientEnabled, gradientPreset, next, accent, density, fontScale);
  }

  function handleSetAccent(next: AccentColor) {
    setAccentState(next);
    try {
      localStorage.setItem(ACCENT_KEY, next);
    } catch {}
    applyTheme(displayMode, gradientEnabled, gradientPreset, motion, next, density, fontScale);
  }

  function handleSetDensity(next: DensityMode) {
    setDensityState(next);
    try {
      localStorage.setItem(DENSITY_KEY, next);
    } catch {}
    applyTheme(displayMode, gradientEnabled, gradientPreset, motion, accent, next, fontScale);
  }

  function handleSetFontScale(next: FontScale) {
    setFontScaleState(next);
    try {
      localStorage.setItem(FONT_SCALE_KEY, next);
    } catch {}
    applyTheme(displayMode, gradientEnabled, gradientPreset, motion, accent, density, next);
  }

  function toggleDisplayMode() {
    const next: DisplayMode = resolvedDisplayMode === "dark" ? "light" : "dark";
    handleSetDisplayMode(next);
  }

  function resetToDefaults() {
    const nextMode: DisplayMode = "system";
    const nextGrad = true;
    const nextPreset: GradientPreset = "aurora";
    const nextMotion: MotionMode = "on";
    const nextAccent: AccentColor = "blue";
    const nextDensity: DensityMode = "comfortable";
    const nextFontScale: FontScale = "standard";

    setDisplayModeState(nextMode);
    setGradientEnabledState(nextGrad);
    setGradientPresetState(nextPreset);
    setMotionState(nextMotion);
    setAccentState(nextAccent);
    setDensityState(nextDensity);
    setFontScaleState(nextFontScale);
    setResolvedDisplayMode(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

    try {
      localStorage.setItem(DISPLAY_MODE_KEY, nextMode);
      localStorage.setItem(LEGACY_THEME_KEY, nextMode);
      localStorage.setItem(GRADIENT_ENABLED_KEY, String(nextGrad));
      localStorage.setItem(GRADIENT_PRESET_KEY, nextPreset);
      localStorage.setItem(MOTION_KEY, nextMotion);
      localStorage.setItem(ACCENT_KEY, nextAccent);
      localStorage.setItem(DENSITY_KEY, nextDensity);
      localStorage.setItem(FONT_SCALE_KEY, nextFontScale);
      localStorage.removeItem("sccomm-design-style");
    } catch {}
    applyTheme(nextMode, nextGrad, nextPreset, nextMotion, nextAccent, nextDensity, nextFontScale);
  }

  return (
    <ThemeContext.Provider
      value={{
        displayMode,
        resolvedDisplayMode,
        gradientEnabled,
        gradientPreset,
        motion,
        accent,
        density,
        fontScale,
        setDisplayMode: handleSetDisplayMode,
        setGradientEnabled: handleSetGradientEnabled,
        setGradientPreset: handleSetGradientPreset,
        setMotion: handleSetMotion,
        setAccent: handleSetAccent,
        setDensity: handleSetDensity,
        setFontScale: handleSetFontScale,
        toggleDisplayMode,
        resetToDefaults,

        // Aliases
        theme: displayMode,
        resolvedTheme: resolvedDisplayMode,
        designStyle: "modern-spatial",
        design: "modern-spatial",
        setTheme: handleSetDisplayMode,
        toggleTheme: toggleDisplayMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
