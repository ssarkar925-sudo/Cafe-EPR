import {
  buildTransactionFingerprint,
  validateImportedTransaction,
  type ImportedTransaction,
} from "@/lib/ai/transaction-import";
import type { BrowserWorkerResult, ReadOnlyBrowserPage } from "@/lib/ai/browser-worker";

export type CscDigiPaySelectors = {
  /** Selector for the transaction-history page/control. Must be learned from the owner. */
  historySelector: string;
  /** Optional selector that narrows history to cash withdrawal/AEPS records. */
  cashWithdrawalFilterSelector?: string;
  /** Selector matching one transaction row. */
  rowSelector: string;
  /** Selectors relative to each row for the required transaction fields. */
  fields: {
    externalTransactionId: string;
    externalReference?: string;
    status: string;
    transactionType: string;
    amount: string;
    fee?: string;
    commission?: string;
    occurredAt?: string;
    customerName?: string;
    customerMobile?: string;
  };
};

export type CscDigiPayAdapter = {
  providerName: "CSC DigiPay";
  readOnly: true;
  collect(page: ReadOnlyBrowserPage): Promise<BrowserWorkerResult>;
};

function parseMoney(value: string | null) {
  if (!value) return null;
  const normalized = value.replace(/,/g, "").replace(/[^0-9.-]/g, "").trim();
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

async function readField(page: ReadOnlyBrowserPage, selector: string) {
  return (await page.textContent(selector))?.trim() || null;
}

/**
 * Creates a CSC DigiPay adapter from an explicitly learned selector map.
 * No selectors are guessed here: an unknown/changed portal fails closed.
 */
export function createCscDigiPayAdapter(selectors: CscDigiPaySelectors): CscDigiPayAdapter {
  return {
    providerName: "CSC DigiPay",
    readOnly: true,
    async collect(page) {
      if (!selectors.historySelector || !selectors.rowSelector) {
        return {
          state: "stopped",
          reason: "workflow_not_learned",
          message: "CSC DigiPay workflow selectors have not been taught yet.",
        };
      }

      const beforeHistory = (await page.textContent("body")) ?? "";
      const loginMarker = /\b(login|sign[ -]?in|otp|pin|password|mfa|captcha)\b/i;
      if (loginMarker.test(beforeHistory)) {
        return {
          state: "stopped",
          reason: "login_required",
          message: "CSC DigiPay requires authentication or verification; worker stopped.",
        };
      }

      if ((await page.locatorCount(selectors.historySelector)) !== 1) {
        return {
          state: "stopped",
          reason: "layout_changed",
          message: "CSC DigiPay history control does not match the learned workflow.",
        };
      }

      await page.click(selectors.historySelector);

      if (selectors.cashWithdrawalFilterSelector) {
        if ((await page.locatorCount(selectors.cashWithdrawalFilterSelector)) !== 1) {
          return {
            state: "stopped",
            reason: "layout_changed",
            message: "CSC DigiPay AEPS/cash-withdrawal filter no longer matches the learned workflow.",
          };
        }
        await page.click(selectors.cashWithdrawalFilterSelector);
      }

      const body = (await page.textContent("body")) ?? "";
      if (/\b(otp|one[- ]time password|pin|password|passcode|aadhaar|captcha|payment authorization)\b/i.test(body)) {
        return {
          state: "stopped",
          reason: "secret_requested",
          message: "CSC DigiPay requested a secret or payment authorization; worker stopped.",
        };
      }

      const rowCount = await page.locatorCount(selectors.rowSelector);
      if (rowCount === 0) {
        return {
          state: "completed",
          transactions: [],
        };
      }

      const transactions: ImportedTransaction[] = [];
      const fingerprints = new Set<string>();

      for (let index = 1; index <= rowCount; index += 1) {
        const row = (suffix: string) => `${selectors.rowSelector}:nth-of-type(${index}) ${suffix}`;
        const externalTransactionId = await readField(page, row(selectors.fields.externalTransactionId));
        const status = (await readField(page, row(selectors.fields.status))) ?? "";
        const amount = parseMoney(await readField(page, row(selectors.fields.amount)));
        const transaction: ImportedTransaction = {
          sourceType: "aeps",
          providerName: "CSC DigiPay",
          externalTransactionId: externalTransactionId ?? "",
          externalReference: selectors.fields.externalReference
            ? await readField(page, row(selectors.fields.externalReference))
            : null,
          status,
          transactionType: (await readField(page, row(selectors.fields.transactionType))) ?? "",
          amount: amount ?? Number.NaN,
          fee: selectors.fields.fee ? parseMoney(await readField(page, row(selectors.fields.fee))) : null,
          commission: selectors.fields.commission
            ? parseMoney(await readField(page, row(selectors.fields.commission)))
            : null,
          occurredAt: selectors.fields.occurredAt
            ? await readField(page, row(selectors.fields.occurredAt))
            : null,
          customerName: selectors.fields.customerName
            ? await readField(page, row(selectors.fields.customerName))
            : null,
          customerMobile: selectors.fields.customerMobile
            ? await readField(page, row(selectors.fields.customerMobile))
            : null,
          rawData: {},
        };

        const errors = validateImportedTransaction(transaction);
        if (errors.length) {
          return {
            state: "stopped",
            reason: errors.includes("transaction is not completed/successful")
              ? "non_completed_transaction"
              : "ambiguous_transaction",
            message: `CSC DigiPay row ${index} failed validation: ${errors.join(", ")}.`,
          };
        }

        const fingerprint = buildTransactionFingerprint(transaction);
        if (fingerprints.has(fingerprint)) {
          continue;
        }
        fingerprints.add(fingerprint);
        transactions.push(transaction);
      }

      return { state: "completed", transactions };
    },
  };
}
