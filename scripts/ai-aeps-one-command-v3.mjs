import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright";

const stateDir = path.resolve(process.env.AI_STATE_DIR ?? ".ai-portal-state");
const portalStateDir = path.resolve(process.env.AI_PORTAL_STATE_DIR ?? stateDir);
const erpStateDir = path.resolve(process.env.AI_ERP_STATE_DIR ?? path.join(stateDir, "erp-browser"));
const portalStartUrl = process.env.AI_PORTAL_URL ?? "https://digipayweb.cscloud.in/dashboard";
const erpStartUrl = process.env.AI_ERP_AEPS_URL ?? "https://cafeerp.vercel.app/business/aeps";
const portalProvider = process.env.AI_PORTAL_PROVIDER ?? "CSC DigiPay";
const portalDraftFile = path.resolve(process.env.AI_PORTAL_TEACHING_DRAFT ?? path.join(stateDir, "teaching-draft.json"));
const erpDraftFile = path.resolve(process.env.AI_ERP_TEACHING_DRAFT ?? path.join(stateDir, "aeps-erp-teaching-draft.json"));

function clean(value) { return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""; }
function norm(value) { return clean(value).replace(/\s+/g, "").toUpperCase(); }
function money(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function sameMoney(a, b) { return a !== null && b !== null && Math.abs(a - b) < 0.005; }
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

async function ask(question) {
  const rl = readline.createInterface({ input, output });
  try { return (await rl.question(question)).trim(); }
  finally { rl.close(); }
}

async function askRequired(question, validator, message) {
  while (true) {
    const value = await ask(question);
    if (validator(value)) return value;
    console.log(message);
  }
}

async function safePage(page, label) {
  if (/\b(login|sign[ -]?in|mfa|verification code)\b/i.test(page.url())) {
    throw new Error(`STOPPED: ${label} is at an authentication page. Sign in manually, then restart.`);
  }
  const secret = await page.locator('input[type="password"]:visible, input[name*="otp" i]:visible, input[id*="otp" i]:visible, input[name*="pin" i]:visible, input[id*="pin" i]:visible, input[name*="passcode" i]:visible, input[id*="passcode" i]:visible').count();
  if (secret) throw new Error(`STOPPED: ${label} exposes an authentication-secret control. This worker never enters secrets.`);
  const captcha = await page.locator('iframe[src*="captcha" i]:visible, iframe[title*="captcha" i]:visible, [id*="captcha" i]:visible, [class*="captcha" i]:visible').count();
  if (captcha) throw new Error(`STOPPED: ${label} exposes CAPTCHA. No CAPTCHA is bypassed.`);
}

async function readJson(file) { return JSON.parse(await fs.readFile(file, "utf8")); }

function requirePortalDraft(draft) {
  const map = draft?.selector_map;
  if (!map?.historySelector) throw new Error("Passbook teaching is missing historySelector.");
  if (!map?.receipt?.fields) throw new Error("Receipt teaching is missing receipt.fields.");
  return map;
}

function requireErpDraft(draft) {
  const f = draft?.selector_map?.fields ?? {};
  for (const key of ["customer", "customerMobile", "customerBank", "aadhaarLast4", "aepsServicePortal", "withdrawalAmount", "customerServiceFee", "portalCommission", "feeTreatmentModel", "feeCollectionInstrument", "bankRrn"]) {
    if (!f[key]) throw new Error(`ERP teaching is missing fields.${key}.`);
  }
  if (!draft.selector_map.reviewSelector) throw new Error("ERP teaching is missing reviewSelector.");
  return f;
}

async function clickSingle(page, selector, label) {
  const loc = page.locator(selector);
  if (await loc.count() !== 1) throw new Error(`STOPPED: ${label} selector did not match exactly one element.`);
  await loc.click();
}

async function setField(page, selector, value, label) {
  const loc = page.locator(selector);
  if (await loc.count() !== 1) throw new Error(`STOPPED: ${label} selector did not match exactly one control.`);
  const tag = await loc.evaluate((el) => el.tagName.toLowerCase());
  if (tag === "select") {
    const wanted = String(value).toLowerCase();
    const options = await loc.locator("option").evaluateAll((els) => els.map((e) => ({ value: e.value, text: clean(e.textContent) })));
    const option = options.find((o) => o.text.toLowerCase() === wanted) ?? options.find((o) => o.text.toLowerCase().includes(wanted));
    if (!option) throw new Error(`STOPPED: option '${value}' not found in ${label}.`);
    await loc.selectOption(option.value);
    return;
  }
  const type = await loc.getAttribute("type");
  if (["text", "tel", "number", "search", "email"].includes(type) || tag === "textarea") {
    await loc.fill(String(value));
    return;
  }
  if ((await loc.getAttribute("contenteditable")) === "true") {
    await loc.fill(String(value));
    return;
  }
  throw new Error(`STOPPED: ${label} is not a fillable form control.`);
}

async function chooseSearchable(page, selector, label, value) {
  const loc = page.locator(selector);
  if (await loc.count() !== 1) throw new Error(`STOPPED: ${label} selector did not match exactly one control.`);
  const tag = await loc.evaluate((el) => el.tagName.toLowerCase());
  if (tag === "select") { await setField(page, selector, value, label); return; }
  await loc.click();
  await page.waitForTimeout(250);
  const escaped = escapeRegExp(String(value));
  const candidates = [
    page.getByRole("option", { name: new RegExp(`^${escaped}$`, "i") }).last(),
    page.getByText(String(value), { exact: true }).last(),
    page.getByText(new RegExp(`^${escaped}$`, "i")).last(),
  ];
  for (const candidate of candidates) {
    try {
      if (await candidate.count() > 0 && await candidate.isVisible()) { await candidate.click(); return; }
    } catch {}
  }
  throw new Error(`STOPPED: could not select '${value}' in ${label}.`);
}

function headerIndex(headers, patterns) {
  return headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
}

async function discoverPassbookTable(page) {
  const tables = page.locator("table:visible");
  let best = null;
  for (let i = 0; i < await tables.count(); i += 1) {
    const table = tables.nth(i);
    let headerTexts = await table.locator("thead tr").first().locator("th").allTextContents().catch(() => []);
    if (!headerTexts.length) headerTexts = await table.locator("tr").first().locator("th,td").allTextContents().catch(() => []);
    const headers = headerTexts.map((x) => clean(x).toLowerCase());
    if (!headers.length) continue;

    const rrn = headerIndex(headers, [/\brrn\b/, /transaction\s*(id|ref|reference)/, /reference/]);
    const amount = headerIndex(headers, [/txn\s*amount/, /transaction\s*amount/, /^amount$/]);
    // DigiPay's service is normally under "Txn Mode". "Txn Type" is often only Credit/Debit.
    const service = headerIndex(headers, [/txn\s*mode/, /transaction\s*mode/, /service/]);
    const fallbackType = headerIndex(headers, [/txn\s*type/, /transaction\s*type/]);
    const commission = headerIndex(headers, [/comm\s*\/\s*charges/, /comm/, /commission/, /charges/]);
    const date = headerIndex(headers, [/date\s*[&/]\s*time/, /date.*time/, /^date$/]);
    const status = headerIndex(headers, [/^status$/, /txn\s*status/]);

    const score = (rrn >= 0 ? 4 : 0) + (amount >= 0 ? 4 : 0) + (service >= 0 || fallbackType >= 0 ? 3 : 0);
    if (score >= 8 && (!best || score > best.score)) {
      best = { table, headers, rrn, amount, service: service >= 0 ? service : fallbackType, commission, date, status, score };
    }
  }
  if (!best) throw new Error("STOPPED: could not locate the DigiPay Passbook table by its live column headings.");
  console.log(`Detected DigiPay table columns: ${best.headers.join(" | ")}`);
  return best;
}

async function rowCells(row) {
  return (await row.locator(":scope > td").allTextContents()).map(clean);
}

async function findAepsWithdrawal(tableInfo) {
  const rows = tableInfo.table.locator("tbody > tr:visible");
  const samples = [];
  for (let i = 0; i < await rows.count(); i += 1) {
    const row = rows.nth(i);
    const cells = await rowCells(row);
    if (i < 3) samples.push(cells.join(" | "));
    const service = cells[tableInfo.service] ?? "";
    const full = cells.join(" | ");
    const isAepsWithdrawal = /aeps.*cash\s*withdrawal|cash\s*withdrawal.*aeps/i.test(`${service} ${full}`) || (/cash\s*withdrawal/i.test(full) && /aeps/i.test(full));
    if (!isAepsWithdrawal) continue;
    const amount = money(cells[tableInfo.amount]);
    const rrn = cells[tableInfo.rrn] ?? "";
    if (amount === null || amount <= 0 || !/\d{8,}/.test(rrn)) continue;
    return {
      row,
      rrn,
      amount,
      service,
      status: tableInfo.status >= 0 ? (cells[tableInfo.status] ?? "") : "",
      commission: tableInfo.commission >= 0 ? (money(cells[tableInfo.commission]) ?? 0) : 0,
      occurredAt: tableInfo.date >= 0 ? (cells[tableInfo.date] ?? "") : "",
      rrnIndex: tableInfo.rrn,
    };
  }
  console.log("First Passbook rows inspected:");
  for (const sample of samples) console.log(`  ${sample}`);
  throw new Error("STOPPED: no AEPS Cash Withdrawal row was found in the DigiPay Passbook. Make sure the Passbook table is visible and contains AEPS Cash Withdrawal entries.");
}

async function openReceipt(context, page, rowInfo) {
  const cell = rowInfo.row.locator(":scope > td").nth(rowInfo.rrnIndex);
  if (await cell.count() !== 1) throw new Error("STOPPED: selected RRN cell is no longer present.");
  const link = cell.locator("a:visible");
  const beforePages = context.pages().length;
  const beforeUrl = page.url();
  if (await link.count() === 1) await link.click();
  else await cell.click();
  await page.waitForTimeout(900);
  let receipt = context.pages().at(-1) ?? page;
  if (context.pages().length === beforePages && receipt.url() === beforeUrl) {
    await ask("The DigiPay RRN did not open automatically. Open the matching receipt manually, then press Enter here: ");
    receipt = context.pages().at(-1) ?? page;
  }
  await receipt.waitForLoadState("domcontentloaded").catch(() => {});
  await receipt.waitForTimeout(400);
  await safePage(receipt, "DigiPay receipt");
  if (!/receipt/i.test(receipt.url())) throw new Error(`STOPPED: expected DigiPay receipt page, got ${receipt.url()}`);
  return receipt;
}

async function readReceipt(page, learned, expectedRrn) {
  const body = await page.locator("body").innerText();
  const selectorText = async (selector) => {
    if (!selector) return "";
    try {
      const loc = page.locator(selector);
      if (await loc.count() === 1) return clean(await loc.textContent());
    } catch {}
    return "";
  };
  const extract = (regex) => clean(body.match(regex)?.[1] ?? "");

  const selectorId = await selectorText(learned.externalTransactionId);
  const bodyRrn = extract(/\bRRN\s*:\s*([0-9]{8,})/i) || extract(/Bank Ref\. No\.?\s*:\s*([0-9]{8,})/i);
  const externalTransactionId = norm(selectorId) === norm(expectedRrn) ? selectorId : bodyRrn || selectorId;
  const status = (await selectorText(learned.status)) || extract(/Payment Status\s*:\s*([^\n]+)/i);
  const amount = money((await selectorText(learned.amount)) || extract(/\bAmount\s*:\s*[₹Rs.\s]*([0-9,]+(?:\.\d{1,2})?)/i));
  const bank = (await selectorText(learned.customerBank)) || extract(/Bank Name\s*:\s*([^\n]+)/i);
  const aadhaarRaw = (await selectorText(learned.aadhaarLast4)) || extract(/Customer ID\s*:\s*([^\n]+)/i);
  const occurredAt = (await selectorText(learned.occurredAt)) || extract(/Date\s*:\s*([^\n]+)/i);
  return {
    externalTransactionId,
    status,
    amount,
    customerBank: bank,
    aadhaarLast4: aadhaarRaw.replace(/\D/g, "").slice(-4),
    occurredAt,
    customerName: learned.customerName ? await selectorText(learned.customerName) : "",
    customerMobile: learned.customerMobile ? await selectorText(learned.customerMobile) : "",
  };
}

async function collectPortal() {
  const draft = await readJson(portalDraftFile);
  const map = requirePortalDraft(draft);
  const context = await chromium.launchPersistentContext(portalStateDir, { headless: false, viewport: null, acceptDownloads: false });
  try {
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(portalStartUrl, { waitUntil: "domcontentloaded" }).catch((e) => { if (!/ERR_ABORTED/i.test(String(e))) throw e; });
    console.log(`Opened ${portalProvider}.`);
    console.log("Complete DigiPay authentication manually if required. Never enter OTP/PIN/password/CAPTCHA values into this worker.");
    await ask("When the taught Passbook/transaction page is visible, press Enter here: ");
    await safePage(page, "DigiPay Passbook");

    const history = page.locator(map.historySelector);
    if (await history.count() === 1) {
      await history.click().catch(() => {});
      await page.waitForTimeout(500);
    } else {
      console.log("Warning: taught Transaction History selector is stale; continuing with the current visible Passbook page.");
    }

    const tableInfo = await discoverPassbookTable(page);
    const row = await findAepsWithdrawal(tableInfo);
    console.log(`Selected AEPS row: RRN ${row.rrn} | Amount ₹${row.amount.toFixed(2)} | Commission ₹${row.commission.toFixed(2)}`);

    const receiptPage = await openReceipt(context, page, row);
    const receipt = await readReceipt(receiptPage, map.receipt.fields, row.rrn);
    if (norm(row.rrn) !== norm(receipt.externalTransactionId)) throw new Error(`STOPPED: Passbook RRN ${row.rrn} and receipt RRN ${receipt.externalTransactionId || "missing"} do not match.`);
    if (!sameMoney(row.amount, receipt.amount)) throw new Error(`STOPPED: Passbook amount ₹${row.amount.toFixed(2)} and receipt amount ${receipt.amount ?? "missing"} do not match.`);
    if (!/success|successful|completed|settled/i.test(receipt.status)) throw new Error(`STOPPED: DigiPay receipt is not successful/completed (${receipt.status || "unknown"}).`);
    if (!receipt.customerBank) throw new Error("STOPPED: DigiPay receipt did not provide the customer bank.");
    if (receipt.aadhaarLast4.length !== 4) throw new Error("STOPPED: DigiPay receipt did not provide a valid Aadhaar/customer-ID last 4.");
    return { context, row, receiptData: receipt, commission: row.commission };
  } catch (error) {
    await context.close().catch(() => {});
    throw error;
  }
}

async function fillErp(portal) {
  const draft = await readJson(erpDraftFile);
  const f = requireErpDraft(draft);
  const context = await chromium.launchPersistentContext(erpStateDir, { headless: false, viewport: null, acceptDownloads: false });
  try {
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(erpStartUrl, { waitUntil: "domcontentloaded" });
    console.log("Opened Cafe ERP AEPS Cash Out.");
    await ask("When the clean AEPS Cash Out form is visible, press Enter here: ");
    await safePage(page, "Cafe ERP AEPS");

    const receipt = portal.receiptData;
    let customerMobile = clean(receipt.customerMobile).replace(/\D/g, "");
    let customerName = clean(receipt.customerName);
    if (!/^\d{10}$/.test(customerMobile)) customerMobile = "";
    if (!customerMobile) customerMobile = (await askRequired("Enter the Cafe ERP customer's 10-digit mobile number: ", (v) => /^\d{10}$/.test(v.replace(/\D/g, "")), "Enter exactly 10 digits.")).replace(/\D/g, "");
    if (!customerName) customerName = await askRequired("Enter the Cafe ERP customer's exact name: ", (v) => v.trim().length >= 2, "Enter the customer's name.");

    await chooseSearchable(page, f.customer, "Customer (CRM Profile)", customerName);
    await setField(page, f.customerMobile, customerMobile, "Customer Mobile Number");
    await chooseSearchable(page, f.customerBank, "Customer's Bank", receipt.customerBank);
    await setField(page, f.aadhaarLast4, receipt.aadhaarLast4, "Aadhaar Last 4");
    await chooseSearchable(page, f.aepsServicePortal, "AEPS Service Portal", "Digipay");
    await setField(page, f.withdrawalAmount, portal.row.amount, "Withdrawal Amount");

    const feeRaw = await askRequired("Customer Service Fee for this AEPS withdrawal? ₹", (v) => /^\d+(?:\.\d{1,2})?$/.test(v), "Enter a valid non-negative amount, e.g. 30 or 30.50.");
    const fee = money(feeRaw);
    const treatmentRaw = (await ask("Fee Treatment [1=Collect Fee Separately, 2=Deduct from Payout] (default 1): ")).toLowerCase();
    const treatment = treatmentRaw === "2" || treatmentRaw.startsWith("d") ? "deduct" : "separate";
    await chooseSearchable(page, f.feeTreatmentModel, "Fee Treatment Model", treatment === "deduct" ? "Deduct from Payout" : "Collect Fee Separately");
    if (treatment === "separate") {
      const instrumentRaw = (await ask("Fee Collection Instrument [1=Cash Drawer, 2=UPI/QR, 3=Bank Account, 4=Customer Khata] (default 1): ")).trim();
      const instrument = instrumentRaw === "2" ? "UPI / QR Float" : instrumentRaw === "3" ? "Bank Account" : instrumentRaw === "4" ? "Customer Khata" : "Cash Drawer";
      await chooseSearchable(page, f.feeCollectionInstrument, "Fee Collection Instrument", instrument);
    } else {
      await chooseSearchable(page, f.feeCollectionInstrument, "Fee Collection Instrument", "Cash Drawer");
    }

    await setField(page, f.customerServiceFee, fee, "Customer Service Fee");
    await setField(page, f.portalCommission, portal.commission, "Portal Commission");
    await setField(page, f.bankRrn, portal.row.rrn, "Bank RRN / Terminal Reference Number");
    await page.waitForTimeout(500);
    await clickSingle(page, draft.selector_map.reviewSelector, "transaction review/summary");

    const cashHanded = treatment === "deduct" ? Math.max(0, portal.row.amount - fee) : portal.row.amount;
    console.log("\n=== AEPS PRE-POST REVIEW ===");
    console.log(`Customer: ${customerName}`);
    console.log(`Mobile: ${customerMobile}`);
    console.log(`Bank: ${receipt.customerBank}`);
    console.log(`Aadhaar last 4: ${receipt.aadhaarLast4}`);
    console.log(`AEPS portal: Digipay`);
    console.log(`Withdrawal: ₹${portal.row.amount.toFixed(2)}`);
    console.log(`Customer Service Fee: ₹${fee.toFixed(2)} (operator input)`);
    console.log(`Provider Commission: ₹${portal.commission.toFixed(2)} (DigiPay Passbook)`);
    console.log(`Fee Treatment: ${treatment === "deduct" ? "Deduct from Payout" : "Collect Fee Separately"}`);
    console.log(`Cash handed to customer: ₹${cashHanded.toFixed(2)}`);
    console.log(`Operator income before any other adjustments: ₹${(fee + portal.commission).toFixed(2)}`);
    console.log(`RRN: ${portal.row.rrn}`);
    console.log("FINAL POSTING: NOT PERFORMED. Review the Cafe ERP screen and click Complete/Confirm yourself.");
  } finally {
    await context.close().catch(() => {});
    await portal.context.close().catch(() => {});
  }
}

async function main() {
  console.log("\nCafe ERP — One-Command AEPS Assistant (v3)");
  console.log("Read-only DigiPay extraction → receipt verification → operator fee input → Cafe ERP fill.");
  console.log("No DigiPay authorization and no Cafe ERP final posting are performed by this command.\n");
  const portal = await collectPortal();
  await fillErp(portal);
}

main().catch((error) => { console.error(`\n${error instanceof Error ? error.message : error}`); process.exitCode = 1; });
