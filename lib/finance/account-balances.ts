/**
 * Canonical Payment Account Balance Engine
 *
 * Normal account:
 *   opening + inflows - outflows = current balance
 *
 * Credit card:
 *   credit limit = fixed configuration
 *   used credit = opening utilization + charges (outflows) - repayments (inflows)
 *   available credit = limit - used
 *
 * Debit card:
 *   mirrors its explicitly linked bank account and is not added to liquid
 *   totals as a second asset.
 */

export type InstrumentType =
  | "cash" | "bank" | "upi" | "upi_qr" | "wallet" | "debit_card"
  | "credit_card" | "aeps" | "aeps_portal" | "dmt" | "dmt_portal";

export interface RawPaymentInstrument {
  id: string; name: string; type: string; is_active?: boolean;
  opening_balance?: number | string | null; balance?: number | string | null;
  details?: { credit_limit?: number | string; used_limit?: number | string; linked_bank_instrument_id?: string; [key: string]: any } | null;
  created_at?: string;
}

export interface ReconciledAccountBalance {
  id: string; name: string; type: string; poolKey: string; isActive: boolean;
  openingBalance: number; totalInflows: number; totalOutflows: number; netMovement: number;
  calculatedBalance: number; displayedBalance: number; variance: number; isReconciled: boolean;
  isCreditCard: boolean; creditLimit: number; usedLimit: number; availableCredit: number;
  isDebitCard: boolean; parentBankId?: string; parentBankName?: string; parentBankBalance?: number;
  statusLabel: string; statusVariant: "reconciled" | "variance" | "linked" | "credit_limit";
  details: Record<string, any>; lastRefreshedAt: string;
}

export interface CalculateBalancesParams {
  instruments: RawPaymentInstrument[];
  cashEntries?: Array<{ id?: string; ref_id?: string | null; instrument_id?: string | null; direction?: string | null; amount?: number | string | null; method?: string | null; created_at?: string | null }> | null;
  settlements?: Array<Record<string, any>> | null; transactions?: Array<Record<string, any>> | null;
  expenses?: Array<Record<string, any>> | null; purchases?: Array<Record<string, any>> | null;
  portals?: Array<{ id: string; payment_instrument_id?: string | null }> | null;
}

export const POOL_TYPE_MAP: Record<string, string> = { cash: "cash", bank: "bank", upi: "upi_qr", upi_qr: "upi_qr", wallet: "wallet", aeps: "aeps", aeps_portal: "aeps", dmt: "dmt", dmt_portal: "dmt", credit_card: "credit_card", debit_card: "debit_card" };
const money = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };

export function calculateAccountBalances({
  instruments,
  cashEntries = [],
  settlements = [],
  transactions = [],
  expenses = [],
  purchases = [],
  portals = [],
}: CalculateBalancesParams): ReconciledAccountBalance[] {
  const safeInsts = instruments ?? [];
  const safeEntries = cashEntries ?? [];
  const safeSettlements = settlements ?? [];
  const safeTransactions = transactions ?? [];
  const safeExpenses = expenses ?? [];
  const safePurchases = purchases ?? [];
  const safePortals = portals ?? [];

  const inflows: Record<string, number> = {};
  const outflows: Record<string, number> = {};
  for (const inst of safeInsts) {
    inflows[inst.id] = 0;
    outflows[inst.id] = 0;
  }

  // 1. Process cash_entries (direct ledger movements)
  for (const entry of safeEntries) {
    const amount = money(entry.amount);
    if (amount <= 0) continue;
    const instrumentId = entry.instrument_id ?? null;
    if (!instrumentId || inflows[instrumentId] === undefined) continue;
    const direction = String(entry.direction ?? "").toLowerCase();
    if (direction === "in" || direction === "deposit") inflows[instrumentId] = money(inflows[instrumentId] + amount);
    else if (direction === "out" || direction === "withdrawal") outflows[instrumentId] = money(outflows[instrumentId] + amount);
  }

  // 2. Process settlements (inter-pool transfers and CC repayments/fundings)
  for (const set of safeSettlements) {
    if (set.status === "cancelled" || set.status === "failed") continue;
    const amt = money(set.amount);
    if (amt <= 0) continue;
    if (set.source_instrument_id && outflows[set.source_instrument_id] !== undefined) {
      outflows[set.source_instrument_id] = money(outflows[set.source_instrument_id] + amt);
    }
    if (set.dest_instrument_id && inflows[set.dest_instrument_id] !== undefined) {
      inflows[set.dest_instrument_id] = money(inflows[set.dest_instrument_id] + amt);
    }
  }

  // 3. Process transactions (Zone 1: Customer Inflow, Zone 2: Provider Funding Outflow)
  const portalToInst: Record<string, string> = {};
  for (const p of safePortals) {
    if (p.id && p.payment_instrument_id) {
      portalToInst[p.id] = p.payment_instrument_id;
    }
  }

  for (const tx of safeTransactions) {
    if (tx.status === "cancelled" || tx.status === "failed") continue;
    const totalAmt = money(tx.total_amount ?? tx.amount);
    const poolOut = money(tx.pool_out);
    const poolCredit = money(tx.pool_credit);

    // Zone 1: Customer Inflow
    const custInstId = tx.customer_instrument_id;
    if (custInstId && inflows[custInstId] !== undefined && totalAmt > 0) {
      inflows[custInstId] = money(inflows[custInstId] + totalAmt);
    }

    // Zone 2: Provider Funding Outflow / Portal Credit Inflow
    let fundingInstId = tx.funding_instrument_id;
    if (!fundingInstId && tx.portal_id && portalToInst[tx.portal_id]) {
      fundingInstId = portalToInst[tx.portal_id];
    }
    if (!fundingInstId && tx.instrument_id) {
      fundingInstId = tx.instrument_id;
    }

    if (fundingInstId && (outflows[fundingInstId] !== undefined || inflows[fundingInstId] !== undefined)) {
      if (poolCredit > 0) {
        inflows[fundingInstId] = money((inflows[fundingInstId] ?? 0) + poolCredit);
      }
      if (poolOut > 0) {
        outflows[fundingInstId] = money((outflows[fundingInstId] ?? 0) + poolOut);
      } else if (poolCredit === 0 && totalAmt > 0 && !custInstId) {
        outflows[fundingInstId] = money((outflows[fundingInstId] ?? 0) + totalAmt);
      }
    }
  }

  // 4. Process expenses
  for (const exp of safeExpenses) {
    if (exp.status === "cancelled") continue;
    const amt = money(exp.amount);
    if (amt <= 0) continue;
    const targetId = exp.payment_instrument_id;
    if (targetId && outflows[targetId] !== undefined) {
      outflows[targetId] = money(outflows[targetId] + amt);
    }
  }

  // 5. Process purchases
  for (const pur of safePurchases) {
    if (pur.status === "cancelled") continue;
    const amt = money(pur.paid_amount ?? pur.amount);
    if (amt <= 0) continue;
    const targetId = pur.payment_instrument_id;
    if (targetId && outflows[targetId] !== undefined) {
      outflows[targetId] = money(outflows[targetId] + amt);
    }
  }

  const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const preliminary = safeInsts.map((inst): ReconciledAccountBalance => {
    const opening = money(inst.opening_balance), totalInflows = money(inflows[inst.id]), totalOutflows = money(outflows[inst.id]);
    const netMovement = money(totalInflows - totalOutflows), isCreditCard = inst.type === "credit_card", isDebitCard = inst.type === "debit_card";
    let creditLimit = 0, usedLimit = 0, availableCredit = 0, calculatedBalance = money(opening + netMovement);
    let statusLabel = "✓ Reconciled"; let statusVariant: ReconciledAccountBalance["statusVariant"] = "reconciled";
    if (isCreditCard) {
      creditLimit = money(inst.details?.credit_limit || (opening > 0 ? opening : 50000));
      const openingUsed = money(inst.details?.used_limit ?? 0);
      usedLimit = Math.max(0, money(openingUsed + totalOutflows - totalInflows));
      availableCredit = Math.max(0, money(creditLimit - usedLimit));
      calculatedBalance = availableCredit;
      statusLabel = `Available: ₹${availableCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
      statusVariant = "credit_limit";
    }
    const storedBalance = inst.balance == null ? calculatedBalance : money(inst.balance), variance = money(storedBalance - calculatedBalance);
    return {
      id: inst.id,
      name: inst.name,
      type: inst.type,
      poolKey: POOL_TYPE_MAP[inst.type] ?? inst.type,
      isActive: inst.is_active !== false,
      openingBalance: isCreditCard ? creditLimit : opening,
      totalInflows,
      totalOutflows,
      netMovement,
      calculatedBalance,
      displayedBalance: calculatedBalance,
      variance,
      isReconciled: Math.abs(variance) < 0.01,
      isCreditCard,
      creditLimit,
      usedLimit,
      availableCredit,
      isDebitCard,
      statusLabel,
      statusVariant,
      details: (inst.details ?? {}) as Record<string, any>,
      lastRefreshedAt: timeStr,
    };
  });

  // Debit cards are not independent money pools. A bank link is mandatory.
  return preliminary.map((account) => {
    if (!account.isDebitCard) return account;
    const linkedId = account.details?.linked_bank_instrument_id as string | undefined;
    const parent = linkedId ? preliminary.find(c => c.id === linkedId && c.type === "bank" && c.isActive) : undefined;
    if (!parent) return { ...account, statusLabel: "⚠ Bank link required", statusVariant: "variance" as const, isReconciled: false };
    return {
      ...account,
      calculatedBalance: parent.calculatedBalance,
      displayedBalance: parent.calculatedBalance,
      variance: 0,
      isReconciled: true,
      parentBankId: parent.id,
      parentBankName: parent.name,
      parentBankBalance: parent.calculatedBalance,
      statusLabel: `Linked to ${parent.name}`,
      statusVariant: "linked" as const,
    };
  });
}
