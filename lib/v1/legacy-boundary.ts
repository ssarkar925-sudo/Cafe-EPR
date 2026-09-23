/**
 * V1 / legacy boundary — single source of truth for what is NOT V1.
 *
 * The greenfield V1 baseline (G0–G13) does not contain these objects or
 * behaviors. New V1 code must never import, call, or map onto them. The
 * static contract test (`scripts/test-v1-foundation-contract.mjs`) enforces
 * this file's lists against `lib/v1/**`.
 *
 * Legacy modules that still use these paths keep working untouched; they are
 * inventoried by the test report and replaced in later application phases.
 */

/** Legacy RPC names. NOT V1 targets (V1 overlap note below is the exception). */
export const LEGACY_RPC_NAMES: readonly string[] = [
  "create_business_txn",
  "create_recharge",
  "record_invoice_payment",
  "record_invoice_multi_payment",
  "cancel_quick_sale",
  "reverse_business_txn",
  "record_bill_payment",
  "edit_bill_payment",
  "update_recharge",
  "update_business_txn",
  "record_advance",
  "return_advance",
  "process_return",
  "cancel_expense",
  "add_expense",
  "update_expense",
  "set_opening_balance",
  "record_customer_multi_payment",
  "record_quick_sale",
  "record_customer_due_payment",
  "record_customer_payment_atomic",
  "create_dmt_business_txn_multi_collection",
  "create_settlement",
  "create_supplier",
  "create_product_with_opening_stock",
  "apply_opening_inventory",
  "adjust_stock_manual",
  "adjust_customer_ledger",
  "process_purchase_return",
  "reverse_settlement",
  "reverse_close",
  "cancel_open_close",
];

/**
 * RPC names shared by spelling between legacy and V1. Same endpoint string,
 * DIFFERENT backend signatures (legacy create_sale takes 19 args; V1
 * create_sale takes p_customer_id/p_invoice_date/p_lines/…).
 * V1 callers must use the V1 param shapes from v1-contracts.ts; the proxy
 * forwards args verbatim and Postgres resolves the overload by arity.
 */
export const SHARED_RPC_NAMES: readonly string[] = [
  "create_sale",
  "cancel_invoice",
  "edit_invoice",
];

/** Legacy tables. None exist in the V1 baseline. */
export const LEGACY_TABLE_NAMES: readonly string[] = [
  "quick_sales",
  "quick_sale_items",
  "payments",
  "cash_entries",
  "transactions",
  "sales",
  "invoice_items",
  "customer_ledger",
  "supplier_ledger",
  "opening_balances",
  "opening_positions",
  "closings",
  "expenses",
  "settlements",
  "services",
  "categories",
];

/** Legacy behaviors that must never leak into V1 code. */
export const LEGACY_BEHAVIORS: readonly string[] = [
  "WAC costing (V1 uses FIFO lots)",
  "GST computation (V1 dormant flags only)",
  "quick-sale accounting",
  "legacy payment-table writes",
  "process_return (V1 composes approval + cancel/recreate + claims)",
  "legacy transaction posting",
];

/** True if the name is legacy-only (not V1, not shared spelling). */
export function isLegacyOnlyRpc(name: string): boolean {
  return (
    (LEGACY_RPC_NAMES as readonly string[]).includes(name) &&
    !(SHARED_RPC_NAMES as readonly string[]).includes(name)
  );
}
