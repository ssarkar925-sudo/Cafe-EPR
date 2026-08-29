"use client";

import { useState } from "react";
import {
  useTheme,
  ACCENT_PALETTES,
  GRADIENT_PRESETS,
  type Theme,
  type GradientPreset,
  type AccentColor,
  type DensityMode,
  type FontScale,
} from "@/components/theme-provider";
import SettingsSection from "@/components/settings/settings-section";
import { useToast } from "@/components/ui/use-toast";

function SvgIcon({ path, className = "h-5 w-5" }: { path: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

export default function AppearancePanel({ active }: { active: boolean }) {
  const {
    theme,
    resolvedTheme,
    gradientPreset,
    accent,
    density,
    fontScale,
    setTheme,
    setGradientPreset,
    setAccent,
    setDensity,
    setFontScale,
    resetToDefaults,
  } = useTheme();

  const { showToast, toastView } = useToast();
  const [soundFeedback, setSoundFeedback] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("sccomm-sound-feedback") !== "false";
  });
  const [autoPrintThermal, setAutoPrintThermal] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sccomm-autoprint-thermal") === "true";
  });
  const [highContrast, setHighContrast] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sccomm-high-contrast") === "true";
  });

  const activeAccent = ACCENT_PALETTES.find((p) => p.key === accent) || ACCENT_PALETTES[0];

  function toggleSound() {
    const next = !soundFeedback;
    setSoundFeedback(next);
    try {
      localStorage.setItem("sccomm-sound-feedback", String(next));
      showToast("success", next ? "Audio feedback enabled" : "Audio feedback muted");
    } catch {}
  }

  function toggleAutoPrint() {
    const next = !autoPrintThermal;
    setAutoPrintThermal(next);
    try {
      localStorage.setItem("sccomm-autoprint-thermal", String(next));
      showToast("success", next ? "Instant auto-print enabled on sale" : "Auto-print disabled");
    } catch {}
  }

  function toggleHighContrast() {
    const next = !highContrast;
    setHighContrast(next);
    try {
      localStorage.setItem("sccomm-high-contrast", String(next));
      document.documentElement.classList.toggle("contrast-more", next);
      showToast("success", next ? "High contrast enabled" : "High contrast disabled");
    } catch {}
  }

  return (
    <div className={active ? "mt-6 space-y-6" : "hidden"}>
      {/* 1. Live Interactive Spatial UI Preview */}
      <section className="bento-surface overflow-hidden p-5 dark:bg-slate-900/90">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <span className="icon-box-3d flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/20">
              <SvgIcon path="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M6.34 17.66l-1.41 1.41 M19.07 4.93l-1.41 1.41" className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                Live 3D Spatial Interface Preview
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Real-time preview of counter cards, tactile buttons, and badges in your active theme.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-blue-200/80 bg-white/80 px-2.5 py-1 text-[10px] font-bold text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/60 dark:text-blue-300">
              {theme === "gradient"
                ? `✨ Gradient · ${GRADIENT_PRESETS.find((p) => p.id === gradientPreset)?.name || "Aurora"}`
                : resolvedTheme === "dark"
                ? "Dark Workspace"
                : "Light Workspace"}{" "}
              · {activeAccent.label}
            </span>
          </div>
        </div>

        {/* Mini ERP Interactive Sandbox Window */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          {/* Sample Sales Metric Card */}
          <div className="bento-surface-interactive p-4 dark:bg-slate-800/90">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Today&apos;s Revenue</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${activeAccent.badgeClass}`}>
                +14.2%
              </span>
            </div>
            <div className="mt-2 text-xl font-black tracking-tight text-slate-900 dark:text-white">
              ₹ 24,850.00
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>38 Completed Invoices</span>
            </div>
          </div>

          {/* Sample Interactive POS Item */}
          <div className="bento-surface-interactive p-4 dark:bg-slate-800/90">
            <div className="flex items-center justify-between">
              <span className="truncate text-xs font-black text-slate-900 dark:text-white">
                A4 Color Print (Glossy)
              </span>
              <span className="text-xs font-black text-slate-900 dark:text-white">₹15</span>
            </div>
            <p className="mt-1 truncate text-[11px] text-slate-400">Document Printing Service</p>
            <button
              type="button"
              className={`btn-3d-tactile-primary mt-2.5 flex w-full items-center justify-center gap-1.5 py-1.5 text-xs font-black shadow-sm ${activeAccent.primaryClass}`}
            >
              <span>+ Add to POS Cart</span>
            </button>
          </div>

          {/* Sample Receipt / Action Badge */}
          <div className="bento-surface-interactive p-4 dark:bg-slate-800/90">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">WhatsApp Outbox</span>
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <div className="mt-1 text-xs font-black text-slate-800 dark:text-slate-200">
              Invoice #INV-2026-0042
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                80mm Thermal
              </span>
              <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                Delivered ✓
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Core Theme Mode & Accent Palettes */}
      <SettingsSection
        icon="M12 3v18M3 12h18"
        tone="blue"
        title="Display Mode & Studio Accent Palette"
        desc="Switch between Light, Dark, or System mode, and choose your primary action color."
      >
        {/* Theme Radio Cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(["light", "dark", "system", "gradient"] as Theme[]).map((t) => {
            const isSelected = theme === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                className={`group rounded-2xl border p-4 text-left transition duration-200 ${
                  isSelected
                    ? "border-blue-500 bg-blue-50/80 ring-2 ring-blue-500/20 shadow-sm dark:border-blue-500 dark:bg-blue-950/40"
                    : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm dark:border-white/10 dark:bg-slate-900 dark:hover:bg-white/5"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold capitalize text-slate-900 dark:text-white">
                    {t === "system" ? "Auto / System" : t === "gradient" ? "✨ Premium Gradient" : `${t} Mode`}
                  </span>
                  {isSelected && (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white shadow-sm">
                      ✓
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  {t === "system"
                    ? "Syncs automatically with device OS appearance"
                    : t === "gradient"
                    ? "Cinematic dark spatial workstation with ambient multicolor lighting"
                    : t === "dark"
                    ? "OLED high-contrast dark mode for low eye fatigue"
                    : "Crisp, bright white studio canvas for daytime billing"}
                </p>
              </button>
            );
          })}
        </div>

        {/* Premium Gradient Preset Variant Selector (when Gradient or always customizable) */}
        <div className="mt-5 rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 via-violet-500/5 to-cyan-500/5 p-4 dark:border-white/10 dark:bg-white/[0.02]">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-sm">
                ✨
              </span>
              <div>
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Curated Gradient Atmosphere Presets
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Select your ambient colored lighting palette for the Premium Gradient mode.
                </p>
              </div>
            </div>
            {theme !== "gradient" && (
              <button
                type="button"
                onClick={() => setTheme("gradient")}
                className="self-start rounded-xl border border-indigo-200 bg-white px-3 py-1 text-xs font-bold text-indigo-700 shadow-xs hover:bg-indigo-50 dark:border-indigo-900/50 dark:bg-indigo-950/60 dark:text-indigo-300 sm:self-auto"
              >
                Enable Gradient Theme →
              </button>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {GRADIENT_PRESETS.map((preset) => {
              const isSelected = gradientPreset === preset.id && theme === "gradient";
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setGradientPreset(preset.id);
                    if (theme !== "gradient") setTheme("gradient");
                  }}
                  className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-3.5 text-left transition-all duration-200 ${
                    isSelected
                      ? "border-blue-500 bg-white ring-2 ring-blue-500/30 shadow-md dark:border-blue-400 dark:bg-slate-900"
                      : "border-slate-200/90 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm dark:border-white/10 dark:bg-slate-900/80 dark:hover:border-white/20"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-900 dark:text-white">
                        {preset.name}
                      </span>
                      {isSelected && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white shadow-xs">
                          ✓
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {preset.mood}
                    </p>
                  </div>

                  {/* 3-Color Swatch Pill */}
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100/80 pt-2.5 dark:border-white/5">
                    <span className="text-[10px] font-bold text-slate-400">
                      {preset.primaryName} · {preset.secondaryName}
                    </span>
                    <div className="flex items-center -space-x-1">
                      <span
                        className="h-4 w-4 rounded-full border border-white shadow-xs dark:border-slate-900"
                        style={{ backgroundColor: preset.primary }}
                        title={preset.primaryName}
                      />
                      <span
                        className="h-4 w-4 rounded-full border border-white shadow-xs dark:border-slate-900"
                        style={{ backgroundColor: preset.secondary }}
                        title={preset.secondaryName}
                      />
                      <span
                        className="h-4 w-4 rounded-full border border-white shadow-xs dark:border-slate-900"
                        style={{ backgroundColor: preset.highlight }}
                        title={preset.highlightName}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Accent Color Swatches */}
        <div className="mt-5 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.02]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="icon-box-3d flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                <SvgIcon path="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Studio Accent Palette
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Currently active: <strong className="text-slate-800 dark:text-slate-200">{activeAccent.label}</strong>
                </p>
              </div>
            </div>

            {/* Color Swatch Circles */}
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {ACCENT_PALETTES.map((p) => {
                const isSelected = accent === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setAccent(p.key as AccentColor)}
                    aria-label={`Select ${p.label}`}
                    title={p.label}
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-transform duration-150 hover:scale-110 ${
                      isSelected
                        ? "border-slate-950 shadow-md ring-4 ring-slate-950/15 dark:border-white dark:ring-white/20"
                        : "border-transparent"
                    }`}
                  >
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-full shadow-inner"
                      style={{ backgroundColor: p.colorHex }}
                    >
                      {isSelected && <span className="text-xs font-black text-white">✓</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Density & Font Scale Segmented Switches */}
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              Counter Density Mode
            </p>
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100/90 p-1.5 dark:bg-white/5">
              {(["comfortable", "compact"] as DensityMode[]).map((d) => {
                const isCurrent = density === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDensity(d)}
                    className={`rounded-xl py-2.5 text-xs font-bold capitalize transition ${
                      isCurrent
                        ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                        : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    }`}
                  >
                    {d} {d === "compact" ? "(Fast POS)" : "(Spacious)"}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              Interface Font Scaling
            </p>
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100/90 p-1.5 dark:bg-white/5">
              {(["standard", "large"] as FontScale[]).map((f) => {
                const isCurrent = fontScale === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFontScale(f)}
                    className={`rounded-xl py-2.5 text-xs font-bold capitalize transition ${
                      isCurrent
                        ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                        : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    }`}
                  >
                    {f === "standard" ? "Standard (100%)" : "Large (106%)"}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* 3. Counter Ergonomics & Feedback Preferences */}
      <SettingsSection
        icon="M11 5L6 9H2v6h4l5 4V5z M19.07 4.93a10 10 0 0 1 0 14.14 M15.54 8.46a5 5 0 0 1 0 7.07"
        tone="emerald"
        title="Counter Ergonomics & Hardware Preferences"
        desc="Operational controls for high-speed counter billing and sunlight readability."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Beep Toggle */}
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-800/80">
            <div>
              <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                Audio Feedback Chimes
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Play soft chime on barcode scan and successful checkout
              </p>
            </div>
            <button
              type="button"
              onClick={toggleSound}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                soundFeedback ? "bg-emerald-600" : "bg-slate-200 dark:bg-slate-700"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  soundFeedback ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Auto Print Toggle */}
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-800/80">
            <div>
              <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                Instant Auto-Print
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Trigger thermal print window immediately upon finalizing invoice
              </p>
            </div>
            <button
              type="button"
              onClick={toggleAutoPrint}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                autoPrintThermal ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  autoPrintThermal ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* High Contrast Mode */}
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-800/80">
            <div>
              <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                High Contrast Mode
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Enhance border stroke widths for outdoor sunlight glare
              </p>
            </div>
            <button
              type="button"
              onClick={toggleHighContrast}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                highContrast ? "bg-violet-600" : "bg-slate-200 dark:bg-slate-700"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  highContrast ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </SettingsSection>

      {/* 4. Reset to Factory Defaults */}
      <div className="flex flex-col gap-4 rounded-[22px] border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-extrabold text-slate-900 dark:text-white">
            Reset Appearance to Factory Default
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Reverts back to Ocean Sapphire accent, Comfortable density, and System theme.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetToDefaults();
            showToast("success", "Appearance settings reset to defaults.");
          }}
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
        >
          Reset Appearance Defaults
        </button>
      </div>

      {toastView}
    </div>
  );
}
