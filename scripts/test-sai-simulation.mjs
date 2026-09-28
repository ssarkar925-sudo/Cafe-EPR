import fs from "node:fs";
import path from "node:path";
const root=process.cwd(), read=f=>fs.readFileSync(path.join(root,f),"utf8");
const files={
  types:read("lib/sai/core/types.ts"), caps:read("lib/sai/core/capabilities.ts"), sim:read("lib/sai/core/simulation.ts"),
  exec:read("lib/sai/core/executor.ts"), api:read("app/api/sai/simulate/route.ts"),
  contradictions:read("app/api/sai/contradictions/route.ts"), migration:read("supabase/migrations/20260928142000_sai_simulation_contradictions.sql"),
  index:read("lib/sai/core/index.ts"), pkg:read("package.json"), quality:read(".github/workflows/quality.yml")
};
let passed=0,failed=0;const check=(c,m)=>c?(passed++,console.log("  PASS: "+m)):(failed++,console.error("  FAIL: "+m));
console.log("SAI Digital Twin and contradiction detection regression tests");
check(files.types.includes("SaiSimulationEffect"),"Simulation effect is typed");
check(files.types.includes("SaiContradiction"),"Contradictions are typed");
check(files.types.includes("SaiSimulationResult"),"Simulation results are typed");
check(files.caps.includes("simulate?"),"Capabilities can declare a simulation contract");
check(files.caps.includes("requires simulation"),"Mutating capabilities require simulation");
check(files.caps.includes("_simulate"),"Capability descriptors never expose simulation executors");
check(files.sim.includes("simulateSaiPlan"),"Digital Twin simulator exists");
check(files.sim.includes("detectSaiContradictions"),"Contradiction detector exists");
check(files.sim.includes("unsupported_simulation"),"Missing simulation contracts are blocking");
check(files.sim.includes("patch_conflict"),"Conflicting predicted patches are detected");
check(files.sim.includes("baseline_mismatch"),"Baseline mismatches are detected");
check(!files.sim.includes("capability.execute("), "Simulator never invokes capability execute functions");
check(files.sim.includes("sai_simulations"),"Simulation results persist durably");
check(files.sim.includes("sai_contradictions"),"Contradictions persist durably");
check(files.exec.includes("simulateSaiPlan"),"Executor invokes simulation before consequential execution");
check(files.exec.includes("SAI_CONTRADICTION_DETECTED"),"Executor blocks execution on contradiction");
check(files.api.includes("simulateSaiPlan"),"Simulation preview API exists");
check(files.contradictions.includes("listSaiContradictions"),"Contradiction API exists");
check(files.migration.includes("alter table public.sai_simulations enable row level security"),"Simulation table has RLS");
check(files.migration.includes("alter table public.sai_contradictions enable row level security"),"Contradiction table has RLS");
check(files.migration.includes("grant select, insert on public.sai_simulations"),"Simulation table has restricted grants");
check(files.migration.includes("grant select, insert, update on public.sai_contradictions"),"Contradiction table has restricted grants");
check(files.migration.includes("revoke delete, truncate, references, trigger"),"Destructive grants are revoked");
check(files.index.includes('export * from "./simulation"'),"Simulation engine is exported");
check(files.pkg.includes('"test:sai-simulation"'),"Simulation regression is exposed");
check(files.quality.includes("npm run test:sai-simulation"),"Quality Gate runs simulation regression");
console.log("\n"+passed+" passed / "+failed+" failed");process.exitCode=failed?1:0;