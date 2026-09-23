"use client";

/**
 * Purchase intake islands. Two documented contracts, no invented semantics:
 * - create_purchase: full purchase document (supplier, date, lines with
 *   product/qty/unit_cost/required expiry). Returns {id, total}.
 * - intake_lots: direct lot intake without a purchase document (supplier
 *   optional, expiry required per line — unknown expiry is rejected
 *   server-side). Returns the created lot ids.
 * Exactly one lot per purchase line is created server-side in both paths.
 */

import { useState } from "react";
import Link from "next/link";
import { useV1Mutation, V1Field, v1InputClass } from "@/components/v1/v1-mutation";

export interface ProductOption {
  id: string;
  name: string;
  unit: string;
}

export interface SupplierOption {
  id: string;
  name: string;
}

interface DocLine {
  product_id: string;
  qty: string;
  unit_cost: string;
  expiry_date: string;
  received_at: string;
}

const EMPTY_LINE: DocLine = { product_id: "", qty: "", unit_cost: "", expiry_date: "", received_at: "" };

function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function parseLines(lines: DocLine[]): { parsed: Record<string, unknown>[]; error: string | null } {
  if (lines.length === 0) return { parsed: [], error: "At least one line is required." };
  const parsed: Record<string, unknown>[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.product_id) return { parsed: [], error: `Line ${i + 1}: select a product.` };
    const qty = Number(line.qty);
    if (!Number.isFinite(qty) || qty <= 0) return { parsed: [], error: `Line ${i + 1}: qty must be positive.` };
    const unitCost = Number(line.unit_cost);
    if (!Number.isFinite(unitCost) || unitCost < 0)
      return { parsed: [], error: `Line ${i + 1}: unit cost must be non-negative.` };
    if (!line.expiry_date) return { parsed: [], error: `Line ${i + 1}: expiry date is required (unknown expiry is rejected).` };
    parsed.push({
      product_id: line.product_id,
      qty,
      unit_cost: unitCost,
      expiry_date: line.expiry_date,
      ...(line.received_at ? { received_at: line.received_at } : {}),
    });
  }
  return { parsed, error: null };
}

function LineEditor({
  lines,
  setLines,
  products,
  disabled,
}: {
  lines: DocLine[];
  setLines: (lines: DocLine[]) => void;
  products: ProductOption[];
  disabled: boolean;
}) {
  function setLine(index: number, patch: Partial<DocLine>) {
    setLines(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }
  return (
    <div className="space-y-2">
      {lines.map((line, i) => (
        <fieldset key={i} className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
          <legend className="px-1 text-xs font-bold text-slate-500 dark:text-slate-400">Line {i + 1}</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <V1Field label="Product" htmlFor={`line-${i}-product`}>
              <select
                id={`line-${i}-product`}
                className={v1InputClass}
                value={line.product_id}
                onChange={(e) => setLine(i, { product_id: e.target.value })}
                disabled={disabled}
              >
                <option value="">Select…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </V1Field>
            <V1Field label="Qty" htmlFor={`line-${i}-qty`}>
              <input
                id={`line-${i}-qty`}
                type="number"
                step="0.01"
                min="0"
                className={v1InputClass}
                value={line.qty}
                onChange={(e) => setLine(i, { qty: e.target.value })}
                disabled={disabled}
              />
            </V1Field>
            <V1Field label="Unit cost (₹)" htmlFor={`line-${i}-cost`}>
              <input
                id={`line-${i}-cost`}
                type="number"
                step="0.01"
                min="0"
                className={v1InputClass}
                value={line.unit_cost}
                onChange={(e) => setLine(i, { unit_cost: e.target.value })}
                disabled={disabled}
              />
            </V1Field>
            <V1Field label="Expiry (required)" htmlFor={`line-${i}-expiry`}>
              <input
                id={`line-${i}-expiry`}
                type="date"
                className={v1InputClass}
                value={line.expiry_date}
                onChange={(e) => setLine(i, { expiry_date: e.target.value })}
                disabled={disabled}
              />
            </V1Field>
            <V1Field label="Received at" htmlFor={`line-${i}-received`}>
              <input
                id={`line-${i}-received`}
                type="date"
                className={v1InputClass}
                value={line.received_at}
                onChange={(e) => setLine(i, { received_at: e.target.value })}
                disabled={disabled}
              />
            </V1Field>
          </div>
          {lines.length > 1 ? (
            <button
              type="button"
              onClick={() => setLines(lines.filter((_, j) => j !== i))}
              disabled={disabled}
              className="mt-2 text-xs font-bold text-rose-600 underline disabled:opacity-50 dark:text-rose-400"
            >
              Remove line
            </button>
          ) : null}
        </fieldset>
      ))}
      <button
        type="button"
        onClick={() => setLines([...lines, { ...EMPTY_LINE }])}
        disabled={disabled}
        className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
      >
        + Add line
      </button>
    </div>
  );
}

export function PurchaseDocumentForm({
  suppliers,
  products,
}: {
  suppliers: SupplierOption[];
  products: ProductOption[];
}) {
  const [supplierId, setSupplierId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(todayISO());
  const [lines, setLines] = useState<DocLine[]>([{ ...EMPTY_LINE }]);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; total: number } | null>(null);
  const mutation = useV1Mutation<{ id: string; total: number }>();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!supplierId) {
      setFormError("Select a supplier.");
      return;
    }
    if (!purchaseDate) {
      setFormError("Purchase date is required.");
      return;
    }
    const { parsed, error } = parseLines(lines);
    if (error) {
      setFormError(error);
      return;
    }
    setFormError(null);
    setCreated(null);
    const result = await mutation.run("create_purchase", {
      p_supplier_id: supplierId,
      p_purchase_date: purchaseDate,
      p_lines: parsed,
    });
    if (result && typeof result.id === "string") {
      setCreated({ id: result.id, total: Number(result.total) });
      setLines([{ ...EMPTY_LINE }]);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <V1Field label="Supplier (required)" htmlFor="purchase-supplier">
          <select
            id="purchase-supplier"
            className={v1InputClass}
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            disabled={mutation.pending}
          >
            <option value="">Select…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </V1Field>
        <V1Field label="Purchase date (required)" htmlFor="purchase-date">
          <input
            id="purchase-date"
            type="date"
            className={v1InputClass}
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            disabled={mutation.pending}
          />
        </V1Field>
      </div>
      <LineEditor lines={lines} setLines={setLines} products={products} disabled={mutation.pending} />
      {(formError || mutation.error) && (
        <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400">
          {formError ?? mutation.error}
        </p>
      )}
      {created ? (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          Purchase posted: total ₹{created.total}.{" "}
          <Link href={`/v1/purchases/${created.id}`} className="underline">
            Open detail →
          </Link>
        </p>
      ) : null}
      <button
        type="submit"
        disabled={mutation.pending}
        className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
      >
        {mutation.pending ? "Posting…" : "Post purchase"}
      </button>
    </form>
  );
}

export function DirectIntakeForm({
  suppliers,
  products,
}: {
  suppliers: SupplierOption[];
  products: ProductOption[];
}) {
  const [supplierId, setSupplierId] = useState("");
  const [lines, setLines] = useState<DocLine[]>([{ ...EMPTY_LINE }]);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdLots, setCreatedLots] = useState<string[] | null>(null);
  const mutation = useV1Mutation<string[]>();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const { parsed, error } = parseLines(lines);
    if (error) {
      setFormError(error);
      return;
    }
    setFormError(null);
    setCreatedLots(null);
    const result = await mutation.run("intake_lots", {
      p_supplier_id: supplierId === "" ? null : supplierId,
      p_lines: parsed,
    });
    if (result !== null && Array.isArray(result)) {
      setCreatedLots(result);
      setLines([{ ...EMPTY_LINE }]);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <V1Field label="Supplier (optional)" htmlFor="intake-supplier">
        <select
          id="intake-supplier"
          className={v1InputClass}
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          disabled={mutation.pending}
        >
          <option value="">None</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </V1Field>
      <LineEditor lines={lines} setLines={setLines} products={products} disabled={mutation.pending} />
      {(formError || mutation.error) && (
        <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400">
          {formError ?? mutation.error}
        </p>
      )}
      {createdLots ? (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          Intake created {createdLots.length} lot(s).
        </p>
      ) : null}
      <button
        type="submit"
        disabled={mutation.pending}
        className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
      >
        {mutation.pending ? "Creating…" : "Create lots"}
      </button>
    </form>
  );
}
