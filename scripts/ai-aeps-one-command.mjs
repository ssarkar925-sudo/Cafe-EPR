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

function clean(value) { return typeof value === "string" ? value.trim() : ""; }
function normId(value) { return clean(value).replace(/\s+/g, "").toUpperCase(); }
function money(value) {
  if (typeof value !== "string") value = String(value ?? "");
  const n = Number(value.replace(/,/g, "").replace(/[^0-9.-]/g, ""));
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

async function assertSafePage(page, label) {
  const url = page.url();
  if (/\b(login|sign[ -]?in|mfa|verification code)\b/i.test(url)) {
    throw new Error(`STOPPED: ${label} page indicates login/MFA. Sign in manually and restart the command.`);
  }
  const secretControls = await page.locator('input[type="password"]:visible, input[name*="otp" i]:visible, input[id*="otp" i]:visible, input[name*="pin" i]:visible, input[id*="pin" i]:visible, input[name*="passcode" i]:visible, input[id*="passcode" i]:visible').count();
  if (secretControls > 0) throw new Error(`STOPPED: ${label} page shows an authentication-secret control. The worker never enters secrets.`);
  const captcha = await page.locator('iframe[src*="captcha" i]:visible, iframe[title*="captcha" i]:visible, [id*="captcha" i]:visible, [class*="captcha" i]:visible').count();
  if (captcha > 0) throw new Error(`STOPPED: ${label} page shows CAPTCHA. No CAPTCHA is bypassed.`);
}

function requireDraft(draft, type) {
  if (!draft || typeof draft !== "object") throw new Error(`${type} teaching draft is invalid.`);
  if (draft.draftType && draft.draftType !== type) throw new Error(`${type} teaching draft has the wrong draftType.`);
  if (!draft.selector_map || typeof draft.selector_map !== "object") throw new Error(`${type} teaching draft has no selector_map.`);
  return draft;
}

function requirePortalDraft(draft) {
  if (!draft.selector_map.historySelector) throw new Error("Passbook teaching is missing historySelector.");
  if (!draft.selector_map.rowSelectorTemplate?.includes("{index}")) throw new Error("Passbook teaching is missing rowSelectorTemplate.");
  const f = draft.selector_map.fields ?? {};
  for (const key of ["externalTransactionId", "status", "transactionType", "amount", "commission"]) {
    if (!f[key]) throw new Error(`Passbook teaching is missing fields.${key}.`);
  }
  const r = draft.selector_map.receipt?.fields ?? {};
  for (const key of ["externalTransactionId", "status", "amount", "customerBank", "aadhaarLast4", "occurredAt"]) {
    if (!r[key]) throw new Error(`Receipt teaching is missing receipt.fields.${key}.`);
  }
}

function requireErpDraft(draft) {
  const f = draft.selector_map?.fields ?? {};
  for (const key of ["customer", "customerMobile", "customerBank", "aadhaarLast4", "aepsServicePortal", "withdrawalAmount", "customerServiceFee", "portalCommission", "feeTreatmentModel", "feeCollectionInstrument", "bankRrn"]) {
    if (!f[key]) throw new Error(`ERP teaching is missing fields.${key}.`);
  }
  if (!draft.selector_map.reviewSelector) throw new Error("ERP teaching is missing reviewSelector.");
}

async function readTeaching(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function textAt(page, selector) {
  const loc = page.locator(selector);
  if ((await loc.count()) !== 1) throw new Error(`STOPPED: selector did not match exactly one element: ${selector}`);
  return clean(await loc.textContent());
}

async function clickSelector(page, selector, label) {
  const loc = page.locator(selector);
  if ((await loc.count()) !== 1) throw new Error(`STOPPED: learned ${label} selector did not match exactly one element.`);
  await loc.click();
}

async function setField(page, selector, value, label) {
  const loc = page.locator(selector);
  if ((await loc.count()) !== 1) throw new Error(`STOPPED: learned ${label} selector did not match exactly one element.`);
  const tag = await loc.evaluate((el) => el.tagName.toLowerCase());
  if (tag === "select") {
    const options = await loc.locator("option").evaluateAll((els) => els.map((e) => ({ value: e.value, text: e.textContent?.trim() || "" })));
    const exact = options.find((o) => o.text.toLowerCase() === String(value).toLowerCase());
    const partial = options.find((o) => o.text.toLowerCase().includes(String(value).toLowerCase()));
    const option = exact ?? partial;
    if (!option) throw new Error(`STOPPED: could not find option '${value}' in ${label}.`);
    await loc.selectOption(option.value);
    return;
  }
  const type = await loc.getAttribute("type");
  if (["text", "tel", "number", "search", "email"].includes(type) || tag === "textarea") {
    await loc.fill(String(value));
    return;
  }
  const contentEditable = await loc.getAttribute("contenteditable");
  if (contentEditable === "true") { await loc.fill(String(value)); return; }
  throw new Error(`STOPPED: ${label} is not a fillable/select control. Re-teach that field with the actual input element.`);
}

async function chooseSearchable(page, selector, label, value) {
  const loc = page.locator(selector);
  if ((await loc.count()) !== 1) throw new Error(`STOPPED: learned ${label} selector did not match exactly one control.`);
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
      if (await candidate.count() > 0 && await candidate.isVisible()) {
        await candidate.click();
        return;
      }
    } catch {}
  }
  throw new Error(`STOPPED: could not select '${value}' in ${label}. Keep the dropdown open and verify the exact customer/bank/portal label.`);
}

async function findFirstAepsRow(page, map) {
  for (let index = 1; index <= 500; index += 1) {
    const rowSelector = map.rowSelectorTemplate.replace("{index}", String(index));
    if (await page.locator(rowSelector).count() !== 1) break;
    const type = await textAt(page, `${rowSelector} ${map.fields.transactionType}`);
    const status = await textAt(page, `${rowSelector} ${map.fields.status}`);
    if (!/cash withdrawal|withdrawal/i.test(type)) continue;
    if (!/success|successful|completed|complete|settled/i.test(status)) continue;
    return {
      index,
      rowSelector,
      externalTransactionId: await textAt(page, `${rowSelector} ${map.fields.externalTransactionId}`),
      status,
      transactionType: type,
      amount: money(await textAt(page, `${rowSelector} ${map.fields.amount}`)),
      commission: money(map.fields.commission ? await textAt(page, `${rowSelector} ${map.fields.commission}`) : null),
      occurredAt: map.fields.occurredAt ? await textAt(page, `${rowSelector} ${map.fields.occurredAt}`) : null,
    };
  }
  throw new Error("STOPPED: no successful AEPS Cash Withdrawal row was found in the taught Passbook view.");
}

async function openReceipt(context, page, row, portalDraft) {
  const idSelector = `${row.rowSelector} ${portalDraft.selector_map.fields.externalTransactionId}`;
  const beforePages = context.pages().length;
  const beforeUrl = page.url();
  await clickSelector(page, idSelector, "Passbook RRN / transaction reference");
  await page.waitForTimeout(800);
  let receipt = context.pages().at(-1) ?? page;
  if (context.pages().length === beforePages && receipt.url() === beforeUrl) {
    await ask("The RRN did not open a receipt automatically. Open the matching DigiPay receipt manually, then press Enter here: ");
    receipt = context.pages().at(-1) ?? page;
  }
  await receipt.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForTimeout(300);
  await assertSafePage(receipt, "DigiPay receipt");
  if (!/receipt/i.test(receipt.url())) throw new Error(`STOPPED: expected a DigiPay receipt page, got ${receipt.url()}`);
  return receipt;
}

async function collectAndVerifyPortal() {
  const portalDraft = await readTeaching(portalDraftFile);
  requirePortalDraft(portalDraft);
  const context = await chromium.launchPersistentContext(portalStateDir, { headless: false, viewport: null, acceptDownloads: false });
  try {
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(portalStartUrl, { waitUntil: "domcontentloaded" }).catch((e) => { if (!/ERR_ABORTED/i.test(String(e))) throw e; });
    console.log(`Opened ${portalProvider}.`);
    console.log("Complete DigiPay authentication manually if required. Never enter OTP/PIN/password/CAPTCHA values into this worker.");
    await ask("When the taught Passbook/transaction page is visible, press Enter here: ");
    await assertSafePage(page, "DigiPay Passbook");
    const history = page.locator(portalDraft.selector_map.historySelector);
    if (await history.count() !== 1) throw new Error("STOPPED: taught Passbook history selector no longer matches exactly one control.");
    await history.click();
    await page.waitForTimeout(500);
    if (portalDraft.selector_map.cashWithdrawalFilterSelector) {
      await clickSelector(page, portalDraft.selector_map.cashWithdrawalFilterSelector, "AEPS/cash-withdrawal filter");
      await page.waitForTimeout(300);
    }
    const row = await findFirstAepsRow(page, portalDraft.selector_map);
    const receipt = await openReceipt(context, page, row, portalDraft);
    const r = portalDraft.selector_map.receipt.fields;
    const receiptData = {
      externalTransactionId: await textAt(receipt, r.externalTransactionId),
      status: await textAt(receipt, r.status),
      amount: money(await textAt(receipt, r.amount)),
      customerBank: await textAt(receipt, r.customerBank),
      aadhaarLast4: (await textAt(receipt, r.aadhaarLast4)).replace(/\D/g, "").slice(-4),
      occurredAt: await textAt(receipt, r.occurredAt),
      customerName: r.customerName ? await textAt(receipt, r.customerName) : null,
      customerMobile: r.customerMobile ? await textAt(receipt, r.customerMobile) : null,
    };
    if (normId(row.externalTransactionId) !== normId(receiptData.externalTransactionId)) throw new Error("STOPPED: Passbook RRN and receipt RRN/transaction reference do not match.");
    if (!sameMoney(row.amount, receiptData.amount)) throw new Error("STOPPED: Passbook amount and receipt amount do not match.");
    if (!/success|successful|completed|complete|settled/i.test(receiptData.status)) throw new Error("STOPPED: DigiPay receipt is not successful/completed.");
    return { context, page, row, receipt, receiptData, commission: row.commission ?? 0 };
  } catch (error) {
    await context.close().catch(() => {});
    throw error;
  }
}

async function fillErp(portal) {
  const erpDraft = await readTeaching(erpDraftFile);
  requireErpDraft(erpDraft);
  const f = erpDraft.selector_map.fields;
  const erpContext = await chromium.launchPersistentContext(erpStateDir, { headless: false, viewport: null, acceptDownloads: false });
  const page = erpContext.pages()[0] ?? await erpContext.newPage();
  await page.goto(erpStartUrl, { waitUntil: "domcontentloaded" });
  console.log("Opened Cafe ERP AEPS Cash Out.");
  await ask("When the clean AEPS Cash Out form is visible, press Enter here: ");
  await assertSafePage(page, "Cafe ERP AEPS");

  const receipt = portal.receiptData;
  let customerName = clean(receipt.customerName);
  let customerMobile = clean(receipt.customerMobile).replace(/\D/g, "");
  if (!customerMobile || customerMobile.length !== 10) customerMobile = "";
  if (!customerName) customerName = "";

  console.log("\nCUSTOMER MATCHING CHECK");
  console.log(`Aadhaar last 4: ${receipt.aadhaarLast4 || "not supplied"}`);
  console.log(`Bank: ${receipt.customerBank || "not supplied"}`);
  if (customerName) console.log(`Receipt customer name: ${customerName}`);
  if (customerMobile) console.log(`Receipt customer mobile: ${customerMobile}`);

  if (!customerMobile) {
    customerMobile = await askRequired("Enter the Cafe ERP customer's 10-digit mobile number: ", (v) => /^\d{10}$/.test(v.replace(/\D/g, "")), "Please enter exactly 10 digits.");
    customerMobile = customerMobile.replace(/\D/g, "");
  }
  if (!customerName) customerName = await askRequired("Enter the Cafe ERP customer's exact name: ", (v) => v.trim().length >= 2, "Please enter the customer's name.");

  await chooseSearchable(page, f.customer, "Customer (CRM Profile)", customerName);
  await setField(page, f.customerMobile, customerMobile, "Customer Mobile Number");
  await chooseSearchable(page, f.customerBank, "Customer's Bank", receipt.customerBank);
  await setField(page, f.aadhaarLast4, receipt.aadhaarLast4, "Aadhaar Last 4");
  await chooseSearchable(page, f.aepsServicePortal, "AEPS Service Portal", "Digipay");
  await setField(page, f.withdrawalAmount, portal.row.amount, "Withdrawal Amount");

  const serviceFeeRaw = await askRequired("Customer Service Fee for this AEPS withdrawal? ₹", (v) => /^\d+(?:\.\d{1,2})?$/.test(v), "Enter a valid non-negative amount, e.g. 30 or 30.50.");
  const serviceFee = money(serviceFeeRaw);
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
  await setField(page, f.bankRrn, portal.row.externalTransactionId, "Bank RRN / Terminal Reference Number");

  await page.waitForTimeout(500);
  await clickSelector(page, erpDraft.selector_map.reviewSelector, "transaction review/summary");

  const cashHanded = feeTreatment === "deduct" ? Math.max(0, portal.row.amount - serviceFee) : portal.row.amount;
  const totalIncome = serviceFee + (portal.commission ?? 0);
  console.log("\n=== AEPS PRE-POST REVIEW ===");
  console.log(`Customer: ${customerName}`);
  console.log(`Mobile: ${customerMobile}`);
  console.log(`Bank: ${receipt.customerBank}`);
  console.log(`Aadhaar last 4: ${receipt.aadhaarLast4}`);
  console.log(`AEPS portal: Digipay`);
  console.log(`Withdrawal: ₹${portal.row.amount.toFixed(2)}`);
  console.log(`Customer Service Fee: ₹${serviceFee.toFixed(2)} (operator input)`);
  console.log(`Provider Commission: ₹${(portal.commission ?? 0).toFixed(2)} (DigiPay Passbook)`);
  console.log(`Fee Treatment: ${feeTreatment === "deduct" ? "Deduct from Payout" : "Collect Fee Separately"}`);
  console.log(`Cash handed to customer: ₹${cashHanded.toFixed(2)}`);
  console.log(`Operator income before any other adjustments: ₹${totalIncome.toFixed(2)}`);
  console.log(`RRN: ${portal.row.externalTransactionId}`);
  console.log("FINAL POSTING: NOT PERFORMED. Review the Cafe ERP screen and click Complete/Confirm yourself.");

  await erpContext.close();
  await portal.context.close();
}

async function main() {
  console.log("\nCafe ERP — One-Command AEPS Assistant");
  console.log("Read-only DigiPay extraction → receipt verification → operator fee input → Cafe ERP fill.");
  console.log("No DigiPay authorization and no Cafe ERP final posting are performed by this command.\n");
  const portal = await collectAndVerifyPortal();
  await fillErp(portal);
}

main().catch((error) => { console.error(`\n${error instanceof Error ? error.message : error}`); process.exitCode = 1; });
