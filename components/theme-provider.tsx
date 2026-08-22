"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";
export type AccentColor = "blue" | "emerald" | "violet" | "amber" | "rose" | "cyan";
export type DensityMode = "comfortable" | "compact";
export type FontScale = "standard" | "large";

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
    label: "Ocean Sapphire (Default)",
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

const THEME_KEY = "sccomm-theme";
const ACCENT_KEY = "sccomm-accent";
const DENSITY_KEY = "sccomm-density";
const FONT_SCALE_KEY = "sccomm-font-scale";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  accent: AccentColor;
  density: DensityMode;
  fontScale: FontScale;
  setTheme: (t: Theme) => void;
  setAccent: (a: AccentColor) => void;
  setDensity: (d: DensityMode) => void;
  setFontScale: (f: FontScale) => void;
  toggleTheme: () => void;
  resetToDefaults: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const stored = localStorage.getItem(THEME_KEY) as Theme | null;
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

export function getStoredAccent(): AccentColor {
  if (typeof window === "undefined") return "blue";
  const stored = localStorage.getItem(ACCENT_KEY) as AccentColor | null;
  return ACCENT_PALETTES.some((p) => p.key === stored) ? (stored as AccentColor) : "blue";
}

export function getStoredDensity(): DensityMode {
  if (typeof window === "undefined") return "comfortable";
  const stored = localStorage.getItem(DENSITY_KEY) as DensityMode | null;
  return stored === "compact" ? "compact" : "comfortable";
}

export function getStoredFontScale(): FontScale {
  if (typeof window === "undefined") return "standard";
  const stored = localStorage.getItem(FONT_SCALE_KEY) as FontScale | null;
  return stored === "large" ? "large" : "standard";
}

export function applyTheme(
  theme: Theme,
  accent: AccentColor = "blue",
  density: DensityMode = "comfortable",
  fontScale: FontScale = "standard"
) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  // 1. Dark Mode class
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", isDark);

  // 2. Data attributes for styling hooks
  root.setAttribute("data-theme", isDark ? "dark" : "light");
  root.setAttribute("data-accent", accent);
  root.setAttribute("data-density", density);
  root.setAttribute("data-font-scale", fontScale);

  // 3. Density class
  root.classList.toggle("density-compact", density === "compact");
  root.classList.toggle("font-scale-large", fontScale === "large");
}

// Backward compatibility exports
export const getTheme = getStoredTheme;
export const setTheme = (theme: Theme) => {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
  applyTheme(theme, getStoredAccent(), getStoredDensity(), getStoredFontScale());
};

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [accent, setAccentState] = useState<AccentColor>("blue");
  const [density, setDensityState] = useState<DensityMode>("comfortable");
  const [fontScale, setFontScaleState] = useState<FontScale>("standard");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const initialTheme = getStoredTheme();
    const initialAccent = getStoredAccent();
    const initialDensity = getStoredDensity();
    const initialFontScale = getStoredFontScale();

    setThemeState(initialTheme);
    setAccentState(initialAccent);
    setDensityState(initialDensity);
    setFontScaleState(initialFontScale);

    const isDark =
      initialTheme === "dark" ||
      (initialTheme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setResolvedTheme(isDark ? "dark" : "light");

    applyTheme(initialTheme, initialAccent, initialDensity, initialFontScale);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (getStoredTheme() === "system") {
        const dark = mq.matches;
        setResolvedTheme(dark ? "dark" : "light");
        applyTheme("system", getStoredAccent(), getStoredDensity(), getStoredFontScale());
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function handleSetTheme(nextTheme: Theme) {
    setThemeState(nextTheme);
    try {
      localStorage.setItem(THEME_KEY, nextTheme);
    } catch {
      /* ignore */
    }
    const isDark =
      nextTheme === "dark" ||
      (nextTheme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setResolvedTheme(isDark ? "dark" : "light");
    applyTheme(nextTheme, accent, density, fontScale);
  }

  function handleSetAccent(nextAccent: AccentColor) {
    setAccentState(nextAccent);
    try {
      localStorage.setItem(ACCENT_KEY, nextAccent);
    } catch {
      /* ignore */
    }
    applyTheme(theme, nextAccent, density, fontScale);
  }

  function handleSetDensity(nextDensity: DensityMode) {
    setDensityState(nextDensity);
    try {
      localStorage.setItem(DENSITY_KEY, nextDensity);
    } catch {
      /* ignore */
    }
    applyTheme(theme, accent, nextDensity, fontScale);
  }

  function handleSetFontScale(nextFontScale: FontScale) {
    setFontScaleState(nextFontScale);
    try {
      localStorage.setItem(FONT_SCALE_KEY, nextFontScale);
    } catch {
      /* ignore */
    }
    applyTheme(theme, accent, density, nextFontScale);
  }

  function toggleTheme() {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    handleSetTheme(next);
  }

  function resetToDefaults() {
    handleSetTheme("system");
    handleSetAccent("blue");
    handleSetDensity("comfortable");
    handleSetFontScale("standard");
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        accent,
        density,
        fontScale,
        setTheme: handleSetTheme,
        setAccent: handleSetAccent,
        setDensity: handleSetDensity,
        setFontScale: handleSetFontScale,
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
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
