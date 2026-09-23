/**
 * V1 Phase 3 (admin & master data) contract test — STATIC ONLY.
 *
 * Verifies, without touching any database:
 *  1. Every Phase-3 page resolves the V1 session and enforces its role gate
 *     (admin-only vs back-office), rendering V1Forbidden otherwise.
 *  2. No service-role / admin-client imports anywhere in the Phase-3 surface.
 *  3. No legacy tables / legacy-only RPCs / legacy behaviors in Phase-3 code.
 *  4. Dormant tax screens contain no tax-computation implementation.
 *  5. Mutations go through the V1 RPC wrapper (callV1Mutation / useV1Mutation)
 *     and never through direct .insert/.update/.delete on the browser path.
 *  6. Only documented V1 mutation RPC names appear in Phase-3 UI code.
 *  7. Future operational workflows stay disabled (nav phase labels intact).
 *
 * Run: node scripts/test-v1-phase3-admin.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
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

const PHASE3_PAGES = [
  "app/v1/admin/page.tsx",
  "app/v1/admin/users/page.tsx",
  "app/v1/admin/finance/page.tsx",
  "app/v1/admin/tax/page.tsx",
  "app/v1/admin/retention/page.tsx",
  "app/v1/admin/audit/page.tsx",
  "app/v1/admin/approvals/page.tsx",
  "app/v1/admin/devices/page.tsx",
  "app/v1/masters/page.tsx",
  "app/v1/masters/customers/page.tsx",
  "app/v1/masters/suppliers/page.tsx",
  "app/v1/masters/products/page.tsx",
  "app/v1/masters/instruments/page.tsx",
];
const PHASE3_CLIENT = [
  "app/v1/masters/forms.tsx",
  "app/v1/admin/finance/forms.tsx",
  "app/v1/admin/retention/forms.tsx",
  "app/v1/admin/devices/forms.tsx",
  "components/v1/v1-mutation.tsx",
];
const ALL = [...PHASE3_PAGES, ...PHASE3_CLIENT];

// --- 1. session + role gates --------------------------------------------------
for (const f of PHASE3_PAGES) {
  const src = read(f);
  const gate = f.startsWith("app/v1/masters")
    ? "requireV1BackOffice"
    : f === "app/v1/admin/page.tsx"
      ? "requireV1Admin"
      : "requireV1Admin";
  check(
    `${f} enforces session + ${gate}`,
    src.includes("getV1SessionContext") && src.includes(gate) && src.includes("V1Forbidden"),
  );
}

// --- 2. no secrets --------------------------------------------------------------
const secretBad = ALL.filter((f) =>
  /service-role|supabase\/admin|service_role|SUPABASE_SERVICE_ROLE/i.test(read(f)),
);
check("no service-role usage in phase-3 surface", secretBad.length === 0, secretBad.join(","));

// --- 3. legacy boundary ------------------------------------------------------------
const boundary = read("lib/v1/legacy-boundary.ts");
const block = (name) => {
  const m = boundary.match(new RegExp(`${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]`));
  return m ? m[1] : "";
};
const tables = [...block("LEGACY_TABLE_NAMES").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
const legacyRpcs = [...block("LEGACY_RPC_NAMES").matchAll(/"([a-z_0-9]+)"/g)].map((m) => m[1]);
const shared = [...block("SHARED_RPC_NAMES").matchAll(/"([a-z_0-9]+)"/g)].map((m) => m[1]);
const tableRx = new RegExp(`\\.from\\(\\s*["'](${tables.join("|")})["']\\)`);
const legacyRpcRx = new RegExp(`["'](${legacyRpcs.filter((r) => !shared.includes(r)).join("|")})["']`);
const legacyBad = [];
for (const f of ALL) {
  const src = read(f);
  if (tableRx.test(src)) legacyBad.push(`${f}: legacy table`);
  if (legacyRpcRx.test(src)) legacyBad.push(`${f}: legacy RPC`);
  if (/WAC|quick_sale|process_return|full_name/i.test(src)) legacyBad.push(`${f}: legacy behavior/shape`);
}
check("phase-3 surface free of legacy refs", legacyBad.length === 0, legacyBad.join(";"));

// --- 4. dormant tax: no computation ----------------------------------------------------
const tax = read("app/v1/admin/tax/page.tsx");
check(
  "dormant tax screen computes nothing",
  !/cgst|sgst|igst|utgst|\brate\s*\*|\*\s*(rate|tax)|tax\s*\+=|percent\s*\(|gstin/i.test(tax) &&
    /Dormant in V1/i.test(tax),
);

// --- 5. mutations via V1 wrapper; no direct writes ---------------------------------------
const writeRx = /\.(insert|update|delete|upsert)\s*\(/;
const writeBad = ALL.filter((f) => writeRx.test(read(f)));
check("no direct browser/database writes", writeBad.length === 0, writeBad.join(","));
const mutUse = PHASE3_CLIENT.filter(
  (f) => f !== "components/v1/v1-mutation.tsx" && /callV1Mutation|useV1Mutation/.test(read(f)),
);
check(
  "mutations use the V1 wrapper",
  mutUse.length === PHASE3_CLIENT.length - 1,
  `wired: ${mutUse.length}/${PHASE3_CLIENT.length - 1}`,
);

// --- 6. only documented V1 mutation RPCs ---------------------------------------------------
const rpcSrc = read("lib/v1/v1-rpc.ts");
const v1m = [...rpcSrc.matchAll(/"([a-z_0-9]+)",/g)].map((m) => m[1]);
const v1MutSet = new Set(
  v1m.filter((n) => read("lib/v1/v1-rpc.ts").includes(n) && !["function_name"].includes(n)),
);
const calledRx = /mutation\.run\("([a-z_0-9]+)"|callV1Mutation<[A-Za-z, <>[\]]*>\("([a-z_0-9]+)"|callV1Mutation\("([a-z_0-9]+)"/g;
const unknownCalls = [];
for (const f of PHASE3_CLIENT) {
  const src = read(f);
  for (const m of src.matchAll(calledRx)) {
    const name = m[1] ?? m[2] ?? m[3];
    if (name && !v1MutSet.has(name)) unknownCalls.push(`${f}: ${name}`);
  }
}
check("only documented V1 RPCs are called", unknownCalls.length === 0, unknownCalls.join(";"));

// --- 7. future workflows remain disabled ------------------------------------------------------
const nav = read("components/v1/v1-nav.ts");
const liveHrefs = [...nav.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]);
const allowedLive = ["/v1", "/v1/masters", "/v1/admin"];
const extraLive = liveHrefs.filter((h) => !allowedLive.includes(h));
check("only phase-2/3 destinations are live", extraLive.length === 0, extraLive.join(","));
const futureLabels = (nav.match(/phase: 4/g) ?? []).length;
check("future workflows stay phase-marked", futureLabels >= 8, `found ${futureLabels}`);

if (failures > 0) {
  console.log(`V1_PHASE3_CONTRACT_FAILED (${failures})`);
  process.exit(1);
}
console.log("V1_PHASE3_CONTRACT_PASSED");
