"use client";

/**
 * Back-entry batch form + window lock — V1 Historical Back-entry (client).
 *
 * All mutations go through lib/v1/v1-rpc.ts. Approved G12 rules enforced
 * here as client mirrors (the server remains authoritative):
 * - fixed 12-month window 2025-01-01 (inclusive) to 2026-01-01 (exclusive);
 * - purchase lines require a known expiry_date (unknown expiry rejected);
 * - lot_mode exact|aggregate; aggregate lots are previewed AND labeled as
 *   monthly aggregates, never as exact batches;
 * - purchase lines without a supplier PARK to suspense (posted nothing) —
 *   shown explicitly before submit, never silently converted;
 * - submit is atomic server-side; the batch_key is the idempotency
 *   identity (submit_back_entry_batch takes no p_idempotency_key — retry
 *   reuses the key and replays the stored response; a new batch gets a
 *   new key only after success);
 * - the window lock is a one-way seal: while sealed, submit is rejected
 *   server-side, so this form is replaced by the sealed notice.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callV1Mutation } from "@/lib/v1/v1-rpc";
import { V1Confirm } from "@/components/v1/v1-mutation";

export const WINDOW_START = "2025-01-01";
export const WINDOW_END = "2026-01-01";

const LINE_TYPES = ["purchase", "sale", "payment", "adjustment", "opening_balance"] as const;
const PAYMENT_METHODS = ["cash", "upi", "card", "wallet", "credit"];

export interface MasterOption {
  id: string;
  name: string;
}

export interface LotOption {
  id: string;
  product_id: string;
  product_name: string;
  qty_remaining: number;
  expiry_date: string;
  status: string;
}

interface DraftLine {
  key: string;
  line_type: string;
  source_ref: string;
  business_date: string;
  product_id: string;
  supplier_id: string;
  customer_id: string;
  instrument_id: string;
  lot_id: string;
  qty: string;
  unit_cost: string;
  rate: string;
  amount: string;
  qty_delta: string;
  method: string;
  expiry_date: string;
  lot_mode: "exact" | "aggregate";
  reason: string;
}

function newKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function blankLine(): DraftLine {
  return {
    key: newKey(),
    line_type: "purchase",
    source_ref: "",
    business_date: "",
    product_id: "",
    supplier_id: "",
    customer_id: "",
    instrument_id: "",
    lot_id: "",
    qty: "",
    unit_cost: "",
    rate: "",
    amount: "",
    qty_delta: "",
    method: "",
    expiry_date: "",
    lot_mode: "exact",
    reason: "",
  };
}

function num(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function inWindow(date: string): boolean {
  return date >= WINDOW_START && date < WINDOW_END;
}

/** Aggregate preview (display only): aggregate:YYYY-MM:cost. The server
 *  computes the authoritative key; this preview only labels intent. */
export function aggregatePreview(businessDate: string, unitCost: string): string | null {
  const cost = num(unitCost);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate) || cost === null) return null;
  return `aggregate:${businessDate.slice(0, 7)}:${cost.toFixed(2)}`;
}

function validateLine(l: DraftLine, no: number): string | null {
  if (!LINE_TYPES.includes(l.line_type as (typeof LINE_TYPES)[number])) return `Line ${no}: unknown line type.`;
  if (l.source_ref.trim() === "") return `Line ${no} requires source_ref (no free-form entries).`;
  if (!inWindow(l.business_date)) return `Line ${no} business_date outside 12-month window.`;
  if (l.line_type === "purchase") {
    if (!l.product_id) return `Line ${no}: purchase needs a product.`;
    const qty = num(l.qty);
    if (qty === null || qty <= 0) return `Line ${no}: purchase qty must be positive.`;
    const cost = num(l.unit_cost);
    if (cost === null || cost < 0) return `Line ${no}: unit_cost must be non-negative.`;
    if (l.expiry_date.trim() === "") return `Line ${no}: unknown expiry rejected.`;
  } else if (l.line_type === "sale") {
    if (!l.product_id) return `Line ${no}: sale needs a product.`;
    const qty = num(l.qty);
    if (qty === null || qty <= 0) return `Line ${no}: sale qty must be positive.`;
    const rate = num(l.rate);
    if (rate === null || rate < 0) return `Line ${no}: sale rate must be non-negative.`;
  } else if (l.line_type === "payment") {
    if (!l.customer_id) return `Line ${no}: payment requires customer.`;
    const amount = num(l.amount);
    if (amount === null || amount <= 0) return `Line ${no}: payment amount must be positive.`;
    if (!l.instrument_id) return `Line ${no}: payment needs an instrument.`;
    if (!PAYMENT_METHODS.includes(l.method)) return `Line ${no}: unsupported payment method.`;
  } else if (l.line_type === "adjustment") {
    if (!l.lot_id) return `Line ${no}: adjustment needs an existing lot.`;
    const delta = num(l.qty_delta);
    if (delta === null || delta === 0) return `Line ${no}: adjustment delta must be non-zero.`;
    if (l.reason.trim() === "") return `Line ${no}: adjustment reason required.`;
  } else if (l.line_type === "opening_balance") {
    if (!l.instrument_id) return `Line ${no}: opening balance needs an instrument.`;
    const amount = num(l.amount);
    if (amount === null || amount <= 0) return `Line ${no}: opening amount must be positive.`;
  }
  return null;
}

function linePayload(l: DraftLine): Record<string, string | number> {
  const out: Record<string, string | number> = {
    line_type: l.line_type,
    source_ref: l.source_ref.trim(),
    business_date: l.business_date,
  };
  const put = (k: string, v: string, numeric: boolean) => {
    if (v.trim() === "") return;
    out[k] = numeric ? Number(v) : v.trim();
  };
  if (l.line_type === "purchase") {
    out.product_id = l.product_id;
    put("qty", l.qty, true);
    put("unit_cost", l.unit_cost, true);
    out.expiry_date = l.expiry_date;
    out.lot_mode = l.lot_mode;
    if (l.supplier_id) out.supplier_id = l.supplier_id;
  } else if (l.line_type === "sale") {
    out.product_id = l.product_id;
    if (l.customer_id) out.customer_id = l.customer_id;
    put("qty", l.qty, true);
    put("rate", l.rate, true);
  } else if (l.line_type === "payment") {
    out.customer_id = l.customer_id;
    put("amount", l.amount, true);
    out.instrument_id = l.instrument_id;
    out.method = l.method;
  } else if (l.line_type === "adjustment") {
    out.lot_id = l.lot_id;
    put("qty_delta", l.qty_delta, true);
    out.reason = l.reason.trim();
  } else if (l.line_type === "opening_balance") {
    out.instrument_id = l.instrument_id;
    put("amount", l.amount, true);
  }
  return out;
}

interface SubmitResult {
  id: string;
  lines_posted: number;
  lines_parked: number;
}

export function BackEntryLockAction() {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function acquire(): Promise<void> {
    if (busy || reason.trim() === "") {
      if (reason.trim() === "") setError("Lock reason required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await callV1Mutation("acquire_back_entry_lock", { p_reason: reason.trim() });
      if (res.error) {
        setError(res.error.message);
        return;
      }
      setReason("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1 basis-64">
        <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">Seal reason (required)</span>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is the historical window being sealed?"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
        />
      </label>
      <V1Confirm
        label={busy ? "Sealing…" : "Seal window"}
        title="Seal the back-entry window?"
        body="Sealing is permanent: no further historical batches can be submitted afterwards. Post-seal corrections use live-period journals only."
        confirmLabel="Seal permanently"
        onConfirm={acquire}
        disabled={busy}
      />
      {error && (
        <p role="alert" className="w-full text-xs font-semibold text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
}

export default function BackEntryBatchForm({
  products,
  suppliers,
  customers,
  instruments,
  lots,
}: {
  products: MasterOption[];
  suppliers: MasterOption[];
  customers: MasterOption[];
  instruments: MasterOption[];
  lots: LotOption[];
}) {
  const router = useRouter();
  const [batchKey, setBatchKey] = useState(newKey());
  const [batchReason, setBatchReason] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<SubmitResult | null>(null);

  function patch(key: string, p: Partial<DraftLine>): void {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...p } : l)));
  }

  async function submit(): Promise<void> {
    if (busy) return;
    if (batchReason.trim() === "") {
      setError("Batch reason required.");
      return;
    }
    if (lines.length === 0) {
      setError("Batch requires at least one line.");
      return;
    }
    for (let i = 0; i < lines.length; i += 1) {
      const failed = validateLine(lines[i], i + 1);
      if (failed) {
        setError(failed);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const res = await callV1Mutation<SubmitResult>("submit_back_entry_batch", {
        p_batch_key: batchKey,
        p_reason: batchReason.trim(),
        p_lines: lines.map(linePayload),
      });
      if (res.error || !res.data) {
        setError(res.error?.message ?? "Batch submission failed.");
        return;
      }
      setDone({
        id: String(res.data.id),
        lines_posted: Number(res.data.lines_posted),
        lines_parked: Number(res.data.lines_parked),
      });
      setBatchKey(newKey());
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function newBatch(): void {
    setBatchKey(newKey());
    setBatchReason("");
    setLines([blankLine()]);
    setDone(null);
    setError(null);
  }

  if (done) {
    return (
      <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 dark:border-teal-500/20 dark:bg-teal-500/10">
        <p role="status" className="text-sm font-extrabold text-teal-800 dark:text-teal-200">
          Batch posted atomically: {done.lines_posted} posted
          {done.lines_parked > 0 ? `, ${done.lines_parked} parked to suspense` : ""}.
        </p>
        <p className="mt-1 break-all font-mono text-xs">Batch {done.id}</p>
        {done.lines_parked > 0 && (
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            Parked lines posted nothing — review them under Suspense below.
          </p>
        )}
        <button
          type="button"
          onClick={newBatch}
          className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800"
        >
          New batch
        </button>
      </div>
    );
  }

  const selectClass =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5";
  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm dark:border-white/10 dark:bg-white/5";
  const labelClass = "mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block">
          <span className={labelClass}>Batch key (idempotency identity)</span>
          <span className="flex gap-2">
            <input type="text" value={batchKey} readOnly aria-label="Batch key" className={`${inputClass} min-w-0 flex-1`} />
            <button
              type="button"
              onClick={() => setBatchKey(newKey())}
              title="New batch identity (only for a new logical batch — retries reuse the shown key)"
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold dark:border-white/10"
            >
              New
            </button>
          </span>
        </label>
        <label className="block">
          <span className={labelClass}>Batch reason (required)</span>
          <input
            type="text"
            value={batchReason}
            onChange={(e) => setBatchReason(e.target.value)}
            placeholder="What history does this batch record?"
            className={selectClass}
          />
        </label>
      </div>

      {lines.map((l, i) => {
        const preview = l.line_type === "purchase" && l.lot_mode === "aggregate" ? aggregatePreview(l.business_date, l.unit_cost) : null;
        const parks =
          l.line_type === "purchase" && l.supplier_id === "" && l.product_id !== "" && l.qty.trim() !== "";
        return (
          <fieldset key={l.key} className="rounded-xl border border-slate-100 p-3 dark:border-white/5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Line {i + 1}</span>
              <select
                value={l.line_type}
                onChange={(e) => patch(l.key, { line_type: e.target.value })}
                aria-label={`Line ${i + 1} type`}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold dark:border-white/10 dark:bg-white/5"
              >
                {LINE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                  aria-label={`Remove line ${i + 1}`}
                  className="ml-auto rounded-lg px-2 py-1 text-xs font-bold text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                >
                  Remove
                </button>
              )}
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label className="block">
                <span className={labelClass}>Source ref (required)</span>
                <input type="text" value={l.source_ref} onChange={(e) => patch(l.key, { source_ref: e.target.value })} placeholder="Original document ref" className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Business date (required)</span>
                <input type="date" value={l.business_date} min={WINDOW_START} max="2025-12-31" onChange={(e) => patch(l.key, { business_date: e.target.value })} className={selectClass} />
              </label>
              {(l.line_type === "purchase" || l.line_type === "sale") && (
                <label className="block">
                  <span className={labelClass}>Product (required)</span>
                  <select value={l.product_id} onChange={(e) => patch(l.key, { product_id: e.target.value })} className={selectClass}>
                    <option value="">Select…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {l.line_type === "purchase" && (
                <>
                  <label className="block">
                    <span className={labelClass}>Qty (required)</span>
                    <input type="number" min={0} step="0.01" value={l.qty} onChange={(e) => patch(l.key, { qty: e.target.value })} className={inputClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Unit cost (required)</span>
                    <input type="number" min={0} step="0.01" value={l.unit_cost} onChange={(e) => patch(l.key, { unit_cost: e.target.value })} className={inputClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Expiry date (required — unknown rejected)</span>
                    <input type="date" value={l.expiry_date} onChange={(e) => patch(l.key, { expiry_date: e.target.value })} className={selectClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Supplier (empty parks to suspense)</span>
                    <select value={l.supplier_id} onChange={(e) => patch(l.key, { supplier_id: e.target.value })} className={selectClass}>
                      <option value="">None — park to suspense</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <fieldset className="block">
                    <span className={labelClass}>Lot granularity</span>
                    <span className="flex gap-3 text-sm">
                      {(["exact", "aggregate"] as const).map((m) => (
                        <label key={m} className="flex items-center gap-1">
                          <input
                            type="radio"
                            name={`lotmode-${l.key}`}
                            checked={l.lot_mode === m}
                            onChange={() => patch(l.key, { lot_mode: m })}
                          />
                          {m}
                        </label>
                      ))}
                    </span>
                  </fieldset>
                </>
              )}
              {l.line_type === "sale" && (
                <>
                  <label className="block">
                    <span className={labelClass}>Customer (optional)</span>
                    <select value={l.customer_id} onChange={(e) => patch(l.key, { customer_id: e.target.value })} className={selectClass}>
                      <option value="">Walk-in</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={labelClass}>Qty (required)</span>
                    <input type="number" min={0} step="0.01" value={l.qty} onChange={(e) => patch(l.key, { qty: e.target.value })} className={inputClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Rate (required)</span>
                    <input type="number" min={0} step="0.01" value={l.rate} onChange={(e) => patch(l.key, { rate: e.target.value })} className={inputClass} />
                  </label>
                </>
              )}
              {l.line_type === "payment" && (
                <>
                  <label className="block">
                    <span className={labelClass}>Customer (required)</span>
                    <select value={l.customer_id} onChange={(e) => patch(l.key, { customer_id: e.target.value })} className={selectClass}>
                      <option value="">Select…</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={labelClass}>Amount (required)</span>
                    <input type="number" min={0} step="0.01" value={l.amount} onChange={(e) => patch(l.key, { amount: e.target.value })} className={inputClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Method (required)</span>
                    <select value={l.method} onChange={(e) => patch(l.key, { method: e.target.value })} className={selectClass}>
                      <option value="">Select…</option>
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={labelClass}>Instrument (required)</span>
                    <select value={l.instrument_id} onChange={(e) => patch(l.key, { instrument_id: e.target.value })} className={selectClass}>
                      <option value="">Select…</option>
                      {instruments.map((ins) => (
                        <option key={ins.id} value={ins.id}>
                          {ins.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              {l.line_type === "adjustment" && (
                <>
                  <label className="block sm:col-span-2">
                    <span className={labelClass}>Existing lot (required)</span>
                    <select value={l.lot_id} onChange={(e) => patch(l.key, { lot_id: e.target.value })} className={selectClass}>
                      <option value="">Select…</option>
                      {lots.map((lot) => (
                        <option key={lot.id} value={lot.id}>
                          {lot.product_name} · {lot.qty_remaining} · exp {lot.expiry_date} · {lot.status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={labelClass}>Qty delta ≠ 0 (required)</span>
                    <input type="number" step="0.01" value={l.qty_delta} onChange={(e) => patch(l.key, { qty_delta: e.target.value })} className={inputClass} />
                  </label>
                  <label className="block sm:col-span-3">
                    <span className={labelClass}>Reason (required)</span>
                    <input type="text" value={l.reason} onChange={(e) => patch(l.key, { reason: e.target.value })} className={selectClass} />
                  </label>
                </>
              )}
              {l.line_type === "opening_balance" && (
                <>
                  <label className="block">
                    <span className={labelClass}>Instrument (required)</span>
                    <select value={l.instrument_id} onChange={(e) => patch(l.key, { instrument_id: e.target.value })} className={selectClass}>
                      <option value="">Select…</option>
                      {instruments.map((ins) => (
                        <option key={ins.id} value={ins.id}>
                          {ins.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={labelClass}>Amount (required)</span>
                    <input type="number" min={0} step="0.01" value={l.amount} onChange={(e) => patch(l.key, { amount: e.target.value })} className={inputClass} />
                  </label>
                </>
              )}
            </div>
            {preview && (
              <p className="mt-2 rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-[11px] dark:bg-white/5">
                Monthly aggregate lot — {preview}. Aggregates are never presented as exact historical batches;
                per-line source refs stay on the batch lines.
              </p>
            )}
            {parks && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                No supplier: this line will park to suspense (posted nothing), not post stock or journals.
              </p>
            )}
          </fieldset>
        );
      })}

      <button
        type="button"
        onClick={() => setLines((prev) => [...prev, blankLine()])}
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
      >
        + Add line
      </button>

      {error && (
        <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
      >
        {busy ? "Submitting…" : "Submit batch (atomic)"}
      </button>
      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        One batch, one key: retries reuse the shown key and replay the stored response. Journals post origin-dated
        and balanced, server-side; a locked period rejects the whole batch.
      </p>
    </div>
  );
}
