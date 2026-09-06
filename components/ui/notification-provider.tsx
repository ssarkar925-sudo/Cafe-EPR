"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";

export type NotificationType = "success" | "error" | "info" | "warning";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  message: string;
  title?: string;
  duration?: number;
  timestamp: number;
}

interface NotificationContextType {
  notify: (type: NotificationType, message: string, title?: string, duration?: number) => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

// Web Audio API chime synthesis (no external MP3/WAV files needed)
function playNotificationChime(type: NotificationType) {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    
    // Create gain node for gentle volume
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, ctx.currentTime); // Subtle volume
    gain.connect(ctx.destination);

    if (type === "success") {
      // Pleasant double-chime ascending (C6 -> G6)
      const osc1 = ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(1046.5, ctx.currentTime); // C6
      osc1.frequency.setValueAtTime(1567.98, ctx.currentTime + 0.08); // G6
      osc1.connect(gain);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.28);
    } else if (type === "error") {
      // Subtle low warning tone
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(260, ctx.currentTime);
      osc.frequency.setValueAtTime(200, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } else {
      // Soft informational blip
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.connect(gain);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.16);
    }
  } catch {
    // AudioContext blocked by user-interaction policy; ignore safely
  }
}

// Mobile haptic vibration
function triggerHaptic(type: NotificationType) {
  if (typeof window === "undefined" || !("vibrate" in navigator)) return;
  try {
    if (type === "success") {
      navigator.vibrate(35); // crisp 35ms tap
    } else if (type === "error") {
      navigator.vibrate([40, 60, 40]); // warning pulse
    } else {
      navigator.vibrate(25);
    }
  } catch {
    // Ignore safely
  }
}

// Global native dispatch for Windows Action Center Toast & Android System Tray
export function dispatchNativeNotification(title: string, message: string, type: NotificationType = "info") {
  if (typeof window === "undefined") return;

  const resolvedTitle = title || TYPE_CONFIG[type]?.defaultTitle || "CafeERP Notification";

  // 1. Windows Desktop Electron Native Action Center Toast
  const electron = (window as any).electronAPI;
  if (electron?.showNotification) {
    try {
      electron.showNotification({
        title: resolvedTitle,
        message,
        icon: "/app-icon.png",
      }).catch(() => {});
    } catch {}
    return;
  }

  // 2. Android Status Bar / Web Browser Notification API
  if ("Notification" in window) {
    try {
      if (Notification.permission === "granted") {
        new Notification(resolvedTitle, {
          body: message,
          icon: "/app-icon.png",
          badge: "/app-icon.png",
          tag: `cafeerp-${Date.now()}`,
        });
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then((perm) => {
          if (perm === "granted") {
            new Notification(resolvedTitle, {
              body: message,
              icon: "/app-icon.png",
              badge: "/app-icon.png",
              tag: `cafeerp-${Date.now()}`,
            });
          }
        }).catch(() => {});
      }
    } catch {
      // Ignored if Notification constructor is restricted by browser policy
    }
  }
}

export async function requestNativeNotificationPermission(): Promise<"granted" | "denied" | "default" | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return "unsupported";
  }
}

// Global standalone notify function that dispatches a CustomEvent
export function notify(type: NotificationType, message: string, title?: string, duration: number = 3800) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("cafeerp:notify", {
      detail: { type, message, title, duration },
    })
  );
}

const TYPE_CONFIG: Record<
  NotificationType,
  { bar: string; iconBg: string; textClass: string; icon: string; defaultTitle: string }
> = {
  success: {
    bar: "bg-gradient-to-r from-emerald-500 to-teal-400",
    iconBg: "bg-emerald-500 text-white shadow-md shadow-emerald-500/25",
    textClass: "text-emerald-700 dark:text-emerald-300",
    defaultTitle: "Action Completed",
    icon: "M5 13l4 4L19 7",
  },
  error: {
    bar: "bg-gradient-to-r from-rose-500 to-red-600",
    iconBg: "bg-rose-500 text-white shadow-md shadow-rose-500/25",
    textClass: "text-rose-700 dark:text-rose-300",
    defaultTitle: "Attention Needed",
    icon: "M12 8v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  },
  warning: {
    bar: "bg-gradient-to-r from-amber-400 to-orange-500",
    iconBg: "bg-amber-500 text-white shadow-md shadow-amber-500/25",
    textClass: "text-amber-700 dark:text-amber-300",
    defaultTitle: "Warning",
    icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  },
  info: {
    bar: "bg-gradient-to-r from-blue-500 to-indigo-600",
    iconBg: "bg-blue-600 text-white shadow-md shadow-blue-500/25",
    textClass: "text-blue-700 dark:text-blue-300",
    defaultTitle: "Information",
    icon: "M12 8v4m0 4h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z",
  },
};

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const dismiss = useCallback((id: string) => {
    const t = timeoutsRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timeoutsRef.current.delete(id);
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    timeoutsRef.current.forEach((t) => clearTimeout(t));
    timeoutsRef.current.clear();
    setItems([]);
  }, []);

  const addNotification = useCallback(
    (type: NotificationType, message: string, title?: string, duration: number = 3800) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newItem: NotificationItem = {
        id,
        type,
        message,
        title,
        duration,
        timestamp: Date.now(),
      };

      // Sound and haptic cues
      playNotificationChime(type);
      triggerHaptic(type);

      // Native OS Toast & System Tray dispatch (Windows Electron & Android Status Bar)
      dispatchNativeNotification(title || "", message, type);

      setItems((prev) => [newItem, ...prev.slice(0, 4)]); // Keep max 5 concurrent

      const timer = setTimeout(() => {
        dismiss(id);
      }, duration);

      timeoutsRef.current.set(id, timer);
    },
    [dismiss]
  );

  // Listen for global custom events
  useEffect(() => {
    function handleEvent(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.message) {
        addNotification(detail.type || "info", detail.message, detail.title, detail.duration);
      }
    }

    window.addEventListener("cafeerp:notify", handleEvent);
    return () => window.removeEventListener("cafeerp:notify", handleEvent);
  }, [addNotification]);

  return (
    <NotificationContext.Provider value={{ notify: addNotification, dismiss, clearAll }}>
      {children}

      {/* Global Top-Docked Notification Container */}
      <div
        className="pointer-events-none fixed top-3 left-3 right-3 z-[9999] flex flex-col items-center gap-2 sm:top-5 sm:right-5 sm:left-auto sm:w-96"
        aria-live="polite"
        aria-atomic="true"
      >
        {items.map((item) => {
          const cfg = TYPE_CONFIG[item.type];
          return (
            <div
              key={item.id}
              role="status"
              className="pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 p-3.5 shadow-2xl shadow-slate-900/15 ring-1 ring-black/5 backdrop-blur-xl transition-all duration-300 animate-slide-up dark:border-white/10 dark:bg-slate-900/95 dark:shadow-black/50 dark:ring-white/10"
            >
              {/* Top Accent Rim */}
              <div className={`absolute top-0 inset-x-0 h-1 ${cfg.bar}`} />

              {/* Icon Bubble */}
              <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${cfg.iconBg}`}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5"
                >
                  <path d={cfg.icon} />
                </svg>
              </div>

              {/* Message Content */}
              <div className="min-w-0 flex-1 pr-6">
                <p className={`text-xs font-black tracking-tight ${cfg.textClass}`}>
                  {item.title || cfg.defaultTitle}
                </p>
                <p className="mt-0.5 text-xs font-medium leading-relaxed text-slate-800 dark:text-slate-200 break-words">
                  {item.message}
                </p>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 active:scale-95 dark:hover:bg-white/10 dark:hover:text-white"
                aria-label="Dismiss notification"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    // Fallback if used outside provider
    return {
      notify,
      dismiss: () => {},
      clearAll: () => {},
    };
  }
  return ctx;
}
