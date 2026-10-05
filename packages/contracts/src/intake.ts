/**
 * packages/contracts/src/intake.ts
 * Specification for incoming transaction events captured from:
 * 1. Chrome Extension (Web portals)
 * 2. Mobile Notification Listener (PhonePe, Paytm, JioPOS)
 * 3. Bank SMS Forwarder
 * 4. End-of-Day Statement Drop (Excel / PDF)
 */

export type IntakeSource =
  | "CHROME_EXTENSION"
  | "ANDROID_NOTIFICATION"
  | "SMS"
  | "STATEMENT_DROP"
  | "MANUAL_HOTKEY";

export type IntakeServiceType =
  | "AEPS_CASH_OUT"
  | "DMT"
  | "RECHARGE"
  | "BILL_PAYMENT"
  | "UPI_INWARD"
  | "MERCHANT_SETTLEMENT"
  | "ATM_WITHDRAWAL"
  | "CDM_DEPOSIT"
  | "OTHER";

export interface IntakeEventPayload {
  source: IntakeSource;
  portalOrAppName: string; // 'PayNearby', 'SpiceMoney', 'PhonePe', 'SBI', 'JioPOS'
  serviceType: IntakeServiceType;
  grossAmountPaisa: bigint;
  netAmountPaisa?: bigint;
  commissionPaisa?: bigint;
  feePaisa?: bigint;
  rrnOrUtr?: string;
  customerIdentifier?: string; // Phone number or consumer ID
  timestamp: string; // ISO 8601
  rawPayload: Record<string, unknown>;
}

export interface StatementReconciliationRow {
  rowNumber: number;
  date: string;
  description: string;
  rrnOrRef: string;
  debitPaisa: bigint;
  creditPaisa: bigint;
  balancePaisa?: bigint;
  matchedStatus: "MATCHED" | "HEALED" | "NEW_INSERTED" | "UNRESOLVED";
  matchedTransactionId?: string;
}
