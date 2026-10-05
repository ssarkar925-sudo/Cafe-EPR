/**
 * packages/contracts/src/day-close.ts
 * Specification for the 5-Minute Nightly Day-Close Wizard.
 */

export interface CashDenominationCount {
  value: 500 | 200 | 100 | 50 | 20 | 10 | 5 | 2 | 1;
  count: number;
  subtotalPaisa: bigint;
}

export interface DayCloseSubmission {
  businessDate: string; // 'YYYY-MM-DD'
  openingCashPaisa: bigint;
  computedCashInPaisa: bigint;
  computedCashOutPaisa: bigint;
  expectedCashPaisa: bigint; // opening + in - out
  countedDenominations: CashDenominationCount[];
  actualCountedCashPaisa: bigint;
  variancePaisa: bigint; // actual - expected
  varianceAccountedAction: "MATCHED" | "AUTO_TOLERATED" | "ADMIN_APPROVED_VARIANCE";
  portalFloatSnapshots: {
    portalAccountId: string;
    portalName: string;
    expectedBalancePaisa: bigint;
    verifiedByOperator: boolean;
  }[];
  closedByUserId: string;
  notes?: string;
}
