/**
 * V1 Phase 2 (auth / enrollment / shell) contract test — STATIC ONLY.
 *
 * Asserts, without touching any database:
 *  1. app/v1/layout.tsx gates on the V1 session (redirect to login when no
 *     session; inactive profiles blocked; no service-role usage).
 *  2. components/v1 + app/v1 contain no legacy tables/RPCs/behaviors and no
 *     service-role imports.
 *  3. Every nav item carries a non-empty role list within V1_ROLES, and the
 *     admin-only sections are admin-exact.
 *  4. Phase-2 UI calls only the enrollment/handshake RPCs (no business RPCs).
 *  5. The session provider is client-mirror only (no server imports).
 *
 * Run: node scripts/test-v1-phase2-shell.mjs
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

const V1_ROLES = ["admin", "manager", "staff", "cashier"];

// --- 1. layout gate ---------------------------------------------------------
const layout = read("app/v1/layout.tsx");
check("v1 layout resolves V1 session", layout.includes("getV1SessionContext"));
check("v1 layout redirects anonymous to login", layout.includes('redirect("/login'));
check("v1 layout blocks inactive profiles", layout.includes("isActive"));
check(
  "v1 layout has no service-role usage",
  !layout.includes("service-role") && !layout.includes("supabase/admin") && !layout.includes("service_role"),
);

// --- 2. no legacy / no secrets in Phase-2 surface ---------------------------
const boundary = read("lib/v1/legacy-boundary.ts");
const block = (name) => {
  const m = boundary.match(new RegExp(`${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]`));
  return m ? m[1] : "";
};
const tables = [...block("LEGACY_TABLE_NAMES").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
const legacyOnly = [...block("LEGACY_RPC_NAMES").matchAll(/"([a-z_0-9]+)"/g)].map((m) => m[1]);
const phase2Files = [];
const collect = (dir) => {
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = join(dir, e.name);
    if (e.isDirectory()) collect(rel);
    else if (/\.(ts|tsx)$/.test(e.name)) phase2Files.push(rel);
  }
};
collect("components/v1");
collect("app/v1");
const tableRx = new RegExp(`\\.from\\(\\s*["'](${tables.join("|")})["']\\)`);
const rpcRx = new RegExp(`["'](${legacyOnly.join("|")})["']`);
const bad = [];
for (const f of phase2Files) {
  const src = read(f);
  if (tableRx.test(src)) bad.push(`${f}: legacy table`);
  if (rpcRx.test(src)) bad.push(`${f}: legacy RPC`);
  if (/service-role|supabase\/admin|service_role|SUPABASE_SERVICE_ROLE/i.test(src)) bad.push(`${f}: secret usage`);
  if (/WAC|quick_sale|process_return/i.test(src)) bad.push(`${f}: legacy behavior`);
}
check("phase-2 surface free of legacy/secret refs", bad.length === 0, bad.join("; "));

// --- 3. nav role discipline ---------------------------------------------------
const nav = read("components/v1/v1-nav.ts");
const items = [...nav.matchAll(/key:\s*"(\w+)"[\s\S]{0,260}?roles:\s*\[([^\]]*)\]/g)].map((m) => ({
  key: m[1],
  roles: [...m[2].matchAll(/"(\w+)"/g)].map((x) => x[1]),
}));
check("nav items parsed", items.length >= 10, `found ${items.length}`);
const badRoles = items.filter((i) => i.roles.length === 0 || i.roles.some((r) => !V1_ROLES.includes(r)));
check("nav roles within V1_ROLES", badRoles.length === 0, badRoles.map((i) => i.key).join(","));
for (const key of ["backentry", "admin"]) {
  const item = items.find((i) => i.key === key);
  check(
    `nav ${key} is admin-exact`,
    !!item && item.roles.length === 1 && item.roles[0] === "admin",
    item ? item.roles.join(",") : "missing",
  );
}

// --- 4. Phase-2 RPC surface (Phase-2-owned files only; Phase-3 surfaces are
// covered by test-v1-phase3-admin.mjs) -----------------------------------------
const PHASE2_OWNED = new Set([
  "app/v1/layout.tsx",
  "app/v1/page.tsx",
  "components/v1/v1-session-provider.tsx",
  "components/v1/v1-shell.tsx",
  "components/v1/v1-placeholder.tsx",
  "components/v1/v1-nav.ts",
  "components/v1/v1-enrollment-card.tsx",
  "lib/v1/v1-device.ts",
]);
const allowedPhase2Rpcs = new Set(["issue_enrollment_token", "consume_enrollment_token", "sync_handshake"]);
const rpcLitRx = /"(issue_enrollment_token|consume_enrollment_token|sync_[a-z_]+|create_[a-z_]+|record_[a-z_]+|recognize_claim|approve_[a-z_]+|mg_[a-z_]+|post_[a-z_]+|submit_[a-z_]+|open_day_close|close_day_close|request_approval|append_audit|set_legal_hold|run_retention_purge|acquire_back_entry_lock|void_back_entry_batch|resolve_[a-z_]+|quarantine_lot|reopen_lot|adjust_stock|intake_lots|reserve_stock|cancel_invoice|edit_invoice|reverse_[a-z_]+|idempotency_[a-z_]+|allocate_claim|next_canonical_number|revoke_device)"/g;
const overreach = [];
for (const f of phase2Files) {
  if (!PHASE2_OWNED.has(f.replace(/\\/g, "/"))) continue;
  const src = read(f);
  for (const m of src.matchAll(rpcLitRx)) {
    if (!allowedPhase2Rpcs.has(m[1])) overreach.push(`${f}: ${m[1]}`);
  }
}
check("phase-2 UI calls only enrollment/handshake RPCs", overreach.length === 0, overreach.join("; "));

// --- 5. provider is client-mirror only -----------------------------------------
const provider = read("components/v1/v1-session-provider.tsx");
check("session provider is client component", provider.includes('"use client"'));
check(
  "session provider imports no server modules",
  !provider.includes("supabase/server") && !provider.includes("v1-auth-context"),
);

if (failures > 0) {
  console.log(`V1_PHASE2_CONTRACT_FAILED (${failures})`);
  process.exit(1);
}
console.log("V1_PHASE2_CONTRACT_PASSED");
