"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { useToast } from "@/components/ui/use-toast";
import SettingsSection from "@/components/settings/settings-section";

type Attempt = {
  email: string | null;
  success: boolean;
  error_message: string | null;
  ip: string | null;
  created_at: string;
};

function strength(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

function strengthLabel(score: number) {
  if (score >= 6) return { text: "Very Strong", cls: "bg-emerald-500", width: "100%" };
  if (score >= 5) return { text: "Strong", cls: "bg-emerald-500", width: "84%" };
  if (score >= 4) return { text: "Good", cls: "bg-blue-500", width: "66%" };
  if (score >= 3) return { text: "Fair", cls: "bg-amber-500", width: "50%" };
  if (score >= 1) return { text: "Weak", cls: "bg-rose-500", width: "34%" };
  return { text: "Too Short", cls: "bg-slate-200", width: "10%" };
}

export default function SecurityPanel({ active = true }: { active?: boolean }) {
  const supabase = createClient();
  const { showToast, toastView } = useToast();

  const [email, setEmail] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [busy, setBusy] = useState(false);

  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(true);

  const [mfaStatus, setMfaStatus] = useState<"loading" | "none" | "enabled">("loading");
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [totp, setTotp] = useState<{ qr_code: string; secret: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);

  const [autoLockTimeout, setAutoLockTimeout] = useState<string>(() => {
    if (typeof window === "undefined") return "30";
    return localStorage.getItem("sccomm-autolock-min") || "30";
  });

  async function loadMfa() {
    const { data: factors, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      setMfaStatus("none");
      return;
    }
    const factor = factors?.totp.find((f) => f.status === "verified");
    if (factor) {
      setMfaFactorId(factor.id);
      setMfaStatus("enabled");
    } else {
      setMfaStatus("none");
    }
  }

  async function loadAttempts() {
    setAttemptsLoading(true);
    const { data, error } = await supabase.rpc("recent_login_attempts", { p_limit: 20 });
    if (error) {
      setAttempts([]);
    } else {
      setAttempts((data ?? []) as Attempt[]);
    }
    setAttemptsLoading(false);
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data?.user?.email ?? "")).catch(() => {});
    loadAttempts();
    loadMfa();
  }, [supabase]);

  async function startEnroll() {
    setMfaBusy(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Authenticator app",
    });
    setMfaBusy(false);
    if (error) {
      showToast("error", error.message);
      return;
    }
    setEnrolling(true);
    setMfaFactorId(data.id);
    setTotp({ qr_code: data.totp.qr_code, secret: data.totp.secret });
    setTotpCode("");
    setChallengeId(null);
  }

  async function confirmEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!totp || !totpCode.trim()) {
      showToast("error", "Enter the 6-digit code from your authenticator app.");
      return;
    }
    setMfaBusy(true);
    const factorId = mfaFactorId;
    if (!factorId) {
      showToast("error", "Setup expired. Please restart 2FA setup.");
      setMfaBusy(false);
      return;
    }

    let cid = challengeId;
    if (!cid) {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chErr || !ch) {
        showToast("error", chErr?.message ?? "Could not verify code.");
        setMfaBusy(false);
        return;
      }
      cid = ch.id;
      setChallengeId(ch.id);
    }

    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: cid,
      code: totpCode.trim(),
    });
    setMfaBusy(false);
    if (error) {
      setChallengeId(null);
      showToast("error", `Incorrect code: ${error.message}`);
      return;
    }

    logAudit({
      action: "settings",
      entity: "settings",
      entity_id: null,
      description: "Two-factor authentication enabled",
      details: { security: "mfa_enable" },
    });

    setEnrolling(false);
    setTotp(null);
    setTotpCode("");
    setChallengeId(null);
    setMfaStatus("enabled");
    showToast("success", "Two-factor authentication (2FA) is now active.");
  }

  async function disableMfa() {
    if (!mfaFactorId) return;
    setMfaBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: mfaFactorId });
    setMfaBusy(false);
    if (error) {
      showToast("error", `Could not disable 2FA: ${error.message}`);
      return;
    }
    logAudit({
      action: "settings",
      entity: "settings",
      entity_id: null,
      description: "Two-factor authentication disabled",
      details: { security: "mfa_disable" },
    });
    setMfaFactorId(null);
    setMfaStatus("none");
    showToast("success", "Two-factor authentication disabled.");
  }

  const sc = strength(next);
  const meter = strengthLabel(sc);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!current) {
      showToast("error", "Enter your current password.");
      return;
    }
    if (next.length < 8) {
      showToast("error", "New password must be at least 8 characters.");
      return;
    }
    if (sc < 4) {
      showToast("error", "Please choose a stronger password with numbers and symbols.");
      return;
    }
    if (next !== confirm) {
      showToast("error", "New passwords do not match.");
      return;
    }
    if (next === current) {
      showToast("error", "New password must differ from current password.");
      return;
    }

    setBusy(true);
    try {
      const { error: vErr } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (vErr) {
        showToast("error", "Current password is incorrect.");
        setBusy(false);
        return;
      }

      const { error: uErr } = await supabase.auth.updateUser({ password: next });
      if (uErr) {
        showToast("error", `Password change failed: ${uErr.message}`);
        setBusy(false);
        return;
      }

      logAudit({
        action: "settings",
        entity: "settings",
        entity_id: null,
        description: "Password updated successfully",
        details: { security: "password_change" },
      });

      setCurrent("");
      setNext("");
      setConfirm("");
      showToast("success", "Password updated successfully.");
    } finally {
      setBusy(false);
    }
  }

  function handleAutoLockChange(min: string) {
    setAutoLockTimeout(min);
    try {
      localStorage.setItem("sccomm-autolock-min", min);
      showToast("success", min === "0" ? "Auto-lock disabled" : `Auto-lock set to ${min} minutes`);
    } catch {}
  }

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 shadow-xs outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-900/30";
  const labelClass = "mb-1.5 block text-xs font-extrabold text-slate-700 dark:text-slate-300";

  return (
    <div className={active ? "mt-6 space-y-6" : "hidden"}>
      {/* 1. Change Password Section */}
      <SettingsSection
        icon="M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2zm10-10V7a4 4 0 0 0-8 0v4h8z"
        tone="blue"
        title="Admin Credentials &amp; Password"
        desc="Update your master login password used to access the Cafe ERP system."
      >
        <form onSubmit={changePassword} className="space-y-4">
          <div>
            <label className={labelClass}>Current Password</label>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                required
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                placeholder="••••••••••••"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                {showCurrent ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>New Password</label>
              <div className="relative">
                <input
                  type={showNext ? "text" : "password"}
                  required
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  placeholder="At least 8 characters"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => setShowNext((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  {showNext ? "Hide" : "Show"}
                </button>
              </div>

              {/* Password Strength Meter */}
              {next && (
                <div className="mt-2 space-y-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                    <div
                      className={`h-full transition-all duration-300 ${meter.cls}`}
                      style={{ width: meter.width }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-slate-400">
                    <span>Strength: {meter.text}</span>
                    <span>{next.length} chars</span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className={labelClass}>Confirm New Password</label>
              <input
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter new password"
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={busy || !current || !next || !confirm}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-md transition hover:bg-blue-700 disabled:opacity-50"
            >
              <span>{busy ? "Updating Password…" : "Update Password"}</span>
            </button>
          </div>
        </form>
      </SettingsSection>

      {/* 2. Two-Factor Authentication (2FA) */}
      <SettingsSection
        icon="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
        tone="emerald"
        title="Two-Factor Authentication (2FA)"
        desc="Protect your counter terminal with Google Authenticator or Microsoft Authenticator TOTP codes."
      >
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                mfaStatus === "enabled"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                  : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300"
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </span>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Authenticator App (TOTP)
                </p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                    mfaStatus === "enabled"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400"
                  }`}
                >
                  {mfaStatus === "enabled" ? "ACTIVE ✓" : "DISABLED"}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Requires a 6-digit code from your phone on every fresh admin login.
              </p>
            </div>
          </div>

          <div>
            {mfaStatus === "enabled" ? (
              <button
                type="button"
                onClick={disableMfa}
                disabled={mfaBusy}
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 shadow-sm transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
              >
                {mfaBusy ? "Disabling…" : "Disable 2FA"}
              </button>
            ) : (
              <button
                type="button"
                onClick={startEnroll}
                disabled={mfaBusy || enrolling}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                {mfaBusy ? "Starting…" : "Enable 2FA"}
              </button>
            )}
          </div>
        </div>

        {/* 2FA Enrollment Form */}
        {enrolling && totp && (
          <div className="mt-4 rounded-2xl border border-emerald-200/90 bg-emerald-50/40 p-5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
              Scan Authenticator QR Code
            </h4>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Open Google Authenticator, scan this QR code, and enter the 6-digit verification code below.
            </p>

            <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="w-36 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={totp.qr_code} alt="2FA QR Code" className="h-full w-full" />
              </div>

              <div className="flex-1 space-y-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400">
                    Manual Setup Secret Key
                  </label>
                  <p className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                    {totp.secret}
                  </p>
                </div>

                <form onSubmit={confirmEnroll} className="flex gap-2">
                  <input
                    type="text"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="123456"
                    className="w-36 rounded-xl border border-slate-300 bg-white px-3 py-2 text-center font-mono text-base font-black tracking-widest text-slate-900 shadow-sm outline-none dark:border-white/20 dark:bg-slate-800 dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={mfaBusy || totpCode.length !== 6}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {mfaBusy ? "Verifying…" : "Confirm & Activate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEnrolling(false)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </SettingsSection>

      {/* 3. Session Timeout & Counter Auto-Lock */}
      <SettingsSection
        icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        tone="violet"
        title="Terminal Inactivity Auto-Lock"
        desc="Automatically locks the POS billing screen when left unattended at the counter."
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            { min: "5", label: "5 Minutes" },
            { min: "15", label: "15 Minutes" },
            { min: "30", label: "30 Minutes" },
            { min: "60", label: "1 Hour" },
            { min: "0", label: "Never (Disabled)" },
          ].map((item) => {
            const active = autoLockTimeout === item.min;
            return (
              <button
                key={item.min}
                type="button"
                onClick={() => handleAutoLockChange(item.min)}
                className={`rounded-2xl border p-3 text-center transition ${
                  active
                    ? "border-violet-500 bg-violet-50/70 ring-2 ring-violet-500/20 shadow-sm dark:border-violet-500 dark:bg-violet-950/40"
                    : "border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-slate-900"
                }`}
              >
                <span className="block text-xs font-extrabold text-slate-900 dark:text-white">
                  {item.label}
                </span>
                {active && (
                  <span className="mt-1 inline-block rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-black text-violet-800 dark:bg-violet-950 dark:text-violet-300">
                    Active ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </SettingsSection>

      {/* 4. Recent Security & Login Events */}
      <SettingsSection
        icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
        tone="slate"
        title="Recent Security &amp; Access Log"
        desc="Monitors recent terminal logins, IP addresses, and authentication attempts."
      >
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white dark:border-white/10 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:border-white/5 dark:bg-white/[0.02]">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">User / Account</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {attemptsLoading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                      Loading security records…
                    </td>
                  </tr>
                ) : attempts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                      No security audit events recorded.
                    </td>
                  </tr>
                ) : (
                  attempts.slice(0, 10).map((a, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400">
                        {new Date(a.created_at).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-2.5 font-bold text-slate-900 dark:text-white">
                        {a.email || email}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black ${
                            a.success
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                          }`}
                        >
                          {a.success ? "Success ✓" : "Rejected ✕"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-slate-400">
                        {a.ip || "127.0.0.1"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </SettingsSection>

      {toastView}
    </div>
  );
}