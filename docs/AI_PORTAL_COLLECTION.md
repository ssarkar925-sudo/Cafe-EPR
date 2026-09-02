# AI Portal Collection

The portal worker is a local, read-only Playwright process. It reuses a persistent browser profile so the owner can authenticate manually, then reads completed transaction history using an explicitly learned selector map.

## 1. Learn the authenticated page

Set the portal URL and run:

```bash
AI_PORTAL_URL="https://portal.example" npm run ai:portal:learn
```

Complete login yourself in the opened browser. Do not give the worker a password, PIN, OTP, passcode, CAPTCHA answer, or payment authorization secret. Navigate to the completed AEPS transaction-history screen and press Enter in the terminal. The worker stores the authenticated browser state and a transaction-history snapshot under `.ai-portal-state/`.

## 2. Save the learned selector map

Create `.ai-portal-state/selectors.json` with selectors learned from the live page. The map is provider-specific and must not be guessed. For CSC DigiPay:

```json
{
  "historySelector": "<css selector for transaction/history control>",
  "cashWithdrawalFilterSelector": "<optional css selector>",
  "rowSelectorTemplate": "<css selector for row {index}>",
  "fields": {
    "externalTransactionId": "<relative css selector>",
    "externalReference": "<optional relative css selector>",
    "status": "<relative css selector>",
    "transactionType": "<relative css selector>",
    "amount": "<relative css selector>",
    "fee": "<optional relative css selector>",
    "commission": "<optional relative css selector>",
    "occurredAt": "<optional relative css selector>",
    "customerName": "<optional relative css selector>",
    "customerMobile": "<optional relative css selector>"
  }
}
```

The row template must contain `{index}` and the worker reads rows 1 through 500. Extraction stops at the first missing row. Only successful/completed/settled rows are accepted.

## 3. Collect

Run:

```bash
AI_PORTAL_URL="https://portal.example" npm run ai:portal:collect
```

Optionally set `AI_PORTAL_EXPORT_FILE=/absolute/path/import.json` to persist the collected payload. The JSON export contains `providerName`, `collectedAt`, `readOnly`, `transactionCount`, and `transactions`.

The worker deduplicates within the collection using provider + external transaction ID, validates amount and completed status, and stops on layout changes, authentication prompts, CAPTCHA controls, secret/payment authorization prompts, or invalid transaction identity.

## Safety boundary

The worker is strictly read-only. It never initiates AEPS, UPI, DMT, withdrawal, transfer, payment authorization, or any other financial action. The browser session is closed in a `finally` block. Authenticated browser state is local and must never be committed.
