import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const ROOT = process.cwd();

const REPAIR_SCRIPTS = [
  "repair-build-script-syntax.mjs",
  "restore-upi-workspace-build.mjs",
  "repair-dmt-build.mjs",
  "fix-day-close-build.mjs",
  "repair-settlement-money-build.mjs",
  "repair-settlement-cash-routing-build-v3.mjs",
  "repair-credit-card-repayment-build-v2.mjs",
  "repair-recharge-build.mjs",
  "repair-recharge-build-v2.mjs",
  "repair-business-edit-split-build.mjs",
  "repair-bill-payment-edit-split-build-v2.mjs",
  "repair-bill-payment-split-display-build.mjs",
  "repair-service-collection-reporting-build.mjs",
  "repair-payment-accounts-root-build.mjs",
  "repair-finance-accounts-canonical-build.mjs",
  "repair-financial-reports-root-build.mjs",
  "repair-upi-reconciliation-cashout-build.mjs",
  "repair-upi-cashout-display-build.mjs",
  "repair-upi-qr-binding-build.mjs",
  "repair-reconciliation-root-build.mjs",
  "repair-reconciliation-rounding-build.mjs",
  "repair-reconciliation-final-safety-build.mjs",
  "repair-bank-to-aeps-settlement-ui-build.mjs",
  "repair-unified-settlement-build.mjs",
  "repair-transaction-history-layout.mjs",
  "repair-pos-checkout-result-type.mjs",
  "refine-pos-ui-build.mjs",
];

function resolveBuildIdentity() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return (
      process.env.CF_PAGES_COMMIT_SHA ||
      process.env.GITHUB_SHA ||
      process.env.COMMIT_SHA ||
      "workspace"
    );
  }
}

const identity = resolveBuildIdentity().replace(/[^a-zA-Z0-9._-]/g, "_");
const marker = path.join(ROOT, `.cafeerp-prebuild-repairs.${identity}.done`);

if (fs.existsSync(marker)) {
  console.log(`[prebuild-repair] repair chain already completed for ${identity}; skipping duplicate build pass.`);
  process.exit(0);
}

console.log(`[prebuild-repair] running ${REPAIR_SCRIPTS.length} repair scripts for build ${identity}`);

for (const script of REPAIR_SCRIPTS) {
  const fullPath = path.join(ROOT, "scripts", script);
  const result = spawnSync(process.execPath, [fullPath], {
    cwd: ROOT,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`[prebuild-repair] failed to start ${script}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`[prebuild-repair] ${script} exited with status ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

fs.writeFileSync(
  marker,
  `CafeERP prebuild repairs completed for ${identity} at ${new Date().toISOString()}\n`,
  "utf8",
);

console.log(`[prebuild-repair] repair chain completed successfully for ${identity}.`);
