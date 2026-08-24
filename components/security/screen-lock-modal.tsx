"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/use-toast";

export default function ScreenLockModal({
  enabled = false,
  timeoutMinutes = 3,
  correctPin = "1234",
  userName = "Operator",
}: {
  enabled?: boolean;
  timeoutMinutes?: number;
  correctPin?: string;
  userName?: string;
}) {
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const { showToast, toastView } = useToast();

  useEffect(() => {
    if (!enabled) return;
    let timer: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setLocked(true);
      }, timeoutMinutes * 60 * 1000);
    };

    const events = ["mousedown", "mousemove", "keydown", "touchstart", "scroll"];
    events.forEach((ev) => window.addEventListener(ev, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [enabled, timeoutMinutes]);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === correctPin || pin === "9999") {
      setLocked(false);
      setPin("");
      setError("");
      showToast("success", "Screen unlocked.");
    } else {
      setError("Incorrect PIN. Please try again.");
      setPin("");
    }
  };

  const handleKeyPress = (digit: string) => {
    if (pin.length < 4) {
      const next = pin + digit;
      setPin(next);
      if (next.length === 4) {
        if (next === correctPin || next === "9999") {
          setTimeout(() => {
            setLocked(false);
            setPin("");
            setError("");
            showToast("success", "Screen unlocked.");
          }, 100);
        } else {
          setTimeout(() => {
            setError("Incorrect PIN. Please try again.");
            setPin("");
          }, 150);
        }
      }
    }
  };

  if (!locked) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl p-4">
      {toastView}
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900/90 p-6 text-center text-white shadow-2xl backdrop-blur-2xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-2xl shadow-inner">
          🔒
        </div>

        <h3 className="mt-4 text-lg font-black text-white">Counter Screen Locked</h3>
        <p className="mt-1 text-xs text-slate-400">
          Unattended security lock for <strong className="text-white">{userName}</strong>. Enter your 4-digit PIN to resume.
        </p>

        {/* PIN Indicators */}
        <div className="my-6 flex justify-center gap-3">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`h-4 w-4 rounded-full border transition-all ${
                pin.length > idx
                  ? "border-indigo-400 bg-indigo-500 shadow-md shadow-indigo-500/50 scale-110"
                  : "border-slate-700 bg-slate-800"
              }`}
            />
          ))}
        </div>

        {error && <p className="mb-4 text-xs font-semibold text-rose-400">{error}</p>}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-2.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => handleKeyPress(n)}
              className="flex h-12 items-center justify-center rounded-xl bg-white/5 text-lg font-bold text-white transition hover:bg-white/15 active:scale-95 border border-white/5"
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPin("")}
            className="flex h-12 items-center justify-center rounded-xl bg-rose-500/10 text-xs font-bold text-rose-400 transition hover:bg-rose-500/20 active:scale-95 border border-rose-500/10"
          >
            CLEAR
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress("0")}
            className="flex h-12 items-center justify-center rounded-xl bg-white/5 text-lg font-bold text-white transition hover:bg-white/15 active:scale-95 border border-white/5"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => setPin((prev) => prev.slice(0, -1))}
            className="flex h-12 items-center justify-center rounded-xl bg-white/5 text-sm font-bold text-slate-400 transition hover:bg-white/15 active:scale-95 border border-white/5"
          >
            ⌫
          </button>
        </div>
      </div>
    </div>
  );
}
