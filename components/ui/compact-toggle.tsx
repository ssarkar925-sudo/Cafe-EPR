"use client";

import { useEffect, useState } from "react";

export default function CompactToggle({
  value,
  onChange,
  storageKey,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  storageKey: string;
}) {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(storageKey) === "1") onChange(true);
    } catch {
      /* ignore */
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, value ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [value, hydrated, storageKey]);

  return (
    <button
      onClick={() => onChange(!value)}
      title={value ? "Full rows" : "Short rows"}
      aria-label={value ? "Switch to full rows" : "Switch to short rows"}
      aria-pressed={value}
      className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
        value ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900" : "text-slate-500 hover:bg-white hover:text-slate-900"
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4">
        <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    </button>
  );
}