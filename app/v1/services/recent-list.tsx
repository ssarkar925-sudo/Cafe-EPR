import { ReverseServiceAction } from "./reverse-action";

export interface RecentSvcRow {
  id: string;
  transaction_number: string;
  transaction_date: string;
  amount: number;
  fee: number;
  commission: number;
  status: string;
  recorded_at: string;
  refs: { label: string; value: string }[];
}

/**
 * Recent service records (server). Read-only list over the tenant-scoped
 * snapshot the page already loaded; reversal actions render only for rows
 * still in 'recorded' state on a back-office page (the RPC re-enforces
 * both conditions server-side).
 */
export function RecentServiceList({ rows }: { rows: RecentSvcRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        No records yet. Recorded transactions will appear here.
      </p>
    );
  }
  return (
    <ul className="mt-2 divide-y divide-slate-100 dark:divide-white/5">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">
              <span className="font-mono">{r.transaction_number}</span>
              <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold dark:bg-white/10">
                {r.status}
              </span>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {r.transaction_date} · amount {Number(r.amount).toFixed(2)}
              {Number(r.fee) > 0 ? ` · fee ${Number(r.fee).toFixed(2)}` : ""}
              {Number(r.commission) > 0 ? ` · commission ${Number(r.commission).toFixed(2)}` : ""}
            </p>
            {r.refs.length > 0 && (
              <p className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                {r.refs.map((ref) => `${ref.label}: ${ref.value}`).join(" · ")}
              </p>
            )}
          </div>
          {r.status === "recorded" && (
            <ReverseServiceAction serviceId={r.id} transactionNumber={r.transaction_number} />
          )}
        </li>
      ))}
    </ul>
  );
}
