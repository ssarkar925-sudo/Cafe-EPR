/**
 * Canonical Payment Account Balance Engine
 *
 * IMPORTANT:
 * `cash_entries` is the account-movement ledger. Transactions, expenses,
 * purchases and settlements are business/source documents and must not be
 * added a second time here. They already generate account movements.
 *
 * Normal account:
 *   opening + inflows - outflows = current balance
 *
 * Credit card:
 *   credit limit = fixed configuration
 *   used credit = opening utilization + charges - repayments
 *   available credit = limit - used
 *
 * Debit card:
 *   mirrors its explicitly linked bank account and is not added to liquid
 *   totals as a second asset.
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

function money(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/**
 * Calculates balances from ONE movement source only: cash_entries.
 *
 * IMPORTANT: An account movement without `instrument_id` is intentionally
 * ignored here. It is an accounting/reconciliation exception and must never
 * be guessed into an account merely because there is one account of that
 * payment method. Silent guessing can move real money to the wrong account.
 */
export function calculateAccountBalances({
  instruments,
  cashEntries = [],
}: CalculateBalancesParams): ReconciledAccountBalance[] {
  const safeInsts = instruments ?? [];
  const safeEntries = cashEntries ?? [];

  const inflows: Record<string, number> = {};
  const outflows: Record<string, number> = {};

  for (const inst of safeInsts) {
    inflows[inst.id] = 0;
    outflows[inst.id] = 0;
  }

  for (const entry of safeEntries) {
    const amount = money(entry.amount);
    if (amount <= 0) continue;

    // Never infer an account from `method`. The movement must explicitly
    // identify the instrument that owns the money movement.
    const instrumentId = entry.instrument_id ?? null;
    if (!instrumentId || inflows[instrumentId] === undefined) continue;

    const direction = String(entry.direction ?? "").toLowerCase();
    if (direction === "in" || direction === "deposit") {
      inflows[instrumentId] += amount;
    } else if (direction === "out" || direction === "withdrawal") {
      outflows[instrumentId] += amount;
    }
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const preliminary: ReconciledAccountBalance[] = safeInsts.map((inst) => {
    const opening = money(inst.opening_balance);
    const totalInflows = money(inflows[inst.id]);
    const totalOutflows = money(outflows[inst.id]);
    const netMovement = money(totalInflows - totalOutflows);
    const isCreditCard = inst.type === "credit_card";
    const isDebitCard = inst.type === "debit_card";

    let creditLimit = 0;
    let usedLimit = 0;
    let availableCredit = 0;
    let calculatedBalance = money(opening + netMovement);
    let statusLabel = "✓ Reconciled";
    let statusVariant: "reconciled" | "variance" | "linked" | "credit_limit" = "reconciled";

    if (isCreditCard) {
      creditLimit = money(inst.details?.credit_limit);
      const openingUsed = money(inst.details?.used_limit ?? inst.opening_balance);
      usedLimit = Math.max(0, money(openingUsed + totalOutflows - totalInflows));
      availableCredit = Math.max(0, money(creditLimit - usedLimit));
      calculatedBalance = availableCredit;
      statusLabel = `Available: ₹${availableCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
      statusVariant = "credit_limit";
    }

    // `balance` is legacy/display data only. We expose the canonical calculated
    // value and flag any stale stored balance instead of allowing it to win.
    const storedBalance = inst.balance == null ? calculatedBalance : money(inst.balance);
    const variance = money(storedBalance - calculatedBalance);

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

  // Debit cards are representations of their parent bank account, never a
  // second pool of money. Require an explicit link when multiple banks exist.
  return preliminary.map((account) => {
    if (!account.isDebitCard) return account;

    const linkedId = account.details?.linked_bank_instrument_id as string | undefined;
    const banks = preliminary.filter((candidate) => candidate.type === "bank" && candidate.isActive);
    const parent = linkedId
      ? preliminary.find((candidate) => candidate.id === linkedId)
      : banks.length === 1
        ? banks[0]
        : undefined;

    if (!parent) {
      return {
        ...account,
        statusLabel: "⚠ Bank link required",
        statusVariant: "variance" as const,
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
