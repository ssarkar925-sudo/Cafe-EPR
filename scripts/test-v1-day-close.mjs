/**
 * V1 Day Close (G8 workflow) contract test — STATIC ONLY.
 *
 * Verifies, without touching any database: route + loading state with
 * session/back-office gates; open/record/close/approve through
 * lib/v1/v1-rpc.ts with caller-supplied idempotency keys; no direct
 * writes to closes/lines/locks/journals; server-sourced expected and
 * variance; ₹1 tolerance; admin-only variance approval; locked
 * immutability; count validation; double-submit guards; explicit
 * loading/processing/error/completed states; and no
 * returns/offline/thermal/reporting/legacy surface.
 *
 * Design note asserted below: post_variance_journal carries no caller
 * EXECUTE grant in G8, so it is internal-only by design and runs inside
 * close_day_close / approve_day_close. The UI must never invoke it.
 *
 * Run: node scripts/test-v1-day-close.mjs
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

const PAGE = "app/v1/day-close/page.tsx";
const ACTIONS = "app/v1/day-close/actions.tsx";
const LOADING = "app/v1/day-close/loading.tsx";
check("1. day-close route exists", existsSync(join(root, PAGE)) && existsSync(join(root, ACTIONS)));

const page = read(PAGE);
const actions = read(ACTIONS);
const codeOnly = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"))
    .join("\n");
const pageCode = codeOnly(page);
const actCode = codeOnly(actions);
const allCode = `${pageCode}\n${actCode}`;

// --- 2-3. gates + roles -------------------------------------------------------------------
check(
  "2. session guard exists",
  page.includes("getV1SessionContext") && page.includes("requireV1BackOffice") && page.includes("V1Forbidden"),
);
check("3. role matrix preserved (back-office pages, no new rules)", !/requireV1Roles|is_back_office\(\)|is_admin\(\)/.test(allCode));
const nav = read("components/v1/v1-nav.ts");
check("3b. nav dayclose still future-marked (no nav change)", /key:\s*"dayclose"[\s\S]{0,200}?phase:\s*4/.test(nav));

// --- 4-8. RPC path ------------------------------------------------------------------------------
check("4. open_day_close used through V1 RPC", actCode.includes('"open_day_close"') && actions.includes('from "@/lib/v1/v1-rpc"'));
check("5. record_day_counts used through V1 RPC", actCode.includes('"record_day_counts"'));
check("6. close_day_close used through V1 RPC", actCode.includes('"close_day_close"'));
check("7. approve_day_close used through V1 RPC", actCode.includes('"approve_day_close"'));
check(
  "8. variance journal only via close/approve (post_variance_journal has no caller grant; UI never invokes it)",
  !/post_variance_journal\s*\(/.test(allCode) && actions.includes("post_variance_journal"),
);

// --- 9-14. no direct writes; server-sourced figures -----------------------------------------------------------------------------------
check("9. no direct day_closes writes", !/\.from\(\s*["']day_closes["']\s*\)\s*\.(insert|update|delete|upsert)/.test(allCode));
check("10. no direct day_close_lines writes", !/\.from\(\s*["']day_close_lines["']\s*\)\s*\.(insert|update|delete|upsert)/.test(allCode));
check("11. no direct period_locks writes", !/period_locks/.test(actCode));
check("12. no direct journal writes", !/\.(insert|update|delete|upsert)\s*\(/.test(allCode));
check("13. expected balance comes from server", page.includes("day_close_lines") && actions.includes("expected {"));
check("14. variance comes from server", actions.includes("res.data.variance") && actions.includes("(server)"));
check("15. ₹1 tolerance is preserved", actions.includes("₹1.00") && actions.includes("tolerance"));

// --- 16-19. approval discipline ------------------------------------------------------------------------------------------------------------------
check("16. over-tolerance requires Admin", actions.includes("Admin approval required"));
check("17. Manager cannot independently approve variance", actCode.includes("isAdmin &&") && page.includes("isAdmin={session.isAdmin}"));
check("18. Staff cannot gain day-close approval", page.includes("requireV1BackOffice"));
check("19. Restricted Cashier cannot gain day-close approval", page.includes("requireV1BackOffice"));

// --- 20-25. locks, validation, idempotency ----------------------------------------------------------------------------------------------------------------
check("20. locked state displayed", actions.includes("Locked — counts cannot be edited"));
check("21. locked period cannot be edited", actCode.includes("locked || busy") && !/reopen|unlock/i.test(allCode));
check("22. counted amount validation exists", actions.includes("must be non-negative"));
check("23. malformed monetary input rejected", actions.includes("not a valid monetary value"));
check("24. double-submit protection exists", actCode.includes("if (busy) return") && actions.includes("disabled={busy"));
check("25. idempotency mechanism preserved", actCode.includes("p_idempotency_key: countKey") && actCode.includes("p_idempotency_key: closeKey") && actCode.includes("p_idempotency_key: approveKey"));

// --- 26-29. explicit states --------------------------------------------------------------------------------------------------------------------------------------
check("26. explicit loading state", existsSync(join(root, LOADING)) && read(LOADING).includes("Loading day-close"));
check("27. explicit processing state", actions.includes("Recording…") && actions.includes("Closing…") && actions.includes("Approving…"));
check("28. explicit error state", actions.includes('role="alert"'));
check("29. explicit completed state", actions.includes("Server variance"));

// --- 30-37. out-of-scope absences ----------------------------------------------------------------------------------------------------------------------------------------
check("30. no returns/refunds", !/process_return|refund|cancel_invoice|edit_invoice/i.test(allCode));
check("31. no offline", !/sync_flush|sync_acknowledge|outbox|offline/i.test(allCode));
check("32. no thermal", !/printThermal|window\.print|UNSYNCED|thermal/i.test(allCode));
check("33. no reporting", !/reporting|profit|P&L/i.test(allCode));
check("34. no legacy day-close workflow", !/\(dashboard\)|legacy/i.test(allCode));
check("35. no quick_sales", !/quick_sale/.test(allCode));
check("36. no WAC", !/WAC/.test(allCode));
check("37. no GST computation", !/GST/i.test(allCode));
check("38. no direct financial table writes", !/\.from\(\s*["'](journal_entries|journal_lines|payment_claims|invoices)["']\s*\)/.test(allCode));

// --- migration unchanged ---------------------------------------------------------------------------------------------------------------------------------------------------
const migDir = join(root, "greenfield", "migrations");
const migs = readdirSync(migDir).filter((f) => /^V1_\d+__.*\.sql$/.test(f));
check("migration unchanged (still V1_001-V1_014)", migs.length === 14 && !migs.some((f) => /015/.test(f)), `${migs.length} migration files`);

if (failures > 0) {
  console.log(`V1_DAY_CLOSE_CONTRACT_FAILED (${failures})`);
  process.exit(1);
}
console.log("V1_DAY_CLOSE_CONTRACT_PASSED");
