"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system" | "gradient";
export type GradientPreset = "aurora" | "ocean" | "royal" | "sunset" | "emerald" | "cosmic";
export type AccentColor = "blue" | "emerald" | "violet" | "amber" | "rose" | "cyan";
export type DensityMode = "comfortable" | "compact";
export type FontScale = "standard" | "large";
export type DesignStyle = "cafe" | "glass" | "clean" | "midnight" | "organic" | "neon" | "corporate";

export interface AccentOption {
  key: AccentColor;
  label: string;
  colorHex: string;
  ringClass: string;
  badgeClass: string;
  primaryClass: string;
}

export interface GradientPresetOption {
  id: GradientPreset;
  name: string;
  primary: string;
  secondary: string;
  highlight: string;
  primaryName: string;
  secondaryName: string;
  highlightName: string;
  mood: string;
  bgGradient: string;
}

export const GRADIENT_PRESETS: GradientPresetOption[] = [
  {
    id: "aurora",
    name: "Aurora",
    primary: "#2563eb",
    secondary: "#7c3aed",
    highlight: "#06b6d4",
    primaryName: "Sapphire Blue",
    secondaryName: "Violet",
    highlightName: "Cyan",
    mood: "Elegant / futuristic / premium",
    bgGradient: "from-blue-600 via-violet-600 to-cyan-500",
  },
  {
    id: "ocean",
    name: "Ocean Luxe",
    primary: "#0284c7",
    secondary: "#0d9488",
    highlight: "#22d3ee",
    primaryName: "Deep Blue",
    secondaryName: "Teal",
    highlightName: "Cyan",
    mood: "Professional / calm",
    bgGradient: "from-sky-600 via-teal-600 to-cyan-400",
  },
  {
    id: "royal",
    name: "Royal",
    primary: "#4f46e5",
    secondary: "#8b5cf6",
    highlight: "#60a5fa",
    primaryName: "Indigo",
    secondaryName: "Violet",
    highlightName: "Soft Blue",
    mood: "Luxury / sophisticated",
    bgGradient: "from-indigo-600 via-violet-500 to-blue-400",
  },
  {
    id: "sunset",
    name: "Sunset Luxe",
    primary: "#f59e0b",
    secondary: "#e11d48",
    highlight: "#9333ea",
    primaryName: "Amber",
    secondaryName: "Rose",
    highlightName: "Violet",
    mood: "Warm / premium",
    bgGradient: "from-amber-500 via-rose-600 to-purple-600",
  },
  {
    id: "emerald",
    name: "Emerald Luxe",
    primary: "#059669",
    secondary: "#0f766e",
    highlight: "#06b6d4",
    primaryName: "Emerald",
    secondaryName: "Teal",
    highlightName: "Cyan",
    mood: "Financial / natural / professional",
    bgGradient: "from-emerald-600 via-teal-700 to-cyan-500",
  },
  {
    id: "cosmic",
    name: "Cosmic",
    primary: "#6d28d9",
    secondary: "#2563eb",
    highlight: "#d946ef",
    primaryName: "Deep Violet",
    secondaryName: "Blue",
    highlightName: "Magenta",
    mood: "Cinematic / futuristic",
    bgGradient: "from-purple-700 via-blue-600 to-fuchsia-500",
  },
];

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

export const DESIGN_STYLES: {
  key: DesignStyle;
  label: string;
  description: string;
  accent: string;
  page: string;
  surface: string;
  radius: string;
  bestFor: string;
}[] = [
  {
    key: "clean",
    label: "3D Spatial Desktop",
    description: "Authentic macOS-inspired spatial business workstation",
    accent: "#2563eb",
    page: "#f8fafc",
    surface: "#ffffff",
    radius: "20px",
    bestFor: "Enterprise ERP & fast counter operations",
  },
];

const THEME_KEY = "sccomm-theme";
const GRADIENT_PRESET_KEY = "sccomm-gradient-preset";
const ACCENT_KEY = "sccomm-accent";
const DENSITY_KEY = "sccomm-density";
const FONT_SCALE_KEY = "sccomm-font-scale";
const DESIGN_KEY = "sccomm-design";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  gradientPreset: GradientPreset;
  accent: AccentColor;
  density: DensityMode;
  fontScale: FontScale;
  design: DesignStyle;
  setTheme: (t: Theme) => void;
  setGradientPreset: (g: GradientPreset) => void;
  setAccent: (a: AccentColor) => void;
  setDensity: (d: DensityMode) => void;
  setFontScale: (f: FontScale) => void;
  setDesign: (d: DesignStyle) => void;
  toggleTheme: () => void;
  resetToDefaults: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const stored = localStorage.getItem(THEME_KEY) as Theme | null;
  return stored === "light" || stored === "dark" || stored === "system" || stored === "gradient" ? stored : "system";
}

export function getStoredGradientPreset(): GradientPreset {
  if (typeof window === "undefined") return "aurora";
  const stored = localStorage.getItem(GRADIENT_PRESET_KEY) as GradientPreset | null;
  return GRADIENT_PRESETS.some((p) => p.id === stored) ? (stored as GradientPreset) : "aurora";
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

export function getStoredDesign(): DesignStyle {
  return "clean";
}

export function applyTheme(
  theme: Theme,
  gradientPreset: GradientPreset = "aurora",
  accent: AccentColor = "blue",
  density: DensityMode = "comfortable",
  fontScale: FontScale = "standard",
  design: DesignStyle = "clean"
) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const isDark =
    theme === "dark" ||
    theme === "gradient" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  root.classList.toggle("dark", isDark);
  root.setAttribute("data-theme", theme === "gradient" ? "gradient" : isDark ? "dark" : "light");
  root.setAttribute("data-gradient-preset", gradientPreset);
  root.setAttribute("data-accent", accent);
  root.setAttribute("data-density", density);
  root.setAttribute("data-font-scale", fontScale);
  root.classList.toggle("density-compact", density === "compact");
  root.classList.toggle("font-scale-large", fontScale === "large");
}

export const getTheme = getStoredTheme;
export const setTheme = (theme: Theme) => {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
  applyTheme(
    theme,
    getStoredGradientPreset(),
    getStoredAccent(),
    getStoredDensity(),
    getStoredFontScale(),
    getStoredDesign()
  );
};

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [gradientPreset, setGradientPresetState] = useState<GradientPreset>("aurora");
  const [accent, setAccentState] = useState<AccentColor>("blue");
  const [density, setDensityState] = useState<DensityMode>("comfortable");
  const [fontScale, setFontScaleState] = useState<FontScale>("standard");
  const [design, setDesignState] = useState<DesignStyle>("clean");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const t = getStoredTheme();
    const g = getStoredGradientPreset();
    const a = getStoredAccent();
    const d = getStoredDensity();
    const f = getStoredFontScale();
    const s = getStoredDesign();

    setThemeState(t);
    setGradientPresetState(g);
    setAccentState(a);
    setDensityState(d);
    setFontScaleState(f);
    setDesignState(s);

    const dark =
      t === "dark" ||
      t === "gradient" ||
      (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setResolvedTheme(dark ? "dark" : "light");
    applyTheme(t, g, a, d, f, s);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (getStoredTheme() === "system") {
        setResolvedTheme(mq.matches ? "dark" : "light");
        applyTheme(
          "system",
          getStoredGradientPreset(),
          getStoredAccent(),
          getStoredDensity(),
          getStoredFontScale(),
          getStoredDesign()
        );
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function handleSetTheme(next: Theme) {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
    const dark =
      next === "dark" ||
      next === "gradient" ||
      (next === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setResolvedTheme(dark ? "dark" : "light");
    applyTheme(next, gradientPreset, accent, density, fontScale, design);
  }

  function handleSetGradientPreset(next: GradientPreset) {
    setGradientPresetState(next);
    try {
      localStorage.setItem(GRADIENT_PRESET_KEY, next);
    } catch {}
    applyTheme(theme, next, accent, density, fontScale, design);
  }

  function handleSetAccent(next: AccentColor) {
    setAccentState(next);
    try {
      localStorage.setItem(ACCENT_KEY, next);
    } catch {}
    applyTheme(theme, gradientPreset, next, density, fontScale, design);
  }

  function handleSetDensity(next: DensityMode) {
    setDensityState(next);
    try {
      localStorage.setItem(DENSITY_KEY, next);
    } catch {}
    applyTheme(theme, gradientPreset, accent, next, fontScale, design);
  }

  function handleSetFontScale(next: FontScale) {
    setFontScaleState(next);
    try {
      localStorage.setItem(FONT_SCALE_KEY, next);
    } catch {}
    applyTheme(theme, gradientPreset, accent, density, next, design);
  }

  function handleSetDesign(next: DesignStyle) {
    setDesignState(next);
    try {
      localStorage.setItem(DESIGN_KEY, next);
    } catch {}
    applyTheme(theme, gradientPreset, accent, density, fontScale, next);
  }

  function toggleTheme() {
    // Cycles between light, dark, and gradient
    const nextTheme: Theme = resolvedTheme === "dark" ? (theme === "gradient" ? "light" : "dark") : "dark";
    handleSetTheme(nextTheme);
  }

  function resetToDefaults() {
    const nextTheme: Theme = "system";
    const nextGradient: GradientPreset = "aurora";
    const nextAccent: AccentColor = "blue";
    const nextDensity: DensityMode = "comfortable";
    const nextFontScale: FontScale = "standard";
    const nextDesign: DesignStyle = "clean";

    setThemeState(nextTheme);
    setGradientPresetState(nextGradient);
    setAccentState(nextAccent);
    setDensityState(nextDensity);
    setFontScaleState(nextFontScale);
    setDesignState(nextDesign);
    setResolvedTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

    try {
      localStorage.setItem(THEME_KEY, nextTheme);
      localStorage.setItem(GRADIENT_PRESET_KEY, nextGradient);
      localStorage.setItem(ACCENT_KEY, nextAccent);
      localStorage.setItem(DENSITY_KEY, nextDensity);
      localStorage.setItem(FONT_SCALE_KEY, nextFontScale);
      localStorage.setItem(DESIGN_KEY, nextDesign);
    } catch {}
    applyTheme(nextTheme, nextGradient, nextAccent, nextDensity, nextFontScale, nextDesign);
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        gradientPreset,
        accent,
        density,
        fontScale,
        design,
        setTheme: handleSetTheme,
        setGradientPreset: handleSetGradientPreset,
        setAccent: handleSetAccent,
        setDensity: handleSetDensity,
        setFontScale: handleSetFontScale,
        setDesign: handleSetDesign,
        toggleTheme,
        resetToDefaults,
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

