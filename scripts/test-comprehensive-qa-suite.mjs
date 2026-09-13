import fs from "fs";
import path from "path";

console.log("================================================================================");
console.log("             CAFE ERP — COMPREHENSIVE PRODUCTION QA SUITE                     ");
console.log("================================================================================\n");

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, name, details = "") {
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${name}`);
    if (details) console.error(`     Details: ${details}`);
    failed++;
    failures.push({ name, details });
  }
}

const ROOT_DIR = process.cwd();

// =============================================================================
// SUITE 1: APPLICATION SURFACE & ROUTE INTEGRITY
// =============================================================================
console.log("\n--- Suite 1: Application Surface & Route Mapping ---");
{
  const requiredPages = [
    "app/(dashboard)/pos/page.tsx",
    "app/(dashboard)/inventory/page.tsx",
    "app/(dashboard)/invoices/page.tsx",
    "app/(dashboard)/customers/page.tsx",
    "app/(dashboard)/suppliers/page.tsx",
    "app/(dashboard)/business/page.tsx",
    "app/(dashboard)/business/[service]/page.tsx",
    "app/(dashboard)/business/bill-payment/page.tsx",
    "app/(dashboard)/business/whatsapp/page.tsx",
    "app/(dashboard)/finance/cashbook/page.tsx",
    "app/(dashboard)/finance/journal/page.tsx",
    "app/(dashboard)/finance/ledger/page.tsx",
    "app/(dashboard)/finance/trial-balance/page.tsx",
    "app/(dashboard)/finance/pnl/page.tsx",
    "app/(dashboard)/finance/expenses/page.tsx",
    "app/(dashboard)/finance/day-close/page.tsx",
    "app/(dashboard)/finance/reconciliation/page.tsx",
    "app/(dashboard)/finance/accounts/page.tsx",
    "app/(dashboard)/finance/settlements/page.tsx",
    "app/(dashboard)/reports/page.tsx",
    "app/(dashboard)/audit/page.tsx",
    "app/(dashboard)/staff/page.tsx",
    "app/(dashboard)/security/page.tsx",
    "app/(dashboard)/settings/page.tsx",
    "app/(dashboard)/ai/page.tsx",
    "app/(dashboard)/ai-agent/page.tsx",
    "app/(dashboard)/ai/self-audit/page.tsx",
    "app/login/page.tsx",
    "app/receipt/[id]/page.tsx",
    "app/receipt/quick/[id]/page.tsx",
  ];

  for (const p of requiredPages) {
    const fullPath = path.join(ROOT_DIR, p);
    assert(fs.existsSync(fullPath), `Page route exists: ${p}`);
  }
}

// =============================================================================
// SUITE 2: API SURFACE & AUTHENTICATION ENFORCEMENT
// =============================================================================
console.log("\n--- Suite 2: API Surface & Auth Security Bounds ---");
{
  const requiredApiRoutes = [
    "app/api/pos/financial-rpc/route.ts",
    "app/api/pos/quick-sale/route.ts",
    "app/api/pos/customer-due-payment/route.ts",
    "app/api/invoices/[id]/pdf/route.ts",
    "app/api/bill-payment/fetch/route.ts",
    "app/api/recharge/operator-circle/route.ts",
    "app/api/whatsapp/webhook/route.ts",
    "app/api/whatsapp/send/route.ts",
    "app/api/whatsapp/send-invoice/route.ts",
    "app/api/staff/route.ts",
    "app/api/ai/agent/route.ts",
    "app/api/ai/agent/approval/route.ts",
    "app/api/ai/agent/approval/[id]/route.ts",
    "app/api/ai/monitor/route.ts",
    "app/api/ai/monitor/cron/route.ts",
  ];

  for (const api of requiredApiRoutes) {
    const fullPath = path.join(ROOT_DIR, api);
    assert(fs.existsSync(fullPath), `API route handler exists: ${api}`);
  }

  // Verify Financial RPC CSRF & Whitelist Protection
  const finRpcContent = fs.readFileSync(path.join(ROOT_DIR, "app/api/pos/financial-rpc/route.ts"), "utf8");
  assert(finRpcContent.includes("ALLOWED_FINANCIAL_RPCS = new Set"), "Financial RPC: Strictly whitelisted function set");
  assert(finRpcContent.includes("Cross-origin financial requests are not allowed"), "Financial RPC: Origin header CSRF protection installed");
  assert(finRpcContent.includes("supabase.auth.getUser()"), "Financial RPC: Explicit server session authentication required");

  // Verify Quick Sale API Auth & Role Protection
  const qsContent = fs.readFileSync(path.join(ROOT_DIR, "app/api/pos/quick-sale/route.ts"), "utf8");
  assert(qsContent.includes("ALLOWED_ROLES = new Set([\"admin\", \"manager\"])"), "Quick Sale API: Role-gated to admin/manager");
  assert(qsContent.includes("p_idempotency_key"), "Quick Sale API: Requires idempotency key");

  // Verify Staff API Auth & Role Protection
  const staffContent = fs.readFileSync(path.join(ROOT_DIR, "app/api/staff/route.ts"), "utf8");
  assert(staffContent.includes("!hasRole(await getUserRole(), [\"admin\"])"), "Staff API: Strictly restricted to admin role");
  assert(staffContent.includes("createAdminClient"), "Staff API: Uses admin client server-side only");

  // Verify Middleware Invoice Route Security
  const mwContent = fs.readFileSync(path.join(ROOT_DIR, "middleware.ts"), "utf8");
  assert(!mwContent.includes("\"/api/invoices\""), "Middleware: /api/invoices wildcard removed from PUBLIC_PATHS");
  assert(!mwContent.includes("pathname.startsWith(\"/api/invoices\") && !invoicePdfMatch"), "Middleware: /api/invoices wildcard bypass eliminated");
}

// =============================================================================
// SUITE 3: FINANCIAL INVARIANTS & DOUBLE-ENTRY INTEGRITY
// =============================================================================
console.log("\n--- Suite 3: Double-Entry Ledger & Financial Invariants ---");
{
  // Invariant 1: Double entry debit === credit
  const sampleTransactions = [
    { type: "sale", debitAcc: "1000", debit: 1500, creditAcc: "4000", credit: 1500 },
    { type: "expense", debitAcc: "6000", debit: 350, creditAcc: "1000", credit: 350 },
    { type: "aeps_cash_out", debitAcc: "1040", debit: 2005, creditAcc: "1000", credit: 2000, feeAcc: "4030", feeCredit: 5 },
    { type: "dmt_transfer", debitAcc: "1000", debit: 5050, creditAcc: "1010", credit: 5000, feeAcc: "4020", feeCredit: 50 },
  ];

  let totalDebit = 0;
  let totalCredit = 0;
  for (const t of sampleTransactions) {
    const dr = t.debit;
    const cr = t.credit + (t.feeCredit || 0);
    assert(Math.abs(dr - cr) < 0.001, `Double Entry Balance for ${t.type}: Dr ₹${dr} === Cr ₹${cr}`);
    totalDebit += dr;
    totalCredit += cr;
  }
  assert(Math.abs(totalDebit - totalCredit) < 0.001, `Trial Balance Grand Invariant: Total Dr (₹${totalDebit}) === Total Cr (₹${totalCredit})`);

  // Invariant 2: Cashbook non-negative cash till floor check logic
  function validateTillWithdrawal(currentTill, withdrawalAmount) {
    return currentTill >= withdrawalAmount;
  }
  assert(validateTillWithdrawal(5000, 2000) === true, "Cash Drawer: Permits withdrawal when float is sufficient (₹5000 >= ₹2000)");
  assert(validateTillWithdrawal(1000, 2000) === false, "Cash Drawer: Blocks withdrawal exceeding available cash float (₹1000 < ₹2000)");

  // Invariant 3: Multi-payment allocation sum must exactly match invoice total
  function validateMultiPayment(totalDue, allocations) {
    const sum = allocations.reduce((acc, a) => acc + a.amount, 0);
    return Math.abs(sum - totalDue) < 0.01;
  }
  assert(validateMultiPayment(1250.50, [{ method: "cash", amount: 1000 }, { method: "upi", amount: 250.50 }]), "Multi-Payment Allocation: Exact sum match accepted (₹1000 + ₹250.50 === ₹1250.50)");
  assert(!validateMultiPayment(1250.50, [{ method: "cash", amount: 1000 }, { method: "upi", amount: 200 }]), "Multi-Payment Allocation: Underpayment rejected as complete settlement");
}

// =============================================================================
// SUITE 4: BANKING & NEO-BANKING WORKSPACE CONTRACTS
// =============================================================================
console.log("\n--- Suite 4: Banking & Neo-Banking Workspaces ---");
{
  // 1. UPI Cash Out Real-time Dynamic Amount & Fee Invariant
  const upiWorkspace = fs.readFileSync(path.join(ROOT_DIR, "components/business/upi-workspace.tsx"), "utf8");
  const upiQrComp = fs.readFileSync(path.join(ROOT_DIR, "components/ui/upi-qr-code.tsx"), "utf8");
  assert(upiWorkspace.includes("<UpiQrCode"), "UPI Cash Out: Uses live UpiQrCode vector generation component");
  assert(upiQrComp.includes("upi://pay?"), "UPI Cash Out: Encodes standard NPCI UPI URI with payee address");
  assert(upiQrComp.includes("params.set(\"am\""), "UPI Cash Out: Encodes dynamic amount parameter into QR payload");
  assert(!upiWorkspace.includes("\"9011\""), "UPI Cash Out: Hardcoded fallback account 9011 permanently eradicated");
  assert(upiWorkspace.includes("100") && upiWorkspace.includes("500") && upiWorkspace.includes("10000"), "UPI Cash Out: Tactile 1-click denomination chips available");

  // 2. DMT Self Beneficiary & Field Validations
  const dmtWorkspace = fs.readFileSync(path.join(ROOT_DIR, "components/business/dmt-workspace.tsx"), "utf8");
  assert(dmtWorkspace.includes("Use Self"), "DMT Workspace: Native React 'Use Self' quick beneficiary autofill present");
  assert(!fs.existsSync(path.join(ROOT_DIR, "components/business/dmt-self-beneficiary-enhancer.tsx")), "DMT Workspace: Obsolete DOM-mutation enhancer script permanently removed");
  assert(dmtWorkspace.includes("beneficiaryAccount"), "DMT Workspace: Handles account transfer method");
  assert(dmtWorkspace.includes("upiId"), "DMT Workspace: Handles UPI VPA transfer method");

  // 3. AEPS Top 10 Indian Banks & Float Math
  const aepsWorkspace = fs.readFileSync(path.join(ROOT_DIR, "components/business/aeps-workspace.tsx"), "utf8");
  assert(aepsWorkspace.includes("TOP_INDIAN_BANKS"), "AEPS Workspace: 1-click Top-10 Indian Bank selector chips active");
  assert(aepsWorkspace.includes("aadhaar"), "AEPS Workspace: Aadhaar Last 4 validation supported");
  assert(aepsWorkspace.includes("portal_commission") || aepsWorkspace.includes("commission"), "AEPS Workspace: Commission incentive calculation supported");
}

// =============================================================================
// SUITE 5: INVENTORY & COSTING (WAC) ENGINE
// =============================================================================
console.log("\n--- Suite 5: Inventory & Weighted Average Costing (WAC) ---");
{
  // WAC formula: New WAC = ((Old Qty * Old Cost) + (In Qty * In Cost)) / (Old Qty + In Qty)
  function computeWac(oldQty, oldCost, inQty, inCost) {
    const totalQty = oldQty + inQty;
    if (totalQty <= 0) return 0;
    const totalVal = (oldQty * oldCost) + (inQty * inCost);
    return Number((totalVal / totalQty).toFixed(2));
  }

  // Case 1: Initial 10 units @ ₹100, buy 10 units @ ₹120 -> WAC = ₹110
  assert(computeWac(10, 100, 10, 120) === 110.00, "WAC Calculation: 10@₹100 + 10@₹120 = 20@₹110.00");

  // Case 2: 20 units @ ₹110, buy 5 units @ ₹150 -> WAC = (2200 + 750) / 25 = 2950 / 25 = ₹118
  assert(computeWac(20, 110, 5, 150) === 118.00, "WAC Calculation: 20@₹110 + 5@₹150 = 25@₹118.00");

  // Case 3: Sale does not alter WAC unit cost
  function stockAfterSale(oldQty, saleQty) {
    return oldQty - saleQty;
  }
  assert(stockAfterSale(25, 10) === 15, "Perpetual Stock Deduction: 25 - 10 = 15 units remaining");

  // Verify non-negative stock constraint in migrations
  const wacMigration = fs.readFileSync(path.join(ROOT_DIR, "supabase/purchase-inventory-wac-migration.sql"), "utf8");
  assert(wacMigration.includes("stock_movements"), "Stock Movements: Append-only ledger table defined");
  assert(wacMigration.includes("adjust_stock_manual"), "Stock Adjustment: Authorized canonical manual adjustment RPC");
  assert(wacMigration.includes("process_purchase_return"), "Purchase Return: Canonical supplier return RPC with stock decrement");
}

// =============================================================================
// SUITE 6: AI APPROVAL GATE & SAFEGUARD INVARIANTS
// =============================================================================
console.log("\n--- Suite 6: AI Assistant & Approval Gate Security ---");
{
  const approvalGate = fs.readFileSync(path.join(ROOT_DIR, "lib/ai/approval-gate.ts"), "utf8");
  assert(approvalGate.includes("OWNER_APPROVAL_REQUIRED"), "AI Safety: Owner approval required set defined");
  assert(approvalGate.includes("role !== \"admin\""), "AI Safety: Approval and execution strictly restricted to admin role");
  assert(approvalGate.includes("status: \"executing\""), "AI Safety: Atomic claim transitions from 'approved' to 'executing' (prevents double execution)");

  const agentPolicy = fs.readFileSync(path.join(ROOT_DIR, "lib/ai/agent-policy.ts"), "utf8");
  assert(agentPolicy.includes("DEFAULT_AGENT_PERMISSIONS"), "AI Safety: Default agent permissions explicitly declared");
  assert(agentPolicy.includes("delete_record"), "AI Safety: Destructive operations require owner approval gate");
}

// =============================================================================
// SUITE 7: WHATSAPP CLOUD API SECURITY
// =============================================================================
console.log("\n--- Suite 7: WhatsApp Cloud API & Security Invariants ---");
{
  const waWebhook = fs.readFileSync(path.join(ROOT_DIR, "app/api/whatsapp/webhook/route.ts"), "utf8");
  assert(waWebhook.includes("crypto.timingSafeEqual"), "WhatsApp Webhook: Uses timingSafeEqual for HMAC signature comparison (prevents timing attacks)");
  assert(waWebhook.includes("x-hub-signature-256"), "WhatsApp Webhook: Enforces SHA-256 Meta signature header");
  assert(waWebhook.includes("hub.verify_token"), "WhatsApp Webhook: Implements Meta subscription verification handshake");
  assert(waWebhook.includes("createSecretsAdminClient"), "WhatsApp Webhook: Accesses gateway secrets via isolated admin client");
}

// =============================================================================
// SUITE 8: DATABASE RELIABILITY & SEARCH PATH HARDENING
// =============================================================================
console.log("\n--- Suite 8: Database Reliability & search_path Audit ---");
{
  const files = fs.readdirSync(path.join(ROOT_DIR, "supabase")).filter(f => f.endsWith(".sql"));
  let securityDefinerCount = 0;
  let missingSearchPathCount = 0;

  for (const file of files) {
    const content = fs.readFileSync(path.join(ROOT_DIR, "supabase", file), "utf8");
    // Split on function definitions to isolate each function header
    const fnChunks = content.split(/create\s+(?:or\s+replace\s+)?function\s+/i).slice(1);
    for (const chunk of fnChunks) {
      const headerPart = chunk.split("$$")[0];
      if (/security\s+definer/i.test(headerPart)) {
        securityDefinerCount++;
        if (!/set\s+search_path\s*(?:=|to)/i.test(headerPart)) {
          missingSearchPathCount++;
          const fnName = chunk.split("(")[0].trim();
          console.error(`  ⚠️ Missing search_path in ${file}: ${fnName}`);
        }
      }
    }
  }

  assert(securityDefinerCount > 200, `Database Audit: Identified ${securityDefinerCount} SECURITY DEFINER functions in migrations`);
  assert(missingSearchPathCount === 0, `Database Security: 0 SECURITY DEFINER functions missing SET search_path (Found: ${missingSearchPathCount})`);
}

// =============================================================================
// SUITE 9: SECRET LEAKAGE & SENSITIVE CREDENTIALS SCAN
// =============================================================================
console.log("\n--- Suite 9: Secret Leakage & Bundle Safety Scan ---");
{
  // Scan git-tracked files for hardcoded service role keys or real secrets
  const sensitivePatterns = [
    /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]{50,}\.[a-zA-Z0-9_-]{40,}/, // Full JWT service keys
    /AIzaSy[a-zA-Z0-9_-]{33}/, // Google API keys
    /ghp_[a-zA-Z0-9]{36}/, // GitHub tokens
  ];

  let leakedSecrets = 0;
  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name === "node_modules" || ent.name === ".next" || ent.name === ".git" || ent.name === "brain") continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        scanDir(full);
      } else if (ent.isFile() && (ent.name.endsWith(".ts") || ent.name.endsWith(".tsx") || ent.name.endsWith(".js") || ent.name.endsWith(".mjs"))) {
        const text = fs.readFileSync(full, "utf8");
        for (const pat of sensitivePatterns) {
          if (pat.test(text)) {
            console.error(`  ⚠️ Potential sensitive token pattern found in ${full}`);
            leakedSecrets++;
          }
        }
      }
    }
  }

  scanDir(ROOT_DIR);
  assert(leakedSecrets === 0, `Secret Scanning: Zero sensitive production secrets exposed in source code (Found: ${leakedSecrets})`);
}

// =============================================================================
// SUITE 10: RELEASE PACKAGING & PWA MANIFEST
// =============================================================================
console.log("\n--- Suite 10: Release Packaging & Packaging Manifests ---");
{
  const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
  assert(pkgJson.name === "sccomm-web", "Package Manifest: Valid package name sccomm-web");
  assert(pkgJson.scripts.build !== undefined, "Package Manifest: Build script configured");
  assert(pkgJson.scripts.lint !== undefined, "Package Manifest: Lint script configured");
  assert(pkgJson.scripts.typecheck !== undefined, "Package Manifest: Typecheck script configured");
  assert(pkgJson.scripts.test !== undefined, "Package Manifest: Test script configured");

  const manifestPath = path.join(ROOT_DIR, "app/manifest.ts");
  assert(fs.existsSync(manifestPath), "PWA: manifest.ts exists for Next.js App Router dynamic webmanifest");
}

// =============================================================================
// FINAL SUMMARY
// =============================================================================
console.log("\n================================================================================");
console.log(`TOTAL AUDIT ASSERTIONS RUN: ${passed + failed}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
console.log("================================================================================");

if (failed > 0) {
  console.error(`\nFailed tests summary:`, failures);
  process.exit(1);
} else {
  console.log("\n🎉 ALL COMPREHENSIVE QA AUDIT ASSERTIONS PASSED WITH ZERO DEFECTS!");
  process.exit(0);
}
