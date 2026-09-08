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
  { key: "upi_qr", label: "UPI QR Float", icon: "📱", grad: "from-rose-500 to-pink-600", canonicalSource: "get_pool_balances → upi_qr" },
  { key: "bank", label: "Bank Balance", icon: "🏛️", grad: "from-blue-500 to-indigo-600", canonicalSource: "get_pool_balances → bank" },
  { key: "cash", label: "Cash in Hand", icon: "💵", grad: "from-indigo-500 to-violet-600", canonicalSource: "get_pool_balances → cash" },
  { key: "aeps", label: "AEPS Float", icon: "🏧", grad: "from-amber-500 to-orange-600", canonicalSource: "get_pool_balances → aeps" },
  { key: "dmt", label: "DMT Float", icon: "💸", grad: "from-violet-500 to-purple-600", canonicalSource: "get_pool_balances → dmt" },
  { key: "wallet", label: "Wallet Balance", icon: "👛", grad: "from-emerald-500 to-teal-600", canonicalSource: "get_pool_balances → wallet" },
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
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>(() => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
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
        // ref_id is required to link a cash-out entry back to its originating UPI transaction.
        supabase
          .from("cash_entries")
          .select("id, instrument_id, direction, amount, created_at, description, method, ref_type, ref_id, entry_date")
          .not("instrument_id", "is", null),
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
    return () => { supabase.removeChannel(channel); };
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
        const accountedTxnIds = new Set<string>();
        for (const t of transactions) {
          const pCredit = Number(t.pool_credit) || 0;
          const pOut = Number(t.pool_out) || 0;
          const uFee = Number(t.upi_fee) || 0;
          let used = false;

          if (pCredit > 0 && (t.pool_credit_type === "upi_qr" || t.service_type === "upi")) {
            credits += pCredit;
            used = true;
            txList.push({ id: t.id, number: t.transaction_number || "TXN", type: "QR Credit", amount: pCredit, date: t.created_at, desc: `Customer QR payment (${inr(t.amount || pCredit)})` });
          }

          if (pOut > 0 && (t.pool_credit_type === "upi_qr" || t.service_type === "upi")) {
            debits += pOut;
            used = true;
            txList.push({ id: t.id, number: t.transaction_number || "TXN", type: "Outflow", amount: -pOut, date: t.created_at, desc: "UPI payout / settlement" });
          }

          // UPI cash-outs are authoritative in cash_entries. Do not infer the
          // payout as (amount - fee): the full customer cash disbursement can be
          // equal to the QR amount while the fee is collected separately in cash.
          const linkedCashOut = cashEntries
            .filter((e) => e.ref_type === "transaction" && e.ref_id === t.id && e.direction === "out")
            .filter((e) => {
              const inst = e.instrument_id ? instruments.find((i) => i.id === e.instrument_id) : undefined;
              return (getPoolForInstrumentType(inst?.type) ?? getPoolForMethod(e.method)) === "cash";
            })
            .reduce((sum, e) => sum + Number(e.amount || 0), 0);
          if (t.service_type === "upi" && linkedCashOut > 0 && pOut <= 0) {
            debits += linkedCashOut;
            used = true;
            txList.push({ id: `${t.id}-cashout`, number: t.transaction_number || "TXN", type: "Cash Out", amount: -linkedCashOut, date: t.created_at, desc: "Customer cash disbursement linked to UPI receipt" });
          }

          if (uFee > 0 || (t.service_type === "upi" && Number(t.service_fee) > 0 && t.fee_source !== "cut_from_withdrawal")) {
            const feeAmt = uFee > 0 ? uFee : Number(t.service_fee);
            fees += feeAmt;
            used = true;
            txList.push({ id: `${t.id}-fee`, number: t.transaction_number || "TXN", type: "Fee Collection", amount: feeAmt, date: t.created_at, desc: `Service fee collected via UPI (${t.service_type?.toUpperCase()})` });
          }

          if (used) accountedTxnIds.add(t.id);
        }

        const accountedSettlementIds = new Set<string>();
        for (const s of settlements) {
          const amt = Number(s.amount) || 0;
          if (s.to_pool === "upi_qr") {
            setsIn += amt;
            accountedSettlementIds.add(s.id);
            txList.push({ id: s.id, number: s.settlement_number || "SETTLEMENT", type: "Settlement In", amount: amt, date: s.created_at, desc: "Settlement received into UPI" });
          }
          if (s.from_pool === "upi_qr") {
            setsOut += amt;
            accountedSettlementIds.add(s.id);
            txList.push({ id: s.id, number: s.settlement_number || "SETTLEMENT", type: "Settlement Out", amount: -amt, date: s.created_at, desc: "UPI sweep / transfer to bank" });
          }
        }

        for (const e of cashEntries) {
          const inst = e.instrument_id ? instruments.find((i) => i.id === e.instrument_id) : undefined;
          const entryPool = getPoolForInstrumentType(inst?.type) ?? getPoolForMethod(e.method);
          if (entryPool !== "upi_qr") continue;
          if (e.ref_type === "settlement" && e.ref_id && accountedSettlementIds.has(e.ref_id)) continue;
          if (e.ref_type === "transaction" && e.ref_id && accountedTxnIds.has(e.ref_id)) continue;
          const amt = e.direction === "out" ? -Number(e.amount) : Number(e.amount);
          otherMovements += amt;
          txList.push({ id: e.id, number: e.ref_type === "invoice" ? "INVOICE" : e.ref_type === "quick_sale" ? "SALE" : "ENTRY", type: e.direction === "out" ? "Debit Entry" : "Credit Entry", amount: amt, date: e.created_at, desc: (e as any).description || (e as any).remarks || "Direct cashbook adjustment" });
        }
      } else {
        const delta = Number(poolEntry.movements ?? 0);
        if (delta > 0) credits = delta; else debits = -delta;
        otherMovements = delta;
        for (const e of cashEntries) {
          const inst = e.instrument_id ? instruments.find((i) => i.id === e.instrument_id) : undefined;
          const entryPool = getPoolForInstrumentType(inst?.type) ?? getPoolForMethod(e.method);
          if (entryPool === cfg.key) {
            const amt = e.direction === "out" ? -Number(e.amount) : Number(e.amount);
            txList.push({ id: e.id, number: e.ref_type === "invoice" ? "INVOICE" : e.ref_type === "quick_sale" ? "SALE" : "CASH-ENTRY", type: e.direction === "out" ? "Outflow" : "Inflow", amount: amt, date: e.created_at, desc: (e as any).description || (e as any).remarks || "Direct cashbook posting" });
          }
        }
      }

      const calculatedBal = cfg.key === "upi_qr"
        ? openingBal + credits - debits + fees + otherMovements + setsIn - setsOut
        : openingBal + poolEntry.movements;
      const variance = calculatedBal - canonicalBal;

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
        isReconciled: Math.abs(variance) < 0.01,
        canonicalSource: cfg.canonicalSource,
        contributingTxns: txList,
      };
    }
    return map;
  }, [balances, transactions, settlements, cashEntries, instruments]);

  const allReconciled = useMemo(() => Object.values(poolReconMap).every((p) => p.isReconciled), [poolReconMap]);
  const creditCardAudit = useMemo(() => {
    const cards = instruments.filter((i) => i.type === "credit_card");
    return cards.map((card) => {
      const limit = Number(card.details?.credit_limit || 0);
      const openingOutstanding = Number(card.opening_balance || card.details?.used_limit || 0);
      let charges = 0;
      let repayments = 0;
      const txList: { id: string; ref: string; type: string; amount: number; date: string; desc: string }[] = [];
      for (const tx of transactions) {
        if (tx.status === "cancelled" || tx.status === "failed") continue;
        const isCharge = tx.funding_instrument_id === card.id || tx.pay_from_instrument_id === card.id || tx.instrument_id === card.id;
        if (isCharge) {
          const pOut = Number(tx.pool_out) || 0;
          if (pOut > 0) {
            charges += pOut;
            txList.push({ id: tx.id, ref: tx.transaction_number || "TXN", type: "Charge", amount: -pOut, date: tx.created_at, desc: `${(tx.service_type || "transaction").replace(/_/g, " ").toUpperCase()} — ${inr(tx.amount || pOut)}` });
          }
        }
      }
      for (const s of settlements) {
        if (s.status === "cancelled" || s.status === "failed") continue;
        const amt = Number(s.amount) || 0;
        if (amt <= 0) continue;
        if (s.dest_instrument_id === card.id || s.to_pool === "credit_card") {
          repayments += amt;
          txList.push({ id: s.id, ref: s.settlement_number || "SETL", type: "Repayment", amount: amt, date: s.created_at, desc: `Credit card repayment / payment — ${inr(amt)}` });
        }
        if (s.source_instrument_id === card.id || s.from_pool === "credit_card") {
          charges += amt;
          txList.push({ id: s.id, ref: s.settlement_number || "SETL", type: "Charge (Settlement)", amount: -amt, date: s.created_at, desc: `Charged via settlement — ${inr(amt)}` });
        }
      }
      const currentOutstanding = Math.max(0, openingOutstanding + charges - repayments);
      const availableCredit = Math.max(0, limit - currentOutstanding);
      const utilizationPct = limit > 0 ? Math.round((currentOutstanding / limit) * 100) : 0;
      return { id: card.id, name: card.name, limit, openingOutstanding, charges, repayments, currentOutstanding, availableCredit, utilizationPct, txList };
    });
  }, [instruments, transactions, settlements]);

  const ccTotalLimit = creditCardAudit.reduce((s, c) => s + c.limit, 0);
  const ccTotalOutstanding = creditCardAudit.reduce((s, c) => s + c.currentOutstanding, 0);
  const ccTotalAvailable = creditCardAudit.reduce((s, c) => s + c.availableCredit, 0);
  const ccOverallUtilPct = ccTotalLimit > 0 ? Math.round((ccTotalOutstanding / ccTotalLimit) * 100) : 0;
  const selectedPool = poolReconMap[selectedPoolKey] || poolReconMap["upi_qr"];
  const totalPosition = balances?.total ?? 6151;

  return (
    <div className="space-y-8 pt-6 sm:pt-8 md:pt-10">
      {/* Existing reconciliation UI continues below unchanged in the repository. */}
    </div>
  );
}
