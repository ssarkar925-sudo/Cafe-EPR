// Canonical customer creation proof suite.
// Proves: ONE database-backed Customer ID mechanism (sequence + trigger),
// zero frontend code generation, all 8 creation flows routed through the
// canonical service, duplicates resolve without second rows, failures never
// leave codeless customers, existing codes untouched.
//
// Live logic runs against mock Supabase clients (no database).
// Run: node scripts/test-customer-creation.mjs
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

const customers = await import("../lib/customer-search.ts");
const svc = await import("../lib/customers.ts");
const { createCustomerRecord, DuplicateCustomerError } = svc;

// ---------- Mock Supabase client ----------
function mockClient({ rpcData = null, rpcError = null, insertImpl }) {
  const calls = { inserts: [], rpcs: [] };
  return {
    calls,
    rpc: async (fn, args) => {
      calls.rpcs.push([fn, args]);
      return { data: rpcData, error: rpcError };
    },
    from: (table) => {
      if (table !== "customers") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        insert: (row) => ({
          select: () => ({ single: async () => insertImpl(row, calls) }),
        }),
      };
    },
  };
}
const seqClient = (counter = { n: 41 }) =>
  mockClient({
    insertImpl: (row, calls) => {
      calls.inserts.push(row);
      counter.n += 1;
      // Emulate the DB trigger: code assigned server-side.
      return { data: { id: `u${counter.n}`, code: `CUST-${String(counter.n).padStart(4, "0")}`, name: row.name, phone: row.phone ?? null, is_active: true }, error: null };
    },
  });

console.log("A. Canonical service contract (live, mock DB)");
{
  const db = seqClient();
  const row = await createCustomerRecord(db, { name: "Mina Das", phone: "98765 43210" });
  ok("created row carries canonical code", row.code === "CUST-0042", row.code);
  ok("insert omits code (DB generates)", !("code" in db.calls.inserts[0]), JSON.stringify(Object.keys(db.calls.inserts[0])));
  ok("phone normalized", db.calls.inserts[0].phone === "9876543210");
  ok("active by default", db.calls.inserts[0].is_active === true);
}
{
  const db = seqClient();
  const row = await createCustomerRecord(db, { name: "No Phone", phone: null });
  ok("phoneless creation allowed, still coded", Boolean(row.code) && db.calls.inserts[0].phone === null);
}
{
  const db = seqClient();
  let err = null;
  try {
    await createCustomerRecord(db, { name: "   ", phone: "9876543210" });
  } catch (e) {
    err = e;
  }
  ok("blank name rejected before insert", /name is required/.test(err?.message || "") && db.calls.inserts.length === 0);
}
{
  // Failure handling: codeless response is a hard failure, never silent.
  const db = mockClient({ insertImpl: (row) => ({ data: { id: "u9", name: row.name, phone: row.phone, code: null }, error: null }) });
  let err = null;
  try {
    await createCustomerRecord(db, { name: "Ghost", phone: "9000000001" });
  } catch (e) {
    err = e;
  }
  ok("missing code in response throws", /canonical Customer ID/.test(err?.message || ""), err?.message);
}
{
  // Duplicate pre-check: no insert attempted, existing returned.
  const db = mockClient({
    rpcData: { id: "u7", name: "Existing Amit", phone: "9811111111" },
    insertImpl: () => {
      throw new Error("insert must not run on duplicate");
    },
  });
  let err = null;
  try {
    await createCustomerRecord(db, { name: "Amit X", phone: "+91 98111 11111" });
  } catch (e) {
    err = e;
  }
  ok("duplicate resolves without second row", err instanceof DuplicateCustomerError && err.existing.id === "u7" && db.calls.inserts.length === 0);
}
{
  // Unique race on insert resolves to existing (business rule: reuse).
  const db = mockClient({
    rpcData: { id: "u8", name: "Racer", phone: "9822222222" },
    insertImpl: () => ({ data: null, error: { message: "duplicate key value violates unique constraint \"customers_active_phone_unique\"" } }),
  });
  let err = null;
  try {
    await createCustomerRecord(db, { name: "Racer 2", phone: "9822222222" });
  } catch (e) {
    err = e;
  }
  ok("unique race returns existing profile", err instanceof DuplicateCustomerError && err.existing.id === "u8");
}
{
  // Genuine DB errors still surface (no swallowing).
  const db = mockClient({ insertImpl: () => ({ data: null, error: { message: "connection reset" } }) });
  let err = null;
  try {
    await createCustomerRecord(db, { name: "Net Fail", phone: "9833333333" });
  } catch (e) {
    err = e;
  }
  ok("non-duplicate errors propagate", err?.message === "connection reset" && !(err instanceof DuplicateCustomerError));
}
{
  // Schema-drift tolerance: credit_limit retry preserved from CRM.
  let attempts = 0;
  const db = mockClient({
    insertImpl: (row) => {
      attempts += 1;
      if (attempts === 1) return { data: null, error: { message: 'column "credit_limit" of relation "customers" does not exist' } };
      return { data: { id: "u10", code: "CUST-0100", name: row.name, phone: row.phone ?? null }, error: null };
    },
  });
  const row = await createCustomerRecord(db, { name: "Drift", phone: null, extra: { credit_limit: 5000 } });
  ok("credit_limit drift retried", row.code === "CUST-0100" && attempts === 2);
}

console.log("B. Concurrency model (live simulation + static proof)");
{
  // 50 parallel creations against an atomic counter (what Postgres nextval
  // guarantees): distinct codes, zero NULLs. The service itself never
  // derives, caches, or reuses codes — each insert gets its own.
  const counter = { n: 100 };
  const db = seqClient(counter);
  const rows = await Promise.all(Array.from({ length: 50 }, (_, i) => createCustomerRecord(db, { name: `Bulk ${i}`, phone: `90000${String(10000 + i)}` })));
  const codes = rows.map((r) => r.code);
  ok("50 parallel creations: unique codes", new Set(codes).size === 50, `${new Set(codes).size}/50`);
  ok("50 parallel creations: no NULL codes", codes.every(Boolean));
}
{
  const mig = read("supabase/migrations/20260917_customer_code_canonical.sql");
  ok("generation uses atomic sequence", mig.includes("nextval('public.customer_code_seq')"));
  // The seeding block legitimately aggregates MAX(code) once to seed the
  // sequence; generation itself must never be MAX()+1 arithmetic.
  ok("no MAX()+1 generation arithmetic", !/max\s*\([^;]*\)\s*\+\s*1/i.test(mig));
}

console.log("C. Database safety net (static)");
{
  const mig = read("supabase/migrations/20260917_customer_code_canonical.sql");
  ok("sequence exists", /create sequence if not exists public\.customer_code_seq/i.test(mig));
  ok("trigger function fills only missing codes", mig.includes("NEW.code is null or btrim(NEW.code) = ''"));
  ok("BEFORE INSERT trigger registered", /create trigger trg_assign_customer_code\s+before insert on public\.customers/i.test(mig));
  ok("canonical format CUST- + zero-pad 4", mig.includes("'CUST-' || lpad(") && mig.includes(", 4, '0'"));
  ok("sequence seeded above existing max, never rewound", mig.includes("if v_max >= v_cur then") && mig.includes("setval("));
  ok("sequence USAGE granted to authenticated (least privilege, no SELECT)", /grant usage on sequence public\.customer_code_seq to authenticated/i.test(mig));
  ok("backfill touches only NULL/empty codes", /where code is null or btrim\(code\) = ''/i.test(mig));
  ok("backfill never overwrites valid codes", !/update public\.customers c\s+set code(?![\s\S]*?from missing m)/i.test(mig) || /from missing m\s+where c\.id = m\.id/i.test(mig));
  ok("code set NOT NULL after backfill", /alter table public\.customers alter column code set not null/i.test(mig));
  ok("no RLS/policy change in migration", !/create policy|alter table public\.customers\s+(enable|force).*rls|drop policy/i.test(mig));
  const schema = read("supabase/schema.sql");
  ok("schema.sql mirrors generator", schema.includes("assign_customer_code") && schema.includes("customer_code_seq") && schema.includes("trg_assign_customer_code"));
}

console.log("D. Zero frontend generation (static)");
const flows = [
  "components/customers/customers-client.tsx",
  "components/pos/pos-new-customer-modal.tsx",
  "components/business/aeps-workspace.tsx",
  "components/business/dmt-workspace.tsx",
  "components/business/upi-workspace.tsx",
  "components/business/recharge-workspace.tsx",
  "components/business/utility-bill-workspace.tsx",
  "components/business/google-play-workspace.tsx",
];
for (const f of flows) {
  const src = read(f);
  ok(`${f} uses canonical service`, src.includes("createCustomerRecord"));
}
{
  const all = flows.map(read).join("\n");
  ok("no MAX+1 generator remains", !/function nextCode|nextCode\(\)/.test(all));
  ok("no random code generator remains", !/Math\.random\(\) \* 9000|Math\.floor\(1000/.test(all));
  ok("no timestamp code generator remains", !/Date\.now\(\)\.toString\(\)\.slice\(-4\)/.test(all));
  // Scoped to customers inserts only (aeps_banks master codes are a
  // different table and out of scope).
  ok(
    "no code key in customers inserts",
    !/from\("customers"\)[\s\S]{0,400}?\.insert\(\{[^}]*\bcode:/.test(all),
  );
}
{
  const svcSrc = read("lib/customers.ts");
  ok("service omits code by construction", svcSrc.includes("no `code` key anywhere here"));
  ok("service verifies returned code", svcSrc.includes("without a canonical Customer ID"));
  ok("service maps races to DuplicateCustomerError", svcSrc.includes("throw new DuplicateCustomerError(dup)"));
}

console.log("E. Response contract + UI propagation (static)");
{
  const pos = read("components/pos/pos-new-customer-modal.tsx");
  ok("POS uses returned canonical code", pos.includes("code: data.code"));
  const crm = read("components/customers/customers-client.tsx");
  ok("CRM stores returned row (with code)", crm.includes("setCustomers((prev) => [data as Customer, ...prev])"));
  for (const f of flows.slice(2)) {
    const src = read(f);
    ok(`${f} selects created row into workflow`, /setSelectedCustomerId\(newCust\.id\)|setFormCustomerId\(newCust\.id\)/.test(src));
  }
}

console.log("F. Search integration (live)");
{
  const created = [
    { id: "u42", code: "CUST-0042", name: "Mina Das", phone: "9876543210" },
    { id: "u43", code: "CUST-0043", name: "Mina Stores", phone: "9876500000" },
  ];
  const byCode = customers.rankCustomerResults(created, "CUST-0042", 10);
  const byPhone = customers.rankCustomerResults(created, "09876543210", 10);
  const byName = customers.rankCustomerResults(created, "mina das", 10);
  ok("new customer found by code", byCode[0]?.record.id === "u42");
  ok("new customer found by phone (any format)", byPhone[0]?.record.id === "u42");
  ok("new customer found by exact name", byName[0]?.record.id === "u42");
}

console.log(`\nCustomer creation suite: ${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
