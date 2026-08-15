"use client";

import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

const KEY = "sccomm-theme";

export function getTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const stored = localStorage.getItem(KEY) as Theme | null;
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
  applyTheme(theme);
}

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme] = useState<Theme>(() => getTheme());

  useEffect(() => {
    applyTheme(theme);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (getTheme() === "system") applyTheme("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  return <>{children}</>;
}
