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
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Two-Factor Authentication</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Protect administrator login with an authenticator app using the existing Supabase MFA system.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${status === "enabled" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{status === "enabled" ? "Enabled" : "Not enabled"}</span>
      </div>
      {status === "disabled" && !qr && <button disabled={loading} onClick={enroll} className="mt-5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">Enable Authenticator 2FA</button>}
      {qr && <div className="mt-5 rounded-2xl border border-slate-200 p-4 dark:border-white/10"><p className="text-xs font-bold">Scan this QR code with Google Authenticator, Microsoft Authenticator, or another TOTP app.</p><img src={`data:image/svg+xml;utf8,${encodeURIComponent(qr)}`} alt="Authenticator QR code" className="mt-4 h-48 w-48 rounded-lg bg-white p-2" /><p className="mt-3 text-[11px] text-slate-500">Manual setup key: <span className="font-mono font-bold">{secret}</span></p><div className="mt-4 flex gap-2"><input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="6-digit code" className="w-40 rounded-xl border border-slate-300 px-3 py-2 text-center font-mono tracking-widest outline-none dark:border-white/10 dark:bg-slate-800" /><button disabled={loading} onClick={verify} className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white">Verify & Enable</button></div></div>}
      {status === "enabled" && <button disabled={loading} onClick={disable} className="mt-5 rounded-xl border border-rose-200 px-4 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Disable Authenticator 2FA</button>}
      {error && <p className="mt-3 text-xs font-semibold text-rose-600">{error}</p>}
    </div>
  );
}
