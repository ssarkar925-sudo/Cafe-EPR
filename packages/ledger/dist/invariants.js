/**
 * packages/ledger/src/invariants.ts
 * Cryptographic and mathematical invariant assertions for journal entries.
 */
export class LedgerInvariantError extends Error {
    details;
    constructor(message, details) {
        super(`[LedgerInvariantError] ${message}`);
        this.details = details;
        this.name = "LedgerInvariantError";
    }
}
/**
 * Asserts that a journal entry satisfies strict double-entry invariants:
 * 1. Must contain at least two lines.
 * 2. Every line must have debit >= 0n and credit >= 0n.
 * 3. Exactly one side of each line must be positive (no line with both debit and credit).
 * 4. Total Debits MUST EXACTLY equal Total Credits: sum(debit) === sum(credit).
 */
export function assertJournalEntryBalanced(entry) {
    if (!entry.lines || entry.lines.length < 2) {
        throw new LedgerInvariantError("Journal entry must contain at least 2 lines.", {
            sourceType: entry.sourceType,
            sourceId: entry.sourceId,
            lineCount: entry.lines?.length || 0,
        });
    }
    let totalDebit = 0n;
    let totalCredit = 0n;
    for (let i = 0; i < entry.lines.length; i++) {
        const line = entry.lines[i];
        if (line.debitPaisa < 0n || line.creditPaisa < 0n) {
            throw new LedgerInvariantError(`Negative amounts are strictly illegal on line ${i}.`, {
                line,
            });
        }
        if (line.debitPaisa === 0n && line.creditPaisa === 0n) {
            throw new LedgerInvariantError(`Line ${i} has both 0 debit and 0 credit.`, { line });
        }
        if (line.debitPaisa > 0n && line.creditPaisa > 0n) {
            throw new LedgerInvariantError(`Line ${i} cannot have both positive debit and positive credit. Split into separate lines.`, { line });
        }
        totalDebit += line.debitPaisa;
        totalCredit += line.creditPaisa;
    }
    if (totalDebit !== totalCredit) {
        throw new LedgerInvariantError(`Double-entry imbalance: Total Debits (${totalDebit} paisa) !== Total Credits (${totalCredit} paisa). Imbalance: ${totalDebit - totalCredit} paisa`, {
            totalDebit,
            totalCredit,
            imbalancePaisa: totalDebit - totalCredit,
            entry,
        });
    }
}
