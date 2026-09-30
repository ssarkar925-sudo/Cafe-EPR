import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const checks = [];

function ok(name, condition) {
  checks.push({ name, condition });
  console.log(condition ? `PASS: ${name}` : `FAIL: ${name}`);
}

const nextConfig = read("next.config.mjs");
const layout = read("app/layout.tsx");
const shell = read("components/dashboard-shell.tsx");
const quality = read(".github/workflows/quality.yml");
const restore = read(".github/workflows/test-restore-isolated.yml");
const migrationPath = "supabase/migrations/20260930034740_production_hardening.sql";
const migration = read(migrationPath);

ok("Next.js build does not ignore TypeScript errors", !nextConfig.includes("ignoreBuildErrors"));
ok("Next.js build does not skip linting via ignoreDuringBuilds", !nextConfig.includes("ignoreDuringBuilds"));
ok("Mobile viewport allows user scaling", !layout.includes("userScalable: false") && !layout.includes("maximumScale: 1"));
ok("Dashboard role label is data-driven", shell.includes("const roleLabel =") && shell.includes("{roleLabel}") && !shell.includes("Owner • Admin"));
ok("Quality Gate runs lint", quality.includes("npm run lint"));
for (const command of [
  "test:qa",
  "test:reconciliation",
  "test:idempotency-client",
  "test:v1-foundation",
  "test:v1-phase2",
  "test:v1-phase3",
  "test:v1-services",
  "test:v1-day-close",
  "test:v1-back-entry",
  "test:v1-offline-sync",
  "test:v1-returns-refunds",
  "test:customer-search",
  "test:customer-creation",
  "test:quick-sale-exclusion",
  "test:whatsapp-document",
]) {
  ok(`Quality Gate includes ${command}`, quality.includes(`npm run ${command}`));
}
ok("Restore certification is scheduled", restore.includes("30 3 * * 0"));
ok("Restore certification fails on pg_restore errors", !/pg_restore[^\n]*\|\|\s*true/.test(restore));
ok("Restore certification enables exit-on-error", restore.includes("--exit-on-error"));
ok("Production hardening migration is versioned", migration.includes("20260930 production hardening"));
ok("Trigger helpers have pinned search_path", migration.includes("assign_customer_code() SET search_path = public") && migration.includes("prune_ai_conversations() SET search_path = public"));
ok("Trigger helpers are not directly executable by authenticated clients", migration.includes("REVOKE EXECUTE ON FUNCTION public.assign_customer_code() FROM PUBLIC, anon, authenticated") && migration.includes("REVOKE EXECUTE ON FUNCTION public.prune_ai_conversations() FROM PUBLIC, anon, authenticated"));
ok("Authenticated clients cannot TRUNCATE core ERP tables", migration.includes("REVOKE TRUNCATE ON TABLE"));

const failed = checks.filter((c) => !c.condition);
console.log(`\\nProduction hardening contract: ${checks.length - failed.length} passed / ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
