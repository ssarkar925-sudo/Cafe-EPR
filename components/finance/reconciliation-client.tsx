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
  const [selectedCreditCardId, setSelectedCreditCardId] = useState<string | null>(null);

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
        supabase.from("cash_entries").select("id, instrument_id, direction, amount, created_at, description, method, ref_type, ref_id, entry_date").not("instrument_id", "is", null),
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

function getPoolForInstrumentType(type?: string | null): string | null {
  if (!type) return null;
  const t = type.toLowerCase();
  if (t === "upi_qr" || t === "upi") return "upi_qr";
  if (t === "bank" || t === "debit_card") return "bank";
  if (t === "cash") return "cash";
  if (t === "aeps_portal" || t === "aeps") return "aeps";
  if (t === "dmt_portal" || t === "dmt") return "dmt";
  if (t === "wallet") return "wallet";
  if (t === "credit_card") return "credit_card";
  return null;
}

function getPoolForMethod(method?: string | null): string | null {
  if (!method) return null;
  const m = method.toLowerCase();
  if (m === "upi" || m === "upi_qr" || m === "qr") return "upi_qr";
  if (m === "bank" || m === "net_banking" || m === "card" || m === "debit_card") return "bank";
  if (m === "cash") return "cash";
  if (m === "aeps" || m === "aeps_portal") return "aeps";
  if (m === "dmt" || m === "dmt_portal") return "dmt";
  if (m === "wallet") return "wallet";
  if (m === "credit_card") return "credit_card";
  return null;
}

  // Compute detailed reconciliation for every pool
  const roundMoney = (value: number) => Math.round(value * 100) / 100;
  // ROOT ACCOUNTING RULE: reconciliation uses canonical instrument balances + same-day cash entries exactly once.
  const poolReconMap = useMemo(() => {
    const map: Record<string, PoolReconDetail> = {};
    if (!balances) return map;

    for (const cfg of POOL_CONFIGS) {
      const poolEntry = (balances as any)[cfg.key] || { opening: 0, movements: 0, current: 0, seed_date: null };
      const poolInstruments = instruments.filter((i: any) =>
        i.is_active !== false && i.type !== "debit_card" && getPoolForInstrumentType(i.type) === cfg.key
      );
      const canonicalBal = poolInstruments.reduce((sum: number, i: any) => sum + Number(i.current_balance ?? i.balance ?? 0), 0);
      const rpcCurrent = Number(poolEntry.current ?? 0);
      const openingBal = Number(poolEntry.opening ?? 0);
      const asOf = String(poolEntry.seed_date ?? new Date().toISOString().slice(0, 10));

      let credits = 0;
      let debits = 0;
      let settlementNet = 0;
      const txList: PoolReconDetail["contributingTxns"] = [];

      for (const e of cashEntries) {
        const inst = e.instrument_id ? instruments.find((i: any) => i.id === e.instrument_id) : undefined;
        if (!inst || inst.type === "debit_card" || getPoolForInstrumentType(inst.type) !== cfg.key) continue;
        if (String(e.entry_date ?? e.created_at ?? "").slice(0, 10) !== asOf) continue;

        const amount = Math.abs(Number(e.amount) || 0);
        if (e.direction === "out") debits += amount;
        else credits += amount;
        if (e.ref_type === "settlement") settlementNet += e.direction === "out" ? -amount : amount;
        txList.push({
          id: e.id,
          number: e.ref_type ? String(e.ref_type).replaceAll("_", " ").toUpperCase() : "CASH-ENTRY",
          type: e.direction === "out" ? "Outflow" : "Inflow",
          amount: e.direction === "out" ? -amount : amount,
          date: e.created_at,
          desc: e.description || "Canonical ledger movement",
        });
      }

      const ledgerNet = credits - debits;
      const calculatedBal = roundMoney(openingBal + ledgerNet);
      const instrumentCurrent = roundMoney(canonicalBal);
      const aggregationVariance = roundMoney(instrumentCurrent - rpcCurrent);
      const variance = roundMoney(calculatedBal - instrumentCurrent);
      const isReconciled = Math.abs(variance) < 0.01 && Math.abs(aggregationVariance) < 0.01;

      map[cfg.key] = {
        key: cfg.key,
        label: cfg.label,
        icon: cfg.icon,
        grad: cfg.grad,
        currentBalance: instrumentCurrent,
        openingBalance: openingBal,
        credits: roundMoney(credits),
        debits: roundMoney(debits),
        fees: 0,
        settlements: roundMoney(settlementNet),
        otherMovements: roundMoney(ledgerNet - settlementNet),
        calculatedBalance: calculatedBal,
        canonicalBalance: instrumentCurrent,
        variance: roundMoney(variance),
        isReconciled,
        canonicalSource: "payment_instruments.current_balance + cash_entries (" + asOf + ")",
        contributingTxns: txList,
      };
    }

    return map;
  }, [balances, cashEntries, instruments]);

  const allReconciled = useMemo(() => Object.values(poolReconMap).every((p) => p.isReconciled), [poolReconMap]);

  // ── Credit Card Facility Audit ──────────────────────────────────────────────
  // Credit cards: OUT cash entries increase outstanding; IN entries reduce outstanding.
  const creditCardAudit = useMemo(() => {
    const cards = instruments.filter((i: any) => i.type === "credit_card" && i.is_active !== false);
    return cards.map((card: any) => {
      const limit = Number(card.details?.credit_limit || 0);
      const openingOutstanding = Number(card.opening_balance || 0);
      let charges = 0;
      let repayments = 0;
      const txList: { id: string; ref: string; type: string; amount: number; date: string; desc: string }[] = [];

      for (const e of cashEntries) {
        if (e.instrument_id !== card.id) continue;
        const amount = Math.abs(Number(e.amount) || 0);
        if (e.direction === "out") {
          charges += amount;
          txList.push({ id: e.id, ref: e.ref_type ? String(e.ref_type).replaceAll("_", " ").toUpperCase() : "ENTRY", type: "Charge", amount: -amount, date: e.created_at, desc: e.description || "Credit-card charge" });
        } else {
          repayments += amount;
          txList.push({ id: e.id, ref: e.ref_type ? String(e.ref_type).replaceAll("_", " ").toUpperCase() : "ENTRY", type: "Repayment / Reversal", amount, date: e.created_at, desc: e.description || "Credit-card repayment or reversal" });
        }
      }

      const currentOutstanding = Math.max(0, roundMoney(openingOutstanding + charges - repayments));
      const availableCredit = Math.max(0, roundMoney(limit - currentOutstanding));
      const canonicalAvailable = Math.max(0, Number(card.current_balance ?? availableCredit));
      const variance = roundMoney(availableCredit - canonicalAvailable);
      const utilizationPct = limit > 0 ? Math.round((currentOutstanding / limit) * 100) : 0;

      return {
        id: card.id,
        name: card.name,
        limit,
        openingOutstanding,
        charges: roundMoney(charges),
        repayments: roundMoney(repayments),
        currentOutstanding,
        availableCredit,
        utilizationPct,
        variance,
        isReconciled: Math.abs(variance) < 0.01,
        txList,
      };
    });
  }, [instruments, cashEntries]);

  const ccTotalLimit = creditCardAudit.reduce((s, c) => s + c.limit, 0);
  const ccTotalOutstanding = creditCardAudit.reduce((s, c) => s + c.currentOutstanding, 0);
  const ccTotalAvailable = creditCardAudit.reduce((s, c) => s + c.availableCredit, 0);
  const ccOverallUtilPct = ccTotalLimit > 0 ? Math.round((ccTotalOutstanding / ccTotalLimit) * 100) : 0;

  const selectedPool = poolReconMap[selectedPoolKey] || poolReconMap["upi_qr"];
  const totalPosition = roundMoney((balances?.cash?.current ?? 0) + (balances?.bank?.current ?? 0) + (balances?.wallet?.current ?? 0) + (balances?.dmt?.current ?? 0) + (balances?.aeps?.current ?? 0) + (balances?.upi_qr?.current ?? 0));

  return (
    <div className="space-y-8 pt-6 sm:pt-8 md:pt-10">
      {/* ========================================================================= */}
      {/* 1. MASTER WORKSPACE HERO: FINANCIAL RECONCILIATION */}
      {/* ========================================================================= */}
      <section className="relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-slate-900 via-indigo-950/80 to-slate-950 p-6 sm:p-7 text-white shadow-xl ring-1 ring-white/10 mt-1">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-2xl shadow-lg shadow-cyan-500/30">⚖️</span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">Financial Reconciliation</h1>
                  {allReconciled ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-0.5 text-xs font-bold text-emerald-300 ring-1 ring-emerald-400/40"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />✓ All Accounts Reconciled</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/20 px-3 py-0.5 text-xs font-bold text-rose-300 ring-1 ring-rose-400/40"><span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-ping" />⚠ Variance Detected</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-300">Cross-module verification of live financial positions</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-400">Verifies opening anchor seeds, transaction credits, outflows, provider float settlements, and cashbook movements against the canonical double-entry accounting engine.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2.5">
              <span className="text-xs text-slate-400">Synced {lastRefreshedAt}</span>
              <button type="button" onClick={refreshLiveBalances} disabled={isRefreshing} className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white shadow-sm backdrop-blur-md transition hover:bg-white/20 disabled:opacity-50">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-4 w-4 ${isRefreshing ? "animate-spin text-cyan-400" : ""}`}><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 21h5v-5" /></svg>
                <span>{isRefreshing ? "Verifying…" : "Refresh"}</span>
              </button>
            </div>
          </div>
        </div>
        <div className="relative z-10 mt-6 rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-md"><div className="flex flex-col gap-2.5 text-xs text-slate-300"><div><strong className="text-white">Liquid asset positions:</strong> Cash {inr(balances?.cash?.current ?? 0)} + Bank {inr(balances?.bank?.current ?? 0)} + UPI {inr(balances?.upi_qr?.current ?? 0)} + AEPS {inr(balances?.aeps?.current ?? 0)} + DMT {inr(balances?.dmt?.current ?? 0)} + Wallet {inr(balances?.wallet?.current ?? 0)} = <strong className="text-emerald-400 text-sm">{inr(totalPosition)}</strong> Total Liquid Position.</div><div className="text-[11px] text-slate-400">Debit Card: <strong>Linked Mirror (Excluded)</strong> · Credit Card: <strong>Available Credit {inr(creditCardAudit.reduce((s, c) => s + c.availableCredit, 0))}</strong></div></div></div>
      </section>
      <section className="space-y-4">
        <div className="flex items-center justify-between"><div><h2 className="text-base font-bold text-slate-900 dark:text-white">Pool Reconciliation Summary</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Live double-entry comparisons for all treasury and float pools.</p></div></div>
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
          {POOL_CONFIGS.map((cfg) => { const p = poolReconMap[cfg.key]; const isSelected = selectedPoolKey === cfg.key; const bal = p?.currentBalance ?? 0; return <button key={cfg.key} type="button" onClick={() => setSelectedPoolKey(cfg.key)} className={`relative flex flex-col justify-between rounded-2xl border p-4 text-left transition ${isSelected ? "border-cyan-500 bg-cyan-50/20 shadow-md ring-2 ring-cyan-400/40 dark:bg-cyan-950/20" : "border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-slate-900 dark:hover:border-white/20"}`}><div><div className="flex items-center justify-between gap-1"><span className="text-xl">{cfg.icon}</span>{p?.isReconciled ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300"><span className="h-1 w-1 rounded-full bg-emerald-500" />✓ Reconciled</span> : <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300">⚠ Var {inr(p?.variance ?? 0)}</span>}</div><p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{cfg.label}</p><p className="mt-0.5 text-lg font-black text-slate-900 dark:text-white">{inr(bal)}</p></div><div className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-400 dark:border-white/5 flex items-center justify-between"><span>Var: <strong>{inr(p?.variance ?? 0)}</strong></span><span className="font-semibold text-cyan-600 dark:text-cyan-400">View Trace →</span></div></button>; })}
        </div>
      </section>
      {selectedPool && (
        <section className="relative overflow-hidden rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-6 sm:p-7 text-white shadow-xl ring-1 ring-white/10"><div className="relative z-10 space-y-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-5"><div className="flex items-center gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/20 text-2xl text-cyan-300 ring-1 ring-cyan-400/40 shadow-inner">{selectedPool.icon}</div><div><div className="flex items-center gap-2 flex-wrap"><h3 className="text-lg font-black text-white sm:text-xl">{selectedPool.label} Detailed Reconciliation</h3>{selectedPool.isReconciled ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-3 py-0.5 text-xs font-bold text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />✓ Reconciled</span> : <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/20 border border-rose-500/40 px-3 py-0.5 text-xs font-bold text-rose-300"><span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-ping" />⚠ Variance Detected ({inr(selectedPool.variance)})</span>}</div><p className="mt-0.5 text-xs text-slate-400">Source: <strong className="text-slate-200">{selectedPool.canonicalSource}</strong> · Movement count: <strong className="text-slate-200">{selectedPool.contributingTxns.length}</strong></p></div></div></div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Balance</span><div className="mt-1 text-2xl font-black text-cyan-300">{inr(selectedPool.currentBalance)}</div><span className="text-[10px] text-slate-500">Live Active Pool</span></div><div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Calculated Balance</span><div className="mt-1 text-2xl font-black text-white">{inr(selectedPool.calculatedBalance)}</div><span className="text-[10px] text-slate-500">Movement Sum</span></div><div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Canonical Pool</span><div className="mt-1 text-2xl font-black text-indigo-300">{inr(selectedPool.canonicalBalance)}</div><span className="text-[10px] text-slate-500">get_pool_balances</span></div><div className={`rounded-2xl border p-4 ${selectedPool.isReconciled ? "border-emerald-500/20 bg-emerald-500/5" : "border-rose-500/20 bg-rose-500/5"}`}><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Variance</span><div className={`mt-1 text-2xl font-black ${selectedPool.isReconciled ? "text-emerald-400" : "text-rose-400"}`}>{inr(selectedPool.variance)}</div><span className="text-[10px] text-slate-400">{selectedPool.isReconciled ? "Exact match (0.00)" : "Discrepancy"}</span></div></div>
            <div className="rounded-2xl border border-white/5 bg-black/25 p-4.5"><h4 className="text-xs font-black uppercase tracking-wider text-cyan-300">Movement Breakdown</h4><div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3 md:grid-cols-6"><div><span className="text-slate-400">Opening Balance:</span><p className="font-bold text-white">{inr(selectedPool.openingBalance)}</p></div><div><span className="text-slate-400">Credits / Inflows:</span><p className="font-bold text-emerald-400">+{inr(selectedPool.credits)}</p></div><div><span className="text-slate-400">Outflows / Debits:</span><p className="font-bold text-slate-300">-{inr(selectedPool.debits)}</p></div>{selectedPool.fees > 0 && <div><span className="text-slate-400">Fees Collected:</span><p className="font-bold text-cyan-400">+{inr(selectedPool.fees)}</p></div>}<div><span className="text-slate-400">Other Movements:</span><p className="font-bold text-slate-300">{inr(selectedPool.otherMovements)}</p></div>{selectedPool.settlements !== 0 && <div><span className="text-slate-400">Settlements:</span><p className="font-bold text-slate-300">{inr(selectedPool.settlements)}</p></div>}</div></div>
            {selectedPool.contributingTxns.length > 0 && <div><h4 className="text-xs font-black uppercase tracking-wider text-slate-400">Contributing Activity ({selectedPool.contributingTxns.length})</h4><div className="mt-2 max-h-56 overflow-y-auto rounded-2xl border border-white/10 bg-black/30 text-xs"><table className="w-full text-left"><thead><tr className="border-b border-white/10 bg-white/5 text-[10px] uppercase font-bold text-slate-400"><th className="p-3">Identifier</th><th className="p-3">Type</th><th className="p-3">Description</th><th className="p-3 text-right">Contribution</th></tr></thead><tbody className="divide-y divide-white/5">{selectedPool.contributingTxns.map((tx) => <tr key={tx.id}><td className="p-3 font-mono font-bold text-white">{tx.number}</td><td className="p-3 text-slate-400">{tx.type}</td><td className="p-3 text-slate-300">{tx.desc}</td><td className={`p-3 text-right font-bold ${tx.amount >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{tx.amount >= 0 ? `+${inr(tx.amount)}` : inr(tx.amount)}</td></tr>)}</tbody></table></div></div>}
          </div>
        </section>
      )}
      {creditCardAudit.length > 0 && <section className="space-y-4"><div className="flex items-center justify-between"><div><h2 className="text-base font-bold text-slate-900 dark:text-white">💳 Credit Card Facility Audit</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Per-card outstanding debt, credit utilization, charges & repayments. Distinct from liquid asset pools.</p></div><span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"><span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />{creditCardAudit.length} Card{creditCardAudit.length !== 1 ? "s" : ""} Active</span></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-2xl border border-purple-100 bg-gradient-to-b from-purple-50/60 to-white p-4 shadow-sm dark:border-purple-900/20 dark:from-purple-950/20 dark:to-slate-900"><div className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">Total Credit Limit</div><div className="mt-1 text-xl font-black text-purple-900 dark:text-purple-100">{inr(ccTotalLimit)}</div><div className="mt-0.5 text-[11px] text-purple-500 dark:text-purple-400">{creditCardAudit.length} cards combined</div></div><div className="rounded-2xl border border-rose-100 bg-gradient-to-b from-rose-50/60 to-white p-4 shadow-sm dark:border-rose-900/20 dark:from-rose-950/20 dark:to-slate-900"><div className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Total Outstanding</div><div className="mt-1 text-xl font-black text-rose-900 dark:text-rose-100">{inr(ccTotalOutstanding)}</div><div className="mt-0.5 text-[11px] text-rose-500 dark:text-rose-400">Current debt / liability</div></div><div className="rounded-2xl border border-emerald-100 bg-gradient-to-b from-emerald-50/60 to-white p-4 shadow-sm dark:border-emerald-900/20 dark:from-emerald-950/20 dark:to-slate-900"><div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Total Available</div><div className="mt-1 text-xl font-black text-emerald-900 dark:text-emerald-100">{inr(ccTotalAvailable)}</div><div className="mt-0.5 text-[11px] text-emerald-500 dark:text-emerald-400">Unused credit facility</div></div><div className="rounded-2xl border border-amber-100 bg-gradient-to-b from-amber-50/60 to-white p-4 shadow-sm dark:border-amber-900/20 dark:from-amber-950/20 dark:to-slate-900"><div className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Portfolio Utilization</div><div className="mt-1 text-xl font-black text-amber-900 dark:text-amber-100">{ccOverallUtilPct}%</div><div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div style={{ width: `${Math.min(100, ccOverallUtilPct)}%` }} className={`h-full rounded-full transition-all ${ccOverallUtilPct > 80 ? "bg-rose-500" : ccOverallUtilPct > 50 ? "bg-amber-500" : "bg-emerald-500"}`} /></div></div></div><div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="border-b border-slate-100 px-6 py-4 dark:border-white/5"><h3 className="text-sm font-black text-slate-900 dark:text-white">Individual Card Analysis</h3><p className="text-xs text-slate-500 dark:text-slate-400">Click a row to see activity trace. Utilization = Outstanding ÷ Credit Limit.</p></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-[11px] font-black uppercase tracking-wide text-slate-500 dark:bg-white/[0.03]"><tr><th className="px-6 py-3">Card Name</th><th className="px-6 py-3 text-right">Credit Limit</th><th className="px-6 py-3 text-right">Opening Debt</th><th className="px-6 py-3 text-right text-rose-600">+ Charges</th><th className="px-6 py-3 text-right text-emerald-600">− Repayments</th><th className="px-6 py-3 text-right font-black text-slate-900 dark:text-white">Outstanding</th><th className="px-6 py-3 text-right text-emerald-600">Available</th><th className="px-6 py-3">Utilization</th><th className="px-6 py-3 text-center">Activity</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-white/5">{creditCardAudit.map((card) => <><tr key={card.id} className={`cursor-pointer transition hover:bg-slate-50/70 dark:hover:bg-white/[0.02] ${selectedCreditCardId === card.id ? "bg-purple-50/50 dark:bg-purple-950/10" : ""}`} onClick={() => setSelectedCreditCardId(selectedCreditCardId === card.id ? null : card.id)}><td className="px-6 py-4"><div className="flex items-center gap-2"><span className="text-lg">💳</span><div><div className="font-bold text-slate-900 dark:text-white">{card.name}</div><div className="text-[11px] text-slate-400">{card.txList.length} transaction{card.txList.length !== 1 ? "s" : ""}</div></div></div></td><td className="px-6 py-4 text-right font-mono font-bold text-purple-700 dark:text-purple-300">{inr(card.limit)}</td><td className="px-6 py-4 text-right font-mono text-slate-500 dark:text-slate-400">{inr(card.openingOutstanding)}</td><td className="px-6 py-4 text-right font-mono text-rose-600 dark:text-rose-400">{card.charges > 0 ? `+${inr(card.charges)}` : "₹0.00"}</td><td className="px-6 py-4 text-right font-mono text-emerald-600 dark:text-emerald-400">{card.repayments > 0 ? `−${inr(card.repayments)}` : "₹0.00"}</td><td className="px-6 py-4 text-right"><div className="text-base font-black text-rose-700 dark:text-rose-300">{inr(card.currentOutstanding)}</div></td><td className="px-6 py-4 text-right font-mono font-bold text-emerald-700 dark:text-emerald-300">{inr(card.availableCredit)}</td><td className="px-6 py-4"><div className="flex items-center gap-2"><div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div style={{ width: `${Math.min(100, card.utilizationPct)}%` }} className={`h-full rounded-full ${card.utilizationPct > 80 ? "bg-rose-500" : card.utilizationPct > 50 ? "bg-amber-500" : "bg-emerald-500"}`} /></div><span className={`text-xs font-bold ${card.utilizationPct > 80 ? "text-rose-600" : card.utilizationPct > 50 ? "text-amber-600" : "text-emerald-600"}`}>{card.utilizationPct}%</span></div></td><td className="px-6 py-4 text-center"><span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{selectedCreditCardId === card.id ? "▲ Hide" : "▼ Trace"}</span></td></tr>{selectedCreditCardId === card.id && card.txList.length > 0 && <tr key={`${card.id}-trace`}><td colSpan={9} className="bg-purple-50/40 px-6 pb-4 dark:bg-purple-950/10"><div className="mt-2 overflow-hidden rounded-2xl border border-purple-200/60 dark:border-purple-800/40"><table className="w-full text-xs"><thead><tr className="border-b border-purple-200/60 bg-purple-100/60 text-[10px] uppercase font-bold text-purple-700 dark:border-purple-800/40 dark:bg-purple-900/20 dark:text-purple-300"><th className="p-3 text-left">Reference</th><th className="p-3 text-left">Type</th><th className="p-3 text-left">Description</th><th className="p-3 text-right">Amount</th></tr></thead><tbody className="divide-y divide-purple-100/60 dark:divide-purple-900/20">{card.txList.map((tx) => <tr key={tx.id} className="hover:bg-purple-50/40 dark:hover:bg-purple-950/10"><td className="p-3 font-mono font-bold text-purple-800 dark:text-purple-200">{tx.ref}</td><td className="p-3 text-slate-600 dark:text-slate-400">{tx.type}</td><td className="p-3 text-slate-700 dark:text-slate-300">{tx.desc}</td><td className={`p-3 text-right font-bold ${tx.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{tx.amount >= 0 ? `+${inr(tx.amount)}` : inr(tx.amount)}</td></tr>)}</tbody></table></div></td></tr>}{selectedCreditCardId === card.id && card.txList.length === 0 && <tr key={`${card.id}-empty`}><td colSpan={9} className="bg-purple-50/40 px-6 py-4 text-center text-xs text-slate-500 dark:bg-purple-950/10 dark:text-slate-400">No charges or repayments recorded since opening balance was set.</td></tr>}</>)}</tbody><tfoot className="border-t-2 border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.02]"><tr><td className="px-6 py-4 font-black text-slate-900 dark:text-white">Portfolio Total</td><td className="px-6 py-4 text-right font-black font-mono text-purple-700 dark:text-purple-300">{inr(ccTotalLimit)}</td><td className="px-6 py-4 text-right font-mono text-slate-500" /><td className="px-6 py-4 text-right font-mono text-rose-600">{creditCardAudit.reduce((s, c) => s + c.charges, 0) > 0 ? `+${inr(creditCardAudit.reduce((s, c) => s + c.charges, 0))}` : "₹0.00"}</td><td className="px-6 py-4 text-right font-mono text-emerald-600">{creditCardAudit.reduce((s, c) => s + c.repayments, 0) > 0 ? `−${inr(creditCardAudit.reduce((s, c) => s + c.repayments, 0))}` : "₹0.00"}</td><td className="px-6 py-4 text-right font-black font-mono text-rose-700 dark:text-rose-300">{inr(ccTotalOutstanding)}</td><td className="px-6 py-4 text-right font-black font-mono text-emerald-700 dark:text-emerald-300">{inr(ccTotalAvailable)}</td><td className="px-6 py-4"><div className="flex items-center gap-2"><div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div style={{ width: `${Math.min(100, ccOverallUtilPct)}%` }} className={`h-full rounded-full ${ccOverallUtilPct > 80 ? "bg-rose-500" : ccOverallUtilPct > 50 ? "bg-amber-500" : "bg-emerald-500"}`} /></div><span className="text-xs font-black text-slate-700 dark:text-slate-300">{ccOverallUtilPct}%</span></div></td><td /></tr></tfoot></table></div></div></section>}
      {toastView}
    </div>
  );
}
