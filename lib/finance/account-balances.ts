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

export function calculateAccountBalances({ instruments, cashEntries = [] }: CalculateBalancesParams): ReconciledAccountBalance[] {
  const safeInsts = instruments ?? [], safeEntries = cashEntries ?? [];
  const inflows: Record<string, number> = {}, outflows: Record<string, number> = {};
  for (const inst of safeInsts) { inflows[inst.id] = 0; outflows[inst.id] = 0; }
  for (const entry of safeEntries) {
    const amount = money(entry.amount); if (amount <= 0) continue;
    const instrumentId = entry.instrument_id ?? null;
    if (!instrumentId || inflows[instrumentId] === undefined) continue;
    const direction = String(entry.direction ?? "").toLowerCase();
    if (direction === "in" || direction === "deposit") inflows[instrumentId] += amount;
    else if (direction === "out" || direction === "withdrawal") outflows[instrumentId] += amount;
  }
  const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const preliminary = safeInsts.map((inst): ReconciledAccountBalance => {
    const opening = money(inst.opening_balance), totalInflows = money(inflows[inst.id]), totalOutflows = money(outflows[inst.id]);
    const netMovement = money(totalInflows - totalOutflows), isCreditCard = inst.type === "credit_card", isDebitCard = inst.type === "debit_card";
    let creditLimit = 0, usedLimit = 0, availableCredit = 0, calculatedBalance = money(opening + netMovement);
    let statusLabel = "✓ Reconciled"; let statusVariant: ReconciledAccountBalance["statusVariant"] = "reconciled";
    if (isCreditCard) {
      creditLimit = money(inst.details?.credit_limit);
      const openingUsed = money(inst.details?.used_limit ?? inst.opening_balance);
      usedLimit = Math.max(0, money(openingUsed + totalOutflows - totalInflows));
      availableCredit = Math.max(0, money(creditLimit - usedLimit)); calculatedBalance = availableCredit;
      statusLabel = `Available: ₹${availableCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`; statusVariant = "credit_limit";
    }
    const storedBalance = inst.balance == null ? calculatedBalance : money(inst.balance), variance = money(storedBalance - calculatedBalance);
    return { id: inst.id, name: inst.name, type: inst.type, poolKey: POOL_TYPE_MAP[inst.type] ?? inst.type, isActive: inst.is_active !== false, openingBalance: isCreditCard ? creditLimit : opening, totalInflows, totalOutflows, netMovement, calculatedBalance, displayedBalance: calculatedBalance, variance, isReconciled: Math.abs(variance) < 0.01, isCreditCard, creditLimit, usedLimit, availableCredit, isDebitCard, statusLabel, statusVariant, details: (inst.details ?? {}) as Record<string, any>, lastRefreshedAt: timeStr };
  });

  // Debit cards are not independent money pools. A bank link is mandatory.
  // Never fall back to the only active bank: doing so makes ownership implicit.
  return preliminary.map((account) => {
    if (!account.isDebitCard) return account;
    const linkedId = account.details?.linked_bank_instrument_id as string | undefined;
    const parent = linkedId ? preliminary.find(c => c.id === linkedId && c.type === "bank" && c.isActive) : undefined;
    if (!parent) return { ...account, statusLabel: "⚠ Bank link required", statusVariant: "variance" as const, isReconciled: false };
    return { ...account, calculatedBalance: parent.calculatedBalance, displayedBalance: parent.calculatedBalance, variance: 0, isReconciled: true, parentBankId: parent.id, parentBankName: parent.name, parentBankBalance: parent.calculatedBalance, statusLabel: `Linked to ${parent.name}`, statusVariant: "linked" as const };
  });
}
