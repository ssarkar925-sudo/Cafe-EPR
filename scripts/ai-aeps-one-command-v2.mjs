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
const portalDraftFile = path.resolve(process.env.AI_PORTAL_TEACHING_DRAFT ?? path.join(stateDir, "teaching-draft.json"));
const erpDraftFile = path.resolve(process.env.AI_ERP_TEACHING_DRAFT ?? path.join(stateDir, "aeps-erp-teaching-draft.json"));

function clean(value) { return typeof value === "string" ? value.trim() : ""; }
function normalizeId(value) { return clean(value).replace(/\s+/g, "").toUpperCase(); }
function money(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function sameMoney(a, b) { return a !== null && b !== null && Math.abs(a - b) < 0.005; }
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

async function ask(question) {
  const rl = readline.createInterface({ input, output });
  try { return (await rl.question(question)).trim(); } finally { rl.close(); }
}
async function askRequired(question, validator, invalidMessage) {
  while (true) {
    const value = await ask(question);
    if (validator(value)) return value;
    console.log(invalidMessage);
  }
}

async function assertSafePage(page, label) {
  if (/\b(login|sign[ -]?in|mfa|verification code)\b/i.test(page.url())) {
    throw new Error(`STOPPED: ${label} page indicates login/MFA. Sign in manually and restart.`);
  }
  const secrets = await page.locator('input[type="password"]:visible, input[name*="otp" i]:visible, input[id*="otp" i]:visible, input[name*="pin" i]:visible, input[id*="pin" i]:visible, input[name*="passcode" i]:visible, input[id*="passcode" i]:visible').count();
  if (secrets > 0) throw new Error(`STOPPED: ${label} page exposes an authentication-secret control. No secret was entered.`);
  const captcha = await page.locator('iframe[src*="captcha" i]:visible, iframe[title*="captcha" i]:visible, [id*="captcha" i]:visible, [class*="captcha" i]:visible').count();
  if (captcha > 0) throw new Error(`STOPPED: ${label} page exposes CAPTCHA. No CAPTCHA was bypassed.`);
}

async function readJson(file) { return JSON.parse(await fs.readFile(file, "utf8")); }

function requirePortalDraft(draft) {
  const map = draft?.selector_map;
  if (!map?.historySelector) throw new Error("Passbook teaching is missing historySelector.");
  if (!map.rowSelectorTemplate?.includes("{index}")) throw new Error("Passbook teaching is missing rowSelectorTemplate.");
  if (!map.fields) throw new Error("Passbook teaching is missing fields.");
  if (!map.receipt?.fields) throw new Error("Receipt teaching is missing receipt.fields.");
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

async function clickExact(page, selector, label) {
  const loc = page.locator(selector);
  if (await loc.count() !== 1) throw new Error(`STOPPED: ${label} selector did not match exactly one element.`);
  await loc.click();
}

async function setField(page, selector, value, label) {
  const loc = page.locator(selector);
  if (await loc.count() !== 1) throw new Error(`STOPPED: ${label} selector did not match exactly one control.`);
  const tag = await loc.evaluate((el) => el.tagName.toLowerCase());
  if (tag === "select") {
    const options = await loc.locator("option").evaluateAll((els) => els.map((e) => ({ value: e.value, text: clean(e.textContent) })));
    const wanted = String(value).toLowerCase();
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
  if ((await loc.getAttribute("contenteditable")) === "true") { await loc.fill(String(value)); return; }
  throw new Error(`STOPPED: ${label} is not a fillable control. Re-teach that field using the actual input.`);
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

async function discoverDigiPayTable(page) {
  const tables = page.locator("table:visible");
  for (let i = 0; i < await tables.count(); i += 1) {
    const table = tables.nth(i);
    const ths = table.locator("thead tr").first().locator("th");
    const headerTexts = await ths.allTextContents().catch(() => []);
    const headers = headerTexts.map((x) => clean(x).toLowerCase());
    if (!headers.length) continue;
    const find = (patterns) => headers.findIndex((h) => patterns.some((p) => p.test(h)));
    const rrn = find([/\brrn\b/, /transaction.*(?:id|reference)/]);
    const amount = find([/txn.*amount/, /^amount$/]);
    const type = find([/txn.*type/, /transaction.*type/, /service/]);
    const commission = find([/comm/, /commission/, /charges/]);
    const date = find([/date.*time/, /date/]);
    const status = find([/^status$/, /txn.*status/]);
    if (rrn >= 0 && amount >= 0 && type >= 0) return { table, headers, rrn, amount, type, commission, date, status };
  }
  throw new Error("STOPPED: could not locate the DigiPay Passbook table by its column headings.");
}

async function getRowCells(row) {
  return (await row.locator(":scope > td").allTextContents()).map(clean);
}

async function findAepsRow(page, tableInfo) {
  const rows = tableInfo.table.locator("tbody > tr:visible");
  for (let i = 0; i < await rows.count(); i += 1) {
    const row = rows.nth(i);
    const cells = await getRowCells(row);
    const type = cells[tableInfo.type] ?? "";
    if (!/cash withdrawal|withdrawal/i.test(type)) continue;
    const status = tableInfo.status >= 0 ? (cells[tableInfo.status] ?? "") : "";
    if (status && !/success|successful|completed|settled/i.test(status)) continue;
    const amount = money(cells[tableInfo.amount]);
    if (amount === null || amount <= 0) continue;
    const rrn = cells[tableInfo.rrn] ?? "";
    if (!rrn) continue;
    return {
      row,
      rrn,
      amount,
      type,
      status: status || null,
      commission: tableInfo.commission >= 0 ? money(cells[tableInfo.commission]) : 0,
      occurredAt: tableInfo.date >= 0 ? (cells[tableInfo.date] || null) : null,
      rrnIndex: tableInfo.rrn,
    };
  }
  throw new Error("STOPPED: no AEPS Cash Withdrawal row was found in the DigiPay Passbook.");
}

async function openReceipt(context, page, rowInfo) {
  const rrnCell = rowInfo.row.locator(":scope > td").nth(rowInfo.rrnIndex);
  if (await rrnCell.count() !== 1) throw new Error("STOPPED: DigiPay RRN cell could not be located in the selected row.");
  const beforePages = context.pages().length;
  const beforeUrl = page.url();
  await rrnCell.click();
  await page.waitForTimeout(900);
  let receipt = context.pages().at(-1) ?? page;
  if (context.pages().length === beforePages && receipt.url() === beforeUrl) {
    await ask("The RRN did not open automatically. Open the matching DigiPay receipt manually, then press Enter here: ");
    receipt = context.pages().at(-1) ?? page;
  }
  await receipt.waitForLoadState("domcontentloaded").catch(() => {});
  await receipt.waitForTimeout(400);
  await assertSafePage(receipt, "DigiPay receipt");
  if (!/receipt/i.test(receipt.url())) throw new Error(`STOPPED: expected DigiPay receipt page, got ${receipt.url()}`);
  return receipt;
}

async function readReceipt(receiptPage, learned) {
  const body = await receiptPage.locator("body").innerText();
  const bySelector = async (selector) => {
    try {
      if (selector && await receiptPage.locator(selector).count() === 1) return clean(await receiptPage.locator(selector).textContent());
    } catch {}
    return "";
  };
  const extract = (re) => clean(body.match(re)?.[1] ?? "");
  const rrn = (await bySelector(learned.externalTransactionId)) || extract(/\bRRN\s*:\s*([0-9]{8,})/i) || extract(/Bank Ref\. No\.?:\s*([0-9]{8,})/i);
  const status = (await bySelector(learned.status)) || extract(/Payment Status\s*:\s*([^\n]+)/i);
  const amount = money((await bySelector(learned.amount)) || extract(/\bAmount\s*:\s*[₹Rs.\s]*([0-9,]+(?:\.\d{1,2})?)/i));
  const bank = (await bySelector(learned.customerBank)) || extract(/Bank Name\s*:\s*([^\n]+)/i);
  const aadhaarRaw = (await bySelector(learned.aadhaarLast4)) || extract(/Customer ID\s*:\s*([^\n]+)/i);
  const date = (await bySelector(learned.occurredAt)) || extract(/Date\s*:\s*([^\n]+)/i);
  const aadhaarLast4 = aadhaarRaw.replace(/\D/g, "").slice(-4);
  return {
    externalTransactionId: rrn,
    status,
    amount,
    customerBank: bank,
    aadhaarLast4,
    occurredAt: date,
    customerName: learned.customerName ? await bySelector(learned.customerName) : null,
    customerMobile: learned.customerMobile ? await bySelector(learned.customerMobile) : null,
  };
}

async function collectPortal() {
  const draft = await readJson(portalDraftFile);
  const map = requirePortalDraft(draft);
  const context = await chromium.launchPersistentContext(portalStateDir, { headless: false, viewport: null, acceptDownloads: false });
  try {
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(portalStartUrl, { waitUntil: "domcontentloaded" }).catch((e) => { if (!/ERR_ABORTED/i.test(String(e))) throw e; });
    console.log("Opened CSC DigiPay.");
    console.log("Complete DigiPay authentication manually if required. Never enter OTP/PIN/password/CAPTCHA values into this worker.");
    await ask("When the taught Passbook/transaction page is visible, press Enter here: ");
    await assertSafePage(page, "DigiPay Passbook");

    const history = page.locator(map.historySelector);
    if (await history.count() !== 1) throw new Error("STOPPED: taught Passbook history selector no longer matches exactly one control.");
    await history.click();
    await page.waitForTimeout(500);
    if (map.cashWithdrawalFilterSelector) {
      const filter = page.locator(map.cashWithdrawalFilterSelector);
      if (await filter.count() === 1) { await filter.click(); await page.waitForTimeout(300); }
      else console.log("Warning: taught AEPS filter selector is stale; continuing with Passbook column detection.");
    }

    // Important repair: do not concatenate brittle learned row + cell paths.
    // Locate the Passbook table by headers and use the live row/cell structure.
    const tableInfo = await discoverDigiPayTable(page);
    const row = await findAepsRow(page, tableInfo);
    const receiptPage = await openReceipt(context, page, row);
    const receipt = await readReceipt(receiptPage, map.receipt.fields);

    if (normalizeId(row.rrn) !== normalizeId(receipt.externalTransactionId)) throw new Error("STOPPED: Passbook RRN and receipt RRN do not match.");
    if (!sameMoney(row.amount, receipt.amount)) throw new Error("STOPPED: Passbook amount and receipt amount do not match.");
    if (!/success|successful|completed|settled/i.test(receipt.status)) throw new Error(`STOPPED: DigiPay receipt is not successful/completed (${receipt.status || "unknown status"}).`);
    if (!receipt.customerBank) throw new Error("STOPPED: DigiPay receipt did not provide a customer bank.");
    if (receipt.aadhaarLast4.length !== 4) throw new Error("STOPPED: DigiPay receipt did not provide a valid Aadhaar/customer-ID last 4.");

    return { context, row, receiptData: receipt, commission: row.commission ?? 0 };
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
    await assertSafePage(page, "Cafe ERP AEPS");

    const r = portal.receiptData;
    let customerName = clean(r.customerName);
    let customerMobile = clean(r.customerMobile).replace(/\D/g, "");
    if (!customerMobile || customerMobile.length !== 10) customerMobile = await askRequired("Enter the Cafe ERP customer's 10-digit mobile number: ", (v) => /^\d{10}$/.test(v.replace(/\D/g, "")), "Please enter exactly 10 digits.");
    customerMobile = customerMobile.replace(/\D/g, "");
    if (!customerName) customerName = await askRequired("Enter the Cafe ERP customer's exact name: ", (v) => v.trim().length >= 2, "Please enter the customer's name.");

    console.log("\nCUSTOMER MATCHING CHECK");
    console.log(`Customer: ${customerName}`);
    console.log(`Mobile: ${customerMobile}`);
    console.log(`Aadhaar last 4: ${r.aadhaarLast4}`);
    console.log(`Bank: ${r.customerBank}`);
    console.log(`RRN: ${portal.row.rrn}`);

    await chooseSearchable(page, f.customer, "Customer (CRM Profile)", customerName);
    await setField(page, f.customerMobile, customerMobile, "Customer Mobile Number");
    await chooseSearchable(page, f.customerBank, "Customer's Bank", r.customerBank);
    await setField(page, f.aadhaarLast4, r.aadhaarLast4, "Aadhaar Last 4");
    await chooseSearchable(page, f.aepsServicePortal, "AEPS Service Portal", "Digipay");
    await setField(page, f.withdrawalAmount, portal.row.amount, "Withdrawal Amount");

    const feeRaw = await askRequired("Customer Service Fee for this AEPS withdrawal? ₹", (v) => /^\d+(?:\.\d{1,2})?$/.test(v), "Enter a valid non-negative amount, e.g. 30 or 30.50.");
    const serviceFee = money(feeRaw);
    const treatmentRaw = (await ask("Fee Treatment [1=Collect Fee Separately, 2=Deduct from Payout] (default 1): ")).toLowerCase();
    const feeTreatment = treatmentRaw === "2" || treatmentRaw.startsWith("d") ? "deduct" : "separate";
    await chooseSearchable(page, f.feeTreatmentModel, "Fee Treatment Model", feeTreatment === "deduct" ? "Deduct from Payout" : "Collect Fee Separately");

    if (feeTreatment === "separate") {
      const instrumentRaw = (await ask("Fee Collection Instrument [1=Cash Drawer, 2=UPI/QR, 3=Bank Account, 4=Customer Khata] (default 1): ")).trim();
      const instrument = instrumentRaw === "2" ? "UPI / QR Float" : instrumentRaw === "3" ? "Bank Account" : instrumentRaw === "4" ? "Customer Khata" : "Cash Drawer";
      await chooseSearchable(page, f.feeCollectionInstrument, "Fee Collection Instrument", instrument);
    } else {
      await chooseSearchable(page, f.feeCollectionInstrument, "Fee Collection Instrument", "Cash Drawer");
    }

    await setField(page, f.customerServiceFee, serviceFee, "Customer Service Fee");
    await setField(page, f.portalCommission, portal.commission ?? 0, "Portal Commission");
    await setField(page, f.bankRrn, portal.row.rrn, "Bank RRN / Terminal Reference Number");
    await page.waitForTimeout(500);
    await clickExact(page, draft.selector_map.reviewSelector, "transaction review/summary");

    const cashHanded = feeTreatment === "deduct" ? Math.max(0, portal.row.amount - serviceFee) : portal.row.amount;
    console.log("\n=== AEPS PRE-POST REVIEW ===");
    console.log(`Customer: ${customerName}`);
    console.log(`Mobile: ${customerMobile}`);
    console.log(`Bank: ${r.customerBank}`);
    console.log(`Aadhaar last 4: ${r.aadhaarLast4}`);
    console.log(`AEPS portal: Digipay`);
    console.log(`Withdrawal: ₹${portal.row.amount.toFixed(2)}`);
    console.log(`Customer Service Fee: ₹${serviceFee.toFixed(2)} (operator input)`);
    console.log(`Provider Commission: ₹${(portal.commission ?? 0).toFixed(2)} (DigiPay Passbook)`);
    console.log(`Fee Treatment: ${feeTreatment === "deduct" ? "Deduct from Payout" : "Collect Fee Separately"}`);
    console.log(`Cash handed to customer: ₹${cashHanded.toFixed(2)}`);
    console.log(`Operator income before other adjustments: ₹${(serviceFee + (portal.commission ?? 0)).toFixed(2)}`);
    console.log(`RRN: ${portal.row.rrn}`);
    console.log("FINAL POSTING: NOT PERFORMED. Review the Cafe ERP screen and click Complete/Confirm yourself.");
  } finally {
    await context.close().catch(() => {});
    await portal.context.close().catch(() => {});
  }
}

async function main() {
  console.log("\nCafe ERP — One-Command AEPS Assistant (resilient Passbook reader)");
  console.log("Read-only DigiPay extraction → receipt verification → operator fee input → Cafe ERP fill.");
  console.log("No DigiPay authorization and no Cafe ERP final posting are performed by this command.\n");
  const portal = await collectPortal();
  await fillErp(portal);
}

main().catch((error) => { console.error(`\n${error instanceof Error ? error.message : error}`); process.exitCode = 1; });
