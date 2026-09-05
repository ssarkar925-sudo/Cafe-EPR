"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";

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

type InstrumentRow = {
  id: string;
  name: string;
  type: string;
  balance: number | string;
  opening_balance: number | string;
  details: unknown;
  is_active: boolean;
};

type CashEntry = {
  id: string;
  instrument_id: string;
  direction: string;
  amount: number | string;
  created_at: string;
  entry_date?: string;
  remarks?: string | null;
  description?: string | null;
  method?: string | null;
  ref_type?: string | null;
  ref_id?: string | null;
};

type Transaction = {
  id: string;
  transaction_number?: string | null;
  service_type?: string | null;
  amount?: number | string | null;
  created_at?: string;
};

type Settlement = {
  id: string;
  settlement_number?: string | null;
  amount?: number | string | null;
  created_at?: string;
};

type PoolConfig = {
  key: keyof Pick<PoolBalances, "cash" | "bank" | "wallet" | "dmt" | "aeps" | "upi_qr">;
  label: string;
  icon: string;
  instrumentTypes: string[];
};

const POOLS: PoolConfig[] = [
  { key: "cash", label: "Cash in Hand", icon: "💵", instrumentTypes: ["cash"] },
  { key: "bank", label: "Bank Balance", icon: "🏦", instrumentTypes: ["bank", "bank_account"] },
  { key: "aeps", label: "AEPS Float", icon: "🏧", instrumentTypes: ["aeps", "aeps_portal"] },
  { key: "dmt", label: "DMT Float", icon: "💸", instrumentTypes: ["dmt", "dmt_portal"] },
  { key: "wallet", label: "Wallet Balance", icon: "👛", instrumentTypes: ["wallet"] },
  { key: "upi_qr", label: "UPI QR Float", icon: "📱", instrumentTypes: ["upi", "upi_qr"] },
];

function n(value: unknown): number {
  const valueNumber = Number(value);
  return Number.isFinite(valueNumber) ? valueNumber : 0;
}

function money(value: number): string {
  return inr(Math.round(value * 100) / 100);
}

export default function ReconciliationClient({
  initialBalances,
  initialInstruments,
  initialCashEntries,
  initialPortals: _initialPortals,
  initialTransactions,
  initialSettlements,
  initialOpeningBalances: _initialOpeningBalances,
}: {
  initialBalances: PoolBalances | null;
  initialInstruments: InstrumentRow[];
  initialCashEntries: CashEntry[];
  initialPortals: unknown[];
  initialTransactions: Transaction[];
  initialSettlements: Settlement[];
  initialOpeningBalances: unknown[];
}) {
  const supabase = createClient();
  const [balances, setBalances] = useState<PoolBalances | null>(initialBalances);
  const [instruments, setInstruments] = useState<InstrumentRow[]>(initialInstruments);
  const [cashEntries, setCashEntries] = useState<CashEntry[]>(initialCashEntries);
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [settlements, setSettlements] = useState<Settlement[]>(initialSettlements);
  const [selectedPool, setSelectedPool] = useState<PoolConfig>(POOLS[0]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date().toLocaleTimeString());

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [poolRes, instRes, entryRes, txRes, setRes] = await Promise.all([
        supabase.rpc("get_pool_balances"),
        supabase.from("payment_instruments").select("id,name,type,balance,opening_balance,details,is_active,created_at").order("type").order("name"),
        supabase.from("cash_entries").select("id,instrument_id,direction,amount,created_at,entry_date,remarks,description,method,ref_type,ref_id").not("instrument_id", "is", null).order("created_at", { ascending: true }),
        supabase.from("transactions").select("id,transaction_number,service_type,amount,created_at").eq("status", "success").order("created_at", { ascending: false }).limit(5000),
        supabase.from("settlements").select("id,settlement_number,amount,created_at").eq("status", "success").order("created_at", { ascending: false }).limit(2000),
      ]);
      if (poolRes.data) setBalances(poolRes.data as PoolBalances);
      if (instRes.data) setInstruments(instRes.data as InstrumentRow[]);
      if (entryRes.data) setCashEntries(entryRes.data as CashEntry[]);
      if (txRes.data) setTransactions(txRes.data as Transaction[]);
      if (setRes.data) setSettlements(setRes.data as Settlement[]);
      setLastRefresh(new Date().toLocaleTimeString());
    } finally {
      setRefreshing(false);
    }
  }, [supabase]);

  useEffect(() => {
    const channel = supabase
      .channel(`finance-reconciliation-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_entries" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_instruments" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "settlements" }, refresh)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, refresh]);

  const transactionMap = useMemo(() => new Map(transactions.map((t) => [t.id, t])), [transactions]);
  const settlementMap = useMemo(() => new Map(settlements.map((s) => [s.id, s])), [settlements]);

  const recon = useMemo(() => {
    const result: Record<string, {
      opening: number;
      credits: number;
      debits: number;
      movement: number;
      calculated: number;
      canonical: number;
      variance: number;
      entries: CashEntry[];
      instrumentIds: Set<string>;
    }> = {};

    for (const pool of POOLS) {
      const typeSet = new Set(pool.instrumentTypes.map((type) => type.toLowerCase()));
      const poolInstruments = instruments.filter((i) => i.is_active && typeSet.has(String(i.type).toLowerCase()));
      const ids = new Set(poolInstruments.map((i) => i.id));
      const opening = poolInstruments.reduce((sum, i) => sum + n(i.opening_balance), 0);
      const entries = cashEntries.filter((e) => ids.has(e.instrument_id));
      let credits = 0;
      let debits = 0;
      for (const entry of entries) {
        if (String(entry.direction).toLowerCase() === "in") credits += n(entry.amount);
        else if (String(entry.direction).toLowerCase() === "out") debits += n(entry.amount);
      }
      const movement = credits - debits;
      const calculated = opening + movement;
      const canonical = n((balances as any)?.[pool.key]?.current);
      result[pool.key] = {
        opening,
        credits,
        debits,
        movement,
        calculated,
        canonical,
        variance: calculated - canonical,
        entries,
        instrumentIds: ids,
      };
    }
    return result;
  }, [balances, cashEntries, instruments]);

  const selectedRecon = recon[selectedPool.key];
  const allReconciled = POOLS.every((pool) => Math.abs(recon[pool.key]?.variance ?? 0) < 0.01);

  const entryLabel = (entry: CashEntry) => {
    if (entry.ref_type === "transaction" && entry.ref_id) {
      const txn = transactionMap.get(entry.ref_id);
      if (txn?.transaction_number) return txn.transaction_number;
    }
    if (entry.ref_type === "settlement" && entry.ref_id) {
      const settlement = settlementMap.get(entry.ref_id);
      if (settlement?.settlement_number) return settlement.settlement_number;
    }
    return entry.ref_type ? String(entry.ref_type).toUpperCase() : "ADJUSTMENT";
  };

  const entryDescription = (entry: CashEntry) => {
    if (entry.remarks || entry.description) return entry.remarks || entry.description;
    if (entry.ref_type === "transaction" && entry.ref_id) return transactionMap.get(entry.ref_id)?.service_type || "Service transaction";
    if (entry.ref_type === "settlement" && entry.ref_id) return "Settlement transfer";
    return `${entry.method || "Financial"} movement`;
  };

  return (
    <div className="space-y-6 pt-6 sm:pt-8">
      <section className="rounded-3xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Financial Reconciliation</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Canonical calculation: opening balance + every instrument money entry = closing balance.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${allReconciled ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
              {allReconciled ? "✓ All pools reconciled" : "⚠ Variance detected"}
            </span>
            <button type="button" onClick={refresh} disabled={refreshing} className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">Last refreshed {lastRefresh}</div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {POOLS.map((pool) => {
          const r = recon[pool.key];
          const ok = Math.abs(r.variance) < 0.01;
          return (
            <button
              key={pool.key}
              type="button"
              onClick={() => setSelectedPool(pool)}
              className={`rounded-2xl border p-4 text-left transition ${selectedPool.key === pool.key ? "border-primary ring-2 ring-primary/20" : "hover:bg-muted/50"}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{pool.icon} {pool.label}</span>
                <span className={`text-xs font-semibold ${ok ? "text-emerald-600" : "text-red-600"}`}>{ok ? "RECONCILED" : "VARIANCE"}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-muted-foreground">Opening</div><div className="font-semibold">{money(r.opening)}</div></div>
                <div><div className="text-muted-foreground">Closing</div><div className="font-semibold">{money(r.canonical)}</div></div>
                <div><div className="text-muted-foreground">Credits</div><div className="font-semibold text-emerald-600">+{money(r.credits)}</div></div>
                <div><div className="text-muted-foreground">Debits</div><div className="font-semibold text-red-600">-{money(r.debits)}</div></div>
              </div>
              <div className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                Calculated {money(r.calculated)} · Variance {money(r.variance)}
              </div>
            </button>
          );
        })}
      </section>

      {selectedRecon && (
        <section className="rounded-3xl border bg-card shadow-sm">
          <div className="border-b p-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-bold">{selectedPool.icon} {selectedPool.label} — Full Money Trail</h2>
                <p className="text-sm text-muted-foreground">Every posted cash-entry movement for the underlying payment instrument(s), including transaction and settlement legs.</p>
              </div>
              <div className="text-right text-sm">
                <div>Opening <strong>{money(selectedRecon.opening)}</strong></div>
                <div>Closing <strong>{money(selectedRecon.canonical)}</strong></div>
                <div className={Math.abs(selectedRecon.variance) < 0.01 ? "text-emerald-600" : "text-red-600"}>Variance <strong>{money(selectedRecon.variance)}</strong></div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Instrument</th>
                  <th className="px-4 py-3 text-right">In</th>
                  <th className="px-4 py-3 text-right">Out</th>
                  <th className="px-4 py-3 text-right">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(() => {
                  let running = selectedRecon.opening;
                  return selectedRecon.entries.map((entry) => {
                    const amount = n(entry.amount);
                    const isIn = String(entry.direction).toLowerCase() === "in";
                    running += isIn ? amount : -amount;
                    const instrument = instruments.find((i) => i.id === entry.instrument_id);
                    return (
                      <tr key={entry.id}>
                        <td className="whitespace-nowrap px-4 py-3">{entry.entry_date || new Date(entry.created_at).toLocaleDateString("en-IN")}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-medium">{entryLabel(entry)}</td>
                        <td className="min-w-[260px] px-4 py-3">{entryDescription(entry)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{instrument?.name || entry.method || "—"}</td>
                        <td className="px-4 py-3 text-right font-medium text-emerald-600">{isIn ? `+${money(amount)}` : "—"}</td>
                        <td className="px-4 py-3 text-right font-medium text-red-600">{!isIn ? `-${money(amount)}` : "—"}</td>
                        <td className="px-4 py-3 text-right font-semibold">{money(running)}</td>
                      </tr>
                    );
                  });
                })()}
                {selectedRecon.entries.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No money movements posted for this pool.</td></tr>
                )}
              </tbody>
              <tfoot className="border-t bg-muted/30 font-semibold">
                <tr>
                  <td colSpan={4} className="px-4 py-3">Opening + all posted movements</td>
                  <td className="px-4 py-3 text-right text-emerald-600">+{money(selectedRecon.credits)}</td>
                  <td className="px-4 py-3 text-right text-red-600">-{money(selectedRecon.debits)}</td>
                  <td className="px-4 py-3 text-right">{money(selectedRecon.calculated)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-2xl border bg-muted/20 p-4 text-xs text-muted-foreground">
        <strong>Control rule:</strong> reconciliation does not reconstruct balances from transaction fields, pool labels, fees, or status totals. It uses the actual payment-instrument opening balances and the immutable money-entry ledger, then compares that result with the canonical pool balance. This prevents double-counting service transactions and settlements.
      </section>
    </div>
  );
}
