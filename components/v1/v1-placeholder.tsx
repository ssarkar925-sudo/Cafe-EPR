/**
 * V1 phase placeholder. Renders a clearly-unimplemented notice for route
 * slots reserved by future application phases. Contains no business logic,
 * performs no RPC calls, and implies no permissions.
 */

export default function V1Placeholder({ title, phase }: { title: string; phase: number }) {
  return (
    <section
      aria-label={`${title} placeholder`}
      className="mx-auto max-w-xl rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center dark:border-white/15 dark:bg-white/[0.02]"
    >
      <h1 className="text-lg font-extrabold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Not implemented in the current application phase. Scheduled for application phase {phase}.
      </p>
    </section>
  );
}
