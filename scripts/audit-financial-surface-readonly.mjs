import pg from "pg";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!databaseUrl) {
  console.error("Missing DATABASE_URL (or SUPABASE_DB_URL). This audit is read-only and requires direct PostgreSQL connectivity.");
  process.exit(2);
}

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

const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();

  const tables = await client.query(
    `
      SELECT grantee, table_name, privilege_type
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND grantee IN ('anon', 'authenticated')
        AND table_name = ANY($1::text[])
      ORDER BY table_name, grantee, privilege_type
    `,
    [protectedTables],
  );

  const writableClientGrants = tables.rows.filter((row) =>
    ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"].includes(row.privilege_type),
  );

  const functions = await client.query(
    `
      SELECT
        p.oid::regprocedure::text AS signature,
        p.proname,
        p.prosecdef AS security_definer,
        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = ANY($1::text[])
      ORDER BY p.proname, p.oid::regprocedure::text
    `,
    [sensitiveFunctions],
  );

  const anonymousExecutableSensitive = functions.rows.filter((row) => row.anon_execute);

  const findings = {
    captured_at: new Date().toISOString(),
    protectedTables,
    writableClientGrants,
    sensitiveFunctionGrants: functions.rows,
    anonymousExecutableSensitive,
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

  if (writableClientGrants.length > 0) {
    console.error("FAIL: one or more protected financial tables grant client write privileges.");
    process.exitCode = 1;
  }

  if (anonymousExecutableSensitive.length > 0) {
    console.error("FAIL: one or more sensitive financial RPC overloads are executable by anon.");
    process.exitCode = 1;
  }

  if (writableClientGrants.length === 0 && anonymousExecutableSensitive.length === 0) {
    console.log("PASS: financial mutation surface is locked at the database privilege boundary.");
  }
} catch (error) {
  console.error(`Financial surface audit failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
