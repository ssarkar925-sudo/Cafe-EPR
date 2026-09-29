import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { calculateGstInvoice } from "@/lib/gst";

/**
 * POST /api/ai/quick-sale/open-in-pos
 *
 * Server-validated POS draft handoff.
 *
 * Security contract:
 *  - Requires admin or staff role (same business, server session).
 *  - Reads the approval record and verifies it belongs to the calling user's
 *    business (enforced by RLS on ai_action_approvals).
 *  - Treats every AI-provided price, quantity, and total as STALE. Re-reads all
 *    catalog rows from the authoritative database and recomputes GST.
 *  - Returns the fresh CartLine[] payload. The client writes it to localStorage
 *    and navigates to /pos — no invoice is created here.
 *  - Does NOT modify any approval status (the approval remains "pending" until
 *    the operator explicitly submits in POS via the normal create_sale RPC, or
 *    cancels it).
 *
 * Safety guarantees:
 *  - No invoice, payment, ledger, or stock record is created.
 *  - Approval ID is opaque; the server re-validates ownership via RLS.
 *  - Items missing from the catalog, inactive, or out of stock return 422
 *    with a clear per-item error list.
 *  - GST is always recomputed from live catalog data; AI estimate is discarded.
 */
export const dynamic = "force-dynamic";

function clean(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]+/g, " ").trim();
}

export async function POST(request: Request) {
  // Auth check
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "staff"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const approvalId = typeof body?.approval_id === "string" ? body.approval_id.trim() : "";
  if (!approvalId) {
    return NextResponse.json({ error: "approval_id is required" }, { status: 400 });
  }

  const supabase = await createClient();

  // 1. Read approval (RLS ensures this belongs to the calling user's business)
  const now = new Date().toISOString();
  const { data: approval, error: approvalErr } = await supabase
    .from("ai_action_approvals")
    .select("id, action, status, request_payload, expires_at, created_at")
    .eq("id", approvalId)
    .maybeSingle();

  if (approvalErr) {
    return NextResponse.json({ error: approvalErr.message }, { status: 500 });
  }
  if (!approval) {
    return NextResponse.json({ error: "Draft not found or not accessible" }, { status: 404 });
  }
  if (approval.status !== "pending") {
    return NextResponse.json(
      { error: `Draft is no longer available (status: ${approval.status}). Please create a new draft.` },
      { status: 409 }
    );
  }
  if (approval.expires_at && approval.expires_at < now) {
    return NextResponse.json(
      { error: "Draft has expired. Please create a new draft from SAI." },
      { status: 410 }
    );
  }
  if (approval.action !== "create_sale") {
    return NextResponse.json(
      { error: `This approval is for action '${approval.action}', not a sale draft.` },
      { status: 400 }
    );
  }

  const payload = approval.request_payload as Record<string, unknown>;
  const draftItems = Array.isArray(payload?.items) ? (payload.items as any[]) : [];
  if (!draftItems.length) {
    return NextResponse.json({ error: "Draft contains no items" }, { status: 422 });
  }

  // 2. Re-read ALL live catalog from the database (never trust AI-provided prices)
  const itemIds = draftItems.map((x: any) => x.id).filter(Boolean) as string[];
  const [{ data: products, error: prodErr }, { data: services, error: svcErr }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sale_price, cost_price, stock_qty, hsn_code, gst_rate, unit, category_id, is_active")
      .in("id", itemIds),
    supabase
      .from("services")
      .select("id, name, sale_price, cost_price, sac_code, gst_rate, is_active")
      .in("id", itemIds),
  ]);

  if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 });
  if (svcErr) return NextResponse.json({ error: svcErr.message }, { status: 500 });

  const liveCatalog = new Map<string, any>();
  for (const p of products ?? []) liveCatalog.set(`product:${p.id}`, { ...p, kind: "product" });
  for (const s of services ?? []) liveCatalog.set(`service:${s.id}`, { ...s, kind: "service" });

  // 3. Validate each draft item against live catalog
  const problems: string[] = [];
  const validatedItems: Array<{
    id: string;
    kind: "product" | "service";
    name: string;
    rate: number;
    costPrice: number;
    qty: number;
    gstRate: number;
    hsnSac: string | null;
    stockQty: number | null;
    unit: string;
  }> = [];

  for (const draftItem of draftItems) {
    const key = `${draftItem.kind}:${draftItem.id}`;
    const live = liveCatalog.get(key);

    if (!live) {
      problems.push(`Item not found in catalog: ${draftItem.name || draftItem.id} (may have been deleted)`);
      continue;
    }
    if (live.is_active === false) {
      problems.push(`Item is no longer active: ${live.name}`);
      continue;
    }

    const qty = Math.floor(Number(draftItem.qty));
    if (!qty || qty <= 0) {
      problems.push(`Invalid quantity for ${live.name}`);
      continue;
    }

    // Stock check for products
    if (live.kind === "product" && Number(live.stock_qty) < qty) {
      problems.push(
        `${live.name}: only ${Number(live.stock_qty)} in stock, requested ${qty}`
      );
      continue;
    }

    validatedItems.push({
      id: live.id,
      kind: live.kind,
      name: live.name,
      rate: Number(live.sale_price),
      costPrice: Number(live.cost_price ?? 0),
      qty,
      gstRate: Number(live.gst_rate ?? 0),
      hsnSac: live.kind === "product" ? (live.hsn_code ?? null) : (live.sac_code ?? null),
      stockQty: live.kind === "product" ? Number(live.stock_qty) : null,
      unit: live.unit ?? "pcs",
    });
  }

  if (problems.length > 0) {
    return NextResponse.json(
      { error: "Some draft items are invalid. Please review.", problems },
      { status: 422 }
    );
  }

  // 4. Resolve customer (re-read from DB; do not trust AI-provided customer fields)
  let customer: {
    id: string;
    name: string;
    phone: string | null;
    balance: number | null;
    gstin: string | null;
    state_code: string | null;
  } | null = null;

  const draftCustomerId = typeof payload?.customer_id === "string" ? payload.customer_id : null;
  if (draftCustomerId) {
    const { data: cust } = await supabase
      .from("customers")
      .select("id, name, phone, balance, gstin, state_code, is_active")
      .eq("id", draftCustomerId)
      .maybeSingle();

    if (!cust) {
      return NextResponse.json(
        { error: "Customer from draft is no longer found. Please re-select in POS." },
        { status: 422 }
      );
    }
    if (cust.is_active === false) {
      return NextResponse.json(
        { error: `Customer '${cust.name}' is no longer active. Please correct in POS.` },
        { status: 422 }
      );
    }
    customer = {
      id: cust.id,
      name: cust.name,
      phone: cust.phone,
      balance: cust.balance != null ? Number(cust.balance) : null,
      gstin: cust.gstin ?? null,
      state_code: cust.state_code ?? null,
    };
  }

  // 5. Recompute GST with live prices (discard AI estimate entirely)
  const gstLines = validatedItems.map((item) => ({
    qty: item.qty,
    rate: item.rate,
    gstRate: item.gstRate,
    hsnSac: item.hsnSac,
    taxTreatment: item.gstRate > 0 ? ("taxable" as const) : ("non_gst" as const),
  }));

  const gst = calculateGstInvoice({
    lines: gstLines,
    invoiceLumpSumDiscount: 0,
    supplierStateCode: "19",
    customerStateCode: customer?.state_code ?? null,
    customerGstin: customer?.gstin ?? null,
  });

  // 6. Build CartLine[] compatible with PosShell's tab.cart format
  // The key is a stable unique string used by the POS tab system.
  const cartLines = validatedItems.map((item, idx) => ({
    key: `sai-draft-${approvalId.slice(0, 8)}-${item.kind[0]}-${item.id.slice(0, 8)}-${idx}`,
    id: item.id,
    kind: item.kind,
    name: item.name,
    rate: item.rate,
    qty: item.qty,
    costPrice: item.costPrice,
    categoryName: "",
    gstRate: item.gstRate,
    hsnSac: item.hsnSac,
    stockQty: item.stockQty,
    unit: item.unit,
    note: undefined,
    isCustom: false,
  }));

  // 7. Return fresh validated payload — no DB writes, no invoice, no payment
  return NextResponse.json({
    ok: true,
    approvalId,
    cartLines,
    customer: customer
      ? {
          id: customer.id,
          name: customer.name,
          code: null,
          phone: customer.phone,
          balance: customer.balance,
          gstin: customer.gstin,
          state_code: customer.state_code,
        }
      : null,
    paymentChoice: (payload?.payment_method as string) ?? "cash",
    // Fresh GST summary for display only — POS will recompute before checkout
    gstSummary: {
      subtotal: gst.totalGross,
      totalTax: gst.totalTax,
      invoiceTotal: gst.invoiceTotal,
      supplyType: gst.supplyType,
    },
    message:
      "Draft validated against live catalog. Opening POS for operator review. All prices are from live database.",
  });
}
