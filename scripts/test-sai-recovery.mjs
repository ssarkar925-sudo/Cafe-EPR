import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const recovery = read("lib/sai/core/recovery.ts");
const policy = read("lib/sai/core/recovery-policy.ts");
const diagnosis = read("lib/sai/core/diagnosis.ts");
const pos = read("lib/sai/capabilities/pos-worker.ts");
const migration = read("supabase/migrations/20260928122000_sai_recovery_attempts.sql");

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  PASS: ${message}`);
  } else {
    failed += 1;
    console.error(`  FAIL: ${message}`);
  }
}

console.log("SAI safe recovery regression tests");
check(policy.includes('nextAction !== "retry_verification"'), "Recovery policy requires retry_verification");
check(policy.includes('category !== "verification_failure"'), "Recovery policy rejects non-verification categories");
check(policy.includes('"payment_mismatch"') === false, "Recovery policy has no financial auto-recovery category");
check(recovery.includes("MAX_AUTOMATIC_ATTEMPTS = 1"), "Automatic recovery is limited to one attempt");
check(recovery.includes("sai_recovery_attempts"), "Recovery attempts are durably recorded");
check(recovery.includes("sai.recovery.completed"), "Recovery attempts emit a durable SAI trace event");
check(recovery.includes("persistSaiEvidence"), "Recovery results persist evidence");
check(recovery.includes("resolveSaiAttention"), "Successful safe recovery resolves the original attention");
check(!/from\(["'](?:invoices|payments|invoice_items|transactions|customer_ledger|journal_entries|journal_lines)["']\)/.test(recovery), "Recovery engine does not directly query financial authority tables");
check(!/update\(["'](?:invoices|payments|invoice_items|transactions|customer_ledger|journal_entries|journal_lines)["']\)/.test(recovery), "Recovery engine does not directly mutate financial authority tables");
check(diagnosis.includes("isTransientVerificationFailure"), "Diagnosis classifies transient failures");
check(pos.includes("recoverSaiAttention"), "POS worker wires safe recovery");
check(pos.includes("verifyPosSale"), "POS verification is reusable for safe re-checks");
check(migration.includes("enable row level security"), "Recovery ledger enables RLS");
check(migration.includes("sai_recovery_staff_read"), "Recovery ledger has staff read policy");
check(migration.includes("sai_recovery_staff_insert"), "Recovery ledger has actor-bound insert policy");
check(migration.includes("sai_recovery_staff_update"), "Recovery ledger has actor-bound update policy");
check(!migration.includes("auth.role()"), "Recovery ledger does not use deprecated auth.role()");

console.log(`\n${passed} passed / ${failed} failed`);
process.exitCode = failed ? 1 : 0;
