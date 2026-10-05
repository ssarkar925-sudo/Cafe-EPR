/**
 * packages/ledger/src/types.ts
 * Core types for double-entry bookkeeping engine using BigInt paisa.
 */
export interface JournalLine {
    accountId: string;
    accountName: string;
    debitPaisa: bigint;
    creditPaisa: bigint;
}
export interface JournalEntry {
    id?: string;
    entryNumber?: string | number;
    entryDate: string;
    sourceType: "INVOICE" | "MERCHANT_SETTLEMENT" | "CONTRA_TRANSFER" | "OUTWARD_EXPENSE" | "EXTERNAL_PORTAL" | "DAY_CLOSE_VARIANCE";
    sourceId: string;
    narration: string;
    lines: JournalLine[];
}
export interface LedgerBalanceMap {
    [accountId: string]: bigint;
}
