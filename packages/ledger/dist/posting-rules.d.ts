/**
 * packages/ledger/src/posting-rules.ts
 * Deterministic journal generation functions for all financial events.
 * Every generated entry automatically runs through assertJournalEntryBalanced().
 */
import { JournalEntry } from "./types";
export interface AccountRef {
    id: string;
    name: string;
}
/**
 * 1. INWARD SALE (4 Cards: Cash, UPI QR, Khata, Split)
 * Debits destination accounts (Cash Drawer, QR Holding, Khata)
 * Credits Sales Revenue account
 */
export declare function createInwardSaleEntry(params: {
    invoiceId: string;
    date: string;
    grandTotalPaisa: bigint;
    salesRevenueAccount: AccountRef;
    allocations: {
        account: AccountRef;
        amountPaisa: bigint;
        methodLabel: string;
    }[];
    narration?: string;
}): JournalEntry;
/**
 * 2. MERCHANT SETTLEMENT (Auto UPI QR to Bank)
 * Debits Bank Account (Gross amount received)
 * Credits UPI QR Holding Account (Clears pending settlement)
 * Handles optional MDR/bank fee if settlement is net.
 */
export declare function createMerchantSettlementEntry(params: {
    settlementId: string;
    date: string;
    grossAmountPaisa: bigint;
    netSettledPaisa: bigint;
    feePaisa?: bigint;
    bankAccount: AccountRef;
    upiHoldingAccount: AccountRef;
    gatewayFeeAccount?: AccountRef;
    narration?: string;
}): JournalEntry;
/**
 * 3. OUTWARD PAYMENT (Expenses / Supplier Bills)
 * Debits Expense / Inventory / Liability Account
 * Credits Source Account (Bank, Credit Card, Wallet, or Cash)
 */
export declare function createOutwardPaymentEntry(params: {
    paymentId: string;
    date: string;
    amountPaisa: bigint;
    sourceAccount: AccountRef;
    targetCategoryAccount: AccountRef;
    paidTo: string;
    narration?: string;
}): JournalEntry;
/**
 * 4. UNIVERSAL CONTRA TRANSFER (Internal Money Movement: FROM ➔ TO)
 * Handles:
 * - Cash Deposit to Bank (Cash ➔ Bank)
 * - Bank to Bank (Bank A ➔ Bank B)
 * - AEPS Move-to-Bank with Payout Fee (Portal Wallet ➔ Bank + Fee)
 * - Wallet Load (Bank ➔ Portal Wallet)
 * - Bank/Cash to Credit Card Repayment (Bank/Cash ➔ Credit Card)
 * - ATM Cash Out (Bank ➔ Cash Drawer)
 */
export declare function createContraTransferEntry(params: {
    transferId: string;
    date: string;
    fromAccount: AccountRef;
    toAccount: AccountRef;
    amountPaisa: bigint;
    feePaisa?: bigint;
    feeExpenseAccount?: AccountRef;
    narration?: string;
}): JournalEntry;
/**
 * 5. DAY CLOSE VARIANCE ADJUSTMENT
 * If actual counted cash != expected cash in drawer:
 * Shortage: Debit Cash Variance Expense, Credit Cash Drawer
 * Overage: Debit Cash Drawer, Credit Cash Variance Gain
 */
export declare function createDayCloseVarianceEntry(params: {
    dayCloseId: string;
    date: string;
    cashDrawerAccount: AccountRef;
    varianceExpenseAccount: AccountRef;
    varianceGainAccount: AccountRef;
    variancePaisa: bigint;
    narration?: string;
}): JournalEntry;
