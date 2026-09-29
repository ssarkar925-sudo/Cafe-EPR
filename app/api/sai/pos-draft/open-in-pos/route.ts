import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import {
  buildPosHandoffCart,
  normalizeSaiPosDraft,
  type LiveCatalogRow,
  type LiveCustomerRow,
} from "@/lib/sai/pos-handoff-transform";

/**
 * POST /api/sai/pos-draft/open-in-pos
 *
 * Server-validated handoff for the CURRENT SAI architecture
 * (`pos.prepare_sale_draft` capability in `lib/sai/capabilities/
 * pos-draft-intelligence.ts`).
 *
 * Thin I/O wrapper: authenticates, fetches LIVE catalog/customer rows,
 * then delegates all validation and cart construction to the pure,
 * I/O-free core in `lib/sai/pos-handoff-transform.ts` (shared with the
 * deterministic integration test).
 *
 * READ/VALIDATE/TRANSFORM ONLY. This endpoint performs ZERO financial
 * side effects: no invoice/sale/payment/ledger insert, no stock deduction,
 * no approval mutation, no `create_sale` RPC. The sale is created only when
 * the operator reviews the cart in POS and presses Pay.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager", "staff"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const draft = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>).draft
    : null;

  const normalized = normalizeSaiPosDraft(draft);
  if ("status" in normalized && "error" in normalized && !("lines" in normalized)) {
    return NextResponse.json({ error: normalized.error }, { status: normalized.status });
  }
  const { draftId, lines, customerId } = normalized as {
    draftId: string;
    lines: Array<{ itemId: string; kind: "product" | "service"; quantity: number }>;
    customerId: string;
  };

  const supabase = await createClient();

  // Re-read every item from the LIVE catalog. AI-provided rate/name/totals
  // are informational only and are never trusted here.
  const productIds = lines.filter((r) => r.kind === "product").map((r) => r.itemId);
  const serviceIds = lines.filter((r) => r.kind === "service").map((r) => r.itemId);

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

  const liveRows: LiveCatalogRow[] = [
    ...((productsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({ ...row, kind: "product" }) as LiveCatalogRow),
    ...((servicesRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({ ...row, kind: "service" }) as LiveCatalogRow),
  ];

  // Re-read the customer from the LIVE database; never trust AI fields.
  let liveCustomer: LiveCustomerRow | null = null;
  if (customerId) {
    const { data: cust, error: custErr } = await supabase
      .from("customers")
      .select("id, name, code, phone, balance, gstin, state_code, is_active")
      .eq("id", customerId)
      .maybeSingle();
    if (custErr) return NextResponse.json({ error: custErr.message }, { status: 500 });
    liveCustomer = cust as LiveCustomerRow | null;
  }

  const result = buildPosHandoffCart({
    draftId,
    lines,
    liveRows,
    liveCustomer,
    customerRequested: Boolean(customerId),
  });

  if ("problems" in result) {
    return NextResponse.json({ error: result.error, problems: result.problems }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    draftId,
    cartLines: result.cartLines,
    customer: result.customer,
    paymentChoice: "cash",
    gstSummary: result.gstSummary,
    message: "Draft validated against live catalog. Opening POS for operator review. No invoice is created until you press Pay in POS.",
  });
}
