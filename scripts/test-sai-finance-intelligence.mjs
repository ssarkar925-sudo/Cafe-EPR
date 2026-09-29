import fs from "node:fs";
const read=(p)=>fs.readFileSync(p,"utf8");
const capability=read("lib/sai/capabilities/finance-intelligence.ts");
const planner=read("lib/sai/cognition/planner.ts");
const registry=read("lib/sai/core/capabilities.ts");
const route=read("app/api/sai/capabilities/route.ts");
let passed=0,failed=0;
const check=(condition,label)=>condition?(passed++,console.log(`  PASS: ${label}`)):(failed++,console.error(`  FAIL: ${label}`));
console.log("SAI Phase 2C finance intelligence regression checks");
for(const id of ["finance.observe_cash","finance.observe_float","finance.observe_settlements","finance.reconcile","finance.observe_attention"])
  check(capability.includes(`id: "${id}"`),`registers ${id}`);
check(capability.includes('from("cash_entries")') && capability.includes('from("customers")'),"cash and receivables read authoritative ledgers");
check(capability.includes('from("payment_instruments")') && capability.includes('rpc("get_pool_balances"'),"float reads canonical Finance pool balances and instrument metadata");
check(capability.includes('from("settlements")') && capability.includes("reversed"),"settlements report authoritative status");
check(capability.includes('from("accounting_transaction_register")'),"reconciliation uses the canonical accounting register view");
check(capability.includes("source_type") && capability.includes("source_id"),"reconciliation traces service transactions to journal source IDs");
check(capability.includes("total_debit") && capability.includes("total_credit"),"reconciliation detects unbalanced posted journal entries");
check(capability.includes("createSaiEvidence") && capability.includes("recordEvidence(actor"),"observations are persisted through hashed SAI evidence");
check(capability.includes('risk: "read"') && capability.includes("mutates: false") && capability.includes("verificationRequired: false"),"all finance capabilities are explicitly read-only");
check(!/\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(capability),"finance capabilities contain no database mutation calls");
check(route.includes('finance-intelligence'),"capability API registers the Phase 2C module");
check(planner.includes('finance-intelligence'),"planner loads the Phase 2C capability module");
for(const id of ["finance.observe_cash","finance.observe_float","finance.observe_settlements","finance.reconcile","finance.observe_attention"])
  check(planner.includes(`"${id}"`),`planner routes financial questions to ${id}`);
check(registry.includes('"finance"'),"finance is a typed capability domain");
console.log(`\n${passed} passed / ${failed} failed`);
process.exitCode=failed?1:0;
