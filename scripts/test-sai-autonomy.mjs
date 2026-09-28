import fs from "node:fs";
import path from "node:path";

const root=process.cwd(), read=f=>fs.readFileSync(path.join(root,f),"utf8");
const files={
  types:read("lib/sai/core/types.ts"), policy:read("lib/sai/core/policy.ts"), command:read("lib/sai/core/command.ts"),
  executor:read("lib/sai/core/executor.ts"), attention:read("lib/sai/core/attention.ts"),
  autonomyApi:read("app/api/sai/autonomy/route.ts"), attentionApi:read("app/api/sai/attention/route.ts"),
  migration:read("supabase/migrations/20260928140900_sai_autonomy_policy.sql"),
  hardening:read("supabase/migrations/20260928141000_sai_autonomy_policy_hardening.sql"),
  quality:read(".github/workflows/quality.yml"), pkg:read("package.json"), index:read("lib/sai/core/index.ts")
};
let passed=0,failed=0;
const check=(c,m)=>c?(passed++,console.log("  PASS: "+m)):(failed++,console.error("  FAIL: "+m));
console.log("SAI autonomy and attention policy regression tests");
check(files.types.includes("SaiExecutionMode"),"Execution mode is typed");
check(files.types.includes("SaiAutonomyPolicy"),"Autonomy policy is typed");
check(files.types.includes("SaiAutonomyDecision"),"Autonomy decision is typed");
check(files.policy.includes("getSaiAutonomyPolicy"),"Policy is durably loaded");
check(files.policy.includes("saveSaiAutonomyPolicy"),"Policy is durably configurable");
check(files.policy.includes("AUTONOMY_RISK_ABOVE_CEILING"),"Risk ceiling blocks autonomous execution");
check(files.policy.includes("AUTONOMY_QUIET_HOURS"),"Quiet hours block background work");
check(files.policy.includes("AUTONOMY_CRITICAL_INTERRUPT"),"Critical interrupt path exists");
check(files.policy.includes("consumeSaiAutonomyBudget"),"Autonomy budget is consumed atomically");
check(files.command.includes("evaluateSaiAutonomy"),"Command execution consults autonomy policy");
check(files.command.includes('mode: SaiExecutionMode = "operator"'),"Operator mode remains default");
check(files.command.includes("AUTONOMY_BUDGET_EXHAUSTED"),"Budget exhaustion blocks execution");
check(files.executor.includes("mode: SaiExecutionMode"),"Plan execution propagates execution mode");
check(files.executor.includes("executeSaiCommand(command, approvalId, mode)"),"Plan execution propagates autonomy mode to commands");
check(files.attention.includes("rankSaiAttention"),"Attention has deterministic prioritization");
check(files.attention.includes("SEVERITY_SCORE"),"Attention severity contributes to priority");
check(files.attentionApi.includes("rankSaiAttention"),"Attention API returns prioritized attention");
check(files.autonomyApi.includes("saveSaiAutonomyPolicy"),"Autonomy API persists policy");
check(files.autonomyApi.includes('hasRole(role, ["admin", "manager"])'),"Autonomy writes are management gated");
check(files.migration.includes("alter table public.sai_autonomy_policies enable row level security"),"Autonomy policy table enables RLS");
check(files.migration.includes("sai_autonomy_policies_staff_read"),"Autonomy policy read policy exists");
check(files.hardening.includes("sai_autonomy_policies_management_insert"),"Management insert policy exists");
check(files.hardening.includes("sai_autonomy_policies_management_update"),"Management update policy exists");
check(files.hardening.includes("revoke delete, truncate, references, trigger"),"Autonomy policy cannot be destructively altered by authenticated users");
check(files.migration.includes("security definer"),"Budget helper is isolated behind a database function");
check(files.migration.includes("set search_path=public"),"Budget helper pins search_path");
check(files.hardening.includes("revoke execute on function"),"Budget helper is not publicly executable");
check(!files.migration.includes("auth.role()"),"Autonomy policies avoid deprecated auth.role()");
check(files.index.includes('export * from "./attention"'),"Attention engine is exported");
check(files.quality.includes("npm run test:sai-autonomy"),"Quality Gate runs autonomy regression");
check(files.pkg.includes('"test:sai-autonomy"'),"Package exposes autonomy regression");
console.log("\n"+passed+" passed / "+failed+" failed");
process.exitCode=failed?1:0;