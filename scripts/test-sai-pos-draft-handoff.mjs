/**
 * SAI POS Draft Handoff — Regression Tests (current SAI architecture)
 *
 * Verifies the static safety properties of the POS draft handoff without
 * requiring a live database:
 *
 *  1. API route contract (app/api/sai/pos-draft/open-in-pos/route.ts)
 *     - Auth guard present (admin/manager/staff)
 *     - Draft identity validation
 *     - Expiry rejection (410)
 *     - Sale-only validation
 *     - Live catalog re-read (never trusts AI prices)
 *     - GST recomputed via calculateGstInvoice
 *     - Customer re-validated from live DB
 *     - Per-item problems returned as 422
 *     - No DB writes, no create_sale RPC
 *
 *  2. Chat plumbing (lib/sai/cognition/chat-runtime.ts)
 *     - Prepared sale drafts are surfaced to the SAI surface as posDraft
 *
 *  3. Client UI contract (components/sai/sai-background-layer.tsx)
 *     - "Open in POS for Review" primary button for valid sale drafts
 *     - Safety note: no invoice until Pay in POS
 *     - router.push("/pos") navigation with ?customer=<id> hydration
 *     - Exact POS storage keys (cafeerp_pos_tabs_ / cafeerp_pos_active_tab_)
 *     - Double-click protection, validation error display
 *
 * Safety invariants:
 *  - Open in POS != Approve sale != Create invoice != Take payment.
 *  - The ONLY financial writer is the existing POS checkout (Pay flow).
 */

import fs from "fs";
import path from "path";

const OPEN_IN_POS_ROUTE = path.join(
  "app",
  "api",
  "sai",
  "pos-draft",
  "open-in-pos",
  "route.ts"
);
const LEGACY_OPEN_IN_POS_ROUTE = path.join(
  "app",
  "api",
  "ai",
  "quick-sale",
  "open-in-pos",
  "route.ts"
);
const SAI_BACKGROUND_LAYER = path.join(
  "components",
  "sai",
  "sai-background-layer.tsx"
);
const CHAT_RUNTIME = path.join("lib", "sai", "cognition", "chat-runtime.ts");
const DRAFT_CAPABILITY = path.join(
  "lib",
  "sai",
  "capabilities",
  "pos-draft-intelligence.ts"
);

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) {
    console.log(`  PASS: ${name}`);
    passed += 1;
  } else {
    console.error(`  FAIL: ${name}`);
    failed += 1;
  }
}

function readRequired(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (e) {
    console.error(`Cannot read file: ${file} — ${e.message}`);
    process.exit(1);
  }
}

// ── Load sources ────────────────────────────────────────────────────────────

const route = readRequired(OPEN_IN_POS_ROUTE);
const layer = readRequired(SAI_BACKGROUND_LAYER);
const chatRuntime = readRequired(CHAT_RUNTIME);
const capability = readRequired(DRAFT_CAPABILITY);
let legacyRoute = null;
try {
  legacyRoute = fs.readFileSync(LEGACY_OPEN_IN_POS_ROUTE, "utf8");
} catch {
  legacyRoute = null;
}

// ── Section 1: API route contract ───────────────────────────────────────────

console.log("\nSection 1: sai/pos-draft/open-in-pos API route contract\n");

assert(
  route.includes("getUserRole") && route.includes("hasRole"),
  "Route has auth guard (getUserRole + hasRole)"
);

assert(
  route.includes('"admin"') && route.includes('"staff"'),
  "Route requires an operator role (admin/staff)"
);

assert(
  route.includes("draft is required") && route.includes("draftId"),
  "Route validates draft identity"
);

assert(
  route.includes("status: 401"),
  "Route returns 401 for unauthorized access"
);

assert(
  route.includes("status: 400"),
  "Route returns 400 for malformed/non-sale drafts"
);

assert(
  route.includes("status: 410"),
  "Route returns 410 for expired drafts"
);

assert(
  route.includes("Only product/service sale drafts") ||
    route.includes("not a sale draft"),
  "Route rejects non-sale drafts"
);

assert(
  route.includes("Draft contains no items") && route.includes("status: 422"),
  "Route returns 422 when the draft has no valid items"
);

assert(
  route.includes("calculateGstInvoice"),
  "Route imports and calls calculateGstInvoice (live recompute)"
);

assert(
  route.includes('from("products")') && route.includes('from("services")'),
  "Route re-reads products and services from live DB"
);

assert(
  route.includes('from("customers")'),
  "Route re-validates customer from live DB"
);

assert(
  route.includes("is_active"),
  "Route checks is_active on catalog items"
);

assert(
  route.includes("stock_qty"),
  "Route checks stock_qty for product items"
);

assert(
  route.includes("problems"),
  "Route returns per-item problem list"
);

assert(
  !route.includes(".insert(") &&
    !route.includes(".update(") &&
    !route.includes(".delete(") &&
    !route.includes(".upsert("),
  "Route makes no DB writes (no insert/update/upsert/delete)"
);

assert(
  !route.includes(".rpc(") && !/supabase\s*\.\s*rpc/.test(route),
  "Route does not call create_sale RPC"
);

assert(
  !route.includes(".rpc("),
  "Route calls no RPC at all (read/validate/transform only)"
);

assert(
  route.includes("No invoice is created until you press Pay in POS") ||
    route.includes("ZERO financial") ||
    route.includes("no invoice"),
  "Route documents the no-write safety contract"
);

assert(
  route.includes("cartLines") && route.includes("key:"),
  "Route returns cartLines array with PosShell-compatible key field"
);

assert(
  route.includes("sai-draft-"),
  "CartLine keys are namespaced per SAI draft for uniqueness"
);

assert(
  route.includes("costPrice") && route.includes("gstRate") && route.includes("hsnSac"),
  "CartLine preserves cost price, GST rate and HSN/SAC from live DB"
);

assert(
  route.includes("stockQty") && route.includes("unit"),
  "CartLine preserves live stock quantity and unit"
);

// ── Section 2: chat plumbing ────────────────────────────────────────────────

console.log("\nSection 2: SAI chat draft plumbing\n");

assert(
  chatRuntime.includes("posDraft") && chatRuntime.includes('handoff?.path === "/pos"'),
  "Chat runtime surfaces prepared sale drafts (posDraft) to the SAI surface"
);

assert(
  capability.includes('handoff: { path: "/pos"'),
  "Draft capability targets /pos handoff"
);

assert(
  capability.includes("estimateOnly: true"),
  "Draft capability marks output as estimate-only"
);

// ── Section 3: background layer UI ──────────────────────────────────────────

console.log("\nSection 3: sai-background-layer client UI contract\n");

assert(
  layer.includes("openInPos"),
  "Background layer defines openInPos handoff"
);

assert(
  layer.includes("Open in POS for Review"),
  "Background layer shows 'Open in POS for Review' primary button"
);

assert(
  layer.includes("/api/sai/pos-draft/open-in-pos"),
  "openInPos calls the SAI-namespaced validation endpoint"
);

assert(
  layer.includes('router.push("/pos")') ||
    layer.includes("router.push(customer?.id") ||
    layer.includes('`/pos?customer='),
  "openInPos navigates to /pos via router.push (SPA nav)"
);

assert(
  layer.includes("?customer="),
  "Customer survives handoff via /pos?customer=<id> hydration"
);

assert(
  layer.includes("cafeerp_pos_tabs_${") && layer.includes("cafeerp_pos_active_tab_${"),
  "openInPos uses the exact POS tab storage key pattern"
);

assert(
  layer.includes("useRouter"),
  "Background layer imports useRouter from next/navigation"
);

assert(
  layer.includes("No invoice is created until you press Pay in POS"),
  "UI shows safety note: no invoice until operator presses Pay"
);

assert(
  layer.includes("Validating"),
  "Button shows loading state during validation"
);

assert(
  layer.includes("openingInPos") && layer.includes("setOpeningInPos"),
  "Busy flag prevents concurrent/double-click handoff requests"
);

assert(
  layer.includes("posProblems") || (layer.includes("problems") && layer.includes("setPosProblems")),
  "openInPos surfaces per-item problem details to the operator"
);

const openInPosSource = (() => {
  const startIdx = layer.indexOf("async function openInPos");
  if (startIdx < 0) return "";
  const endIdx = layer.indexOf("\n  return (", startIdx);
  return layer.slice(startIdx, endIdx > -1 ? endIdx : startIdx + 6000);
})();

assert(openInPosSource.length > 0, "openInPos function is extractable for analysis");

assert(
  !openInPosSource.includes("create_sale") && !openInPosSource.includes(".rpc("),
  "openInPos performs no financial write from the client"
);

assert(
  openInPosSource.includes("cartLines"),
  "openInPos uses server-returned cartLines (never AI prices)"
);

assert(
  openInPosSource.includes("customerId") && openInPosSource.includes("customerSearch"),
  "openInPos carries the validated customer into the POS tab"
);

// ── Section 4: legacy compatibility ─────────────────────────────────────────

console.log("\nSection 4: legacy approval handoff (non-regression)\n");

assert(
  legacyRoute !== null,
  "Legacy approval-based handoff endpoint is preserved (not deleted)"
);

if (legacyRoute) {
  assert(
    !legacyRoute.includes(".insert(") &&
      !legacyRoute.includes(".update(") &&
      !legacyRoute.includes(".delete(") &&
      !legacyRoute.includes(".rpc("),
    "Legacy endpoint keeps its no-write invariant"
  );
}

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed / ${failed} failed`);
if (failed) process.exit(1);
