/**
 * Canonical Payment Account Balance Engine.
 *
 * current_balance remains authoritative when it is populated. When
 * there is no persisted current balance, the engine reconstructs the
 * position from opening balance plus successful ledger movements.
 * Operational records are attributed to the instrument that actually
 * receives/pays the money; customer collection and provider funding
 * are intentionally separate zones.
 */
export type InstrumentType =
  | "cash" | "bank" | "upi" | "upi_qr" | "wallet" | "debit_card"
  | "credit_card" | "aeps" | "aeps_portal" | "dmt" | "dmt_portal";

export interface RawPaymentInstrument {
  id: string;
  name: string;
  type: string;
  is_active?: boolean;
  opening_balance?: number | string | null;
  balance?: number | string | null;
  current_balance?: number | string | null;
  details?: {
    credit_limit?: number | string;
    used_limit?: number | string;
    linked_bank_instrument_id?: string;
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
    ref_id?: string | null;
    instrument_id?: string | null;
    direction?: string | null;
    amount?: number | string | null;
    method?: string | null;
    created_at?: string | null;
  }> | null;
  settlements?: Array<Record<string, any>> | null;
  transactions?: Array<Record<string, any>> | null;
  expenses?: Array<Record<string, any>> | null;
  purchases?: Array<Record<string, any>> | null;
  portals?: Array<{ id: string; payment_instrument_id?: string | null }> | null;
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

const money = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

const isSuccess = (row: Record<string, any>): boolean => {
  const status = String(row.status ?? row.state ?? "success").toLowerCase();
  return !["reversed", "reverse", "cancelled", "canceled", "void", "failed", "failure", "deleted"].includes(status);
};

const addDelta = (
  inflows: Record<string, number>,
  outflows: Record<string, number>,
  instrumentId: string | null | undefined,
  direction: "in" | "out",
  rawAmount: unknown,
) => {
  if (!instrumentId) return;
  const amount = money(rawAmount);
  if (amount <= 0 || inflows[instrumentId] === undefined) return;
  if (direction === "in") inflows[instrumentId] = money(inflows[instrumentId] + amount);
  else outflows[instrumentId] = money(outflows[instrumentId] + amount);
};

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
  const inflows: Record<string, number> = {};
  const outflows: Record<string, number> = {};
  for (const inst of safeInsts) {
    inflows[inst.id] = 0;
    outflows[inst.id] = 0;
  }

  const portalToInstrument: Record<string, string> = {};
  for (const portal of portals ?? []) {
    if (portal.id && portal.payment_instrument_id) portalToInstrument[portal.id] = portal.payment_instrument_id;
  }

  for (const entry of cashEntries ?? []) {
    const direction = String(entry.direction ?? "").toLowerCase();
    if (direction === "in" || direction === "deposit") addDelta(inflows, outflows, entry.instrument_id, "in", entry.amount);
    else if (direction === "out" || direction === "withdrawal") addDelta(inflows, outflows, entry.instrument_id, "out", entry.amount);
  }

  for (const settlement of settlements ?? []) {
    if (!isSuccess(settlement)) continue;
    addDelta(inflows, outflows, settlement.dest_instrument_id ?? settlement.destination_instrument_id, "in", settlement.amount);
    addDelta(inflows, outflows, settlement.source_instrument_id, "out", settlement.amount);
  }

  for (const transaction of transactions ?? []) {
    if (!isSuccess(transaction)) continue;

    // Customer collection leg: this credits the actual customer payment
    // instrument and must never leak into the provider funding account.
    addDelta(
      inflows,
      outflows,
      transaction.customer_instrument_id ?? transaction.customer_payment_instrument_id,
      "in",
      transaction.total_amount ?? transaction.customer_amount,
    );

    // Provider/payout leg: one and only one funding account is charged.
    let fundingId =
      transaction.funding_instrument_id ??
      transaction.pay_from_instrument_id ??
      transaction.instrument_id ??
      null;
    if (!fundingId && transaction.portal_id) fundingId = portalToInstrument[transaction.portal_id] ?? null;

    const poolOut = money(transaction.pool_out ?? transaction.provider_amount ?? 0);
    const poolCredit = money(transaction.pool_credit ?? transaction.provider_credit ?? 0);
    if (fundingId) {
      addDelta(inflows, outflows, fundingId, "in", poolCredit);
      addDelta(inflows, outflows, fundingId, "out", poolOut);
    }
  }

  for (const expense of expenses ?? []) {
    if (!isSuccess(expense)) continue;
    addDelta(inflows, outflows, expense.payment_instrument_id ?? expense.instrument_id, "out", expense.amount ?? expense.paid_amount);
  }

  for (const purchase of purchases ?? []) {
    if (!isSuccess(purchase)) continue;
    addDelta(inflows, outflows, purchase.payment_instrument_id ?? purchase.instrument_id, "out", purchase.paid_amount ?? purchase.amount);
  }

  const timeStr = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const preliminary = safeInsts.map((inst): ReconciledAccountBalance => {
    const opening = money(inst.opening_balance);
    const totalInflows = money(inflows[inst.id]);
    const totalOutflows = money(outflows[inst.id]);
    const netMovement = money(totalInflows - totalOutflows);
    const isCreditCard = inst.type === "credit_card";
    const isDebitCard = inst.type === "debit_card";
    const storedCurrent = inst.current_balance == null ? null : money(inst.current_balance);

    const creditLimit = isCreditCard
      ? money(inst.details?.credit_limit ?? (opening > 0 ? opening : 50000))
      : 0;

    const reconstructedBalance = isCreditCard
      ? money(creditLimit + netMovement)
      : money(opening + netMovement);

    const calculatedBalance = storedCurrent == null ? reconstructedBalance : storedCurrent;
    const availableCredit = isCreditCard ? Math.max(0, calculatedBalance) : 0;
    const usedLimit = isCreditCard ? Math.max(0, money(creditLimit - availableCredit)) : 0;

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
      variance: 0,
      isReconciled: true,
      isCreditCard,
      creditLimit,
      usedLimit,
      availableCredit,
      isDebitCard,
      statusLabel: isCreditCard
        ? `Available: ₹${availableCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
        : "✓ Reconciled",
      statusVariant: isCreditCard ? "credit_limit" : "reconciled",
      details: (inst.details ?? {}) as Record<string, any>,
      lastRefreshedAt: timeStr,
    };
  });

  return preliminary.map((account) => {
    if (!account.isDebitCard) return account;
    const linkedId = account.details?.linked_bank_instrument_id as string | undefined;
    const parent = linkedId
      ? preliminary.find((candidate) => candidate.id === linkedId && candidate.type === "bank" && candidate.isActive)
      : undefined;
    if (!parent) {
      return {
        ...account,
        statusLabel: "⚠ Bank link required",
        statusVariant: "variance" as const,
        isReconciled: false,
      };
    }
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
