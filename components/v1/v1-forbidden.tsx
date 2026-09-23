/**
 * V1 access-denied view (server component). Rendered by pages when the
 * caller's role does not include the surface. Display-only: the backend
 * would deny the underlying reads/mutations regardless.
 */

export default function V1Forbidden({ surface }: { surface: string }) {
  return (
    <section
      aria-label="Access denied"
      className="mx-auto max-w-xl rounded-2xl border border-rose-200 bg-white p-8 text-center dark:border-rose-500/20 dark:bg-white/[0.02]"
    >
      <h1 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
        Admin access required
      </h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        The {surface} surface is limited to authorized roles. Your role does not include it, and the
        backend would deny the underlying operations.
      </p>
    </section>
  );
}
