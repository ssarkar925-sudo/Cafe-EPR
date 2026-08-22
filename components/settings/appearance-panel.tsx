"use client";

import { useTheme, ACCENT_PALETTES, type Theme, type AccentColor, type DensityMode, type FontScale } from "@/components/theme-provider";
import SettingsSection from "@/components/settings/settings-section";

export default function AppearancePanel({ active }: { active: boolean }) {
  const {
    theme,
    resolvedTheme,
    accent,
    density,
    fontScale,
    setTheme,
    setAccent,
    setDensity,
    setFontScale,
    resetToDefaults,
  } = useTheme();

  const activePalette = ACCENT_PALETTES.find((p) => p.key === accent) || ACCENT_PALETTES[0];

  return (
    <div className={active ? "mt-6 space-y-8" : "hidden"}>
      {/* 1. Theme Display Mode */}
      <SettingsSection
        icon="M12 3a9 9 0 1 0 0 18V3ZM12 3a9 9 0 0 1 9 9h-9V3Z"
        tone="amber"
        title="Display Mode & Theme"
        desc="Choose your preferred color theme or sync automatically with your operating system."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(
            [
              {
                key: "light",
                label: "Light Mode",
                desc: "Crisp & bright for daytime counter billing",
                icon: "M12 3v2m0 14v2M5.6 5.6l1.4 1.4m9.9 9.9 1.4 1.4M3 12h2m14 0h2M5.6 18.4l1.4-1.4m9.9-9.9 1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
                previewBg: "bg-slate-50 border-slate-200",
                previewCard: "bg-white border-slate-200 text-slate-900",
              },
              {
                key: "dark",
                label: "Dark Mode",
                desc: "Deep obsidian dark, easy on the eyes",
                icon: "M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z",
                previewBg: "bg-[#0b1120] border-slate-800",
                previewCard: "bg-[#0f172a] border-slate-800 text-white",
              },
              {
                key: "system",
                label: "System Auto-Sync",
                desc: "Automatically adapts to your device schedule",
                icon: "M12 3a9 9 0 0 0 0 18c.5-2 .5-3.5 0-5a4.5 4.5 0 0 1 0-8c.5-1.5.5-3 0-5ZM3.5 12h17",
                previewBg: "bg-gradient-to-r from-slate-100 to-[#0b1120] border-slate-300",
                previewCard: "bg-white/90 border-slate-200 text-slate-900",
              },
            ] as const
          ).map((m) => {
            const isSelected = theme === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setTheme(m.key)}
                className={`group relative flex flex-col items-start rounded-2xl border p-4 text-left transition ${
                  isSelected
                    ? "border-blue-500 bg-blue-50/50 shadow-md ring-2 ring-blue-500/20 dark:bg-blue-950/20 dark:border-blue-500"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-white/5"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${
                      isSelected
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"
                    }`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                      <path d={m.icon} />
                    </svg>
                  </div>
                  {isSelected && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                  )}
                </div>

                <span className="mt-3 text-sm font-bold text-slate-900 dark:text-white">
                  {m.label}
                </span>
                <span className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {m.desc}
                </span>
              </button>
            );
          })}
        </div>
      </SettingsSection>

      {/* 2. Brand Accent Color Palette */}
      <SettingsSection
        icon="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"
        tone="blue"
        title="Brand Accent Palette"
        desc="Choose your primary accent color for active navigation badges, buttons, and glowing highlights."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {ACCENT_PALETTES.map((p) => {
            const isSelected = accent === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setAccent(p.key)}
                className={`flex flex-col items-center gap-2.5 rounded-2xl border p-4 text-center transition ${
                  isSelected
                    ? "border-slate-900 bg-slate-50 shadow-md ring-2 ring-slate-900/10 dark:border-white dark:bg-white/10"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-white/5"
                }`}
              >
                <div
                  className="relative flex h-10 w-10 items-center justify-center rounded-full shadow-inner transition group-hover:scale-105"
                  style={{ backgroundColor: p.colorHex }}
                >
                  {isSelected && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 drop-shadow-md">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {p.label.split(" ")[0]}
                </span>
              </button>
            );
          })}
        </div>
      </SettingsSection>

      {/* 3. Display Density & Font Scaling */}
      <SettingsSection
        icon="M4 6h16M4 12h16M4 18h16"
        tone="violet"
        title="Interface Density & Readability"
        desc="Customize table spacing and text scaling for counter POS touchscreens or high-volume data."
      >
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Density */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
              Row Spacing Density
            </label>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
              <button
                type="button"
                onClick={() => setDensity("comfortable")}
                className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition ${
                  density === "comfortable"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                <span>📱 Comfortable (Default)</span>
              </button>
              <button
                type="button"
                onClick={() => setDensity("compact")}
                className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition ${
                  density === "compact"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                <span>⚡ High Density (POS)</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              High density fits more invoice rows and transactions on POS counter screens.
            </p>
          </div>

          {/* Font Scaling */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
              Typography Size Scale
            </label>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
              <button
                type="button"
                onClick={() => setFontScale("standard")}
                className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition ${
                  fontScale === "standard"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                <span>100% Standard</span>
              </button>
              <button
                type="button"
                onClick={() => setFontScale("large")}
                className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition ${
                  fontScale === "large"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                <span>110% Large &amp; Clear</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Large font scale increases contrast and number sizes for kiosk and tablet displays.
            </p>
          </div>
        </div>
      </SettingsSection>

      {/* 4. Live Interactive Theme Preview */}
      <SettingsSection
        icon="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
        tone="emerald"
        title="Live Interactive Preview"
        desc="Preview how your custom theme, accent palette, and density look in real time."
      >
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-white/5">
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-3 w-3 rounded-full animate-pulse"
                style={{ backgroundColor: activePalette.colorHex }}
              />
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                Live POS Counter Preview
              </span>
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                style={{
                  backgroundColor: `${activePalette.colorHex}18`,
                  color: activePalette.colorHex,
                }}
              >
                Active Accent: {activePalette.label.split(" ")[0]}
              </span>
            </div>
            <button
              type="button"
              onClick={resetToDefaults}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-white underline"
            >
              Reset to Factory Defaults
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-white/5 dark:bg-white/5">
              <span className="text-xs text-slate-400">Sample Active Button</span>
              <div className="mt-2">
                <button
                  type="button"
                  className="w-full rounded-xl py-2 px-3 text-xs font-bold text-white shadow-sm transition hover:brightness-110"
                  style={{ backgroundColor: activePalette.colorHex }}
                >
                  ⚡ Record New Sale (₹1,500)
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-white/5 dark:bg-white/5">
              <span className="text-xs text-slate-400">Sample Status Tag</span>
              <div className="mt-2">
                <div
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold"
                  style={{
                    backgroundColor: `${activePalette.colorHex}20`,
                    color: activePalette.colorHex,
                  }}
                >
                  <span>✓ Payment Confirmed</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-white/5 dark:bg-white/5">
              <span className="text-xs text-slate-400">Current Theme State</span>
              <div className="mt-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                Mode: <span className="capitalize text-slate-900 dark:text-white font-bold">{resolvedTheme}</span> ({theme})
              </div>
            </div>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}