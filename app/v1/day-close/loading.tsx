export default function V1DayCloseLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4" aria-label="Loading day close" aria-busy="true">
      <div className="h-7 w-40 rounded-lg bg-slate-200 dark:bg-white/10" />
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading day-close records…</p>
      </div>
    </div>
  );
}
