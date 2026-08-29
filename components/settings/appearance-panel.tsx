"use client";

import { useState } from "react";
import {
  useTheme,
  ACCENT_PALETTES,
  DESIGN_STYLES,
  type Theme,
  type AccentColor,
  type DensityMode,
  type FontScale,
  type DesignStyle,
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

const PREVIEWS: Record<DesignStyle, string> = {
  cafe: "bg-[#f7f5ef] border-[#e5d8c5] text-[#2b2118]",
  glass: "bg-gradient-to-br from-violet-50 to-slate-100 border-violet-200 text-slate-800",
  clean: "bg-slate-50 border-slate-200 text-slate-800",
  midnight: "bg-[#080d18] border-slate-700 text-white",
  organic: "bg-[#f5f2e9] border-[#d7ddcf] text-[#35443a]",
  neon: "bg-[#070b12] border-cyan-700/60 text-cyan-50",
  corporate: "bg-slate-100 border-slate-300 text-slate-800",
};

interface QuickPreset {
  id: string;
  name: string;
  desc: string;
  theme: Theme;
  accent: AccentColor;
  density: DensityMode;
  design: DesignStyle;
  badge: string;
}

const QUICK_PRESETS: QuickPreset[] = [
  {
    id: "cafe-classic",
    name: "Café Espresso",
    desc: "Warm ambient espresso tones for coffee shops & cafes",
    theme: "light",
    accent: "amber",
    density: "comfortable",
    design: "cafe",
    badge: "Popular",
  },
  {
    id: "fast-counter",
    name: "Busy POS Desk",
    desc: "High-density compact layout for ultra-fast barcode checkout",
    theme: "light",
    accent: "blue",
    density: "compact",
    design: "clean",
    badge: "Speed",
  },
  {
    id: "midnight-cyber",
    name: "Midnight Cyber",
    desc: "OLED dark mode with neon accents for low-light night shifts",
    theme: "dark",
    accent: "cyan",
    density: "comfortable",
    design: "midnight",
    badge: "Night",
  },
  {
    id: "luxury-glass",
    name: "Luxury Studio",
    desc: "Frosted glassmorphism and royal violet glow",
    theme: "light",
    accent: "violet",
    density: "comfortable",
    design: "glass",
    badge: "Premium",
  },
];

export default function AppearancePanel({ active }: { active: boolean }) {
  const {
    theme,
    resolvedTheme,
    accent,
    density,
    fontScale,
    design,
    setTheme,
    setAccent,
    setDensity,
    setFontScale,
    setDesign,
    resetToDefaults,
  } = useTheme();

  const { showToast, toastView } = useToast();
  const [showPresetsModal, setShowPresetsModal] = useState(false);
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

  const activeDesign = DESIGN_STYLES.find((d) => d.key === design) || DESIGN_STYLES[0];
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

  function applyQuickPreset(preset: QuickPreset) {
    setTheme(preset.theme);
    setAccent(preset.accent);
    setDensity(preset.density);
    setDesign(preset.design);
    showToast("success", `Applied "${preset.name}" visual theme preset.`);
  }

  return (
    <div className={active ? "mt-6 space-y-6" : "hidden"}>
      {/* 1. Live Interactive UI Simulation Sandbox */}
      <section className="overflow-hidden rounded-[24px] border border-blue-500/20 bg-gradient-to-br from-blue-50/60 via-white to-indigo-50/40 p-5 shadow-[0_10px_35px_rgba(37,99,235,0.05)] backdrop-blur-xl dark:border-blue-900/40 dark:from-blue-950/30 dark:via-slate-900/80 dark:to-slate-900">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/20">
              <SvgIcon path="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M6.34 17.66l-1.41 1.41 M19.07 4.93l-1.41 1.41" className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                Live Interface Preview Sandbox
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Preview how your counter cards, buttons, and badges look in real time with the active theme.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-blue-200/80 bg-white/80 px-2.5 py-1 text-[10px] font-bold text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/60 dark:text-blue-300">
              {activeDesign.label} · {activeAccent.label}
            </span>
          </div>
        </div>

        {/* Mini ERP Interactive Sandbox Window */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          {/* Sample Sales Metric Card */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition dark:border-white/10 dark:bg-slate-800/90">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400">Today&apos;s Sales</span>
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
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition dark:border-white/10 dark:bg-slate-800/90">
            <div className="flex items-center justify-between">
              <span className="truncate text-xs font-extrabold text-slate-900 dark:text-white">
                A4 Color Print (Glossy)
              </span>
              <span className="text-xs font-black text-slate-900 dark:text-white">₹15</span>
            </div>
            <p className="mt-1 truncate text-[11px] text-slate-400">Document Printing Service</p>
            <button
              type="button"
              className={`mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs font-bold shadow-sm transition ${activeAccent.primaryClass}`}
            >
              <span>+ Add to POS Cart</span>
            </button>
          </div>

          {/* Sample Receipt / Action Badge */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition dark:border-white/10 dark:bg-slate-800/90">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400">WhatsApp Outbox</span>
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <div className="mt-1 text-xs font-bold text-slate-800 dark:text-slate-200">
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

      {/* 2. 1-Click Quick Style Presets */}
      <SettingsSection
        icon="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2l-6.1 3.4 1.4-6.8L2.2 9.1l6.9-.8L12 2z"
        tone="amber"
        title="1-Click Counter Presets"
        desc="Fast curated combinations of theme, accent colors, and layout density for specific shop workflows."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyQuickPreset(preset)}
              className="group relative flex flex-col justify-between rounded-[20px] border border-slate-200/90 bg-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-amber-400/80 hover:shadow-md dark:border-white/10 dark:bg-slate-900 dark:hover:border-amber-500/50"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                    {preset.badge}
                  </span>
                  <span className="text-xs font-bold text-slate-400 group-hover:text-amber-600 dark:group-hover:text-amber-400">
                    Apply →
                  </span>
                </div>
                <h4 className="mt-2 text-sm font-extrabold text-slate-900 dark:text-white">
                  {preset.name}
                </h4>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {preset.desc}
                </p>
              </div>
            </button>
          ))}
        </div>
      </SettingsSection>

      {/* 3. Core Theme Mode & Accent Palettes */}
      <SettingsSection
        icon="M12 3v18M3 12h18"
        tone="blue"
        title="Display Mode & Studio Accent Palette"
        desc="Switch between Light, Dark, or System mode, and choose your primary action color."
      >
        {/* Theme Radio Cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(["light", "dark", "system"] as Theme[]).map((t) => {
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
                    {t === "system" ? "Auto / System" : `${t} Mode`}
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
                    : t === "dark"
                    ? "OLED high-contrast dark mode for low eye fatigue"
                    : "Crisp, bright white studio canvas for daytime billing"}
                </p>
              </button>
            );
          })}
        </div>

        {/* Accent Color Swatches */}
        <div className="mt-5 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.02]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
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

      {/* 4. Complete Design Language Presets */}
      <section className="overflow-hidden rounded-[24px] border border-slate-200/90 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setShowPresetsModal((v) => !v)}
          aria-expanded={showPresetsModal}
          className="flex w-full items-center justify-between gap-4 p-5 text-left transition hover:bg-slate-50 dark:hover:bg-white/[0.02]"
        >
          <div className="flex min-w-0 items-center gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
              <SvgIcon path="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2l-6.1 3.4 1.4-6.8L2.2 9.1l6.9-.8L12 2z" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                Visual Language &amp; Surface Presets
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                Choose a complete architectural style · Currently using{" "}
                <strong className="text-slate-800 dark:text-slate-200">{activeDesign.label}</strong>
              </p>
            </div>
          </div>
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-transform duration-200 dark:bg-white/5 dark:text-slate-300 ${
              showPresetsModal ? "rotate-180" : ""
            }`}
          >
            <SvgIcon path="m6 9 6 6 6-6" className="h-4 w-4" />
          </span>
        </button>

        {showPresetsModal && (
          <div className="border-t border-slate-200/90 p-5 dark:border-white/10">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  7 Tailored Architectural Styles
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Changes card curvature, ambient backgrounds, and sidebar depth without altering any underlying business data.
                </p>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {DESIGN_STYLES.length} styles available
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {DESIGN_STYLES.map((d) => {
                const selected = d.key === design;
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => setDesign(d.key)}
                    aria-pressed={selected}
                    className={`group overflow-hidden rounded-[20px] border text-left transition-all duration-200 ${
                      selected
                        ? "border-violet-600 ring-2 ring-violet-600/25 shadow-lg dark:border-violet-500"
                        : "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md dark:border-white/10 dark:hover:border-white/20"
                    }`}
                  >
                    <div className={`h-28 p-3 ${PREVIEWS[d.key]}`}>
                      <div className="flex h-full gap-2">
                        <div className="w-1/4 rounded-lg border border-black/10 bg-black/10 p-2">
                          <div className="mb-2 h-2 w-3/4 rounded bg-current/40" />
                          <div className="space-y-1.5">
                            <div className="h-1.5 rounded bg-current/20" />
                            <div className="h-1.5 rounded bg-current/20" />
                            <div className="h-1.5 w-2/3 rounded bg-current/20" />
                          </div>
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="flex gap-2">
                            <div className="h-7 flex-1 rounded-md border border-black/10 bg-white/50" />
                            <div className="h-7 flex-1 rounded-md border border-black/10 bg-white/40" />
                          </div>
                          <div className="h-12 rounded-md border border-black/10 bg-white/50" />
                        </div>
                      </div>
                    </div>
                    <div className="bg-white p-4 dark:bg-slate-900">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-extrabold text-slate-900 dark:text-white">
                          {d.label}
                        </span>
                        {selected && (
                          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800 dark:bg-violet-950/60 dark:text-violet-300">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                        {d.description}
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5 dark:border-white/5">
                        <span className="text-[11px] font-medium text-slate-400">
                          {d.bestFor}
                        </span>
                        <span
                          className="h-3.5 w-3.5 shrink-0 rounded-full shadow-inner"
                          style={{ background: d.accent }}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* 5. Counter Ergonomics & Feedback Preferences (New Functional Features) */}
      <SettingsSection
        icon="M11 5L6 9H2v6h4l5 4V5z M19.07 4.93a10 10 0 0 1 0 14.14 M15.54 8.46a5 5 0 0 1 0 7.07"
        tone="emerald"
        title="Counter Ergonomics & Audio Cues"
        desc="Hardware settings for fast point-of-sale checkout and high-sunlight conditions."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Beep Toggle */}
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-800/80">
            <div>
              <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                Audio Feedback Chimes
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Play soft chime on barcode scan and successful payment
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
                Enhance border stroke widths for outdoor or sunlight glare
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

      {/* 6. Reset to Factory Defaults Footer */}
      <div className="flex flex-col gap-4 rounded-[22px] border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-extrabold text-slate-900 dark:text-white">
            Reset Appearance to Default
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Reverts back to Café Premium, Amber Accent, Comfortable Density, and System theme.
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
          Reset All Appearance Settings
        </button>
      </div>

      {toastView}
    </div>
  );
}
