import { createClient } from "@/lib/supabase/server";
import { calculateGstInvoice } from "@/lib/gst";
import { createSaiEvidence } from "@/lib/sai/core/evidence";
import { registerSaiCapability } from "@/lib/sai/core/capabilities";
import type { SaiActor, SaiCapabilityResult } from "@/lib/sai/core/types";

type Row = Record<string, any>;
type DraftItemRequest = { query: string; quantity: number; kind?: "product" | "service" };
const MAX_ITEMS = 20;
const MAX_CANDIDATES = 5;
const AUTHORITY_NOTE = "Read-only POS draft prepared from CafeERP active catalog, stock and customer records using the shared POS GST calculator. No invoice, payment, inventory, ledger or settlement record is created or changed.";

function normalizeQuery(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/[,%_]/g, " ").slice(0, 100) : "";
}
function money(value: unknown): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function searchCatalog(supabase: Awaited<ReturnType<typeof createClient>>, request: DraftItemRequest): Promise<Row[]> {
  const pattern = `%${normalizeQuery(request.query)}%`;
  const kinds = request.kind ? [request.kind] : ["product", "service"];
  const results = await Promise.all(kinds.map(async (kind) => {
    if (kind === "product") {
      const { data, error } = await supabase.from("products")
        .select("id,code,name,sale_price,stock_qty,unit,hsn_code,gst_rate")
        .eq("is_active", true).ilike("name", pattern).order("name").limit(MAX_CANDIDATES + 1);
      if (error) throw new Error(`SAI_POS_DRAFT_PRODUCTS_READ_FAILED:${error.message}`);
      return (data ?? []).map((row: Row) => ({ ...row, kind: "product", hsn_sac: row.hsn_code }));
    }
    const { data, error } = await supabase.from("services")
      .select("id,name,sale_price,sac_code,gst_rate")
      .eq("is_active", true).ilike("name", pattern).order("name").limit(MAX_CANDIDATES + 1);
    if (error) throw new Error(`SAI_POS_DRAFT_SERVICES_READ_FAILED:${error.message}`);
    return (data ?? []).map((row: Row) => ({ ...row, kind: "service", stock_qty: null, unit: "service", hsn_sac: row.sac_code }));
  }));
  return results.flat().slice(0, MAX_CANDIDATES + 1);
}

async function prepareSaleDraft(actor: SaiActor, input: Record<string, unknown>): Promise<SaiCapabilityResult> {
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > MAX_ITEMS) return { ok: false, error: "SAI_POS_DRAFT_ITEMS_INVALID" };
  const requests: DraftItemRequest[] = [];
  for (const raw of input.items) {
    if (!isRecord(raw)) return { ok: false, error: "SAI_POS_DRAFT_ITEM_INVALID" };
    const query = normalizeQuery(raw.query);
    const quantity = Number(raw.quantity);
    const kind = raw.kind === "product" || raw.kind === "service" ? raw.kind : undefined;
    if (!query || !Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) return { ok: false, error: "SAI_POS_DRAFT_ITEM_INVALID" };
    requests.push({ query, quantity, kind });
  }
  const discount = Number(input.discount ?? 0);
  if (!Number.isFinite(discount) || discount < 0) return { ok: false, error: "SAI_POS_DRAFT_DISCOUNT_INVALID" };

  const supabase = await createClient();
  const resolvedItems: Array<{ row: Row; quantity: number }> = [];
  for (const request of requests) {
    let matches: Row[];
    try { matches = await searchCatalog(supabase, request); }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : "SAI_POS_DRAFT_CATALOG_READ_FAILED" }; }
    if (matches.length !== 1) {
      return { ok: false, error: matches.length ? "SAI_POS_DRAFT_ITEM_AMBIGUOUS" : "SAI_POS_DRAFT_ITEM_NOT_FOUND",
        output: { itemQuery: request.query, candidates: matches.slice(0, MAX_CANDIDATES).map((row) => ({ id: String(row.id), kind: row.kind, name: String(row.name), code: row.code ?? null })) } };
    }
    const row = matches[0];
    if (row.kind === "product" && Number(row.stock_qty ?? 0) < request.quantity) {
      return { ok: false, error: "SAI_POS_DRAFT_INSUFFICIENT_STOCK", output: { itemQuery: request.query, itemName: row.name, available: Number(row.stock_qty ?? 0), requested: request.quantity } };
    }
    resolvedItems.push({ row, quantity: request.quantity });
  }

  let customer: Row | null = null;
  const customerQuery = normalizeQuery(input.customerQuery);
  if (customerQuery) {
    const { data, error } = await supabase.from("customers").select("id,name,code,balance,gstin,state_code")
      .ilike("name", `%${customerQuery}%`).order("name").limit(2);
    if (error) return { ok: false, error: `SAI_POS_DRAFT_CUSTOMER_READ_FAILED:${error.message}` };
    const matches = (data ?? []) as Row[];
    if (matches.length !== 1) return { ok: false,
      error: matches.length ? "SAI_POS_DRAFT_CUSTOMER_AMBIGUOUS" : "SAI_POS_DRAFT_CUSTOMER_NOT_FOUND",
      output: { customerQuery, candidates: matches.map((row) => ({ id: String(row.id), name: String(row.name), code: row.code ?? null })) } };
    customer = matches[0];
  }

  const gst = calculateGstInvoice({
    lines: resolvedItems.map(({ row, quantity }) => ({ qty: quantity, rate: Number(row.sale_price), gstRate: Number(row.gst_rate ?? 0),
      hsnSac: row.hsn_sac ?? null, taxTreatment: Number(row.gst_rate ?? 0) > 0 ? "taxable" : "non_gst" })),
    invoiceLumpSumDiscount: discount, customerStateCode: customer?.state_code ?? null, customerGstin: customer?.gstin ?? null,
  });
  const saleDraft = {
    draftId: crypto.randomUUID(), status: "draft_for_operator_review", estimateOnly: true,
    customer: customer ? { id: String(customer.id), name: String(customer.name), code: customer.code ?? null } : null,
    lines: resolvedItems.map(({ row, quantity }, index) => ({ itemId: String(row.id), kind: row.kind, name: String(row.name),
      code: row.code ?? null, quantity, unit: row.unit ?? (row.kind === "service" ? "service" : "unit"),
      availableStock: row.kind === "product" ? Number(row.stock_qty ?? 0) : null, rate: money(row.sale_price),
      gstRate: money(row.gst_rate), hsnSac: row.hsn_sac ?? null, tax: gst.lines[index] })),
    totals: { subtotal: gst.totalGross, discount: gst.totalDiscount, taxable: gst.totalTaxableValue,
      cgst: gst.totalCgst, sgst: gst.totalSgst, igst: gst.totalIgst, tax: gst.totalTax, estimatedTotal: gst.invoiceTotal },
    tax: { supplyType: gst.supplyType, placeOfSupply: gst.placeOfSupply, b2bCategory: gst.b2bCategory },
    customerBalance: customer ? money(customer.balance) : null, observedAt: new Date().toISOString(),
    sources: ["products", "services", ...(customer ? ["customers"] : []), "lib/gst.ts"], authorityNote: AUTHORITY_NOTE,
    handoff: { path: "/pos", requiresOperatorReview: true, posting: "Review and enter the sale in CafeERP POS; this draft is not posted and does not reserve stock." },
  };
  const evidenceId = `sai:pos:draft:${saleDraft.draftId}`;
  await createSaiEvidence({ evidenceId, actor, sourceType: "cafeerp.pos.sale_draft", sourceRef: saleDraft.draftId, data: saleDraft, confidence: 1 });
  return { ok: true, output: saleDraft, evidenceIds: [evidenceId] };
}

export function registerPosDraftIntelligence(): void {
  try {
    registerSaiCapability({ id: "pos.prepare_sale_draft",
      description: "Resolve active POS catalog items, customer and stock, calculate an estimate with CafeERP's shared GST engine, and return a traceable draft for operator review without posting.",
      domain: "pos", kind: "observe", risk: "read", requiresApproval: false, mutates: false, verificationRequired: false,
      execute: async (input, ctx) => prepareSaleDraft(ctx.command.actor, input),
    });
  } catch { /* Repeated module initialization is safe. */ }
}
registerPosDraftIntelligence();
