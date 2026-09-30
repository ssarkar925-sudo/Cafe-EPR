import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const watcherPath = path.join(root, "electron", "aeps-watcher.js");
const source = fs.readFileSync(watcherPath, "utf8");

const required = [
  ["DigiPay/CSC biometric auth detection", "valid[ \\t]+CSC[ \\t]+ID"],
  ["biometric login signal", "biometric|biometrics"],
  ["Full Sync support", "full sync"],
  ["transaction-page refresh path", "refreshTransactionView(session.win)"],
  ["reload race protection", "const loadPromise = waitForPageLoad(win, 8000)"],
  ["SPA settle after reload", 'extractRenderedPage.toString() + ")(2500)"'],
  ["HTML table extraction", "conventional HTML tables with header mapping"],
  ["ARIA/grid extraction", "ARIA grids and virtualized data tables"],
  ["card/list extraction", "list/card based transaction layouts"],
  ["labeled-text fallback", "conservative page-level fallback"],
  ["transaction event emission", 'type: "transaction"'],
  ["authentication wait", "waitForAuthenticationCompletion"],
];

const forbidden = [
  ["old table score gate", "if (score < 8) continue;"],
];

let failed = 0;
for (const [label, needle] of required) {
  if (source.includes(needle)) {
    console.log("PASS:", label);
  } else {
    console.error("FAIL:", label, "missing:", needle);
    failed++;
  }
}

for (const [label, needle] of forbidden) {
  if (!source.includes(needle)) {
    console.log("PASS:", label, "removed");
  } else {
    console.error("FAIL:", label, "is still present:", needle);
    failed++;
  }
}

console.log("");
console.log(failed === 0 ? "AEPS watcher regression contract passed." : `AEPS watcher regression contract failed: ${failed} check(s).`);
process.exitCode = failed === 0 ? 0 : 1;
