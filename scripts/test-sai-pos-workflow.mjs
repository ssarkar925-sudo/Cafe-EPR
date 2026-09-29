import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const capability = read("lib/sai/capabilities/pos-sales-intelligence.ts");
const planner = read("lib/sai/cognition/planner.ts");
const registryApi = read("app/api/sai/capabilities/route.ts");
const quality = read(".github/workflows/quality.yml");
const pkg = JSON.parse(read("package.json"));
let passed = 0;
let failed = 0;
const check = (condition, label) => condition
  ? (passed++, console.log(`  PASS: ${label}`))
  : (failed++, console.error(`  FAIL: ${label}`));

console.log("SAI POS read-only workflow regression checks");
check(capability.includes('id: "pos.observe_sales"'), "registers the POS sales observation capability");
check(capability.includes('.from("invoices")') && capability.includes('.from("invoice_items")') && capability.includes('.from("payments")'), "reads the authoritative invoice, item, and payment records");
check(capability.includes('select("id,invoice_number,invoice_date,total,paid,due,status,created_at,customers(name,phone)")'), "uses the verified invoice projection");
check(capability.includes("createSaiEvidence") && capability.includes("cafeerp.pos.sales_observation") && capability.includes("sourceRef"), "persists evidence with an authoritative source reference");
check(capability.includes("phoneLast4") && !capability.includes("customer.phone ??"), "limits customer phone exposure to the last four digits");
check(capability.includes("mutates: false") && capability.includes('risk: "read"') && capability.includes("verificationRequired: false"), "marks the capability explicitly read-only");
check(!/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/.test(capability), "contains no financial mutation or RPC calls");
check(!capability.includes("create_sale("), "does not execute the authoritative sale mutation");
check(capability.includes("SAI_POS_INVALID_DATE_RANGE"), "rejects invalid read date ranges");
check(capability.includes("summaryScope") && capability.includes("returned_rows"), "labels aggregates as returned-row summaries");
check(planner.includes('import "@/lib/sai/capabilities/pos-sales-intelligence"') && planner.includes('"pos.observe_sales"'), "loads and routes POS read intents");
check(registryApi.includes('import "@/lib/sai/capabilities/pos-sales-intelligence"'), "exposes capability through the authenticated registry");
check(pkg.scripts["test:sai-pos-workflow"] === "node scripts/test-sai-pos-workflow.mjs", "declares the focused POS regression test");
check(quality.includes("npm run test:sai-pos-workflow"), "runs POS regression checks in the Quality Gate");
console.log(`\n${passed} passed / ${failed} failed`);
process.exitCode = failed ? 1 : 0;
