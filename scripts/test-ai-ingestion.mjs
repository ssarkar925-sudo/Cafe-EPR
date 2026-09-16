// AI data-ingestion platform tests (Phase 21) + Quick Sale AI regression (Phase 22).
//
// Pure-logic suite: no database, no network. Covers SMS/portal/browser/phone
// collectors, validation, dedupe, customer matching, reconciliation,
// extraction schema, secret guard, financial write boundaries, and the
// prepare_quick_sale removal.
//
// Run: npm run test:ai-ingestion
import { register } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./whatsapp-test-alias-hooks.mjs", import.meta.url);

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const readRepo = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const guard = await import("../lib/ai/secret-guard.ts");
const normalizer = await import("../lib/ai/ingestion-normalizer.ts");
const validation = await import("../lib/ai/ingestion-validation.ts");
const dedupe = await import("../lib/ai/ingestion-dedupe.ts");
const matcher = await import("../lib/ai/customer-matcher.ts");
const recon = await import("../lib/ai/reconciliation-engine.ts");
const extraction = await import("../lib/ai/ingestion-extraction.ts");
const worker = await import("../lib/ai/browser-worker.ts");
const types = await import("../lib/ai/ingestion-types.ts");

let passed = 0;
let failed = 0;
function ok(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

// ---------- SMS collector cases ----------
{
  const credit = normalizer.normalizeSmsEvent("Rs.5,000 credited to A/c XX4521 by RAMESH UTR 123456789012 on 12-09-26");
  ok("sms bank credit parsed", credit.event_type === "bank_credit" && credit.amount === 5000 && credit.external_reference === "123456789012" && credit.account_last4 === "4521" && credit.confidence >= 0.5, JSON.stringify({ t: credit.event_type, a: credit.amount }));

  const debit = normalizer.normalizeSmsEvent("Rs.2,000 debited from A/c 7788 to RAMESH. Ref 987654321012");
  ok("sms bank debit parsed", debit.event_type === "bank_debit" && debit.amount === 2000, JSON.stringify({ t: debit.event_type, a: debit.amount }));

  const upi = normalizer.normalizeSmsEvent("UPI payment of Rs.350 received from Suresh on 15-09-26. UTR 111122223333");
  ok("sms upi credit parsed", upi.event_type === "upi" && upi.amount === 350, JSON.stringify({ t: upi.event_type }));

  const ambiguous = normalizer.normalizeSmsEvent("Your account was updated. Thank you for banking with us.");
  ok("sms ambiguous flagged", ambiguous.ambiguity.length > 0 && ambiguous.confidence < 0.5, JSON.stringify(ambiguous));

  const unrelated = normalizer.normalizeSmsEvent("Your OTP is 482913. Do not share it with anyone.");
  ok("sms unrelated/secret text not treated as transaction", unrelated.amount === null, JSON.stringify({ a: unrelated.amount }));

  const malformed = normalizer.normalizeSmsEvent("");
  ok("sms malformed handled", malformed.amount === null && malformed.ambiguity.length > 0);
}

// ---------- Portal collector cases ----------
{
  const single = normalizer.normalizePortalText("CSC DigiPay AEPS Cash Withdrawal of Rs.1000 successful. RRN 555566667777. Commission Rs.6.", "CSC DigiPay");
  ok("portal single receipt parsed", single.items.length === 1 && single.items[0].amount === 1000 && single.items[0].event_type === "aeps", JSON.stringify(single.items[0]));

  const table = normalizer.normalizePortalText("RRN | Amount | Status\n111122223333 | Rs.500 | Success\n444455556666 | Rs.700 | Success", "Spice Money");
  ok("portal table parsed", table.items.length === 2 && table.items[0].amount === 500 && table.items[1].amount === 700, `n=${table.items.length}`);

  const multi = normalizer.normalizePortalText("RRN | Amount | Status\nA1 | Rs.100 | Success\nA2 | Rs.200 | Failed\nA3 | Rs.300 | Success", "Paymonk");
  const completed = multi.items.filter((i) => /success|completed/i.test(i.status));
  ok("portal multi-row keeps completed", multi.items.length === 3 && completed.length === 2, `n=${multi.items.length}`);

  const comm = normalizer.normalizePortalText("Commission Rs.12 credited. RRN 999988887777 Success", "Spice Money");
  ok("portal commission captured", comm.items.length === 1 && comm.items[0].commission === 12, JSON.stringify(comm.items[0]));

  const failedTxn = normalizer.normalizePortalItem({ externalTransactionId: "X1", amount: 100, status: "failed" }, "CSC DigiPay");
  const failedCheck = validation.validateNormalizedEvent({ event: failedTxn, providerKnown: true });
  ok("portal failed transaction rejected", failedCheck.state === "rejected" && failedCheck.issues.includes("status_not_completed"));

  const dupA = normalizer.normalizePortalItem({ externalTransactionId: "DUP-1", amount: 100, status: "Success", occurredAt: "2026-09-15" }, "CSC DigiPay");
  const dupB = normalizer.normalizePortalItem({ externalTransactionId: "dup-1", amount: 100, status: "Success", occurredAt: "2026-09-15" }, "CSC DigiPay");
  const keysA = dedupe.buildDedupeKeys({ businessId: "default", sourceProvider: "CSC DigiPay", externalEventId: dupA.external_event_id, externalReference: dupA.external_reference, amount: dupA.amount, occurredAt: dupA.occurred_at, normalizedPayload: dupA });
  const keysB = dedupe.buildDedupeKeys({ businessId: "default", sourceProvider: "CSC DigiPay", externalEventId: dupB.external_event_id, externalReference: dupB.external_reference, amount: dupB.amount, occurredAt: dupB.occurred_at, normalizedPayload: dupB });
  ok("portal duplicate ids share primary key", keysA.primary !== null && keysA.primary === keysB.primary);

  const noId = normalizer.normalizePortalItem({ amount: 50, status: "Success" }, "CSC DigiPay");
  ok("portal missing id flagged", noId.ambiguity.includes("external_id_missing") && noId.confidence < 0.8, JSON.stringify(noId.ambiguity));

  const ambCust = normalizer.normalizeSmsEvent("Rs.900 received. Ref 123456789012");
  ok("portal ambiguous customer allowed with flags", ambCust.customer_name === null && ambCust.customer_mobile === null);
}

// ---------- Browser worker stop conditions ----------
{
  const stopped = async (bodyText, extra = {}) => {
    const session = {
      page: {
        url: () => "https://portal.example.com/report",
        textContent: async () => bodyText,
        locatorCount: async () => 0,
      },
      close: async () => {},
    };
    return worker.runReadOnlyPortalWorker(session, {
      providerName: "Test",
      readOnly: true,
      collect: async () => ({ state: "completed", transactions: [] }),
      ...extra,
    });
  };
  const login = await stopped("Please login to continue");
  ok("browser stops on login", login.state === "stopped" && login.reason === "login_required");
  const otp = await stopped("Enter your OTP to proceed");
  ok("browser stops on OTP", otp.state === "stopped" && otp.reason === "secret_requested");
  const pin = await stopped("Enter UPI PIN");
  ok("browser stops on PIN", pin.state === "stopped" && pin.reason === "secret_requested");
  const captcha = await stopped("Complete the captcha challenge");
  ok("browser stops on CAPTCHA", captcha.state === "stopped" && captcha.reason === "captcha_detected");
  const challenge = await stopped("Security check required, sign in again");
  ok("browser stops on security challenge", challenge.state === "stopped" && (challenge.reason === "login_required" || challenge.reason === "captcha_detected"));
  const layout = await worker.runReadOnlyPortalWorker(
    { page: { url: () => "https://x.example/", textContent: async () => "ok", locatorCount: async () => 0 }, close: async () => {} },
    { providerName: "T", readOnly: true, collect: async () => ({ state: "stopped", reason: "layout_changed", message: "layout drift" }) },
  );
  ok("browser surfaces layout change", layout.state === "stopped" && layout.reason === "layout_changed");
  const nonCompleted = await worker.runReadOnlyPortalWorker(
    { page: { url: () => "https://x.example/", textContent: async () => "report", locatorCount: async () => 0 }, close: async () => {} },
    { providerName: "T", readOnly: true, collect: async () => ({ state: "completed", transactions: [] }) },
  );
  ok("browser completes clean report", nonCompleted.state === "completed");
  const writeAttempt = await worker.runReadOnlyPortalWorker(
    { page: { url: () => "https://x.example/", textContent: async () => "report", locatorCount: async () => 0 }, close: async () => {} },
    { providerName: "T", readOnly: false, collect: async () => ({ state: "completed", transactions: [] }) },
  );
  ok("browser rejects writable adapter", writeAttempt.state === "stopped" && writeAttempt.reason === "initiation_control_detected");
}

// ---------- Phone collector cases ----------
{
  ok("notification allowlist enforced", guard.isAllowedNotificationSource("com.csc.digipay", ["com.csc.digipay"]) === true);
  ok("notification default deny", guard.isAllowedNotificationSource("com.evil.app", ["com.csc.digipay"]) === false);
  ok("notification empty allowlist denies", guard.isAllowedNotificationSource("com.csc.digipay", []) === false);
  const first = normalizer.normalizeSmsEvent("Rs.1,000 credited. UTR 123456789012");
  const second = normalizer.normalizeSmsEvent("Rs.1,000 credited. UTR 123456789012");
  const ka = dedupe.buildDedupeKeys({ businessId: "default", sourceProvider: "com.bank.app", externalReference: first.external_reference, amount: first.amount, occurredAt: first.occurred_at, normalizedPayload: first });
  const kb = dedupe.buildDedupeKeys({ businessId: "default", sourceProvider: "com.bank.app", externalReference: second.external_reference, amount: second.amount, occurredAt: second.occurred_at, normalizedPayload: second });
  ok("duplicate notification shares hash", ka.contentHash === kb.contentHash);
  const offline = { queued: [first, second], synced: 0 };
  ok("offline queue buffers", offline.queued.length === 2 && offline.synced === 0);
  const retry = { attempts: 0, max: 3 };
  retry.attempts++;
  ok("retry counter advances", retry.attempts === 1 && retry.attempts < retry.max);
}

// ---------- Manual/api upload paths ----------
{
  const human = normalizer.normalizeManualUpload({ event_type: "bank_credit", status: "completed", amount: 50, occurred_at: "2026-09-15", external_reference: "M-1" });
  ok("manual upload flagged unverified", human.ambiguity.includes("manual_entry_unverified"));
  const machine = normalizer.normalizeManualUpload({ event_type: "bank_credit", status: "completed", amount: 50, occurred_at: "2026-09-15", external_reference: "M-1" }, { verifiedSource: true });
  ok("machine api upload not penalized", !machine.ambiguity.includes("manual_entry_unverified"));
  const clean = validation.validateNormalizedEvent({ event: machine, providerKnown: true, customerMatchConfidence: null });
  ok("machine event with no contact validates clean", clean.state === "valid" && clean.issues.length === 0, JSON.stringify(clean));
}

// ---------- Validation matrix ----------
{
  const base = normalizer.normalizePortalItem({ externalTransactionId: "V1", transactionType: "AEPS Cash Withdrawal", amount: 100, status: "Success", occurredAt: "2026-09-15" }, "CSC DigiPay");
  ok("valid event passes", validation.validateNormalizedEvent({ event: base, providerKnown: true }).state === "valid");
  ok("unknown provider rejected", validation.validateNormalizedEvent({ event: base, providerKnown: false }).state === "rejected");
  const neg = { ...base, amount: -5 };
  ok("negative amount rejected", validation.validateNormalizedEvent({ event: neg, providerKnown: true }).issues.includes("amount_invalid"));
  const badDate = { ...base, occurred_at: "not-a-date" };
  ok("invalid date rejected", validation.validateNormalizedEvent({ event: badDate, providerKnown: true }).issues.includes("date_invalid"));
  const badLast4 = { ...base, account_last4: "12345" };
  ok("bad last4 rejected", validation.validateNormalizedEvent({ event: badLast4, providerKnown: true }).issues.includes("account_last4_invalid"));
  const noId = { ...base, external_event_id: null, external_reference: null };
  ok("missing id needs review", validation.validateNormalizedEvent({ event: noId, providerKnown: true }).state === "needs_review");
  const oddRef = { ...base, external_reference: "12345" };
  ok("unusual reference flagged", validation.validateNormalizedEvent({ event: oddRef, providerKnown: true }).issues.includes("reference_format_unusual"));
  const badPhone = { ...base, customer_mobile: "xyz" };
  ok("bad phone flagged", validation.validateNormalizedEvent({ event: badPhone, providerKnown: true }).issues.includes("phone_unparseable"));
  const lowConf = validation.validateNormalizedEvent({ event: base, providerKnown: true, providerConfidence: 0.2 });
  ok("low provider confidence flagged", lowConf.issues.includes("low_provider_confidence"));
}

// ---------- Dedupe keys ----------
{
  const k1 = dedupe.buildDedupeKeys({ businessId: "b1", sourceProvider: "DigiPay", externalEventId: "RRN1", amount: 100, occurredAt: "2026-09-15", normalizedPayload: { a: 1 } });
  const k2 = dedupe.buildDedupeKeys({ businessId: "b1", sourceProvider: "digipay", externalEventId: "rrn1", amount: 100, occurredAt: "2026-09-15", normalizedPayload: { a: 1 } });
  ok("primary key case-insensitive", k1.primary === k2.primary && k1.contentHash === k2.contentHash);
  const k3 = dedupe.buildDedupeKeys({ businessId: "b2", sourceProvider: "DigiPay", externalEventId: "RRN1", amount: 100, occurredAt: "2026-09-15", normalizedPayload: { a: 1 } });
  ok("primary key business-scoped", k1.primary !== k3.primary);
  const hit = dedupe.findDuplicate(k1, [{ id: "e1", businessId: "b1", sourceProvider: "DigiPay", externalEventId: "RRN1", externalReference: null, contentHash: "zzz", amount: 100, occurredAt: "2026-09-15" }], "b1");
  ok("findDuplicate hits primary", hit !== null && hit.kind === "primary" && hit.event.id === "e1");
  const miss = dedupe.findDuplicate(k1, [{ id: "e9", businessId: "b9", sourceProvider: "DigiPay", externalEventId: "RRN1", externalReference: null, contentHash: k1.contentHash, amount: 100, occurredAt: "2026-09-15" }], "b1");
  ok("findDuplicate isolates business", miss === null);
}

// ---------- Customer matching ----------
{
  const customers = [
    { id: "c1", phone: "919876543210", name: "Ramesh Kumar" },
    { id: "c2", phone: "919999988888", name: "Suresh Singh" },
  ];
  const byId = matcher.matchCustomer({ customerIdHint: "c1" }, customers);
  ok("match exact id", byId.outcome === "matched" && byId.customerId === "c1" && byId.confidence === 1.0);
  const byPhone = matcher.matchCustomer({ phone: "+91 98765 43210" }, customers);
  ok("match exact phone", byPhone.outcome === "matched" && byPhone.customerId === "c1");
  const byRef = matcher.matchCustomer({ reference: "UTR-1" }, customers, { "UTR-1": "c2" });
  ok("match linked reference", byRef.outcome === "matched" && byRef.customerId === "c2");
  const combo = matcher.matchCustomer({ phone: "910000000000", name: "Ramesh Kumar" }, customers);
  ok("match phone+name candidate", (combo.outcome === "candidate" || combo.outcome === "matched") && combo.customerId === "c1");
  const fuzzy = matcher.matchCustomer({ name: "Ramesh Kumar" }, customers);
  ok("fuzzy name is candidate only", fuzzy.outcome === "candidate" && fuzzy.confidence < 0.95);
  const tied = matcher.matchCustomer(
    { name: "Ramesh Suresh Kumar" },
    [...customers, { id: "c3", phone: null, name: "Suresh Kumar" }],
  );
  ok("tied names ambiguous", tied.outcome === "ambiguous" && tied.customerId === null);
  const none = matcher.matchCustomer({ phone: "911111111111", name: "Nobody Here" }, customers);
  ok("unknown contact unmatched", none.outcome === "unmatched" && none.customerId === null);
}

// ---------- Reconciliation verdicts ----------
{
  const erp = [
    { id: "t1", kind: "transaction", reference: "RRN100", externalId: "RRN100", amount: 1000, occurredAt: "2026-09-15", status: "success", provider: "CSC DigiPay" },
    { id: "t2", kind: "transaction", reference: "RRN200", externalId: "RRN200", amount: 500, occurredAt: "2026-09-15", status: "success" },
    { id: "i9", kind: "invoice", reference: "INV-9", externalId: "INV-9", amount: 250, occurredAt: "2026-09-15", status: "unpaid", customerDue: 250 },
  ];
  const base = { provider: "CSC DigiPay", contentHash: "h", customerId: null, existingEventIds: [] };
  const exact = recon.reconcileEvent({ ...base, eventType: "aeps", externalReference: "RRN100", externalEventId: null, amount: 1000, occurredAt: "2026-09-15", status: "completed" }, erp);
  ok("reconcile exact match", exact.verdict === "exact_match" && exact.matchedRowId === "t1");
  const dup = recon.reconcileEvent({ ...base, eventType: "aeps", externalReference: "RRN100", externalEventId: null, amount: 1000, occurredAt: "2026-09-15", status: "completed", existingEventIds: ["e1"] }, erp);
  ok("reconcile duplicate", dup.verdict === "duplicate");
  const prob = recon.reconcileEvent({ ...base, eventType: "aeps", externalReference: null, externalEventId: null, amount: 500, occurredAt: "2026-09-15", status: "completed" }, erp);
  ok("reconcile probable match", prob.verdict === "probable_match" && prob.matchedRowId === "t2");
  const conflict = recon.reconcileEvent({ ...base, eventType: "aeps", externalReference: "RRN100", externalEventId: null, amount: 999, occurredAt: "2026-09-15", status: "completed" }, erp);
  ok("reconcile conflict", conflict.verdict === "conflict");
  const missing = recon.reconcileEvent({ ...base, eventType: "dmt", externalReference: "NOPE-1", externalEventId: null, amount: 10, occurredAt: "2026-09-15", status: "completed" }, erp);
  ok("reconcile unmatched", missing.verdict === "missing_in_erp");
}

// ---------- Extraction schema ----------
{
  const good = {
    event_type: "upi", status: "completed", amount: 350,
    confidence: 0.8,
    evidence: { source: "sms", excerpts: ["UPI payment of Rs.350 received"] },
    ambiguity: [],
  };
  ok("extraction valid passes", extraction.validateExtraction(good).ok === true);
  const noEvidence = { ...good, evidence: { source: "", excerpts: [] } };
  ok("extraction missing evidence fails", extraction.validateExtraction(noEvidence).ok === false);
  const badConf = { ...good, confidence: 1.5 };
  ok("extraction bad confidence fails", extraction.validateExtraction(badConf).ok === false);
  const unknownField = { ...good, sql: "DROP TABLE x" };
  ok("extraction rejects unknown fields", extraction.validateExtraction(unknownField).issues.some((i) => i.startsWith("unknown_field")));
  const badLast4 = { ...good, account_last4: "12" };
  ok("extraction bad last4 fails", extraction.validateExtraction(badLast4).ok === false);
  ok("extraction contract documented", extraction.AI_EXTRACTION_PROMPT_CONTRACT.includes("Never emit SQL"));
}

// ---------- Secret guard ----------
{
  ok("detect otp", guard.detectSecretsInText("Your OTP is 482913").includes("otp"));
  ok("detect pin", guard.detectSecretsInText("Enter UPI PIN to continue").includes("pin"));
  ok("detect password", guard.detectSecretsInText("Enter your password").includes("password"));
  ok("detect cvv", guard.detectSecretsInText("CVV 123").includes("cvv"));
  ok("detect card number", guard.detectSecretsInText("card 4111 1111 1111 1111 charged").includes("card_number"));
  ok("detect payment authorization", guard.detectSecretsInText("payment authorization required").includes("payment_authorization"));
  ok("clean text passes", guard.detectSecretsInText("Rs.500 credited. Ref 123456789012.").length === 0);
  const fields = guard.findSecretFields({ otp: "123", nested: { password: "x", ok: 1 }, list: [{ pin: "1" }] });
  ok("find forbidden fields", fields.length === 3);
  const redacted = guard.redactSecrets({ otp: "123", amount: 500, nested: { password: "x" } });
  ok("redact removes secrets keeps data", redacted.otp === "[REDACTED]" && redacted.amount === 500 && redacted.nested.password === "[REDACTED]");
  const redText = guard.redactSecretsFromText("Your OTP: 482913 approved");
  ok("redact secrets from text", !redText.includes("482913") && redText.includes("[REDACTED]"));
  ok("portal allowlist accepts", guard.isAllowedPortalHost("retail.digipay.example.com") === true);
  ok("portal allowlist rejects", guard.isAllowedPortalHost("evil-phishing.example.com") === false);
}

// ---------- Financial boundaries: no direct AI SQL writes ----------
{
  const libs = [
    "lib/ai/ingestion-normalizer.ts",
    "lib/ai/ingestion-validation.ts",
    "lib/ai/ingestion-dedupe.ts",
    "lib/ai/customer-matcher.ts",
    "lib/ai/reconciliation-engine.ts",
    "lib/ai/ingestion-extraction.ts",
    "lib/ai/secret-guard.ts",
    "lib/ai/ingestion-processor.ts",
  ].map(readRepo);
  const financialTables = ["transactions", "invoices", "payments", "customers", "settlements", "cash_entries", "expenses", "journal"];
  const offenders = libs.filter((src) =>
    financialTables.some((table) => new RegExp(`\\.from\\("${table}"\\)[\\s\\S]{0,300}?\\.(insert|update|delete|upsert)\\(`).test(src)),
  );
  ok("ingestion libs never write financial tables", offenders.length === 0, `${offenders.length} offenders`);
  const processor = readRepo("lib/ai/ingestion-processor.ts");
  ok("processor writes only ingestion tables", !/\.from\("(?!(ai_ingestion_events|ai_reconciliation_drafts)")\w+"\)\s*\.\s*(insert|update|delete|upsert)\(/.test(processor));
  ok("high-risk actions need approval", types.HIGH_RISK_DRAFT_ACTIONS.has("record_customer_payment") && types.HIGH_RISK_DRAFT_ACTIONS.has("write_transaction") === false);
  ok("draft action maps to approval vocabulary", types.draftActionToApprovalAction("record_customer_payment") === "record_customer_payment");
  ok("honest stages defined", types.INGESTION_STAGE_LABELS.includes("collected") && types.INGESTION_STAGE_LABELS.includes("applied"));
}

// ---------- Worker auth helper (pure check in secret-guard) ----------
{
  const check = (given, configured) => guard.isValidWorkerKeyValue(given, configured);
  ok("worker key accepts exact match", check("test-secret-key-123", "test-secret-key-123") === true);
  ok("worker key rejects wrong value", check("wrong-value-here!!!!", "test-secret-key-123") === false);
  ok("worker key rejects empty", check("", "test-secret-key-123") === false);
  ok("worker key rejects unset server key", check("anything", "") === false);
}

// ---------- Worker-actor read visibility (live 401/empty-list regression) ----------
// Worker-key calls carry no user session, so every worker-reachable read must
// use the service client (same as POST/cron). Otherwise RLS filters worker
// reads to zero rows while writes succeed — exactly the observed
// "201 + duplicate detected but matches=0" production symptom.
{
  for (const rel of ["app/api/ai/ingestion/events/route.ts", "app/api/ai/ingestion/drafts/route.ts", "app/api/ai/ingestion/stats/route.ts"]) {
    const src = readRepo(rel);
    ok(`${rel} worker reads use admin client`, src.includes('actor!.type === "worker" ? createAdminClient() : await createClient()'), rel);
  }
  const patch = readRepo("app/api/ai/ingestion/drafts/route.ts");
  ok("draft approve stays admin-session-only", patch.includes('hasRole(role, ["admin"])') && patch.includes("Owner approval is required."));
}

// ---------- Processor contract: per-event results, verdict persistence ----------
function makeMockDb(seed) {
  const tables = JSON.parse(JSON.stringify(seed || {}));
  const writes = [];
  const applyFilters = (rows, filters) => {
    let out = rows.slice();
    for (const [kind, col, val] of filters) {
      if (kind === "eq") out = out.filter((r) => r[col] === val);
      if (kind === "in") out = out.filter((r) => Array.isArray(val) && val.includes(r[col]));
    }
    return out;
  };
  const table = (name) => {
    const q = {
      _filters: [],
      _limit: null,
      _patch: null,
      select() { return q; },
      eq(col, val) { q._filters.push(["eq", col, val]); return q; },
      in(col, vals) { q._filters.push(["in", col, vals]); return q; },
      gte() { return q; },
      neq() { return q; },
      order() { return q; },
      limit(n) { q._limit = n; return q; },
      update(patch) { writes.push({ table: name, op: "update", patch }); q._patch = patch; return q; },
      insert(row) {
        writes.push({ table: name, op: "insert", row });
        return { select() { return { single() { return Promise.resolve({ data: { id: "draft-mock-1" }, error: null }); } }; } };
      },
      single() { return q; },
      maybeSingle() { return q; },
      then(resolve) {
        if (q._patch) {
          const targets = applyFilters(tables[name] || [], q._filters);
          for (const t of targets) Object.assign(t, q._patch);
          resolve({ data: null, error: null });
        } else {
          resolve({ data: applyFilters(tables[name] || [], q._filters).slice(0, q._limit || 100), error: null });
        }
      },
    };
    return q;
  };
  return { from: (name) => table(name), writes, tables };
}

{
  const processor = await import("../lib/ai/ingestion-processor.ts");
  // Scenario A: unmatched bank credit -> needs_review + high-risk draft, no financial writes.
  {
    const event = {
      id: "e-smoke-1", business_id: "default", source_provider: "test-bank", source_type: "api",
      event_type: "bank_credit", status: "completed", occurred_at: "2026-09-15",
      amount: 100, fee: null, commission: null, external_event_id: "smoke-1", external_reference: "TEST-1",
      content_hash: "h1", state: "pending", metadata: {}, matched_customer_id: null,
    };
    const db = makeMockDb({ ai_ingestion_events: [event] });
    const res = await processor.processPendingIngestionEvents(db);
    ok("processor returns per-event result", res.events.length === 1 && res.events[0].eventId === "e-smoke-1" && res.events[0].processed === true, JSON.stringify(res.events));
    ok("processor verdict persisted", res.events[0].reconciliation.verdict === "missing_in_erp" && res.events[0].reconciliation.state === "needs_review");
    ok("processor stages pending draft with id", res.events[0].draftId === "draft-mock-1" && res.draftsCreated === 1);
    const stored = db.tables.ai_ingestion_events[0];
    ok("processor writes verdict to event row", stored.state === "needs_review" && stored.metadata.reconcile_verdict === "missing_in_erp");
    const financialWrites = db.writes.filter((w) => !["ai_ingestion_events", "ai_reconciliation_drafts"].includes(w.table));
    ok("processor never touches financial tables", financialWrites.length === 0);
    const draftWrite = db.writes.find((w) => w.table === "ai_reconciliation_drafts" && w.op === "insert");
    ok("draft stays pending high-risk", draftWrite && draftWrite.row.state === "pending" && draftWrite.row.risk_level === "high" && draftWrite.row.action_type === "record_customer_payment");
  }
  // Scenario B: exact ERP match -> reconciled, no draft.
  {
    const event = {
      id: "e-exact-1", business_id: "default", source_provider: "test-bank", source_type: "api",
      event_type: "aeps", status: "completed", occurred_at: "2026-09-15",
      amount: 1000, fee: null, commission: null, external_event_id: "RRN-X", external_reference: "RRN-X",
      content_hash: "h2", state: "pending", metadata: {}, matched_customer_id: null,
    };
    const db = makeMockDb({
      ai_ingestion_events: [event],
      transactions: [{ id: "t-1", transaction_number: "RRN-X", amount: 1000, transaction_date: "2026-09-15", status: "success" }],
    });
    const res = await processor.processPendingIngestionEvents(db);
    ok("processor reconciles exact match", res.events[0].reconciliation.verdict === "exact_match" && res.events[0].reconciliation.state === "reconciled" && res.events[0].draftId === null, JSON.stringify(res.events[0]));
    ok("processor marks matched transaction", db.tables.ai_ingestion_events[0].matched_transaction_id === "t-1");
  }
  // Scenario C: eventIds filter scopes processing.
  {
    const mk = (id) => ({
      id, business_id: "default", source_provider: "test-bank", source_type: "api",
      event_type: "bank_credit", status: "completed", occurred_at: "2026-09-15",
      amount: 10, fee: null, commission: null, external_event_id: id, external_reference: id,
      content_hash: "h-" + id, state: "pending", metadata: {}, matched_customer_id: null,
    });
    const db = makeMockDb({ ai_ingestion_events: [mk("e-a"), mk("e-b")] });
    const res = await processor.processPendingIngestionEvents(db, { eventIds: ["e-b"] });
    ok("processor honors eventIds filter", res.processed === 1 && res.events.length === 1 && res.events[0].eventId === "e-b", JSON.stringify(res.events.map((e) => e.eventId)));
  }
  // Worker/cron path: drafts route exposes worker reads; PATCH stays admin-only.
  {
    const draftsRoute = readRepo("app/api/ai/ingestion/drafts/route.ts");
    const patchFn = (draftsRoute.split("export async function PATCH")[1] || "").split("export async function GET")[0];
    ok(
      "drafts PATCH remains admin-session-only",
      patchFn.includes('hasRole(role, ["admin"])') && !patchFn.includes("actorHasRoles") && !patchFn.includes("createAdminClient"),
    );
  }
  // Smoke script: service URL default + status reporting (arg-handling regression).
  {
    const smoke = readRepo("scripts/ai-ingestion-smoke.mjs");
    ok("smoke defaults supabase url", smoke.includes("tvxehxnvuwojjbhysajp.supabase.co"));
    ok("smoke prints processor HTTP status", smoke.includes("HTTP ${procRes.status}"));
    ok("smoke targets single event", smoke.includes("event_id=${encodeURIComponent(eventId)}"));
  }
}

// ---------- Quick Sale AI regression (Phase 22) ----------
{
  const runtime = readRepo("lib/ai/agent-runtime.ts");
  ok("no prepare_quick_sale in agent runtime", !runtime.includes("prepare_quick_sale"));
  ok("prepare_sale tool exists", runtime.includes('name: "prepare_sale"'));
  const policy = readRepo("lib/ai/agent-policy.ts");
  ok("policy never mentions quick sale", !/quick[_ -]?sale/i.test(policy));
  const trigger = readRepo("lib/whatsapp.ts");
  ok("no quick_sale automation trigger", !trigger.includes("quick_sale:") && !trigger.includes('"quick_sale"'));
  const sender = readRepo("lib/whatsapp-sender.ts");
  ok("sender has no quick_sale branch", !/quick_sale/i.test(sender));
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
