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
  const text = (await page.locator("body").innerText().catch(() => "")) || "";
  if (blockedWords.test(text)) {
    throw new Error("STOPPED: portal requested OTP/PIN/password/CAPTCHA/payment authorization. No secret was entered.");
  }
  if (loginWords.test(text)) {
    throw new Error("STOPPED: portal requires login/MFA. Sign in manually, then rerun with the authenticated session.");
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
