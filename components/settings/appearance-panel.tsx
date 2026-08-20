"use client";

import { useEffect, useState } from "react";
import { getTheme, setTheme, type Theme } from "@/components/theme-provider";
import SettingsSection from "@/components/settings/settings-section";
import { THEMES } from "@/components/settings/settings-config";

export default function AppearancePanel({ active }: { active: boolean }) {
  const [theme, setThemeState] = useState<Theme>(() => getTheme());

  useEffect(() => {
    setThemeState(getTheme());
  }, []);

  function chooseTheme(t: Theme) {
    setThemeState(t);
    setTheme(t);
  }

  return (
    <div className={active ? "mt-6" : "hidden"}>
      <SettingsSection
        icon="M12 3a9 9 0 1 0 0 18V3ZM12 3a9 9 0 0 1 9 9h-9V3Z"
        tone="amber"
        title="Theme"
        desc="Appearance for this browser."
      >
        <div className="grid max-w-md grid-cols-3 gap-3">
          {THEMES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => chooseTheme(t.key)}
              className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition ${
                theme === t.key
                  ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/20"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`h-5 w-5 ${theme === t.key ? "text-blue-600" : "text-slate-500"}`}
              >
                <path d={t.icon} />
              </svg>
              <span className={`text-xs font-medium ${theme === t.key ? "text-blue-700" : "text-slate-700"}`}>{t.label}</span>
              <span className="text-[10px] text-slate-400">{t.hint}</span>
            </button>
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}