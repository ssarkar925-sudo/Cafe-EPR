"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function TwoFactorAuthCard() {
  const [status, setStatus] = useState<"loading" | "enabled" | "disabled">("loading");
  const [loading, setLoading] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    const supabase = createClient();
    const { data } = await supabase.auth.mfa.listFactors();
    const factor = data?.totp?.find((f) => f.status === "verified");
    setFactorId(factor?.id ?? null);
    setStatus(factor ? "enabled" : "disabled");
  }

  useEffect(() => { refresh(); }, []);

  async function enroll() {
    setLoading(true); setError("");
    const supabase = createClient();
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Cafe ERP Authenticator" });
    if (enrollError || !data) { setError(enrollError?.message ?? "Could not start 2FA enrollment."); setLoading(false); return; }
    setFactorId(data.id); setQr(data.totp.qr_code); setSecret(data.totp.secret); setLoading(false);
  }

  async function verify() {
    if (!factorId || !/^\d{6}$/.test(code)) { setError("Enter the 6-digit authenticator code."); return; }
    setLoading(true); setError("");
    const supabase = createClient();
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError || !challenge) { setError(challengeError?.message ?? "Could not create verification challenge."); setLoading(false); return; }
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
    if (verifyError) { setError(`Verification failed: ${verifyError.message}`); setLoading(false); return; }
    setQr(null); setSecret(null); setCode(""); setStatus("enabled"); setLoading(false);
  }

  async function disable() {
    if (!factorId || !window.confirm("Disable authenticator-app 2FA for this account?")) return;
    setLoading(true); setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) setError(error.message); else { setFactorId(null); setStatus("disabled"); }
    setLoading(false);
  }

  if (status === "loading") return null;
  return (
    <div className="rounded-3xl border border-slate-200/90 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/90">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 ring-1 ring-indigo-200/50 dark:ring-indigo-800/40">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Two-Factor Authenticator (TOTP)</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Protect administrator logins with TOTP authenticator apps (Google Authenticator, Microsoft Authenticator).</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 self-start sm:self-auto rounded-full px-3 py-1 text-xs font-bold ${status === "enabled" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${status === "enabled" ? "bg-emerald-500" : "bg-amber-500"}`} />
          {status === "enabled" ? "2FA Active" : "2FA Not Configured"}
        </span>
      </div>

      {status === "disabled" && !qr && (
        <button disabled={loading} onClick={enroll} className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50">
          Enable Authenticator 2FA
        </button>
      )}

      {qr && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-800/50">
          <p className="text-xs font-bold text-slate-900 dark:text-white">Scan this QR code with your TOTP authenticator app:</p>
          <img src={`data:image/svg+xml;utf8,${encodeURIComponent(qr)}`} alt="Authenticator QR code" className="mt-3 h-44 w-44 rounded-xl bg-white p-2.5 shadow-sm" />
          <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">Manual setup key: <span className="font-mono font-bold text-slate-900 dark:text-white">{secret}</span></p>
          <div className="mt-4 flex flex-wrap gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="6-digit code" className="w-36 rounded-xl border border-slate-200 bg-white px-3 py-2 text-center font-mono text-sm font-bold tracking-widest outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white" />
            <button disabled={loading} onClick={verify} className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700">Verify &amp; Enable</button>
          </div>
        </div>
      )}

      {status === "enabled" && (
        <button disabled={loading} onClick={disable} className="mt-4 rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-500/30 dark:bg-rose-950/30 dark:text-rose-300">
          Disable Authenticator 2FA
        </button>
      )}

      {error && <p className="mt-3 text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
