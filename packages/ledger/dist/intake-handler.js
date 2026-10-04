/**
 * packages/ledger/src/intake-handler.ts
 * Ingestion event parser and automatic journal entry generator.
 */
import { assertJournalEntryBalanced, LedgerInvariantError } from "./invariants.js";
import { createContraTransferEntry, createMerchantSettlementEntry } from "./posting-rules.js";
/**
 * Automatically maps an ingested external transaction into a balanced double-entry Journal Entry.
 */
export function processIntakeEventToJournal(event, registry) {
    const date = event.timestamp.split("T")[0] || event.timestamp;
    const eventId = event.id || `INTAKE-${Date.now()}`;
    switch (event.serviceType) {
        case "AEPS_CASH_OUT": {
            // Customer took cash via biometric on portal.
            // Portal Wallet float increases (+commission). Cash drawer decreases.
            const portal = registry.portalWallets[event.portalOrAppName] || {
                id: "acc-default-portal",
                name: `${event.portalOrAppName} Wallet Float`,
            };
            const commission = event.commissionPaisa || 0n;
            const netCashOut = event.grossAmountPaisa;
            const totalFloatCredit = netCashOut + commission;
            const entry = {
                sourceType: "EXTERNAL_PORTAL",
                sourceId: eventId,
                entryDate: date,
                narration: `AEPS Cash Out on ${event.portalOrAppName} [RRN: ${event.rrnOrUtr || "N/A"}]`,
                lines: [
                    {
                        accountId: portal.id,
                        accountName: portal.name,
                        debitPaisa: totalFloatCredit,
                        creditPaisa: 0n,
                    },
                    {
                        accountId: registry.cashDrawer.id,
                        accountName: registry.cashDrawer.name,
                        debitPaisa: 0n,
                        creditPaisa: netCashOut,
                    },
                    ...(commission > 0n
                        ? [
                            {
                                accountId: registry.commissionIncome.id,
                                accountName: registry.commissionIncome.name,
                                debitPaisa: 0n,
                                creditPaisa: commission,
                            },
                        ]
                        : []),
                ],
            };
            assertJournalEntryBalanced(entry);
            return entry;
        }
        case "DMT": {
            // Customer gave cash to send money via portal.
            // Cash Drawer increases (amount + customer fee). Portal Wallet decreases (amount + portal charge).
            const portal = registry.portalWallets[event.portalOrAppName] || {
                id: "acc-default-portal",
                name: `${event.portalOrAppName} Wallet Float`,
            };
            const feeIncome = event.commissionPaisa || 0n; // Shop margin
            const totalCashIn = event.grossAmountPaisa + feeIncome;
            const entry = {
                sourceType: "EXTERNAL_PORTAL",
                sourceId: eventId,
                entryDate: date,
                narration: `DMT Money Transfer on ${event.portalOrAppName} [RRN: ${event.rrnOrUtr || "N/A"}]`,
                lines: [
                    {
                        accountId: registry.cashDrawer.id,
                        accountName: registry.cashDrawer.name,
                        debitPaisa: totalCashIn,
                        creditPaisa: 0n,
                    },
                    {
                        accountId: portal.id,
                        accountName: portal.name,
                        debitPaisa: 0n,
                        creditPaisa: event.grossAmountPaisa,
                    },
                    ...(feeIncome > 0n
                        ? [
                            {
                                accountId: registry.commissionIncome.id,
                                accountName: registry.commissionIncome.name,
                                debitPaisa: 0n,
                                creditPaisa: feeIncome,
                            },
                        ]
                        : []),
                ],
            };
            assertJournalEntryBalanced(entry);
            return entry;
        }
        case "UPI_INWARD": {
            // Payment received on Shop Merchant QR.
            // QR Holding increases. Sales Revenue increases.
            const qrHolding = registry.upiHoldings[event.portalOrAppName] || {
                id: "acc-default-qr",
                name: `${event.portalOrAppName} QR Holding`,
            };
            const entry = {
                sourceType: "EXTERNAL_PORTAL",
                sourceId: eventId,
                entryDate: date,
                narration: `Inward UPI QR payment on ${event.portalOrAppName} [UTR: ${event.rrnOrUtr || "N/A"}]`,
                lines: [
                    {
                        accountId: qrHolding.id,
                        accountName: qrHolding.name,
                        debitPaisa: event.grossAmountPaisa,
                        creditPaisa: 0n,
                    },
                    {
                        accountId: registry.salesRevenue.id,
                        accountName: registry.salesRevenue.name,
                        debitPaisa: 0n,
                        creditPaisa: event.grossAmountPaisa,
                    },
                ],
            };
            assertJournalEntryBalanced(entry);
            return entry;
        }
        case "MERCHANT_SETTLEMENT": {
            // QR settlement into Bank account.
            const bank = registry.bankAccounts["SBI"] || Object.values(registry.bankAccounts)[0];
            const qrHolding = registry.upiHoldings[event.portalOrAppName] || {
                id: "acc-default-qr",
                name: `${event.portalOrAppName} QR Holding`,
            };
            return createMerchantSettlementEntry({
                settlementId: eventId,
                date,
                grossAmountPaisa: event.grossAmountPaisa,
                netSettledPaisa: event.netAmountPaisa || event.grossAmountPaisa,
                feePaisa: event.feePaisa || 0n,
                bankAccount: bank,
                upiHoldingAccount: qrHolding,
                gatewayFeeAccount: registry.payoutFeeExpense,
            });
        }
        case "ATM_WITHDRAWAL": {
            // Cash refilled into drawer from bank ATM.
            const bank = registry.bankAccounts["SBI"] || Object.values(registry.bankAccounts)[0];
            return createContraTransferEntry({
                transferId: eventId,
                date,
                fromAccount: bank,
                toAccount: registry.cashDrawer,
                amountPaisa: event.grossAmountPaisa,
                narration: `ATM Cash withdrawal into drawer [${event.portalOrAppName}]`,
            });
        }
        default:
            throw new LedgerInvariantError(`Unsupported intake service type: ${event.serviceType}`);
    }
}
