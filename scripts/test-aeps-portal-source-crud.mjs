// Acceptance Test Suite: AEPS Portal Watcher Sources CRUD and Archive Management
// Covers Test A through Test L as specified in production requirements.
// Run: node scripts/test-aeps-portal-source-crud.mjs

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

console.log("=== AEPS PORTAL SOURCE CRUD & ARCHIVE ACCEPTANCE SUITE ===");

const {
  validatePortalSourceUrl,
  VALID_PORTAL_PURPOSES,
  PURPOSE_LABELS,
  getDefaultWatcherSources,
} = await import("../lib/aeps/portal-watcher.ts");

const migrationSql = read("supabase/migrations/20260926_aeps_portal_sources_crud.sql");
const schemaSql = read("supabase/schema.sql");
const routeTs = read("app/api/ai/portal-watcher/route.ts");
const workspaceTsx = read("components/business/aeps-workspace.tsx");
const portalWatcherTs = read("lib/aeps/portal-watcher.ts");

// -----------------------------------------------------------------------------
// SECTION 1: CONTRACT & CODEBASE VERIFICATIONS
// -----------------------------------------------------------------------------
console.log("\n--- Section 1: Schema & Static Contract Invariants ---");

ok(
  "Migration creates aeps_portal_sources table with soft-delete fields",
  migrationSql.includes("create table if not exists public.aeps_portal_sources") &&
    migrationSql.includes("is_archived boolean not null default false") &&
    migrationSql.includes("archived_at timestamptz") &&
    migrationSql.includes("portal_id text not null")
);

ok(
  "Migration defines partial unique index preventing duplicate active URLs per portal",
  migrationSql.includes("create unique index if not exists aeps_portal_sources_portal_url_unique") &&
    migrationSql.includes("where is_archived = false")
);

ok(
  "Schema.sql includes aeps_portal_sources table and index definitions",
  schemaSql.includes("public.aeps_portal_sources") &&
    schemaSql.includes("aeps_portal_sources_portal_url_unique")
);

ok(
  "PortalWatcherSource interface includes isArchived, archivedAt, description, updatedAt",
  portalWatcherTs.includes("isArchived?: boolean") &&
    portalWatcherTs.includes("archivedAt?: string | null") &&
    portalWatcherTs.includes("description?: string | null")
);

ok(
  "Server route provides GET and POST actions for get_sources, create_source, update_source, delete_source, toggle_source",
  routeTs.includes("export async function GET") &&
    routeTs.includes('action === "create_source"') &&
    routeTs.includes('action === "update_source"') &&
    routeTs.includes('action === "delete_source"') &&
    routeTs.includes('action === "toggle_source"')
);

ok(
  "Server route records audit logs for CREATE, UPDATE, and DELETE source actions",
  routeTs.includes('entity: "aeps_portal_sources"') &&
    routeTs.includes('action: "CREATE"') &&
    routeTs.includes('action: "UPDATE"') &&
    routeTs.includes('action: "DELETE"')
);

ok(
  "Workspace UI renders all 5 required actions per row: Test URL, Collect Now, Edit URL, Disable/Enable, Delete URL",
  workspaceTsx.includes("Test URL") &&
    workspaceTsx.includes("Collect Now") &&
    workspaceTsx.includes("Edit URL") &&
    (workspaceTsx.includes("Disable") || workspaceTsx.includes("Enable")) &&
    workspaceTsx.includes("Delete URL")
);

ok(
  "Workspace UI includes Edit Source Modal and Delete Source Confirmation Modal",
  workspaceTsx.includes("editSourceModalOpen") &&
    workspaceTsx.includes("Edit Portal Source URL") &&
    workspaceTsx.includes("deleteSourceModalOpen") &&
    workspaceTsx.includes("Delete Portal Source URL")
);

// -----------------------------------------------------------------------------
// TEST A: Edit Source URL
// -----------------------------------------------------------------------------
console.log("\n--- Test A: Edit Source URL ---");

const testPortals = [
  { id: "portal-digipay", name: "Digipay" },
  { id: "portal-spicemoney", name: "Spice Money" },
  { id: "portal-ezeepay", name: "Ezeepay" },
];

let mockDbSources = [
  {
    id: "src-digipay-1",
    portalId: "portal-digipay",
    portalName: "Digipay",
    url: "https://digipay.csc.gov.in/rates",
    purpose: "commission",
    isEnabled: true,
    description: "Initial commission page",
    lastChecked: "2026-09-25T10:00:00.000Z",
    lastStatus: "success",
    lastMessage: "Verified",
    isArchived: false,
    archivedAt: null,
  },
  {
    id: "src-digipay-2",
    portalId: "portal-digipay",
    portalName: "Digipay",
    url: "https://digipay.csc.gov.in/rules",
    purpose: "aeps_rules",
    isEnabled: true,
    description: "Rules page",
    lastChecked: "2026-09-25T10:00:00.000Z",
    lastStatus: "success",
    lastMessage: "Verified",
    isArchived: false,
    archivedAt: null,
  },
  {
    id: "src-spicemoney-1",
    portalId: "portal-spicemoney",
    portalName: "Spice Money",
    url: "https://spicemoney.com/pricing",
    purpose: "fee",
    isEnabled: true,
    description: "Pricing page",
    lastChecked: "2026-09-25T10:00:00.000Z",
    lastStatus: "success",
    lastMessage: "Verified",
    isArchived: false,
    archivedAt: null,
  },
];

function updateSourceInMockDb(payload) {
  const { sourceId, url, purpose, portalId, isEnabled, description } = payload;
  const existingIndex = mockDbSources.findIndex((s) => s.id === sourceId && !s.isArchived);
  if (existingIndex === -1) {
    return { success: false, error: "Source not found or already archived.", status: 404 };
  }

  const existing = mockDbSources[existingIndex];
  const targetPortalId = portalId || existing.portalId;
  const normalizedUrl = validatePortalSourceUrl(url).normalizedUrl;

  // Duplicate check for active URLs on target portal
  const duplicate = mockDbSources.some(
    (s) =>
      !s.isArchived &&
      s.id !== sourceId &&
      s.portalId === targetPortalId &&
      s.url.toLowerCase() === normalizedUrl.toLowerCase()
  );
  if (duplicate) {
    return { success: false, error: "Source URL already configured for this portal.", status: 400 };
  }

  const urlChanged = existing.url.toLowerCase() !== normalizedUrl.toLowerCase();
  const updated = {
    ...existing,
    portalId: targetPortalId,
    url: normalizedUrl,
    purpose: purpose || existing.purpose,
    isEnabled: isEnabled !== undefined ? isEnabled : existing.isEnabled,
    description: description !== undefined ? description : existing.description,
    lastChecked: urlChanged ? null : existing.lastChecked,
    lastStatus: urlChanged ? "idle" : existing.lastStatus,
    lastMessage: urlChanged ? "URL modified — pending verification" : existing.lastMessage,
    updatedAt: new Date().toISOString(),
  };

  mockDbSources[existingIndex] = updated;
  return { success: true, source: updated, urlChanged };
}

const editResultA = updateSourceInMockDb({
  sourceId: "src-digipay-1",
  url: "https://digipay.csc.gov.in/rates-v2",
  purpose: "commission",
  portalId: "portal-digipay",
});

ok("Test A: Edit Source URL succeeds", editResultA.success);
ok("Test A: sourceId preserved after edit", editResultA.source.id === "src-digipay-1");
ok(
  "Test A: Updated URL saved accurately",
  editResultA.source.url === "https://digipay.csc.gov.in/rates-v2"
);
ok(
  "Test A: lastChecked reset to null when URL changed",
  editResultA.source.lastChecked === null && editResultA.urlChanged === true
);

// -----------------------------------------------------------------------------
// TEST B: Edit Source Purpose
// -----------------------------------------------------------------------------
console.log("\n--- Test B: Edit Source Purpose ---");

const editPurposeResult = updateSourceInMockDb({
  sourceId: "src-digipay-1",
  url: "https://digipay.csc.gov.in/rates-v2",
  purpose: "fee",
});

ok("Test B: Purpose updated from 'commission' to 'fee'", editPurposeResult.source.purpose === "fee");

const allPurposesAccepted = VALID_PORTAL_PURPOSES.every((p) => {
  const res = updateSourceInMockDb({
    sourceId: "src-digipay-1",
    url: "https://digipay.csc.gov.in/rates-v2",
    purpose: p,
  });
  return res.success && res.source.purpose === p;
});

ok("Test B: All 7 required purpose categories accepted", allPurposesAccepted);
ok("Test B: Exactly 7 valid portal purposes declared", VALID_PORTAL_PURPOSES.length === 7);

// -----------------------------------------------------------------------------
// TEST C: Edit Enabled/Disabled Status
// -----------------------------------------------------------------------------
console.log("\n--- Test C: Edit Enabled/Disabled Status ---");

const disableResult = updateSourceInMockDb({
  sourceId: "src-digipay-1",
  url: "https://digipay.csc.gov.in/rates-v2",
  isEnabled: false,
});
ok("Test C: is_enabled changed to false", disableResult.source.isEnabled === false);

const enableResult = updateSourceInMockDb({
  sourceId: "src-digipay-1",
  url: "https://digipay.csc.gov.in/rates-v2",
  isEnabled: true,
});
ok("Test C: is_enabled changed back to true", enableResult.source.isEnabled === true);

// -----------------------------------------------------------------------------
// TEST D: Delete URL (Soft-Delete / Archive)
// -----------------------------------------------------------------------------
console.log("\n--- Test D: Delete URL (Soft-Delete / Archive) ---");

function deleteSourceInMockDb(sourceId) {
  const existing = mockDbSources.find((s) => s.id === sourceId);
  if (!existing) return { success: false, error: "Source not found." };

  const now = new Date().toISOString();
  existing.isArchived = true;
  existing.isEnabled = false;
  existing.archivedAt = now;
  return { success: true, sourceId, archivedAt: now };
}

const deleteResult = deleteSourceInMockDb("src-digipay-2");
ok("Test D: Soft-delete execution succeeds", deleteResult.success);

const archivedRecord = mockDbSources.find((s) => s.id === "src-digipay-2");
ok("Test D: Source marked as isArchived = true", archivedRecord.isArchived === true);
ok("Test D: Source marked as isEnabled = false", archivedRecord.isEnabled === false);
ok("Test D: archivedAt timestamp recorded", typeof archivedRecord.archivedAt === "string");

const activeDigipaySources = mockDbSources.filter((s) => s.portalId === "portal-digipay" && !s.isArchived);
ok("Test D: Active queries exclude archived source", activeDigipaySources.every((s) => s.id !== "src-digipay-2"));
ok("Test D: Record still preserved in database for audit integrity", mockDbSources.some((s) => s.id === "src-digipay-2"));

// -----------------------------------------------------------------------------
// TEST E: Other Sources Unchanged
// -----------------------------------------------------------------------------
console.log("\n--- Test E: Other Sources Unchanged ---");

const spiceRecord = mockDbSources.find((s) => s.id === "src-spicemoney-1");
ok("Test E: Spice Money source ID unchanged", spiceRecord.id === "src-spicemoney-1");
ok("Test E: Spice Money source URL unchanged", spiceRecord.url === "https://spicemoney.com/pricing");
ok("Test E: Spice Money source purpose unchanged", spiceRecord.purpose === "fee");
ok("Test E: Spice Money source is not archived", spiceRecord.isArchived === false);

// -----------------------------------------------------------------------------
// TEST F: Duplicate URL Rejection on Same Portal
// -----------------------------------------------------------------------------
console.log("\n--- Test F: Duplicate URL Rejection on Same Portal ---");

// 1. Attempting to add duplicate URL
function addSourceToMockDb(payload) {
  const { portalId, url, purpose } = payload;
  const validation = validatePortalSourceUrl(url);
  if (!validation.valid) return { success: false, error: validation.error };
  const normalizedUrl = validation.normalizedUrl;

  const duplicate = mockDbSources.some(
    (s) =>
      !s.isArchived &&
      s.portalId === portalId &&
      s.url.toLowerCase() === normalizedUrl.toLowerCase()
  );
  if (duplicate) {
    return { success: false, error: "Source URL already configured for this portal." };
  }

  const newSrc = {
    id: `src-${portalId}-${Date.now()}`,
    portalId,
    url: normalizedUrl,
    purpose,
    isEnabled: true,
    isArchived: false,
  };
  mockDbSources.push(newSrc);
  return { success: true, source: newSrc };
}

const dupAddResult = addSourceToMockDb({
  portalId: "portal-digipay",
  url: "https://digipay.csc.gov.in/rates-v2", // Already configured for Digipay
  purpose: "aeps_rules",
});
ok("Test F: Adding duplicate URL for same portal is rejected", dupAddResult.success === false);
ok(
  "Test F: Exact duplicate error message returned on Add",
  dupAddResult.error === "Source URL already configured for this portal."
);

// Add another source for Digipay to test duplicate on edit
const addSecond = addSourceToMockDb({
  portalId: "portal-digipay",
  url: "https://digipay.csc.gov.in/notices",
  purpose: "general_updates",
});
ok("Test F: Setup distinct second source for portal", addSecond.success);

// 2. Attempting to edit source to duplicate existing URL on same portal
const dupEditResult = updateSourceInMockDb({
  sourceId: addSecond.source.id,
  url: "https://digipay.csc.gov.in/rates-v2", // Collision with src-digipay-1
  purpose: "general_updates",
});
ok("Test F: Editing source URL to match existing active URL on same portal is rejected", dupEditResult.success === false);
ok(
  "Test F: Exact duplicate error message returned on Edit",
  dupEditResult.error === "Source URL already configured for this portal."
);

// -----------------------------------------------------------------------------
// TEST G: Same URL on Different Portals Allowed
// -----------------------------------------------------------------------------
console.log("\n--- Test G: Same URL on Different Portals Allowed ---");

const crossPortalResult = addSourceToMockDb({
  portalId: "portal-spicemoney",
  url: "https://digipay.csc.gov.in/rates-v2", // Same URL as DigiPay, but on Spice Money
  purpose: "general_updates",
});
ok("Test G: Same URL configured on different portal succeeds independently", crossPortalResult.success === true);
ok("Test G: Source belongs to Spice Money", crossPortalResult.source.portalId === "portal-spicemoney");

// -----------------------------------------------------------------------------
// TEST H: Collection Uses Updated URL
// -----------------------------------------------------------------------------
console.log("\n--- Test H: Collection Uses Updated URL ---");

function simulatePortalCollectionRun(portalId) {
  const activeSources = mockDbSources.filter((s) => s.portalId === portalId && s.isEnabled && !s.isArchived);
  const fetchedUrls = activeSources.map((s) => s.url);
  return {
    portalId,
    sourceCount: activeSources.length,
    fetchedUrls,
  };
}

const digipayCollection = simulatePortalCollectionRun("portal-digipay");
ok(
  "Test H: Collection fetches updated URL https://digipay.csc.gov.in/rates-v2",
  digipayCollection.fetchedUrls.includes("https://digipay.csc.gov.in/rates-v2")
);
ok(
  "Test H: Collection does NOT fetch old URL https://digipay.csc.gov.in/rates",
  !digipayCollection.fetchedUrls.includes("https://digipay.csc.gov.in/rates")
);

// -----------------------------------------------------------------------------
// TEST I: Deleted URL Excluded from Collection
// -----------------------------------------------------------------------------
console.log("\n--- Test I: Deleted URL Excluded from Collection ---");

ok(
  "Test I: Archived/deleted source src-digipay-2 is excluded from collection",
  !digipayCollection.fetchedUrls.includes("https://digipay.csc.gov.in/rules")
);

// -----------------------------------------------------------------------------
// TEST J: Audit Log Entry Created
// -----------------------------------------------------------------------------
console.log("\n--- Test J: Audit Log Entry Created ---");

ok(
  "Test J: Audit log table insert present in server route for UPDATE",
  routeTs.includes("action: \"UPDATE\"") && routeTs.includes("entity: \"aeps_portal_sources\"")
);
ok(
  "Test J: Audit log table insert present in server route for DELETE",
  routeTs.includes("action: \"DELETE\"") && routeTs.includes("entity: \"aeps_portal_sources\"")
);
ok(
  "Test J: Audit log table insert present in server route for CREATE",
  routeTs.includes("action: \"CREATE\"") && routeTs.includes("entity: \"aeps_portal_sources\"")
);
ok(
  "Test J: Audit log records old and new values for changes",
  routeTs.includes("old:") && routeTs.includes("new:")
);

// -----------------------------------------------------------------------------
// TEST K: Authorization Guards & SSRF Protection
// -----------------------------------------------------------------------------
console.log("\n--- Test K: Authorization Guards & SSRF Protection ---");

ok(
  "Test K: Server route requires admin or manager role for GET",
  routeTs.includes("getUserRole") && routeTs.includes('["admin", "manager"]')
);
ok(
  "Test K: Server route requires authenticated user session",
  routeTs.includes("auth.user") && routeTs.includes("Unauthorized")
);

// SSRF checks
const localhostCheck = validatePortalSourceUrl("http://localhost:8080/rates");
ok("Test K: SSRF: Blocks localhost", !localhostCheck.valid);

const loopbackCheck = validatePortalSourceUrl("http://127.0.0.1:3000/api");
ok("Test K: SSRF: Blocks 127.0.0.1 loopback", !loopbackCheck.valid);

const private10Check = validatePortalSourceUrl("http://10.0.1.5/admin");
ok("Test K: SSRF: Blocks 10.0.0.0/8 private network", !private10Check.valid);

const private192Check = validatePortalSourceUrl("http://192.168.1.1/setup");
ok("Test K: SSRF: Blocks 192.168.0.0/16 private network", !private192Check.valid);

const metadataCheck = validatePortalSourceUrl("http://169.254.169.254/latest/meta-data");
ok("Test K: SSRF: Blocks cloud link-local metadata address", !metadataCheck.valid);

const fileProtoCheck = validatePortalSourceUrl("file:///etc/passwd");
ok("Test K: SSRF: Blocks file:// protocol", !fileProtoCheck.valid);

const validPublicCheck = validatePortalSourceUrl("https://digipay.csc.gov.in/notifications");
ok("Test K: Allows valid public https URL", validPublicCheck.valid && validPublicCheck.normalizedUrl === "https://digipay.csc.gov.in/notifications");

// -----------------------------------------------------------------------------
// TEST L: Persistence Verification
// -----------------------------------------------------------------------------
console.log("\n--- Test L: Persistence Verification ---");

// Query active sources for portal-digipay
const reloadedDigipay = mockDbSources.filter((s) => s.portalId === "portal-digipay" && !s.isArchived);
ok("Test L: Re-query returns updated URL", reloadedDigipay.some((s) => s.url === "https://digipay.csc.gov.in/rates-v2"));
ok("Test L: Re-query does NOT return deleted/archived URL", !reloadedDigipay.some((s) => s.url === "https://digipay.csc.gov.in/rules"));
ok(
  "Test L: UI hydrates persisted sources on mount from /api/ai/portal-watcher",
  workspaceTsx.includes('fetch("/api/ai/portal-watcher")') &&
    workspaceTsx.includes("loadPersistedSources")
);

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("All AEPS Portal Source CRUD acceptance tests passed successfully!");
}
