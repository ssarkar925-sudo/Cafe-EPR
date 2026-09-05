import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright";

const startUrl = process.env.AI_ERP_AEPS_URL ?? "https://cafeerp.vercel.app/business/aeps";
const stateDir = path.resolve(process.env.AI_ERP_STATE_DIR ?? ".ai-portal-state");
const stateFile = path.join(stateDir, "erp-storage-state.json");
const teachingDraftFile = path.resolve(process.env.AI_ERP_AEPS_DRAFT ?? path.join(stateDir, "aeps-erp-teaching-draft.json"));

async function ask(question) {
  const rl = readline.createInterface({ input, output });
  try { return (await rl.question(question)).trim(); } finally { rl.close(); }
}

async function inspectPage(page) {
  const url = page.url();
  if (/\b(login|sign[ -]?in|mfa|verification code)\b/i.test(url)) {
    throw new Error("STOPPED: Cafe ERP is at an authentication page. Sign in manually, then rerun teaching.");
  }
  const secretControls = await page.locator('input[type="password"]:visible, input[name*="otp" i]:visible, input[id*="otp" i]:visible, input[name*="pin" i]:visible, input[id*="pin" i]:visible, input[name*="passcode" i]:visible, input[id*="passcode" i]:visible').count();
  if (secretControls > 0) throw new Error("STOPPED: an authentication-secret control is visible. No secret was entered by the worker.");
}

async function pickSelector(page, prompt) {
  console.log(`\nPICK: ${prompt}`);
  console.log("In the browser, click the requested form control. The worker records only its structural selector, not its visible value.");
  const result = await page.evaluate(async () => {
    const uniqueAttributeSelector = (element) => {
      for (const attribute of ["data-testid", "data-test", "aria-label", "name", "id"]) {
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
        const siblings = current.parentElement
          ? Array.from(current.parentElement.children).filter((child) => child.tagName === current.tagName)
          : [];
        const index = Math.max(1, siblings.indexOf(current) + 1);
        parts.unshift(`${tag}:nth-of-type(${index})`);
        current = current.parentElement;
      }
      return parts.join(" > ");
    };

    return await new Promise((resolve) => {
      const handler = (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        event.preventDefault();
        event.stopPropagation();
        document.removeEventListener("click", handler, true);
        resolve({ selector: structuralSelector(target) });
      };
      document.addEventListener("click", handler, true);
    });
  });
  if (!result?.selector) throw new Error("Could not learn selector.");
  return result.selector;
}

async function main() {
  await fs.mkdir(stateDir, { recursive: true });
  const context = await chromium.launchPersistentContext(stateDir, {
    headless: false,
    viewport: null,
    acceptDownloads: false,
  });

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(startUrl, { waitUntil: "domcontentloaded" }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!/ERR_ABORTED/i.test(message)) throw error;
    });
    console.log(`Opened Cafe ERP AEPS form: ${page.url()}`);
    console.log("Sign in manually if required. Do not provide passwords, OTPs, PINs or other secrets to this worker.");
    await ask("When the AEPS Cash Out form is visible, press Enter here: ");
    await inspectPage(page);

    const fields = {};
    const fieldPlan = [
      ["customer", "click the Customer (CRM Profile) control"],
      ["customerMobile", "click the Customer Mobile Number field"],
      ["customerBank", "click the Customer's Bank control"],
      ["aadhaarLast4", "click the Aadhaar Number (Last 4 Digits) field"],
      ["aepsServicePortal", "click the AEPS Service Portal control"],
      ["withdrawalAmount", "click the Withdrawal Amount field"],
      ["customerServiceFee", "click the Customer Service Fee field"],
      ["portalCommission", "click the Portal Commission field"],
      ["feeTreatmentModel", "click the Fee Treatment Model control"],
      ["feeCollectionInstrument", "click the Fee Collection Instrument control"],
      ["bankRrn", "click the Bank RRN / Terminal Reference Number field"],
    ];

    for (const [key, prompt] of fieldPlan) {
      fields[key] = await pickSelector(page, prompt);
    }

    console.log("\nPICK: click the transaction review/summary area that shows the calculated values");
    const reviewSelector = await pickSelector(page, "click the transaction review/summary area that shows the calculated values");

    const stopFinal = await ask("Is the final completion/post button visible on this screen? Type y or n: ");
    let finalActionSelector = null;
    if (stopFinal.toLowerCase().startsWith("y")) {
      finalActionSelector = await pickSelector(page, "click the final completion/post button (the trainer will record it but will NOT press it)");
    }

    const screenshotFile = path.join(stateDir, "aeps-erp-teaching-screenshot.png");
    const snapshotFile = path.join(stateDir, "aeps-erp-form-snapshot.txt");
    await fs.writeFile(snapshotFile, (await page.locator("body").innerText()).slice(0, 30000) + "\n", "utf8");
    await page.screenshot({ path: screenshotFile, fullPage: true });
    await context.storageState({ path: stateFile });

    const draft = {
      schemaVersion: 1,
      draftType: "erp_form",
      workflow_key: "aeps_erp_form_fill",
      name: "Cafe ERP AEPS Cash Out Form",
      risk: "medium",
      confidence: 0.95,
      instruction: "Fill only the Cafe ERP AEPS Cash Out form using verified transaction data. Customer Service Fee is operator input and must never be inferred from DigiPay provider charges. Show the review before posting. Never click the final completion/post action automatically.",
      evidence: {
        source: "owner_live_erp_form_teaching",
        taughtAt: new Date().toISOString(),
        pageUrl: page.url(),
        snapshotFile,
        screenshotFile,
      },
      selector_map: {
        formUrl: startUrl,
        fields,
        reviewSelector,
        finalActionSelector,
        safety: {
          finalActionNeverAutoClicked: true,
          customerServiceFeeSource: "operator_input",
          providerCommissionSource: "verified_portal_data",
        },
      },
    };

    await fs.writeFile(teachingDraftFile, JSON.stringify(draft, null, 2) + "\n", "utf8");
    console.log("\nERP AEPS TEACHING COMPLETE");
    console.log(`Draft saved to ${teachingDraftFile}`);
    console.log(`Screenshot saved to ${screenshotFile}`);
    console.log("No transaction was submitted by the teaching worker.");
    console.log("Import this ERP form draft into AI Learning Control Center as a Draft.");
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
