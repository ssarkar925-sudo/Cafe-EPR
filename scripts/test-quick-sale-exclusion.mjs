// Quick Sale exclusion proof suite (Phase 13).
// Proves Quick Sale contributes NOTHING to active application/financial logic
// while historical data structures remain preserved. Static source assertions
// (the same style as the repo's invariant suites) plus live-logic checks that
// run without a database.
//
// Run: node scripts/test-quick-sale-exclusion.mjs
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
    console.error(`  FAIL  ${name}${extra ? ` — ${extra}` : ""}`);
  }
}
const hasQuick = (s) => /quick[_ -]?sale|quicksale|mode=quick/i.test(s);

console.log("Quick Sale exclusion proof");

// 1. Dashboard revenue never touches quick_sales (contract zero-key + filters excepted).
{
  const page = read("app/(dashboard)/dashboard/page.tsx");
  ok("dashboard has no quick table reads", !page.includes('from("quick_sales")'));
  ok("dashboard has no quick mode links", !page.includes("mode=quick"));
  ok("dashboard has no quick calculation identifiers", !/todayQuick|mtdQuick|wtdQuick|quickSale(Count|Amount|Margin)|todayQuickRevenue/.test(page));
}

// 2-4. Today / MTD / WTD revenue exclude Quick Sale (identifiers gone).
{
  const page = read("app/(dashboard)/dashboard/page.tsx");
  for (const id of ["todayQuick", "todayQuickRevenue", "mtdQuick", "wtdQuick", "quickSalesRes", "quickSaleCount", "quickSaleAmount", "quickSaleMargin"]) {
    ok(`dashboard identifier removed: ${id}`, !page.includes(id));
  }
}

// 5-6. FY P&L + net profit exclude (migration zeroes at source).
{
  const mig = read("supabase/migrations/20260915_04_remove_quick_sale_from_active_financials.sql");
  ok("tax RPC hard-zeroes quick sales", /v_quick_sales numeric[^;]*:= 0;/.test(mig));
  ok("tax RPC reads no quick tables", !/from public\.(quick_sales|cash_entries)/i.test(mig.split("get_pnl_internal")[0].split("get_tax_preparation_report")[1] || ""));
  const internal = mig.split("create or replace function public.get_pnl_internal")[1] || "";
  ok("pnl internal reads no quick tables", !/from public\.quick_sales/i.test(internal));
  ok("pnl internal quick cost is zero", /v_quick_sale_cost numeric\(15,2\) := 0;/.test(internal));
}

// 7-8. Avg ticket + tx counts exclude (no quick lengths in formulas).
{
  const page = read("app/(dashboard)/dashboard/page.tsx");
  ok("tx counts exclude quick", /todayTxCount = todayInvoices\.length \+ todayTxns\.length/.test(page) && /mtdTxCount = mtdInvoices\.length \+ mtdTxns\.length/.test(page) && /wtdTxCount = wtdInvoices\.length \+ wtdTxns\.length/.test(page));
}

// 9. Cash/digital ratio excludes Quick Sale.
{
  const page = read("app/(dashboard)/dashboard/page.tsx");
  ok("cash tender split is POS-only", /todayPaymentCash = todayPayments\.filter[^;]+cash[^;]+\.reduce/.test(page) && !/todayQuickRevenue/.test(page));
  ok("cashbook inflow/outflow filter quick_sale refs", (page.match(/ref_type !== "quick_sale"/g) || []).length >= 2);
}

// 11. Dashboard has no Quick Sale launchpad.
{
  const client = read("components/dashboard/dashboard-client.tsx");
  ok("no quick-sale launchpad entry", !client.includes('id: "quick-sale"') && !client.includes("/pos?mode=quick"));
}

// 12. Sidebar/navigation has no active Quick Sale entry.
{
  const nav = read("lib/navigation.ts");
  ok("no quick mode nav link", !nav.includes("/pos?mode=quick") && !nav.includes("Quick Sale Mode"));
}

// 13. POS normal billing still works.
{
  const shell = read("components/pos/pos-shell.tsx");
  ok("pos still creates sales", shell.includes("create_sale"));
  ok("pos route exists", fs.existsSync(path.join(repoRoot, "app/(dashboard)/pos/page.tsx")));
  const api = read("app/api/pos/quick-sale/route.ts");
  ok("quick-sale API answers 410", api.includes("status: 410") && !api.includes("record_quick_sale"));
}

// 14. Existing POS invoices still appear correctly.
{
  const page = read("app/(dashboard)/invoices/page.tsx");
  ok("invoice list loads POS invoices", page.includes('from("invoices")') && !page.includes("quick_sales"));
  const unified = read("components/invoices/unified-invoices-client.tsx");
  ok("unified ledger is POS-only", !hasQuick(unified));
}

// 15. Existing POS invoice PDF still works (canonical path intact).
{
  const view = read("components/invoices/invoice-view-modal.tsx");
  ok("view download uses canonical blob", view.includes("downloadCanonicalPdf") && view.includes("generateInvoicePdfBlob"));
  ok("canonical generator exists", fs.existsSync(path.join(repoRoot, "lib/invoice-pdf.ts")));
}

// 16. Existing POS WhatsApp still works.
{
  const modal = read("components/whatsapp/whatsapp-send-modal.tsx");
  ok("modal keeps pos_invoice document path", modal.includes('messageType === "pos_invoice"') && modal.includes("documentBase64: rendered.base64"));
  const sendRoute = read("app/api/whatsapp/send-invoice/route.ts");
  ok("send-invoice route intact", sendRoute.includes("sendCustomerInvoicePdf") && sendRoute.includes("whatsapp_pdf_jobs"));
}

// 10b. RPC disable stubs present (both overloads), cancel preserved.
{
  const mig = read("supabase/migrations/20260915_04_remove_quick_sale_from_active_financials.sql");
  ok("record_quick_sale disabled (both overloads)", (mig.match(/raise exception 'Quick Sale is discontinued/g) || []).length === 2);
  ok("cancel_quick_sale not redefined by migration", !mig.includes("create or replace function public.cancel_quick_sale"));
  const schema = read("supabase/schema.sql");
  ok("schema stub raises", schema.includes("Quick Sale is discontinued and no longer supported"));
}

// 17. Historical structures preserved (tables, policies, cancel RPC, receipt views).
{
  const schema = read("supabase/schema.sql");
  ok("quick_sales table preserved", schema.includes("create table if not exists public.quick_sales"));
  ok("quick_sale_items table preserved", schema.includes("create table if not exists public.quick_sale_items"));
  ok("cancel RPC preserved", schema.includes("create or replace function public.cancel_quick_sale"));
  ok("historical receipt views exist", fs.existsSync(path.join(repoRoot, "app/receipt/quick/[id]/page.tsx")));
}

// 18. Financial gateway no longer admits record_quick_sale.
{
  const gw = read("app/api/pos/financial-rpc/route.ts");
  ok("gateway allowlist excludes record_quick_sale", !gw.includes("record_quick_sale") && gw.includes("cancel_quick_sale"));
  const client = read("lib/supabase/client.ts");
  ok("client idempotency set excludes record_quick_sale", !client.includes('"record_quick_sale"'));
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
