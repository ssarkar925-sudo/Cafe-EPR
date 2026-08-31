/**
 * Authoritative Payment Accounts & Instrument Live Balance Engine
 * 
 * Invariant: For EVERY payment instrument:
 * Current Balance = Opening Balance + Total Valid Inflows - Total Valid Outflows
 * 
 * Credit Cards:
 * Tracks Credit Limit, Current Used Utilization, and Current Available Credit.
 * Outflow (charges/provider funding) increases used credit and decreases available credit.
 * Inflow (bill repayment/settlement) decreases used credit and restores available credit.
 * 
 * Debit Cards:
 * Reflects the live balance of the linked parent bank account.
 */

export type InstrumentType =
  | "cash"
  | "bank"
  | "upi"
  | "upi_qr"
  | "wallet"
  | "debit_card"
  | "credit_card"
  | "aeps"
  | "aeps_portal"
  | "dmt"
  | "dmt_portal";

export interface RawPaymentInstrument {
  id: string;
  name: string;
  type: string;
  is_active?: boolean;
  opening_balance?: number | string | null;
  balance?: number | string | null;
  details?: {
    credit_limit?: number | string;
    used_limit?: number | string;
    linked_bank_instrument_id?: string;
    bank_name?: string;
    account_number?: string;
    ifsc?: string;
    upi_id?: string;
    notes?: string;
    [key: string]: any;
  } | null;
  created_at?: string;
}

export interface ReconciledAccountBalance {
  id: string;
  name: string;
  type: string;
  poolKey: string;
  isActive: boolean;
  openingBalance: number;
  totalInflows: number;
  totalOutflows: number;
  netMovement: number;
  calculatedBalance: number;
  displayedBalance: number;
  variance: number;
  isReconciled: boolean;
  isCreditCard: boolean;
  creditLimit: number;
  usedLimit: number;
  availableCredit: number;
  isDebitCard: boolean;
  parentBankId?: string;
  parentBankName?: string;
  parentBankBalance?: number;
  statusLabel: string;
  statusVariant: "reconciled" | "variance" | "linked" | "credit_limit";
  details: Record<string, any>;
  lastRefreshedAt: string;
}

export interface CalculateBalancesParams {
  instruments: RawPaymentInstrument[];
  cashEntries?: Array<{
    id?: string;
    instrument_id?: string | null;
    direction?: string | null;
    amount?: number | string | null;
    method?: string | null;
    created_at?: string | null;
  }> | null;
  settlements?: Array<{
    id?: string;
    source_instrument_id?: string | null;
    dest_instrument_id?: string | null;
    from_pool?: string | null;
    to_pool?: string | null;
    amount?: number | string | null;
    status?: string | null;
    created_at?: string | null;
  }> | null;
  transactions?: Array<{
    id?: string;
    instrument_id?: string | null;
    customer_instrument_id?: string | null;
    funding_instrument_id?: string | null;
    portal_id?: string | null;
    service_type?: string | null;
    total_amount?: number | string | null;
    amount?: number | string | null;
    service_fee?: number | string | null;
    portal_commission?: number | string | null;
    portal_charge?: number | string | null;
    pool_credit?: number | string | null;
    pool_out?: number | string | null;
    customer_pay_method?: string | null;
    status?: string | null;
    created_at?: string | null;
  }> | null;
  expenses?: Array<{
    id?: string;
    payment_instrument_id?: string | null;
    payment_method?: string | null;
    amount?: number | string | null;
    status?: string | null;
    created_at?: string | null;
  }> | null;
  purchases?: Array<{
    id?: string;
    payment_instrument_id?: string | null;
    payment_method?: string | null;
    paid_amount?: number | string | null;
    amount?: number | string | null;
    status?: string | null;
    created_at?: string | null;
  }> | null;
  portals?: Array<{
    id: string;
    payment_instrument_id?: string | null;
  }> | null;
}

export const POOL_TYPE_MAP: Record<string, string> = {
  cash: "cash",
  bank: "bank",
  upi: "upi_qr",
  upi_qr: "upi_qr",
  wallet: "wallet",
  aeps: "aeps",
  aeps_portal: "aeps",
  dmt: "dmt",
  dmt_portal: "dmt",
  credit_card: "credit_card",
  debit_card: "debit_card",
};

/**
 * Calculates live reconciled balances for every payment instrument.
 */
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
  const safeCes = cashEntries ?? [];
  const safeSets = settlements ?? [];
  const safeTxs = transactions ?? [];
  const safeExpenses = expenses ?? [];
  const safePurchases = purchases ?? [];
  const safePortals = portals ?? [];

  // Map portal_id -> instrument_id
  const portalToInst: Record<string, string> = {};
  for (const p of safePortals) {
    if (p.payment_instrument_id) {
      portalToInst[p.id] = p.payment_instrument_id;
    }
  }

  // Count active instruments per normalized type
  const countPerType: Record<string, number> = {};
  for (const inst of safeInsts) {
    if (inst.is_active !== false) {
      const pKey = POOL_TYPE_MAP[inst.type] || inst.type;
      countPerType[pKey] = (countPerType[pKey] ?? 0) + 1;
    }
  }

  // Track raw inflows and outflows per instrument ID
  const instInflows: Record<string, number> = {};
  const instOutflows: Record<string, number> = {};

  for (const inst of safeInsts) {
    instInflows[inst.id] = 0;
    instOutflows[inst.id] = 0;
  }

  // Helper to resolve single instrument by type/method if untagged
  function getSingleInstIdForType(methodOrType: string): string | null {
    const norm = POOL_TYPE_MAP[methodOrType] || methodOrType;
    if (countPerType[norm] === 1) {
      const found = safeInsts.find(
        (i) => i.is_active !== false && (POOL_TYPE_MAP[i.type] === norm || i.type === methodOrType)
      );
      return found?.id ?? null;
    }
    return null;
  }

  // 1. CASH ENTRIES
  for (const ce of safeCes) {
    const amt = Math.abs(Number(ce.amount) || 0);
    if (amt <= 0) continue;

    let targetId = ce.instrument_id;
    if (!targetId && ce.method) {
      targetId = getSingleInstIdForType(ce.method);
    }

    if (targetId && instInflows[targetId] !== undefined) {
      if (ce.direction === "in" || ce.direction === "deposit") {
        instInflows[targetId] = (instInflows[targetId] ?? 0) + amt;
      } else if (ce.direction === "out" || ce.direction === "withdrawal") {
        instOutflows[targetId] = (instOutflows[targetId] ?? 0) + amt;
      }
    }
  }

  // 2. SETTLEMENTS
  for (const s of safeSets) {
    if (s.status === "failed" || s.status === "reversed") continue;
    const amt = Math.abs(Number(s.amount) || 0);
    if (amt <= 0) continue;

    let srcId = s.source_instrument_id;
    if (!srcId && s.from_pool) {
      srcId = getSingleInstIdForType(s.from_pool);
    }
    if (srcId && instOutflows[srcId] !== undefined) {
      instOutflows[srcId] = (instOutflows[srcId] ?? 0) + amt;
    }

    let destId = s.dest_instrument_id;
    if (!destId && s.to_pool) {
      destId = getSingleInstIdForType(s.to_pool);
    }
    if (destId && instInflows[destId] !== undefined) {
      instInflows[destId] = (instInflows[destId] ?? 0) + amt;
    }
  }

  // 3. BUSINESS TRANSACTIONS (Zone 1 Collection vs Zone 2 Provider Funding)
  for (const tx of safeTxs) {
    if (tx.status === "failed" || tx.status === "reversed") continue;

    const totalAmt = Math.abs(Number(tx.total_amount || tx.amount) || 0);
    const poolCredit = Math.abs(Number(tx.pool_credit) || 0);
    const poolOut = Math.abs(Number(tx.pool_out) || 0);

    // Zone 1: Customer Collection (Inflow to shop)
    let custInstId = tx.customer_instrument_id;
    if (!custInstId && tx.customer_pay_method) {
      custInstId = getSingleInstIdForType(tx.customer_pay_method);
    }
    if (custInstId && instInflows[custInstId] !== undefined && totalAmt > 0) {
      instInflows[custInstId] = (instInflows[custInstId] ?? 0) + totalAmt;
    }

    // Zone 2: Provider Funding / Float Outflow
    let fundingInstId = tx.funding_instrument_id;
    if (!fundingInstId && tx.portal_id && portalToInst[tx.portal_id]) {
      fundingInstId = portalToInst[tx.portal_id];
    }
    if (!fundingInstId && tx.instrument_id) {
      fundingInstId = tx.instrument_id;
    }

    if (fundingInstId && (instOutflows[fundingInstId] !== undefined || instInflows[fundingInstId] !== undefined)) {
      if (poolCredit > 0) {
        instInflows[fundingInstId] = (instInflows[fundingInstId] ?? 0) + poolCredit;
      }
      if (poolOut > 0) {
        instOutflows[fundingInstId] = (instOutflows[fundingInstId] ?? 0) + poolOut;
      } else if (poolCredit === 0 && totalAmt > 0) {
        instOutflows[fundingInstId] = (instOutflows[fundingInstId] ?? 0) + totalAmt;
      }
    }
  }

  // 4. EXPENSES (Store operating outflows)
  for (const exp of safeExpenses) {
    if (exp.status === "cancelled") continue;
    const amt = Math.abs(Number(exp.amount) || 0);
    if (amt <= 0) continue;

    let targetId = exp.payment_instrument_id;
    if (!targetId && exp.payment_method) {
      targetId = getSingleInstIdForType(exp.payment_method);
    }
    if (targetId && instOutflows[targetId] !== undefined) {
      instOutflows[targetId] = (instOutflows[targetId] ?? 0) + amt;
    }
  }

  // 5. PURCHASES (Vendor stock procurements)
  for (const pur of safePurchases) {
    if (pur.status === "cancelled") continue;
    const amt = Math.abs(Number(pur.paid_amount || pur.amount) || 0);
    if (amt <= 0) continue;

    let targetId = pur.payment_instrument_id;
    if (!targetId && pur.payment_method) {
      targetId = getSingleInstIdForType(pur.payment_method);
    }
    if (targetId && instOutflows[targetId] !== undefined) {
      instOutflows[targetId] = (instOutflows[targetId] ?? 0) + amt;
    }
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  // First pass: Build normal & credit accounts
  const preliminaryResults: ReconciledAccountBalance[] = safeInsts.map((inst) => {
    const opening = Number(inst.opening_balance || 0);
    const inflows = instInflows[inst.id] ?? 0;
    const outflows = instOutflows[inst.id] ?? 0;
    const netDelta = inflows - outflows;

    const isCredit = inst.type === "credit_card";
    const isDebit = inst.type === "debit_card";
    const poolKey = POOL_TYPE_MAP[inst.type] || inst.type;

    let calcBal = opening + netDelta;
    let limit = 0;
    let used = 0;
    let available = 0;
    let statusLabel = "✓ Reconciled";
    let statusVariant: "reconciled" | "variance" | "linked" | "credit_limit" = "reconciled";

    if (isCredit) {
      limit = Number(inst.details?.credit_limit || (opening > 0 ? opening : 50000));
      const initialUsed = Number(inst.details?.used_limit || 0);
      used = Math.max(0, initialUsed + outflows - inflows);
      available = Math.max(0, limit - used);
      calcBal = opening + netDelta; // Available balance tracks net delta (e.g. 13,764 - 3,000 = 10,764)
      statusLabel = `Available: ₹${calcBal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
      statusVariant = "credit_limit";
    }

    const displayed = Number(inst.balance ?? calcBal);
    const variance = Number((displayed - calcBal).toFixed(2));

    return {
      id: inst.id,
      name: inst.name,
      type: inst.type,
      poolKey,
      isActive: inst.is_active !== false,
      openingBalance: opening,
      totalInflows: inflows,
      totalOutflows: outflows,
      netMovement: netDelta,
      calculatedBalance: calcBal,
      displayedBalance: displayed,
      variance,
      isReconciled: Math.abs(variance) < 0.01,
      isCreditCard: isCredit,
      creditLimit: limit,
      usedLimit: used,
      availableCredit: isCredit ? calcBal : 0,
      isDebitCard: isDebit,
      statusLabel,
      statusVariant,
      details: (inst.details ?? {}) as Record<string, any>,
      lastRefreshedAt: timeStr,
    };
  });

  // Second pass: Link Debit Cards to parent bank accounts
  const finalResults: ReconciledAccountBalance[] = preliminaryResults.map((acc) => {
    if (!acc.isDebitCard) return acc;

    const parentBankId =
      acc.details?.linked_bank_instrument_id ||
      (preliminaryResults.filter((b) => b.type === "bank").length === 1
        ? preliminaryResults.find((b) => b.type === "bank")?.id
        : null);

    const parentBank = parentBankId ? preliminaryResults.find((b) => b.id === parentBankId) : null;
    const parentBal = parentBank ? parentBank.calculatedBalance : acc.calculatedBalance;

    return {
      ...acc,
      calculatedBalance: parentBal,
      displayedBalance: parentBal,
      parentBankId: parentBankId ?? undefined,
      parentBankName: parentBank?.name || "Linked Bank Account",
      parentBankBalance: parentBal,
      statusLabel: `Linked to ${parentBank?.name || "Bank"}`,
      statusVariant: "linked",
    };
  });

  return finalResults;
}
