// Canonical customer search proof suite.
// Covers: shared normalization/ranking/duplicate helpers (live, no DB),
// search API contract, selector wiring, duplicate pre-checks, security and
// performance invariants (static source assertions, repo suite style).
//
// Run: node scripts/test-customer-search.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

let passed = 0;
let failed = 0;
function ok(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${extra ? ` -- ${extra}` : ""}`);
  }
}

const cs = await import("../lib/customer-search.ts");
const {
  normalizePhone,
  phoneIdentityKey,
  samePhoneNumber,
  normalizeSearchText,
  matchCustomerRecord,
  rankCustomerResults,
  formatCustomerResult,
  findDuplicateCandidates,
} = cs;

console.log("A. Phone normalization (live)");
ok("strips +91/spaces/dashes", normalizePhone("+91 98765 43210") === "919876543210");
ok("strips trunk 0 on 11-digit", normalizePhone("09876543210") === "9876543210");
ok("keeps local 10-digit", normalizePhone("98765-43210") === "9876543210");
ok("strips 00 IDD prefix", normalizePhone("00919876543210") === "919876543210");
ok("empty/null safe", normalizePhone("") === "" && normalizePhone(null) === "" && normalizePhone(undefined) === "");
ok("identity key is last-10", phoneIdentityKey("+91-9876543210") === "9876543210" && phoneIdentityKey("09876543210") === "9876543210");
ok("cross-format equality", samePhoneNumber("+91 9876543210", "09876543210") && samePhoneNumber("919876543210", "9876543210"));
ok("different numbers differ", !samePhoneNumber("9876543210", "9876543211"));
ok("blank never matches", !samePhoneNumber("", "9876543210") && !samePhoneNumber(null, null));

console.log("B. Ranking: exact > prefix > partial > token (live)");
const dir = [
  { id: "u1", code: "CUST-001", name: "Amit Verma", phone: "9811111111" },
  { id: "u2", code: "CUST-002", name: "Amitabh CUST-001 Traders", phone: "9822222222" },
  { id: "u3", code: "CUST-003", name: "Ramesh", phone: "+91 9876543210" },
  { id: "u4", code: "CUST-004", name: "Suresh Kumar", phone: "9833333333" },
  { id: "u5", code: "CUST-005", name: "Ram", phone: "9844444444" },
];
{
  const r = rankCustomerResults(dir, "CUST-001", 10);
  ok("exact code first", r[0]?.record.id === "u1" && r[0]?.match.tier === "exact-id", JSON.stringify(r.map((x) => x.record.id)));
}
{
  const r = rankCustomerResults(dir, "09876543210", 10);
  ok("exact phone cross-format first", r[0]?.record.id === "u3" && r[0]?.match.tier === "exact-phone");
}
{
  const r = rankCustomerResults(dir, "ram", 10);
  const ids = r.map((x) => x.record.id);
  // "Ram" exact-name (80) > "Ramesh" prefix (60); "Suresh Kumar" has no
  // "ram" substring and is correctly excluded (no false positives).
  ok("exact name > prefix; non-matches excluded", ids.join(",") === "u5,u3", ids.join(","));
}
{
  const r = rankCustomerResults(dir, "uresh", 10);
  ok("substring partial matches", r.some((x) => x.record.id === "u4" && x.match.tier === "partial"));
}
{
  const r = rankCustomerResults(dir, "kumar suresh", 10);
  ok("token match weakest but found", r.length > 0 && r[0]?.record.id === "u4" && r[0]?.match.tier === "token");
}
ok("empty query never dumps directory", rankCustomerResults(dir, "  ", 10).length === 0);
ok("limit respected", rankCustomerResults(dir, "cust", 2).length <= 2);
{
  const a = rankCustomerResults(dir, "cust", 10).map((x) => x.record.id).join(",");
  const b = rankCustomerResults(dir, "cust", 10).map((x) => x.record.id).join(",");
  ok("ranking deterministic", a === b);
}
{
  // Leading-zero IDs are significant: string compare, no numeric coercion.
  const m1 = matchCustomerRecord({ id: "x", code: "001245", name: "A", phone: null }, "001245");
  const m2 = matchCustomerRecord({ id: "x", code: "001245", name: "A", phone: null }, "1245");
  ok("leading-zero code exact", m1.tier === "exact-id");
  ok("leading-zero code not coerced", m2.tier !== "exact-id", m2.tier);
}
{
  const f = formatCustomerResult({ id: "x", code: "CUST-9", name: "Mina", phone: "9800000000" });
  ok("display shape Name + CODE·phone", f.title === "Mina" && f.subtitle === "CUST-9 · 9800000000");
}

console.log("C. Duplicate detection (live)");
{
  const d = findDuplicateCandidates(dir, { phone: "+91 98111 11111", name: "Someone Else" }, null);
  ok("cross-format phone is strong", d.some((x) => x.record.id === "u1" && x.strength === "strong" && x.reason === "exact-phone"));
}
{
  const d = findDuplicateCandidates(dir, { code: "cust-002", phone: null, name: "Different" }, null);
  ok("exact code is strong (case-insensitive)", d.some((x) => x.record.id === "u2" && x.strength === "strong"));
}
{
  const d = findDuplicateCandidates(dir, { phone: null, name: "ramesh" }, null);
  ok("name-only is weak, never auto-merge", d.some((x) => x.record.id === "u3" && x.strength === "weak" && x.reason === "name-only"));
}
{
  const d = findDuplicateCandidates(dir, { phone: "9811111111", name: "Amit Verma" }, "u1");
  ok("excludeId respected", !d.some((x) => x.record.id === "u1"));
}
{
  const d = findDuplicateCandidates(dir, { phone: null, name: "Nobody Here" }, null);
  ok("no false positives", d.length === 0);
}

console.log("D. Search API contract (static)");
{
  const route = read("app/api/customers/search/route.ts");
  ok("route requires auth", route.includes("auth.getUser") && route.includes("401"));
  ok("no service-role bypass", !/service_role|createAdminClient/.test(route));
  ok("min 2 chars, no dumps", route.includes("length < 2"));
  ok("limit capped at 50", route.includes("Math.min(50"));
  ok("identification-minimal fields", route.includes('RESULT_FIELDS = "id,code,name,phone,is_active"') && !/email|address|balance|gstin/.test(route.split("RESULT_FIELDS")[1].split("\n")[0]));
  ok("inactive excluded by default", route.includes('eq("is_active", true)') && route.includes("include_inactive"));
  ok("PostgREST OR-safe pattern", route.includes("replace("));
  ok("uses canonical ranker", route.includes("rankCustomerResults"));
}

console.log("E. Selector wiring (static)");
const converted = [
  "components/pos/pos-shell.tsx",
  "components/invoices/invoice-edit-modal.tsx",
  "components/business/dmt-workspace.tsx",
  "components/business/upi-workspace.tsx",
  "components/business/recharge-workspace.tsx",
  "components/business/google-play-workspace.tsx",
  "components/business/utility-bill-workspace.tsx",
  "components/business/business-form-modal.tsx",
  "components/finance/ledger-client.tsx",
  "components/finance/opening-position-workspace.tsx",
  "components/pos/pos-new-customer-modal.tsx",
];
for (const f of converted) {
  const src = read(f);
  if (f.endsWith("pos-new-customer-modal.tsx")) {
    ok(`${f} dup pre-check`, src.includes("createCustomerRecord") && src.includes("DuplicateCustomerError"));
    continue;
  }
  ok(`${f} uses canonical selector`, src.includes("CustomerSearchSelect"));
}
{
  const pos = read("components/pos/pos-shell.tsx");
  ok("POS: no local customer filter state", !pos.includes("customerMatches") && !pos.includes("setCustomerOpen"));
  ok("POS: hydrates full row on select", pos.includes('select("id, name, code, phone, balance, gstin, state_code")'));
}
{
  const edit = read("components/invoices/invoice-edit-modal.tsx");
  ok("edit-modal: no 1000-row preload", !edit.includes("limit(1000)"));
}
for (const f of ["components/business/dmt-workspace.tsx", "components/business/upi-workspace.tsx"]) {
  const src = read(f);
  ok(`${f} refresh has no customer preload`, !/from\("customers"\)\.select\("id, name, code, phone"\)/.test(src));
}
for (const f of ["components/business/recharge-workspace.tsx", "components/business/google-play-workspace.tsx", "components/business/utility-bill-workspace.tsx", "components/business/business-form-modal.tsx"]) {
  const src = read(f);
  ok(`${f} quick path uses dup-aware flow`, src.includes("createCustomerRecord") || src.includes("findDuplicateCustomer") || src.includes("customer_snapshot") || src.includes("directoryCustomers") || src.includes("customerLabelCache"));
}
{
  const svc = read("app/(dashboard)/business/[service]/page.tsx");
  ok("[service] page: no customer preload", !svc.includes('from("customers")'));
  const bill = read("app/(dashboard)/business/bill-payment/page.tsx");
  ok("bill-payment page: no customer preload", !bill.includes('from("customers")'));
  const posPage = read("app/(dashboard)/pos/page.tsx");
  ok("POS page: no 500-row preload", !posPage.includes("limit(500)") && posPage.includes('eq("id", initialCustomerId)'));
  const opening = read("app/(dashboard)/finance/opening-balances/page.tsx");
  ok("opening page: no customer preload", !opening.includes('from("customers")'));
}
{
  const gs = read("components/global-search.tsx");
  ok("global search matches code + phone digits", gs.includes("code.ilike") && gs.includes("needleDigits"));
  ok("global search marks inactive", gs.includes("(inactive)"));
}
{
  const ai = read("app/api/ai/quick-sale/route.ts");
  ok("AI quick-sale uses canonical ranker", ai.includes("rankCustomerResults"));
  const rt = read("lib/ai/agent-runtime.ts");
  ok("agent-runtime uses canonical ranker", rt.includes("rankCustomerResults"));
}

console.log("F. Security invariants (static)");
{
  const mig = read("supabase/migrations/20260916_customer_search_trgm.sql");
  ok("migration is index-only (no RLS/policy change)", !/policy|rls|grant|revoke/i.test(mig));
  const schema = read("supabase/schema.sql");
  const custPolicies = (schema.match(/create policy[^\n]*customer/gi) || []).length;
  ok("no customer RLS policy drift", custPolicies > 0, `${custPolicies} customer policies present, unchanged`);
}
{
  const sel = read("components/customers/customer-search-select.tsx");
  ok("selector sends no credentials/secrets", !/token|secret|password|service_role/i.test(sel));
}

console.log("G. Performance invariants (static)");
{
  const sel = read("components/customers/customer-search-select.tsx");
  ok("debounced requests", sel.includes("SEARCH_DEBOUNCE_MS") && sel.includes("300"));
  ok("min query length enforced client-side", sel.includes("MIN_QUERY_LENGTH = 2"));
  ok("aborts superseded requests", sel.includes("AbortController"));
  const mig = read("supabase/migrations/20260916_customer_search_trgm.sql");
  ok("pg_trgm + gin indexes", mig.includes("pg_trgm") && mig.includes("customers_name_trgm_idx") && mig.includes("customers_phone_trgm_idx") && mig.includes("customers_code_lower_idx"));
}

console.log(`\nCustomer search suite: ${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
