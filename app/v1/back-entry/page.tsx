import { createClient } from "@/lib/supabase/server";
import { getV1SessionContext, requireV1Admin } from "@/lib/v1/v1-auth-context";
import { listTenantRows } from "@/lib/v1/v1-server-reads";
import V1Forbidden from "@/components/v1/v1-forbidden";
import BackEntryBatchForm, {
  BackEntryLockAction,
  WINDOW_END,
  WINDOW_START,
  type LotOption,
  type MasterOption,
} from "./batch-form";
import { BackEntryHistory, SuspenseList, type HistoryBatch, type HistoryLine, type SuspenseRow } from "./history";

interface BatchRow {
  id: string;
  batch_key: string;
  reason: string;
  status: string;
  created_at: string;
  response: { lines_posted?: number; lines_parked?: number } | null;
}

interface LineRow {
  batch_id: string;
  line_no: number;
  line_type: string;
  source_ref: string;
  business_date: string;
  qty: number | null;
  amount: number | null;
  lot_mode: string;
}

/**
 * Historical Back-entry (server). Admin-only: every G12 mutation
 * (acquire/submit/void/resolve) requires is_admin server-side, and reads
 * are back-office scoped. The window 2025-01-01..2026-01-01 is fixed by
 * the approved D9 decision; the lock is a one-way seal (no unlock path).
 */
export default async function V1BackEntry() {
  const session = await getV1SessionContext();
  if (!requireV1Admin(session)) return <V1Forbidden surface="Historical back-entry" />;

  const supabase = await createClient();

  const [lockRes, batchesRes, suspenseRes, productsRes, suppliersRes, customersRes, instrumentsRes, lotsRes] =
    await Promise.all([
      supabase
        .from("back_entry_lock")
        .select("reason, locked_by_profile, locked_at")
        .eq("tenant_id", session.tenantId)
        .maybeSingle(),
      supabase
        .from("back_entry_batches")
        .select("id, batch_key, reason, status, created_at, response")
        .eq("tenant_id", session.tenantId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("suspense_records")
        .select("id, batch_id, source_ref, kind, reason, status, created_at, resolution_note, resolved_at")
        .eq("tenant_id", session.tenantId)
        .order("created_at", { ascending: false })
        .limit(50),
      listTenantRows<{ id: string; name: string }>(supabase, "products", "id, name", session.tenantId, undefined, 2000),
      listTenantRows<{ id: string; name: string }>(supabase, "suppliers", "id, name", session.tenantId, undefined, 2000),
      listTenantRows<{ id: string; name: string }>(supabase, "customers", "id, name", session.tenantId, undefined, 2000),
      listTenantRows<{ id: string; name: string }>(supabase, "payment_instruments", "id, name", session.tenantId, undefined, 2000),
      supabase
        .from("stock_lots")
        .select("id, product_id, qty_remaining, expiry_date, status")
        .eq("tenant_id", session.tenantId)
        .order("received_at")
        .limit(500),
    ]);

  const readError =
    lockRes.error?.message ??
    batchesRes.error?.message ??
    suspenseRes.error?.message ??
    productsRes.error ??
    suppliersRes.error ??
    customersRes.error ??
    instrumentsRes.error ??
    lotsRes.error?.message;
  if (readError) {
    return (
      <div className="mx-auto max-w-4xl">
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          Back-entry records failed to load: {readError}
        </p>
      </div>
    );
  }

  // listTenantRows without an active filter returns all rows; masters here
  // are small reference sets and the submit RPC re-validates active state
  // server-side for every referenced master.
  const opt = (rows: { id: string; name: string }[]): MasterOption[] =>
    rows.map((r) => ({ id: r.id, name: r.name }));
  const products = opt(productsRes.rows ?? []);
  const suppliers = opt(suppliersRes.rows ?? []);
  const customers = opt(customersRes.rows ?? []);
  const instruments = opt(instrumentsRes.rows ?? []);
  const productNames = new Map(products.map((p) => [p.id, p.name]));
  const lots: LotOption[] = (((lotsRes.data ?? []) as {
    id: string;
    product_id: string;
    qty_remaining: number;
    expiry_date: string;
    status: string;
  }[]) ?? []).map((l) => ({
    id: l.id,
    product_id: l.product_id,
    product_name: productNames.get(l.product_id) ?? l.product_id.slice(0, 8),
    qty_remaining: Number(l.qty_remaining),
    expiry_date: l.expiry_date,
    status: l.status,
  }));

  const lock = (lockRes.data ?? null) as { reason: string; locked_by_profile: string; locked_at: string } | null;
  const batches = ((batchesRes.data ?? []) as BatchRow[]).map((b) => ({
    id: b.id,
    batch_key: b.batch_key,
    reason: b.reason,
    status: b.status,
    created_at: b.created_at,
    response: b.response,
  }));
  const batchIds = batches.map((b) => b.id);
  let lines: HistoryLine[] = [];
  if (batchIds.length > 0) {
    const { data: lineData, error: lineError } = await supabase
      .from("back_entry_lines")
      .select("batch_id, line_no, line_type, source_ref, business_date, qty, amount, lot_mode")
      .eq("tenant_id", session.tenantId)
      .in("batch_id", batchIds)
      .order("line_no")
      .limit(400);
    if (lineError) {
      return (
        <div className="mx-auto max-w-4xl">
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
            Back-entry lines failed to load: {lineError.message}
          </p>
        </div>
      );
    }
    lines = ((lineData ?? []) as LineRow[]).map((l) => ({
      batch_id: l.batch_id,
      line_no: l.line_no,
      line_type: l.line_type,
      source_ref: l.source_ref,
      business_date: l.business_date,
      qty: l.qty === null ? null : Number(l.qty),
      amount: l.amount === null ? null : Number(l.amount),
      lot_mode: l.lot_mode,
    }));
  }
  const suspense = ((suspenseRes.data ?? []) as SuspenseRow[]).map((r) => ({
    id: r.id,
    batch_id: r.batch_id,
    source_ref: r.source_ref,
    kind: r.kind,
    reason: r.reason,
    status: r.status,
    created_at: r.created_at,
    resolution_note: r.resolution_note,
    resolved_at: r.resolved_at,
  }));
  const batchKeys = new Map(batches.map((b) => [b.id, b.batch_key] as [string, string]));



  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">Historical back-entry</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {session.profile.display_name} · <span className="font-mono">{session.role}</span> · window{" "}
          <span className="font-mono">
            {WINDOW_START} to {WINDOW_END}
          </span>{" "}
          (fixed). Journals post origin-dated and balanced, server-side.
        </p>
      </div>

      {lock ? (
        <section
          aria-label="Window state"
          className="rounded-2xl border border-slate-300 bg-slate-100 p-4 dark:border-white/15 dark:bg-white/5"
        >
          <h2 className="text-sm font-extrabold tracking-tight">Window sealed</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Reason: {lock.reason} · sealed {lock.locked_at.slice(0, 19).replace("T", " ")}. No further historical
            batches can be submitted; post-seal corrections use live-period journals only. There is no unlock path.
          </p>
        </section>
      ) : (
        <>
          <section
            aria-label="Window state"
            className="rounded-2xl border border-teal-200 bg-teal-50 p-4 dark:border-teal-500/20 dark:bg-teal-500/10"
          >
            <h2 className="text-sm font-extrabold tracking-tight text-teal-800 dark:text-teal-200">
              Window open — submissions accepted
            </h2>
            <div className="mt-3">
              <BackEntryLockAction />
            </div>
            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
              Sealing is permanent and admin-only. Submit all historical batches first.
            </p>
          </section>
          <section
            aria-label="New back-entry batch"
            className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"
          >
            <h2 className="text-sm font-extrabold tracking-tight">New batch</h2>
            <div className="mt-3">
              <BackEntryBatchForm
                products={products}
                suppliers={suppliers}
                customers={customers}
                instruments={instruments}
                lots={lots}
              />
            </div>
          </section>
        </>
      )}

      <section
        aria-label="Batch history"
        className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"
      >
        <h2 className="text-sm font-extrabold tracking-tight">History</h2>
        <BackEntryHistory batches={batches} lines={lines} />
      </section>

      <section
        aria-label="Suspense"
        className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"
      >
        <h2 className="text-sm font-extrabold tracking-tight">Suspense</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Uncertain lines park here instead of posting. Resolve them, or submit a correcting batch that references
          the suspense row in its reason.
        </p>
        <div className="mt-2">
          <SuspenseList rows={suspense} batchKeys={batchKeys} />
        </div>
      </section>
    </div>
  );
}
