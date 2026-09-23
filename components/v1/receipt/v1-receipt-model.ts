/**
 * V1 receipt model — thermal receipt milestone (pure types + builders).
 *
 * Every field comes from canonical V1 data: tenant name, invoice row,
 * invoice lines joined to product names, customer row, payment claims
 * with instrument labels, approver display name, and dues. Nothing is
 * reconstructed from cart state, product masters, or estimates after the
 * sale commits. Provisional receipts are built explicitly from the queued
 * draft and always carry the UNSYNCED watermark — never a canonical
 * number. No GST, no tax amounts, no secrets, no scope hashes.
 */

export interface ReceiptLine {
  name: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface ReceiptPayment {
  method: string;
  amount: number;
  instrument: string | null;
}

export interface V1ReceiptModel {
  businessName: string;
  canonicalNumber: string | null;
  provisionalNumber: string | null;
  provisional: boolean;
  invoiceDate: string;
  serverTimestamp: string | null;
  customer: { name: string; phone: string | null } | null;
  khataBalance: number | null;
  lines: ReceiptLine[];
  subtotal: number;
  discount: number;
  approverName: string | null;
  total: number;
  payments: ReceiptPayment[];
  status: string;
  editedFromNumber: string | null;
  recreatedByNumber: string | null;
}

export const UNSYNCED_RECEIPT_LABEL = "UNSYNCED — not final";

export function money(n: number): string {
  return `₹${Number(n).toFixed(2)}`;
}

/** Provisional receipt from a queued offline draft. All figures are the
 *  client estimates captured at queue time; the server total governs once
 *  acknowledged. */
export function buildProvisionalReceipt(args: {
  businessName: string;
  provisionalNumber: string;
  invoiceDate: string;
  customer: { name: string; phone: string | null } | null;
  lines: ReceiptLine[];
  subtotal: number;
  discount: number;
  total: number;
  payments: ReceiptPayment[];
}): V1ReceiptModel {
  return {
    businessName: args.businessName,
    canonicalNumber: null,
    provisionalNumber: args.provisionalNumber,
    provisional: true,
    invoiceDate: args.invoiceDate,
    serverTimestamp: null,
    customer: args.customer,
    khataBalance: null,
    lines: args.lines,
    subtotal: args.subtotal,
    discount: args.discount,
    approverName: null,
    total: args.total,
    payments: args.payments,
    status: "queued",
    editedFromNumber: null,
    recreatedByNumber: null,
  };
}
