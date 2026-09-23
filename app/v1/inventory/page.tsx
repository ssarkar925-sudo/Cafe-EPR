import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getV1SessionContext, requireV1BackOffice } from "@/lib/v1/v1-auth-context";
import { listTenantRows } from "@/lib/v1/v1-server-reads";
import V1Forbidden from "@/components/v1/v1-forbidden";
import {
  displayAvailable,
  expiryBand,
  expiryBandLabel,
  fifoRank,
} from "@/lib/v1/v1-inventory-display";
import { SweepButtons, StuckHoldsPanel } from "./ops";

interface ProductRow {
  id: string;
  name: string;
  unit: string;
  sale_price: number;
  is_active: boolean;
}

interface LotRow {
  id: string;
  product_id: string;
  purchase_id: string | null;
  source_ref: string | null;
  qty_received: number;
  qty_remaining: number;
  unit_cost: number;
  received_at: string;
  expiry_date: string;
  status: string;
}

interface ReservationRow {
  id: string;
  lot_id: string;
  qty: number;
  hold_expires_at: string;
  status: string;
}

function bandClass(band: string): string {
  switch (band) {
    case "expired":
      return "bg-rose-600/15 text-rose-300 ring-rose-500/40";
    case "action":
      return "bg-amber-600/15 text-amber-300 ring-amber-500/40";
    case "watch":
      return "bg-sky-600/15 text-sky-300 ring-sky-500/40";
    default:
      return "bg-slate-600/10 text-slate-500 ring-slate-500/30 dark:text-slate-400";
  }
}

/**
 * Inventory overview (server). All roles with an active profile may read;
 * quantities, FIFO order, and lifecycle state are displayed exactly as the
 * server returns them. Availability shown is a display subtraction
 * (remaining − active held); allocation authority stays server-side.
 */
export default async function V1Inventory({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; product?: string }>;
}) {
  const session = await getV1SessionContext();
  if (!session || !session.isActive) return <V1Forbidden surface="Inventory" />;
  const backOffice = requireV1BackOffice(session);

  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const selectedId = (params.product ?? "").trim();

  const supabase = await createClient();
  const productQuery = supabase
    .from("products")
    .select("id, name, unit, sale_price, is_active")
    .eq("tenant_id", session.tenantId)
    .eq("is_active", true)
    .order("name")
    .limit(60);
  const { data: productData, error: productError } = query
    ? await productQuery.ilike("name", `%${query.replace(/[%_]/g, "")}%`)
    : await productQuery;

  const products = (productData ?? []) as ProductRow[];
  const selected = products.find((p) => p.id === selectedId) ?? null;

  let lots: LotRow[] = [];
  let heldByLot = new Map<string, number>();
  let lotsError: string | null = null;
  if (selected) {
    const lotsRes = await listTenantRows<LotRow>(
      supabase,
      "stock_lots",
      "id, product_id, purchase_id, source_ref, qty_received, qty_remaining, unit_cost, received_at, expiry_date, status",
      session.tenantId,
      { column: "received_at" },
      200,
    );
    if (lotsRes.error) {
      lotsError = lotsRes.error;
    } else {
      lots = lotsRes.rows.filter((l) => l.product_id === selected.id);
      if (lots.length > 0) {
        const { data: resData, error: resError } = await supabase
          .from("stock_reservations")
          .select("id, lot_id, qty, hold_expires_at, status")
          .eq("tenant_id", session.tenantId)
          .in(
            "lot_id",
            lots.map((l) => l.id),
          )
          .eq("status", "active");
        if (resError) {
          lotsError = resError.message;
        } else {
          heldByLot = new Map<string, number>();
          for (const r of (resData ?? []) as ReservationRow[]) {
            heldByLot.set(r.lot_id, (heldByLot.get(r.lot_id) ?? 0) + Number(r.qty));
          }
        }
      }
    }
  }

  const orderedIds = lots.map((l) => l.id);
  const totalRemaining = lots.reduce((sum, l) => sum + Number(l.qty_remaining), 0);
  const totalHeld = [...heldByLot.values()].reduce((sum, q) => sum + q, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">Inventory</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Server-authoritative lots and holds. FIFO consumes the oldest open, unexpired lot first —
          the rank below only labels that server order.
        </p>
      </div>

      <form method="get" action="/v1/inventory" className="flex gap-2" role="search">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search products…"
          aria-label="Search products"
          className="w-full max-w-sm rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/5 dark:focus:border-white/30"
        />
        <button
          type="submit"
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          Search
        </button>
      </form>

      {productError ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          {productError.message}
        </p>
      ) : products.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-white/15 dark:text-slate-400">
          No active products match.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {products.map((p) => (
            <Link
              key={p.id}
              href={`/v1/inventory?product=${p.id}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
              aria-current={selected?.id === p.id ? "page" : undefined}
              className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                selected?.id === p.id
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              }`}
            >
              {p.name}
            </Link>
          ))}
        </div>
      )}

      {selected && (
        <section className="space-y-3" aria-label={`Lots for ${selected.name}`}>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <h2 className="text-sm font-extrabold tracking-tight">{selected.name}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Remaining {totalRemaining} {selected.unit} · held {totalHeld} · sale price ₹{selected.sale_price}
            </p>
          </div>
          {lotsError ? (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
              {lotsError}
            </p>
          ) : lots.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-white/15 dark:text-slate-400">
              No lots for this product.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.02]">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-white/10">
                    {["FIFO", "Received", "Recv qty", "Remaining", "Held", "Unit cost", "Expiry", "Band", "Status", "Source", ""].map((h) => (
                      <th key={h} scope="col" className="px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lots.map((lot) => {
                    const band = expiryBand(lot.expiry_date, lot.status);
                    const held = heldByLot.get(lot.id) ?? 0;
                    return (
                      <tr key={lot.id} className="border-b border-slate-100 last:border-0 dark:border-white/5">
                        <td className="px-3 py-2.5 font-mono text-xs">#{fifoRank(orderedIds, lot.id)}</td>
                        <td className="px-3 py-2.5 font-mono text-xs">{lot.received_at.slice(0, 10)}</td>
                        <td className="px-3 py-2.5">{lot.qty_received}</td>
                        <td className="px-3 py-2.5 font-bold">{lot.qty_remaining}</td>
                        <td className="px-3 py-2.5">{held > 0 ? held : "—"}</td>
                        <td className="px-3 py-2.5">₹{lot.unit_cost}</td>
                        <td className="px-3 py-2.5 font-mono text-xs">{lot.expiry_date}</td>
                        <td className="px-3 py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${bandClass(band)}`}>
                            {expiryBandLabel(band)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs">{lot.status}</td>
                        <td className="px-3 py-2.5 font-mono text-xs">{lot.source_ref ?? (lot.purchase_id ? `purchase:${lot.purchase_id.slice(0, 8)}` : "—")}</td>
                        <td className="px-3 py-2.5">
                          <Link href={`/v1/inventory/lots/${lot.id}`} className="text-xs font-bold text-slate-600 underline dark:text-slate-300">
                            Open
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Display: remaining − held = {displayAvailable(totalRemaining, totalHeld)} available across shown lots. Allocation itself runs server-side at posting.
          </p>
        </section>
      )}

      {backOffice && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <SweepButtons />
          <StuckHoldsPanel />
        </div>
      )}
    </div>
  );
}
