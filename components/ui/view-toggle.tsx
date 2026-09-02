"use client";

import { useEffect, useState } from "react";

export default function ViewToggle({
  value,
  onChange,
  storageKey,
}: {
  value: "cards" | "list";
  onChange: (v: "cards" | "list") => void;
  storageKey: string;
}) {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === "cards" || saved === "list") onChange(saved);
    } catch {
      /* ignore */
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, value);
    } catch {
      /* ignore */
    }
  }, [value, hydrated, storageKey]);

  const btn = (key: "cards" | "list", label: string, path: string) => (
    <button
      type="button"
      onClick={() => onChange(key)}
      title={label}
      aria-label={label}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
        value === key
          ? "bg-white text-slate-900 shadow-xs font-bold dark:bg-slate-800 dark:text-white"
          : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d={path} />
      </svg>
    </button>
  );

  return (
    <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5 border border-slate-200/60 dark:border-white/10">
      {btn(
        "cards",
        "Card view",
        "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"
      )}
      {btn(
        "list",
        "List view",
        "M4 6h16M4 12h16M4 18h16"
      )}
    </div>
  );
}