import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const capability = read("lib/sai/capabilities/pos-draft-intelligence.ts");
const planner = read("lib/sai/cognition/planner.ts");
const runtime = read("lib/sai/cognition/runtime.ts");
const chat = read("lib/sai/cognition/chat-runtime.ts");
const registry = read("app/api/sai/capabilities/route.ts");
const quality = read(".github/workflows/quality.yml");
const pkg = JSON.parse(read("package.json"));
let passed = 0;
let failed = 0;
const check = (condition, label) => condition
  ? (passed++, console.log(`  PASS: ${label}`))
  : (failed++, console.error(`  FAIL: ${label}`));

console.log("SAI typed POS draft safety regression checks");
check(capability.includes('id: "pos.prepare_sale_draft"'), "registers the typed POS draft capability");
check(capability.includes('.from("products")') && capability.includes('.from("services")'), "resolves items from the active authoritative catalog tables");
check(capability.includes('.select("id,code,name,sale_price,stock_qty,unit,hsn_code,gst_rate")') && capability.includes('.select("id,name,sale_price,sac_code,gst_rate")'), "uses catalog projections verified by the POS page");
check(capability.includes('.from("customers").select("id,name,code,balance,gstin,state_code")'), "resolves optional customer and GST context from the POS customer projection");
check(capability.includes("SAI_POS_DRAFT_ITEM_AMBIGUOUS") && capability.includes("SAI_POS_DRAFT_ITEM_NOT_FOUND"), "refuses uncertain catalog matches");
check(capability.includes("SAI_POS_DRAFT_INSUFFICIENT_STOCK") && capability.includes("row.stock_qty"), "checks current product stock before returning a draft");
check(capability.includes('import { calculateGstInvoice } from "@/lib/gst"') && capability.includes("calculateGstInvoice({"), "uses the same deterministic GST calculator as POS checkout");
check(capability.includes("createSaiEvidence") && capability.includes("cafeerp.pos.sale_draft") && capability.includes("sourceRef"), "stores traceable evidence for the prepared draft");
check(capability.includes('status: "draft_for_operator_review"') && capability.includes("estimateOnly: true"), "labels the result as an estimate that requires operator review");
check(capability.includes('path: "/pos"') && capability.includes("does not reserve stock"), "hands off to normal POS without claiming checkout completion");
check(capability.includes('risk: "read"') && capability.includes("mutates: false") && capability.includes("verificationRequired: false"), "registers as an explicitly read-only capability");
check(!/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/.test(capability) && !capability.includes("create_sale"), "contains no direct write, financial RPC, or sale-posting path");
check(planner.includes('import "@/lib/sai/capabilities/pos-draft-intelligence"') && planner.includes('"pos.prepare_sale_draft"'), "loads and routes structured POS draft intents");
check(runtime.includes("posDraft?: Record<string, unknown>") && runtime.includes("posDraft: input.posDraft"), "passes typed draft input through the validated SAI plan");
check(chat.includes("posDraft: {") && chat.includes("toolCall.args?.posDraft") && chat.includes("explicitly requested"), "model can pass a structured draft only in response to an explicit request");
check(registry.includes('pos-draft-intelligence'), "registers the capability in the authenticated capability API");
check(capability.includes('draftId: crypto.randomUUID()'), "draft carries a stable identity for handoff correlation");
check(capability.includes('itemId: String(row.id)') && capability.includes('quantity') && capability.includes('kind: row.kind'), "draft lines carry item identity, kind and quantity for live re-validation");
check(capability.includes('customer: customer ? { id: String(customer.id)'), "draft carries the live customer identity for handoff hydration");
check(pkg.scripts["test:sai-pos-draft"] === "node scripts/test-sai-pos-draft.mjs", "declares the focused draft regression test");
check(quality.includes("npm run test:sai-pos-draft"), "runs draft safety checks in the Quality Gate");
console.log(`\\n${passed} passed / ${failed} failed`);
process.exitCode = failed ? 1 : 0;
