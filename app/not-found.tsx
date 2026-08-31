import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-12 text-white">
      <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/[0.06] p-8 text-center shadow-2xl backdrop-blur-xl sm:p-10">
        <div className="text-6xl font-black tracking-tight">404</div>
        <p className="mt-4 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Cafe ERP</p>
        <h1 className="mt-3 text-2xl font-black">Page not found</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-400">
          The requested workspace or record does not exist, or its address has changed.
        </p>
        <Link
          href="/dashboard"
          className="mt-7 inline-flex rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-slate-200"
        >
          Return to dashboard
        </Link>
      </section>
    </main>
  );
}
