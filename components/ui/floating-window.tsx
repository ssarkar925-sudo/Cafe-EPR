"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type WindowSize = "sm" | "md" | "lg" | "xl" | "fullscreen";

const SIZE_CLASSES: Record<WindowSize, string> = {
  sm: "w-full max-w-[520px] max-h-[85vh]",
  md: "w-full max-w-[760px] max-h-[88vh]",
  lg: "w-full max-w-[1040px] max-h-[90vh]",
  xl: "w-full max-w-[1240px] max-h-[92vh]",
  fullscreen: "w-[96vw] h-[94vh]",
};

export default function FloatingWindow({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  size = "lg",
  sidebar,
  headerRight,
  footer,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  size?: WindowSize;
  sidebar?: ReactNode;
  headerRight?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(size === "fullscreen");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!mounted || !isOpen) return null;

  const windowNode = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-fade-in">
      {/* Frosted Spatial Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-md transition-opacity"
        aria-hidden="true"
      />

      {/* Floating Spatial macOS Window Panel */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`floating-mac-window relative z-10 flex flex-col ${
          isFullscreen ? "h-[95vh] w-[98vw]" : SIZE_CLASSES[size]
        } animate-modal-panel`}
        role="dialog"
        aria-modal="true"
      >
        {/* macOS Window Top Bar */}
        <div className="mac-window-header shrink-0">
          <div className="flex items-center gap-3">
            {/* Traffic Lights */}
            <div className="mac-traffic-lights group flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                title="Close window (Esc)"
                className="mac-dot mac-dot-close flex h-3 w-3 items-center justify-center text-[8px] font-black text-rose-950 opacity-90 transition hover:opacity-100 focus:outline-none"
                aria-label="Close"
              >
                <span className="opacity-0 group-hover:opacity-100 transition-opacity">✕</span>
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                title="Minimize / Restore"
                className="mac-dot mac-dot-min flex h-3 w-3 items-center justify-center text-[8px] font-black text-amber-950 opacity-90 transition hover:opacity-100 focus:outline-none"
                aria-label="Minimize"
              >
                <span className="opacity-0 group-hover:opacity-100 transition-opacity">−</span>
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreen((prev) => !prev)}
                title="Toggle Fullscreen"
                className="mac-dot mac-dot-max flex h-3 w-3 items-center justify-center text-[8px] font-black text-emerald-950 opacity-90 transition hover:opacity-100 focus:outline-none"
                aria-label="Maximize"
              >
                <span className="opacity-0 group-hover:opacity-100 transition-opacity">+</span>
              </button>
            </div>

            {/* Window Title & Subtitle */}
            <div className="flex items-center gap-2 pl-2">
              {icon && <span className="text-base">{icon}</span>}
              <div className="flex flex-col">
                <span className="text-xs font-black text-slate-900 dark:text-white">
                  {title}
                </span>
                {subtitle && (
                  <span className="text-[10px] text-slate-400">
                    {subtitle}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Header Right Actions */}
          <div className="flex items-center gap-2">
            {headerRight}
          </div>
        </div>

        {/* Window Content Area (with optional sidebar) */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {sidebar && (
            <aside className="w-56 shrink-0 overflow-y-auto border-r border-slate-100 bg-slate-50/70 p-3 dark:border-white/5 dark:bg-slate-950/40 sm:w-64">
              {sidebar}
            </aside>
          )}

          <main className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
            {children}
          </main>
        </div>

        {/* Optional Window Footer Tray */}
        {footer && (
          <div className="shrink-0 border-t border-slate-100 bg-slate-50/80 px-6 py-3.5 backdrop-blur-md dark:border-white/5 dark:bg-slate-950/60">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(windowNode, document.body);
}
