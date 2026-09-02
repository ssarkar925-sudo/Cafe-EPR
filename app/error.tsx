"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Cafe ERP application error", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-white">
        <main className="flex min-h-screen items-center justify-center px-6 py-12">
          <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/[0.06] p-8 text-center shadow-2xl backdrop-blur-xl sm:p-10">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20 text-lg font-black">!</div>
            <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Cafe ERP System Notice</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl text-white">Something went wrong</h1>
            <p className="mx-auto mt-2.5 max-w-md text-xs leading-5 text-slate-400">
              The application encountered an unexpected runtime error. Your saved business records and database state are safe.
            </p>
            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => reset()}
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-500 active:scale-[0.98]"
              >
                Retry action
              </button>
              <button
                type="button"
                onClick={() => window.location.assign("/dashboard")}
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-white/10 active:scale-[0.98]"
              >
                Back to dashboard
              </button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
