import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright";

const command = process.argv[2] ?? "help";
const provider = process.env.AI_PORTAL_PROVIDER ?? "CSC DigiPay";
const startUrl = process.env.AI_PORTAL_URL;
const stateDir = path.resolve(process.env.AI_PORTAL_STATE_DIR ?? ".ai-portal-state");
const stateFile = path.join(stateDir, "storage-state.json");
const selectorsFile = path.resolve(process.env.AI_PORTAL_SELECTORS_FILE ?? path.join(stateDir, "selectors.json"));
const teachingDraftFile = path.resolve(process.env.AI_PORTAL_TEACHING_DRAFT ?? path.join(stateDir, "teaching-draft.json"));
const exportFile = process.env.AI_PORTAL_EXPORT_FILE ? path.resolve(process.env.AI_PORTAL_EXPORT_FILE) : null;

const blockedWords = /\b(otp|one[- ]time password|pin|password|passcode|captcha|recaptcha|payment authorization)\b/i;
const loginWords = /\b(login|sign[ -]?in|mfa|verification code)\b/i;

async function ensureStateDir() {
  await fs.mkdir(stateDir, { recursive: true });
}

async function inspectPage(page) {
  const currentUrl = page.url();
  if (loginWords.test(currentUrl)) {
    throw new Error("STOPPED: portal URL indicates login/MFA. Sign in manually, then rerun with the authenticated session.");
  }
  const secretControlCount = await page.locator('input[type="password"]:visible, input[name*="otp" i]:visible, input[id*="otp" i]:visible, input[name*="pin" i]:visible, input[id*="pin" i]:visible, input[name*="passcode" i]:visible, input[id*="passcode" i]:visible').count();
  if (secretControlCount > 0) throw new Error("STOPPED: portal has an active OTP/PIN/password/passcode control. No secret was entered.");
  const captchaCount = await page.locator('iframe[src*="captcha" i]:visible, iframe[title*="captcha" i]:visible, [id*="captcha" i]:visible, [class*="captcha" i]:visible').count();
  if (captchaCount > 0) throw new Error("STOPPED: portal has an active CAPTCHA control. No CAPTCHA was bypassed.");
  const authorizationCount = await page.getByText(/payment authorization|authorize payment|confirm payment|enter otp|enter pin|enter password/i).count().catch(() => 0);
  if (authorizationCount > 0) throw new Error("STOPPED: portal shows a payment/secret authorization prompt. No authorization was performed.");
  void blockedWords;
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeName(value, fallback) {
  const cleaned = cleanText(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

async function askTerminal(question) {
  const rl = readline.createInterface({ input, output });
  try { return (await rl.question(question)).trim(); } finally { rl.close(); }
}

/** Browser-side selector generation avoids embedding transaction/customer values. */
async function pickSelector(page, prompt, options = {}) {
  const relativeTo = options.relativeTo ?? null;
  console.log(`\nPICK: ${prompt}`);
  console.log("In the browser, click the requested element. The worker records only its structural selector, not its visible value.");

  const selector = await page.evaluate(async ({ relativeTo: rootSelector }) => {
    const uniqueAttributeSelector = (element) => {
      for (const attribute of ["data-testid", "data-test", "aria-label", "name"]) {
        const value = element.getAttribute(attribute);
        if (!value) continue;
        const selector = `[${attribute}="${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;
        try { if (document.querySelectorAll(selector).length === 1) return selector; } catch {}
      }
      return null;
    };

    const structuralSelector = (element, stopElement = document.body) => {
      const parts = [];
      let current = element;
      while (current && current.nodeType === 1 && current !== stopElement) {
        const attr = uniqueAttributeSelector(current);
        if (attr) { parts.unshift(attr); break; }
        const tag = current.tagName.toLowerCase();
        const siblings = current.parentElement ? Array.from(current.parentElement.children).filter((child) => child.tagName === current.tagName) : [];
        const index = Math.max(1, siblings.indexOf(current) + 1);
        parts.unshift(`${tag}:nth-of-type(${index})`);
        current = current.parentElement;
      }
      return parts.join(" > ");
    };

    const getRow = (element) => element.closest("tr") || element.closest('[role="row"]') || null;

    const repeatableRowSelector = (row) => {
      if (!row) return null;
      const tag = row.tagName.toLowerCase();
      const parent = row.parentElement;
      if (!parent) return null;
      const siblings = Array.from(parent.children).filter((child) => child.tagName === row.tagName);
      const index = Math.max(1, siblings.indexOf(row) + 1);
      const parentPath = structuralSelector(parent, document.body);
      const rowPart = `${tag}:nth-of-type(${index})`;
      return parentPath ? `${parentPath} > ${rowPart.replace(String(index), "{index}")}` : rowPart.replace(String(index), "{index}");
    };

    const relativeSelector = (root, element) => {
      if (!root || root === element) return null;
      const parts = [];
      let current = element;
      while (current && current !== root) {
        const tag = current.tagName.toLowerCase();
        const siblings = current.parentElement ? Array.from(current.parentElement.children).filter((child) => child.tagName === current.tagName) : [];
        const index = Math.max(1, siblings.indexOf(current) + 1);
        parts.unshift(`${tag}:nth-of-type(${index})`);
        current = current.parentElement;
      }
      const candidate = parts.join(" > ");
      try { if (root.querySelectorAll(candidate).length === 1) return candidate; } catch {}
      return null;
    };

    return await new Promise((resolve) => {
      const clickHandler = (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        event.preventDefault();
        event.stopPropagation();
        document.removeEventListener("click", clickHandler, true);
        const root = rootSelector ? document.querySelector(rootSelector.replace("{index}", "1")) : null;
        const row = getRow(target);
        resolve({ selector: structuralSelector(target), rowSelectorTemplate: repeatableRowSelector(row), relativeSelector: root ? relativeSelector(root, target) : null });
      };
      document.addEventListener("click", clickHandler, true);
    });
  }, { relativeTo });

  if (!selector?.selector) throw new Error("Could not learn a selector from the selected element.");
  return selector;
}

async function loadSelectors() {
  try {
    const raw = await fs.readFile(selectorsFile, "utf8");
    const selectors = JSON.parse(raw);
    if (!selectors || typeof selectors !== "object") throw new Error("selectors.json must contain an object.");
    if (provider === "CSC DigiPay") {
      if (typeof selectors.historySelector !== "string" || !selectors.historySelector.trim()) throw new Error("selectors.json is missing historySelector.");
      if (typeof selectors.rowSelectorTemplate !== "string" || !selectors.rowSelectorTemplate.includes("{index}")) throw new Error("selectors.json rowSelectorTemplate must contain {index}.");
      if (!selectors.fields || typeof selectors.fields !== "object") throw new Error("selectors.json is missing fields.");
      for (const key of ["externalTransactionId", "status", "transactionType", "amount"]) {
        if (typeof selectors.fields[key] !== "string" || !selectors.fields[key].trim()) throw new Error(`selectors.json fields.${key} is required.`);
      }
    }
    return selectors;
  } catch (error) {
    throw new Error(error instanceof Error ? `${error.message} Run 'npm run ai:portal:teach' first, then save the owner-taught selector map to ${selectorsFile}.` : String(error));
  }
}

function parseMoney(value) {
  if (!value) return null;
  const normalized = value.replace(/,/g, "").replace(/[^0-9.-]/g, "").trim();
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function isCompleted(status) {
  return ["success", "successful", "completed", "complete", "settled"].includes(status.trim().toLowerCase());
}

function normalizeExternalId(value) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function fingerprint(transaction) {
  return `${transaction.providerName.trim().toLowerCase()}|${normalizeExternalId(transaction.externalTransactionId)}`;
}

function validateTransaction(transaction) {
  const errors = [];
  if (!transaction.providerName.trim()) errors.push("providerName is required");
  if (!transaction.externalTransactionId.trim()) errors.push("externalTransactionId is required");
  if (!isCompleted(transaction.status)) errors.push("transaction is not completed/successful");
  if (!Number.isFinite(transaction.amount) || transaction.amount <= 0) errors.push("amount must be greater than zero");
  return errors;
}

async function textAt(page, selector) {
  return (await page.locator(selector).textContent())?.trim() || null;
}

async function collectCscDigiPay(page, selectors) {
  if ((await page.locator(selectors.historySelector).count()) !== 1) throw new Error("STOPPED: CSC DigiPay history control does not match the learned workflow.");
  await page.locator(selectors.historySelector).click();
  if (selectors.cashWithdrawalFilterSelector) {
    if ((await page.locator(selectors.cashWithdrawalFilterSelector).count()) !== 1) throw new Error("STOPPED: CSC DigiPay AEPS/cash-withdrawal filter does not match the learned workflow.");
    await page.locator(selectors.cashWithdrawalFilterSelector).click();
  }
  await inspectPage(page);
  const firstRowSelector = selectors.rowSelectorTemplate.replace("{index}", "1");
  if ((await page.locator(firstRowSelector).count()) === 0) return [];
  const transactions = [];
  const fingerprints = new Set();
  for (let index = 1; index <= 500; index += 1) {
    const rowSelector = selectors.rowSelectorTemplate.replace("{index}", String(index));
    if ((await page.locator(rowSelector).count()) !== 1) break;
    const field = (name) => `${rowSelector} ${selectors.fields[name]}`;
    const status = (await textAt(page, field("status"))) ?? "";
    if (!isCompleted(status)) continue;
    const transaction = {
      sourceType: "aeps",
      providerName: "CSC DigiPay",
      externalTransactionId: (await textAt(page, field("externalTransactionId"))) ?? "",
      externalReference: selectors.fields.externalReference ? await textAt(page, field("externalReference")) : null,
      status,
      transactionType: (await textAt(page, field("transactionType"))) ?? "",
      amount: parseMoney(await textAt(page, field("amount"))),
      fee: selectors.fields.fee ? parseMoney(await textAt(page, field("fee"))) : null,
      commission: selectors.fields.commission ? parseMoney(await textAt(page, field("commission"))) : null,
      occurredAt: selectors.fields.occurredAt ? await textAt(page, field("occurredAt")) : null,
      customerName: selectors.fields.customerName ? await textAt(page, field("customerName")) : null,
      customerMobile: selectors.fields.customerMobile ? await textAt(page, field("customerMobile")) : null,
      rawData: {},
    };
    const errors = validateTransaction(transaction);
    if (errors.length) throw new Error(`STOPPED: CSC DigiPay row ${index} failed validation: ${errors.join(", ")}.`);
    const key = fingerprint(transaction);
    if (fingerprints.has(key)) continue;
    fingerprints.add(key);
    transactions.push(transaction);
  }
  return transactions;
}

async function writeExport(transactions) {
  const payload = { providerName: provider, collectedAt: new Date().toISOString(), readOnly: true, transactionCount: transactions.length, transactions };
  const serialized = JSON.stringify(payload, null, 2);
  console.log("\n--- COLLECTED TRANSACTIONS ---\n");
  console.log(serialized);
  console.log("\n--- END COLLECTED TRANSACTIONS ---\n");
  if (exportFile) {
    await fs.writeFile(exportFile, serialized + "\n", "utf8");
    console.log(`Export written to ${exportFile}`);
  }
}

async function learn() {
  if (!startUrl) throw new Error("AI_PORTAL_URL is required for learn mode.");
  await ensureStateDir();
  const context = await chromium.launchPersistentContext(stateDir, { headless: false, viewport: null, acceptDownloads: false });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(startUrl, { waitUntil: "domcontentloaded" });
    console.log(`Opened ${provider}: ${page.url()}`);
    console.log("Complete any required login manually. Do not provide OTP/PIN/password to the worker.");
    console.log("Navigate manually to the completed AEPS transaction-history screen.");
    await askTerminal("When the transaction table is visible, press Enter here: ");
    await inspectPage(page);
    const snapshot = await page.locator("body").innerText();
    const snapshotFile = path.join(stateDir, "transaction-history-snapshot.txt");
    await fs.writeFile(snapshotFile, snapshot.slice(0, 20000) + "\n", "utf8");
    await context.storageState({ path: stateFile });
    console.log(`Portal snapshot saved to ${snapshotFile}`);
  } finally {
    await context.close();
  }
}

async function teach() {
  if (!startUrl) throw new Error("AI_PORTAL_URL is required for teach mode.");
  await ensureStateDir();
  const context = await chromium.launchPersistentContext(stateDir, { headless: false, viewport: null, acceptDownloads: false });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(startUrl, { waitUntil: "domcontentloaded" });
    console.log(`Opened ${provider} teaching session.`);
    console.log("Log in yourself in the browser. The worker never types or stores OTP/PIN/password/CAPTCHA values.");
    await askTerminal("After authentication is complete, press Enter here: ");
    await inspectPage(page);

    const history = await pickSelector(page, "click the Transaction History control");
    await page.locator(history.selector).click();
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(500);
    await inspectPage(page);

    let cashWithdrawalFilterSelector = null;
    const hasFilter = await askTerminal("Does the transaction page have a dedicated AEPS/cash-withdrawal filter? Type y or n: ");
    if (hasFilter.toLowerCase().startsWith("y")) {
      const filter = await pickSelector(page, "click the AEPS/cash-withdrawal filter");
      cashWithdrawalFilterSelector = filter.selector;
      await page.locator(cashWithdrawalFilterSelector).click();
      await page.waitForTimeout(300);
      await inspectPage(page);
    }

    const firstRow = await pickSelector(page, "click any cell inside the first completed transaction row");
    const rowSelectorTemplate = firstRow.rowSelectorTemplate;
    if (!rowSelectorTemplate || !rowSelectorTemplate.includes("{index}")) throw new Error("STOPPED: could not learn a repeatable transaction row selector.");
    const firstRowSelector = rowSelectorTemplate.replace("{index}", "1");
    if ((await page.locator(firstRowSelector).count()) !== 1) throw new Error("STOPPED: learned first-row selector does not resolve uniquely.");

    const fields = {};
    for (const [key, prompt] of [
      ["externalTransactionId", "click the transaction ID/reference cell in the first row"],
      ["status", "click the status cell in the first row"],
      ["transactionType", "click the transaction type/service cell in the first row"],
      ["amount", "click the transaction amount cell in the first row"],
    ]) {
      const picked = await pickSelector(page, prompt, { relativeTo: firstRowSelector });
      if (!picked.relativeSelector) throw new Error(`STOPPED: could not learn a relative selector for ${key}.`);
      fields[key] = picked.relativeSelector;
    }

    for (const [key, prompt] of [
      ["externalReference", "click an external/reference cell in the first row"],
      ["fee", "click a fee cell in the first row"],
      ["commission", "click a commission cell in the first row"],
      ["occurredAt", "click the date/time cell in the first row"],
      ["customerName", "click the customer-name cell in the first row"],
      ["customerMobile", "click the customer-mobile cell in the first row"],
    ]) {
      const addField = await askTerminal(`Is optional field '${key}' available? Type y or n: `);
      if (!addField.toLowerCase().startsWith("y")) continue;
      const picked = await pickSelector(page, prompt, { relativeTo: firstRowSelector });
      if (picked.relativeSelector) fields[key] = picked.relativeSelector;
    }

    const snapshotFile = path.join(stateDir, "transaction-history-snapshot.txt");
    const screenshotFile = path.join(stateDir, "teaching-screenshot.png");
    await fs.writeFile(snapshotFile, (await page.locator("body").innerText()).slice(0, 20000) + "\n", "utf8");
    await page.screenshot({ path: screenshotFile, fullPage: true });
    await context.storageState({ path: stateFile });

    const draft = {
      schemaVersion: 1,
      providerName: provider,
      workflow_key: provider === "CSC DigiPay" ? "csc_digipay_aeps_import" : `${safeName(provider, "portal").toLowerCase()}_transaction_import`,
      name: `${provider} AEPS Import`,
      risk: "low",
      confidence: 0.85,
      instruction: "Read only completed AEPS transaction history. Do not initiate, authorize, or modify any transaction. Stop if the page changes or requests authentication secrets.",
      evidence: { source: "owner_live_browser_teaching", taughtAt: new Date().toISOString(), pageUrl: page.url(), snapshotFile, screenshotFile },
      selector_map: { historySelector: history.selector, cashWithdrawalFilterSelector, rowSelectorTemplate, fields },
    };
    await fs.writeFile(teachingDraftFile, JSON.stringify(draft, null, 2) + "\n", "utf8");
    console.log("\nTEACHING COMPLETE");
    console.log(`Draft saved to ${teachingDraftFile}`);
    console.log(`Screenshot saved to ${screenshotFile}`);
    console.log("Import this draft in AI Learning Control Center. It will be saved as Draft and will not become active automatically.");
  } finally {
    await context.close();
  }
}

async function collect() {
  if (!startUrl) throw new Error("AI_PORTAL_URL is required for collect mode.");
  await ensureStateDir();
  try { await fs.access(stateFile); } catch { throw new Error("No authenticated portal state found. Run 'npm run ai:portal:teach' or 'npm run ai:portal:learn' first."); }
  const selectors = await loadSelectors();
  const context = await chromium.launchPersistentContext(stateDir, { headless: true, viewport: { width: 1440, height: 1000 }, acceptDownloads: false });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(startUrl, { waitUntil: "domcontentloaded" });
    await inspectPage(page);
    if (provider !== "CSC DigiPay") throw new Error(`Unsupported AI_PORTAL_PROVIDER '${provider}'. Add a read-only adapter before enabling collection.`);
    const transactions = await collectCscDigiPay(page, selectors);
    await writeExport(transactions);
    console.log(`Authenticated ${provider} session collected ${transactions.length} completed transaction(s) in read-only mode.`);
  } finally {
    await context.close();
  }
}

try {
  if (command === "learn") await learn();
  else if (command === "teach") await teach();
  else if (command === "collect") await collect();
  else {
    console.log("AI portal worker");
    console.log("  npm run ai:portal:teach   # guided owner teaching; produces a draft workflow");
    console.log("  npm run ai:portal:learn   # manually authenticate and save the read-only page");
    console.log("  npm run ai:portal:collect # reuse the authenticated session and run learned extraction");
    console.log("Environment: AI_PORTAL_URL, AI_PORTAL_PROVIDER, optional AI_PORTAL_STATE_DIR, AI_PORTAL_SELECTORS_FILE, AI_PORTAL_TEACHING_DRAFT, AI_PORTAL_EXPORT_FILE");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
