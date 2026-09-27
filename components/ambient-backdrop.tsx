"use client";

import { useTheme, type GradientPreset } from "./theme-provider";

const PRESET_CONFIG: Record<
  GradientPreset,
  {
    orb1Light: string;
    orb1Dark: string;
    orb2Light: string;
    orb2Dark: string;
    orb3Light: string;
    orb3Dark: string;
    orb4Light: string;
    orb4Dark: string;
  }
> = {
  aurora: {
    orb1Light: "rgba(37, 99, 235, 0.26)",
    orb1Dark: "rgba(37, 99, 235, 0.38)",
    orb2Light: "rgba(124, 58, 237, 0.24)",
    orb2Dark: "rgba(124, 58, 237, 0.36)",
    orb3Light: "rgba(6, 182, 212, 0.22)",
    orb3Dark: "rgba(6, 182, 212, 0.30)",
    orb4Light: "rgba(99, 102, 241, 0.18)",
    orb4Dark: "rgba(99, 102, 241, 0.26)",
  },
  "ocean-luxe": {
    orb1Light: "rgba(29, 78, 216, 0.26)",
    orb1Dark: "rgba(29, 78, 216, 0.38)",
    orb2Light: "rgba(13, 148, 136, 0.24)",
    orb2Dark: "rgba(13, 148, 136, 0.34)",
    orb3Light: "rgba(6, 182, 212, 0.22)",
    orb3Dark: "rgba(6, 182, 212, 0.30)",
    orb4Light: "rgba(37, 99, 235, 0.18)",
    orb4Dark: "rgba(37, 99, 235, 0.26)",
  },
  royal: {
    orb1Light: "rgba(79, 70, 229, 0.26)",
    orb1Dark: "rgba(79, 70, 229, 0.38)",
    orb2Light: "rgba(147, 51, 234, 0.24)",
    orb2Dark: "rgba(147, 51, 234, 0.36)",
    orb3Light: "rgba(56, 189, 248, 0.22)",
    orb3Dark: "rgba(56, 189, 248, 0.30)",
    orb4Light: "rgba(124, 58, 237, 0.18)",
    orb4Dark: "rgba(124, 58, 237, 0.26)",
  },
  "sunset-luxe": {
    orb1Light: "rgba(217, 119, 6, 0.26)",
    orb1Dark: "rgba(217, 119, 6, 0.38)",
    orb2Light: "rgba(225, 29, 72, 0.24)",
    orb2Dark: "rgba(225, 29, 72, 0.36)",
    orb3Light: "rgba(139, 92, 246, 0.22)",
    orb3Dark: "rgba(139, 92, 246, 0.30)",
    orb4Light: "rgba(245, 158, 11, 0.18)",
    orb4Dark: "rgba(245, 158, 11, 0.26)",
  },
  "emerald-luxe": {
    orb1Light: "rgba(5, 150, 105, 0.26)",
    orb1Dark: "rgba(5, 150, 105, 0.38)",
    orb2Light: "rgba(13, 148, 136, 0.24)",
    orb2Dark: "rgba(13, 148, 136, 0.34)",
    orb3Light: "rgba(6, 182, 212, 0.22)",
    orb3Dark: "rgba(6, 182, 212, 0.30)",
    orb4Light: "rgba(16, 185, 129, 0.18)",
    orb4Dark: "rgba(16, 185, 129, 0.26)",
  },
  cosmic: {
    orb1Light: "rgba(109, 40, 217, 0.26)",
    orb1Dark: "rgba(109, 40, 217, 0.38)",
    orb2Light: "rgba(37, 99, 235, 0.24)",
    orb2Dark: "rgba(37, 99, 235, 0.36)",
    orb3Light: "rgba(217, 70, 239, 0.22)",
    orb3Dark: "rgba(217, 70, 239, 0.30)",
    orb4Light: "rgba(124, 58, 237, 0.18)",
    orb4Dark: "rgba(124, 58, 237, 0.26)",
  },
};

export default function AmbientBackdrop() {
  const { gradientEnabled, gradientPreset, resolvedDisplayMode } = useTheme();

  const cfg = PRESET_CONFIG[gradientPreset] || PRESET_CONFIG.aurora;
  const isDark = resolvedDisplayMode === "dark";

  return (
    <div
      className={`pointer-events-none fixed inset-0 -z-10 overflow-hidden transition-opacity duration-700 ease-in-out ${
        gradientEnabled ? "opacity-100" : "opacity-0"
      }`}
      aria-hidden="true"
    >
      {/* Orb 1: Top-Left Primary Radiant Glow */}
      <div
        className="absolute -top-36 -left-36 h-[550px] w-[550px] rounded-full blur-[110px] sm:blur-[130px] transition-all duration-700 ease-out"
        style={{
          backgroundColor: isDark ? cfg.orb1Dark : cfg.orb1Light,
        }}
      />

      {/* Orb 2: Top-Right Secondary Atmospheric Bloom */}
      <div
        className="absolute -top-36 -right-36 h-[600px] w-[600px] rounded-full blur-[120px] sm:blur-[140px] transition-all duration-700 ease-out"
        style={{
          backgroundColor: isDark ? cfg.orb2Dark : cfg.orb2Light,
        }}
      />

      {/* Orb 3: Bottom-Center Luminescent Mesh Glow */}
      <div
        className="absolute -bottom-36 left-1/4 h-[550px] w-[550px] rounded-full blur-[110px] sm:blur-[130px] transition-all duration-700 ease-out"
        style={{
          backgroundColor: isDark ? cfg.orb3Dark : cfg.orb3Light,
        }}
      />

      {/* Orb 4: Middle-Right Subtle Accent Ray */}
      <div
        className="absolute top-1/3 right-1/6 h-[400px] w-[400px] rounded-full blur-[130px] sm:blur-[150px] transition-all duration-700 ease-out"
        style={{
          backgroundColor: isDark ? cfg.orb4Dark : cfg.orb4Light,
        }}
      />
    </div>
  );
}
