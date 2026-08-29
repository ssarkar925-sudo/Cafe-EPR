"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type DisplayMode = "light" | "dark" | "system";
export type DesignStyle = "classic" | "modern" | "premium-gradient";
export type MotionMode = "on" | "off";
export type AccentColor = "blue" | "emerald" | "violet" | "amber" | "rose" | "cyan";
export type DensityMode = "comfortable" | "compact";
export type FontScale = "standard" | "large";

// Backwards compatibility alias
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

export const DESIGN_STYLE_OPTIONS: {
  key: DesignStyle;
  label: string;
  badge: string;
  description: string;
}[] = [
  {
    key: "classic",
    label: "Classic ERP",
    badge: "Clean",
    description: "Traditional high-efficiency business interface with crisp contrast and solid surfaces.",
  },
  {
    key: "modern",
    label: "Modern Spatial",
    badge: "Contemporary",
    description: "Elevated macOS-inspired spatial workstation with subtle borders and smooth geometry.",
  },
  {
    key: "premium-gradient",
    label: "✨ Premium Gradient",
    badge: "Cinematic",
    description: "Multicolor ambient illumination (Royal Violet → Blue → Cyan → Pink) in both Light and Dark modes.",
  },
];

const DISPLAY_MODE_KEY = "sccomm-display-mode";
const LEGACY_THEME_KEY = "sccomm-theme";
const DESIGN_STYLE_KEY = "sccomm-design-style";
const MOTION_KEY = "sccomm-motion-enabled";
const ACCENT_KEY = "sccomm-accent";
const DENSITY_KEY = "sccomm-density";
const FONT_SCALE_KEY = "sccomm-font-scale";

interface ThemeContextValue {
  displayMode: DisplayMode;
  resolvedDisplayMode: "light" | "dark";
  designStyle: DesignStyle;
  motion: MotionMode;
  accent: AccentColor;
  density: DensityMode;
  fontScale: FontScale;
  setDisplayMode: (m: DisplayMode) => void;
  setDesignStyle: (s: DesignStyle) => void;
  setMotion: (m: MotionMode) => void;
  setAccent: (a: AccentColor) => void;
  setDensity: (d: DensityMode) => void;
  setFontScale: (f: FontScale) => void;
  toggleDisplayMode: () => void;
  resetToDefaults: () => void;

  // Compatibility aliases
  theme: DisplayMode;
  resolvedTheme: "light" | "dark";
  design: DesignStyle;
  setTheme: (t: DisplayMode) => void;
  setDesign: (s: DesignStyle) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function getStoredDisplayMode(): DisplayMode {
  if (typeof window === "undefined") return "system";
  const stored = (localStorage.getItem(DISPLAY_MODE_KEY) || localStorage.getItem(LEGACY_THEME_KEY)) as string | null;
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  if (stored === "gradient") return "dark"; // migrate old gradient theme mode
  return "system";
}

export function getStoredDesignStyle(): DesignStyle {
  if (typeof window === "undefined") return "premium-gradient";
  const stored = localStorage.getItem(DESIGN_STYLE_KEY) as DesignStyle | null;
  if (stored === "classic" || stored === "modern" || stored === "premium-gradient") return stored;
  // If legacy theme was gradient, default to premium-gradient design style
  const legacyTheme = localStorage.getItem(LEGACY_THEME_KEY);
  if (legacyTheme === "gradient") return "premium-gradient";
  return "premium-gradient";
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
  designStyle: DesignStyle = "premium-gradient",
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
  root.setAttribute("data-design-style", designStyle);
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
    getStoredDesignStyle(),
    getStoredMotion(),
    getStoredAccent(),
    getStoredDensity(),
    getStoredFontScale()
  );
};

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [displayMode, setDisplayModeState] = useState<DisplayMode>("system");
  const [designStyle, setDesignStyleState] = useState<DesignStyle>("premium-gradient");
  const [motion, setMotionState] = useState<MotionMode>("on");
  const [accent, setAccentState] = useState<AccentColor>("blue");
  const [density, setDensityState] = useState<DensityMode>("comfortable");
  const [fontScale, setFontScaleState] = useState<FontScale>("standard");
  const [resolvedDisplayMode, setResolvedDisplayMode] = useState<"light" | "dark">("light");

  useEffect(() => {
    const m = getStoredDisplayMode();
    const s = getStoredDesignStyle();
    const mot = getStoredMotion();
    const a = getStoredAccent();
    const d = getStoredDensity();
    const f = getStoredFontScale();

    setDisplayModeState(m);
    setDesignStyleState(s);
    setMotionState(mot);
    setAccentState(a);
    setDensityState(d);
    setFontScaleState(f);

    const dark =
      m === "dark" || (m === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setResolvedDisplayMode(dark ? "dark" : "light");
    applyTheme(m, s, mot, a, d, f);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (getStoredDisplayMode() === "system") {
        setResolvedDisplayMode(mq.matches ? "dark" : "light");
        applyTheme(
          "system",
          getStoredDesignStyle(),
          getStoredMotion(),
          getStoredAccent(),
          getStoredDensity(),
          getStoredFontScale()
        );
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function handleSetDisplayMode(next: DisplayMode) {
    setDisplayModeState(next);
    try {
      localStorage.setItem(DISPLAY_MODE_KEY, next);
      localStorage.setItem(LEGACY_THEME_KEY, next);
    } catch {}
    const dark =
      next === "dark" || (next === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setResolvedDisplayMode(dark ? "dark" : "light");
    applyTheme(next, designStyle, motion, accent, density, fontScale);
  }

  function handleSetDesignStyle(next: DesignStyle) {
    setDesignStyleState(next);
    try {
      localStorage.setItem(DESIGN_STYLE_KEY, next);
    } catch {}
    applyTheme(displayMode, next, motion, accent, density, fontScale);
  }

  function handleSetMotion(next: MotionMode) {
    setMotionState(next);
    try {
      localStorage.setItem(MOTION_KEY, next);
    } catch {}
    applyTheme(displayMode, designStyle, next, accent, density, fontScale);
  }

  function handleSetAccent(next: AccentColor) {
    setAccentState(next);
    try {
      localStorage.setItem(ACCENT_KEY, next);
    } catch {}
    applyTheme(displayMode, designStyle, motion, next, density, fontScale);
  }

  function handleSetDensity(next: DensityMode) {
    setDensityState(next);
    try {
      localStorage.setItem(DENSITY_KEY, next);
    } catch {}
    applyTheme(displayMode, designStyle, motion, accent, next, fontScale);
  }

  function handleSetFontScale(next: FontScale) {
    setFontScaleState(next);
    try {
      localStorage.setItem(FONT_SCALE_KEY, next);
    } catch {}
    applyTheme(displayMode, designStyle, motion, accent, density, next);
  }

  function toggleDisplayMode() {
    const next: DisplayMode = resolvedDisplayMode === "dark" ? "light" : "dark";
    handleSetDisplayMode(next);
  }

  function resetToDefaults() {
    const nextMode: DisplayMode = "system";
    const nextStyle: DesignStyle = "premium-gradient";
    const nextMotion: MotionMode = "on";
    const nextAccent: AccentColor = "blue";
    const nextDensity: DensityMode = "comfortable";
    const nextFontScale: FontScale = "standard";

    setDisplayModeState(nextMode);
    setDesignStyleState(nextStyle);
    setMotionState(nextMotion);
    setAccentState(nextAccent);
    setDensityState(nextDensity);
    setFontScaleState(nextFontScale);
    setResolvedDisplayMode(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

    try {
      localStorage.setItem(DISPLAY_MODE_KEY, nextMode);
      localStorage.setItem(LEGACY_THEME_KEY, nextMode);
      localStorage.setItem(DESIGN_STYLE_KEY, nextStyle);
      localStorage.setItem(MOTION_KEY, nextMotion);
      localStorage.setItem(ACCENT_KEY, nextAccent);
      localStorage.setItem(DENSITY_KEY, nextDensity);
      localStorage.setItem(FONT_SCALE_KEY, nextFontScale);
    } catch {}
    applyTheme(nextMode, nextStyle, nextMotion, nextAccent, nextDensity, nextFontScale);
  }

  return (
    <ThemeContext.Provider
      value={{
        displayMode,
        resolvedDisplayMode,
        designStyle,
        motion,
        accent,
        density,
        fontScale,
        setDisplayMode: handleSetDisplayMode,
        setDesignStyle: handleSetDesignStyle,
        setMotion: handleSetMotion,
        setAccent: handleSetAccent,
        setDensity: handleSetDensity,
        setFontScale: handleSetFontScale,
        toggleDisplayMode,
        resetToDefaults,

        // Aliases
        theme: displayMode,
        resolvedTheme: resolvedDisplayMode,
        design: designStyle,
        setTheme: handleSetDisplayMode,
        setDesign: handleSetDesignStyle,
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


