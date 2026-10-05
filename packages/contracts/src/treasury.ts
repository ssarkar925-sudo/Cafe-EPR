/**
 * packages/contracts/src/treasury.ts
 * Type definitions and validation schemas for Treasury, Bank Accounts,
 * Credit Cards, Wallets, and Universal Contra Transfers.
 */

export type AccountType =
  | "CASH"
  | "BANK"
  | "WALLET"
  | "CREDIT_CARD"
  | "UPI_HOLDING"
  | "KHATA"
  | "INCOME"
  | "EXPENSE";

export interface TreasuryAccount {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  type: AccountType;
  currency: string;
  currentBalancePaisa: bigint; // BigInt in paisa (100 paisa = 1 INR)
  isActive: boolean;
  metadata?: {
    accountNumberMasked?: string;
    ifsc?: string;
    bankName?: string;
    portalName?: string;
    creditLimitPaisa?: bigint;
    billingDayOfMonth?: number;
    dueDayOfMonth?: number;
    qrIdentifier?: string;
  };
}

export interface CreditCardAccountDetails {
  accountId: string;
  cardName: string;
  cardNetwork: "VISA" | "MASTERCARD" | "RUPAY" | "OTHER";
  creditLimitPaisa: bigint;
  currentOutstandingPaisa: bigint;
  availableLimitPaisa: bigint;
  billingDayOfMonth: number;
  dueDayOfMonth: number;
  alertDaysBefore: number;
  lastBilledDuePaisa: bigint;
}

export interface LoanAccountDetails {
  accountId: string;
  lenderName: string;
  principalAmountPaisa: bigint;
  outstandingPrincipalPaisa: bigint;
  monthlyEmiPaisa: bigint;
  emiDueDay: number;
  linkedDebitBankAccountId: string;
  status: "ACTIVE" | "CLOSED";
}

/**
 * Universal Contra Transfer (Internal Money Movement)
 * FROM (Source) ➔ TO (Destination)
 */
export interface ContraTransferRequest {
  fromAccountId: string;
  toAccountId: string;
  amountPaisa: bigint;
  feePaisa?: bigint; // e.g. AEPS payout fee, gateway load fee
  feeExpenseAccountId?: string;
  referenceNote?: string;
  sourceEventId?: string; // If auto-detected from Bank SMS / Portal Statement
  date: string; // ISO date string 'YYYY-MM-DD'
}
