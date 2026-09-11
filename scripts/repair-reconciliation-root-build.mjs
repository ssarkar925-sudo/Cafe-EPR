import fs from "node:fs";
import path from "node:path";

const file = path.resolve("components/finance/reconciliation-client.tsx");
let source = fs.readFileSync(file, "utf8");

const start = source.indexOf("  const poolReconMap = useMemo(() => {");
const allStart = source.indexOf("  const allReconciled = useMemo", start);
if (start < 0 || allStart < 0) throw new Error("reconciliation-client.tsx: pool reconciliation block not found");

// Canonical reconciliation build repair: use the persisted instrument ledger once.
// This comment is intentionally plain text so the repair script itself remains parseable.
const replacement = `  // ROOT ACCOUNTING RULE: reconciliation uses canonical instrument balances + same-day cash entries exactly once.
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

`;
source = source.slice(0, start) + replacement + source.slice(allStart);

const cardStart = source.indexOf("  const creditCardAudit = useMemo(() => {");
const ccTotalStart = source.indexOf("  const ccTotalLimit =", cardStart);
if (cardStart < 0 || ccTotalStart < 0) throw new Error("reconciliation-client.tsx: credit card audit block not found");

const cardReplacement = `  // Credit cards: OUT cash entries increase outstanding; IN entries reduce outstanding.
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

`;
source = source.slice(0, cardStart) + cardReplacement + source.slice(ccTotalStart);

source = source.replace(
  '  const allReconciled = useMemo(() => {\n    return Object.values(poolReconMap).every((p) => p.isReconciled);\n  }, [poolReconMap]);',
  '  const allReconciled = useMemo(() => {\n    const poolsOk = Object.values(poolReconMap).every((p) => p.isReconciled);\n    const cardsOk = creditCardAudit.every((c) => c.isReconciled);\n    return poolsOk && cardsOk;\n  }, [poolReconMap, creditCardAudit]);'
);

const staleHero = '<div className="relative z-10 mt-6 rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-md"><div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between text-xs text-slate-300"><div><strong className="text-white">Included in Asset Aggregation:</strong> Cash (−₹5,845) + Bank (+₹9,500) + UPI (+₹9,011) + AEPS (−₹6,515) + DMT (+₹0) = <strong className="text-emerald-400 text-sm">{inr(totalPosition)}</strong> Total Position.</div><div className="flex items-center gap-3 text-[11px] text-slate-400"><span>Debit Card: <strong>Linked Mirror (Excluded)</strong></span><span>·</span><span>Credit Card: <strong>Credit Facility ({inr(15000)})</strong></span></div></div></div>';
const dynamicHero = '<div className="relative z-10 mt-6 rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-md"><div className="flex flex-col gap-2.5 text-xs text-slate-300"><div><strong className="text-white">Liquid asset positions:</strong> Cash {inr(balances?.cash?.current ?? 0)} + Bank {inr(balances?.bank?.current ?? 0)} + UPI {inr(balances?.upi_qr?.current ?? 0)} + AEPS {inr(balances?.aeps?.current ?? 0)} + DMT {inr(balances?.dmt?.current ?? 0)} + Wallet {inr(balances?.wallet?.current ?? 0)} = <strong className="text-emerald-400 text-sm">{inr(totalPosition)}</strong> Total Liquid Position.</div><div className="text-[11px] text-slate-400">Debit Card: <strong>Linked Mirror (Excluded)</strong> · Credit Card: <strong>Available Credit {inr(creditCardAudit.reduce((s, c) => s + c.availableCredit, 0))}</strong></div></div></div>';
if (source.includes(staleHero)) {
  source = source.replace(staleHero, dynamicHero);
} else if (!source.includes('Liquid asset positions:') && !source.includes('Available Credit {inr(creditCardAudit.reduce')) {
  throw new Error("reconciliation-client.tsx: hero aggregation block not recognized; refusing unsafe blind rewrite");
} else {
  console.log("Reconciliation hero is already canonical; legacy hero repair skipped safely.");
}

const staleTotal = '  const totalPosition = balances?.total ?? 6151;';
const dynamicTotal = '  const totalPosition = roundMoney((balances?.cash?.current ?? 0) + (balances?.bank?.current ?? 0) + (balances?.wallet?.current ?? 0) + (balances?.dmt?.current ?? 0) + (balances?.aeps?.current ?? 0) + (balances?.upi_qr?.current ?? 0));';
if (source.includes(staleTotal)) {
  source = source.replace(staleTotal, dynamicTotal);
} else if (!source.includes(dynamicTotal)) {
  throw new Error("reconciliation-client.tsx: totalPosition line not recognized; refusing unsafe blind rewrite");
} else {
  console.log("Reconciliation totalPosition is already canonical; legacy total repair skipped safely.");
}

if (!source.includes("ROOT ACCOUNTING RULE")) throw new Error("reconciliation root patch did not apply");
fs.writeFileSync(file, source);
console.log("Reconciliation root audit engine repaired safely: canonical instrument ledger, credit-card audit, and dynamic asset aggregation.");
