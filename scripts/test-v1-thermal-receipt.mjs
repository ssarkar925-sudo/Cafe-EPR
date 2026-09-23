/**
 * V1 thermal receipt / browser printing contract test — STATIC ONLY.
 *
 * Verifies, without touching any database: receipt model + component +
 * print CSS (58/80mm, @media print), reused print button (window.print,
 * no new pipeline), canonical reprint from server rows (never rebuilt
 * from masters/cart), provisional UNSYNCED receipts, canonical discount
 * and payment display incl. splits and khata, no GST/tax, no scope-hash
 * or secret exposure, no returns/back-entry/day-close receipts, no
 * provider/QR inventions, session/UUID guards, and no financial mutation
 * from any print path.
 *
 * Run: node scripts/test-v1-thermal-receipt.mjs
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

const MODEL = "components/v1/receipt/v1-receipt-model.ts";
const VIEW = "components/v1/receipt/v1-receipt.tsx";
const CSS = "components/v1/receipt/v1-receipt-print.module.css";
const ROUTE = "app/v1/receipt/[id]/page.tsx";
const CHECKOUT = "app/v1/pos/checkout.tsx";
const PRINT_BUTTON = "components/receipt/print-button.tsx";
for (const f of [MODEL, VIEW, CSS, ROUTE]) {
  check(`thermal file exists: ${f}`, existsSync(join(root, f)));
}

const model = read(MODEL);
const view = read(VIEW);
const css = read(CSS);
const route = read(ROUTE);
const checkout = read(CHECKOUT);
const button = read(PRINT_BUTTON);
const codeOnly = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"))
    .join("\n");
const mine = [model, view, css, route].map(codeOnly).join("\n");
const mineRaw = [model, view, css, route].join("\n");

// --- 1-7. component + CSS + button -----------------------------------------------------------------
check("1. thermal receipt component exists", view.includes("V1Receipt") && view.includes("role=\"document\""));
check("2. print CSS exists", css.includes("@media print"));
check("3. 58mm CSS exists", css.includes("58mm"));
check("4. 80mm CSS exists", css.includes("80mm"));
check("5. @media print exists", css.includes("@media print"));
check("6. print button exists (reused infrastructure)", checkout.includes("PrintButton") && route.includes("PrintButton"));
check("7. window.print exists (existing button)", button.includes("window.print()"));

// --- 8-11. print path never mutates ----------------------------------------------------------------------------
const MUTATIONS = /create_sale|record_claim|recognize_claim|allocate_claim|intake_lots|adjust_stock|reserve_stock|post_journal|reverse_journal|request_approval|approve_override|open_day_close|record_day_counts|record_service_txn/;
check("8. no create_sale from print path", !/create_sale/.test(mine));
check("9. no record_claim from print path", !/record_claim/.test(mine));
check("10. no inventory mutation from print path", !/intake_lots|adjust_stock|reserve_stock/.test(mine));
check("11. no journal mutation from print path", !/post_journal|reverse_journal/.test(mine));
check("11b. reused button performs no mutations", !MUTATIONS.test(codeOnly(button)));

// --- 12-16. canonical + provisional + reprint -----------------------------------------------------------------------------------
check("12. canonical invoice number supported", model.includes("canonicalNumber") && route.includes("canonical_number"));
check("13. provisional number supported", model.includes("provisionalNumber") && model.includes("buildProvisionalReceipt"));
check("14. UNSYNCED — not final present", mineRaw.includes("UNSYNCED — not final"));
check(
  "15. canonical reprint uses server-authoritative data",
  route.includes("invoice_lines") && route.includes("payment_claims"),
);
check("16. no cart reconstruction for reprint", !/sale_price|from cart|cart lines/i.test(mine));

// --- 17-23. money, discount, payment, khata ----------------------------------------------------------------------------------------------------------------
check("17. no GST calculation", !/GST/i.test(mine));
const nonNegated = (rx, text) =>
  text.split("\n").filter((line) => rx.test(line) && !/no\b|not\b|never|without|none\b|neither/i.test(line));
check("18. no invented tax amount", nonNegated(/CGST|SGST|IGST|gstin|tax amount/i, mineRaw).length === 0);
check("19. discount displayed from canonical value", route.includes("invoice.discount") || route.includes("discount, total") || model.includes("discount: number"));
check("20. payment methods supported", view.includes("p.method") && route.includes("payment_claims"));
check("21. split payment supported where canonical data exists", route.includes("collection_allocations"));
check("22. credit/Khata indication supported", view.includes("Khata balance") && route.includes("dues_of"));
check("23. no internal approval scope hash exposed", !/scope_hash/.test(mine));

// --- 24-28. secrets + legacy ----------------------------------------------------------------------------------------------------------------
check("24. no secrets", nonNegated(/service-role|service_role|eyJ[A-Za-z0-9_-]{10,}|password|secret/i, mine).length === 0);
check("25. no legacy imports", !/quick_sale|process_return|cash_entries|legacy|whatsapp/i.test(mine));
check("26. no quick_sales", !/quick_sales/.test(mine));
check("27. no WAC", !/WAC/.test(mine));
check("28. no legacy GST", !/GST/i.test(mine));

// --- 29-33. out-of-scope absences + states -------------------------------------------------------------------------------------------------------------------
check("29. no returns/refunds", !/process_return|refund|cancel_invoice|edit_invoice/i.test(mine));
check("30. no back-entry receipt invention", !/back_entry/.test(mine));
check("31. no day-close receipt", !/day_close|approve_day_close/.test(mine));
check("32. offline provisional state", checkout.includes("buildProvisionalReceipt") && checkout.includes("UNSYNCED_LABEL"));
check("33. canonical post-sync state", checkout.includes("/v1/receipt/${"));

// --- 34-36. button purity, guards, TS -----------------------------------------------------------------------------------
check("34. print button does not mutate financial state", !MUTATIONS.test(codeOnly(button)) && !/supabase/.test(codeOnly(button)));
check(
  "35. session/UUID route guard preserved",
  route.includes("getV1SessionContext") && route.includes("V1Forbidden") && route.includes("UUID_RE"),
);
check("36. no Electron/native additions", !/electron|printThermal|native/i.test(mine));
check("36b. no QR invention", !/qrcode|QRCode|qrCode/i.test(mine));
check("36c. no invented address/legal fields", !/address|gstin|statutory|registration/i.test(mineRaw));

if (failures > 0) {
  console.log(`V1_THERMAL_RECEIPT_CONTRACT_FAILED (${failures})`);
  process.exit(1);
}
console.log("V1_THERMAL_RECEIPT_CONTRACT_PASSED");
