export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-1 animate-fade-in" aria-busy="true" aria-label="Loading workspace">
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xs dark:border-white/10 dark:bg-slate-900 sm:p-8">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 animate-pulse rounded-xl bg-slate-200/80 dark:bg-white/10" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-28 animate-pulse rounded-md bg-slate-200/80 dark:bg-white/10" />
            <div className="h-6 w-56 max-w-full animate-pulse rounded-lg bg-slate-200/80 dark:bg-white/10" />
          </div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-slate-900" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-slate-900" />
    </div>
  );
}
