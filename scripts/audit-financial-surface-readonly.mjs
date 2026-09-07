import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const protectedTables = [
  "transactions",
  "invoices",
  "invoice_items",
  "quick_sales",
  "quick_sale_items",
  "payments",
  "cash_entries",
  "customer_ledger",
  "stock_movements",
  "journal_entries",
  "journal_lines",
  "settlements",
];

const sensitiveFunctions = [
  "create_dmt_business_txn",
  "create_dmt_business_txn_multi_collection",
  "edit_bill_payment",
  "update_recharge",
];

const { data: tableGrants, error: grantsError } = await supabase
  .from("information_schema.role_table_grants")
  .select("grantee, table_name, privilege_type")
  .in("grantee", ["anon", "authenticated"])
  .in("table_name", protectedTables);

if (grantsError) {
  console.error(`Failed to inspect table grants: ${grantsError.message}`);
  process.exit(1);
}

const writable = (tableGrants ?? []).filter((row) =>
  ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"].includes(row.privilege_type),
);

const { data: rpcGrants, error: rpcError } = await supabase.rpc("get_function_grants_audit");

if (rpcError) {
  console.warn(`Function grant helper unavailable: ${rpcError.message}`);
}

const findings = {
  protectedTables,
  writableClientGrants: writable,
  sensitiveFunctions,
  functionGrantAudit: rpcGrants ?? null,
  approvedMigration: null,
};

const migrationPath = "supabase/migrations/20260907_01_controlled_financial_remediation.sql";
if (existsSync(migrationPath)) {
  const bytes = readFileSync(migrationPath);
  findings.approvedMigration = {
    path: migrationPath,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

console.log(JSON.stringify(findings, null, 2));

if (writable.length > 0) {
  console.error("FAIL: one or more protected financial tables grant client write privileges.");
  process.exit(1);
}

console.log("PASS: protected financial tables expose no client write privileges.");
