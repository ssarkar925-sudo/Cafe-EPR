"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchCloudWhatsAppConfig } from "@/lib/whatsapp";
import ScreenLockModal from "@/components/security/screen-lock-modal";

const IDLE_LIMIT_MS = 15 * 60 * 1000;
const WARN_MS = 60 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel", "pointerdown"];

export default function SessionGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const lastActivity = useRef(Date.now());
  const signingOut = useRef(false);
  const [showWarn, setShowWarn] = useState(false);
  const [countdown, setCountdown] = useState(Math.round(WARN_MS / 1000));

  const [screenLockActive, setScreenLockActive] = useState(false);
  const [lockTimeout, setLockTimeout] = useState(3);
  const [managerPin, setManagerPin] = useState("1234");

  useEffect(() => {
    try {
      const enabled = localStorage.getItem("sccomm_screen_lock_enabled") === "true";
      const timeout = Number(localStorage.getItem("sccomm_screen_lock_timeout") || 3);
      const pin = localStorage.getItem("sccomm_manager_pin") || "1234";
      setScreenLockActive(enabled);
      setLockTimeout(timeout);
      setManagerPin(pin);
    } catch {}
  }, []);

  async function doSignOut() {
    if (signingOut.current) return;
    signingOut.current = true;
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    window.location.href = "/logout?reason=idle";
  }

  useEffect(() => {
    // Silently sync WhatsApp templates & settings from Supabase Cloud on every device
    fetchCloudWhatsAppConfig().catch(() => {});

    if (signingOut.current) return;

    function bump() {
      lastActivity.current = Date.now();
      if (showWarn) setShowWarn(false);
    }
    function onVisible() {
      if (document.visibilityState === "visible") {
        if (Date.now() - lastActivity.current >= IDLE_LIMIT_MS) {
          doSignOut();
          return;
        }
        bump();
      }
    }

    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, bump, { passive: true }));
    document.addEventListener("visibilitychange", onVisible);

    const tick = setInterval(() => {
      const elapsed = Date.now() - lastActivity.current;
      if (elapsed >= IDLE_LIMIT_MS) {
        doSignOut();
        return;
      }
      if (elapsed >= IDLE_LIMIT_MS - WARN_MS) {
        setShowWarn(true);
        setCountdown(Math.ceil((IDLE_LIMIT_MS - elapsed) / 1000));
      }
    }, 1000);

    // Initial check for broken/invalid session refresh token
    supabase.auth.getSession().then(({ data, error }) => {
      if (error || !data.session) {
        if (error && (error.message?.includes("Refresh Token") || error.name === "AuthApiError")) {
          if (!signingOut.current && pathname !== "/login") {
            signingOut.current = true;
            supabase.auth.signOut().catch(() => {});
            window.location.href = "/logout?reason=expired";
          }
        }
      }
    }).catch(() => {});

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_OUT" || (event === "TOKEN_REFRESHED" && !session)) && !signingOut.current) {
        signingOut.current = true;
        window.location.href = "/logout?reason=expired";
      }
    });

    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, bump));
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(tick);
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (pathname === "/login") return null;

  return (
    <>
      <ScreenLockModal
        enabled={screenLockActive}
        timeoutMinutes={lockTimeout}
        correctPin={managerPin}
        userName="Operator"
      />
      {showWarn && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
              </svg>
            </div>
            <h3 className="mt-4 text-base font-bold text-slate-900">Session expiring</h3>
            <p className="mt-1 text-sm text-slate-500">
              You've been inactive. Auto sign-out in{" "}
              <span className="font-semibold text-slate-900">{countdown}s</span> to protect your account.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={doSignOut}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Sign out now
              </button>
              <button
                onClick={() => {
                  lastActivity.current = Date.now();
                  setShowWarn(false);
                }}
                className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                Keep working
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}