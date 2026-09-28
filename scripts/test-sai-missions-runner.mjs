import fs from "node:fs";
import path from "node:path";
const root=process.cwd(), read=f=>fs.readFileSync(path.join(root,f),"utf8");
const files={
  types:read("lib/sai/core/types.ts"), runner:read("lib/sai/core/mission-runner.ts"), executor:read("lib/sai/core/executor.ts"),
  api:read("app/api/sai/missions/run/route.ts"), index:read("lib/sai/core/index.ts"), pkg:read("package.json"), quality:read(".github/workflows/quality.yml")
};
let passed=0,failed=0;const check=(c,m)=>c?(passed++,console.log("  PASS: "+m)):(failed++,console.error("  FAIL: "+m));
console.log("SAI background mission runner regression tests");
check(files.types.includes('SaiExecutionMode = "operator" | "background"'),"Background execution mode is typed");
check(files.runner.includes("runSaiMission"),"Mission runner executes a specific mission");
check(files.runner.includes("runNextSaiMission"),"Mission runner can claim the next queued mission");
check(files.runner.includes('.in("status", ["queued", "waiting_approval"])'),"Mission claim is conditional");
check(files.runner.includes("compileSaiMissionPlan"),"Runner compiles the authoritative mission plan");
check(files.runner.includes('"background"'),"Runner executes with background autonomy mode");
check(files.runner.includes("OWNER_APPROVAL_REQUIRED"),"Approval-gated missions enter waiting approval");
check(files.runner.includes("AUTONOMY_BUDGET_EXHAUSTED"),"Autonomy budget blocks a mission");
check(files.runner.includes("persistMissionStatus"),"Mission outcome is persisted durably");
check(files.runner.includes('eventType: "mission.claimed"'),"Mission claim is traced");
check(files.runner.includes('eventType: "mission.completed"'),"Mission outcome is traced");
check(files.runner.includes('eventType: "mission.failed"'),"Mission failure is traced");
check(!/from\(["'](?:invoices|payments|invoice_items|transactions|customer_ledger|journal_entries|journal_lines)["']\)/.test(files.runner),"Mission runner never queries financial authority tables");
check(files.api.includes("runNextSaiMission"),"Mission run API supports queue consumption");
check(files.api.includes("runSaiMission"),"Mission run API supports targeted execution");
check(files.index.includes('export * from "./mission-runner"'),"Mission runner exported");
check(files.quality.includes("npm run test:sai-missions-runner"),"Quality Gate runs mission runner regression");
check(files.pkg.includes('"test:sai-missions-runner"'),"Package exposes mission runner regression");
console.log("\n"+passed+" passed / "+failed+" failed");process.exitCode=failed?1:0;