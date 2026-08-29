"use client";

import { useEffect, useState } from "react";
import {
  useTheme,
  ACCENT_PALETTES,
  GRADIENT_PRESETS,
  type DisplayMode,
  type GradientPreset,
  type AccentColor,
  type DensityMode,
  type FontScale,
} from "@/components/theme-provider";
import SettingsSection from "@/components/settings/settings-section";
import { useToast } from "@/components/ui/use-toast";
import { ALL_AVAILABLE_MODULES, type QuickNavItem } from "@/components/module-quick-nav";

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

const QUICK_ACCESS_STORAGE_KEY = "cafe_erp_custom_quick_access";

const DEFAULT_QUICK_MODULES: QuickNavItem[] = [
  { id: "pos", label: "Point of Sale", href: "/pos", icon: "🧾" },
  { id: "quick-sale", label: "Quick Sale", href: "/pos?mode=quick", icon: "⚡" },
  { id: "invoices", label: "Invoices", href: "/invoices", icon: "📄" },
  { id: "customers", label: "Customers", href: "/customers", icon: "👤" },
  { id: "products", label: "Products", href: "/catalog/products", icon: "📦" },
  { id: "services", label: "Services", href: "/catalog/services", icon: "✦" },
  { id: "aeps", label: "AEPS Cash", href: "/business/aeps", icon: "🏧" },
  { id: "dmt", label: "Money Transfer", href: "/business/dmt", icon: "💸" },
  { id: "upi", label: "UPI Float", href: "/business/upi", icon: "📱" },
  { id: "opening", label: "Opening Position", href: "/finance/opening-balances", icon: "🏛️" },
  { id: "cashbook", label: "Cash Book", href: "/finance/cashbook", icon: "📖" },
  { id: "expenses", label: "Expenses", href: "/finance/expenses", icon: "🏷️" },
  { id: "settlements", label: "Settlements", href: "/finance/settlements", icon: "🏦" },
  { id: "pnl", label: "P&L Report", href: "/finance/pnl", icon: "📈" },
  { id: "dayclose", label: "Day Close", href: "/finance/day-close", icon: "🔒" },
  { id: "reports", label: "Reports & GST", href: "/reports", icon: "📊" },
  { id: "audit", label: "AI Self-Audit", href: "/ai/self-audit", icon: "🛡️" },
];

export default function AppearancePanel({ active }: { active: boolean }) {
  const {
    displayMode,
    resolvedDisplayMode,
    gradientEnabled,
    gradientPreset,
    motion,
    accent,
    density,
    fontScale,
    setDisplayMode,
    setGradientEnabled,
    setGradientPreset,
    setMotion,
    setAccent,
    setDensity,
    setFontScale,
    resetToDefaults,
  } = useTheme();

  const { showToast, toastView } = useToast();

  const [quickItems, setQuickItems] = useState<QuickNavItem[]>(DEFAULT_QUICK_MODULES);
  const [showConfirmResetQA, setShowConfirmResetQA] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(QUICK_ACCESS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setQuickItems(parsed);
        }
      }
    } catch {}
  }, []);

  function saveQuickItems(next: QuickNavItem[]) {
    setQuickItems(next);
    try {
      localStorage.setItem(QUICK_ACCESS_STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event("storage"));
    } catch {}
  }

  function toggleQuickItem(mod: QuickNavItem) {
    const exists = quickItems.some((i) => i.id === mod.id);
    if (exists) {
      if (quickItems.length <= 1) {
        showToast("error", "At least one Quick Access shortcut must remain active.");
        return;
      }
      const updated = quickItems.filter((i) => i.id !== mod.id);
      saveQuickItems(updated);
      showToast("info", `Hidden from Dashboard: ${mod.label}`);
    } else {
      const updated = [...quickItems, mod];
      saveQuickItems(updated);
      showToast("success", `Added to Dashboard: ${mod.label}`);
    }
  }

  function moveQuickItem(index: number, dir: -1 | 1) {
    const targetIdx = index + dir;
    if (targetIdx < 0 || targetIdx >= quickItems.length) return;
    const next = [...quickItems];
    const [moved] = next.splice(index, 1);
    next.splice(targetIdx, 0, moved);
    saveQuickItems(next);
  }

  function handleResetQuickAccess() {
    saveQuickItems(DEFAULT_QUICK_MODULES);
    setShowConfirmResetQA(false);
    showToast("success", "Dashboard Quick Access reset to standard defaults.");
  }

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
  const activePreset = GRADIENT_PRESETS.find((p) => p.id === gradientPreset) || GRADIENT_PRESETS[0];

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
                Live preview reflects your exact Theme ({displayMode}) + Atmosphere ({gradientEnabled ? activePreset.name : "Solid"}).
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Motion Control Toggle */}
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-white/5">
              <span className="px-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">Motion:</span>
              <button
                type="button"
                onClick={() => setMotion("on")}
                className={`rounded-lg px-2 py-0.5 text-[10px] font-black transition ${
                  motion === "on"
                    ? "bg-white text-blue-600 shadow-xs dark:bg-blue-600 dark:text-white"
                    : "text-slate-400 hover:text-slate-700 dark:hover:text-white"
                }`}
              >
                ON
              </button>
              <button
                type="button"
                onClick={() => setMotion("off")}
                className={`rounded-lg px-2 py-0.5 text-[10px] font-black transition ${
                  motion === "off"
                    ? "bg-white text-rose-600 shadow-xs dark:bg-rose-600 dark:text-white"
                    : "text-slate-400 hover:text-slate-700 dark:hover:text-white"
                }`}
              >
                OFF
              </button>
            </div>

            <span className="rounded-full border border-blue-200/80 bg-white/80 px-2.5 py-1 text-[10px] font-bold text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/60 dark:text-blue-300">
              {resolvedDisplayMode === "dark" ? "Dark Workspace" : "Light Workspace"} · {gradientEnabled ? `✨ ${activePreset.name}` : "Spatial"}
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
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
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
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                Delivered ✓
              </span>
            </div>
            <div className="mt-2 text-sm font-black text-slate-900 dark:text-white">
              Invoice #INV-2026-0042
            </div>
            <p className="mt-1 text-[11px] text-slate-400">80mm Thermal · Sent to +91 98765 43210</p>
          </div>
        </div>
      </section>

      {/* 2. Theme Mode Selector */}
      <SettingsSection
        icon="M12 3v2m0 14v2M5.6 5.6l1.4 1.4m9.9 9.9 1.4 1.4M3 12h2m14 0h2M5.6 18.4l1.4-1.4m9.9-9.9 1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
        tone="blue"
        title="Theme Mode"
        desc="Select your base lighting environment. Works harmoniously with the unified Modern Spatial architecture."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              id: "light" as DisplayMode,
              title: "Light",
              desc: "Bright ERP — High clarity white workspace with crisp contrast",
              icon: "☀️",
            },
            {
              id: "dark" as DisplayMode,
              title: "Dark",
              desc: "OLED Dark — Deep midnight focus with low eye fatigue",
              icon: "🌙",
            },
            {
              id: "system" as DisplayMode,
              title: "Auto / System",
              desc: "Follow OS — Synchronizes automatically with system preference",
              icon: "💻",
            },
          ].map((mode) => {
            const isSelected = displayMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => setDisplayMode(mode.id)}
                className={`group relative flex flex-col rounded-2xl border p-4 text-left transition ${
                  isSelected
                    ? "border-blue-600 bg-blue-50/50 shadow-md ring-2 ring-blue-600/30 dark:border-blue-500 dark:bg-blue-950/30"
                    : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900/60 dark:hover:bg-slate-900"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{mode.icon}</span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">{mode.title}</span>
                  </div>
                  {isSelected && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white">
                      <SvgIcon path="M20 6 9 17 4 12" className="h-3 w-3" />
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{mode.desc}</p>
              </button>
            );
          })}
        </div>
      </SettingsSection>

      {/* 3. Design Architecture (Locked Unified Modern Spatial) */}
      <SettingsSection
        icon="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2l-6.1 3.4 1.4-6.8L2.2 9.1l6.9-.8L12 2z"
        tone="violet"
        title="Design Architecture"
        desc="Permanent unified visual system across all Café ERP modules."
      >
        <div className="rounded-2xl border border-purple-500/30 bg-purple-50/30 p-4 dark:border-purple-500/20 dark:bg-purple-950/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-600 text-white shadow-sm shadow-purple-600/30">
                🏛️
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-black text-slate-900 dark:text-white">
                    Modern Spatial Architecture
                  </h4>
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[9px] font-black uppercase text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                    Unified Standard
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Elevated macOS floating windows, 3D tactile buttons, spatial cards, and smooth depth geometry.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-black text-purple-600 dark:text-purple-400">
              <SvgIcon path="M20 6 9 17 4 12" className="h-4 w-4" />
              <span>Active Architecture</span>
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* 4. Premium Gradient Visual Atmosphere */}
      <SettingsSection
        icon="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
        tone="violet"
        title="Premium Gradient Visual Atmosphere"
        desc="Ambient multi-colored lighting inspired by luxury digital software. Does not alter component structure or business workflows."
      >
        <div className="space-y-4">
          {/* Atmosphere ON / OFF Switch */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 dark:border-white/10 dark:bg-slate-900/60">
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white">Enable Ambient Gradient Lighting</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Illuminate the desktop canvas with subtle colored ambient cones
              </p>
            </div>
            <button
              type="button"
              onClick={() => setGradientEnabled(!gradientEnabled)}
              className={`flex h-6 w-11 items-center rounded-full p-1 transition ${
                gradientEnabled ? "bg-purple-600 justify-end" : "bg-slate-300 justify-start dark:bg-white/20"
              }`}
            >
              <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
            </button>
          </div>

          {/* 6 Gradient Atmosphere Presets */}
          {gradientEnabled && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                Select Atmosphere Preset
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                {GRADIENT_PRESETS.map((preset) => {
                  const isSelected = gradientPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setGradientPreset(preset.id)}
                      className={`group relative flex flex-col justify-between rounded-2xl border p-3.5 text-left transition ${
                        isSelected
                          ? "border-purple-600 bg-purple-50/40 shadow-md ring-2 ring-purple-600/30 dark:border-purple-500 dark:bg-purple-950/30"
                          : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900/60"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-slate-900 dark:text-white">
                            {preset.name}
                          </span>
                          {isSelected && (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-600 text-white">
                              <SvgIcon path="M20 6 9 17 4 12" className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          {preset.mood}
                        </p>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-white/5">
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
          )}
        </div>
      </SettingsSection>

      {/* 5. Brand Accent Color Palette */}
      <SettingsSection
        icon="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
        tone="blue"
        title="Studio Brand Accent"
        desc="Primary action color applied across active links, buttons, highlight borders, and charts."
      >
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-6">
          {ACCENT_PALETTES.map((palette) => {
            const isSelected = accent === palette.key;
            return (
              <button
                key={palette.key}
                type="button"
                onClick={() => setAccent(palette.key)}
                className={`flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition ${
                  isSelected
                    ? "border-slate-900 bg-slate-50 shadow-md ring-2 ring-slate-900/20 dark:border-white dark:bg-white/10"
                    : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900/60"
                }`}
              >
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full shadow-inner ring-2 ring-white dark:ring-slate-900"
                  style={{ backgroundColor: palette.colorHex }}
                >
                  {isSelected && (
                    <SvgIcon path="M20 6 9 17 4 12" className="h-4 w-4 text-white drop-shadow" />
                  )}
                </span>
                <span className="truncate text-xs font-bold text-slate-800 dark:text-slate-200">
                  {palette.label}
                </span>
              </button>
            );
          })}
        </div>
      </SettingsSection>

      {/* 6. Dashboard Quick Access Customization */}
      <SettingsSection
        icon="M4 6h16M4 12h16M4 18h7"
        tone="amber"
        title="Dashboard Quick Access"
        desc="Customize which shortcut pills appear on the Dashboard workspace navigation bar. Hiding a shortcut never disables the module itself (it remains 100% accessible via the Sidebar and search)."
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3 dark:border-white/5">
            <div>
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                Active Shortcuts ({quickItems.length} enabled)
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Use the ▲/▼ buttons to reorder, and the 👁 eye toggle to show or hide shortcuts.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowConfirmResetQA(true)}
                className="rounded-xl border border-rose-200 bg-rose-50/50 px-3 py-1.5 text-xs font-bold text-rose-600 transition hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400"
              >
                Reset to Default
              </button>
            </div>
          </div>

          {/* Quick Access List */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ALL_AVAILABLE_MODULES.map((mod) => {
              const activeIndex = quickItems.findIndex((i) => i.id === mod.id);
              const isEnabled = activeIndex !== -1;

              return (
                <div
                  key={mod.id}
                  className={`flex items-center justify-between gap-2.5 rounded-xl border p-2.5 transition ${
                    isEnabled
                      ? "border-blue-200/80 bg-blue-50/20 dark:border-blue-900/40 dark:bg-blue-950/10"
                      : "border-slate-200/60 bg-white/40 opacity-60 dark:border-white/5 dark:bg-white/2"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-base leading-none">{mod.icon}</span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                        {mod.label}
                      </p>
                      <p className="truncate text-[10px] text-slate-400">
                        {mod.href}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isEnabled && (
                      <div className="flex items-center gap-0.5 mr-1">
                        <button
                          type="button"
                          onClick={() => moveQuickItem(activeIndex, -1)}
                          disabled={activeIndex === 0}
                          title="Move Left / Up"
                          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30 dark:hover:bg-white/10 dark:hover:text-white"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => moveQuickItem(activeIndex, 1)}
                          disabled={activeIndex === quickItems.length - 1}
                          title="Move Right / Down"
                          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30 dark:hover:bg-white/10 dark:hover:text-white"
                        >
                          ▼
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleQuickItem(mod)}
                      className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-bold transition ${
                        isEnabled
                          ? "bg-blue-600 text-white shadow-xs hover:bg-blue-700"
                          : "border border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10"
                      }`}
                      title={isEnabled ? "Hide from Dashboard" : "Show on Dashboard"}
                    >
                      <span>{isEnabled ? "👁 ON" : "○ OFF"}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Reset Confirmation Dialog */}
        {showConfirmResetQA && (
          <div className="mt-3 flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
            <span>Reset Dashboard Quick Access shortcuts to standard defaults? (Your theme and ERP data remain untouched)</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetQuickAccess}
                className="rounded-lg bg-amber-600 px-3 py-1 font-bold text-white shadow-xs hover:bg-amber-700"
              >
                Yes, Reset
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmResetQA(false)}
                className="rounded-lg border border-amber-300 px-3 py-1 font-bold text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </SettingsSection>

      {/* 7. Workspace Density & Font Scaling */}
      <SettingsSection
        icon="M4 6h16M4 10h16M4 14h16M4 18h16"
        tone="blue"
        title="Workspace Geometry & Typography"
        desc="Tune interface density for high-speed POS touchscreens or standard desktop viewports."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Density */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Layout Density</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[
                { id: "comfortable" as DensityMode, label: "Comfortable", desc: "Spacious spacing" },
                { id: "compact" as DensityMode, label: "Compact", desc: "Dense data view" },
              ].map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDensity(d.id)}
                  className={`flex flex-col rounded-xl border p-3 text-left transition ${
                    density === d.id
                      ? "border-blue-600 bg-blue-50/50 shadow-xs ring-1 ring-blue-600 dark:border-blue-500 dark:bg-blue-950/40"
                      : "border-slate-200 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900/60"
                  }`}
                >
                  <span className="text-xs font-bold text-slate-900 dark:text-white">{d.label}</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">{d.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Typography Scale */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Font Scale</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[
                { id: "standard" as FontScale, label: "Standard (100%)", desc: "Standard 14px base" },
                { id: "large" as FontScale, label: "Large (110%)", desc: "High legibility" },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFontScale(f.id)}
                  className={`flex flex-col rounded-xl border p-3 text-left transition ${
                    fontScale === f.id
                      ? "border-blue-600 bg-blue-50/50 shadow-xs ring-1 ring-blue-600 dark:border-blue-500 dark:bg-blue-950/40"
                      : "border-slate-200 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900/60"
                  }`}
                >
                  <span className="text-xs font-bold text-slate-900 dark:text-white">{f.label}</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">{f.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* 8. Sound & Accessibility Toggles */}
      <SettingsSection
        icon="M11 5L6 9H2v6h4l5 4V5z M19.07 4.93a10 10 0 0 1 0 14.14 M15.54 8.46a5 5 0 0 1 0 7.07"
        tone="emerald"
        title="Sound & Accessibility Preferences"
        desc="Audio feedback and contrast enhancements for counter operations."
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 dark:border-white/10 dark:bg-slate-900/60">
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white">Audio Feedback</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Play tactile clicks on barcode scan &amp; sales checkout</p>
            </div>
            <button
              type="button"
              onClick={toggleSound}
              className={`flex h-6 w-11 items-center rounded-full p-1 transition ${
                soundFeedback ? "bg-blue-600 justify-end" : "bg-slate-300 justify-start dark:bg-white/20"
              }`}
            >
              <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
            </button>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 dark:border-white/10 dark:bg-slate-900/60">
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white">Auto-Print Thermal Receipt</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Trigger browser print dialog immediately when a sale completes</p>
            </div>
            <button
              type="button"
              onClick={toggleAutoPrint}
              className={`flex h-6 w-11 items-center rounded-full p-1 transition ${
                autoPrintThermal ? "bg-blue-600 justify-end" : "bg-slate-300 justify-start dark:bg-white/20"
              }`}
            >
              <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
            </button>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 dark:border-white/10 dark:bg-slate-900/60">
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white">High Contrast Text Mode</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Enforce maximum black/white contrast for all table and ledger text</p>
            </div>
            <button
              type="button"
              onClick={toggleHighContrast}
              className={`flex h-6 w-11 items-center rounded-full p-1 transition ${
                highContrast ? "bg-blue-600 justify-end" : "bg-slate-300 justify-start dark:bg-white/20"
              }`}
            >
              <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
            </button>
          </div>
        </div>
      </SettingsSection>

      {/* Global Reset All Preferences Button */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={() => {
            resetToDefaults();
            showToast("success", "All appearance preferences reset to system defaults.");
          }}
          className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
        >
          Reset All Appearance to Default
        </button>
      </div>

      {toastView}
    </div>
  );
}
