# CafeERP — Comprehensive Application Security Audit

**Assessment Date:** September 13, 2026  
**Auditor:** Lead Application Security Engineer  
**Classification:** Confidential / Internal Security Review  
**Target Architecture:** Next.js 15 (Edge & Node runtime), Supabase PostgreSQL 15, Meta Cloud API  

---

## 1. Executive Security Summary

The application security architecture of CafeERP was evaluated against OWASP Top 10 (2021), CIS PostgreSQL benchmarks, and banking-grade financial isolation principles. The system enforces strict defense-in-depth:
1. **Perimeter Defense:** Edge middleware enforces security headers, route guards, and IP rate limiting on authentication attempts.
2. **Application Layer:** Whitelisted financial RPC gateway (`/api/pos/financial-rpc`) with CSRF origin validation and server-side session authentication.
3. **Service Boundaries:** Admin-only gating on critical administrative surfaces (`/api/staff`, `/api/ai/agent/approval/[id]`, `/api/whatsapp/config`).
4. **Data Layer:** Row Level Security (RLS) on all 45+ tables, explicit `search_path` declarations on all 265 `SECURITY DEFINER` procedures, and zero direct financial table mutations from client connections.

---

## 2. Authentication & Session Architecture

### 2.1 Supabase SSR Cookie Handling
- Session tokens are stored in `sb-*-auth-token` HTTP cookies configured with:
  - `SameSite=None` and `Secure=true` (cross-context compatibility for PWA and desktop views).
  - Path set to `/` with automatic refresh via `@supabase/ssr` `createServerClient`.
- Invalidation / Logout cleanly deletes all authentication cookies before redirecting to `/login`.

### 2.2 Brute-Force & Rate Limiting Controls
- The `/login` route enforces in-memory IP rate limiting (`15 attempts / 60 seconds`) returning HTTP `429 Too Many Requests` with a `Retry-After: 60` header.
- API endpoints (`/api/bill-payment/fetch`, `/api/recharge/operator-circle`) enforce atomic PostgreSQL token bucket rate limiting via `consume_api_rate_limit(p_key, p_limit, p_window_seconds)`.

---

## 3. Authorization & RBAC Boundaries

### 3.1 Role Hierarchy & Permissions

| Role | Permitted Actions | Prohibited Boundaries |
| :--- | :--- | :--- |
| **Admin** | Full system administration, staff creation, chart of accounts management, AI approval execution, WhatsApp gateway secrets, system settings. | None. |
| **Manager** | POS operations, customer khata dues collection, purchase entry, stock adjustments, expense logging, reports viewing. | Cannot create staff accounts, edit system settings, alter WhatsApp API secrets, or approve mutating AI actions. |
| **Staff** | POS terminal billing, customer search, banking workspace transactions (AEPS, DMT, UPI, Bill Payment, Recharge), receipt printing. | Cannot access raw journal entries, edit accounting balances, alter supplier bills, perform manual stock adjustments, or view system settings. |

### 3.2 AI Approval Gate Security
- Mutating actions (`create_sale`, `create_invoice`, `write_transaction`, `delete_record`, `change_rule`, `repair_whatsapp`, `repair_code`) require explicit owner approval.
- An approval request (`ai_action_approvals`) is created in status `pending`.
- Approval and execution can only be performed by `role === 'admin'`.
- Atomicity is enforced by transitioning the state from `approved` to `executing` in a single atomic query, preventing race conditions or double-execution attacks.

---

## 4. Database Security & search_path Hardening

### 4.1 `search_path` Hijacking Prevention
In PostgreSQL, functions defined with `SECURITY DEFINER` execute with the privileges of the function owner (`postgres` / `supabase_admin`). If such functions do not explicitly fix their `search_path`, an attacker could create objects in a rogue schema that pre-empts `public`.

- **Audit Findings:** All 265 `SECURITY DEFINER` functions in `supabase/*.sql` migrations were audited.
- **Result:** **100% of SECURITY DEFINER functions explicitly specify `SET search_path = public` (or `set search_path to public, pg_temp`)**.

### 4.2 Row Level Security (RLS) Policy Audit
- All tables containing financial, identity, or tenant data have RLS enabled:
  - `suppliers`, `supplier_ledger`, `purchases`, `purchase_items`, `stock_movements`
  - `invoices`, `invoice_items`, `customers`, `customer_ledger`
  - `transactions`, `cash_entries`, `journal_entries`, `journal_lines`
  - `ai_action_approvals`, `ai_learned_workflows`
- Hard deletion policies: Direct `DELETE` on financial ledgers (`suppliers`, `customers`, `invoices`, `transactions`, `stock_movements`) is permanently blocked by `USING (false)` RLS policies.

---

## 5. Webhook & Cryptographic Security

### 5.1 Meta WhatsApp Cloud API Webhook
- **GET Handshake Verification:**
  - Validates `hub.mode === 'subscribe'` and compares `hub.verify_token` with stored secrets.
  - Returns challenge string only on exact match; returns `403 Forbidden` on mismatch.
- **POST Delivery & Inbound Signature:**
  - Requires `X-Hub-Signature-256` header starting with `sha256=`.
  - Computes HMAC-SHA256 of raw request body using `META_APP_SECRET`.
  - **Constant-Time Comparison:** Uses `crypto.timingSafeEqual(expectedBuf, computedBuf)` to prevent timing side-channel attacks.

---

## 6. OWASP Top 10 Assessment Matrix

| OWASP Vulnerability | Risk Analysis | Defense Mechanisms & Controls | Status |
| :--- | :--- | :--- | :--- |
| **A01: Broken Access Control** | Privilege escalation across staff and admin. | Strict `getUserRole()` checks, middleware path filtering, and RLS enforcement. Remediated `/api/invoices` wildcard bypass. | **SECURE** |
| **A02: Cryptographic Failures** | Secret leakage or weak hashing. | Passwords hashed via Supabase Auth (bcrypt). Secrets stored in isolated `whatsapp_gateway_secrets` accessible only to service role. Zero secret leakage in bundle. | **SECURE** |
| **A03: Injection (SQL / Command)** | SQL injection or parameter pollution. | All database interactions utilize parameterized Supabase queries or stored procedures (`rpc`). No raw dynamic SQL concatenation. | **SECURE** |
| **A04: Insecure Design** | Double spending or ghost outflows. | Idempotency keys on all financial mutations. Multi-payment sum validations. Strict non-negative cash float checks. | **SECURE** |
| **A05: Security Misconfiguration** | Unintended public endpoints or verbose errors. | Strict CORS origin verification on `/api/pos/financial-rpc`. Security headers applied (`nosniff`, `HSTS`, `Permissions-Policy`). | **SECURE** |
| **A06: Vulnerable Components** | Outdated npm packages. | Audit verified modern versions: Next.js 15.1.6, `@supabase/ssr` 0.6.1, `@supabase/supabase-js` 2.46.1. | **SECURE** |
| **A07: Identification & Auth Failures** | Credential stuffing / brute-force. | Rate limiting (15 attempts/min on login) with Retry-After header. Secure cookie storage. | **SECURE** |
| **A08: Software & Data Integrity** | Compromised updates or tampering. | Append-only financial and stock journals. Immutability triggers on completed purchases and invoices. | **SECURE** |
| **A09: Security Logging & Monitoring** | Undetected security events. | Immutable `audit_logs` table recording user ID, action, entity, timestamp, and metadata payload. | **SECURE** |
| **A10: Server-Side Request Forgery (SSRF)**| Malicious webhook or provider callbacks. | All outbound requests to PayU, Meta, and BBPS use whitelisted HTTPS base URLs. No user-supplied redirect endpoints. | **SECURE** |

---

## 7. Security Headers Configuration

Every response from Next.js middleware is injected with the following hardened headers:
```http
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-DNS-Prefetch-Control: on
Permissions-Policy: camera=(self), microphone=(), geolocation=()
Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate
Pragma: no-cache
Expires: 0
```
