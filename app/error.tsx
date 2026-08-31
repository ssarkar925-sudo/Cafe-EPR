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
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-xl font-black text-slate-950">!</div>
            <p className="mt-6 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Cafe ERP</p>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Something went wrong</h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-400">
              The application hit an unexpected error. Your saved business data is not changed by this screen.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => reset()}
                className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-slate-200"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => window.location.assign("/dashboard")}
                className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-black text-white transition hover:bg-white/10"
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
