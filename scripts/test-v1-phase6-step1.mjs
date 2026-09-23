/**
 * V1 Phase 6 Step 1 (POS counter: wedge input, catalog lookup, cart draft,
 * customer shell) contract test — STATIC ONLY.
 *
 * Verifies, without touching any database:
 *  1. /v1/pos is a real POS UI, not the Phase-5 placeholder.
 *  2. A wedge-compatible barcode input exists (autofocus, Enter submit,
 *     Esc clears, focus returns).
 *  3. Product lookup resolves through lib/v1 (approved V1 server-read
 *     path). No product/customer search RPC exists in V1_READ_RPCS and
 *     none is invented: catalog, customers, and lots load via
 *     tenant-scoped server reads; the island receives a snapshot.
 *  4. Customer lookup resolves through lib/v1 (same path).
 *  5. No direct financial-table access from the POS surface.
 *  6. No create_sale call yet. 7. No payment implementation yet.
 *  8. No discount implementation yet. 9. No stock mutation from cart ops.
 *  10. Repeat scans increment quantity. 11. Quantity floor (never <= 0).
 *  12. Quantity cap (never above available). 13. Explicit not-found state.
 *  14. Explicit loading/error/empty states. 15. Session/role gate intact.
 *  16. Legacy boundary holds (no quick_sales/GST/WAC/cash_entries/etc).
 *
 * Run: node scripts/test-v1-phase6-step1.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const PAGE = "app/v1/pos/page.tsx";
const COUNTER = "app/v1/pos/counter.tsx";
check("pos page exists", existsSync(join(root, PAGE)));
check("pos counter island exists", existsSync(join(root, COUNTER)));

const page = read(PAGE);
const counter = read(COUNTER);

// --- 1. real UI, not placeholder ------------------------------------------------
check("pos page is not the placeholder", !page.includes("V1Placeholder") && !page.includes("V1PosDesignPreview"));
check("pos page renders the counter island", page.includes("PosCounter") && page.includes("./counter"));

// --- 2. barcode wedge input ------------------------------------------------------
check("barcode input exists", counter.includes('id="pos-barcode"') && counter.includes("Scan barcode"));
check("barcode input autofocuses", counter.includes("autoFocus") && counter.includes("barcodeRef.current?.focus()"));
check("enter submits the scan", counter.includes("onSubmit={submitBarcode}") && counter.includes("event.preventDefault()"));
check("scan trims and ignores empty input", counter.includes("barcode.trim()") && counter.includes('"empty"'));
check("esc clears the barcode field only", counter.includes('"Escape"') && counter.includes('setBarcode("")'));
check("focus returns after lookup", (counter.match(/focusBarcode\(\)/g) ?? []).length >= 3);

// --- 3+4. lookups resolve through lib/v1 (approved server-read path) -------------
check(
  "product/customer/stock reads use the V1 server-read helper",
  page.includes("lib/v1/v1-server-reads") && page.includes("listTenantRows"),
);
check(
  "reads are tenant-scoped",
  (page.match(/\.eq\("tenant_id", session\.tenantId\)/g) ?? []).length >= 3,
);
check(
  "island types/identity come from lib/v1",
  counter.includes("lib/v1/v1-contracts") && counter.includes("lib/v1/v1-device"),
);
check("no supabase import in the client island", !counter.includes("supabase"));

// --- 5. no direct financial-table access ------------------------------------------
// stock_lots / stock_reservations are inventory reads (same as the Phase-4
// lot surfaces), not financial tables.
const financialTables = ["invoices", "invoice_items", "claims", "journals", "journal_lines"];
const tableHits = [];
for (const [file, src] of [[PAGE, page], [COUNTER, counter]]) {
  for (const t of financialTables) {
    if (new RegExp(`\\.from\\(\\s*["']${t}["']\\)`).test(src)) tableHits.push(`${file}: ${t}`);
  }
}
check("no direct financial-table access", tableHits.length === 0, tableHits.join("; "));
check(
  "only catalog/customer/lot tables are read",
  page.includes('"products"') && page.includes('"customers"') && page.includes('"stock_lots"'),
);

// --- 6/7/8/9. later-step implementations absent ------------------------------------
// Comments may name later-step RPCs as explicitly-not-implemented; only code
// counts. Strip block + line comments before matching.
const codeOnly = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"))
    .join("\n");
const pageCode = codeOnly(page);
const counterCode = codeOnly(counter);
const absent = (rx) => !rx.test(pageCode) && !rx.test(counterCode);
check("no create_sale yet", absent(/create_sale/));
check("no payment implementation yet", absent(/record_claim|recognize_claim|allocate_claim/));
check("no discount implementation yet", absent(/request_approval|approve_override/));
check(
  "no stock mutation from cart operations",
  absent(/intake_lots|adjust_stock|reserve_stock|release_reservation|quarantine_lot|reopen_lot|expire_overdue_lots|release_expired_reservations/),
);
check("no sync/offline/thermal implementation", absent(/sync_flush|sync_acknowledge|resolve_conflict|printThermal|window\.print|UNSYNCED/));

// --- 10/11/12. cart rules -----------------------------------------------------------
check("repeat scan increments quantity", counter.includes("line.qty + 1"));
check("quantity never <= 0", counter.includes("Math.max(1"));
check("quantity never exceeds available", counter.includes("Math.min(") && counter.includes("product.available"));
check("out-of-stock never enters the cart", counter.includes("available <= 0") && counter.includes("not added"));
check("cart lines carry no reservation claim", counter.includes("No stock is reserved"));

// --- 13/14. explicit states ------------------------------------------------------------
check("explicit not-found state", counter.includes("Product not found") && counter.includes('role="alert"'));
check("explicit empty-scan state", counter.includes("Empty scan ignored"));
check("explicit empty-cart state", counter.includes("Empty cart"));
check("explicit no-match state", counter.includes("No products match"));
check("explicit server error state", page.includes('role="alert"') && page.includes("failed to load"));
check("walk-in default customer state", counter.includes("Walk-in"));
check("changing customer leaves cart lines alone", counter.includes("does not alter cart lines"));

// --- 15. session/role gate ---------------------------------------------------------------
check(
  "pos remains session gated",
  page.includes("getV1SessionContext") && page.includes("session.isActive") && page.includes("V1Forbidden"),
);

// --- 16. legacy boundary --------------------------------------------------------------------
const legacyRx = /quick_sale|process_return|cash_entries|legacy transactions|WAC|GST|whatsapp|excess|shortage/i;
const legacyHits = [];
for (const [file, src] of [[PAGE, page], [COUNTER, counter]]) {
  const m = src.match(legacyRx);
  if (m) legacyHits.push(`${file}: ${m[0]}`);
}
check("legacy boundary holds", legacyHits.length === 0, legacyHits.join("; "));

if (failures > 0) {
  console.log(`V1_PHASE6_STEP1_CONTRACT_FAILED (${failures})`);
  process.exit(1);
}
console.log("V1_PHASE6_STEP1_CONTRACT_PASSED");
