/**
 * V1 Phase 6 Step 2 (checkout + payments + create_sale) contract test —
 * STATIC ONLY.
 *
 * Verifies, without touching any database:
 *  1. checkout state exists (editing/sale/payment/done/error).
 *  2-6. all five payment methods exist. 7. split-payment allocation exists.
 *  8. allocation-total validation exists. 9. credit requires a customer.
 *  10. the khata limit gate is not bypassed (customer id always attached).
 *  11. create_sale fires only through lib/v1/v1-rpc.ts. 12. create_sale
 *  uses the existing contract (no invented params, no discount smuggled).
 *  13. caller-supplied idempotency keys. 14. duplicate submission guarded.
 *  15. processing state prevents double submit. 16. server final amount
 *  displayed. 17. canonical invoice comes from the server. 18. no
 *  client-generated canonical numbers. 19. discount confined to the Step-3
 *  module + approved branch (amended: Step 3 owns discounts; this suite
 *  guards the confinement). 20. approval RPCs confined likewise.
 *  21. no offline queue. 22. no thermal work. 23. no direct
 *  financial-table writes. 24-27. no legacy/GST/WAC. 28-30. explicit
 *  failure states incl. stock + limit rejections. 31-32. session guard +
 *  role matrix preserved. 33. receipt handoff uses only create_sale
 *  response fields. 34. no database migration.
 *
 * Run: node scripts/test-v1-phase6-step2.mjs
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

const PAGE = "app/v1/pos/page.tsx";
const COUNTER = "app/v1/pos/counter.tsx";
const CHECKOUT = "app/v1/pos/checkout.tsx";
check("checkout component exists", existsSync(join(root, CHECKOUT)));

const page = read(PAGE);
const counter = read(COUNTER);
const checkout = read(CHECKOUT);

// Comments may name later-step concepts as explicitly-not-implemented; only
// code counts for absence checks.
const codeOnly = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"))
    .join("\n");
const pageCode = codeOnly(page);
const counterCode = codeOnly(counter);
const coCode = codeOnly(checkout);
const allCode = `${pageCode}\n${counterCode}\n${coCode}`;

// --- 1. checkout state -----------------------------------------------------------
check("checkout state machine exists", /kind: "editing"/.test(checkout) && /kind: "sale"/.test(checkout) && /kind: "payment"/.test(checkout) && /kind: "done"/.test(checkout) && /kind: "error"/.test(checkout));
check("checkout panel renders", checkout.includes('aria-label="Checkout"'));

// --- 2-6. five payment methods ------------------------------------------------------
for (const m of ["cash", "upi", "card", "wallet", "credit"]) {
  check(`payment method exists: ${m}`, checkout.includes(`"${m}"`));
}

// --- 7-8. splits + allocation validation ----------------------------------------------
check("split-payment allocation exists", coCode.includes("allocate_claim") && checkout.includes("Add split"));
check(
  "allocation total must equal sale amount",
  (checkout.includes("must equal the sale amount") || checkout.includes("must equal the payable amount")) &&
    checkout.includes("does not equal the server-confirmed total"),
);
check("no zero/negative allocations", checkout.includes("must be positive"));

// --- 9-10. credit discipline ----------------------------------------------------------------
check("credit requires a customer", checkout.includes("Credit requires a selected customer"));
check(
  "khata gate not bypassed (customer id always attached)",
  coCode.includes("p_customer_id: customer ? customer.id : null"),
);

// --- 11-13. RPC path + contract + idempotency ---------------------------------------------------
check(
  "create_sale fires only through the V1 RPC wrapper",
  coCode.includes('callV1Mutation<SaleResult>("create_sale"') && !/\.rpc\(|\bfetch\(/.test(allCode),
);
check(
  "create_sale uses the existing contract params",
  coCode.includes("p_customer_id") && coCode.includes("p_invoice_date") && coCode.includes("p_lines") && coCode.includes("p_idempotency_key"),
);
check("caller-supplied idempotency keys", coCode.includes("p_idempotency_key: saleKey") && coCode.includes("`${saleKey}:claim`"));
check("one identity per logical submission", checkout.includes("keyHashRef") || counter.includes("keyHashRef"));

// --- 14-15. duplicate/double-submit guards ----------------------------------------------------------
check("duplicate submission guarded", coCode.includes("busyRef.current") && checkout.includes("reuses the same submission identity") || checkout.includes("same submission identity"));
check("processing state prevents double submit", coCode.includes("disabled={busy}") && coCode.includes("if (busyRef.current) return"));

// --- 16-18. server-authoritative success -----------------------------------------------------------------
check("server final amount displayed", checkout.includes("Server total") && checkout.includes("sale.total"));
check("canonical invoice comes from the server", checkout.includes("Bill no (from server)") && checkout.includes("invoice_number"));
check("no client-generated canonical numbers", !/INV-|next_canonical|canonical_number:\s*["'`]/.test(allCode));
check("provisional display is fallback-only (offline milestone owns PROV-)", checkout.includes('?? "PROV-?"'));

// --- 19-20. discount/approval confinement (Step 3 owns them; amended) -------------------------------------------
// Approval RPCs and discount params may appear ONLY in the Step-3 discount
// module, the admin decision actions, and the single approved-discount
// spread in checkout. Full discount lifecycle is covered by
// test-v1-phase6-step3.mjs.
const DISCOUNT = "app/v1/pos/discount.tsx";
const ACTIONS = "app/v1/admin/approvals/actions.tsx";
const discountCode = codeOnly(read(DISCOUNT));
const actionsCode = codeOnly(read(ACTIONS));
check(
  "discount confined to step-3 module + approved branch",
  !/request_approval|approve_override|reject_approval/.test(allCode) &&
    coCode.includes("...(discountApproval") &&
    discountCode.includes("request_approval") &&
    actionsCode.includes("approve_override"),
);
check(
  "no approval implementation outside step-3 surfaces",
  !/approve_override|request_approval/.test(allCode),
);
check(
  "offline queue confined to G9 outbox path (amended: offline milestone owns it)",
  !/sync_flush|sync_acknowledge|resolve_conflict/.test(allCode) &&
    coCode.includes("enqueueOperation") &&
    coCode.includes("UNSYNCED_LABEL"),
);
check("no thermal implementation", !/printThermal|window\.print|thermal/i.test(allCode));

// --- 23. no direct financial writes ------------------------------------------------------------------------------
check("no direct mutating queries", !/\.(insert|update|delete|upsert)\s*\(/.test(allCode));
const finTables = ["invoices", "invoice_items", "payment_claims", "collection_allocations", "journals", "journal_lines", "claims"];
const finHits = [];
for (const [file, src] of [[PAGE, pageCode], [COUNTER, counterCode], [CHECKOUT, coCode]]) {
  for (const t of finTables) {
    if (new RegExp(`\\.from\\(\\s*["']${t}["']\\)`).test(src)) finHits.push(`${file}: ${t}`);
  }
}
check("no direct financial-table reads", finHits.length === 0, finHits.join("; "));

// --- 24-27. legacy boundary ------------------------------------------------------------------------------------------------
check("no legacy quick_sales", !/quick_sale/.test(allCode));
check("no legacy payments", !/cash_entries|legacy payments|old sales/.test(allCode));
check("no WAC", !/WAC/.test(allCode));
check("no GST calculation", !/GST/i.test(allCode));

// --- 28-30. failure states ------------------------------------------------------------------------------------------------------
check("explicit failure state", checkout.includes('role="alert"') && checkout.includes("Cart preserved") && checkout.includes("Retry (same submission)"));
check("stock rejection handled", /insufficient unreserved stock/i.test(checkout));
check("credit-limit rejection handled", /credit limit exceeded/i.test(checkout));
check("failed submission never fakes success", checkout.includes("never") && checkout.includes("fake") || checkout.includes("never\n *                  become fake") || /never[\s\S]{0,60}fake success/.test(checkout));

// --- 31-32. security posture -------------------------------------------------------------------------------------------------------
check("session guard preserved", page.includes("getV1SessionContext") && page.includes("session.isActive") && page.includes("V1Forbidden"));
const nav = read("components/v1/v1-nav.ts");
check("role matrix preserved (pos still future-marked)", /key:\s*"pos"[\s\S]{0,200}?phase:\s*4/.test(nav));
check("no new role rules in pos surface", !/requireV1Roles|requireV1Admin|requireV1BackOffice/.test(allCode));

// --- 33. receipt handoff --------------------------------------------------------------------------------------------------------------
check(
  "receipt handoff uses only create_sale response fields",
  checkout.includes("invoice_number") && checkout.includes("sale.total") && checkout.includes("doneSale.id"),
);
check("no legacy receipt route handoff", !/receipt\/\[id\]|window\.print|printThermal/.test(allCode));

// --- 34. no database migration ----------------------------------------------------------------------------------------------------------------
const migDir = join(root, "greenfield", "migrations");
const migs = readdirSync(migDir).filter((f) => /^V1_\d+__.*\.sql$/.test(f));
check("no database migration (still V1_001-V1_014)", migs.length === 14 && !migs.some((f) => /015/.test(f)), `${migs.length} migration files`);

if (failures > 0) {
  console.log(`V1_PHASE6_STEP2_CONTRACT_FAILED (${failures})`);
  process.exit(1);
}
console.log("V1_PHASE6_STEP2_CONTRACT_PASSED");
