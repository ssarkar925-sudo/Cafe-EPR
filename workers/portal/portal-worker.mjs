/**
 * Durable read-only portal collection worker (Phase 14).
 *
 * Runs on the shop desktop (Node 20+, Playwright installed at repo root).
 * Uses the machine-local authenticated browser session created by the owner
 * during teaching (`npm run ai:portal:teach`). NEVER types credentials, OTPs,
 * PINs, passwords, or CAPTCHA solutions, and NEVER submits financial forms.
 *
 * Flow: PortalWorker -> BrowserSession -> ProviderAdapter ->
 *   TransactionExtractor -> Normalizer -> Ingestion API (ai_ingestion_events)
 *
 * Usage:
 *   AI_PORTAL_PROVIDER="CSC DigiPay" AI_PORTAL_REPORT_URL="https://..." \
 *     node workers/portal/portal-worker.mjs collect
 *   Optional: AI_PORTAL_ADAPTER_FILE=./portal-adapter.json (taught selectors)
 *             AI_PORTAL_API_URL=https://<erp>/api/ai/ingestion/events
 *             AI_PORTAL_BEARER=<AI_INGESTION_WORKER_KEY>
 *             AI_PORTAL_MAX_PAGES=5 AI_PORTAL_HEADLESS=true
 */
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";
import { digipayAdapter } from "./adapters/digipay.mjs";
import { spicemoneyAdapter } from "./adapters/spicemoney.mjs";
import { paymonkAdapter } from "./adapters/paymonk.mjs";
import { genericAdapter } from "./adapters/generic.mjs";

const ADAPTERS = [digipayAdapter, spicemoneyAdapter, paymonkAdapter];

const provider = process.env.AI_PORTAL_PROVIDER || "CSC DigiPay";
const reportUrl = process.env.AI_PORTAL_REPORT_URL || "";
const stateDir = path.resolve(process.env.AI_PORTAL_STATE_DIR || "workers/portal/.browser-state", provider.replace(/[^a-zA-Z0-9._-]+/g, "-"));
const adapterFile = process.env.AI_PORTAL_ADAPTER_FILE ? path.resolve(process.env.AI_PORTAL_ADAPTER_FILE) : null;
const outboxDir = path.resolve(process.env.AI_PORTAL_OUTBOX_DIR || "workers/portal/outbox");
const apiUrl = (process.env.AI_PORTAL_API_URL || "").replace(/\/$/, "");
const bearer = process.env.AI_PORTAL_BEARER || "";
const maxPages = Math.min(Math.max(Number(process.env.AI_PORTAL_MAX_PAGES || 5), 1), 10);
const headless = String(process.env.AI_PORTAL_HEADLESS ?? "true").toLowerCase() !== "false";

// Mirrors lib/ai/secret-guard.ts (canonical). Keep in sync.
const SECRET_PATTERNS = [/\botp\b/i, /\bone[- ]time pass(?:word|code)\b/i, /\bpin\b/i, /\bpassword\b/i, /\bpasscode\b/i, /\bcvv\b/i, /\bpayment authorization\b/i];
const AUTH_PATTERNS = [/\blog[ -]?in\b/i, /\bsign[ -]?in\b/i, /\bmfa\b/i, /\bverification code\b/i];
const CAPTCHA_PATTERNS = [/\bcaptcha\b/i, /\brecaptcha\b/i, /\bsecurity check\b/i];
// Interactive controls whose labels indicate money movement or verification.
const INITIATION_PATTERNS = [/\bpay\b/i, /\bsubmit\b/i, /\btransfer\b/i, /\bwithdraw\b/i, /\bsend money\b/i, /\bconfirm payment\b/i, /\bapprove\b/i, /\bauthorize\b/i, /\bsend otp\b/i, /\bverify otp\b/i, /\benter (otp|pin|password)\b/i];
const PAGINATION_PATTERN = /^(next|more|›|»|\d+)$/;

function stop(state, reason, message, extra = {}) {
  return { state, reason, message, ...extra };
}

async function inspectPage(page) {
  const url = page.url();
  if (AUTH_PATTERNS.some((re) => re.test(url))) {
    return stop("stopped", "login_required", "Report URL landed on a login/MFA page. Authenticate manually, then rerun.");
  }
  const secretInputs = await page.locator('input[type="password"]:visible, input[name*="otp" i]:visible, input[id*="otp" i]:visible, input[name*="pin" i]:visible, input[id*="pin" i]:visible').count();
  if (secretInputs > 0) {
    return stop("stopped", "secret_requested", "Page exposes an OTP/PIN/password control. No secret was entered.");
  }
  const captcha = await page.locator('iframe[src*="captcha" i]:visible, [id*="captcha" i]:visible, [class*="captcha" i]:visible').count();
  if (captcha > 0) {
    return stop("stopped", "captcha_detected", "Page shows a CAPTCHA. Nothing was bypassed.");
  }
  const bodyText = (await page.locator("body").innerText().catch(() => "")) || "";
  if (SECRET_PATTERNS.some((re) => re.test(bodyText)) && /enter|submit|verify|type/i.test(bodyText)) {
    return stop("stopped", "secret_requested", "Page requests a secret value. No secret was entered.");
  }
  return null;
}

/** Scan only interactive controls for money-movement/verification labels. */
async function findInitiationControl(page) {
  const labels = await page.locator("button:visible, a:visible, input[type=submit]:visible").evaluateAll((els) =>
    els.map((el) => `${el.innerText || ""} ${(el).value || ""} ${el.getAttribute("aria-label") || ""}`.trim()).filter(Boolean).slice(0, 200),
  ).catch(() => []);
  return labels.find((label) => INITIATION_PATTERNS.some((re) => re.test(label))) || null;
}

function parseAmount(raw) {
  const m = String(raw || "").replace(/,/g, "").match(/-?\d+(?:\.\d{1,2})?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isCompletedStatus(status) {
  return /success|successful|completed|complete|settled/i.test(String(status || ""));
}

/** Read rows with the learned (or fallback) row template. Pure reads only. */
async function extractRows(page, adapter, fields) {
  const items = [];
  const skippedNonCompleted = { count: 0, firstRowStopped: false };
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    for (let index = 1; index <= adapter.maxRowsPerPage; index++) {
      const rowSelector = adapter.rowSelectorTemplate.replace("{index}", String(index));
      if ((await page.locator(rowSelector).count().catch(() => 0)) === 0) break;
      const cell = async (selector) => {
        if (!selector) return null;
        const text = await page.locator(`${rowSelector} ${selector}`.trim()).first().innerText().catch(() => null);
        return text ? text.trim().slice(0, 300) : null;
      };
      const rowText = (await page.locator(rowSelector).first().innerText().catch(() => "")) || "";
      const status = fields?.status ? await cell(fields.status) : rowText;
      if (status && !isCompletedStatus(status)) {
        skippedNonCompleted.count++;
        // A leading non-completed row means the report isn't settled: stop honestly.
        if (index === 1 && pageIndex === 0) skippedNonCompleted.firstRowStopped = true;
        continue;
      }
      const idCell = fields?.externalTransactionId ? await cell(fields.externalTransactionId) : null;
      const amountCell = fields?.amount ? await cell(fields.amount) : rowText;
      const item = {
        externalTransactionId: (idCell || "").trim() || null,
        externalReference: fields?.externalReference ? await cell(fields.externalReference) : null,
        status: (status || "completed").trim().slice(0, 40),
        transactionType: fields?.transactionType ? (await cell(fields.transactionType)) || adapter.name : adapter.name,
        amount: parseAmount(amountCell),
        fee: fields?.fee ? parseAmount(await cell(fields.fee)) : null,
        commission: fields?.commission ? parseAmount(await cell(fields.commission)) : null,
        occurredAt: fields?.occurredAt ? await cell(fields.occurredAt) : null,
        customerName: fields?.customerName ? await cell(fields.customerName) : null,
        customerMobile: fields?.customerMobile ? await cell(fields.customerMobile) : null,
      };
      if (item.amount !== null) items.push({ ...item, eventType: adapter.inferEventType(`${rowText} ${item.transactionType || ""}`) });
    }
    if (skippedNonCompleted.firstRowStopped) break;
    // Pagination only: click controls literally labeled next/more/›/page numbers.
    const nextHandle = page.locator("a:visible, button:visible").filter({ hasText: PAGINATION_PATTERN }).first();
    if ((await nextHandle.count().catch(() => 0)) === 0) break;
    const label = ((await nextHandle.innerText().catch(() => "")) || "").trim();
    if (INITIATION_PATTERNS.some((re) => re.test(label))) {
      return { items, skippedNonCompleted, stopped: stop("stopped", "initiation_control_detected", `Pagination control labeled "${label}" looks like a financial action. Stopped.`) };
    }
    await nextHandle.click().catch(() => {});
    await page.waitForTimeout(800);
    const blocked = await inspectPage(page);
    if (blocked) return { items, skippedNonCompleted, stopped: blocked };
  }
  return { items, skippedNonCompleted, stopped: null };
}

async function postItems(items) {
  if (!apiUrl || !bearer) return { posted: 0, skippedPost: true };
  let posted = 0;
  const failures = [];
  for (const item of items) {
    try {
      const res = await fetch(`${apiUrl}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-ingestion-worker-key": bearer },
        body: JSON.stringify({
          source_type: "portal",
          source_provider: item.provider,
          portal_items: [item],
        }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok || data.state === "duplicate") posted++;
      else failures.push(data?.error || `HTTP ${res.status}`);
    } catch (err) {
      failures.push(err instanceof Error ? err.message : "post failed");
    }
  }
  return { posted, failures: failures.slice(0, 5) };
}

async function collect() {
  if (!reportUrl) throw new Error("AI_PORTAL_REPORT_URL is required (https report page taught by the owner).");
  const parsed = new URL(reportUrl);
  if (parsed.protocol !== "https:") throw new Error("Report URL must be https.");
  const adapter = ADAPTERS.find((a) => a.match(parsed.hostname)) || genericAdapter;
  let fields = null;
  if (adapterFile) {
    try {
      const taught = JSON.parse(await fs.readFile(adapterFile, "utf8"));
      const map = taught.selector_map || taught;
      fields = {
        externalTransactionId: map.fields?.externalTransactionId || null,
        externalReference: map.fields?.externalReference || null,
        status: map.fields?.status || null,
        transactionType: map.fields?.transactionType || null,
        amount: map.fields?.amount || null,
        fee: map.fields?.fee || null,
        commission: map.fields?.commission || null,
        occurredAt: map.fields?.occurredAt || null,
        customerName: map.fields?.customerName || null,
        customerMobile: map.fields?.customerMobile || null,
      };
      if (taught.rowSelectorTemplate) adapter.rowSelectorTemplate = taught.rowSelectorTemplate;
    } catch (err) {
      throw new Error(`Cannot read adapter file: ${err instanceof Error ? err.message : err}`);
    }
  }

  await fs.mkdir(stateDir, { recursive: true });
  await fs.mkdir(outboxDir, { recursive: true });
  const context = await chromium.launchPersistentContext(stateDir, { headless, viewport: { width: 1440, height: 1000 }, acceptDownloads: false });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    const blocked = await inspectPage(page);
    if (blocked) {
      console.log(JSON.stringify({ ...blocked, provider: adapter.name }, null, 2));
      process.exitCode = 2;
      return;
    }
    const initiation = await findInitiationControl(page);
    if (initiation) {
      console.log(JSON.stringify(stop("stopped", "initiation_control_detected", `Control labeled "${initiation}" looks like a financial action. Nothing was clicked.`, { provider: adapter.name }), null, 2));
      process.exitCode = 2;
      return;
    }

    const { items, skippedNonCompleted, stopped } = await extractRows(page, adapter, fields);
    const stamped = items.map((item) => ({ ...item, provider: adapter.name }));
    const result = {
      state: stopped ? "stopped" : "completed",
      provider: adapter.name,
      reportUrl,
      collectedAt: new Date().toISOString(),
      items: stamped,
      skippedNonCompleted: skippedNonCompleted.count,
      ...(stopped ? { stopReason: stopped.reason, stopMessage: stopped.message } : {}),
    };
    const outFile = path.join(outboxDir, `${adapter.name.replace(/[^a-zA-Z0-9._-]+/g, "-")}-${Date.now()}.json`);
    await fs.writeFile(outFile, JSON.stringify(result, null, 2) + "\n", "utf8");
    console.log(`Collected ${stamped.length} completed transaction(s), skipped ${skippedNonCompleted.count} non-completed row(s). Outbox: ${outFile}`);
    if (stopped) {
      console.log(JSON.stringify({ reason: stopped.reason, message: stopped.message }));
      process.exitCode = 2;
      return;
    }
    const posted = await postItems(stamped);
    if (!posted.skippedPost) console.log(`Posted ${posted.posted}/${stamped.length} to ingestion API.${posted.failures?.length ? ` Failures: ${posted.failures.join("; ")}` : ""}`);
    else console.log("AI_PORTAL_API_URL/AI_PORTAL_BEARER not set; outbox file retained for manual review.");
  } finally {
    await context.close();
  }
}

const command = process.argv[2] || "help";
try {
  if (command === "collect") await collect();
  else {
    console.log("Portal worker (read-only collection)");
    console.log("  AI_PORTAL_PROVIDER=... AI_PORTAL_REPORT_URL=https://... node workers/portal/portal-worker.mjs collect");
    console.log("Env: AI_PORTAL_ADAPTER_FILE, AI_PORTAL_STATE_DIR, AI_PORTAL_OUTBOX_DIR, AI_PORTAL_API_URL, AI_PORTAL_BEARER, AI_PORTAL_MAX_PAGES, AI_PORTAL_HEADLESS");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
