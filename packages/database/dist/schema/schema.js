/**
 * packages/database/src/schema/schema.ts
 * Production Drizzle ORM Schema for CafeERP.
 * All monetary amounts are bigint in paisa (1 INR = 100 paisa).
 */
import { pgTable, uuid, varchar, bigint, boolean, jsonb, timestamp, date, integer, numeric, text, bigserial, index, } from "drizzle-orm/pg-core";
// 1. Tenants (Isolation root)
export const tenants = pgTable("tenants", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
// 2. Accounts (Chart of Accounts & Treasury Pools)
export const accounts = pgTable("accounts", {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    code: varchar("code", { length: 20 }).notNull().unique(),
    name: varchar("name", { length: 100 }).notNull(),
    type: varchar("type", { length: 20 }).notNull(), // 'CASH', 'BANK', 'WALLET', 'CREDIT_CARD', 'UPI_HOLDING', 'KHATA', 'INCOME', 'EXPENSE'
    currency: varchar("currency", { length: 3 }).default("INR").notNull(),
    currentBalancePaisa: bigint("current_balance_paisa", { mode: "bigint" }).default(0n).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    tenantTypeIdx: index("idx_accounts_tenant_type").on(table.tenantId, table.type),
}));
// 3. Credit Card Details
export const creditCardDetails = pgTable("credit_card_details", {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    cardNetwork: varchar("card_network", { length: 20 }).default("VISA"),
    creditLimitPaisa: bigint("credit_limit_paisa", { mode: "bigint" }).notNull(),
    billingDayOfMonth: integer("billing_day_of_month").notNull(),
    dueDayOfMonth: integer("due_day_of_month").notNull(),
    alertDaysBefore: integer("alert_days_before").default(3).notNull(),
    lastBilledDuePaisa: bigint("last_billed_due_paisa", { mode: "bigint" }).default(0n).notNull(),
});
// 4. Loan Details
export const loanDetails = pgTable("loan_details", {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    lenderName: varchar("lender_name", { length: 100 }).notNull(),
    principalAmountPaisa: bigint("principal_amount_paisa", { mode: "bigint" }).notNull(),
    monthlyEmiPaisa: bigint("monthly_emi_paisa", { mode: "bigint" }).notNull(),
    emiDueDay: integer("emi_due_day").notNull(),
    linkedDebitBankAccountId: uuid("linked_debit_bank_account_id").references(() => accounts.id),
    status: varchar("status", { length: 20 }).default("ACTIVE").notNull(),
});
// 5. Customers & Khata
export const customers = pgTable("customers", {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    name: varchar("name", { length: 100 }).notNull(),
    phone: varchar("phone", { length: 15 }),
    creditLimitPaisa: bigint("credit_limit_paisa", { mode: "bigint" }).default(200000n).notNull(),
    currentDuePaisa: bigint("current_due_paisa", { mode: "bigint" }).default(0n).notNull(),
    allowKhata: boolean("allow_khata").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    tenantPhoneIdx: index("idx_customers_tenant_phone").on(table.tenantId, table.phone),
}));
// 6. Invoices
export const invoices = pgTable("invoices", {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    invoiceNumber: varchar("invoice_number", { length: 50 }).notNull().unique(),
    customerId: uuid("customer_id").references(() => customers.id),
    businessDate: date("business_date").notNull(),
    subtotalPaisa: bigint("subtotal_paisa", { mode: "bigint" }).notNull(),
    discountPaisa: bigint("discount_paisa", { mode: "bigint" }).default(0n).notNull(),
    grandTotalPaisa: bigint("grand_total_paisa", { mode: "bigint" }).notNull(),
    paymentStatus: varchar("payment_status", { length: 20 }).notNull(), // 'PAID', 'PARTIAL', 'UNPAID'
    createdByUserId: uuid("created_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
// 7. Invoice Items
export const invoiceItems = pgTable("invoice_items", {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
    itemName: varchar("item_name", { length: 150 }).notNull(),
    quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull(),
    unitRatePaisa: bigint("unit_rate_paisa", { mode: "bigint" }).notNull(),
    totalAmountPaisa: bigint("total_amount_paisa", { mode: "bigint" }).notNull(),
});
// 8. Payment Claims (Inward)
export const paymentClaims = pgTable("payment_claims", {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id").references(() => invoices.id),
    totalPaidPaisa: bigint("total_paid_paisa", { mode: "bigint" }).notNull(),
    status: varchar("status", { length: 20 }).default("RECOGNIZED").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
// 9. Payment Allocations (4 Cards: CASH, UPI, KHATA)
export const paymentAllocations = pgTable("payment_allocations", {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id").notNull().references(() => paymentClaims.id, { onDelete: "cascade" }),
    method: varchar("method", { length: 20 }).notNull(), // 'CASH', 'UPI', 'KHATA'
    amountPaisa: bigint("amount_paisa", { mode: "bigint" }).notNull(),
    destinationAccountId: uuid("destination_account_id").notNull().references(() => accounts.id),
    upiQrIdentifier: varchar("upi_qr_identifier", { length: 50 }),
    referenceNumber: varchar("reference_number", { length: 100 }),
});
// 10. Universal Contra Transfers (FROM ➔ TO)
export const contraTransfers = pgTable("contra_transfers", {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    transferDate: date("transfer_date").notNull(),
    fromAccountId: uuid("from_account_id").notNull().references(() => accounts.id),
    toAccountId: uuid("to_account_id").notNull().references(() => accounts.id),
    amountPaisa: bigint("amount_paisa", { mode: "bigint" }).notNull(),
    feePaisa: bigint("fee_paisa", { mode: "bigint" }).default(0n).notNull(),
    feeExpenseAccountId: uuid("fee_expense_account_id").references(() => accounts.id),
    referenceNote: text("reference_note"),
    sourceEventId: uuid("source_event_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
// 11. Journal Entries (Double-Entry Header)
export const journalEntries = pgTable("journal_entries", {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    entryNumber: bigserial("entry_number", { mode: "bigint" }).notNull().unique(),
    entryDate: date("entry_date").notNull(),
    sourceType: varchar("source_type", { length: 50 }).notNull(),
    sourceId: uuid("source_id").notNull(),
    narration: text("narration"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
// 12. Journal Lines (Double-Entry Lines)
export const journalLines = pgTable("journal_lines", {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id").notNull().references(() => journalEntries.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => accounts.id),
    debitPaisa: bigint("debit_paisa", { mode: "bigint" }).default(0n).notNull(),
    creditPaisa: bigint("credit_paisa", { mode: "bigint" }).default(0n).notNull(),
}, (table) => ({
    accountIdx: index("idx_journal_lines_account").on(table.accountId),
}));
// 13. Ingested Events (Silent Intake Staging)
export const ingestedEvents = pgTable("ingested_events", {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    source: varchar("source", { length: 30 }).notNull(),
    portalOrAppName: varchar("portal_or_app_name", { length: 50 }).notNull(),
    serviceType: varchar("service_type", { length: 30 }),
    rawPayload: jsonb("raw_payload").notNull(),
    parsedAmountPaisa: bigint("parsed_amount_paisa", { mode: "bigint" }),
    parsedCommissionPaisa: bigint("parsed_commission_paisa", { mode: "bigint" }).default(0n),
    rrnOrUtr: varchar("rrn_or_utr", { length: 100 }),
    status: varchar("status", { length: 20 }).default("PROCESSED").notNull(),
    matchedJournalEntryId: uuid("matched_journal_entry_id").references(() => journalEntries.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    rrnIdx: index("idx_ingested_events_rrn").on(table.rrnOrUtr),
}));
// 14. Day Closes
export const dayCloses = pgTable("day_closes", {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    businessDate: date("business_date").notNull().unique(),
    openingCashPaisa: bigint("opening_cash_paisa", { mode: "bigint" }).notNull(),
    computedCashInPaisa: bigint("computed_cash_in_paisa", { mode: "bigint" }).notNull(),
    computedCashOutPaisa: bigint("computed_cash_out_paisa", { mode: "bigint" }).notNull(),
    expectedCashPaisa: bigint("expected_cash_paisa", { mode: "bigint" }).notNull(),
    actualCountedCashPaisa: bigint("actual_counted_cash_paisa", { mode: "bigint" }).notNull(),
    variancePaisa: bigint("variance_paisa", { mode: "bigint" }).notNull(),
    varianceStatus: varchar("variance_status", { length: 20 }).notNull(),
    status: varchar("status", { length: 20 }).default("LOCKED").notNull(),
    closedByUserId: uuid("closed_by_user_id").notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }).defaultNow().notNull(),
});
// 15. Day Close Denominations
export const dayCloseDenominations = pgTable("day_close_denominations", {
    id: uuid("id").primaryKey().defaultRandom(),
    dayCloseId: uuid("day_close_id").notNull().references(() => dayCloses.id, { onDelete: "cascade" }),
    denominationValue: integer("denomination_value").notNull(),
    noteCount: integer("note_count").notNull(),
    subtotalPaisa: bigint("subtotal_paisa", { mode: "bigint" }).notNull(),
});
