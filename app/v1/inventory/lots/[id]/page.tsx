import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getV1SessionContext, requireV1BackOffice } from "@/lib/v1/v1-auth-context";
import V1Forbidden from "@/components/v1/v1-forbidden";
import V1AdminTable from "@/components/v1/v1-admin-table";
import { displayAvailable, expiryBand, expiryBandLabel } from "@/lib/v1/v1-inventory-display";
import { AdjustForm, QuarantineButton, ReopenButton } from "../forms";

interface LotRow {
  id: string;
  product_id: string;
  purchase_id: string | null;
  supplier_id: string | null;
  source_ref: string | null;
  qty_received: number;
  qty_remaining: number;
  unit_cost: number;
  received_at: string;
  expiry_date: string;
  status: string;
}

/**
 * Lot detail (server). Readable by any active profile; lifecycle and
 * adjustment actions render for back-office only AND are enforced
 * server-side. Adjustments history is back-office-visible (matches the
 * adjustments read policy).
 */
export default async function V1LotDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await getV1SessionContext();
  if (!session || !session.isActive) return <V1Forbidden surface="Lot detail" />;
  const backOffice = requireV1BackOffice(session);

  const { id } = await params;
  const uuidOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (!uuidOk) notFound();

  const supabase = await createClient();
  const { data: lotData, error: lotError } = await supabase
    .from("stock_lots")
    .select(
      "id, product_id, purchase_id, supplier_id, source_ref, qty_received, qty_remaining, unit_cost, received_at, expiry_date, status",
    )
    .eq("tenant_id", session.tenantId)
    .eq("id", id)
    .single();
  if (lotError || !lotData) notFound();
  const lot = lotData as LotRow;

  const [productRes, holdsRes, adjRes] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, unit")
      .eq("tenant_id", session.tenantId)
      .eq("id", lot.product_id)
      .single(),
    supabase
      .from("stock_reservations")
      .select("id, qty, hold_expires_at, status, device_id, document_ref")
      .eq("tenant_id", session.tenantId)
      .eq("lot_id", lot.id)
      .eq("status", "active"),
    backOffice
      ? supabase
          .from("adjustments")
          .select("id, qty_delta, adj_type, reason, actor_profile_id, created_at")
          .eq("tenant_id", session.tenantId)
          .eq("lot_id", lot.id)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const product = (productRes.data ?? null) as { id: string; name: string; unit: string } | null;
  const holds = (holdsRes.data ?? []) as { id: string; qty: number; hold_expires_at: string }[];
  const held = holds.reduce((sum, h) => sum + Number(h.qty), 0);
  const adjustments = (adjRes.data ?? []) as Record<string, unknown>[];
  const band = expiryBand(lot.expiry_date, lot.status);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/v1/inventory" className="text-xs font-bold text-slate-500 underline dark:text-slate-400">
          ← Inventory
        </Link>
        <h1 className="mt-1 text-xl font-extrabold tracking-tight">
          Lot <span className="font-mono text-base">{lot.id.slice(0, 8)}</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {product ? `${product.name} · ` : ""}status <span className="font-mono">{lot.status}</span> · expiry band{" "}
          {expiryBandLabel(band)}
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Lot quantities">
        {[
          ["Received", String(lot.qty_received)],
          ["Remaining", String(lot.qty_remaining)],
          ["Held (active)", String(held)],
          ["Available (display)", String(displayAvailable(Number(lot.qty_remaining), held))],
          ["Unit cost", `₹${lot.unit_cost}`],
          ["Received at", lot.received_at.slice(0, 10)],
          ["Expiry", lot.expiry_date],
          ["Source", lot.source_ref ?? (lot.purchase_id ? `purchase:${lot.purchase_id.slice(0, 8)}` : "—")],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.02]">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
            <p className="mt-0.5 font-mono text-sm font-bold">{value}</p>
          </div>
        ))}
      </section>

      {lot.purchase_id ? (
        <p className="text-sm">
          <Link href={`/v1/purchases/${lot.purchase_id}`} className="font-bold text-slate-600 underline dark:text-slate-300">
            Open linked purchase →
          </Link>
        </p>
      ) : null}

      {backOffice && (
        <section className="flex flex-wrap gap-2" aria-label="Lot operations">
          {lot.status === "open" ? <QuarantineButton lotId={lot.id} /> : null}
          {lot.status === "quarantined" ? <ReopenButton lotId={lot.id} /> : null}
          <AdjustForm lotId={lot.id} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-extrabold tracking-tight">Active holds ({holds.length})</h2>
        {holds.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No active reservations on this lot.</p>
        ) : (
          <V1AdminTable
            columns={[
              { key: "qty", label: "Qty" },
              { key: "hold_expires_at", label: "Hold expires", mono: true },
            ]}
            rows={holds}
            rowKey={(r) => String(r.id)}
            emptyText="No active holds."
          />
        )}
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Holds are read-only here; reservation release happens server-side (expiry sweep) or in the POS workflow (later phase).
        </p>
      </section>

      {backOffice && (
        <section className="space-y-3">
          <h2 className="text-sm font-extrabold tracking-tight">Adjustment history</h2>
          {adjRes.error ? (
            <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400">{adjRes.error.message}</p>
          ) : (
            <V1AdminTable
              columns={[
                { key: "created_at", label: "At", mono: true },
                { key: "qty_delta", label: "Delta" },
                { key: "adj_type", label: "Type" },
                { key: "reason", label: "Reason" },
                { key: "actor_profile_id", label: "Actor", mono: true },
              ]}
              rows={adjustments}
              rowKey={(r) => String((r as { id: string }).id)}
              emptyText="No adjustments recorded for this lot."
            />
          )}
        </section>
      )}
    </div>
  );
}
