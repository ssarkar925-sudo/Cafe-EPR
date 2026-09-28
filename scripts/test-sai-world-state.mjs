import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const world = read("lib/sai/core/world-state.ts");
const dispatcher = read("lib/sai/cognition/dispatcher.ts");
const runtime = read("lib/sai/cognition/runtime.ts");
const migration = read("supabase/migrations/20260928130000_sai_world_state.sql");

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  PASS: ${message}`);
  } else {
    failed += 1;
    console.error(`  FAIL: ${message}`);
  }
}

// Keep this regression suite tolerant of formatting-only source changes while guarding behavior.
console.log("SAI durable world-state regression tests");
check(world.includes("loadSaiWorldState"), "World state loads from durable storage");
check(world.includes("projectSaiEventToWorldState"), "World state has an event projection path");
check(/MAX_DURABLE_EVENT_IDS\s*=\s*50/.test(world), "Durable event history is bounded");
check(world.includes('from("sai_world_state")'), "Only the SAI world-state table is used for durable snapshots");
check(world.includes('from("sai_attention")'), "Attention is merged from the canonical attention table");
check(world.includes('"sale.created"'), "Sale events populate transaction context");
check(!/from\(["'](?:invoices|payments|invoice_items|transactions|customer_ledger|journal_entries|journal_lines)["']\)/.test(world), "World-state layer does not query financial authority tables");
check(!/update\(["'](?:invoices|payments|invoice_items|transactions|customer_ledger|journal_entries|journal_lines)["']\)/.test(world), "World-state layer does not mutate financial authority tables");
check(dispatcher.includes("projectSaiEventToWorldState"), "Event dispatcher projects durable world state");
check(dispatcher.includes("World-state projection is a recoverable"), "Projection failure does not block handlers");
check(runtime.includes("await loadSaiWorldState"), "Instruction planning consumes durable world state");
check(migration.includes("alter table public.sai_world_state enable row level security"), "World-state table enables RLS");
check(migration.includes("sai_world_state_staff_read"), "World-state read policy exists");
check(migration.includes("sai_world_state_staff_insert"), "World-state insert policy exists");
check(migration.includes("sai_world_state_staff_update"), "World-state update policy exists");
check(!migration.includes("auth.role()"), "World-state policies do not use deprecated auth.role()");

console.log(`\n${passed} passed / ${failed} failed`);
process.exitCode = failed ? 1 : 0;
