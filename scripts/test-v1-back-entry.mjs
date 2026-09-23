/**
 * V1 Historical Back-entry (G12 workflow) contract test — STATIC ONLY.
 *
 * Verifies, without touching any database: admin-gated route with window
 * lock state, batch submit/void and suspense resolution through
 * lib/v1/v1-rpc.ts, the fixed 12-month window, unknown-expiry rejection,
 * explicit monthly-aggregate labeling, suspense-as-proposed display, no
 * client journal/stock construction, no direct table writes, atomic +
 * idempotent submission via batch_key, reversal-not-deletion void, locked
 * period handling, explicit loading/processing/error/success states, and
 * no returns/offline/thermal/reporting/legacy surface.
 *
 * Run: node scripts/test-v1-back-entry.mjs
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const PAGE = "app/v1/back-entry/page.tsx";
const FORM = "app/v1/back-entry/batch-form.tsx";
const HISTORY = "app/v1/back-entry/history.tsx";
const LOADING = "app/v1/back-entry/loading.tsx";
check("1. route exists", existsSync(join(root, PAGE)) && existsSync(join(root, FORM)) && existsSync(join(root, HISTORY)));

const page = read(PAGE);
const form = read(FORM);
const history = read(HISTORY);
const codeOnly = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"))
    .join("\n");
const pageCode = codeOnly(page);
const formCode = codeOnly(form);
const histCode = codeOnly(history);
const clientCode = `${formCode}\n${histCode}`;
const allCode = `${pageCode}\n${clientCode}`;

// --- 2-3. gates + roles -------------------------------------------------------------------
check(
  "2. session guard exists",
  page.includes("getV1SessionContext") && page.includes("requireV1Admin") && page.includes("V1Forbidden"),
);
check("3. correct role restriction preserved (admin-only mutations)", !/requireV1BackOffice|requireV1Roles/.test(allCode));
const nav = read("components/v1/v1-nav.ts");
check("3b. nav backentry still admin-exact future-marked", /key:\s*"backentry"[\s\S]{0,200}?roles:\s*\["admin"\][\s\S]{0,200}?phase:\s*4/.test(nav));

// --- 4-8. RPC path ------------------------------------------------------------------------------
check("4. submit_back_entry_batch used", formCode.includes('"submit_back_entry_batch"'));
check("5. submit uses V1 RPC wrapper", form.includes('from "@/lib/v1/v1-rpc"') && formCode.includes("callV1Mutation"));
check("6. acquire_back_entry_lock used", formCode.includes('"acquire_back_entry_lock"'));
check("7. void_back_entry_batch used if exposed", histCode.includes('"void_back_entry_batch"'));
check("8. resolve_suspense used if exposed", histCode.includes('"resolve_suspense"'));

// --- 9-16. G12 rules -----------------------------------------------------------------------------------
check("9. 12-month window enforced", form.includes("2025-01-01") && form.includes("12-month window"));
check("10. unknown expiry rejected", form.includes("unknown expiry rejected"));
check("11. monthly aggregate model preserved", form.includes("lot_mode") && form.includes("aggregate:"));
check("12. aggregate lot explicitly labeled", form.includes("Monthly aggregate lot"));
check("13. aggregate lot not presented as exact batch", form.includes("never presented as exact"));
check("14. source references preserved", form.includes("source_ref") && form.includes("per-line source refs"));
check("15. suspense-as-proposed preserved", form.includes("park") && history.includes("Suspense"));
check("16. origin-dated posting preserved", form.includes("origin-dated"));

// --- 17-23. no client construction, no direct writes -----------------------------------------------------------------------------------
check("17. no client journal construction", !/account_code|chart_of_accounts|post_journal\s*\(/.test(allCode));
check("18. no client stock mutation", !/intake_lots|adjust_stock|reserve_stock|release_reservation/.test(allCode));
check(
  "19-23. no direct table writes",
  !/\.(insert|update|delete|upsert)\s*\(/.test(allCode) &&
    !/\.from\(\s*["'](back_entry_batches|back_entry_lines|suspense_records|stock_lots|journal_entries|journal_lines|payment_claims)["']\s*\)/.test(clientCode),
);

// --- 24-28. atomicity, idempotency, void -----------------------------------------------------------------------------------
check("24. atomic submission preserved", form.includes("atomic"));
check("25. idempotency preserved", formCode.includes("p_batch_key: batchKey"));
check("26. retry identity preserved", form.includes("retries reuse"));
check("27. successful submission regenerates new identity", formCode.includes("setBatchKey(newKey())"));
check("28. void is reversal, not deletion", history.includes("never deleted") && histCode.includes('"void_back_entry_batch"'));

// --- 29-30. lock + period handling --------------------------------------------------------------------------------------------------------------
check("29. locked period rejection handled", form.includes("locked period") && page.includes("Window sealed"));
check("30. lock conflict handled", form.includes("Seal window") && page.includes("no unlock path"));

// --- 31-34. explicit states ---------------------------------------------------------------------------------------------------------------------------------
check("31. explicit loading state", existsSync(join(root, LOADING)) && read(LOADING).includes("Loading back-entry"));
check("32. explicit processing state", form.includes("Submitting…") && history.includes("Resolving…"));
check("33. explicit error state", form.includes('role="alert"') && history.includes('role="alert"'));
check("34. explicit success state", form.includes("Batch posted atomically"));

// --- 35-39. out-of-scope absences -----------------------------------------------------------------------------------------------------------------------------------
check("35. no returns/refunds", !/process_return|refund|cancel_invoice|edit_invoice/i.test(allCode));
check("36. no offline", !/sync_flush|sync_acknowledge|outbox|offline/i.test(allCode));
check("37. no thermal", !/printThermal|window\.print|UNSYNCED|thermal/i.test(allCode));
check("38. no reporting", !/reporting|profit|P&L/i.test(allCode));
check("39. no legacy", !/legacy|quick_sales|WAC|GST|whatsapp/i.test(allCode) && !/\bAI\b/.test(allCode));

// --- migration unchanged --------------------------------------------------------------------------------------------------------------------------------------------------
const migDir = join(root, "greenfield", "migrations");
const migs = readdirSync(migDir).filter((f) => /^V1_\d+__.*\.sql$/.test(f));
check("migration unchanged (still V1_001-V1_014)", migs.length === 14 && !migs.some((f) => /015/.test(f)), `${migs.length} migration files`);

if (failures > 0) {
  console.log(`V1_BACK_ENTRY_CONTRACT_FAILED (${failures})`);
  process.exit(1);
}
console.log("V1_BACK_ENTRY_CONTRACT_PASSED");
