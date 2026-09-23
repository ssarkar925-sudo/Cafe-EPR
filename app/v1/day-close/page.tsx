import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getV1SessionContext, requireV1BackOffice } from "@/lib/v1/v1-auth-context";
import V1Forbidden from "@/components/v1/v1-forbidden";
import { CloseWorkspace, OpenDayForm, type CloseLine } from "./actions";

interface CloseRow {
  id: string;
  business_date: string;
  status: string;
  opened_at: string;
  closed_at: string | null;
}

interface LineRow {
  instrument_id: string;
  expected: number;
  counted: number | null;
  variance: number | null;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Day Close (server). Back-office only (managers record/close, admins
 * additionally approve); staff and cashiers see nothing here and the RPCs
 * deny them independently. All figures come from server snapshots and
 * RPC responses; the browser only enters counts and drives workflow.
 */
export default async function V1DayClose({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await getV1SessionContext();
  if (!requireV1BackOffice(session)) return <V1Forbidden surface="Day Close" />;

  const params = await searchParams;
  const date = (params.date ?? "").trim() || todayISO();
  const supabase = await createClient();

  const [closeRes, recentRes, instrumentsRes, lockRes] = await Promise.all([
    supabase
      .from("day_closes")
      .select("id, business_date, status, opened_at, closed_at")
      .eq("tenant_id", session.tenantId)
      .eq("business_date", date)
      .maybeSingle(),
    supabase
      .from("day_closes")
      .select("id, business_date, status")
      .eq("tenant_id", session.tenantId)
      .order("business_date", { ascending: false })
      .limit(20),
    supabase.from("payment_instruments").select("id, name").eq("tenant_id", session.tenantId).limit(200),
    supabase
      .from("period_locks")
      .select("locked_date, reason, locked_at")
      .eq("tenant_id", session.tenantId)
      .eq("locked_date", date)
      .maybeSingle(),
  ]);

  const readError = closeRes.error?.message ?? recentRes.error?.message ?? instrumentsRes.error?.message ?? null;
  if (readError) {
    return (
      <div className="mx-auto max-w-3xl">
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          Day-close records failed to load: {readError}
        </p>
      </div>
    );
  }

  const close = (closeRes.data ?? null) as CloseRow | null;
  const names = new Map<string, string>(
    (((instrumentsRes.data ?? []) as { id: string; name: string }[]) ?? []).map((i) => [i.id, i.name]),
  );

  let lines: CloseLine[] = [];
  if (close) {
    const { data: lineData, error: lineError } = await supabase
      .from("day_close_lines")
      .select("instrument_id, expected, counted, variance")
      .eq("tenant_id", session.tenantId)
      .eq("day_close_id", close.id)
      .order("instrument_id");
    if (lineError) {
      return (
        <div className="mx-auto max-w-3xl">
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
            Day-close lines failed to load: {lineError.message}
          </p>
        </div>
      );
    }
    lines = ((lineData ?? []) as LineRow[]).map((l) => ({
      instrument_id: l.instrument_id,
      instrument_name: names.get(l.instrument_id) ?? l.instrument_id.slice(0, 8),
      expected: Number(l.expected),
      counted: l.counted === null ? null : Number(l.counted),
      variance: l.variance === null ? null : Number(l.variance),
    }));
  }

  const lock = (lockRes.data ?? null) as { locked_date: string; reason: string; locked_at: string } | null;
  const recent = ((recentRes.data ?? []) as CloseRow[]).filter((r) => r.business_date !== date);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-extrabold tracking-tight">Day Close</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {session.profile.display_name} · <span className="font-mono">{session.role}</span> ·{" "}
            {close ? (
              <span>
                {close.business_date} · status <span className="font-mono font-bold">{close.status}</span>
              </span>
            ) : (
              <span>No open day for {date}</span>
            )}
          </p>
        </div>
        <form action="/v1/day-close" method="get" className="flex items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">Date</span>
            <input
              type="date"
              name="date"
              defaultValue={date}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
            />
          </label>
          <button
            type="submit"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            View
          </button>
        </form>
      </div>

      {lock && (
        <p role="status" className="rounded-xl border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-bold dark:border-white/15 dark:bg-white/5">
          Period locked for {lock.locked_date} ({lock.reason}). Historical counts are immutable.
        </p>
      )}

      {!close && !lock && (
        <section
          aria-label="Open day"
          className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"
        >
          <h2 className="text-sm font-extrabold tracking-tight">No open day</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Opening snapshots server-side expected balances for every active instrument.
          </p>
          <div className="mt-3">
            <OpenDayForm businessDate={date} />
          </div>
        </section>
      )}

      {close && (
        <section
          aria-label="Day close workspace"
          className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"
        >
          <CloseWorkspace
            closeId={close.id}
            businessDate={close.business_date}
            status={close.status}
            lines={lines}
            isAdmin={session.isAdmin}
          />
        </section>
      )}

      {recent.length > 0 && (
        <section
          aria-label="Recent closes"
          className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"
        >
          <h2 className="text-sm font-extrabold tracking-tight">Recent closes</h2>
          <ul className="mt-2 divide-y divide-slate-100 dark:divide-white/5">
            {recent.map((r) => (
              <li key={r.id} className="py-1.5">
                <Link
                  href={`/v1/day-close?date=${r.business_date}`}
                  className="flex items-center justify-between text-sm transition hover:underline"
                >
                  <span className="font-mono">{r.business_date}</span>
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold dark:bg-white/10">
                    {r.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
