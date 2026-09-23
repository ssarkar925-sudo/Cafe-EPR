/**
 * V1 Phase 5 (POS design / thermal receipt / offline mapping) contract
 * test — STATIC ONLY.
 *
 * Verifies, without touching any database:
 *  1. All six Phase-5 design documents exist with their normative markers.
 *  2. No exact legacy identifiers or legacy numeric assertions appear in
 *     any Phase-5 file (docs, placeholder route, nav).
 *  3. Bare "WAC" / "TAX INVOICE" strings occur only in exclusionary lines.
 *  4. The POS placeholder route is session-gated, renders V1Placeholder,
 *     references the spec docs, and contains no RPC literals, no secrets,
 *     and no direct writes.
 *  5. The V1 nav contract is intact (only phase-2/3 destinations live;
 *     future workflows stay phase-marked) — guards the shared nav file.
 *  6. No print CSS or new stylesheets were added by this phase.
 *
 * Run: node scripts/test-v1-phase5-design.mjs
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
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

const DOCS = [
  "docs/architecture/v1-pos-workflow-spec.md",
  "docs/architecture/v1-pos-state-component-spec.md",
  "docs/architecture/v1-thermal-receipt-spec.md",
  "docs/architecture/v1-offline-arch-mapping.md",
  "docs/architecture/v1-system-test-plan.md",
  "docs/architecture/v1-owner-decision-register.md",
];

// --- 1. docs exist with normative markers ------------------------------------
const MARKERS = {
  "docs/architecture/v1-pos-workflow-spec.md": ["DESIGN ONLY", "UNSYNCED — NOT FINAL", "request_approval", "approve_override"],
  "docs/architecture/v1-pos-state-component-spec.md": ["DESIGN ONLY", "UNSYNCED — NOT FINAL", "V1SyncReasonCode"],
  "docs/architecture/v1-thermal-receipt-spec.md": ["DESIGN ONLY", "UNSYNCED — NOT FINAL", "80mm", "SALE RECEIPT"],
  "docs/architecture/v1-offline-arch-mapping.md": ["DESIGN ONLY", "UNSYNCED — NOT FINAL", "sync_handshake", "sync_flush", "resolve_conflict"],
  "docs/architecture/v1-system-test-plan.md": ["SPECIFICATION ONLY", "Legacy boundary", "V1-SEC-AB", "V1-OUT-AD"],
  "docs/architecture/v1-owner-decision-register.md": ["REGISTER ONLY", "OD-P5-01", "OD-P5-05"],
};
for (const d of DOCS) {
  check(`${d} exists`, existsSync(join(root, d)));
}
for (const [d, markers] of Object.entries(MARKERS)) {
  const src = read(d);
  for (const m of markers) check(`${d} contains "${m}"`, src.includes(m));
}

// --- 2. no exact legacy identifiers / legacy numeric assertions -------------
const PHASE5_FILES = [...DOCS, "app/v1/pos/page.tsx", "components/v1/v1-nav.ts"];
const legacyIdRx = /quick_sale|process_return|adjust_stock_manual|93\.33|18%/;
const legacyBad = [];
for (const f of PHASE5_FILES) {
  const src = read(f);
  const hits = src.match(legacyIdRx);
  if (hits) legacyBad.push(`${f}: ${hits[0]}`);
}
check("no exact legacy identifiers in phase-5 files", legacyBad.length === 0, legacyBad.join("; "));

// --- 3. WAC / TAX INVOICE only in exclusionary lines --------------------------
const exclusionRx = /not\b|NO\b|never|forbidden|dormant|exclusion|legacy|fail:/i;
const nonExcl = [];
for (const f of PHASE5_FILES) {
  read(f).split("\n").forEach((line, i) => {
    if (/WAC|TAX INVOICE/.test(line) && !exclusionRx.test(line)) nonExcl.push(`${f}:${i + 1}`);
  });
}
check("WAC/TAX-INVOICE only in exclusionary lines", nonExcl.length === 0, nonExcl.join("; "));

// --- 4. placeholder route discipline ------------------------------------------
const pos = read("app/v1/pos/page.tsx");
check("pos placeholder resolves V1 session", pos.includes("getV1SessionContext"));
check("pos placeholder renders V1Placeholder", pos.includes("V1Placeholder"));
check(
  "pos placeholder references all six spec docs",
  DOCS.every((d) => pos.includes(d)),
);
const rpcLitRx = /"(create_sale|create_purchase|record_claim|recognize_claim|request_approval|approve_override|sync_flush|sync_acknowledge|resolve_conflict|sync_handshake|record_service_txn|cancel_invoice|edit_invoice|intake_lots|adjust_stock|quarantine_lot|reopen_lot|mg_[a-z_]+|post_journal|reverse_journal_entry|open_day_close|close_day_close)"/;
check("pos placeholder calls no RPCs", !rpcLitRx.test(pos));
check(
  "pos placeholder has no secret usage",
  !/service-role|supabase\/admin|service_role|SUPABASE_SERVICE_ROLE/i.test(pos),
);
check("pos placeholder performs no direct writes", !/\.(insert|update|delete|upsert)\s*\(/.test(pos));
check("pos placeholder has no legacy refs", !legacyIdRx.test(pos));

// --- 5. nav contract intact ----------------------------------------------------
const nav = read("components/v1/v1-nav.ts");
const liveHrefs = [...nav.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]);
const allowedLive = ["/v1", "/v1/masters", "/v1/admin"];
const extraLive = liveHrefs.filter((h) => !allowedLive.includes(h));
check("only phase-2/3 destinations are live", extraLive.length === 0, extraLive.join(","));
const futureLabels = (nav.match(/phase: 4/g) ?? []).length;
check("future workflows stay phase-marked", futureLabels >= 8, `found ${futureLabels}`);

// --- 6. no print CSS / stylesheets added ---------------------------------------
const cssHits = [];
const scanCss = (dir) => {
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = join(dir, e.name);
    if (e.isDirectory()) scanCss(rel);
    else if (/\.css$/.test(e.name)) cssHits.push(rel);
  }
};
scanCss("app/v1");
scanCss("components/v1");
check("no stylesheets added by phase 5", cssHits.length === 0, cssHits.join(","));
check("pos placeholder has no print CSS", !/page-break|@media\s+print|<style/i.test(pos));

if (failures > 0) {
  console.log(`V1_PHASE5_CONTRACT_FAILED (${failures})`);
  process.exit(1);
}
console.log("V1_PHASE5_CONTRACT_PASSED");
