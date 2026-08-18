"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";

const MAX_ATTEMPTS = 5;
const LOCK_MS = 30 * 1000;
const LOCK_KEY = "sccomm-login-lock";

const FEATURES = [
  { title: "Point of Sale", desc: "Invoices & quick sales in one tap" },
  { title: "Billing & Ledger", desc: "Customer balances, cash book, expenses" },
  { title: "AEPS / DMT / UPI", desc: "Business transactions & settlements" },
  { title: "Reports & Analytics", desc: "Real-time KPIs, stock & profit" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [attempts, setAttempts] = useState(() => {
    try {
      return Number(sessionStorage.getItem(LOCK_KEY) || "0");
    } catch {
      return 0;
    }
  });
  const [locked, setLocked] = useState(() => {
    try {
      const until = Number(sessionStorage.getItem(LOCK_KEY + "-until") || "0");
      return Date.now() < until;
    } catch {
      return false;
    }
  });
  const [lockLeft, setLockLeft] = useState(0);
  const [mfaStep, setMfaStep] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaChallengeId, setMfaChallengeId] = useState<string | null>(null);

  async function beginMfa(): Promise<boolean> {
    const supabase = createClient();
    const { data: factors, error: fErr } = await supabase.auth.mfa.listFactors();
    if (fErr || !factors) {
      setError(fErr?.message ?? "2FA check failed.");
      return false;
    }
    const factor = factors.totp.find((f) => f.status === "verified");
    if (!factor) {
      setError("2FA is enabled for this account but no verified authenticator was found.");
      return false;
    }
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({
      factorId: factor.id,
    });
    if (cErr || !challenge) {
      setError(cErr?.message ?? "Could not start 2FA verification.");
      return false;
    }
    setMfaFactorId(factor.id);
    setMfaChallengeId(challenge.id);
    setMfaStep(true);
    return true;
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaFactorId || !mfaCode.trim()) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setLoading(true);
    setError(null);

    const supabase = createClient();
    let challengeId = mfaChallengeId;
    if (!challengeId) {
      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({
        factorId: mfaFactorId,
      });
      if (cErr || !challenge) {
        setError(cErr?.message ?? "Could not start 2FA verification.");
        setLoading(false);
        return;
      }
      challengeId = challenge.id;
      setMfaChallengeId(challenge.id);
    }

    const { data, error } = await supabase.auth.mfa.verify({
      factorId: mfaFactorId,
      challengeId,
      code: mfaCode.trim(),
    });
    if (error) {
      setError(`2FA code incorrect. ${error.message}`);
      setMfaChallengeId(null);
      setMfaCode("");
      setLoading(false);
      return;
    }

    setAttempts(0);
    try {
      sessionStorage.removeItem(LOCK_KEY);
      sessionStorage.removeItem(LOCK_KEY + "-until");
    } catch {
      /* ignore */
    }

    logAudit({
      action: "login",
      entity: "auth",
      entity_id: data.user?.id,
      description: `Signed in with 2FA as ${data.user?.email ?? email}`,
    });

    router.push("/dashboard");
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (locked) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    supabase.rpc("log_login_attempt", {
      p_email: email,
      p_success: !error,
      p_error: error?.message ?? null,
    });

    if (error) {
      const next = attempts + 1;
      setAttempts(next);
      try {
        sessionStorage.setItem(LOCK_KEY, String(next));
      } catch {
        /* ignore */
      }
      if (next >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCK_MS;
        setLocked(true);
        setLockLeft(LOCK_MS);
        setError(`Too many failed attempts. Try again in 30 seconds.`);
        try {
          sessionStorage.setItem(LOCK_KEY + "-until", String(until));
        } catch {
          /* ignore */
        }
        const t = setInterval(() => {
          const left = until - Date.now();
          setLockLeft(Math.max(0, left));
          if (left <= 0) {
            clearInterval(t);
            setLocked(false);
            setAttempts(0);
            try {
              sessionStorage.removeItem(LOCK_KEY);
              sessionStorage.removeItem(LOCK_KEY + "-until");
            } catch {
              /* ignore */
            }
          }
        }, 500);
      } else {
        setError(`${error.message} (${next}/${MAX_ATTEMPTS} attempts)`);
      }
      setLoading(false);
      return;
    }

    setAttempts(0);
    try {
      sessionStorage.removeItem(LOCK_KEY);
      sessionStorage.removeItem(LOCK_KEY + "-until");
    } catch {
      /* ignore */
    }

    // 2FA is required when GoTrue returns no session (weak session) OR when the
    // returned session is only aal1 while the user has verified aal2 (TOTP) factors.
    let mfaRequired = !data.session;
    if (!mfaRequired) {
      const { data: aal, error: aalErr } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      mfaRequired = !aalErr && aal?.nextLevel === "aal2";
    }
    if (mfaRequired) {
      const started = await beginMfa();
      setLoading(false);
      if (started) {
        setError(null);
        setMfaCode("");
      }
      return;
    }

    logAudit({
      action: "login",
      entity: "auth",
      entity_id: data.user?.id,
      description: `Signed in as ${data.user?.email ?? email}`,
    });

    router.push("/dashboard");
    router.refresh();
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/auth/confirm-reset`,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setResetSent(true);
  }

  const fieldCls =
    "w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pl-10 pr-10 text-sm text-white placeholder:text-slate-500 outline-none backdrop-blur transition focus:border-indigo-400/60 focus:bg-white/[0.06] focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070a14] px-4 py-10 font-sans text-white">
      {/* Ambient glow orbs */}
      <div className="pointer-events-none fixed inset-0" aria-hidden>
        <div className="absolute -left-40 -top-48 h-[36rem] w-[36rem] rounded-full bg-indigo-600/25 blur-3xl" />
        <div className="absolute -right-40 top-1/4 h-[32rem] w-[32rem] rounded-full bg-violet-600/20 blur-3xl" />
        <div className="absolute -bottom-52 left-1/3 h-[30rem] w-[30rem] rounded-full bg-sky-500/15 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#070a14_75%)]" />
      </div>

      <div className="relative grid w-full max-w-5xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
        {/* Left: brand panel (desktop) */}
        <div className="hidden lg:block">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-indigo-900/40">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
                <path d="M7 10h10M9 7l3 3 3-3M9 16l3-3 3 3" />
              </svg>
            </div>
            <div>
              <p className="text-xl font-bold tracking-tight">Cafe ERP</p>
              <p className="text-xs font-medium text-slate-400">Point of Sale &amp; Business Suite</p>
            </div>
          </div>

          <h1 className="mt-10 text-4xl font-bold leading-tight tracking-tight">
            Run your cafe.
            <br />
            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              We&apos;ll handle the rest.
            </span>
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-400">
            One dashboard for billing, inventory, customers, cash and digital payment services — built for busy shop floors.
          </p>

          <ul className="mt-10 space-y-4">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-200">{f.title}</p>
                  <p className="text-xs text-slate-500">{f.desc}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-10 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur">
            <svg viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <p className="text-xs text-slate-400">
              Secured with <span className="font-semibold text-slate-200">2FA</span>, audit logging and role-based access.
            </p>
          </div>
        </div>

        {/* Right: auth card */}
        <div className="mx-auto w-full max-w-md">
          <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-7 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
            {/* Mobile brand */}
            <div className="mb-7 flex items-center gap-3 lg:hidden">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-indigo-900/40">
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5.5 w-5.5">
                  <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
                  <path d="M7 10h10M9 7l3 3 3-3M9 16l3-3 3 3" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-bold tracking-tight">Cafe ERP</p>
                <p className="text-xs text-slate-400">Point of Sale &amp; Business Suite</p>
              </div>
            </div>

            <div className="mb-6">
              {showReset ? (
                <>
                  <h2 className="text-xl font-bold tracking-tight">Reset your password</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    We&apos;ll email you a secure reset link.
                  </p>
                </>
              ) : mfaStep ? (
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/30">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
                    </svg>
                  </span>
                  <div>
                    <h2 className="text-xl font-bold tracking-tight">Two-factor check</h2>
                    <p className="text-sm text-slate-400">Confirm it&apos;s really you.</p>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-xl font-bold tracking-tight">Welcome back</h2>
                  <p className="mt-1 text-sm text-slate-400">Sign in to continue to your dashboard.</p>
                </>
              )}
            </div>

            <form
              onSubmit={showReset ? handleReset : mfaStep ? handleMfa : handleSubmit}
              className="space-y-4"
            >
              {!showReset && (
                <>
                  {!mfaStep ? (
                    <>
                      <div>
                        <label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-slate-300">
                          Email
                        </label>
                        <div className="relative">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500">
                            <rect x="2" y="4" width="20" height="16" rx="2" />
                            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                          </svg>
                          <input
                            id="email"
                            type="email"
                            required
                            disabled={locked}
                            autoComplete="email"
                            placeholder="you@shop.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className={fieldCls}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="mb-1.5 flex items-center justify-between">
                          <label htmlFor="password" className="text-xs font-semibold text-slate-300">
                            Password
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowReset(true)}
                            className="text-xs font-medium text-indigo-300 transition hover:text-indigo-200"
                          >
                            Forgot?
                          </button>
                        </div>
                        <div className="relative">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500">
                            <rect x="3" y="11" width="18" height="11" rx="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                          <input
                            id="password"
                            type={showPw ? "text" : "password"}
                            required
                            disabled={locked}
                            autoComplete="current-password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={fieldCls}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPw((v) => !v)}
                            aria-label={showPw ? "Hide password" : "Show password"}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-300"
                          >
                            {showPw ? (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                <path d="m1 1 22 22" />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div>
                      <label htmlFor="mfa-code" className="mb-1.5 block text-xs font-semibold text-slate-300">
                        Authenticator code
                      </label>
                      <input
                        id="mfa-code"
                        type="text"
                        required
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        autoFocus
                        placeholder="6-digit code"
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.target.value)}
                        className={fieldCls + " text-center text-lg tracking-[0.4em]"}
                      />
                      <p className="mt-2 text-xs text-slate-500">
                        Enter the 6-digit code from your authenticator app to finish signing in.
                      </p>
                    </div>
                  )}
                </>
              )}

              {error && (
                <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-300">
                  {error}
                </p>
              )}

              {!showReset ? (
                <>
                  <button
                    type="submit"
                    disabled={loading || locked}
                    className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition hover:shadow-indigo-800/50 active:scale-[0.99] disabled:opacity-60"
                  >
                    <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                    <span className="relative flex items-center justify-center gap-2">
                      {loading && (
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
                        </svg>
                      )}
                      {locked
                        ? `Try again in ${Math.ceil(lockLeft / 1000)}s`
                        : loading
                          ? mfaStep
                            ? "Verifying…"
                            : "Signing in…"
                          : mfaStep
                            ? "Verify code"
                            : "Sign in"}
                    </span>
                  </button>

                  {mfaStep && (
                    <button
                      type="button"
                      onClick={() => {
                        setMfaStep(false);
                        setMfaCode("");
                        setError(null);
                      }}
                      className="w-full text-center text-xs font-medium text-slate-400 transition hover:text-slate-200"
                    >
                      ← Back to sign in
                    </button>
                  )}
                </>
              ) : resetSent ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-300">
                  <p className="font-semibold">Check your email</p>
                  <p className="mt-0.5 text-xs text-emerald-400/80">A reset link is on its way to {resetEmail || "your inbox"}.</p>
                </div>
              ) : (
                <>
                  <div>
                    <label htmlFor="reset-email" className="mb-1.5 block text-xs font-semibold text-slate-300">
                      Email
                    </label>
                    <div className="relative">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500">
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                      </svg>
                      <input
                        id="reset-email"
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="you@shop.com"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        className={fieldCls}
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition hover:brightness-110 active:scale-[0.99]"
                  >
                    Send reset link
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowReset(false)}
                    className="w-full text-center text-xs font-medium text-slate-400 transition hover:text-slate-200"
                  >
                    ← Back to sign in
                  </button>
                </>
              )}
            </form>
          </div>

          <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-slate-600">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Protected by role-based access &amp; audit logging
          </p>
        </div>
      </div>
    </div>
  );
}