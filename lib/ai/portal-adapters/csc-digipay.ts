import {
  buildTransactionFingerprint,
  isCompletedTransaction,
  validateImportedTransaction,
  type ImportedTransaction,
} from "@/lib/ai/transaction-import";
import type { BrowserWorkerResult, ReadOnlyBrowserPage } from "@/lib/ai/browser-worker";

export type CscDigiPaySelectors = {
  /** Selector for the transaction-history page/control. Must be learned from the owner. */
  historySelector: string;
  /** Optional selector that narrows history to cash withdrawal/AEPS records. */
  cashWithdrawalFilterSelector?: string;
  /**
   * Selector template for one transaction row. It must contain {index}; the
   * worker replaces it with a 1-based row index. This avoids guessing DOM
   * structure with non-standard selector syntax.
   */
  rowSelectorTemplate: string;
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

function stop(reason: "workflow_not_learned" | "layout_changed" | "login_required" | "secret_requested" | "ambiguous_transaction", message: string): BrowserWorkerResult {
  return { state: "stopped", reason, message };
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
      if (!selectors.historySelector || !selectors.rowSelectorTemplate.includes("{index}")) {
        return stop("workflow_not_learned", "CSC DigiPay workflow selectors have not been taught yet.");
      }

      const beforeHistory = (await page.textContent("body")) ?? "";
      if (/\b(otp|one[- ]time password|pin|password|passcode|aadhaar|captcha|payment authorization)\b/i.test(beforeHistory)) {
        return stop("secret_requested", "CSC DigiPay requested a secret or payment authorization; worker stopped.");
      }
      if (/\b(login|sign[ -]?in|mfa|verification code)\b/i.test(beforeHistory)) {
        return stop("login_required", "CSC DigiPay requires authentication or verification; worker stopped.");
      }

      if ((await page.locatorCount(selectors.historySelector)) !== 1) {
        return stop("layout_changed", "CSC DigiPay history control does not match the learned workflow.");
      }
      await page.click(selectors.historySelector);

      if (selectors.cashWithdrawalFilterSelector) {
        if ((await page.locatorCount(selectors.cashWithdrawalFilterSelector)) !== 1) {
          return stop("layout_changed", "CSC DigiPay AEPS/cash-withdrawal filter no longer matches the learned workflow.");
        }
        await page.click(selectors.cashWithdrawalFilterSelector);
      }

      const body = (await page.textContent("body")) ?? "";
      if (/\b(otp|one[- ]time password|pin|password|passcode|aadhaar|captcha|payment authorization)\b/i.test(body)) {
        return stop("secret_requested", "CSC DigiPay requested a secret or payment authorization; worker stopped.");
      }

      const rowProbe = selectors.rowSelectorTemplate.replace("{index}", "1");
      const firstRowExists = (await page.locatorCount(rowProbe)) > 0;
      if (!firstRowExists) return { state: "completed", transactions: [] };

      const transactions: ImportedTransaction[] = [];
      const fingerprints = new Set<string>();

      for (let index = 1; index <= 500; index += 1) {
        const rowSelector = selectors.rowSelectorTemplate.replace("{index}", String(index));
        if ((await page.locatorCount(rowSelector)) !== 1) break;
        const field = (suffix: string) => `${rowSelector} ${suffix}`;

        const status = (await readField(page, field(selectors.fields.status))) ?? "";
        if (!isCompletedTransaction(status)) continue;

        const transaction: ImportedTransaction = {
          sourceType: "aeps",
          providerName: "CSC DigiPay",
          externalTransactionId: (await readField(page, field(selectors.fields.externalTransactionId))) ?? "",
          externalReference: selectors.fields.externalReference
            ? await readField(page, field(selectors.fields.externalReference))
            : null,
          status,
          transactionType: (await readField(page, field(selectors.fields.transactionType))) ?? "",
          amount: parseMoney(await readField(page, field(selectors.fields.amount))) ?? Number.NaN,
          fee: selectors.fields.fee ? parseMoney(await readField(page, field(selectors.fields.fee))) : null,
          commission: selectors.fields.commission
            ? parseMoney(await readField(page, field(selectors.fields.commission)))
            : null,
          occurredAt: selectors.fields.occurredAt
            ? await readField(page, field(selectors.fields.occurredAt))
            : null,
          customerName: selectors.fields.customerName
            ? await readField(page, field(selectors.fields.customerName))
            : null,
          customerMobile: selectors.fields.customerMobile
            ? await readField(page, field(selectors.fields.customerMobile))
            : null,
          rawData: {},
        };

        const errors = validateImportedTransaction(transaction);
        if (errors.length) {
          return stop("ambiguous_transaction", `CSC DigiPay row ${index} failed validation: ${errors.join(", ")}.`);
        }

        const fingerprint = buildTransactionFingerprint(transaction);
        if (fingerprints.has(fingerprint)) continue;
        fingerprints.add(fingerprint);
        transactions.push(transaction);
      }

      return { state: "completed", transactions };
    },
  };
}
