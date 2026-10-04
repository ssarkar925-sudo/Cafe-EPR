/**
 * packages/contracts/src/payment.ts
 * Specification for:
 * 1. INWARD PAYMENT (4 Cards: CASH, UPI, KHATA, SPLIT)
 * 2. OUTWARD PAYMENT (4 Sources: BANK, CREDIT CARD, WALLET, CASH)
 */

export type InwardMethod = "CASH" | "UPI" | "KHATA" | "SPLIT";

export interface UpiQrOption {
  identifier: string; // e.g. 'PHONEPE_PRIMARY', 'PAYTM_ALL_IN_ONE', 'GPAY_BUSINESS'
  label: string;      // 'PhonePe Business QR (HDFC)'
  holdingAccountId: string;
  upiId: string;      // e.g. 'shop@ybl'
}

export interface SplitAllocation {
  method: "CASH" | "UPI" | "KHATA";
  amountPaisa: bigint;
  destinationAccountId: string; // Cash Drawer, Specific QR Holding Account, or Customer Khata
  upiQrIdentifier?: string;
  customerId?: string;          // Required if method === 'KHATA'
  referenceNumber?: string;     // Optional UTR / RRN
}

export interface InwardPaymentPayload {
  invoiceId?: string;
  totalAmountPaisa: bigint;
  method: InwardMethod;
  allocations: SplitAllocation[];
  customerId?: string;
  businessDate: string;
}

export type OutwardSourceType = "BANK" | "CREDIT_CARD" | "WALLET" | "CASH";

export interface OutwardPaymentPayload {
  sourceType: OutwardSourceType;
  sourceAccountId: string; // The specific Bank A/C, Credit Card, Wallet, or Cash Drawer
  amountPaisa: bigint;
  expenseCategoryAccountId: string; // e.g. Inventory/Supplies, Electricity, Rent, Personal Drawings
  paidTo: string; // e.g. 'Kolkata Paper Mart', 'WBSEDCL'
  referenceNote?: string;
  businessDate: string;
}
