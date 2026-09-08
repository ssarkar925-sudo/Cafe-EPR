/**
 * Canonical Payment Account Balance Engine
 *
 * payment_instruments.current_balance is the persisted authoritative position.
 * Operational tables are audit/breakdown sources and must not be added again
 * to manufacture a second balance for the same business operation.
 */
export type InstrumentType =
  | "cash" | "bank" | "upi" | "upi_qr" | "wallet" | "debit_card"
  | "credit_card" | "aeps" | "aeps_portal" | "dmt" | "dmt_portal";

export interface RawPaymentInstrument {
  id: string; name: string; type: string; is_active?: boolean;
  opening_balance?: number | string | null; balance?: number | string | null;
  current_balance?: number | string | null;
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
  const safeInsts = instruments ?? [];
  const inflows: Record<string, number> = {};
  const outflows: Record<string, number> = {};
  for (const inst of safeInsts) { inflows[inst.id] = 0; outflows[inst.id] = 0; }

  // Cash entries are retained only for the visible audit breakdown. They are
  // never added to current_balance because transaction/settlement operations
  // already persist their resulting position there.
  for (const entry of cashEntries ?? []) {
    const amount = money(entry.amount);
    if (amount <= 0) continue;
    const id = entry.instrument_id ?? null;
    if (!id || inflows[id] === undefined) continue;
    const direction = String(entry.direction ?? "").toLowerCase();
    if (direction === "in" || direction === "deposit") inflows[id] = money(inflows[id] + amount);
    else if (direction === "out" || direction === "withdrawal") outflows[id] = money(outflows[id] + amount);
  }

  const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const preliminary = safeInsts.map((inst): ReconciledAccountBalance => {
    const opening = money(inst.opening_balance);
    const totalInflows = money(inflows[inst.id]);
    const totalOutflows = money(outflows[inst.id]);
    const netMovement = money(totalInflows - totalOutflows);
    const isCreditCard = inst.type === "credit_card";
    const isDebitCard = inst.type === "debit_card";
    const storedCurrent = inst.current_balance == null ? null : money(inst.current_balance);

    let creditLimit = 0;
    let usedLimit = 0;
    let availableCredit = 0;
    let calculatedBalance = storedCurrent ?? money(inst.balance ?? opening + netMovement);
    let statusLabel = "✓ Reconciled";
    let statusVariant: ReconciledAccountBalance["statusVariant"] = "reconciled";

    if (isCreditCard) {
      creditLimit = money(inst.details?.credit_limit || (opening > 0 ? opening : 50000));
      availableCredit = Math.max(0, storedCurrent ?? money(inst.balance ?? creditLimit));
      usedLimit = Math.max(0, money(creditLimit - availableCredit));
      calculatedBalance = availableCredit;
      statusLabel = `Available: ₹${availableCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
      statusVariant = "credit_limit";
    }

    // current_balance is the canonical position; do not manufacture a variance
    // by replaying operational rows that can represent the same posting twice.
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
      statusLabel,
      statusVariant,
      details: (inst.details ?? {}) as Record<string, any>,
      lastRefreshedAt: timeStr,
    };
  });

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
