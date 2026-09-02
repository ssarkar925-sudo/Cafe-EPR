export const TRANSACTION_SOURCE_TYPES = [
  "aeps",
  "upi_merchant",
  "phone_merchant",
  "money_transfer",
  "other",
] as const;

export type TransactionSourceType = (typeof TRANSACTION_SOURCE_TYPES)[number];

export type ImportedTransaction = {
  sourceType: TransactionSourceType;
  providerName: string;
  externalTransactionId: string;
  externalReference?: string | null;
  status: string;
  transactionType: string;
  amount: number;
  fee?: number | null;
  commission?: number | null;
  occurredAt?: string | null;
  customerName?: string | null;
  customerMobile?: string | null;
  rawData: Record<string, unknown>;
};

export function normalizeExternalId(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function isCompletedTransaction(status: string) {
  return ["success", "successful", "completed", "complete", "settled"].includes(
    status.trim().toLowerCase(),
  );
}

export function validateImportedTransaction(input: ImportedTransaction) {
  const errors: string[] = [];
  if (!input.providerName.trim()) errors.push("providerName is required");
  if (!input.externalTransactionId.trim()) errors.push("externalTransactionId is required");
  if (!isCompletedTransaction(input.status)) errors.push("transaction is not completed/successful");
  if (!Number.isFinite(input.amount) || input.amount <= 0) errors.push("amount must be greater than zero");
  return errors;
}

export function buildTransactionFingerprint(input: ImportedTransaction) {
  return `${input.providerName.trim().toLowerCase()}|${normalizeExternalId(input.externalTransactionId)}`;
}
