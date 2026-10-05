/**
 * packages/ledger/src/invariants.ts
 * Cryptographic and mathematical invariant assertions for journal entries.
 */
import { JournalEntry } from "./types";
export declare class LedgerInvariantError extends Error {
    readonly details?: Record<string, unknown>;
    constructor(message: string, details?: Record<string, unknown>);
}
/**
 * Asserts that a journal entry satisfies strict double-entry invariants:
 * 1. Must contain at least two lines.
 * 2. Every line must have debit >= 0n and credit >= 0n.
 * 3. Exactly one side of each line must be positive (no line with both debit and credit).
 * 4. Total Debits MUST EXACTLY equal Total Credits: sum(debit) === sum(credit).
 */
export declare function assertJournalEntryBalanced(entry: JournalEntry): void;
