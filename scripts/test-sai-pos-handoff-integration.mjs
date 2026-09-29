/**
 * SAI POS handoff — deterministic integration test (no network, no database).
 *
 * Exercises the REAL production code path used by
 * `app/api/sai/pos-draft/open-in-pos/route.ts`:
 *
 *   SAI draft (pos.prepare_sale_draft shape)
 *     → normalizeSaiPosDraft (identity / sale-only / expiry / quantities)
 *     → buildPosHandoffCart (live-price validation, stock, GST, CartLine[])
 *     → POS-consumable payload (cartLines + customer + gstSummary)
 *
 * The pure core (`lib/sai/pos-handoff-transform.ts`) and the shared GST
 * engine (`lib/gst.ts`) are imported directly with controlled fixture rows
 * standing in for live Supabase reads. AI-provided prices are deliberately
 * wrong in fixtures to prove they are never trusted.
 *
 * Run:  node scripts/test-sai-pos-handoff-integration.mjs
 * Gate: npm run test:sai-pos-handoff-integration (Quality Gate, unconditional)
 */

import { normalizeSaiPosDraft, buildPosHandoffCart } from "../lib/sai/pos-handoff-transform.ts";
import { calculateGstInvoice } from "../lib/gst.ts";

let passed = 0;
let failed = 0;
function check(condition, label, details = "") {
  if (condition) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    console.error(`  FAIL: ${label}${details ? ` — ${details}` : ""}`);
  }
}

// ── Fixtures: live DB rows (as the route's SELECTs would return them) ────────

const LIVE_PRODUCT = {
  id: "11111111-1111-1111-1111-111111111111",
  kind: "product",
  name: "Cafe Latte",
  code: "LATTE",
  sale_price: 120,
  cost_price: 60,
  stock_qty: 50,
  unit: "cup",
  hsn_code: "2101",
  gst_rate: 5,
  is_active: true,
};

const LIVE_SERVICE = {
  id: "22222222-2222-2222-2222-222222222222",
  kind: "service",
  name: "Printing A4",
  sale_price: 10,
  cost_price: 2,
  sac_code: "9984",
  gst_rate: 18,
  is_active: true,
};

const INACTIVE_PRODUCT = { ...LIVE_PRODUCT, id: "33333333-3333-3333-3333-333333333333", name: "Old Muffin", is_active: false };
const LOW_STOCK_PRODUCT = { ...LIVE_PRODUCT, id: "44444444-4444-4444-4444-444444444444", name: "Rare Beans", stock_qty: 1 };

const LIVE_CUSTOMER = {
  id: "55555555-5555-5555-5555-555555555555",
  name: "E2E Test Customer",
  code: "E2E001",
  phone: "9000000001",
  balance: 0,
  gstin: null,
  state_code: "19",
  is_active: true,
};

const DRAFT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function makeDraft(overrides = {}) {
  return {
    draftId: DRAFT_ID,
    status: "draft_for_operator_review",
    estimateOnly: true,
    // Deliberately STALE/WRONG AI values — the handoff must ignore them.
    customer: { id: LIVE_CUSTOMER.id, name: "Wrong Name", code: "WRONG" },
    lines: [
      { itemId: LIVE_PRODUCT.id, kind: "product", name: "Wrong Latte", quantity: 2, rate: 9999 },
      { itemId: LIVE_SERVICE.id, kind: "service", name: "Wrong Print", quantity: 3, rate: 8888 },
    ],
    totals: { estimatedTotal: 123456.78 },
    observedAt: new Date().toISOString(),
    handoff: { path: "/pos" },
    ...overrides,
  };
}

function handoff(draft, liveRows, liveCustomer = LIVE_CUSTOMER, customerRequested = true) {
  const normalized = normalizeSaiPosDraft(draft);
  if ("error" in normalized && !("lines" in normalized)) return normalized;
  return buildPosHandoffCart({
    draftId: normalized.draftId,
    lines: normalized.lines,
    liveRows,
    liveCustomer,
    customerRequested: customerRequested && Boolean(normalized.customerId),
  });
}

console.log("SAI POS handoff integration (fixture-driven, real production core)");

// ── 1. Happy path ────────────────────────────────────────────────────────────

{
  const out = handoff(makeDraft(), [LIVE_PRODUCT, LIVE_SERVICE]);
  check(!("error" in out), "happy path validates without problems");
  if (!("error" in out)) {
    check(out.cartLines.length === 2, "returns one CartLine per draft line");
    const [latte, print] = out.cartLines;
    check(latte.rate === 120 && latte.qty === 2, "product line uses LIVE price and requested qty (AI 9999 ignored)");
    check(latte.name === "Cafe Latte" && latte.code === "LATTE", "product line uses LIVE name/code");
    check(latte.costPrice === 60 && latte.gstRate === 5 && latte.hsnSac === "2101", "product preserves live cost/GST/HSN");
    check(latte.stockQty === 50 && latte.unit === "cup", "product preserves live stock/unit");
    check(print.rate === 10 && print.qty === 3, "service line uses LIVE price (AI 8888 ignored)");
    check(print.hsnSac === "9984" && print.stockQty === null && print.unit === "service", "service SAC/stock/unit correct");
    check(latte.isCustom === false && print.isCustom === false, "lines are catalog lines, not custom");
    check(latte.categoryName === "" && typeof latte.key === "string", "CartLine carries PosShell-required fields");
    const keys = new Set(out.cartLines.map((l) => l.key));
    check(keys.size === 2 && latte.key.startsWith("sai-draft-"), "cart keys are unique and draft-namespaced");
    check(out.customer?.id === LIVE_CUSTOMER.id && out.customer?.name === "E2E Test Customer", "customer re-resolved from LIVE row (AI name ignored)");
    const expected = calculateGstInvoice({
      lines: [
        { qty: 2, rate: 120, gstRate: 5, hsnSac: "2101", taxTreatment: "taxable" },
        { qty: 3, rate: 10, gstRate: 18, hsnSac: "9984", taxTreatment: "taxable" },
      ],
      invoiceLumpSumDiscount: 0,
      supplierStateCode: "19",
      customerStateCode: "19",
      customerGstin: null,
    });
    check(
      out.gstSummary.subtotal === expected.totalGross &&
        out.gstSummary.totalTax === expected.totalTax &&
        out.gstSummary.invoiceTotal === expected.invoiceTotal,
      "GST summary exactly matches the shared engine on live prices",
      `got ${JSON.stringify(out.gstSummary)} want gross=${expected.totalGross} tax=${expected.totalTax} total=${expected.invoiceTotal}`
    );
    check(out.gstSummary.invoiceTotal !== 123456.78, "AI-provided total (123456.78) is discarded");
  }
}

// ── 2. Draft envelope validation ─────────────────────────────────────────────

{
  check(normalizeSaiPosDraft(null).status === 400, "missing draft → 400");
  check(normalizeSaiPosDraft({}).status === 400, "draft without identity → 400");
  check(normalizeSaiPosDraft(makeDraft({ status: "approved" })).status === 400, "non-sale status → 400");
  const expired = makeDraft({ observedAt: new Date(Date.now() - 25 * 3600 * 1000).toISOString() });
  check(normalizeSaiPosDraft(expired).status === 410, "stale observedAt (>24h) → 410");
  check(normalizeSaiPosDraft(makeDraft({ lines: [] })).status === 422, "empty lines → 422");
  check(normalizeSaiPosDraft(makeDraft({ lines: [{ itemId: "x", kind: "khata", quantity: 1 }] })).status === 400, "non-sale kind → 400");
  check(normalizeSaiPosDraft(makeDraft({ lines: [{ itemId: LIVE_PRODUCT.id, kind: "product", quantity: 0 }] })).status === 422, "zero quantity → 422");
  check(normalizeSaiPosDraft(makeDraft({ lines: [{ itemId: LIVE_PRODUCT.id, kind: "product", quantity: -2 }] })).status === 422, "negative quantity → 422");
  check(normalizeSaiPosDraft(makeDraft({ lines: Array.from({ length: 21 }, () => ({ itemId: LIVE_PRODUCT.id, kind: "product", quantity: 1 })) })).status === 422, ">20 lines → 422");
}

// ── 3. Live-catalog problems ─────────────────────────────────────────────────

{
  const missing = handoff(makeDraft(), [LIVE_SERVICE]);
  check(missing.status === 422 && missing.problems?.length === 1, "deleted product → single 422 problem, no partial cart");

  const inactive = handoff(
    makeDraft({ lines: [{ itemId: INACTIVE_PRODUCT.id, kind: "product", quantity: 1 }] }),
    [INACTIVE_PRODUCT]
  );
  check(inactive.status === 422 && /no longer active/.test(inactive.problems?.[0] ?? ""), "inactive item → 422 with operator-readable message");

  const noStock = handoff(
    makeDraft({ lines: [{ itemId: LOW_STOCK_PRODUCT.id, kind: "product", quantity: 5 }] }),
    [LOW_STOCK_PRODUCT]
  );
  check(noStock.status === 422 && /only 1 in stock, requested 5/.test(noStock.problems?.[0] ?? ""), "insufficient stock → 422 with quantities");

  const exactStock = handoff(
    makeDraft({ lines: [{ itemId: LOW_STOCK_PRODUCT.id, kind: "product", quantity: 1 }] }),
    [LOW_STOCK_PRODUCT]
  );
  check(!("error" in exactStock), "quantity equal to stock passes validation");
}

// ── 4. Customer problems ─────────────────────────────────────────────────────

{
  const gone = handoff(makeDraft(), [LIVE_PRODUCT, LIVE_SERVICE], null);
  check(gone.status === 422, "deleted customer → 422");

  const inactiveCust = handoff(makeDraft(), [LIVE_PRODUCT, LIVE_SERVICE], { ...LIVE_CUSTOMER, is_active: false });
  check(inactiveCust.status === 422, "inactive customer → 422");

  const walkIn = handoff(makeDraft({ customer: null }), [LIVE_PRODUCT, LIVE_SERVICE], null, false);
  check(!("error" in walkIn) && walkIn.customer === null, "draft without customer validates as walk-in");
}

// ── 5. No-write invariant (static, on the real route + core sources) ─────────

{
  const { readFileSync } = await import("node:fs");
  const routeSrc = readFileSync("app/api/sai/pos-draft/open-in-pos/route.ts", "utf8");
  const coreSrc = readFileSync("lib/sai/pos-handoff-transform.ts", "utf8");
  const writes = [".insert(", ".update(", ".delete(", ".upsert(", ".rpc("];
  const invocation = /supabase\s*\.\s*rpc|rpc\s*\(\s*["']create_sale["']/;
  check(
    writes.every((w) => !routeSrc.includes(w) && !coreSrc.includes(w)) &&
      !invocation.test(routeSrc) &&
      !invocation.test(coreSrc),
    "route + core contain no financial write primitives"
  );
}

console.log(`\n${passed} passed / ${failed} failed`);
process.exitCode = failed ? 1 : 0;
