export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-1" aria-busy="true" aria-label="Loading">
      <div className="overflow-hidden rounded-[30px] border border-slate-200/70 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:p-9">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 animate-pulse rounded-2xl bg-slate-200 dark:bg-white/10" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-32 animate-pulse rounded bg-slate-200 dark:bg-white/10" />
            <div className="h-7 w-64 max-w-full animate-pulse rounded bg-slate-200 dark:bg-white/10" />
          </div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-3xl border border-slate-200/70 bg-white dark:border-white/10 dark:bg-slate-900" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-3xl border border-slate-200/70 bg-white dark:border-white/10 dark:bg-slate-900" />
    </div>
  );
}
