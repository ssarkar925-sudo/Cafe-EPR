import { calculateGstInvoice } from "../gst";

/**
 * Pure handoff core for the SAI → POS sale-draft handoff.
 *
 * This module contains ZERO I/O: no Supabase, no Next.js, no DOM, no
 * localStorage. It takes an SAI sale draft (the `pos.prepare_sale_draft`
 * shape) plus already-fetched LIVE catalog/customer rows and returns either
 * a POS-compatible `CartLine[]` with recomputed GST, or a structured
 * validation failure.
 *
 * Purity is deliberate: the same code path used by
 * `app/api/sai/pos-draft/open-in-pos/route.ts` is imported directly by the
 * deterministic integration test (`scripts/test-sai-pos-handoff-integration.mjs`)
 * with controlled fixtures — no network, no database, no secrets.
 *
 * Safety: this module can never create a financial record. It only
 * validates and transforms data handed to it.
 */

export const SAI_POS_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
export const SAI_POS_DRAFT_MAX_ITEMS = 20;

export type SaiDraftLineInput = {
  itemId: string;
  kind: "product" | "service";
  quantity: number;
};

export type LiveCatalogRow = {
  id: string;
  kind: "product" | "service";
  name: string;
  code?: string | null;
  sale_price: number | string | null;
  cost_price?: number | string | null;
  stock_qty?: number | string | null;
  unit?: string | null;
  hsn_code?: string | null;
  sac_code?: string | null;
  gst_rate?: number | string | null;
  is_active?: boolean | null;
};

export type LiveCustomerRow = {
  id: string;
  name: string;
  code?: string | null;
  phone?: string | null;
  balance?: number | string | null;
  gstin?: string | null;
  state_code?: string | null;
  is_active?: boolean | null;
};

export type HandoffCartLine = {
  key: string;
  id: string;
  kind: "product" | "service";
  name: string;
  code: string | null;
  rate: number;
  qty: number;
  costPrice: number;
  categoryName: string;
  gstRate: number;
  hsnSac: string | null;
  stockQty: number | null;
  unit: string;
  isCustom: false;
};

export type HandoffCustomer = {
  id: string;
  name: string;
  code: string | null;
  phone: string | null;
  balance: number | null;
  gstin: string | null;
  state_code: string | null;
};

export type DraftShapeError = { status: 400 | 410 | 422; error: string };
export type DraftProblems = { status: 422; error: string; problems: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate the SAI draft envelope and normalize its sale lines.
 * Returns the draftId plus normalized lines, or a shape error with the
 * HTTP status the API route must return.
 */
export function normalizeSaiPosDraft(
  draft: unknown,
): { draftId: string; lines: SaiDraftLineInput[]; customerId: string } | DraftShapeError {
  if (!isRecord(draft)) return { status: 400, error: "draft is required" };

  const draftId = typeof draft.draftId === "string" ? draft.draftId.trim() : "";
  if (!draftId) {
    return { status: 400, error: "Draft identity is missing. Please create a new draft from SAI." };
  }

  const status = typeof draft.status === "string" ? draft.status : "";
  if (status && status !== "draft_for_operator_review") {
    return { status: 400, error: `This draft (status: ${status}) is not a sale draft for POS review.` };
  }

  const observedAt = typeof draft.observedAt === "string" ? Date.parse(draft.observedAt) : NaN;
  if (Number.isFinite(observedAt) && Date.now() - observedAt > SAI_POS_DRAFT_TTL_MS) {
    return { status: 410, error: "Draft has expired. Please create a new draft from SAI." };
  }

  const rawLines: unknown = draft.lines;
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    return { status: 422, error: "Draft contains no items" };
  }
  if (rawLines.length > SAI_POS_DRAFT_MAX_ITEMS) {
    return { status: 422, error: "Draft contains too many items. Please split the sale." };
  }

  const lines: SaiDraftLineInput[] = [];
  for (const raw of rawLines) {
    if (!isRecord(raw)) {
      return { status: 422, error: "Draft contains an invalid line. Please create a new draft." };
    }
    const itemId = typeof raw.itemId === "string" ? raw.itemId.trim() : "";
    const kind = raw.kind === "product" || raw.kind === "service" ? raw.kind : null;
    const quantity = Math.floor(Number(raw.quantity));
    if (!itemId || !kind) {
      return { status: 400, error: "Draft contains a non-sale line. Only product/service sale drafts can be opened in POS." };
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) {
      return { status: 422, error: "Draft contains an invalid quantity. Please create a new draft." };
    }
    lines.push({ itemId, kind, quantity });
  }

  const draftCustomer = isRecord(draft.customer) ? draft.customer : null;
  const customerId =
    draftCustomer && typeof draftCustomer.id === "string" ? draftCustomer.id.trim() : "";

  return { draftId, lines, customerId };
}

/**
 * Build the POS cart from normalized draft lines and LIVE rows.
 * AI-provided rates/names/totals are never accepted — every authoritative
 * field comes from `liveRows`. Returns cart + customer + GST summary, or a
 * `problems[]` failure mirroring the API's 422 contract.
 */
export function buildPosHandoffCart(input: {
  draftId: string;
  lines: SaiDraftLineInput[];
  liveRows: LiveCatalogRow[];
  liveCustomer: LiveCustomerRow | null;
  customerRequested: boolean;
}):
  | { cartLines: HandoffCartLine[]; customer: HandoffCustomer | null; gstSummary: { subtotal: number; totalTax: number; invoiceTotal: number; supplyType: string } }
  | DraftProblems {
  const catalog = new Map<string, LiveCatalogRow>();
  for (const row of input.liveRows) catalog.set(`${row.kind}:${row.id}`, row);

  const problems: string[] = [];
  const validated: Array<{
    id: string;
    kind: "product" | "service";
    name: string;
    code: string | null;
    rate: number;
    costPrice: number;
    qty: number;
    gstRate: number;
    hsnSac: string | null;
    stockQty: number | null;
    unit: string;
  }> = [];

  for (const req of input.lines) {
    const live = catalog.get(`${req.kind}:${req.itemId}`);
    if (!live) {
      problems.push("Item no longer found in catalog (may have been deleted). Please create a new draft.");
      continue;
    }
    if (live.is_active === false) {
      problems.push(`Item is no longer active: ${live.name}`);
      continue;
    }
    const stockQty = req.kind === "product" ? Number(live.stock_qty ?? 0) : null;
    if (req.kind === "product" && (stockQty ?? 0) < req.quantity) {
      problems.push(`${live.name}: only ${stockQty ?? 0} in stock, requested ${req.quantity}`);
      continue;
    }
    validated.push({
      id: String(live.id),
      kind: req.kind,
      name: String(live.name),
      code: live.code ?? null,
      rate: Number(live.sale_price ?? 0),
      costPrice: Number(live.cost_price ?? 0),
      qty: req.quantity,
      gstRate: Number(live.gst_rate ?? 0),
      hsnSac: req.kind === "product" ? (live.hsn_code ?? null) : (live.sac_code ?? null),
      stockQty,
      unit: typeof live.unit === "string" && live.unit ? live.unit : req.kind === "service" ? "service" : "pcs",
    });
  }

  if (problems.length > 0) {
    return { status: 422, error: "Some draft items are invalid. Please review.", problems };
  }

  let customer: HandoffCustomer | null = null;
  if (input.customerRequested) {
    const cust = input.liveCustomer;
    if (!cust) {
      return {
        status: 422,
        error: "Customer from draft is no longer found. Please re-select in POS.",
        problems: ["Customer from draft is no longer found. Please re-select in POS."],
      };
    }
    if (cust.is_active === false) {
      return {
        status: 422,
        error: `Customer '${cust.name}' is no longer active. Please correct in POS.`,
        problems: [`Customer '${cust.name}' is no longer active.`],
      };
    }
    customer = {
      id: String(cust.id),
      name: String(cust.name),
      code: cust.code ?? null,
      phone: cust.phone ?? null,
      balance: cust.balance != null ? Number(cust.balance) : null,
      gstin: cust.gstin ?? null,
      state_code: cust.state_code ?? null,
    };
  }

  const gst = calculateGstInvoice({
    lines: validated.map((item) => ({
      qty: item.qty,
      rate: item.rate,
      gstRate: item.gstRate,
      hsnSac: item.hsnSac,
      taxTreatment: item.gstRate > 0 ? ("taxable" as const) : ("non_gst" as const),
    })),
    invoiceLumpSumDiscount: 0,
    supplierStateCode: "19",
    customerStateCode: customer?.state_code ?? null,
    customerGstin: customer?.gstin ?? null,
  });

  const shortId = input.draftId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "draft";
  const cartLines: HandoffCartLine[] = validated.map((item, idx) => ({
    key: `sai-draft-${shortId}-${item.kind[0]}-${String(item.id).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)}-${idx}`,
    id: item.id,
    kind: item.kind,
    name: item.name,
    code: item.code,
    rate: item.rate,
    qty: item.qty,
    costPrice: item.costPrice,
    categoryName: "",
    gstRate: item.gstRate,
    hsnSac: item.hsnSac,
    stockQty: item.stockQty,
    unit: item.unit,
    isCustom: false,
  }));

  return {
    cartLines,
    customer,
    gstSummary: {
      subtotal: gst.totalGross,
      totalTax: gst.totalTax,
      invoiceTotal: gst.invoiceTotal,
      supplyType: gst.supplyType,
    },
  };
}
