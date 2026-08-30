"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";

function num(value: unknown) {
  return Number(value) || 0;
}

type Pool = { opening: number; movements: number; current: number };

export default function UpiReconciliationCard() {
  const supabase = createClient();
  const [pool, setPool] = useState<Pool | null>(null);
  const [transactionCredit, setTransactionCredit] = useState(0);
  const [transactionOut, setTransactionOut] = useState(0);
  const [upiFees, setUpiFees] = useState(0);
  const [cashEntryNet, setCashEntryNet] = useState(0);
  const [settlementNet, setSettlementNet] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [{ data: poolData }, { data: txns }, { data: entries }, { data: settlements }] = await Promise.all([
      supabase.rpc("get_pool_balances"),
      supabase
        .from("transactions")
        .select("pool_credit, pool_out, pool_credit_type, upi_fee, status")
        .eq("status", "success"),
      supabase
        .from("cash_entries")
        .select("direction, amount, method, ref_type")
        .in("method", ["upi", "upi_qr", "qr"]),
      supabase
        .from("settlements")
        .select("from_pool, to_pool, amount, status")
        .eq("status", "success"),
    ]);

    const p = (poolData as Record<string, Pool> | null)?.upi_qr;
    setPool(p ?? null);

    let credit = 0;
    let out = 0;
    let fees = 0;
    for (const t of txns ?? []) {
      if (t.pool_credit_type === "upi_qr") credit += num(t.pool_credit);
      if (t.pool_credit_type === "upi_qr") out += num(t.pool_out);
      fees += num(t.upi_fee);
    }
    setTransactionCredit(credit);
    setTransactionOut(out);
    setUpiFees(fees);

    let entryNet = 0;
    for (const e of entries ?? []) {
      if (e.ref_type === "transaction" || e.ref_type === "settlement") continue;
      entryNet += e.direction === "in" ? num(e.amount) : -num(e.amount);
    }
    setCashEntryNet(entryNet);

    let settlement = 0;
    for (const s of settlements ?? []) {
      if (s.to_pool === "upi_qr") settlement += num(s.amount);
      if (s.from_pool === "upi_qr") settlement -= num(s.amount);
    }
    setSettlementNet(settlement);
    setLastUpdated(new Date());
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel("upi-reconciliation-card")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_entries" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "settlements" }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, refresh]);

  const calculated = useMemo(() => {
    if (!pool) return 0;
    return num(pool.opening) + transactionCredit - transactionOut + upiFees + cashEntryNet + settlementNet;
  }, [pool, transactionCredit, transactionOut, upiFees, cashEntryNet, settlementNet]);

  const canonical = num(pool?.current);
  const variance = calculated - canonical;
  const reconciled = pool !== null && Math.abs(variance) < 0.005;

  return (
    <section className="mb-6 overflow-hidden rounded-[24px] border border-emerald-200/70 bg-white/90 shadow-[0_8px_35px_rgba(16,185,129,.08)] backdrop-blur-xl dark:border-emerald-900/40 dark:bg-slate-900/90">
      <div className="flex flex-col gap-4 border-b border-emerald-100/80 bg-gradient-to-r from-emerald-50/80 via-white to-cyan-50/60 px-5 py-4 dark:border-emerald-900/30 dark:from-emerald-950/30 dark:via-slate-900 dark:to-cyan-950/20 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M3 10h18M5 10v8m4-8v8m6-8v8m4-8v8M3 18h18M12 3l9 5H3l9-5Z" />
            </svg>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">UPI Reconciliation</h2>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${reconciled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"}`}>
                {loading ? "Checking…" : reconciled ? "✓ Reconciled" : "⚠ Variance detected"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Live UPI QR balance with a transparent source-by-source audit trail.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl border border-emerald-100 bg-white/80 px-4 py-2 text-right dark:border-white/10 dark:bg-slate-950/50">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Current UPI Balance</p>
            <p className="text-xl font-black text-emerald-700 dark:text-emerald-300">{loading ? "…" : inr(canonical)}</p>
          </div>
          <button type="button" onClick={() => void refresh()} disabled={loading} className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-white/5 dark:hover:text-white" title="Refresh reconciliation">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}><path d="M20 11a8 8 0 0 0-14.9-4M4 4v4h4M4 13a8 8 0 0 0 14.9 4M20 20v-4h-4" /></svg>
          </button>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Opening", pool?.opening ?? 0, "bg-slate-50 dark:bg-white/5"],
          ["UPI transaction credits", transactionCredit, "bg-emerald-50/70 dark:bg-emerald-950/20"],
          ["UPI transaction outflows", -transactionOut, "bg-rose-50/70 dark:bg-rose-950/20"],
          ["UPI fees", upiFees, "bg-cyan-50/70 dark:bg-cyan-950/20"],
          ["Other UPI + settlements", cashEntryNet + settlementNet, "bg-violet-50/70 dark:bg-violet-950/20"],
        ].map(([label, value, cls]) => (
          <div key={String(label)} className={`rounded-xl border border-slate-100 px-3 py-2.5 dark:border-white/5 ${cls}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-200">{inr(num(value))}</p>
          </div>
        ))}
      </div>

      <div className="mx-4 mb-4 rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-2.5 dark:border-white/10 dark:bg-slate-950/30">
        <div className="flex flex-col gap-1.5 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p className="text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-700 dark:text-slate-200">Reconciliation:</span> {inr(pool?.opening ?? 0)} + {inr(transactionCredit)} − {inr(transactionOut)} + {inr(upiFees)} + {inr(cashEntryNet + settlementNet)}
          </p>
          <p className={`font-bold ${reconciled ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
            = {inr(calculated)} · Variance {inr(variance)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-5 py-2.5 text-[10px] text-slate-400 dark:border-white/5">
        <span>Canonical source: get_pool_balances → upi_qr</span>
        <span>{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
      </div>
    </section>
  );
}
