import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { calculateGstInvoice } from "@/lib/gst";

/**
 * POST /api/sai/pos-draft/open-in-pos
 *
 * Server-validated handoff for the CURRENT SAI architecture
 * (`pos.prepare_sale_draft` capability in `lib/sai/capabilities/
 * pos-draft-intelligence.ts`).
 *
 * The client sends back the draft SAI prepared (draftId + lines with
 * itemId/kind/quantity + optional customer id). This endpoint:
 *
 *  1. Authenticates the operator and enforces admin/manager/staff role.
 *  2. Validates the draft identity and shape (sale lines only).
 *  3. Rejects stale drafts via `observedAt` (24h expiry).
 *  4. Re-reads every product/service from the LIVE database — AI-provided
 *     rates, names and totals are treated as informational only and are
 *     never used authoritatively.
 *  5. Validates active status and live stock at handoff time.
 *  6. Re-reads the customer from the LIVE database.
 *  7. Recomputes GST with the shared `calculateGstInvoice` engine.
 *  8. Returns a POS-compatible `CartLine[]` plus customer and display totals.
 *
 * READ/VALIDATE/TRANSFORM ONLY. This endpoint performs ZERO financial
 * side effects: no invoice/sale/payment/ledger insert, no stock deduction,
 * no approval mutation, no `create_sale` RPC. The sale is created only when
 * the operator reviews the cart in POS and presses Pay.
 */
export const dynamic = "force-dynamic";

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

type DraftLineInput = {
  itemId?: unknown;
  kind?: unknown;
  quantity?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager", "staff"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const draft = isRecord(body?.draft) ? body.draft : null;
  if (!draft) {
    return NextResponse.json({ error: "draft is required" }, { status: 400 });
  }

  const draftId = typeof draft.draftId === "string" ? draft.draftId.trim() : "";
  if (!draftId) {
    return NextResponse.json({ error: "Draft identity is missing. Please create a new draft from SAI." }, { status: 400 });
  }

  // Drafts are sale estimates only — never Khata/portal/payment drafts.
  const status = typeof draft.status === "string" ? draft.status : "";
  if (status && status !== "draft_for_operator_review") {
    return NextResponse.json(
      { error: `This draft (status: ${status}) is not a sale draft for POS review.` },
      { status: 400 }
    );
  }

  // Expiry: drafts are point-in-time estimates against live stock/prices.
  const observedAt = typeof draft.observedAt === "string" ? Date.parse(draft.observedAt) : NaN;
  if (Number.isFinite(observedAt) && Date.now() - observedAt > DRAFT_TTL_MS) {
    return NextResponse.json(
      { error: "Draft has expired. Please create a new draft from SAI." },
      { status: 410 }
    );
  }

  const rawLines: unknown = draft.lines;
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    return NextResponse.json({ error: "Draft contains no items" }, { status: 422 });
  }
  if (rawLines.length > 20) {
    return NextResponse.json({ error: "Draft contains too many items. Please split the sale." }, { status: 422 });
  }

  const requested: Array<{ itemId: string; kind: "product" | "service"; quantity: number }> = [];
  for (const raw of rawLines as DraftLineInput[]) {
    if (!isRecord(raw)) {
      return NextResponse.json({ error: "Draft contains an invalid line. Please create a new draft." }, { status: 422 });
    }
    const itemId = typeof raw.itemId === "string" ? raw.itemId.trim() : "";
    const kind = raw.kind === "product" || raw.kind === "service" ? raw.kind : null;
    const quantity = Math.floor(Number(raw.quantity));
    if (!itemId || !kind) {
      return NextResponse.json({ error: "Draft contains a non-sale line. Only product/service sale drafts can be opened in POS." }, { status: 400 });
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) {
      return NextResponse.json({ error: "Draft contains an invalid quantity. Please create a new draft." }, { status: 422 });
    }
    requested.push({ itemId, kind, quantity });
  }

  const supabase = await createClient();

  // Re-read every item from the LIVE catalog. AI-provided rate/name/totals
  // are informational only and are never trusted here.
  const productIds = requested.filter((r) => r.kind === "product").map((r) => r.itemId);
  const serviceIds = requested.filter((r) => r.kind === "service").map((r) => r.itemId);

  const [productsRes, servicesRes] = await Promise.all([
    productIds.length
      ? supabase
          .from("products")
          .select("id, name, code, sale_price, cost_price, stock_qty, unit, hsn_code, gst_rate, is_active")
          .in("id", productIds)
      : Promise.resolve({ data: [], error: null }),
    serviceIds.length
      ? supabase
          .from("services")
          .select("id, name, sale_price, cost_price, sac_code, gst_rate, is_active")
          .in("id", serviceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (productsRes.error) return NextResponse.json({ error: productsRes.error.message }, { status: 500 });
  if (servicesRes.error) return NextResponse.json({ error: servicesRes.error.message }, { status: 500 });

  const liveCatalog = new Map<string, Record<string, unknown>>();
  for (const row of (productsRes.data ?? []) as Record<string, unknown>[]) {
    liveCatalog.set(`product:${String(row.id)}`, { ...row, kind: "product" });
  }
  for (const row of (servicesRes.data ?? []) as Record<string, unknown>[]) {
    liveCatalog.set(`service:${String(row.id)}`, { ...row, kind: "service" });
  }

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

  for (const req of requested) {
    const live = liveCatalog.get(`${req.kind}:${req.itemId}`);
    if (!live) {
      problems.push(`Item no longer found in catalog (may have been deleted). Please create a new draft.`);
      continue;
    }
    if (live.is_active === false) {
      problems.push(`Item is no longer active: ${String(live.name)}`);
      continue;
    }
    const stockQty = req.kind === "product" ? Number(live.stock_qty ?? 0) : null;
    if (req.kind === "product" && (stockQty ?? 0) < req.quantity) {
      problems.push(`${String(live.name)}: only ${stockQty ?? 0} in stock, requested ${req.quantity}`);
      continue;
    }
    validated.push({
      id: String(live.id),
      kind: req.kind,
      name: String(live.name),
      code: (live.code as string | null) ?? null,
      rate: Number(live.sale_price ?? 0),
      costPrice: Number(live.cost_price ?? 0),
      qty: req.quantity,
      gstRate: Number(live.gst_rate ?? 0),
      hsnSac: req.kind === "product" ? ((live.hsn_code as string | null) ?? null) : ((live.sac_code as string | null) ?? null),
      stockQty,
      unit: typeof live.unit === "string" && live.unit ? live.unit : req.kind === "service" ? "service" : "pcs",
    });
  }

  if (problems.length > 0) {
    return NextResponse.json(
      { error: "Some draft items are invalid. Please review.", problems },
      { status: 422 }
    );
  }

  // Re-read the customer from the LIVE database; never trust AI fields.
  let customer: {
    id: string;
    name: string;
    code: string | null;
    phone: string | null;
    balance: number | null;
    gstin: string | null;
    state_code: string | null;
  } | null = null;

  const draftCustomer = isRecord(draft.customer) ? draft.customer : null;
  const draftCustomerId = draftCustomer && typeof draftCustomer.id === "string" ? draftCustomer.id.trim() : "";
  if (draftCustomerId) {
    const { data: cust, error: custErr } = await supabase
      .from("customers")
      .select("id, name, code, phone, balance, gstin, state_code, is_active")
      .eq("id", draftCustomerId)
      .maybeSingle();
    if (custErr) return NextResponse.json({ error: custErr.message }, { status: 500 });
    if (!cust) {
      return NextResponse.json(
        { error: "Customer from draft is no longer found. Please re-select in POS.", problems: ["Customer from draft is no longer found. Please re-select in POS."] },
        { status: 422 }
      );
    }
    if ((cust as Record<string, unknown>).is_active === false) {
      return NextResponse.json(
        { error: `Customer '${(cust as Record<string, unknown>).name}' is no longer active. Please correct in POS.`, problems: [`Customer '${(cust as Record<string, unknown>).name}' is no longer active.`] },
        { status: 422 }
      );
    }
    const row = cust as Record<string, unknown>;
    customer = {
      id: String(row.id),
      name: String(row.name),
      code: (row.code as string | null) ?? null,
      phone: (row.phone as string | null) ?? null,
      balance: row.balance != null ? Number(row.balance) : null,
      gstin: (row.gstin as string | null) ?? null,
      state_code: (row.state_code as string | null) ?? null,
    };
  }

  // Recompute GST from LIVE prices; the AI estimate is discarded entirely.
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

  const shortId = draftId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "draft";
  const cartLines = validated.map((item, idx) => ({
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

  return NextResponse.json({
    ok: true,
    draftId,
    cartLines,
    customer,
    paymentChoice: "cash",
    gstSummary: {
      subtotal: gst.totalGross,
      totalTax: gst.totalTax,
      invoiceTotal: gst.invoiceTotal,
      supplyType: gst.supplyType,
    },
    message: "Draft validated against live catalog. Opening POS for operator review. No invoice is created until you press Pay in POS.",
  });
}
