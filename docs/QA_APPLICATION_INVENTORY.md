# CafeERP — Application Architecture & QA Inventory

**Application:** CafeERP / Cafe EPR  
**Repository:** [https://github.com/ssarkar925-sudo/Cafe-EPR](https://github.com/ssarkar925-sudo/Cafe-EPR)  
**Version:** 0.1.0 (Production Candidate)  
**Runtime:** Next.js 15.1.6 (App Router), Node v24.14.0, TypeScript 5, Supabase PostgreSQL, Tailwind CSS  
**Target Platforms:** Web (PWA), Desktop (Electron), Mobile (Capacitor Android)  

---

## 1. Page & Route Surface Inventory (69 Pages)

| Route Path | File System Path | Auth Guard | Roles Allowed | Primary Features & Workspaces |
| :--- | :--- | :--- | :--- | :--- |
| `/login` | `app/login/page.tsx` | Public | All (Anonymous) | Email/Password login, OTP reset, rate limiting (15 req/min) |
| `/logout` | `app/logout/page.tsx` | Public | All | Session invalidation and cookie clearing |
| `/auth/confirm-reset` | `app/auth/confirm-reset/page.tsx` | Public | All | Supabase password reset token confirmation |
| `/auth/reset-password` | `app/auth/reset-password/page.tsx` | Public | All | New password submission with complexity validation |
| `/dashboard` | `app/(dashboard)/dashboard/page.tsx` | Auth Cookie | Admin, Manager, Staff | Business KPI widgets, live drawer stats, quick launch |
| `/pos` | `app/(dashboard)/pos/page.tsx` | Auth Cookie | Admin, Manager, Staff | Touch POS terminal, barcode scanning, cart math, multi-pay |
| `/inventory` | `app/(dashboard)/inventory/page.tsx` | Auth Cookie | Admin, Manager | Stock master, low stock alerts, manual adjustments, WAC |
| `/inventory/movements` | `app/(dashboard)/inventory/movements/page.tsx` | Auth Cookie | Admin, Manager | Append-only physical inventory movement ledger |
| `/invoices` | `app/(dashboard)/invoices/page.tsx` | Auth Cookie | Admin, Manager, Staff | Unified invoice list, quick sales, status filter, PDF download |
| `/customers` | `app/(dashboard)/customers/page.tsx` | Auth Cookie | Admin, Manager, Staff | Khata directory, outstanding receivables, credit limits |
| `/customers/[id]` | `app/(dashboard)/customers/[id]/page.tsx` | Auth Cookie | Admin, Manager, Staff | Detailed customer ledger, transaction history, dues payment |
| `/suppliers` | `app/(dashboard)/suppliers/page.tsx` | Auth Cookie | Admin, Manager | Supplier directory, payable balances, purchase histories |
| `/suppliers/[id]` | `app/(dashboard)/suppliers/[id]/page.tsx` | Auth Cookie | Admin, Manager | Supplier ledger, purchase statements, bill settlements |
| `/purchases` | `app/(dashboard)/purchases/page.tsx` | Auth Cookie | Admin, Manager | Purchase orders, GRN verification, supplier bills |
| `/purchases/entry` | `app/(dashboard)/purchases/entry/page.tsx` | Auth Cookie | Admin, Manager | GRN bill entry, tax breakdown, WAC inventory recalculation |
| `/business` | `app/(dashboard)/business/page.tsx` | Auth Cookie | Admin, Manager, Staff | Neo-banking services command hub |
| `/business/aeps` | `app/(dashboard)/business/[service]/page.tsx` | Auth Cookie | Admin, Manager, Staff | AEPS cash withdrawal, top 10 bank chips, Aadhaar validation |
| `/business/dmt` | `app/(dashboard)/business/[service]/page.tsx` | Auth Cookie | Admin, Manager, Staff | DMT money transfer, native 'Use Self' autofill, NEFT/IMPS |
| `/business/upi` | `app/(dashboard)/business/[service]/page.tsx` | Auth Cookie | Admin, Manager, Staff | Dynamic QR cash out, live amount encoding, denomination chips |
| `/business/recharge` | `app/(dashboard)/business/[service]/page.tsx` | Auth Cookie | Admin, Manager, Staff | Mobile/DTH recharge, auto circle detection, plan browser |
| `/business/bill-payment` | `app/(dashboard)/business/bill-payment/page.tsx` | Auth Cookie | Admin, Manager, Staff | BBPS utility bill payments, electricity, water, gas, FASTag |
| `/business/bill-payment/utility` | `app/(dashboard)/business/bill-payment/utility/page.tsx` | Auth Cookie | Admin, Manager, Staff | Multi-biller lookup, live bill fetch, multi-payment split |
| `/business/bill-payment/google-play`| `app/(dashboard)/business/bill-payment/google-play/page.tsx`| Auth Cookie | Admin, Manager, Staff | Google Play recharge codes with instant delivery |
| `/business/bill-payment/mobile-recharge`| `app/(dashboard)/business/bill-payment/mobile-recharge/page.tsx`| Auth Cookie | Admin, Manager, Staff | Direct mobile bill pay and topup portal |
| `/business/bill-payment/mobile-recharge/plans`| `app/(dashboard)/business/bill-payment/mobile-recharge/plans/page.tsx`| Auth Cookie | Admin, Manager, Staff | Live operator tariff and plan catalog browser |
| `/business/banks` | `app/(dashboard)/business/banks/page.tsx` | Auth Cookie | Admin, Manager | Commercial bank accounts, IFSC, branch balances |
| `/business/portals` | `app/(dashboard)/business/portals/page.tsx` | Auth Cookie | Admin, Manager | B2B service portals (Paypoint, SpiceMoney, CSC DigiPay) |
| `/business/merchant-qrs` | `app/(dashboard)/business/merchant-qrs/page.tsx` | Auth Cookie | Admin, Manager | Merchant UPI QR registration, VPA binding, settlement rules |
| `/business/whatsapp` | `app/(dashboard)/business/whatsapp/page.tsx` | Auth Cookie | Admin, Manager, Staff | WhatsApp customer messaging hub, receipt transmission |
| `/business/whatsapp/config` | `app/(dashboard)/business/whatsapp/config/page.tsx` | Auth Cookie | Admin | Meta Cloud API credentials, webhook tokens, phone pairing |
| `/finance` | `app/(dashboard)/finance/page.tsx` | Auth Cookie | Admin, Manager | Financial overview, liquid asset breakdown, P&L preview |
| `/finance/cashbook` | `app/(dashboard)/finance/cashbook/page.tsx` | Auth Cookie | Admin, Manager | Two-column cash/bank register, running balances, filters |
| `/finance/journal` | `app/(dashboard)/finance/journal/page.tsx` | Auth Cookie | Admin | General journal entries, double-entry audit, manual JEs |
| `/finance/ledger` | `app/(dashboard)/finance/ledger/page.tsx` | Auth Cookie | Admin | General ledger accounts view, debit/credit postings |
| `/finance/trial-balance` | `app/(dashboard)/finance/trial-balance/page.tsx` | Auth Cookie | Admin | Unadjusted/adjusted trial balances, net balance invariant |
| `/finance/pnl` | `app/(dashboard)/finance/pnl/page.tsx` | Auth Cookie | Admin | Profit & Loss statement, revenue, COGS, operating profit |
| `/finance/expenses` | `app/(dashboard)/finance/expenses/page.tsx` | Auth Cookie | Admin, Manager | Operating expenses register, category vouchers, cash flow |
| `/finance/day-close` | `app/(dashboard)/finance/day-close/page.tsx` | Auth Cookie | Admin, Manager | Shift handover, physical cash count, variance account 5210 |
| `/finance/reconciliation`| `app/(dashboard)/finance/reconciliation/page.tsx`| Auth Cookie | Admin | 3-way reconciliation (Pools vs GL Accounts vs Cashbook) |
| `/finance/accounts` | `app/(dashboard)/finance/accounts/page.tsx` | Auth Cookie | Admin | Chart of accounts (1000-6000), master account status |
| `/finance/settlements` | `app/(dashboard)/finance/settlements/page.tsx` | Auth Cookie | Admin, Manager | Bank/Wallet/Portal settlement ledger, liquidity transfers |
| `/finance/transactions` | `app/(dashboard)/finance/transactions/page.tsx` | Auth Cookie | Admin, Manager | Universal transaction search and cross-service audit trail |
| `/finance/opening-balances`| `app/(dashboard)/finance/opening-balances/page.tsx`| Auth Cookie | Admin | Fiscal year opening balances, asset/liability initialization |
| `/finance/general-ledger`| `app/(dashboard)/finance/general-ledger/page.tsx`| Auth Cookie | Admin | Detailed GL drilldown with reference entity linking |
| `/catalog` | `app/(dashboard)/catalog/page.tsx` | Auth Cookie | Admin, Manager | Master catalog management hub |
| `/catalog/products` | `app/(dashboard)/catalog/products/page.tsx` | Auth Cookie | Admin, Manager | Product inventory catalog, barcodes, HSN, tax rates |
| `/catalog/services` | `app/(dashboard)/catalog/services/page.tsx` | Auth Cookie | Admin, Manager | Service catalog, charges, commission brackets, SAC |
| `/catalog/categories` | `app/(dashboard)/catalog/categories/page.tsx` | Auth Cookie | Admin, Manager | Product/service taxonomy categories |
| `/catalog/brands` | `app/(dashboard)/catalog/brands/page.tsx` | Auth Cookie | Admin, Manager | Product brand registry |
| `/catalog/units` | `app/(dashboard)/catalog/units/page.tsx` | Auth Cookie | Admin, Manager | Measurement units (PCS, KG, MTR, BOX, PAC, etc.) |
| `/reports` | `app/(dashboard)/reports/page.tsx` | Auth Cookie | Admin, Manager | Analytics and business reporting command hub |
| `/reports/income` | `app/(dashboard)/reports/income/page.tsx` | Auth Cookie | Admin, Manager | Comprehensive revenue breakdown (POS sales + service margins) |
| `/reports/gst` | `app/(dashboard)/reports/gst/page.tsx` | Auth Cookie | Admin | GSTR-1 & GSTR-3B tax report, B2B/B2C breakdowns |
| `/reports/cash-bank` | `app/(dashboard)/reports/cash-bank/page.tsx` | Auth Cookie | Admin, Manager | Liquid asset flow report, till movements, bank deposits |
| `/audit` | `app/(dashboard)/audit/page.tsx` | Auth Cookie | Admin | System audit trail, entity change history, user action logs |
| `/staff` | `app/(dashboard)/staff/page.tsx` | Auth Cookie | Admin | Staff user management, role assignment, active/disabled |
| `/security` | `app/(dashboard)/security/page.tsx` | Auth Cookie | Admin | Security center, session monitoring, RLS validation |
| `/settings` | `app/(dashboard)/settings/page.tsx` | Auth Cookie | Admin | Global shop settings, print config, invoice prefix, GSTIN |
| `/ai` | `app/(dashboard)/ai/page.tsx` | Auth Cookie | Admin, Manager, Staff | Business AI assistant, natural language query interface |
| `/ai/self-audit` | `app/(dashboard)/ai/self-audit/page.tsx` | Auth Cookie | Admin | Automated AI system diagnostics, discrepancy detection |
| `/ai-agent` | `app/(dashboard)/ai-agent/page.tsx` | Auth Cookie | Admin | Autonomous AI agent command center, pending approvals |
| `/ai-agent/learning` | `app/(dashboard)/ai-agent/learning/page.tsx` | Auth Cookie | Admin | AI portal teaching, structural selector learning studio |
| `/receipt/[id]` | `app/receipt/[id]/page.tsx` | Auth + UUID | Admin, Manager, Staff | 80mm / 58mm POS thermal receipt view |
| `/receipt/quick/[id]` | `app/receipt/quick/[id]/page.tsx` | Auth + UUID | Admin, Manager, Staff | Quick sale thermal receipt view |
| `/business/receipt/[id]`| `app/(dashboard)/business/[service]/page.tsx`| Auth + UUID | Admin, Manager, Staff | Banking / B2B service thermal receipt view |
| `/business/receipt/[id]/a4`| `app/(dashboard)/business/[service]/page.tsx`| Auth + UUID | Admin, Manager, Staff | Formal A4 GST compliant banking service receipt |

---

## 2. API Surface Inventory (38 Endpoints)

| Method | Endpoint Route | Auth & Guard | Rate Limit | Purpose & Contract |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/pos/financial-rpc` | User Session + CSRF Origin | 60/min | Whitelisted financial RPC gateway (`create_sale`, `record_bill_payment`, etc.) |
| `POST` | `/api/pos/quick-sale` | Admin/Manager + Idempotency | 30/min | Atomically records express walk-in counter sales |
| `POST` | `/api/pos/customer-due-payment` | Admin/Manager + Idempotency | 30/min | Records customer khata repayments and generates cashbook entry |
| `GET` | `/api/invoices/[id]/pdf` | User Session + UUID Validation | 60/min | Generates dynamic A4 PDF invoice stream via `@react-pdf/renderer` |
| `GET` | `/api/bill-payment/fetch` | Admin/Manager/Staff | 30/min | Fetches live customer utility bill details from BBPS provider adapter |
| `POST` | `/api/bill-payment/fetch` | Admin/Manager/Staff | 30/min | Biller query with dynamic parameters payload |
| `GET` | `/api/recharge/operator-circle`| Admin/Manager/Staff | 30/min | Live PayU BBPS mobile operator & telecom circle auto-detection |
| `GET` | `/api/whatsapp/webhook` | Meta Hub Verify Token | Uncapped | Meta Cloud API webhook verification handshake |
| `POST` | `/api/whatsapp/webhook` | HMAC SHA-256 Signature | Uncapped | Inbound message processing & delivery status updates (SENT, READ) |
| `POST` | `/api/whatsapp/send` | Admin/Manager/Staff | 30/min | Sends templated or custom WhatsApp notification |
| `POST` | `/api/whatsapp/send-invoice` | Admin/Manager/Staff | 30/min | Dispatches formatted invoice & thermal receipt link via WhatsApp |
| `GET` | `/api/whatsapp/invoice/[id]` | Admin/Manager/Staff | 60/min | Resolves invoice recipient and delivery readiness |
| `GET` | `/api/whatsapp/outbox` | Admin/Manager/Staff | 60/min | Retrieves outbound queue and delivery logs |
| `GET` | `/api/whatsapp/config` | Admin | 30/min | Fetches non-sensitive WhatsApp configuration state |
| `POST` | `/api/whatsapp/config` | Admin | 15/min | Updates WhatsApp provider configuration |
| `POST` | `/api/whatsapp/config/test` | Admin | 10/min | Sends diagnostic test message to verify WhatsApp credentials |
| `POST` | `/api/whatsapp/config/register` | Admin | 5/min | Onboards Meta phone number certificate |
| `POST` | `/api/whatsapp/config/embedded-signup` | Admin | 5/min | Meta Embedded Signup OAuth exchange |
| `POST` | `/api/whatsapp/config/resolve` | Admin | 15/min | Resolves pending WhatsApp configuration conflicts |
| `POST` | `/api/staff` | Admin Role Only | 15/min | Creates and updates employee user accounts and credentials |
| `POST` | `/api/ai/agent` | Admin/Manager/Staff | 20/min | Natural language business agent query & execution engine |
| `POST` | `/api/ai/agent/approval` | Admin/Staff | 20/min | Creates approval requests for mutating operations |
| `POST` | `/api/ai/agent/approval/[id]` | Admin Role Only | 15/min | Reviews, claims, and executes approved mutating agent actions |
| `POST` | `/api/ai/advisor` | Admin/Manager | 20/min | AI business advisor for profit optimization and cash planning |
| `POST` | `/api/ai/audit-run` | Admin Role Only | 10/min | Executes automated database and financial audit diagnostics |
| `POST` | `/api/ai/audit-explain` | Admin Role Only | 20/min | Provides root cause explanation for detected audit anomalies |
| `POST` | `/api/ai/audit-resolve` | Admin Role Only | 10/min | Prepares guided resolution plans for detected discrepancies |
| `POST` | `/api/ai/code-repair` | Admin Role Only | 5/min | Generates source patch plans for verified edge bugs |
| `POST` | `/api/ai/code-repair/verify` | Admin Role Only | 5/min | Verifies code repair against static analysis and test suite |
| `POST` | `/api/ai/command-center` | Admin/Manager | 30/min | Unified AI dashboard actions and prompt dispatcher |
| `POST` | `/api/ai/extract` | Admin/Manager/Staff | 30/min | Optical document extraction (OCR) for receipts and bills |
| `GET` | `/api/ai/learning` | Admin Role Only | 30/min | Retrieves taught scraper workflows and structural selector maps |
| `POST` | `/api/ai/learning` | Admin Role Only | 15/min | Saves new selector teachings as draft workflows |
| `POST` | `/api/ai/learning/[id]` | Admin Role Only | 15/min | Activates, rolls back, or revokes learned workflow versions |
| `POST` | `/api/ai/memory` | Admin/Manager | 30/min | Contextual memory storage for business preferences and rules |
| `GET` | `/api/ai/monitor` | Admin/Manager | 30/min | Live status of background monitors and system integrity gates |
| `POST` | `/api/ai/monitor/cron` | Internal / Secret Cron | 60/min | Automated periodic reconciliation and health heartbeat check |
| `POST` | `/api/ai/quick-sale` | Admin/Manager | 30/min | AI voice/text assisted quick sale drafter |
| `POST` | `/api/ai/self-heal` | Admin Role Only | 5/min | Self-healing gateway for local WhatsApp and connection pools |
| `POST` | `/api/ai/transaction-import` | Admin/Manager | 10/min | Parses and stages bank statements and provider spreadsheets |
| `POST` | `/api/ai/translate` | Admin/Manager/Staff | 60/min | Multilingual translation engine (Bengali, Hindi, English) |
| `POST` | `/api/ai/whatsapp` | Admin/Manager | 30/min | Generates AI draft replies for customer inquiries |

---

## 3. Database Schema, Tables, Views & RPCs

### 3.1 Tables (45+ Core Tables)
- **Identity & Governance:** `profiles`, `audit_logs`, `ai_action_approvals`, `ai_learned_workflows`, `ai_workflow_history`
- **Retail & Point of Sale:** `products`, `product_categories`, `product_brands`, `units`, `invoices`, `invoice_items`, `quick_sales`, `quick_sale_items`, `sales_returns`, `sales_return_items`
- **Customers & CRM:** `customers`, `customer_ledger`, `customer_advances`
- **Procurement & Stock:** `suppliers`, `supplier_ledger`, `purchases`, `purchase_items`, `purchase_returns`, `stock_movements`
- **Neo-Banking & Services:** `transactions`, `services`, `banks`, `portals`, `recharge_providers`, `merchant_qrs`, `bill_payment_categories`, `bill_payment_transactions`
- **Financial & Accounting:** `accounting_accounts`, `journal_entries`, `journal_lines`, `cash_entries`, `payment_instruments`, `payment_routing_defaults`, `settlements`, `expenses`, `expense_categories`, `daily_closings`
- **WhatsApp Gateway:** `whatsapp_gateway_secrets`, `whatsapp_templates`, `whatsapp_messages`, `whatsapp_logs`

### 3.2 Canonical Stored Procedures (RPCs)
1. `create_sale`: Master POS transaction creator (invoicing, multi-payment, perpetual stock decrement, double-entry journal)
2. `record_quick_sale`: Express walk-in counter sale with immediate cashbook attribution and stock deduction
3. `create_business_txn`: Banking transaction creator (AEPS, DMT, UPI, Recharge) with zero-ghost-outflow guarantee
4. `create_recharge`: Specialized mobile/DTH recharge RPC with balance tracking and portal cost debit
5. `record_bill_payment`: BBPS utility bill payment RPC supporting multi-payment allocations and provider funding legs
6. `record_invoice_payment`: Records subsequent payment on unpaid or partially-paid customer invoices
7. `record_customer_due_payment`: Direct settlement of customer khata receivables into selected payment instrument
8. `process_return`: Processes retail customer returns, restores inventory stock, and issues cash/credit refund
9. `process_purchase_return`: Handles supplier goods returns, decrements inventory, and credits supplier payable
10. `reconcile_day_close_variance`: Reconciles physical till count against calculated drawer, posting variance to Account 5210
11. `consume_api_rate_limit`: Atomic Redis-style token bucket rate limiter in Postgres

---

## 4. Environment Variables Specification

| Variable Name | Scope | Sensitivity | Purpose |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Client & Server | Non-sensitive | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client & Server | Public Key | Supabase anonymous public client key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server Only | High Secret | Supabase admin service key for background operations |
| `META_APP_SECRET` | Server Only | High Secret | HMAC-SHA256 signature verification for Meta WhatsApp webhooks |
| `META_WHATSAPP_VERIFY_TOKEN`| Server Only | Secret | Hub verification token for Meta webhook subscription |
| `META_ACCESS_TOKEN` | Server Only | High Secret | Permanent System User token for Cloud API message transmission |
| `META_PHONE_NUMBER_ID` | Server Only | Sensitive | Meta WABA registered sender phone ID |
| `PAYU_CLIENT_ID` | Server Only | Secret | PayU BBPS integration client identifier |
| `PAYU_CLIENT_SECRET` | Server Only | High Secret | PayU BBPS OAuth client credentials |
| `PAYU_AGENT_ID` | Server Only | Sensitive | BBPS certified sub-agent terminal identifier |
| `CRON_SECRET` | Server Only | High Secret | Bearer token authenticating internal cron background routes |
| `ELECTRON_START_URL` | Electron Dev | Non-sensitive | Local development server URL for desktop wrapper |
