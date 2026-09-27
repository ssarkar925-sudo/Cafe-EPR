"use client";

import { useTheme, type GradientPreset } from "./theme-provider";

type OrbConfig = {
  orb1: string;
  orb2: string;
  orb3: string;
  orb4: string;
};

const LIGHT_PRESETS: Record<GradientPreset, OrbConfig> = {
  aurora: {
    orb1: "radial-gradient(circle, rgba(37, 99, 235, 0.45) 0%, rgba(59, 130, 246, 0.22) 45%, transparent 75%)",
    orb2: "radial-gradient(circle, rgba(124, 58, 237, 0.45) 0%, rgba(139, 92, 246, 0.22) 45%, transparent 75%)",
    orb3: "radial-gradient(circle, rgba(6, 182, 212, 0.40) 0%, rgba(6, 182, 212, 0.20) 45%, transparent 75%)",
    orb4: "radial-gradient(circle, rgba(99, 102, 241, 0.35) 0%, transparent 65%)",
  },
  "ocean-luxe": {
    orb1: "radial-gradient(circle, rgba(29, 78, 216, 0.48) 0%, rgba(37, 99, 235, 0.24) 45%, transparent 75%)",
    orb2: "radial-gradient(circle, rgba(13, 148, 136, 0.48) 0%, rgba(20, 184, 166, 0.24) 45%, transparent 75%)",
    orb3: "radial-gradient(circle, rgba(6, 182, 212, 0.42) 0%, rgba(6, 182, 212, 0.20) 45%, transparent 75%)",
    orb4: "radial-gradient(circle, rgba(14, 165, 233, 0.36) 0%, transparent 65%)",
  },
  royal: {
    orb1: "radial-gradient(circle, rgba(79, 70, 229, 0.48) 0%, rgba(99, 102, 241, 0.24) 45%, transparent 75%)",
    orb2: "radial-gradient(circle, rgba(147, 51, 234, 0.48) 0%, rgba(168, 85, 247, 0.24) 45%, transparent 75%)",
    orb3: "radial-gradient(circle, rgba(56, 189, 248, 0.42) 0%, rgba(56, 189, 248, 0.20) 45%, transparent 75%)",
    orb4: "radial-gradient(circle, rgba(124, 58, 237, 0.36) 0%, transparent 65%)",
  },
  "sunset-luxe": {
    orb1: "radial-gradient(circle, rgba(245, 158, 11, 0.50) 0%, rgba(217, 119, 6, 0.26) 45%, transparent 75%)",
    orb2: "radial-gradient(circle, rgba(244, 63, 94, 0.50) 0%, rgba(225, 29, 72, 0.26) 45%, transparent 75%)",
    orb3: "radial-gradient(circle, rgba(139, 92, 246, 0.44) 0%, rgba(124, 58, 237, 0.20) 45%, transparent 75%)",
    orb4: "radial-gradient(circle, rgba(251, 146, 60, 0.38) 0%, transparent 65%)",
  },
  "emerald-luxe": {
    orb1: "radial-gradient(circle, rgba(16, 185, 129, 0.50) 0%, rgba(5, 150, 105, 0.26) 45%, transparent 75%)",
    orb2: "radial-gradient(circle, rgba(13, 148, 136, 0.50) 0%, rgba(15, 118, 110, 0.26) 45%, transparent 75%)",
    orb3: "radial-gradient(circle, rgba(6, 182, 212, 0.44) 0%, rgba(8, 145, 178, 0.20) 45%, transparent 75%)",
    orb4: "radial-gradient(circle, rgba(52, 211, 153, 0.38) 0%, transparent 65%)",
  },
  cosmic: {
    orb1: "radial-gradient(circle, rgba(139, 92, 246, 0.50) 0%, rgba(109, 40, 217, 0.26) 45%, transparent 75%)",
    orb2: "radial-gradient(circle, rgba(59, 130, 246, 0.50) 0%, rgba(37, 99, 235, 0.26) 45%, transparent 75%)",
    orb3: "radial-gradient(circle, rgba(236, 72, 153, 0.46) 0%, rgba(219, 39, 119, 0.22) 45%, transparent 75%)",
    orb4: "radial-gradient(circle, rgba(217, 70, 239, 0.40) 0%, transparent 65%)",
  },
};

const DARK_PRESETS: Record<GradientPreset, OrbConfig> = {
  aurora: {
    orb1: "radial-gradient(circle, rgba(37, 99, 235, 0.50) 0%, rgba(29, 78, 216, 0.28) 45%, transparent 75%)",
    orb2: "radial-gradient(circle, rgba(124, 58, 237, 0.50) 0%, rgba(109, 40, 217, 0.28) 45%, transparent 75%)",
    orb3: "radial-gradient(circle, rgba(6, 182, 212, 0.42) 0%, rgba(8, 145, 178, 0.22) 45%, transparent 75%)",
    orb4: "radial-gradient(circle, rgba(99, 102, 241, 0.38) 0%, transparent 65%)",
  },
  "ocean-luxe": {
    orb1: "radial-gradient(circle, rgba(29, 78, 216, 0.55) 0%, rgba(30, 58, 138, 0.30) 45%, transparent 75%)",
    orb2: "radial-gradient(circle, rgba(13, 148, 136, 0.50) 0%, rgba(15, 118, 110, 0.28) 45%, transparent 75%)",
    orb3: "radial-gradient(circle, rgba(6, 182, 212, 0.42) 0%, rgba(8, 145, 178, 0.22) 45%, transparent 75%)",
    orb4: "radial-gradient(circle, rgba(14, 165, 233, 0.38) 0%, transparent 65%)",
  },
  royal: {
    orb1: "radial-gradient(circle, rgba(79, 70, 229, 0.55) 0%, rgba(67, 56, 202, 0.30) 45%, transparent 75%)",
    orb2: "radial-gradient(circle, rgba(147, 51, 234, 0.50) 0%, rgba(126, 34, 206, 0.28) 45%, transparent 75%)",
    orb3: "radial-gradient(circle, rgba(56, 189, 248, 0.42) 0%, rgba(2, 132, 199, 0.22) 45%, transparent 75%)",
    orb4: "radial-gradient(circle, rgba(124, 58, 237, 0.38) 0%, transparent 65%)",
  },
  "sunset-luxe": {
    orb1: "radial-gradient(circle, rgba(217, 119, 6, 0.55) 0%, rgba(180, 83, 9, 0.30) 45%, transparent 75%)",
    orb2: "radial-gradient(circle, rgba(225, 29, 72, 0.52) 0%, rgba(190, 18, 60, 0.28) 45%, transparent 75%)",
    orb3: "radial-gradient(circle, rgba(139, 92, 246, 0.45) 0%, rgba(109, 40, 217, 0.22) 45%, transparent 75%)",
    orb4: "radial-gradient(circle, rgba(245, 158, 11, 0.40) 0%, transparent 65%)",
  },
  "emerald-luxe": {
    orb1: "radial-gradient(circle, rgba(5, 150, 105, 0.55) 0%, rgba(4, 120, 87, 0.30) 45%, transparent 75%)",
    orb2: "radial-gradient(circle, rgba(13, 148, 136, 0.52) 0%, rgba(15, 118, 110, 0.28) 45%, transparent 75%)",
    orb3: "radial-gradient(circle, rgba(6, 182, 212, 0.45) 0%, rgba(8, 145, 178, 0.22) 45%, transparent 75%)",
    orb4: "radial-gradient(circle, rgba(16, 185, 129, 0.40) 0%, transparent 65%)",
  },
  cosmic: {
    orb1: "radial-gradient(circle, rgba(109, 40, 217, 0.58) 0%, rgba(91, 33, 182, 0.32) 45%, transparent 75%)",
    orb2: "radial-gradient(circle, rgba(37, 99, 235, 0.55) 0%, rgba(29, 78, 216, 0.30) 45%, transparent 75%)",
    orb3: "radial-gradient(circle, rgba(217, 70, 239, 0.50) 0%, rgba(192, 38, 211, 0.25) 45%, transparent 75%)",
    orb4: "radial-gradient(circle, rgba(147, 51, 234, 0.42) 0%, transparent 65%)",
  },
};

export default function AmbientBackdrop() {
  const { gradientEnabled, gradientPreset, resolvedDisplayMode } = useTheme();

  const isDark = resolvedDisplayMode === "dark";
  const presetMap = isDark ? DARK_PRESETS : LIGHT_PRESETS;
  const cfg = presetMap[gradientPreset] || presetMap.aurora;

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-0 overflow-hidden transition-opacity duration-500 ease-in-out ${
        gradientEnabled ? "opacity-100" : "opacity-0"
      }`}
      aria-hidden="true"
    >
      {/* Orb 1: Top-Left Primary Radiant Glow */}
      <div
        className="absolute -top-32 -left-32 h-[700px] w-[700px] rounded-full blur-[90px] sm:blur-[110px] transition-all duration-500 ease-out"
        style={{ background: cfg.orb1 }}
      />

      {/* Orb 2: Top-Right Secondary Atmospheric Bloom */}
      <div
        className="absolute -top-32 -right-32 h-[750px] w-[750px] rounded-full blur-[100px] sm:blur-[120px] transition-all duration-500 ease-out"
        style={{ background: cfg.orb2 }}
      />

      {/* Orb 3: Bottom-Center Luminescent Mesh Glow */}
      <div
        className="absolute -bottom-32 left-1/4 h-[700px] w-[700px] rounded-full blur-[90px] sm:blur-[110px] transition-all duration-500 ease-out"
        style={{ background: cfg.orb3 }}
      />

      {/* Orb 4: Middle-Right Subtle Accent Ray */}
      <div
        className="absolute top-1/4 right-[5%] h-[550px] w-[550px] rounded-full blur-[100px] sm:blur-[120px] transition-all duration-500 ease-out"
        style={{ background: cfg.orb4 }}
      />
    </div>
  );
}
