"use client";

/**
 * Back-office inventory operations island. Each button invokes exactly one
 * documented G2 RPC and displays the server-returned result (counts of rows
 * transitioned, or the stuck-hold rows). Nothing is scheduled here: these
 * are explicit administrative operations, and a repeated click re-runs the
 * sweep against current server state.
 */

import { useState } from "react";
import { useV1Mutation } from "@/components/v1/v1-mutation";
import { callV1Read } from "@/lib/v1/v1-rpc";
import { createClient } from "@/lib/supabase/client";
import type { V1StuckHold } from "@/lib/v1/v1-contracts";

export function SweepButtons() {
  const expire = useV1Mutation<number>();
  const release = useV1Mutation<number>();

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.02]">
      <h2 className="text-sm font-extrabold tracking-tight">Expiry & hold sweeps</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Explicit operations (no scheduler). The server reports how many rows transitioned.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={expire.pending}
          onClick={() => void expire.run("expire_overdue_lots", {})}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
        >
          {expire.pending ? "Working…" : "Expire overdue lots"}
        </button>
        <button
          type="button"
          disabled={release.pending}
          onClick={() => void release.run("release_expired_reservations", {})}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
        >
          {release.pending ? "Working…" : "Release expired reservations"}
        </button>
      </div>
      {expire.error ? (
        <p role="alert" className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">{expire.error}</p>
      ) : null}
      {release.error ? (
        <p role="alert" className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">{release.error}</p>
      ) : null}
      {expire.data !== null && !expire.error ? (
        <p role="status" className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          Server expired {String(expire.data)} lot(s).
        </p>
      ) : null}
      {release.data !== null && !release.error ? (
        <p role="status" className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          Server released {String(release.data)} reservation(s).
        </p>
      ) : null}
    </div>
  );
}

export function StuckHoldsPanel() {
  const [rows, setRows] = useState<V1StuckHold[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setPending(true);
    setError(null);
    try {
      const supabase = createClient();
      const result = await callV1Read<V1StuckHold[]>(supabase, "stuck_holds", {});
      if (result.error) {
        setError(result.error.message);
        setRows(null);
      } else {
        setRows(result.data ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed.");
      setRows(null);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.02]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-extrabold tracking-tight">Stuck holds</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Active reservations older than 48h (2× the 24h TTL), as reported by the server.
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => void load()}
          className="shrink-0 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
        >
          {pending ? "Loading…" : rows ? "Reload" : "Show"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>
      ) : null}
      {rows !== null && (
        rows.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">No stuck holds.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-xs">
            {rows.map((r) => (
              <li key={r.reservation_id} className="font-mono text-slate-600 dark:text-slate-300">
                lot {r.lot_id.slice(0, 8)} · qty {String(r.qty)} · age {String(r.age_hours)}h
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
