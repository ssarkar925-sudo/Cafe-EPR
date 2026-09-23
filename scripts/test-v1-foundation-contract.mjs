/**
 * V1 foundation contract test — STATIC ONLY (no database, no network).
 *
 * Enforces the V1/legacy boundary established in Phase 1:
 *  1. The financial-RPC proxy allowlist is a superset of V1_MUTATION_RPCS.
 *  2. The browser idempotency set covers every V1 RPC that accepts
 *     p_idempotency_key (unknown-arg injection is rejected by the DB).
 *  3. lib/v1/** (except legacy-boundary.ts itself) references no legacy
 *     tables, legacy-only RPCs, or legacy behaviors.
 *  4. v1-auth-context is server-only (imports the server client, never the
 *     browser client).
 *  5. Emits the legacy-module inventory for later replacement phases
 *     (informational; never a failure).
 *
 * Run: node scripts/test-v1-foundation-contract.mjs
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

const extractStringSet = (src, varName) => {
  const m = src.match(new RegExp(`${varName}[^=]*=\\s*(?:new Set\\()?\\[([\\s\\S]*?)\\]`, "m"));
  if (!m) return null;
  return new Set(
    [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]),
  );
};

const extractConstArray = (src, varName) => {
  const set = extractStringSet(src, varName);
  return set ? [...set] : null;
};

// --- 1. proxy allowlist superset -------------------------------------------
const routeSrc = read("app/api/pos/financial-rpc/route.ts");
const legacyAllow = extractStringSet(routeSrc, "LEGACY_FINANCIAL_RPCS");
const v1Allow = extractStringSet(routeSrc, "V1_FINANCIAL_RPCS");
const proxyAllow = new Set([...(legacyAllow ?? []), ...(v1Allow ?? [])]);
check("proxy allowlist parsed", legacyAllow !== null && v1Allow !== null);
const rpcSrc = read("lib/v1/v1-rpc.ts");
const v1Mutations = extractConstArray(rpcSrc, "V1_MUTATION_RPCS");
check("V1_MUTATION_RPCS parsed", Array.isArray(v1Mutations) && v1Mutations.length > 0);
if (proxyAllow && v1Mutations) {
  const missing = v1Mutations.filter((n) => !proxyAllow.has(n));
  check("proxy allowlist superset of V1 mutations", missing.length === 0, `missing: ${missing.join(",")}`);
}

// --- 2. idempotency coverage -------------------------------------------------
const clientSrc = read("lib/supabase/client.ts");
const clientSet = extractStringSet(clientSrc, "FINANCIAL_IDEMPOTENT_RPCS");
const v1Idem = extractConstArray(rpcSrc, "V1_IDEMPOTENT_RPCS");
check("V1_IDEMPOTENT_RPCS parsed", Array.isArray(v1Idem) && v1Idem.length === 12);
if (clientSet && v1Idem) {
  const missing = v1Idem.filter((n) => !clientSet.has(n));
  check("browser idempotency set covers V1 key-accepting RPCs", missing.length === 0, `missing: ${missing.join(",")}`);
}

// --- 3. no legacy leakage into lib/v1 (except the boundary file) ------------
const boundarySrc = read("lib/v1/legacy-boundary.ts");
const legacyTables = extractConstArray(boundarySrc, "LEGACY_TABLE_NAMES") ?? [];
const legacyOnly = extractConstArray(boundarySrc, "LEGACY_RPC_NAMES") ?? [];
const v1Files = readdirSync(join(root, "lib/v1")).filter(
  (f) => f.endsWith(".ts") && f !== "legacy-boundary.ts",
);
const leakPatterns = [
  ...legacyTables.map((t) => new RegExp(`['"\`]${t}['"\`]|from\\(["']${t}["']\\)|from\\(\\s*["']${t}`, "")),
  ...legacyOnly.map((r) => new RegExp(`['"\`]${r}['"\`]`, "")),
  /WAC/i,
  /quick_sale/i,
  /GST\s+calculat/i,
];
let leaks = [];
for (const f of v1Files) {
  const src = read(`lib/v1/${f}`);
  for (const rx of leakPatterns) {
    if (rx.test(src)) leaks.push(`${f}: ${rx}`);
  }
}
check("lib/v1 free of legacy references", leaks.length === 0, leaks.join("; "));

// --- 4. auth context is server-only ------------------------------------------
const authCtx = read("lib/v1/v1-auth-context.ts");
check(
  "v1-auth-context uses server client only",
  authCtx.includes("lib/supabase/server") && !authCtx.includes("lib/supabase/client"),
);

// --- 5. legacy inventory (informational) --------------------------------------
const legacyHits = [];
const scanDirs = ["app", "components", "lib"];
const tableRx = new RegExp(`\\.from\\(\\s*["'](${legacyTables.join("|")})["']\\)`, "g");
const walk = (dir) => {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    if (entry.name === "v1") continue;
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) { if (!["node_modules", ".next"].includes(entry.name)) walk(rel); }
    else if (/\.(ts|tsx)$/.test(entry.name)) {
      const src = read(rel);
      const tables = new Set([...src.matchAll(tableRx)].map((m) => m[1]));
      if (tables.size > 0) legacyHits.push(`${rel} :: ${[...tables].join(",")}`);
    }
  }
};
for (const d of scanDirs) walk(d);
console.log(`INFO legacy-table dependents: ${legacyHits.length} files (replace in later phases)`);
for (const h of legacyHits.slice(0, 60)) console.log(`  - ${h}`);
if (legacyHits.length > 60) console.log(`  ... and ${legacyHits.length - 60} more`);

if (failures > 0) {
  console.log(`V1_FOUNDATION_CONTRACT_FAILED (${failures})`);
  process.exit(1);
}
console.log("V1_FOUNDATION_CONTRACT_PASSED");
