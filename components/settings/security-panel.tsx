"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { useToast } from "@/components/ui/use-toast";
import SettingsSection from "@/components/settings/settings-section";

type Attempt = {
  email: string | null;
  success: boolean;
  ip: string | null;
  created_at: string;
};

function strength(password: string) {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return score;
}

function strengthLabel(score: number) {
  if (score >= 6) return { text: "Very Strong", width: "100%", cls: "bg-emerald-500" };
  if (score >= 5) return { text: "Strong", width: "84%", cls: "bg-emerald-500" };
  if (score >= 4) return { text: "Good", width: "66%", cls: "bg-blue-500" };
  if (score >= 3) return { text: "Fair", width: "50%", cls: "bg-amber-500" };
  if (score >= 1) return { text: "Weak", width: "34%", cls: "bg-rose-500" };
  return { text: "Too Short", width: "10%", cls: "bg-slate-300" };
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
  const [autoLockTimeout, setAutoLockTimeout] = useState("30");

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setEmail(data.user?.email ?? "");
    });
    supabase.rpc("recent_login_attempts", { p_limit: 20 }).then(({ data }) => {
      if (mounted) setAttempts((data ?? []) as Attempt[]);
      if (mounted) setAttemptsLoading(false);
    });
    try {
      setAutoLockTimeout(localStorage.getItem("sccomm-autolock-min") || "30");
    } catch {}
    return () => { mounted = false; };
  }, [supabase]);

  const score = strength(next);
  const meter = strengthLabel(score);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!current) return showToast("error", "Enter your current password.");
    if (next.length < 8) return showToast("error", "New password must be at least 8 characters.");
    if (score < 4) return showToast("error", "Please choose a stronger password with numbers and symbols.");
    if (next !== confirm) return showToast("error", "New passwords do not match.");
    if (next === current) return showToast("error", "New password must differ from current password.");

    setBusy(true);
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: current });
      if (verifyError) {
        showToast("error", "Current password is incorrect.");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) {
        showToast("error", `Password change failed: ${error.message}`);
        return;
      }
      logAudit({ action: "settings", entity: "settings", entity_id: null, description: "Password updated successfully", details: { security: "password_change" } });
      setCurrent("");
      setNext("");
      setConfirm("");
      showToast("success", "Password updated successfully.");
    } finally {
      setBusy(false);
    }
  }

  function setAutoLock(min: string) {
    setAutoLockTimeout(min);
    try {
      localStorage.setItem("sccomm-autolock-min", min);
      showToast("success", min === "0" ? "Auto-lock disabled" : `Auto-lock set to ${min} minutes`);
    } catch {}
  }

  const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 shadow-xs outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-900/30";
  const labelClass = "mb-1.5 block text-xs font-extrabold text-slate-700 dark:text-slate-300";

  return (
    <div className={active ? "mt-6 space-y-6" : "hidden"}>
      <SettingsSection icon="M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2zm10-10V7a4 4 0 0 0-8 0v4h8z" tone="blue" title="Admin Credentials & Password" desc="Update the master login password used to access Cafe ERP.">
        <form onSubmit={changePassword} className="space-y-4">
          <div>
            <label className={labelClass}>Current Password</label>
            <div className="relative">
              <input type={showCurrent ? "text" : "password"} required value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="••••••••••••" className={inputClass} />
              <button type="button" onClick={() => setShowCurrent((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">{showCurrent ? "Hide" : "Show"}</button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>New Password</label>
              <div className="relative">
                <input type={showNext ? "text" : "password"} required value={next} onChange={(e) => setNext(e.target.value)} placeholder="At least 8 characters" className={inputClass} />
                <button type="button" onClick={() => setShowNext((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">{showNext ? "Hide" : "Show"}</button>
              </div>
              {next && <div className="mt-2 space-y-1"><div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10"><div className={`h-full ${meter.cls}`} style={{ width: meter.width }} /></div><div className="flex justify-between text-[10px] font-bold text-slate-400"><span>Strength: {meter.text}</span><span>{next.length} chars</span></div></div>}
            </div>
            <div><label className={labelClass}>Confirm New Password</label><input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter new password" className={inputClass} /></div>
          </div>
          <div className="flex justify-end"><button type="submit" disabled={busy || !current || !next || !confirm} className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-md disabled:opacity-50">{busy ? "Updating Password…" : "Update Password"}</button></div>
        </form>
      </SettingsSection>

      <SettingsSection icon="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" tone="emerald" title="Two-Factor Authentication (2FA)" desc="Authenticator setup is maintained in the dedicated Security module so there is one authoritative TOTP implementation.">
        <div className="flex flex-col gap-4 rounded-2xl border border-emerald-200/70 bg-emerald-50/50 p-4 dark:border-emerald-500/20 dark:bg-emerald-950/20 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="text-sm font-extrabold text-slate-900 dark:text-white">Authenticator App (TOTP)</div><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Enable, verify, or disable 2FA from the canonical Security module.</p></div>
          <Link href="/security" className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2 text-center text-xs font-extrabold text-white shadow-sm hover:bg-emerald-700">Open Security →</Link>
        </div>
      </SettingsSection>

      <SettingsSection icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" tone="violet" title="Terminal Inactivity Auto-Lock" desc="Automatically locks the POS billing screen when left unattended at the counter.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[{ min: "5", label: "5 Minutes" }, { min: "15", label: "15 Minutes" }, { min: "30", label: "30 Minutes" }, { min: "60", label: "1 Hour" }, { min: "0", label: "Never (Disabled)" }].map((item) => {
            const selected = autoLockTimeout === item.min;
            return <button key={item.min} type="button" onClick={() => setAutoLock(item.min)} className={`rounded-2xl border p-3 text-center transition ${selected ? "border-violet-500 bg-violet-50/70 ring-2 ring-violet-500/20 dark:border-violet-500 dark:bg-violet-950/40" : "border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-slate-900"}`}><span className="block text-xs font-extrabold text-slate-900 dark:text-white">{item.label}</span>{selected && <span className="mt-1 inline-block rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-black text-violet-800 dark:bg-violet-950 dark:text-violet-300">Active ✓</span>}</button>;
          })}
        </div>
      </SettingsSection>

      <SettingsSection icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" tone="slate" title="Recent Security & Access Log" desc="Recent terminal login and authentication attempts.">
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white dark:border-white/10 dark:bg-slate-900"><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:border-white/5 dark:bg-white/[0.02]"><tr><th className="px-4 py-3">Timestamp</th><th className="px-4 py-3">User / Account</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">IP Address</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-white/5">{attemptsLoading ? <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">Loading security records…</td></tr> : attempts.length === 0 ? <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">No security audit events recorded.</td></tr> : attempts.slice(0, 10).map((attempt, index) => <tr key={`${attempt.created_at}-${index}`}><td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{new Date(attempt.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td><td className="px-4 py-2.5 font-bold text-slate-900 dark:text-white">{attempt.email || email}</td><td className="px-4 py-2.5"><span className={attempt.success ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300" : "rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"}>{attempt.success ? "Success ✓" : "Rejected ✕"}</span></td><td className="px-4 py-2.5 font-mono text-[11px] text-slate-400">{attempt.ip || "127.0.0.1"}</td></tr>)}</tbody></table></div></div>
      </SettingsSection>
      {toastView}
    </div>
  );
}
