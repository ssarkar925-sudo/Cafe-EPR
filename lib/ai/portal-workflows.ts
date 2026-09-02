import type { TransactionSourceType } from "@/lib/ai/transaction-import";

export type PortalWorkflow = {
  providerName: string;
  sourceType: TransactionSourceType;
  displayName: string;
  purpose: string;
  readOnly: true;
  steps: string[];
  extractionFields: string[];
  stopConditions: string[];
};

/**
 * Provider-specific browser instructions are deliberately data, not executable
 * credentials or arbitrary scripts. The browser worker can use these as a
 * learned playbook and must stop when the page no longer matches.
 */
export const DEFAULT_PORTAL_WORKFLOWS: PortalWorkflow[] = [
  {
    providerName: "CSC DigiPay",
    sourceType: "aeps",
    displayName: "CSC DigiPay AEPS",
    purpose: "Read completed AEPS transactions and import their details.",
    readOnly: true,
    steps: [
      "Open the authenticated DigiPay session.",
      "Navigate to the AEPS transaction/history area.",
      "Select cash withdrawal or the requested AEPS transaction type.",
      "Locate the newest completed/successful transaction requested by the owner.",
      "Extract only transaction data; never initiate a new financial transaction.",
    ],
    extractionFields: [
      "externalTransactionId",
      "externalReference",
      "status",
      "transactionType",
      "amount",
      "fee",
      "commission",
      "occurredAt",
      "customerName",
      "customerMobile",
    ],
    stopConditions: [
      "Login or MFA is required",
      "A PIN, OTP, password, or payment authorization is requested",
      "The transaction status is not successful/completed",
      "The page layout no longer matches the learned workflow",
      "Required transaction identity is missing or ambiguous",
    ],
  },
];

export function findPortalWorkflow(providerName: string) {
  const normalized = providerName.trim().toLowerCase();
  return DEFAULT_PORTAL_WORKFLOWS.find((workflow) => workflow.providerName.toLowerCase() === normalized) ?? null;
}
