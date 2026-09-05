import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright";

const provider = process.env.AI_PORTAL_PROVIDER ?? "CSC DigiPay";
const startUrl = process.env.AI_PORTAL_URL;
const stateDir = path.resolve(process.env.AI_PORTAL_STATE_DIR ?? ".ai-portal-state");
const stateFile = path.join(stateDir, "storage-state.json");
const teachingDraftFile = path.resolve(process.env.AI_PORTAL_TEACHING_DRAFT ?? path.join(stateDir, "teaching-draft.json"));
const blockedWords = /\b(otp|one[- ]time password|pin|password|passcode|captcha|recaptcha|payment authorization)\b/i;

async function askTerminal(question) {
  const rl = readline.createInterface({ input, output });
  try { return (await rl.question(question)).trim(); } finally { rl.close(); }
}

async function inspectPage(page) {
  const url = page.url();
  if (/\b(login|sign[ -]?in|mfa|verification code)\b/i.test(url)) {
    throw new Error("STOPPED: portal URL indicates login/MFA. Sign in manually, then rerun with the authenticated session.");
  }
  const secretControls = await page.locator('input[type="password"]:visible, input[name*="otp" i]:visible, input[id*="otp" i]:visible, input[name*="pin" i]:visible, input[id*="pin" i]:visible, input[name*="passcode" i]:visible, input[id*="passcode" i]:visible').count();
  if (secretControls > 0) throw new Error("STOPPED: portal has an active OTP/PIN/password/passcode control. No secret was entered.");
  const captchaControls = await page.locator('iframe[src*="captcha" i]:visible, iframe[title*="captcha" i]:visible, [id*="captcha" i]:visible, [class*="captcha" i]:visible').count();
  if (captchaControls > 0) throw new Error("STOPPED: portal has an active CAPTCHA control. No CAPTCHA was bypassed.");
  void blockedWords;
}

async function textAt(page, selector) {
  return (await page.locator(selector).textContent())?.trim() || null;
}

async function pickSelector(page, prompt) {
  console.log(`\nPICK: ${prompt}`);
  console.log("In the browser, click the requested element. The worker records only its structural selector, not its visible value.");
  const result = await page.evaluate(async () => {
    const uniqueAttributeSelector = (element) => {
      for (const attribute of ["data-testid", "data-test", "aria-label", "name"]) {
        const value = element.getAttribute(attribute);
        if (!value) continue;
        const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const selector = `[${attribute}="${escaped}"]`;
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

    return await new Promise((resolve) => {
      const clickHandler = (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        event.preventDefault();
        event.stopPropagation();
        document.removeEventListener("click", clickHandler, true);
        resolve({ selector: structuralSelector(target) });
      };
      document.addEventListener("click", clickHandler, true);
    });
  });
  if (!result?.selector) throw new Error("Could not learn receipt selector.");
  return result.selector;
}

async function main() {
  if (provider !== "CSC DigiPay") throw new Error(`Receipt teaching currently supports CSC DigiPay only. Add a portal adapter for '${provider}' before training it.`);
  if (!startUrl) throw new Error("AI_PORTAL_URL is required for receipt teaching.");
  await fs.mkdir(stateDir, { recursive: true });
  const raw = await fs.readFile(teachingDraftFile, "utf8");
  const draft = JSON.parse(raw);
  const selectorMap = draft?.selector_map;
  if (!selectorMap?.historySelector || !selectorMap?.rowSelectorTemplate || !selectorMap?.fields?.externalTransactionId) {
    throw new Error("Existing teaching-draft.json is missing the Passbook selectors. Run the Passbook teaching first.");
  }

  const context = await chromium.launchPersistentContext(stateDir, { headless: false, viewport: null, acceptDownloads: false });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(startUrl, { waitUntil: "domcontentloaded" }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!/ERR_ABORTED/i.test(message)) throw error;
    });
    console.log(`Opened ${provider} receipt-teaching session.`);
    console.log("If the portal needs authentication, complete it yourself in the browser. Never enter secrets into this terminal.");
    await askTerminal("When the authenticated Passbook is visible, press Enter here: ");
    await inspectPage(page);

    const history = page.locator(selectorMap.historySelector);
    if ((await history.count()) !== 1) throw new Error("STOPPED: learned Passbook history selector no longer matches exactly one control.");
    await history.click();
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(500);
    await inspectPage(page);

    const rowSelector = selectorMap.rowSelectorTemplate.replace("{index}", "1");
    const row = page.locator(rowSelector);
    if ((await row.count()) !== 1) throw new Error("STOPPED: first learned transaction row is not available.");
    const rrnCell = row.locator(selectorMap.fields.externalTransactionId);
    if ((await rrnCell.count()) !== 1) throw new Error("STOPPED: learned RRN/transaction-reference selector is not unique in the first row.");

    const beforePages = context.pages().length;
    const beforeUrl = page.url();
    await rrnCell.click().catch((error) => {
      throw new Error(`Could not open the matching RRN/receipt link: ${error instanceof Error ? error.message : String(error)}`);
    });
    await page.waitForTimeout(1000);
    let receiptPage = context.pages().at(-1) ?? page;
    if (context.pages().length === beforePages && receiptPage.url() === beforeUrl) {
      const openedManually = await askTerminal("The RRN did not navigate automatically. Open the matching receipt for the first row manually, then press Enter: ");
      if (!openedManually && context.pages().length === beforePages && receiptPage.url() === beforeUrl) throw new Error("STOPPED: matching receipt was not opened.");
      receiptPage = context.pages().at(-1) ?? page;
    }
    await receiptPage.waitForLoadState("domcontentloaded").catch(() => {});
    await receiptPage.waitForTimeout(400);
    await inspectPage(receiptPage);
    console.log(`Receipt page detected: ${receiptPage.url()}`);

    const receiptFields = {};
    for (const [key, prompt] of [
      ["externalTransactionId", "click the RRN / Transaction ID on the receipt"],
      ["status", "click the payment status on the receipt"],
      ["amount", "click the transaction amount on the receipt"],
      ["customerBank", "click the customer bank name on the receipt"],
      ["aadhaarLast4", "click the Aadhaar / Customer ID field showing the last 4 digits on the receipt"],
      ["occurredAt", "click the transaction date and time on the receipt"],
    ]) {
      receiptFields[key] = await pickSelector(receiptPage, prompt);
    }

    for (const [key, prompt] of [
      ["customerName", "click the customer name on the receipt"],
      ["customerMobile", "click the customer mobile number on the receipt"],
    ]) {
      const available = await askTerminal(`Is receipt field '${key}' available? Type y or n: `);
      if (available.toLowerCase().startsWith("y")) receiptFields[key] = await pickSelector(receiptPage, prompt);
    }

    const receiptSnapshotFile = path.join(stateDir, "aeps-receipt-snapshot.txt");
    const receiptScreenshotFile = path.join(stateDir, "aeps-receipt-teaching-screenshot.png");
    await fs.writeFile(receiptSnapshotFile, (await receiptPage.locator("body").innerText()).slice(0, 20000) + "\n", "utf8");
    await receiptPage.screenshot({ path: receiptScreenshotFile, fullPage: true });
    await context.storageState({ path: stateFile });

    draft.schemaVersion = 2;
    draft.evidence = {
      ...(draft.evidence ?? {}),
      receiptTeachingSource: "owner_live_browser_teaching",
      receiptTaughtAt: new Date().toISOString(),
      receiptPageUrl: receiptPage.url(),
      receiptSnapshotFile,
      receiptScreenshotFile,
    };
    draft.selector_map = {
      ...selectorMap,
      receipt: {
        navigation: {
          triggerField: "externalTransactionId",
          action: "click_rrn_link",
          learnedFromFirstRow: true,
        },
        fields: receiptFields,
      },
    };
    await fs.writeFile(teachingDraftFile, JSON.stringify(draft, null, 2) + "\n", "utf8");

    console.log("\nRECEIPT TEACHING COMPLETE");
    console.log(`Updated draft saved to ${teachingDraftFile}`);
    console.log(`Receipt screenshot saved to ${receiptScreenshotFile}`);
    console.log("Import the updated teaching-draft.json into AI Learning Control Center as a new Draft version.");
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
