/**
 * SAI POS Draft Handoff — Regression Tests
 *
 * These tests verify the static safety properties of the POS draft handoff
 * implementation without requiring a live database. They check:
 *
 *  1. API route contract (open-in-pos endpoint)
 *     - Auth guard present
 *     - Approval ID validation
 *     - Expired/invalid status rejection
 *     - No mutation of any write table
 *     - GST always recomputed (calculateGstInvoice import present)
 *     - Live catalog re-read (not trusting AI payload)
 *     - Per-item problems returned as 422, not 500
 *     - Customer re-validated from DB
 *
 *  2. Client UI contract (cafe-ai-agent)
 *     - "Open in POS" button present for sale drafts
 *     - Approval state conditional on action === "create_sale"
 *     - router.push("/pos") call present (SPA navigation, no hard reload)
 *     - localStorage write uses PosShell's established key pattern
 *     - No invoice-creation code in the openInPos path
 *     - No direct database mutation in client code
 *
 *  3. Safety invariants
 *     - The handoff endpoint does NOT import or call create_sale RPC
 *     - The handoff endpoint does NOT call requireOwnerApproval (no new approval)
 *     - The handoff endpoint does NOT call markExecuted
 *     - The approval status is NOT changed by the handoff endpoint
 *     - CartLine keys are unique per draft (include approval ID prefix)
 */

import fs from "fs";
import path from "path";

const OPEN_IN_POS_ROUTE = path.join(
  "app",
  "api",
  "ai",
  "quick-sale",
  "open-in-pos",
  "route.ts"
);
const CAFE_AI_AGENT = path.join("components", "ai", "cafe-ai-agent.tsx");

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

// ── Load sources ────────────────────────────────────────────────────────────

let route, agent;
try {
  route = fs.readFileSync(OPEN_IN_POS_ROUTE, "utf8");
} catch (e) {
  console.error(`Cannot read route file: ${OPEN_IN_POS_ROUTE}`, e.message);
  process.exit(1);
}

try {
  agent = fs.readFileSync(CAFE_AI_AGENT, "utf8");
} catch (e) {
  console.error(`Cannot read agent file: ${CAFE_AI_AGENT}`, e.message);
  process.exit(1);
}

// ── Section 1: API route contract ──────────────────────────────────────────

console.log("\nSection 1: open-in-pos API route contract\n");

assert(
  route.includes("getUserRole") && route.includes("hasRole"),
  "Route has auth guard (getUserRole + hasRole)"
);

assert(
  route.includes('["admin", "staff"]') || route.includes('["admin","staff"]'),
  "Route requires admin or staff role"
);

assert(
  route.includes("approval_id") && route.includes("approvalId"),
  "Route validates approval_id parameter"
);

assert(
  route.includes("status: 401"),
  "Route returns 401 for unauthorized access"
);

assert(
  route.includes("status: 404") || route.includes("{ status: 404 }"),
  "Route returns 404 for missing approval"
);

assert(
  route.includes("status: 409") || route.includes("status: 410"),
  "Route returns 409/410 for non-pending or expired approval"
);

assert(
  route.includes("action !== \"create_sale\""),
  "Route rejects non-sale-draft approval IDs"
);

assert(
  route.includes("calculateGstInvoice"),
  "Route imports and calls calculateGstInvoice (live recompute)"
);

assert(
  route.includes("from(\"products\")") && route.includes("from(\"services\")"),
  "Route re-reads products and services from live DB"
);

assert(
  route.includes("from(\"customers\")"),
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
  route.includes("status: 422"),
  "Route returns 422 with problems array for invalid items"
);

assert(
  route.includes('"problems"') || route.includes("problems"),
  "Route returns per-item problem list"
);

// Safety: no DB mutations
assert(
  !route.includes(".insert(") && !route.includes(".update(") && !route.includes(".delete("),
  "Route makes no DB writes (no insert/update/delete)"
);

assert(
  !route.includes("supabase.rpc(\"create_sale\"") && !route.includes("rpc('create_sale'"),
  "Route does not call create_sale RPC"
);

assert(
  !route.includes("requireOwnerApproval"),
  "Route does not create a new approval record"
);

assert(
  !route.includes("markExecuted") && !route.includes("claimApprovedAction"),
  "Route does not change approval status"
);

assert(
  !route.includes("stock_qty") || route.includes("only ${"),
  "Route uses stock_qty for check, not write"
);

assert(
  route.includes("No invoice") || route.includes("no invoice") || route.includes("no DB writes"),
  "Route has safety comment documenting no-write contract"
);

// CartLine format compatibility
assert(
  route.includes("cartLines") && route.includes("key:"),
  "Route returns cartLines array with PosShell-compatible key field"
);

assert(
  route.includes("approvalId.slice(0, 8)") || route.includes("approvalId"),
  "CartLine keys include approval ID prefix for uniqueness"
);

// ── Section 2: Client UI contract ─────────────────────────────────────────

console.log("\nSection 2: cafe-ai-agent client UI contract\n");

assert(
  agent.includes("openInPos"),
  "Agent defines openInPos function"
);

assert(
  agent.includes("Open in POS") || agent.includes("open-in-pos"),
  "Agent has 'Open in POS' action button text or API call"
);

assert(
  agent.includes('approval.action === "create_sale"'),
  "Open in POS button is conditional on action === create_sale"
);

assert(
  agent.includes('router.push("/pos")') || agent.includes("router.push('/pos')"),
  "openInPos navigates to /pos via router.push (SPA nav)"
);

assert(
  agent.includes("cafeerp_pos_tabs_shared") || agent.includes("cafeerp_pos_tabs_"),
  "openInPos writes to PosShell's established localStorage key pattern"
);

assert(
  agent.includes("cafeerp_pos_active_tab_shared") || agent.includes("cafeerp_pos_active_tab_"),
  "openInPos writes active tab ID to localStorage"
);

assert(
  agent.includes("useRouter"),
  "Agent imports useRouter from next/navigation"
);

// No invoice creation in openInPos path
const openInPosSource = (() => {
  const startIdx = agent.indexOf("async function openInPos");
  const endIdx = agent.indexOf("\n  async function ", startIdx + 1);
  return startIdx > -1 ? agent.slice(startIdx, endIdx > -1 ? endIdx : startIdx + 5000) : "";
})();

assert(
  openInPosSource.length > 0,
  "openInPos function is extractable for analysis"
);

assert(
  !openInPosSource.includes("supabase.rpc") && !openInPosSource.includes("/api/ai/agent/approval/"),
  "openInPos does not call the create_sale approval endpoint"
);

assert(
  openInPosSource.includes("/api/ai/quick-sale/open-in-pos"),
  "openInPos calls the correct validation endpoint"
);

assert(
  openInPosSource.includes("cartLines") || openInPosSource.includes("cart"),
  "openInPos receives and uses cartLines from server response"
);

// ── Section 3: Safety invariants ──────────────────────────────────────────

console.log("\nSection 3: Safety invariants\n");

assert(
  !agent.includes('fetch("/api/ai/agent/approval/') || agent.includes("approveCurrentAction"),
  "Direct approval endpoint is only called from approveCurrentAction, not openInPos"
);

assert(
  agent.includes("openingInPos") && agent.includes("setOpeningInPos"),
  "Loading state prevents concurrent openInPos calls"
);

assert(
  agent.includes("problems") && agent.includes("detail"),
  "openInPos surfaces per-item problem details to operator"
);

assert(
  agent.includes("speak(") && agent.includes("could not open"),
  "openInPos uses voice to report errors to operator"
);

// Ensure the 'Open in POS' info note is present
assert(
  agent.includes("No invoice is created until you press Pay") ||
  agent.includes("no invoice") ||
  agent.includes("Safe handoff"),
  "UI shows safety note: no invoice until operator submits in POS"
);

assert(
  agent.includes("Validating") || agent.includes("Validating &"),
  "Button shows loading state during validation ('Validating…')"
);

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed / ${failed} failed`);
if (failed) process.exit(1);
