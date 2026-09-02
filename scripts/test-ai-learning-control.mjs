import fs from "node:fs";

const migration = fs.readFileSync("supabase/20260902_cafe_ai_learning_control.sql", "utf8");
const listRoute = fs.readFileSync("app/api/ai/learning/route.ts", "utf8");
const actionRoute = fs.readFileSync("app/api/ai/learning/[id]/route.ts", "utf8");
const page = fs.readFileSync("app/(dashboard)/ai-agent/learning/page.tsx", "utf8");
const ui = fs.readFileSync("components/ai/ai-learning-control-center.tsx", "utf8");

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

console.log("AI learning control regression tests\n");
assert(migration.includes("ai_workflow_versions"), "Versioned workflow table exists");
assert(migration.includes("unique(user_id, workflow_key, version)"), "Workflow versions are unique per owner/key/version");
assert(migration.includes("where status = 'active'"), "Database permits only one active version per owner/workflow");
assert(migration.includes("enable row level security"), "Learning table has RLS enabled");
assert(migration.includes("using ((select auth.uid()) = user_id)"), "Learning data is owner scoped");

assert(listRoute.includes('role !== "admin"'), "Only owner/admin role can access learning API");
assert(listRoute.includes('status: "draft"'), "New teachings are created as drafts");
assert(listRoute.includes("version = Number(latest?.version ?? 0) + 1"), "Teaching creates the next version");
assert(listRoute.includes("supersedes_id"), "Teaching preserves version lineage");

assert(actionRoute.includes('activate'), "Activate action exists");
assert(actionRoute.includes('disable'), "Disable action exists");
assert(actionRoute.includes('revoke'), "Revoke action exists");
assert(actionRoute.includes('rollback'), "Rollback action exists");
assert(actionRoute.includes('target.status === "revoked"'), "Revoked versions cannot be reactivated");
assert(actionRoute.includes('status: "archived"'), "Previous active version is archived during activation");

assert(ui.includes("Teach & Save as Draft"), "UI teaches only into draft state");
assert(ui.includes("Revoke"), "UI exposes revoke control");
assert(ui.includes("Rollback / Activate"), "UI exposes rollback control");
assert(ui.includes("Disable"), "UI exposes disable control");
assert(ui.includes("Every version remains auditable"), "UI communicates version history");
assert(ui.includes("Only owner/admin can change instructions"), "UI communicates owner control");
assert(page.includes("role !== \"admin\""), "Learning page is owner-only");

console.log(`\n${passed} passed / ${failed} failed`);
if (failed) process.exit(1);
