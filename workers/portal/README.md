# Portal Collection Worker (read-only)

Durable desktop service that reads **completed** provider transactions and feeds
the canonical AI ingestion pipeline. It never initiates money movement.

## One-time setup (owner, on the shop desktop)

1. Teach the portal once (guided, you click; the worker only records selectors):
   `npm run ai:portal:teach` with `AI_PORTAL_URL` + `AI_PORTAL_PROVIDER` set.
   Import the produced draft in AI Learning Control Center, or save the
   generated `portal-adapter.json` and point `AI_PORTAL_ADAPTER_FILE` at it.
2. Note the report URL (transaction history page, https only).

## Run collection

```sh
AI_PORTAL_PROVIDER="CSC DigiPay" \
AI_PORTAL_REPORT_URL="https://<provider-report-page>" \
AI_PORTAL_ADAPTER_FILE="./portal-adapter.json" \
node workers/portal/portal-worker.mjs collect
```

To also POST into the ERP inbox:

```sh
AI_PORTAL_API_URL="https://<erp-host>/api/ai/ingestion/events" \
AI_PORTAL_BEARER="<AI_INGESTION_WORKER_KEY>" \
node workers/portal/portal-worker.mjs collect
```

## Safety contract (enforced in code, not just docs)

- Read-only: opens the report page, reads tables, optionally follows controls
  literally labeled next/more/page-numbers (max `AI_PORTAL_MAX_PAGES`, default 5).
- Never fills inputs, never submits forms, never clicks anything labeled like a
  financial action (pay, submit, transfer, withdraw, confirm, approve,
  authorize, OTP/PIN) — collection stops with `initiation_control_detected`.
- Stops (no bypass, no retry into the control) on: login/MFA pages, OTP / PIN /
  password / CAPTCHA controls or prompts, changed layout (no rows match the
  taught template), ambiguous or missing transaction IDs, or a leading
  non-completed row.
- Only `completed|success|settled` rows are collected; others are counted and skipped.
- Secrets are never typed, stored, or uploaded. The browser session lives in
  `workers/portal/.browser-state/<provider>/` on this machine only (gitignored).
  Raw cookies/session state are never POSTed — only normalized transaction
  fields go to the ingestion API, which re-validates and dedupes everything.

## Scheduler

Run `collect` every 15 minutes via the OS scheduler (Task Scheduler / cron /
launchd), e.g. cron: `*/15 * * * * cd /path/to/CafeERP && node
workers/portal/portal-worker.mjs collect >> portal-worker.log 2>&1`.
The ERP-side inbox processor runs on the app cron (see `wrangler.jsonc`).

## SMS model (Phase 13 decision)

No `READ_SMS` permission is declared: this app ships to merchants through
normal channels where background SMS access is not justifiable. SMS-app
notifications flow through the Android `NotificationListenerService` collector
instead, and pasted SMS text flows through `parsePhoneSms()` server-side.
