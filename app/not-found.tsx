import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-12 text-white">
      <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/[0.06] p-8 text-center shadow-2xl backdrop-blur-xl sm:p-10">
        <div className="text-5xl font-black tracking-tight text-blue-500 font-mono">404</div>
        <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Cafe ERP Workspace</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-white">Page not found</h1>
        <p className="mx-auto mt-2.5 max-w-md text-xs leading-5 text-slate-400">
          The requested operational screen or record does not exist, or you may not have authorization for this path.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-500 active:scale-[0.98]"
        >
          Return to dashboard
        </Link>
      </section>
    </main>
  );
}
