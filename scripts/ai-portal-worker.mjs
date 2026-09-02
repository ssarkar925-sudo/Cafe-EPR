import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const command = process.argv[2] ?? "help";
const provider = process.env.AI_PORTAL_PROVIDER ?? "CSC DigiPay";
const startUrl = process.env.AI_PORTAL_URL;
const stateDir = path.resolve(process.env.AI_PORTAL_STATE_DIR ?? ".ai-portal-state");
const stateFile = path.join(stateDir, "storage-state.json");
const selectorsFile = path.resolve(process.env.AI_PORTAL_SELECTORS_FILE ?? path.join(stateDir, "selectors.json"));
const exportFile = process.env.AI_PORTAL_EXPORT_FILE ? path.resolve(process.env.AI_PORTAL_EXPORT_FILE) : null;

const blockedWords = /\b(otp|one[- ]time password|pin|password|passcode|captcha|recaptcha|payment authorization)\b/i;
const loginWords = /\b(login|sign[ -]?in|mfa|verification code)\b/i;

async function ensureStateDir() {
  await fs.mkdir(stateDir, { recursive: true });
}

async function inspectPage(page) {
  // Do not scan the entire document for words such as "login" or "OTP":
  // authenticated portals commonly keep those words in navigation/help text.
  // Inspect only active authentication/authorization controls and the URL.
  const currentUrl = page.url();
  if (loginWords.test(currentUrl)) {
    throw new Error("STOPPED: portal URL indicates login/MFA. Sign in manually, then rerun with the authenticated session.");
  }

  const secretControlCount = await page.locator(
    'input[type="password"]:visible, input[name*="otp" i]:visible, input[id*="otp" i]:visible, input[name*="pin" i]:visible, input[id*="pin" i]:visible, input[name*="passcode" i]:visible, input[id*="passcode" i]:visible'
  ).count();
  if (secretControlCount > 0) {
    throw new Error("STOPPED: portal has an active OTP/PIN/password/passcode control. No secret was entered.");
  }

  const captchaCount = await page.locator(
    'iframe[src*="captcha" i]:visible, iframe[title*="captcha" i]:visible, [id*="captcha" i]:visible, [class*="captcha" i]:visible'
  ).count();
  if (captchaCount > 0) {
    throw new Error("STOPPED: portal has an active CAPTCHA control. No CAPTCHA was bypassed.");
  }

  const authorizationCount = await page.getByText(
    /payment authorization|authorize payment|confirm payment|enter otp|enter pin|enter password/i
  ).count().catch(() => 0);
  if (authorizationCount > 0) {
    throw new Error("STOPPED: portal shows a payment/secret authorization prompt. No authorization was performed.");
  }

  void blockedWords;
}

async function loadSelectors() {
  try {
    const raw = await fs.readFile(selectorsFile, "utf8");
    const selectors = JSON.parse(raw);
    if (!selectors || typeof selectors !== "object") throw new Error("selectors.json must contain an object.");
    if (provider === "CSC DigiPay") {
      if (typeof selectors.historySelector !== "string" || !selectors.historySelector.trim()) {
        throw new Error("selectors.json is missing historySelector.");
      }
      if (typeof selectors.rowSelectorTemplate !== "string" || !selectors.rowSelectorTemplate.includes("{index}")) {
        throw new Error("selectors.json rowSelectorTemplate must contain {index}.");
      }
      if (!selectors.fields || typeof selectors.fields !== "object") {
        throw new Error("selectors.json is missing fields.");
      }
      for (const key of ["externalTransactionId", "status", "transactionType", "amount"]) {
        if (typeof selectors.fields[key] !== "string" || !selectors.fields[key].trim()) {
          throw new Error(`selectors.json fields.${key} is required.`);
        }
      }
    }
    return selectors;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `${error.message} Run 'npm run ai:portal:learn' first, then save the owner-taught selector map to ${selectorsFile}.`
        : String(error),
    );
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
  if ((await page.locator(selectors.historySelector).count()) !== 1) {
    throw new Error("STOPPED: CSC DigiPay history control does not match the learned workflow.");
  }
  await page.locator(selectors.historySelector).click();

  if (selectors.cashWithdrawalFilterSelector) {
    if ((await page.locator(selectors.cashWithdrawalFilterSelector).count()) !== 1) {
      throw new Error("STOPPED: CSC DigiPay AEPS/cash-withdrawal filter does not match the learned workflow.");
    }
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
    if (errors.length) {
      throw new Error(`STOPPED: CSC DigiPay row ${index} failed validation: ${errors.join(", ")}.`);
    }

    const key = fingerprint(transaction);
    if (fingerprints.has(key)) continue;
    fingerprints.add(key);
    transactions.push(transaction);
  }

  return transactions;
}

async function writeExport(transactions) {
  const payload = {
    providerName: provider,
    collectedAt: new Date().toISOString(),
    readOnly: true,
    transactionCount: transactions.length,
    transactions,
  };
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
  const context = await chromium.launchPersistentContext(stateDir, {
    headless: false,
    viewport: null,
    acceptDownloads: false,
  });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(startUrl, { waitUntil: "domcontentloaded" });
    console.log(`Opened ${provider}: ${page.url()}`);
    console.log("Complete any required login manually. Do not provide OTP/PIN/password to the worker.");
    console.log("Navigate manually to the completed AEPS transaction-history screen.");
    console.log("When the transaction table is visible, press Enter in this terminal.");
    await new Promise((resolve) => process.stdin.once("data", resolve));
    await inspectPage(page);
    const snapshot = await page.locator("body").innerText();
    const snapshotFile = path.join(stateDir, "transaction-history-snapshot.txt");
    await fs.writeFile(snapshotFile, snapshot.slice(0, 20000) + "\n", "utf8");
    console.log(`\nPortal snapshot saved to ${snapshotFile}`);
    console.log("Authenticated browser state is stored locally and must never be committed.");
  } finally {
    await context.close();
  }
}

async function collect() {
  if (!startUrl) throw new Error("AI_PORTAL_URL is required for collect mode.");
  await ensureStateDir();
  try {
    await fs.access(stateFile);
  } catch {
    throw new Error("No authenticated portal state found. Run 'npm run ai:portal:learn' first.");
  }

  const selectors = await loadSelectors();
  const context = await chromium.launchPersistentContext(stateDir, {
    headless: true,
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: false,
  });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(startUrl, { waitUntil: "domcontentloaded" });
    await inspectPage(page);

    if (provider === "CSC DigiPay") {
      const transactions = await collectCscDigiPay(page, selectors);
      await writeExport(transactions);
      console.log(`Authenticated ${provider} session collected ${transactions.length} completed transaction(s) in read-only mode.`);
    } else {
      throw new Error(`Unsupported AI_PORTAL_PROVIDER '${provider}'. Add a read-only adapter before enabling collection.`);
    }
  } finally {
    await context.close();
  }
}

try {
  if (command === "learn") await learn();
  else if (command === "collect") await collect();
  else {
    console.log("AI portal worker");
    console.log("  npm run ai:portal:learn   # manually authenticate and teach the read-only page");
    console.log("  npm run ai:portal:collect # reuse the authenticated session and run learned extraction");
    console.log("Environment: AI_PORTAL_URL, AI_PORTAL_PROVIDER, optional AI_PORTAL_STATE_DIR, optional AI_PORTAL_SELECTORS_FILE, optional AI_PORTAL_EXPORT_FILE");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
