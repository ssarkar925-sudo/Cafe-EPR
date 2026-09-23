import { createClient } from "@/lib/supabase/server";
import { getV1SessionContext } from "@/lib/v1/v1-auth-context";
import { listTenantRows } from "@/lib/v1/v1-server-reads";
import { displayAvailable, expiryBand, expiryBandLabel } from "@/lib/v1/v1-inventory-display";
import V1Forbidden from "@/components/v1/v1-forbidden";
import PosCounter, { type PosCustomer, type PosInstrument, type PosProduct } from "./counter";

interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: string;
  sale_price: number;
}

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  credit_limit: number | null;
}

interface LotRow {
  id: string;
  product_id: string;
  qty_remaining: number;
  received_at: string;
  expiry_date: string;
  status: string;
}

interface ReservationRow {
  lot_id: string;
  qty: number;
}

interface InstrumentRow {
  id: string;
  name: string;
  itype: string;
}

/**
 * POS counter — Phase 6 Step 1 (server).
 *
 * Gate: any active V1 profile (POS is in the role matrix for all four
 * roles; hiding UI is never security — the backend still decides).
 *
 * Reads use ONLY the approved V1 server-read path (tenant-scoped queries
 * under RLS with the caller's JWT server client, via
 * lib/v1/v1-server-reads). No product/customer search RPC exists in
 * V1_READ_RPCS and none is invented: the counter works from a
 * timestamped catalog snapshot. No financial tables are touched
 * (no invoices, claims, journals); no mutation RPC fires in this step.
 *
 * Availability below is a DISPLAY subtraction (remaining − active held
 * over sellable lots), computed with the shared lib/v1 display helpers.
 * A lot counts as sellable only when expiry_date is strictly after today,
 * matching allocate_fifo (expiry_date > CURRENT_DATE). Allocation authority
 * stays server-side at create_sale time (later step).
 */
export default async function V1PosCounterPage() {
  const session = await getV1SessionContext();
  if (!session || !session.isActive) return <V1Forbidden surface="POS counter" />;

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [productsRes, customersRes, lotsRes, holdsRes, instrumentsRes] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku, barcode, unit, sale_price")
      .eq("tenant_id", session.tenantId)
      .eq("is_active", true)
      .order("name")
      .limit(500),
    listTenantRows<CustomerRow>(
      supabase,
      "customers",
      "id, name, phone, credit_limit, is_active",
      session.tenantId,
      { column: "name" },
      300,
    ),
    supabase
      .from("stock_lots")
      .select("id, product_id, qty_remaining, received_at, expiry_date, status")
      .eq("tenant_id", session.tenantId)
      .eq("status", "open")
      .gt("qty_remaining", 0)
      .order("received_at")
      .limit(2000),
    supabase
      .from("stock_reservations")
      .select("lot_id, qty")
      .eq("tenant_id", session.tenantId)
      .eq("status", "active")
      .limit(2000),
    listTenantRows<InstrumentRow>(
      supabase,
      "payment_instruments",
      "id, name, itype, is_active",
      session.tenantId,
      { column: "name" },
      100,
    ),
  ]);

  const readError =
    productsRes.error?.message ??
    customersRes.error ??
    lotsRes.error?.message ??
    holdsRes.error?.message ??
    instrumentsRes.error;
  if (readError) {
    return (
      <div className="mx-auto max-w-4xl">
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
        >
          Counter snapshot failed to load: {readError}
        </p>
      </div>
    );
  }

  const products = (productsRes.data ?? []) as ProductRow[];
  const customers: PosCustomer[] = ((customersRes.rows ?? []) as (CustomerRow & { is_active: boolean })[])
    .filter((c) => c.is_active === true)
    .map((c) => ({ id: c.id, name: c.name, phone: c.phone, credit_limit: c.credit_limit }));

  const lots = (lotsRes.data ?? []) as LotRow[];
  const heldByLot = new Map<string, number>();
  for (const h of ((holdsRes.data ?? []) as ReservationRow[])) {
    heldByLot.set(h.lot_id, (heldByLot.get(h.lot_id) ?? 0) + Number(h.qty));
  }

  const snapshotAt = new Date().toISOString();

  const instruments: PosInstrument[] = ((instrumentsRes.rows ?? []) as (InstrumentRow & { is_active: boolean })[])
    .filter((i) => i.is_active === true)
    .map((i) => ({ id: i.id, name: i.name, itype: i.itype }));

  const items: PosProduct[] = products.map((p) => {
    const sellable = lots.filter((l) => l.product_id === p.id && l.expiry_date > today);
    const available = Math.max(
      0,
      sellable.reduce(
        (sum, l) => sum + displayAvailable(Number(l.qty_remaining), heldByLot.get(l.id) ?? 0),
        0,
      ),
    );
    const earliest = sellable
      .map((l) => l.expiry_date)
      .sort()
      .at(0);
    const band = sellable.length > 0 ? expiryBand(earliest as string, "open") : "ok";
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      unit: p.unit,
      sale_price: Number(p.sale_price),
      available,
      band,
      bandLabel: expiryBandLabel(band),
      earliestExpiry: earliest ?? null,
    };
  });

  return (
    <PosCounter
      products={items}
      customers={customers}
      instruments={instruments}
      snapshotAt={snapshotAt}
      operator={{
        displayName: session.profile.display_name,
        role: session.role,
        profileId: session.profile.id,
      }}
      tenantId={session.tenantId}
    />
  );
}
