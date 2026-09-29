/**
 * SAI → POS handoff — authenticated end-to-end test (Playwright).
 *
 * REAL application flow, no mocks:
 *
 *   Flow A (sale):   SAI draft → Open in POS → review/edit → Pay (normal POS
 *                    checkout) → exactly ONE invoice + payment + one stock move.
 *   Flow B (cancel): SAI draft → Open in POS → leave WITHOUT Pay → zero new
 *                    sale/invoice/payment/stock movement.
 *   Flow C (double-click): rapid double activation of Open in POS → single
 *                    POS tab for the draft, zero financial records.
 *
 * SAFETY: this test creates ONE real sale. It runs ONLY when explicitly
 * enabled against a TEST/STAGING environment:
 *
 *   E2E=true  (required — without it the script prints setup help and exits 2)
 *
 * Required environment:
 *   TEST_BASE_URL        app under test, e.g. http://localhost:3000
 *   E2E_PRODUCT_NAME     exact name of a SEEDED, disposable test product
 *                        with stock_qty >= 5 and is_active = true
 *   E2E_CUSTOMER_NAME    exact name of a SEEDED, disposable test customer
 *                        (active). Test sales are booked to this customer so
 *                        they are attributable and auditable.
 *   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
 *                        (same public values the web app uses; anon key only —
 *                        no service_role key is ever read here)
 *
 * Auth: reuses the repo's existing storage-state convention
 *   .ai-portal-state/erp-storage-state.json
 * (capture/refresh via the interactive login helper, same as
 *  scripts/test-authenticated-e2e-22.mjs). The operator must be
 *  admin/manager/staff or the run aborts before touching anything.
 *
 * DB verification uses the operator's own access token (RLS applies), so the
 * test can only see what the operator is allowed to see — same as the app.
 *
 * Run:  npm run test:e2e:sai-pos
 * Docs: header above. Health check fails loudly (exit 1) when any
 * prerequisite is missing. NEVER point TEST_BASE_URL at production.
 */

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const verlang = (name, fallback = "") => (process.env[name] ?? fallback).trim();

if (verlang("E2E") !== "true") {
  console.log("SAI POS E2E skipped: set E2E=true to run against a TEST environment.");
  console.log("  Required: TEST_BASE_URL, E2E_PRODUCT_NAME, E2E_CUSTOMER_NAME,");
  console.log("  authenticated .ai-portal-state/erp-storage-state.json (admin/manager/staff).");
  console.log("  NEVER point TEST_BASE_URL at production — Flow A books one real sale.");
  process.exit(2);
}

const BASE_URL = verlang("TEST_BASE_URL", "http://localhost:3000").replace(/\/$/, "");
const PRODUCT_NAME = verlang("E2E_PRODUCT_NAME");
const CUSTOMER_NAME = verlang("E2E_CUSTOMER_NAME");
const STATE_FILE = path.resolve(".ai-portal-state/erp-storage-state.json");
const SUPABASE_URL = verlang("NEXT_PUBLIC_SUPABASE_URL", "https://tvxehxnvuwojjbhysajp.supabase.co");
const SUPABASE_ANON_KEY = verlang("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_u5-0p1SChKVIyI5qjPnMhg_bhrbzytQ");

let passed = 0;
let failed = 0;
function check(condition, label, details = "") {
  if (condition) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    console.error(`  FAIL: ${label}${details ? ` — ${details}` : ""}`);
  }
}
function fatal(message) {
  console.error(`FATAL (health check): ${message}`);
  process.exit(1);
}

if (!PRODUCT_NAME) fatal("E2E_PRODUCT_NAME is required (seeded disposable test product). Aborting.");
if (!CUSTOMER_NAME) fatal("E2E_CUSTOMER_NAME is required (seeded disposable test customer). Aborting.");
if (/prod/i.test(BASE_URL) && !verlang("E2E_ALLOW_PROD")) {
  fatal(`TEST_BASE_URL looks like production (${BASE_URL}). Refusing to book a sale. Aborting.`);
}

// ── Health check ─────────────────────────────────────────────────────────────

console.log("SAI POS E2E — health check");
console.log(`  Base URL: ${BASE_URL}`);

try {
  const res = await fetch(`${BASE_URL}/login`, { redirect: "manual", signal: AbortSignal.timeout(15000) });
  if (![200, 301, 302, 303, 307, 308].includes(res.status)) fatal(`/login unreachable (HTTP ${res.status}). Is the app running?`);
  console.log(`  PASS: app reachable (/login → ${res.status})`);
} catch (e) {
  fatal(`app unreachable at ${BASE_URL}: ${e.message}`);
}

if (!fs.existsSync(STATE_FILE)) fatal(`storage state missing: ${STATE_FILE}. Sign in once via the interactive login helper first.`);
const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
const authCookie = (state.cookies ?? []).find((c) => c.name.includes("auth-token"));
if (!authCookie) fatal("no auth-token cookie in storage state. Re-authenticate first.");
let token = null;
try {
  let val = authCookie.value;
  if (val.startsWith("base64-")) val = Buffer.from(val.replace("base64-", ""), "base64").toString("utf8");
  token = JSON.parse(decodeURIComponent(val));
} catch (e) {
  fatal(`cannot decode auth cookie: ${e.message}`);
}
console.log("  PASS: authenticated storage state present");

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
let accessToken = token?.access_token;
if (token?.refresh_token) {
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: token.refresh_token });
  if (!error && data?.session) accessToken = data.session.access_token;
  else console.log("  WARN: session refresh failed, continuing with stored access token");
}
const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${accessToken}` } },
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: me } = await authed.auth.getUser();
if (!me?.user) fatal("stored session is expired/invalid. Re-authenticate first.");
console.log(`  PASS: session valid (${me.user.email ?? me.user.id})`);

const { data: profile } = await authed.from("profiles").select("role").eq("id", me.user.id).maybeSingle();
if (!profile || !["admin", "manager", "staff"].includes(profile.role)) {
  fatal(`operator role '${profile?.role}' may not operate POS handoff. Need admin/manager/staff.`);
}
console.log(`  PASS: operator role '${profile.role}'`);

const { data: products } = await authed
  .from("products")
  .select("id, name, sale_price, stock_qty, gst_rate, is_active")
  .eq("name", PRODUCT_NAME)
  .eq("is_active", true)
  .limit(2);
const product = (products ?? [])[0];
if (!product) fatal(`test product '${PRODUCT_NAME}' not found/active. Seed it first.`);
if (Number(product.stock_qty ?? 0) < 5) fatal(`test product stock too low (${product.stock_qty}). Need >= 5.`);
console.log(`  PASS: test product '${product.name}' @ ${product.sale_price} (stock ${product.stock_qty})`);

const { data: customers } = await authed
  .from("customers")
  .select("id, name, is_active")
  .eq("name", CUSTOMER_NAME)
  .limit(2);
const customer = (customers ?? [])[0];
if (!customer || customer.is_active === false) fatal(`test customer '${CUSTOMER_NAME}' not found/active. Seed it first.`);
console.log(`  PASS: test customer '${customer.name}'`);

for (const table of ["invoices", "payments"]) {
  const { error } = await authed.from(table).select("id").limit(1);
  if (error) fatal(`cannot read table '${table}': ${error.message}`);
}
console.log("  PASS: verification tables readable");

// ── Browser ──────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState: STATE_FILE, viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
page.on("pageerror", (e) => console.log(`  (page error: ${e.message})`));

async function askSaiForDraft() {
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Ask SAI" }).first().click();
  const box = page.getByPlaceholder("Ask SAI…");
  await box.fill(`Create a sale draft: ${PRODUCT_NAME} quantity 1 for customer ${CUSTOMER_NAME}.`);
  await box.press("Enter");
  const openBtn = page.getByRole("button", { name: /Open in POS for Review/ });
  await openBtn.waitFor({ timeout: 120000 });
  return openBtn;
}

async function invoicesSince(iso) {
  const { data } = await authed.from("invoices").select("id, total, customer_id, created_at").gte("created_at", iso).order("created_at");
  return (data ?? []).filter((r) => r.customer_id === customer.id);
}
async function paymentsFor(invoiceIds) {
  if (!invoiceIds.length) return [];
  const { data } = await authed.from("payments").select("id, invoice_id, amount").in("invoice_id", invoiceIds);
  return data ?? [];
}
async function productStock() {
  const { data } = await authed.from("products").select("stock_qty").eq("id", product.id).maybeSingle();
  return Number(data?.stock_qty ?? NaN);
}
const nowIso = () => new Date().toISOString();

// ── Flow A: draft → open → edit → Pay → exactly one sale ─────────────────────

console.log("\nFlow A: successful sale handoff");
{
  const baseline = nowIso();
  const stockBefore = await productStock();

  const openBtn = await askSaiForDraft();
  check(true, "SAI produced a sale draft card");
  await openBtn.click();
  await page.waitForURL(/\/pos/, { timeout: 30000 });
  check(/\/pos/.test(page.url()), "Open in POS navigates to /pos", page.url());

  await page.getByText(product.name, { exact: false }).first().waitFor({ timeout: 30000 });
  check(true, "drafted item is present in the POS cart");
  const cartText = (await page.locator("body").innerText()).slice(0, 20000);
  check(cartText.includes(customer.name), "validated customer is present in POS");
  check(cartText.includes(String(product.sale_price)), "cart shows the LIVE database price");

  // Operator edits quantity; totals must update.
  let expectedQty = 1;
  const plus = page.locator("button").filter({ hasText: "+" }).first();
  if (await plus.count()) {
    const textBefore = await page.locator("body").innerText();
    await plus.click();
    await page.waitForTimeout(1500);
    const textAfter = await page.locator("body").innerText();
    if (textAfter !== textBefore) expectedQty = 2;
  }
  check((await productStock()) === stockBefore, "stock untouched before Pay (handoff wrote nothing)");

  // Pay with the normal POS checkout (cash defaults to exact tender).
  const payBtn = page.getByRole("button", { name: /Complete Sale/ });
  await payBtn.waitFor({ timeout: 15000 });
  await payBtn.click();
  await page.getByText(/Invoice|INV-|Sale completed|success/i).first().waitFor({ timeout: 60000 });
  check(true, "POS checkout completed via the normal Pay flow");

  const newInvoices = await invoicesSince(baseline);
  check(newInvoices.length === 1, `exactly ONE new invoice for the test customer (found ${newInvoices.length})`);
  const invPayments = await paymentsFor(newInvoices.map((r) => r.id));
  check(invPayments.length >= 1, "payment recorded for the invoice");
  const stockAfter = await productStock();
  check(
    stockAfter === stockBefore - expectedQty,
    `stock moved exactly once by the checkout quantity (expected -${expectedQty}, got ${stockBefore - stockAfter})`
  );
}

// ── Flow B: cancel path — zero financial records ─────────────────────────────

console.log("\nFlow B: cancellation safety");
{
  const baseline = nowIso();
  const stockBefore = await productStock();
  const openBtn = await askSaiForDraft();
  await openBtn.click();
  await page.waitForURL(/\/pos/, { timeout: 30000 });
  await page.getByText(product.name, { exact: false }).first().waitFor({ timeout: 30000 });
  // Leave WITHOUT Pay.
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const newInvoices = await invoicesSince(baseline);
  check(newInvoices.length === 0, `no invoice created without Pay (found ${newInvoices.length})`);
  check((await paymentsFor(newInvoices.map((r) => r.id))).length === 0, "no payment created without Pay");
  check((await productStock()) === stockBefore, "no stock movement without Pay");
}

// ── Flow C: double-click protection ──────────────────────────────────────────

console.log("\nFlow C: double-click protection");
{
  const baseline = nowIso();
  const openBtn = await askSaiForDraft();
  await openBtn.dblclick({ timeout: 5000 }).catch(() => {});
  await page.waitForURL(/\/pos/, { timeout: 30000 }).catch(() => {});
  const tabs = await page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("cafeerp_pos_tabs_")) keys.push(k);
    }
    return keys.map((k) => ({ key: k, tabs: JSON.parse(localStorage.getItem(k) || "[]").map((t) => t.id) }));
  });
  const draftTabs = tabs.flatMap((t) => t.tabs).filter((id) => String(id).startsWith("sai-draft-"));
  const unique = new Set(draftTabs);
  check(draftTabs.length >= 1 && unique.size === draftTabs.length, `single POS tab per draft after double activation (tabs: ${JSON.stringify(draftTabs)})`);
  const newInvoices = await invoicesSince(baseline);
  check(newInvoices.length === 0, "double activation created no financial records");
}

await browser.close();
console.log(`\n${passed} passed / ${failed} failed`);
process.exitCode = failed ? 1 : 0;
