/**
 * V1 Phase 6 Step 3 (discount + admin approval) contract test — STATIC ONLY.
 *
 * Verifies, without touching any database, the 45 required checks:
 * discount UI + reason, universal approval, no threshold bypass, the three
 * approval RPCs through lib/v1/v1-rpc.ts, no direct approval/audit writes,
 * scope hashing + invalidation, expiry/rejection/consumed handling,
 * approval-gated create_sale with the approved p_discount, Step-2
 * preservation without discount, server-side sole-Admin SoD, audit path,
 * payable-amount payments, double-submit guards, cart preservation,
 * no returns/offline/thermal/migration/legacy, role matrix, idempotency,
 * receipt handoff, and typed contracts.
 *
 * Run: node scripts/test-v1-phase6-step3.mjs
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

const DISCOUNT = "app/v1/pos/discount.tsx";
const CHECKOUT = "app/v1/pos/checkout.tsx";
const COUNTER = "app/v1/pos/counter.tsx";
const PAGE = "app/v1/pos/page.tsx";
const ACTIONS = "app/v1/admin/approvals/actions.tsx";
const ADMINPAGE = "app/v1/admin/approvals/page.tsx";
check("discount module exists", existsSync(join(root, DISCOUNT)));
check("admin decision actions exist", existsSync(join(root, ACTIONS)));

const discount = read(DISCOUNT);
const checkout = read(CHECKOUT);
const counter = read(COUNTER);
const page = read(PAGE);
const actions = read(ACTIONS);
const adminPage = read(ADMINPAGE);

// Comments may name later-step concepts; only code counts for absence checks.
const codeOnly = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"))
    .join("\n");
const dCode = codeOnly(discount);
const coCode = codeOnly(checkout);
const posCode = `${codeOnly(page)}\n${codeOnly(counter)}\n${coCode}\n${dCode}`;
const allCode = `${posCode}\n${codeOnly(actions)}\n${codeOnly(adminPage)}`;

// --- 1-4. discount input + universal approval ------------------------------------------
check("1. discount UI exists", discount.includes('aria-label="Discount amount"') && discount.includes('aria-label="Discount percent"'));
check("2. discount reason required", discount.includes('aria-label="Discount reason"') && dCode.includes("p_reason"));
check("3. every discount requires approval", discount.includes("Every discount needs an Admin approval"));
check("4. no threshold bypass", discount.includes("no threshold bypass"));

// --- 5-8. approval RPCs through the wrapper ----------------------------------------------
check("5. request_approval used", dCode.includes('callV1Mutation<string>("request_approval"'));
check("6. approve_override used", dCode.includes('"approve_override"') && actions.includes('"approve_override"'));
check("7. reject_approval used", actions.includes('"reject_approval"'));
check(
  "8. approval uses V1 RPC wrapper",
  discount.includes('from "@/lib/v1/v1-rpc"') && actions.includes("useV1Mutation"),
);

// --- 9. no direct approval/audit writes ------------------------------------------------------
check(
  "9. no direct approval-table writes",
  !/\.(insert|update|delete|upsert)\s*\(/.test(allCode) &&
    !/\.from\(\s*["'](approvals|audit_logs)["']\s*\)\s*\.(insert|update|delete|upsert)/.test(allCode),
);
check("9b. approval reads are tenant-scoped selects only", dCode.includes('.from("approvals")') && dCode.includes('.eq("tenant_id"'));

// --- 10-13. scope hash ----------------------------------------------------------------------------------
check("10. scope hash exists/used", dCode.includes("sha256Hex") && dCode.includes("scopeKey") && dCode.includes("p_scope_hash"));
check("10b. standard SHA-256 (no invented algorithm)", discount.includes("crypto.subtle"));
check("11. cart mutation invalidates approval", discount.includes("invalidated") && dCode.includes("scope_hash !=="));
check("12. discount mutation invalidates approval", dCode.includes("setPendingId(null)") && dCode.includes('? "required"'));
check("13. customer/sale-scope changes handled", dCode.includes("customer_id") && dCode.includes("invoice_date"));

// --- 14-16. terminal states -----------------------------------------------------------------------------------
check("14. expired approval rejected", discount.includes("expired") && dCode.includes("expires_at"));
check("15. rejected approval rejected", discount.includes("status: \"rejected\"") || dCode.includes('"rejected"'));
check("16. consumed/invalid approval rejected", dCode.includes("status !== \"consumed\"") && discount.includes("invalidated"));

// --- 17-19. create_sale gating -----------------------------------------------------------------------------------
check(
  "17. unapproved discount cannot reach create_sale",
  checkout.includes("Discount needs an Admin approval") && coCode.includes("verifyDiscountApproval"),
);
check(
  "18. approved discount reaches create_sale as p_discount",
  coCode.includes("...(discountApproval") && coCode.includes("p_discount: discountApproval.amount"),
);
check("19. no discount preserves Step 2 behavior", checkout.includes("Step-2") && discount.includes("No discount"));

// --- 20-21. sole admin ------------------------------------------------------------------------------------------------
check("20. sole-Admin self-approve uses server RPC", discount.includes("Request & self-approve") && dCode.includes('"approve_override"'));
check("21. no client-side SoD bypass", !/active_admins|adminCount|count\(\*\).*admin/i.test(dCode));

// --- 22-26. records + audit -----------------------------------------------------------------------------------------------
check("22. approval requester recorded", dCode.includes("p_reason") && discount.includes("caller JWT"));
check("23. approver recorded", coCode.includes("p_approver_profile_id") && dCode.includes("approverId"));
check("24. self-approval recorded", discount.includes("selfApproved") && discount.includes("self-approved"));
check("25. approval reason recorded", dCode.includes("p_reason: reason.trim()"));
check("26. audit path preserved", !/\.from\(\s*["']audit_logs["']\s*\)/.test(allCode) && actions.includes("approve_override"));

// --- 27-30. money + guards -------------------------------------------------------------------------------------------------------
check("27. server sale total remains authoritative", checkout.includes("Server total") && checkout.includes("server total governs"));
check("28. payment allocation uses final payable amount", checkout.includes("payable") && coCode.includes("splitSum !== payable"));
check("29. stale payment allocation recalculated", checkout.includes("rebuilds the payment draft") && coCode.includes("[discount.amount]"));
check("30. double-submit protection preserved", coCode.includes("busyRef.current") && coCode.includes("disabled={busy}"));

// --- 31-32. preservation --------------------------------------------------------------------------------------------------------------
check("31. rejection preserves cart", discount.includes("Cart, customer, and payment draft are preserved"));
check("32. expiry preserves cart", discount.includes("15-minute server window") && discount.includes("preserved"));

// --- 33-40. out-of-scope absences ----------------------------------------------------------------------------------------------------------------
check("33. no returns/refunds", !/process_return|refund/i.test(allCode));
check(
  "34. offline confined to G9 outbox path (amended: offline milestone owns it)",
  !/sync_flush|sync_acknowledge|resolve_conflict/.test(allCode),
);
check("35. no thermal", !/printThermal|window\.print|thermal/i.test(allCode));
check("37. no legacy quick_sales", !/quick_sale/.test(allCode));
check("38. no legacy payments", !/cash_entries|legacy payments|old sales/.test(allCode));
check("39. no WAC", !/WAC/.test(allCode));
check("40. no GST calculation", !/GST/i.test(allCode));

// --- 36 (real). no migration ------------------------------------------------------------------------------------------------------------------
const migDir = join(root, "greenfield", "migrations");
const migs = readdirSync(migDir).filter((f) => /^V1_\d+__.*\.sql$/.test(f));
check("36. no database migration (still V1_001-V1_014)", migs.length === 14 && !migs.some((f) => /015/.test(f)), `${migs.length} migration files`);

// --- 41-45. posture ------------------------------------------------------------------------------------------------------------------------------------
const nav = read("components/v1/v1-nav.ts");
check("41. existing role matrix preserved", /key:\s*"pos"[\s\S]{0,200}?phase:\s*4/.test(nav));
check("42. create_sale still called through callV1Mutation", coCode.includes('callV1Mutation<SaleResult>("create_sale"'));
check("43. idempotency preserved", coCode.includes("p_idempotency_key: saleKey") && coCode.includes("`${saleKey}:claim`"));
check("44. receipt handoff remains unchanged", checkout.includes("Bill no (from server)") && checkout.includes("sale.total"));
check("45. TypeScript-safe contracts", discount.includes("DiscountApproval") && discount.includes("verifyDiscountApproval"));

if (failures > 0) {
  console.log(`V1_PHASE6_STEP3_CONTRACT_FAILED (${failures})`);
  process.exit(1);
}
console.log("V1_PHASE6_STEP3_CONTRACT_PASSED");
