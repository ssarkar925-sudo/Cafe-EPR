import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const files = {
  types: read("lib/sai/core/types.ts"),
  trace: read("lib/sai/core/trace.ts"),
  explanation: read("lib/sai/core/explanation.ts"),
  executor: read("lib/sai/core/executor.ts"),
  runtime: read("lib/sai/cognition/runtime.ts"),
  traceApi: read("app/api/sai/traces/route.ts"),
  explainApi: read("app/api/sai/explain/route.ts"),
  migration: read("supabase/migrations/20260928134345_sai_execution_traces.sql"),
  rlsFix: read("supabase/migrations/20260929073500_sai_execution_traces_rls_recursion_fix.sql"),
  hardening: read("supabase/migrations/20260928135100_sai_execution_traces_grant_hardening.sql"),
  quality: read(".github/workflows/quality.yml"),
  pkg: read("package.json"),
  index: read("lib/sai/core/index.ts"),
};

let passed = 0;
let failed = 0;
const check = (condition, message) => {
  if (condition) {
    passed += 1;
    console.log("  PASS: " + message);
  } else {
    failed += 1;
    console.error("  FAIL: " + message);
  }
};

console.log("SAI execution tracing and explanation regression tests");
check(files.types.includes("SaiTracePhase"), "Trace phases are typed");
check(files.types.includes("SaiTraceRecord"), "Trace records are typed");
check(files.trace.includes("createSaiTraceId"), "Trace IDs are generated");
check(files.trace.includes("sai_execution_traces"), "Trace spans persist");
check(files.trace.includes('.eq("business_id", actor.businessId)'), "Trace reads are business scoped");
check(files.trace.includes('.eq("actor_user_id", actor.userId)'), "Trace reads are actor scoped");
check(files.trace.includes("sequenceNo"), "Trace ordering is explicit");
check(files.trace.includes("SAI_TRACE_IDEMPOTENCY_READ_FAILED"), "Trace retries are idempotent");
check(files.executor.includes("recordSaiTrace"), "Executor records trace spans");
check(files.executor.includes('eventType: "step.decision"'), "Decision spans exist");
check(files.executor.includes('eventType: "command.result"'), "Result spans exist");
check(files.executor.includes('eventType: "approval.gate"'), "Approval gates are traced");
check(files.executor.includes('eventType: "command.verification"'), "Verification spans exist");
check(files.runtime.includes("createSaiTraceId"), "Instruction runtime creates a trace");
check(files.runtime.includes("instruction.failed"), "Runtime failures are traced");
check(files.runtime.includes('sequenceNo: 7'), "Trace lifecycle reaches REMEMBER");
check(files.explanation.includes("explainSaiTrace"), "Explanation is deterministic");
check(files.explanation.includes("evidenceIds"), "Explanation retains evidence ids");
check(files.traceApi.includes("getRecentSaiTraces"), "Recent traces API exists");
check(files.traceApi.includes("getSaiTraceExplanation"), "Trace API returns explanations");
check(files.explainApi.includes("getSaiTraceExplanation"), "Dedicated explanation API exists");
check(files.index.includes('export * from "./trace"'), "Trace engine exported");
check(files.index.includes('export * from "./explanation"'), "Explanation engine exported");
check(files.migration.includes("alter table public.sai_execution_traces enable row level security"), "Trace RLS enabled");
check(files.migration.includes("sai_execution_traces_staff_read"), "Trace read policy exists");
check(files.migration.includes("sai_execution_traces_staff_insert"), "Trace insert policy exists");
check(!/grant .*update/i.test(files.migration), "Base migration has no UPDATE grant");
check(!/grant .*delete/i.test(files.migration), "Base migration has no DELETE grant");
check(/create schema if not exists private authorization postgres/i.test(files.rlsFix), "RLS helper lives in the private schema");
check(/security definer[\\s\\S]*set search_path = pg_catalog/i.test(files.rlsFix), "RLS helper uses a locked search path");
check(/p_actor_user_id = \\(select auth\\.uid\\(\\)\\)/i.test(files.rlsFix), "Parent helper only checks the current actor");
check(/parent\\.business_id = p_business_id[\\s\\S]*parent\\.trace_id = p_trace_id/i.test(files.rlsFix), "Parent helper scopes matches to business and trace");
check(/private\\.sai_execution_trace_parent_allowed\\(/i.test(files.rlsFix), "INSERT policy delegates parent validation to the helper");
check(!/exists\\s*\\(\\s*select 1\\s+from public\\.sai_execution_traces parent/i.test(files.rlsFix), "INSERT policy has no recursive direct self-query");
check(/revoke all on function[\\s\\S]*from public, anon, authenticated/i.test(files.rlsFix), "Parent helper execution is revoked by default");
check(/grant execute on function[\\s\\S]*to authenticated/i.test(files.rlsFix), "Only authenticated clients may call the RLS helper");
check(/revoke\s+update,\s*delete/i.test(files.hardening), "Grant hardening revokes UPDATE and DELETE");
check(/revoke\s+update,\s*delete,\s*truncate,\s*references,\s*trigger/i.test(files.hardening), "Grant hardening removes all non-required write privileges");
check(files.quality.includes("npm run test:sai-tracing"), "Quality Gate runs trace regression");
check(files.pkg.includes('"test:sai-tracing"'), "Package exposes trace regression");

console.log("\n" + passed + " passed / " + failed + " failed");
process.exitCode = failed ? 1 : 0;
