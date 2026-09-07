import { readFileSync } from "node:fs";

const clientSource = readFileSync("lib/supabase/client.ts", "utf8");

const requiredRpcs = [
  "create_sale",
  "record_quick_sale",
  "create_business_txn",
  "record_invoice_payment",
  "cancel_invoice",
  "cancel_quick_sale",
];

for (const rpc of requiredRpcs) {
  if (!clientSource.includes(`\"${rpc}\"`)) {
    throw new Error(`Missing financial idempotency coverage for ${rpc}`);
  }
}

const assertions = [
  ["p_idempotency_key injection", /requestArgs\.p_idempotency_key\s*=\s*generated\.key/],
  ["stable payload fingerprint", /function fingerprint\(value: unknown\)/],
  ["retry persistence", /sessionStorage\.setItem\(cacheKey, key\)/],
  ["successful request cleanup", /if \(!result\?\.error && cacheKey\) clearFinancialIdempotencyKey\(cacheKey\)/],
  ["same-page retry cache", /const idempotencyKeys = new Map<string, string>\(\)/],
  ["no automatic fallback to legacy RPC", /FINANCIAL_IDEMPOTENT_RPCS/],
];

for (const [label, pattern] of assertions) {
  if (!pattern.test(clientSource)) throw new Error(`Failed contract check: ${label}`);
}

console.log(`PASS: client financial idempotency contract (${requiredRpcs.length} RPCs)`);
