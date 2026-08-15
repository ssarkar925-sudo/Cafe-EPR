"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

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

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">
            Cafe ERP
          </h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to continue</p>
        </div>

        <form
          onSubmit={showReset ? handleReset : handleSubmit}
          className="space-y-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
        >
          {!showReset && (
            <>
              <div>
                <label
                  htmlFor="email"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          {!showReset ? (
            <>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>
              <button
                type="button"
                onClick={() => setShowReset(true)}
                className="w-full text-center text-sm text-blue-600 hover:text-blue-800"
              >
                Forgot password?
              </button>
            </>
          ) : resetSent ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Check your email for a reset link.
            </p>
          ) : (
            <>
              <div>
                <label
                  htmlFor="reset-email"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Email
                </label>
                <input
                  id="reset-email"
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                Send reset link
              </button>
              <button
                type="button"
                onClick={() => setShowReset(false)}
                className="w-full text-center text-sm text-slate-500 hover:text-slate-700"
              >
                Back to sign in
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
