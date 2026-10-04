/**
 * packages/ledger/src/posting-rules.ts
 * Deterministic journal generation functions for all financial events.
 * Every generated entry automatically runs through assertJournalEntryBalanced().
 */
import { assertJournalEntryBalanced, LedgerInvariantError } from "./invariants.js";
/**
 * 1. INWARD SALE (4 Cards: Cash, UPI QR, Khata, Split)
 * Debits destination accounts (Cash Drawer, QR Holding, Khata)
 * Credits Sales Revenue account
 */
export function createInwardSaleEntry(params) {
    let totalAllocated = 0n;
    const lines = [];
    for (const alloc of params.allocations) {
        if (alloc.amountPaisa <= 0n)
            continue;
        lines.push({
            accountId: alloc.account.id,
            accountName: alloc.account.name,
            debitPaisa: alloc.amountPaisa,
            creditPaisa: 0n,
        });
        totalAllocated += alloc.amountPaisa;
    }
    if (totalAllocated !== params.grandTotalPaisa) {
        throw new LedgerInvariantError(`Inward allocation mismatch: Sum of allocations (${totalAllocated}) !== Grand Total (${params.grandTotalPaisa}).`);
    }
    // Credit Sales Revenue
    lines.push({
        accountId: params.salesRevenueAccount.id,
        accountName: params.salesRevenueAccount.name,
        debitPaisa: 0n,
        creditPaisa: params.grandTotalPaisa,
    });
    const entry = {
        sourceType: "INVOICE",
        sourceId: params.invoiceId,
        entryDate: params.date,
        narration: params.narration || `Invoice sale settlement [${params.invoiceId}]`,
        lines,
    };
    assertJournalEntryBalanced(entry);
    return entry;
}
/**
 * 2. MERCHANT SETTLEMENT (Auto UPI QR to Bank)
 * Debits Bank Account (Gross amount received)
 * Credits UPI QR Holding Account (Clears pending settlement)
 * Handles optional MDR/bank fee if settlement is net.
 */
export function createMerchantSettlementEntry(params) {
    const fee = params.feePaisa || (params.grossAmountPaisa - params.netSettledPaisa);
    const lines = [];
    // Debit Bank Account
    lines.push({
        accountId: params.bankAccount.id,
        accountName: params.bankAccount.name,
        debitPaisa: params.netSettledPaisa,
        creditPaisa: 0n,
    });
    // Debit Fee Expense if any
    if (fee > 0n) {
        if (!params.gatewayFeeAccount) {
            throw new LedgerInvariantError("Settlement fee deducted but no gateway fee account provided.");
        }
        lines.push({
            accountId: params.gatewayFeeAccount.id,
            accountName: params.gatewayFeeAccount.name,
            debitPaisa: fee,
            creditPaisa: 0n,
        });
    }
    // Credit UPI Holding Account
    lines.push({
        accountId: params.upiHoldingAccount.id,
        accountName: params.upiHoldingAccount.name,
        debitPaisa: 0n,
        creditPaisa: params.grossAmountPaisa,
    });
    const entry = {
        sourceType: "MERCHANT_SETTLEMENT",
        sourceId: params.settlementId,
        entryDate: params.date,
        narration: params.narration || `Merchant QR settlement into ${params.bankAccount.name}`,
        lines,
    };
    assertJournalEntryBalanced(entry);
    return entry;
}
/**
 * 3. OUTWARD PAYMENT (Expenses / Supplier Bills)
 * Debits Expense / Inventory / Liability Account
 * Credits Source Account (Bank, Credit Card, Wallet, or Cash)
 */
export function createOutwardPaymentEntry(params) {
    if (params.amountPaisa <= 0n) {
        throw new LedgerInvariantError("Outward payment amount must be positive.");
    }
    const lines = [
        {
            accountId: params.targetCategoryAccount.id,
            accountName: params.targetCategoryAccount.name,
            debitPaisa: params.amountPaisa,
            creditPaisa: 0n,
        },
        {
            accountId: params.sourceAccount.id,
            accountName: params.sourceAccount.name,
            debitPaisa: 0n,
            creditPaisa: params.amountPaisa,
        },
    ];
    const entry = {
        sourceType: "OUTWARD_EXPENSE",
        sourceId: params.paymentId,
        entryDate: params.date,
        narration: params.narration || `Outward payment to ${params.paidTo} from ${params.sourceAccount.name}`,
        lines,
    };
    assertJournalEntryBalanced(entry);
    return entry;
}
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
export function createContraTransferEntry(params) {
    if (params.amountPaisa <= 0n) {
        throw new LedgerInvariantError("Transfer amount must be positive.");
    }
    const fee = params.feePaisa || 0n;
    const lines = [];
    // Debit Destination Account (Receiving funds)
    lines.push({
        accountId: params.toAccount.id,
        accountName: params.toAccount.name,
        debitPaisa: params.amountPaisa,
        creditPaisa: 0n,
    });
    // If a transfer fee is charged (e.g. ₹5 IMPS charge on AEPS payout)
    if (fee > 0n) {
        if (!params.feeExpenseAccount) {
            throw new LedgerInvariantError("Transfer fee specified but fee expense account missing.");
        }
        lines.push({
            accountId: params.feeExpenseAccount.id,
            accountName: params.feeExpenseAccount.name,
            debitPaisa: fee,
            creditPaisa: 0n,
        });
    }
    // Credit Source Account (Gross funds leaving = Amount + Fee)
    const totalLeaving = params.amountPaisa + fee;
    lines.push({
        accountId: params.fromAccount.id,
        accountName: params.fromAccount.name,
        debitPaisa: 0n,
        creditPaisa: totalLeaving,
    });
    const entry = {
        sourceType: "CONTRA_TRANSFER",
        sourceId: params.transferId,
        entryDate: params.date,
        narration: params.narration ||
            `Internal transfer from ${params.fromAccount.name} to ${params.toAccount.name}${fee > 0n ? ` (Fee: ₹${Number(fee) / 100})` : ""}`,
        lines,
    };
    assertJournalEntryBalanced(entry);
    return entry;
}
/**
 * 5. DAY CLOSE VARIANCE ADJUSTMENT
 * If actual counted cash != expected cash in drawer:
 * Shortage: Debit Cash Variance Expense, Credit Cash Drawer
 * Overage: Debit Cash Drawer, Credit Cash Variance Gain
 */
export function createDayCloseVarianceEntry(params) {
    if (params.variancePaisa === 0n) {
        throw new LedgerInvariantError("Variance is 0; no adjustment entry needed.");
    }
    const lines = [];
    if (params.variancePaisa < 0n) {
        // Shortage (e.g. -₹20 shortage)
        const shortageAmount = -params.variancePaisa;
        lines.push({
            accountId: params.varianceExpenseAccount.id,
            accountName: params.varianceExpenseAccount.name,
            debitPaisa: shortageAmount,
            creditPaisa: 0n,
        });
        lines.push({
            accountId: params.cashDrawerAccount.id,
            accountName: params.cashDrawerAccount.name,
            debitPaisa: 0n,
            creditPaisa: shortageAmount,
        });
    }
    else {
        // Overage (e.g. +₹20 extra)
        const overageAmount = params.variancePaisa;
        lines.push({
            accountId: params.cashDrawerAccount.id,
            accountName: params.cashDrawerAccount.name,
            debitPaisa: overageAmount,
            creditPaisa: 0n,
        });
        lines.push({
            accountId: params.varianceGainAccount.id,
            accountName: params.varianceGainAccount.name,
            debitPaisa: 0n,
            creditPaisa: overageAmount,
        });
    }
    const entry = {
        sourceType: "DAY_CLOSE_VARIANCE",
        sourceId: params.dayCloseId,
        entryDate: params.date,
        narration: params.narration ||
            `Day close cash variance adjustment: ${params.variancePaisa < 0n ? "Shortage" : "Overage"} of ₹${Number(params.variancePaisa < 0n ? -params.variancePaisa : params.variancePaisa) / 100}`,
        lines,
    };
    assertJournalEntryBalanced(entry);
    return entry;
}
