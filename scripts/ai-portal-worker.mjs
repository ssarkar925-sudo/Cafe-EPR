import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const command = process.argv[2] ?? "help";
const provider = process.env.AI_PORTAL_PROVIDER ?? "CSC DigiPay";
const startUrl = process.env.AI_PORTAL_URL;
const stateDir = path.resolve(process.env.AI_PORTAL_STATE_DIR ?? ".ai-portal-state");
const stateFile = path.join(stateDir, "storage-state.json");

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
    'input[type="password"], input[name*="otp" i], input[id*="otp" i], input[name*="pin" i], input[id*="pin" i], input[name*="passcode" i], input[id*="passcode" i]'
  ).count();
  if (secretControlCount > 0) {
    throw new Error("STOPPED: portal has an active OTP/PIN/password/passcode control. No secret was entered.");
  }

  const captchaCount = await page.locator(
    'iframe[src*="captcha" i], iframe[title*="captcha" i], [id*="captcha" i], [class*="captcha" i]'
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

  // Keep the patterns in the worker as an explicit safety invariant for code review,
  // while deliberately not treating arbitrary body text as an authentication request.
  void blockedWords;
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
    console.log("\n--- PORTAL SNAPSHOT (transaction page) ---\n");
    console.log(snapshot.slice(0, 20000));
    console.log("\n--- END SNAPSHOT ---\n");
    console.log(`Authenticated browser state is stored locally at ${stateFile}. It is gitignored and must never be committed.`);
    await context.storageState({ path: stateFile });
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

  const context = await chromium.launchPersistentContext(stateDir, {
    headless: true,
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: false,
  });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(startUrl, { waitUntil: "domcontentloaded" });
    await inspectPage(page);
    console.log(`Authenticated ${provider} session opened in read-only worker.`);
    console.log("Collection is intentionally paused until the exact learned selectors are configured in the CSC DigiPay adapter.");
    console.log("No transaction has been initiated or modified.");
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
    console.log("  npm run ai:portal:collect # verify/reuse the authenticated session");
    console.log("Environment: AI_PORTAL_URL, AI_PORTAL_PROVIDER, optional AI_PORTAL_STATE_DIR");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
