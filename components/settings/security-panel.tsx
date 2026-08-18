"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";

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
  if (score >= 6) return { text: "Very strong", cls: "bg-emerald-500", bar: "100%" };
  if (score >= 5) return { text: "Strong", cls: "bg-emerald-500", bar: "84%" };
  if (score >= 4) return { text: "Good", cls: "bg-blue-500", bar: "66%" };
  if (score >= 3) return { text: "Fair", cls: "bg-amber-500", bar: "50%" };
  if (score >= 1) return { text: "Weak", cls: "bg-rose-500", bar: "34%" };
  return { text: "", cls: "bg-slate-200", bar: "0%" };
}

export default function SecurityPanel() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(true);
  const [attemptsError, setAttemptsError] = useState<string | null>(null);

  const [mfaStatus, setMfaStatus] = useState<"loading" | "none" | "enabled">("loading");
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [totp, setTotp] = useState<{ qr_code: string; secret: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaMsg, setMfaMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);

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

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
    loadAttempts();
    loadMfa();
  }, []);

  async function startEnroll() {
    setMfaMsg(null);
    setMfaBusy(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Authenticator app",
    });
    setMfaBusy(false);
    if (error) {
      setMfaMsg({
        text:
          error.message === "MFA enroll disabled"
            ? "Two-factor authentication is not enabled in the Supabase dashboard yet (Authentication → MFA)."
            : `Could not start 2FA setup: ${error.message}`,
      });
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
      setMfaMsg({ text: "Enter the 6-digit code from your authenticator app." });
      return;
    }
    setMfaBusy(true);
    setMfaMsg(null);

    const factorId = mfaFactorId;
    if (!factorId) {
      setMfaMsg({ text: "Setup expired. Start again." });
      setMfaBusy(false);
      return;
    }

    let cid = challengeId;
    if (!cid) {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chErr || !ch) {
        setMfaMsg({ text: chErr?.message ?? "Could not verify the code." });
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
      setMfaMsg({ text: `Incorrect code. ${error.message}` });
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
    setMfaMsg({ ok: true, text: "Two-factor authentication is now enabled." });
  }

  async function disableMfa() {
    if (!mfaFactorId) return;
    setMfaBusy(true);
    setMfaMsg(null);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: mfaFactorId });
    setMfaBusy(false);
    if (error) {
      setMfaMsg({ text: `Could not disable 2FA: ${error.message}` });
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
    setMfaMsg({ ok: true, text: "Two-factor authentication is disabled." });
  }

  async function loadAttempts() {
    setAttemptsLoading(true);
    const { data, error } = await supabase.rpc("recent_login_attempts", { p_limit: 25 });
    if (error) {
      setAttemptsError(error.message);
      setAttempts([]);
    } else {
      setAttemptsError(null);
      setAttempts((data ?? []) as Attempt[]);
    }
    setAttemptsLoading(false);
  }

  const sc = strength(next);
  const meter = strengthLabel(sc);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!current) return setMsg({ text: "Enter your current password." });
    if (next.length < 8) return setMsg({ text: "New password must be at least 8 characters." });
    if (sc < 4) return setMsg({ text: "Use a mix of upper/lowercase, numbers and symbols." });
    if (next !== confirm) return setMsg({ text: "New passwords do not match." });
    if (next === current) return setMsg({ text: "New password must differ from the current one." });

    setBusy(true);
    try {
      const { error: vErr } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (vErr) {
        setMsg({ text: "Current password is incorrect." });
        setBusy(false);
        return;
      }

      const { error: uErr } = await supabase.auth.updateUser({ password: next });
      if (uErr) {
        setMsg({ text: `Password change failed: ${uErr.message}` });
        setBusy(false);
        return;
      }

      logAudit({
        action: "settings",
        entity: "settings",
        entity_id: null,
        description: "Password changed",
        details: { security: "password_change" },
      });

      setCurrent("");
      setNext("");
      setConfirm("");
      setMsg({ ok: true, text: "Password updated successfully." });
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const label = "mb-1 block text-xs font-semibold text-slate-500";

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-bold text-slate-900">Change password</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Signed in as <b>{email || "…"}</b>. Your current password is verified before the change.
        </p>

        <form onSubmit={changePassword} className="mt-4 grid max-w-md gap-3">
          <div>
            <label className={label}>Current password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className={input}
            />
          </div>
          <div>
            <label className={label}>New password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className={input}
            />
            {next && (
              <div className="mt-1.5">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full transition-all ${meter.cls}`} style={{ width: meter.bar }} />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Strength: {meter.text} — at least 8 chars with upper, lower, number &amp; symbol.
                </p>
              </div>
            )}
          </div>
          <div>
            <label className={label}>Confirm new password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={input}
            />
          </div>

          {msg && (
            <p
              className={`rounded-lg px-3 py-2 text-sm ${
                msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
              }`}
            >
              {msg.text}
            </p>
          )}

          <div>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
            >
              {busy ? "Updating…" : "Update password"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Two-factor authentication</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Add an authenticator app (Google Authenticator, Authy, etc.) so sign-in also requires a 6-digit code.
            </p>
          </div>
          {mfaStatus === "enabled" && !enrolling && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Enabled
            </span>
          )}
        </div>

        {mfaStatus === "loading" ? (
          <p className="mt-4 text-sm text-slate-400">Checking…</p>
        ) : enrolling && totp ? (
          <form onSubmit={confirmEnroll} className="mt-4">
            <p className="text-xs text-slate-500">
              Scan the QR code with your authenticator app, then enter the 6-digit code below to confirm.
            </p>
            <div className="mt-3 flex flex-wrap items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={totp.qr_code}
                alt="2FA QR code"
                className="h-40 w-40 rounded-lg border border-slate-200"
              />
              <div className="min-w-[200px]">
                <p className="text-[11px] font-semibold text-slate-500">Manual entry secret</p>
                <p className="mt-1 break-all font-mono text-xs text-slate-700">{totp.secret}</p>
                <div className="mt-3">
                  <label className={label}>6-digit code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    className={input}
                    placeholder="000000"
                  />
                </div>
              </div>
            </div>

            {mfaMsg && (
              <p
                className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                  mfaMsg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                }`}
              >
                {mfaMsg.text}
              </p>
            )}

            <div className="mt-3 flex gap-2">
              <button
                type="submit"
                disabled={mfaBusy}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
              >
                {mfaBusy ? "Verifying…" : "Verify & enable"}
              </button>
              <button
                type="button"
                disabled={mfaBusy}
                onClick={() => {
                  setEnrolling(false);
                  setTotp(null);
                  setMfaFactorId(null);
                  setMfaMsg(null);
                }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : mfaStatus === "enabled" ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={disableMfa}
              disabled={mfaBusy}
              className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
            >
              {mfaBusy ? "Disabling…" : "Disable 2FA"}
            </button>
            {mfaMsg && (
              <p
                className={`rounded-lg px-3 py-2 text-sm ${
                  mfaMsg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                }`}
              >
                {mfaMsg.text}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={startEnroll}
              disabled={mfaBusy}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
            >
              {mfaBusy ? "Starting…" : "Enable 2FA"}
            </button>
            {mfaMsg && (
              <p
                className={`rounded-lg px-3 py-2 text-sm ${
                  mfaMsg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                }`}
              >
                {mfaMsg.text}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Recent sign-in attempts</h3>
            <p className="mt-0.5 text-xs text-slate-500">Every login attempt is recorded — spot brute-force activity.</p>
          </div>
          <button
            onClick={loadAttempts}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>

        {attemptsLoading ? (
          <p className="mt-4 text-sm text-slate-400">Loading…</p>
        ) : attemptsError ? (
          <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{attemptsError}</p>
        ) : attempts.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No sign-in attempts recorded yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">IP</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                      {new Date(a.created_at).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2 text-slate-800">{a.email || "-"}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          a.success ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                        }`}
                        title={a.error_message ?? ""}
                      >
                        {a.success ? "Success" : "Failed"}
                      </span>
                    </td>
                    <td className="font-mono px-3 py-2 text-[12px] text-slate-500">{a.ip || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}