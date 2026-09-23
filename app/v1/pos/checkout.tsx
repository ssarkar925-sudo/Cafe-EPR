"use client";

/**
 * POS checkout — Phase 6 Step 2 (client).
 *
 * Flow (all financial mutation via lib/v1/v1-rpc.ts, never direct table
 * writes):
 *   1. editing   — payment splits are composed and validated locally.
 *   2. sale      — create_sale posts the invoice (server-authoritative
 *                  totals, FIFO, numbering, khata limit gate).
 *   3. payment   — record_claim per split (single split), or one parent
 *                  claim plus allocate_claim rows per split (split sale),
 *                  following the existing collection-allocation model.
 *   4. done/error — server values displayed verbatim; failures never
 *                  become fake successes.
 *
 * Contract facts this file depends on (verified in migration bodies):
 * - create_sale returns exactly {id, invoice_number, total}; discount
 *   defaults to 0 when omitted (this step never sends one — Step 3 owns
 *   discounts); the V1_005 replacement enforces the khata limit gate.
 * - record_claim requires an active instrument for every claim and
 *   returns {id, state: 'recorded'}; recognition is back-office-only and
 *   is NOT part of this step.
 * - allocate_claim carries no idempotency key: acknowledged allocations
 *   are tracked in-component and skipped on retry; sale/claim retries
 *   reuse the caller-supplied keys (safe server-side replay).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { V1ClaimMethod, V1SaleLine } from "@/lib/v1/v1-contracts";
import { callV1Mutation } from "@/lib/v1/v1-rpc";
import type { PosCustomer, PosInstrument, PosProduct } from "./counter";
import PosDiscount, {
  EMPTY_DISCOUNT,
  buildDiscountScope,
  scopeKey,
  sha256Hex,
  todayISO,
  verifyDiscountApproval,
  type DiscountState,
} from "./discount";

const METHODS: V1ClaimMethod[] = ["cash", "upi", "card", "wallet", "credit"];

/** UI default instrument types per method (convenience only; the operator
 *  may pick any active instrument and the server validates it). */
const DEFAULT_ITYPES: Record<V1ClaimMethod, string[]> = {
  cash: ["cash"],
  upi: ["upi_qr"],
  card: ["card"],
  wallet: ["wallet"],
  credit: [],
};

interface Split {
  key: string;
  method: V1ClaimMethod;
  amount: string;
  instrumentId: string;
}

interface SaleResult {
  id: string;
  invoice_number: string;
  total: number;
}

type Phase =
  | { kind: "editing" }
  | { kind: "sale" }
  | { kind: "payment" }
  | { kind: "done"; sale: SaleResult }
  | {
      kind: "error";
      step: "sale" | "payment";
      message: string;
      hint: string | null;
      sale: SaleResult | null;
      claimId: string | null;
    };

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function parseAmount(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return round2(n);
}

/** Display-only hint for known server rejections. The verbatim message is
 *  always shown alongside; hints never alter control flow. */
function hintFor(message: string): string | null {
  if (/credit limit exceeded/i.test(message)) {
    return "Server khata gate: dues plus this sale exceed the customer limit. Reduce the cart, collect against dues first, or ask back-office to review the limit. The cart is preserved.";
  }
  if (/insufficient unreserved stock/i.test(message)) {
    return "Stock changed after the counter snapshot (another sale consumed it). Close checkout, adjust the cart to available quantities, and submit again.";
  }
  if (/unknown or inactive (customer|product|instrument)/i.test(message)) {
    return "A master changed after the snapshot was taken. Refresh the counter and rebuild the cart.";
  }
  if (/not authenticated|authentication|session|expired|jwt|permission|denied/i.test(message)) {
    return "Authorization/session problem. Sign in again, then retry — the same submission identity is reused, so a committed step replays instead of duplicating.";
  }
  if (/HTTP 5|network|fetch|load failed|timeout/i.test(message)) {
    return "Network/server error: the step may or may not have committed. Retry reuses the same submission identity (safe replay if it committed).";
  }
  return null;
}

function newKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

export default function PosCheckout({
  lines,
  products,
  customer,
  instruments,
  estimateTotal,
  saleKey,
  tenantId,
  operator,
  onClose,
  onSuccess,
}: {
  lines: V1SaleLine[];
  products: PosProduct[];
  customer: PosCustomer | null;
  instruments: PosInstrument[];
  estimateTotal: number;
  saleKey: string;
  tenantId: string;
  operator: { displayName: string; role: string; profileId: string };
  onClose: () => void;
  onSuccess: () => void;
}) {
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const instrumentById = useMemo(() => new Map(instruments.map((i) => [i.id, i])), [instruments]);

  function defaultInstrument(method: V1ClaimMethod): string {
    const preferred = instruments.find((i) => DEFAULT_ITYPES[method].includes(i.itype));
    return preferred ? preferred.id : (instruments[0]?.id ?? "");
  }

  const [splits, setSplits] = useState<Split[]>([
    { key: newKey(), method: "cash", amount: String(round2(estimateTotal)), instrumentId: defaultInstrument("cash") },
  ]);
  const [tendered, setTendered] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "editing" });
  const [busy, setBusy] = useState(false);
  const [ackedAllocs, setAckedAllocs] = useState<string[]>([]);
  const [discount, setDiscount] = useState<DiscountState>(EMPTY_DISCOUNT);
  const busyRef = useRef(false);
  const prevDiscountAmount = useRef(0);

  const parsed = splits.map((s) => ({ ...s, value: parseAmount(s.amount) }));
  const splitSum = round2(parsed.reduce((sum, s) => sum + (s.value ?? NaN), 0));
  const estimate = round2(estimateTotal);
  // Payable estimate: discounted when an approval-backed discount exists.
  // The server total governs after create_sale; this figure only sizes the
  // payment draft and is always labeled an estimate.
  const payable = round2(estimate - discount.amount);
  const discountApproval = discount.status === "approved" && discount.approval ? discount.approval : null;

  // A changed discount rebuilds the payment draft: stale allocations
  // against the old payable are recalculated, never reused.
  useEffect(() => {
    if (prevDiscountAmount.current === discount.amount) return;
    prevDiscountAmount.current = discount.amount;
    const nextPayable = round2(estimate - discount.amount);
    setSplits([
      {
        key: newKey(),
        method: "cash",
        amount: String(nextPayable),
        instrumentId: defaultInstrument("cash"),
      },
    ]);
    setTendered("");
    setAckedAllocs([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discount.amount]);
  const singleCash = splits.length === 1 && splits[0].method === "cash";
  const tenderedValue = tendered.trim() === "" ? null : parseAmount(tendered);
  const change = tenderedValue === null ? null : round2(tenderedValue - payable);

  function validationError(): string | null {
    if (lines.length === 0) return "Cart is empty — nothing to submit.";
    if (instruments.length === 0) return "No active payment instruments. Configure instruments under Masters first.";
    for (const s of parsed) {
      if (s.value === null) return `Amount for ${s.method} is not a number.`;
      if (s.value <= 0) return `Amount for ${s.method} must be positive (zero and negative allocations are rejected).`;
      if (!s.instrumentId || !instrumentById.has(s.instrumentId)) {
        return `Choose an active instrument for the ${s.method} split.`;
      }
    }
    if (parsed.some((s) => s.method === "credit") && !customer) {
      return "Credit requires a selected customer. Select a khata customer or remove the credit split.";
    }
    if (Number.isNaN(splitSum)) return "Split amounts are invalid.";
    if (discount.amount > 0) {
      if (discount.status !== "approved" || !discountApproval) {
        const statusHint: Record<string, string> = {
          required: "Discount needs an Admin approval before submission — request one in the Discount section.",
          pending: "Discount approval is still pending — check its status in the Discount section.",
          rejected: "Discount approval was rejected — change the discount or proceed without it.",
          expired: "Discount approval expired — change the discount to request a fresh one.",
          invalidated: "Discount approval was invalidated — request a fresh approval.",
        };
        return statusHint[discount.status] ?? "Discount needs an approved Admin approval before submission.";
      }
    }
    if (splitSum !== payable) {
      return `Allocation total ${splitSum.toFixed(2)} must equal the payable amount ${payable.toFixed(2)}.`;
    }
    return null;
  }

  const blockReason = phase.kind === "editing" ? validationError() : null;

  function addSplit(): void {
    setSplits((prev) => [...prev, { key: newKey(), method: "upi", amount: "0", instrumentId: defaultInstrument("upi") }]);
  }

  function updateSplit(key: string, patch: Partial<Split>): void {
    setSplits((prev) =>
      prev.map((s) => {
        if (s.key !== key) return s;
        const next = { ...s, ...patch };
        if (patch.method && !patch.instrumentId) next.instrumentId = defaultInstrument(patch.method);
        return next;
      }),
    );
  }

  function removeSplit(key: string): void {
    setSplits((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.key !== key)));
  }

  async function submit(): Promise<void> {
    if (busyRef.current) return;
    const blocked = validationError();
    if (blocked || phase.kind !== "editing") return;
    busyRef.current = true;
    setBusy(true);
    try {
      // --- Step A0: approval re-verification (discounted sales only) ---------
      // Recomputed from the LIVE cart/discount/customer/date and checked
      // against a freshly re-read approval row immediately before
      // create_sale. Stored UI state alone is never trusted.
      let approverId: string | null = null;
      if (discountApproval) {
        const invoiceDate = todayISO();
        const scope = buildDiscountScope(
          lines,
          discount.amount,
          discount.percent,
          customer ? customer.id : null,
          invoiceDate,
        );
        const verified = await verifyDiscountApproval(tenantId, discountApproval.id, await sha256Hex(scopeKey(scope)));
        if (!verified.ok) {
          setPhase({
            kind: "error",
            step: "sale",
            message: `Discount approval no longer valid: ${verified.reason} No sale was submitted.`,
            hint: "Request a fresh approval in the Discount section, then submit again with the same cart.",
            sale: null,
            claimId: null,
          });
          return;
        }
        approverId = verified.approverId;
      }
      // --- Step A: server-authoritative sale ---------------------------------
      setPhase({ kind: "sale" });
      const invoiceDate = todayISO();
      const saleRes = await callV1Mutation<SaleResult>("create_sale", {
        p_customer_id: customer ? customer.id : null,
        p_invoice_date: invoiceDate,
        p_lines: lines.map((l) => ({ product_id: l.product_id, qty: l.qty, rate: l.rate })),
        // Without an approved discount this spread is empty: Step-2
        // behavior is preserved exactly. The approved amount is the only
        // value that may travel here — never raw user input.
        ...(discountApproval && approverId
          ? { p_discount: discountApproval.amount, p_approver_profile_id: approverId }
          : {}),
        p_idempotency_key: saleKey,
      });
      if (saleRes.error || !saleRes.data) {
        const message = saleRes.error?.message ?? "Sale submission failed.";
        setPhase({ kind: "error", step: "sale", message, hint: hintFor(message), sale: null, claimId: null });
        return;
      }
      const sale: SaleResult = {
        id: String(saleRes.data.id),
        invoice_number: String(saleRes.data.invoice_number),
        total: round2(Number(saleRes.data.total)),
      };

      // Server total governs from here on; estimates are discarded.
      if (splitSum !== sale.total) {
        setPhase({
          kind: "error",
          step: "payment",
          message: `Allocation total ${splitSum.toFixed(2)} does not equal the server-confirmed total ${sale.total.toFixed(2)}. No payment was recorded.`,
          hint: "Adjust the split amounts to the server total and retry payment recording. The sale itself is posted and safe.",
          sale,
          claimId: null,
        });
        return;
      }

      // --- Step B: payment claims --------------------------------------------
      setPhase({ kind: "payment" });
      const claimKey = `${saleKey}:claim`;
      if (parsed.length === 1) {
        const only = parsed[0];
        const claimRes = await callV1Mutation<{ id: string }>("record_claim", {
          p_customer_id: customer ? customer.id : null,
          p_invoice_id: sale.id,
          p_method: only.method,
          p_amount: only.value as number,
          p_instrument_id: only.instrumentId,
          p_idempotency_key: claimKey,
        });
        if (claimRes.error || !claimRes.data) {
          const message = claimRes.error?.message ?? "Payment recording failed.";
          setPhase({ kind: "error", step: "payment", message, hint: hintFor(message), sale, claimId: null });
          return;
        }
        setPhase({ kind: "done", sale });
        return;
      }

      const parent = parsed[0];
      const claimRes = await callV1Mutation<{ id: string }>("record_claim", {
        p_customer_id: customer ? customer.id : null,
        p_invoice_id: sale.id,
        p_method: parent.method,
        p_amount: sale.total,
        p_instrument_id: parent.instrumentId,
        p_idempotency_key: claimKey,
      });
      if (claimRes.error || !claimRes.data) {
        const message = claimRes.error?.message ?? "Payment recording failed.";
        setPhase({ kind: "error", step: "payment", message, hint: hintFor(message), sale, claimId: null });
        return;
      }
      const claimId = String(claimRes.data.id);
      const acked = new Set(ackedAllocs);
      for (const s of parsed) {
        if (acked.has(s.key)) continue;
        const allocRes = await callV1Mutation("allocate_claim", {
          p_claim_id: claimId,
          p_method: s.method,
          p_amount: s.value as number,
          p_instrument_id: s.instrumentId,
        });
        if (allocRes.error) {
          const message = allocRes.error.message;
          setPhase({
            kind: "error",
            step: "payment",
            message,
            hint:
              "A split allocation failed after the sale posted. Do not resubmit blindly: the invoice " +
              `${sale.invoice_number} and claim are recorded — complete the remaining splits from back-office. ` +
              (hintFor(message) ?? ""),
            sale,
            claimId,
          });
          return;
        }
        acked.add(s.key);
        setAckedAllocs([...acked]);
      }
      setPhase({ kind: "done", sale });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function retry(): Promise<void> {
    if (busyRef.current) return;
    if (phase.kind !== "error") return;
    // Same submission identity is reused: create_sale/record_claim replay
    // server-side instead of duplicating; acknowledged allocations are
    // skipped. Allocation-mismatch retries return to editing instead.
    if (phase.step === "payment" && phase.sale && /does not equal the server-confirmed total/.test(phase.message)) {
      setPhase({ kind: "editing" });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      if (phase.step === "sale" || !phase.sale) {
        await submitFromSale();
      } else {
        await submitPaymentOnly(phase.sale, phase.claimId);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function submitFromSale(): Promise<void> {
    let approverId: string | null = null;
    if (discountApproval) {
      const scope = buildDiscountScope(
        lines,
        discount.amount,
        discount.percent,
        customer ? customer.id : null,
        todayISO(),
      );
      const verified = await verifyDiscountApproval(tenantId, discountApproval.id, await sha256Hex(scopeKey(scope)));
      if (!verified.ok) {
        setPhase({
          kind: "error",
          step: "sale",
          message: `Discount approval no longer valid: ${verified.reason} No sale was submitted.`,
          hint: "Request a fresh approval in the Discount section, then submit again with the same cart.",
          sale: null,
          claimId: null,
        });
        return;
      }
      approverId = verified.approverId;
    }
    setPhase({ kind: "sale" });
    const invoiceDate = todayISO();
    const saleRes = await callV1Mutation<SaleResult>("create_sale", {
      p_customer_id: customer ? customer.id : null,
      p_invoice_date: invoiceDate,
      p_lines: lines.map((l) => ({ product_id: l.product_id, qty: l.qty, rate: l.rate })),
      ...(discountApproval && approverId
        ? { p_discount: discountApproval.amount, p_approver_profile_id: approverId }
        : {}),
      p_idempotency_key: saleKey,
    });
    if (saleRes.error || !saleRes.data) {
      const message = saleRes.error?.message ?? "Sale submission failed.";
      setPhase({ kind: "error", step: "sale", message, hint: hintFor(message), sale: null, claimId: null });
      return;
    }
    const sale: SaleResult = {
      id: String(saleRes.data.id),
      invoice_number: String(saleRes.data.invoice_number),
      total: round2(Number(saleRes.data.total)),
    };
    if (splitSum !== sale.total) {
      setPhase({
        kind: "error",
        step: "payment",
        message: `Allocation total ${splitSum.toFixed(2)} does not equal the server-confirmed total ${sale.total.toFixed(2)}. No payment was recorded.`,
        hint: "Adjust the split amounts to the server total and retry payment recording. The sale itself is posted and safe.",
        sale,
        claimId: null,
      });
      return;
    }
    await submitPaymentOnly(sale, null);
  }

  async function submitPaymentOnly(sale: SaleResult, existingClaimId: string | null): Promise<void> {
    setPhase({ kind: "payment" });
    const claimKey = `${saleKey}:claim`;
    let claimId = existingClaimId;
    if (!claimId) {
      if (parsed.length === 1) {
        const only = parsed[0];
        const claimRes = await callV1Mutation<{ id: string }>("record_claim", {
          p_customer_id: customer ? customer.id : null,
          p_invoice_id: sale.id,
          p_method: only.method,
          p_amount: only.value as number,
          p_instrument_id: only.instrumentId,
          p_idempotency_key: claimKey,
        });
        if (claimRes.error || !claimRes.data) {
          const message = claimRes.error?.message ?? "Payment recording failed.";
          setPhase({ kind: "error", step: "payment", message, hint: hintFor(message), sale, claimId: null });
          return;
        }
        setPhase({ kind: "done", sale });
        return;
      }
      const parent = parsed[0];
      const claimRes = await callV1Mutation<{ id: string }>("record_claim", {
        p_customer_id: customer ? customer.id : null,
        p_invoice_id: sale.id,
        p_method: parent.method,
        p_amount: sale.total,
        p_instrument_id: parent.instrumentId,
        p_idempotency_key: claimKey,
      });
      if (claimRes.error || !claimRes.data) {
        const message = claimRes.error?.message ?? "Payment recording failed.";
        setPhase({ kind: "error", step: "payment", message, hint: hintFor(message), sale, claimId: null });
        return;
      }
      claimId = String(claimRes.data.id);
    }
    const acked = new Set(ackedAllocs);
    for (const s of parsed) {
      if (acked.has(s.key)) continue;
      const allocRes = await callV1Mutation("allocate_claim", {
        p_claim_id: claimId as string,
        p_method: s.method,
        p_amount: s.value as number,
        p_instrument_id: s.instrumentId,
      });
      if (allocRes.error) {
        const message = allocRes.error.message;
        setPhase({
          kind: "error",
          step: "payment",
          message,
          hint:
            "A split allocation failed after the sale posted. Do not resubmit blindly: the invoice " +
            `${sale.invoice_number} and claim are recorded — complete the remaining splits from back-office. ` +
            (hintFor(message) ?? ""),
          sale,
          claimId,
        });
        return;
      }
      acked.add(s.key);
      setAckedAllocs([...acked]);
    }
    setPhase({ kind: "done", sale });
  }

  const editing = phase.kind === "editing";
  const doneSale = phase.kind === "done" ? phase.sale : null;
  const failed = phase.kind === "error" ? phase : null;

  return (
    <section
      aria-label="Checkout"
      className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-extrabold tracking-tight">Checkout</h2>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {customer ? customer.name : "Walk-in"} · {lines.length} line{lines.length === 1 ? "" : "s"} · payable
          estimate {payable.toFixed(2)}
          {discount.amount > 0 ? ` (incl. ${discount.amount.toFixed(2)} discount, estimate)` : ""}
        </span>
        {editing && !busy && (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            Back to cart
          </button>
        )}
      </div>

      {doneSale ? (
        <div className="mt-3 space-y-2 rounded-xl border border-teal-200 bg-teal-50 p-4 dark:border-teal-500/20 dark:bg-teal-500/10">
          <p role="status" className="text-sm font-extrabold text-teal-800 dark:text-teal-200">
            Sale posted successfully.
          </p>
          <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Bill no (from server)</dt>
              <dd className="font-mono font-bold">{doneSale.invoice_number}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Server total</dt>
              <dd className="font-mono font-bold">{doneSale.total.toFixed(2)}</dd>
            </div>
            {discount.amount > 0 && (
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">Discount applied (submitted)</dt>
                <dd className="font-mono font-bold">{discount.amount.toFixed(2)}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Customer</dt>
              <dd className="font-bold">{customer ? customer.name : "Walk-in"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Invoice id</dt>
              <dd className="break-all font-mono text-xs">{doneSale.id}</dd>
            </div>
          </dl>
          <ul className="text-sm">
            {parsed.map((s) => (
              <li key={s.key} className="flex justify-between border-t border-teal-200/60 py-1 dark:border-teal-500/20">
                <span className="font-semibold capitalize">
                  {s.method} · {instrumentById.get(s.instrumentId)?.name ?? "unknown instrument"}
                </span>
                <span className="font-mono">{(s.value ?? 0).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          {tenderedValue !== null && singleCash && (
            <p className="text-sm">
              Tendered {tenderedValue.toFixed(2)} · change {round2(tenderedValue - doneSale.total).toFixed(2)}.
            </p>
          )}
          <button
            type="button"
            onClick={onSuccess}
            className="mt-1 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800"
          >
            New sale
          </button>
        </div>
      ) : (
        <>
          <div className="mt-3">
            <PosDiscount
              lines={lines}
              subtotalEstimate={estimate}
              customer={customer}
              tenantId={tenantId}
              submissionKey={saleKey}
              operator={operator}
              disabled={!editing || busy}
              onChange={setDiscount}
            />
          </div>
          <ul className="mt-3 space-y-3">
            {parsed.map((s, i) => (
              <li
                key={s.key}
                className="rounded-xl border border-slate-100 p-3 dark:border-white/5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Split {i + 1}</span>
                  {parsed.length > 1 && editing && !busy && (
                    <button
                      type="button"
                      onClick={() => removeSplit(s.key)}
                      aria-label={`Remove split ${i + 1}`}
                      className="ml-auto rounded-lg px-2 py-1 text-xs font-bold text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">Method</span>
                    <select
                      value={s.method}
                      disabled={!editing || busy}
                      onChange={(e) => updateSplit(s.key, { method: e.target.value as V1ClaimMethod })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
                    >
                      {METHODS.map((m) => (
                        <option key={m} value={m} className="capitalize">
                          {m}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">Amount</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={s.amount}
                      disabled={!editing || busy}
                      onChange={(e) => updateSplit(s.key, { amount: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm dark:border-white/10 dark:bg-white/5"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">Instrument</span>
                    <select
                      value={s.instrumentId}
                      disabled={!editing || busy}
                      onChange={(e) => updateSplit(s.key, { instrumentId: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
                    >
                      <option value="">Select instrument</option>
                      {instruments.map((ins) => (
                        <option key={ins.id} value={ins.id}>
                          {ins.name} ({ins.itype})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {s.method === "credit" && (
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {customer
                      ? `Khata sale to ${customer.name}. The server enforces their credit limit at submission.`
                      : "Credit requires a selected customer — go back and select one, or remove this split."}
                  </p>
                )}
              </li>
            ))}
          </ul>

          {editing && !busy && (
            <button
              type="button"
              onClick={addSplit}
              className="mt-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            >
              + Add split
            </button>
          )}

          <dl className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm dark:border-white/5">
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Allocated</dt>
              <dd className="font-mono font-bold">{Number.isNaN(splitSum) ? "—" : splitSum.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Remaining</dt>
              <dd className="font-mono font-bold">
                {Number.isNaN(splitSum) ? "—" : round2(estimate - splitSum).toFixed(2)}
              </dd>
            </div>
            {singleCash && editing && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">Cash tendered (optional)</dt>
                <dd>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={tendered}
                    disabled={busy}
                    onChange={(e) => setTendered(e.target.value)}
                    placeholder="0.00"
                    aria-label="Cash tendered"
                    className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right font-mono text-sm dark:border-white/10 dark:bg-white/5"
                  />
                </dd>
              </div>
            )}
            {change !== null && singleCash && (
              <div className="flex justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Change due (estimate)</dt>
                <dd className="font-mono font-bold">{change.toFixed(2)}</dd>
              </div>
            )}
          </dl>

          {failed && (
            <div
              role="alert"
              className="mt-3 space-y-1 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm dark:border-rose-500/20 dark:bg-rose-500/10"
            >
              <p className="font-extrabold text-rose-700 dark:text-rose-300">
                {failed.step === "sale" ? "Sale submission failed." : "Payment recording failed."} Cart preserved.
              </p>
              <p className="font-mono text-xs text-rose-700 dark:text-rose-300">{failed.message}</p>
              {failed.hint && <p className="text-xs text-rose-600 dark:text-rose-400">{failed.hint}</p>}
              {failed.sale && (
                <p className="text-xs text-rose-600 dark:text-rose-400">
                  Posted bill {failed.sale.invoice_number} · server total {failed.sale.total.toFixed(2)}
                  {failed.claimId ? ` · claim ${failed.claimId.slice(0, 8)}` : " · no payment recorded yet"}.
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={retry}
                  disabled={busy}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {busy ? "Retrying…" : "Retry (same submission)"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={busy}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                >
                  Back to cart
                </button>
              </div>
            </div>
          )}

          {editing && (
            <>
              {blockReason && (
                <p role="alert" className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                  {blockReason}
                </p>
              )}
              <button
                type="button"
                onClick={submit}
                disabled={busy || blockReason !== null}
                title={blockReason ?? "Submit sale and record payment"}
                className="mt-3 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "Submitting…" : `Submit sale · ${payable.toFixed(2)}`}
              </button>
              <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                One submission, one idempotency identity. Repeat clicks and retries replay instead of duplicating.
              </p>
            </>
          )}
          {!editing && !failed && (
            <p role="status" className="mt-3 text-sm font-semibold text-slate-600 dark:text-slate-300">
              {phase.kind === "sale" ? "Posting sale…" : "Recording payment…"} Cart is locked until this finishes.
            </p>
          )}
        </>
      )}
    </section>
  );
}
