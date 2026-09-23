"use client";

/**
 * POS discount + approval module — Phase 6 Step 3 (client).
 *
 * Contract facts this file depends on (verified in migration bodies):
 * - request_approval(p_scope_hash, p_entity_type, p_entity_id, p_action,
 *   p_details, p_reason) records requester from the caller JWT, starts a
 *   15-minute server-side expiry, and rejects duplicate scopes per tenant
 *   (UNIQUE tenant/scope_hash). It takes NO idempotency key.
 * - approve_override(p_approval_id) is admin-only, pending-only,
 *   expiry-checked, and enforces separation of duties server-side with the
 *   sole-Admin exception (server counts active admins). It transitions the
 *   row to 'consumed' immediately and audits requester/approver/timestamps/
 *   reason/scope plus a self_approved flag. There is no transition OUT of
 *   'consumed' or 'rejected' anywhere in the baseline.
 * - reject_approval(p_approval_id, p_reason) is admin-only, pending-only,
 *   reason-required, and audited.
 * - create_sale does NOT read the approvals table: it only requires the
 *   approver to be an active admin. Approval validity at submit time is
 *   therefore re-verified HERE by recomputing the scope hash from the live
 *   cart/discount/customer/date and comparing it to the approved row,
 *   which is re-read immediately before submission (terminal rows are
 *   immutable, so a consumed row with a matching scope cannot have
 *   changed under us).
 * - Scope hashing: the baseline defines scope_hash as caller-supplied
 *   opaque text (no server algorithm exists), so this module builds a
 *   canonical JSON scope and digests it with SHA-256 (standard function,
 *   not a business rule). Any financially relevant change alters the
 *   digest and invalidates the approval.
 */

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { callV1Mutation } from "@/lib/v1/v1-rpc";
import type { V1SaleLine } from "@/lib/v1/v1-contracts";
import type { PosCustomer } from "./counter";

export const DISCOUNT_ENTITY_TYPE = "sale";
export const DISCOUNT_ACTION = "discount_override";

export interface DiscountScope {
  entity_type: string;
  action: string;
  lines: { product_id: string; qty: number; rate: number }[];
  discount_amount: number;
  discount_percent: number | null;
  customer_id: string | null;
  invoice_date: string;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Canonical scope payload. Key order is fixed by construction; any
 *  financially relevant change alters the digest. */
export function buildDiscountScope(
  lines: V1SaleLine[],
  discountAmount: number,
  discountPercent: number | null,
  customerId: string | null,
  invoiceDate: string,
): DiscountScope {
  return {
    entity_type: DISCOUNT_ENTITY_TYPE,
    action: DISCOUNT_ACTION,
    lines: lines.map((l) => ({ product_id: l.product_id, qty: l.qty, rate: l.rate })),
    discount_amount: round2(discountAmount),
    discount_percent: discountPercent,
    customer_id: customerId,
    invoice_date: invoiceDate,
  };
}

export function scopeKey(scope: DiscountScope): string {
  return JSON.stringify(scope);
}

export async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("Scope hashing needs a secure browser context (crypto.subtle unavailable).");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type DiscountStatus =
  | "none"
  | "required"
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "invalidated";

export interface DiscountApproval {
  id: string;
  scopeHash: string;
  amount: number;
  approverId: string;
  selfApproved: boolean;
  decidedAt: string | null;
  expiresAt: string | null;
}

export interface DiscountState {
  amount: number;
  percent: number | null;
  reason: string;
  status: DiscountStatus;
  approval: DiscountApproval | null;
}

export const EMPTY_DISCOUNT: DiscountState = {
  amount: 0,
  percent: null,
  reason: "",
  status: "none",
  approval: null,
};

interface ApprovalRow {
  id: string;
  scope_hash: string;
  action: string;
  reason: string | null;
  requester_profile_id: string | null;
  approver_profile_id: string | null;
  requested_at: string;
  expires_at: string;
  decided_at: string | null;
  status: string;
}

const APPROVAL_COLUMNS =
  "id, scope_hash, action, reason, requester_profile_id, approver_profile_id, requested_at, expires_at, decided_at, status, details";

/** Read-only verification read of a single approval row. RLS policy
 *  (requester-own or back-office) applies; this SELECT never modifies
 *  approvals or audit tables. */
async function fetchApproval(
  tenantId: string,
  by: { id: string } | { scopeHash: string },
): Promise<{ row: ApprovalRow | null; error: string | null }> {
  try {
    const supabase = createClient();
    let query = supabase.from("approvals").select(APPROVAL_COLUMNS).eq("tenant_id", tenantId);
    query = "id" in by ? query.eq("id", by.id) : query.eq("scope_hash", by.scopeHash);
    const { data, error } = await query.maybeSingle();
    if (error) return { row: null, error: error.message };
    if (!data) return { row: null, error: "Approval row not found or not visible to this session." };
    return { row: data as ApprovalRow, error: null };
  } catch (error) {
    return { row: null, error: error instanceof Error ? error.message : "Approval read failed." };
  }
}

/**
 * Submit-time re-verification, called immediately before create_sale.
 * Returns the approver to bind, or a blocking reason. Never approves,
 * never consumes, never trusts stored UI state alone.
 */
export async function verifyDiscountApproval(
  tenantId: string,
  approvalId: string,
  expectedScopeHash: string,
): Promise<{ ok: true; approverId: string } | { ok: false; reason: string }> {
  const { row, error } = await fetchApproval(tenantId, { id: approvalId });
  if (error || !row) return { ok: false, reason: error ?? "Approval row not found." };
  if (row.status !== "consumed") {
    return { ok: false, reason: `Approval is ${row.status}, not approved. Re-check status before submitting.` };
  }
  if (row.scope_hash !== expectedScopeHash) {
    return { ok: false, reason: "Approval scope no longer matches this sale. Request a fresh approval." };
  }
  if (!row.approver_profile_id) {
    return { ok: false, reason: "Approval carries no approver. Request a fresh approval." };
  }
  return { ok: true, approverId: row.approver_profile_id };
}

export default function PosDiscount({
  lines,
  subtotalEstimate,
  customer,
  tenantId,
  submissionKey,
  operator,
  disabled,
  onChange,
}: {
  lines: V1SaleLine[];
  subtotalEstimate: number;
  customer: PosCustomer | null;
  tenantId: string;
  submissionKey: string;
  operator: { displayName: string; role: string; profileId: string };
  disabled: boolean;
  onChange: (state: DiscountState) => void;
}) {
  const [amountStr, setAmountStr] = useState("");
  const [percentStr, setPercentStr] = useState("");
  const [reason, setReason] = useState("");
  const [state, setState] = useState<DiscountState>(EMPTY_DISCOUNT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingScope, setPendingScope] = useState<string>("");

  const isAdmin = operator.role === "admin";
  const locked = disabled || busy;
  const requested = state.approval !== null || state.status === "pending";

  function emit(next: DiscountState): void {
    setState(next);
    onChange(next);
  }

  function parseAmount(raw: string): number {
    const n = Number(raw);
    return Number.isFinite(n) ? round2(n) : NaN;
  }

  /** Discount edits after a request invalidate the approval: the digest
   *  would no longer match, so authority is dropped and splits must be
   *  rebuilt by the parent. The server row itself is untouched. */
  function editDiscount(nextAmount: number, nextPercent: number | null): void {
    // Any discount edit drops approval authority (the digest would change).
    // A still-pending server row is left untouched — the invalidated notice
    // tells the operator to have an Admin reject it.
    setPendingId(null);
    setPendingScope("");
    emit({
      amount: nextAmount,
      percent: nextPercent,
      reason,
      status: nextAmount > 0 ? "required" : "none",
      approval: null,
    });
    setError(null);
  }

  function onAmountInput(raw: string): void {
    setAmountStr(raw);
    setPercentStr("");
    const amount = raw.trim() === "" ? 0 : parseAmount(raw);
    editDiscount(Number.isNaN(amount) ? 0 : amount, null);
  }

  function onPercentInput(raw: string): void {
    setPercentStr(raw);
    const pct = raw.trim() === "" ? null : parseAmount(raw);
    if (pct === null || Number.isNaN(pct)) {
      editDiscount(state.amount, null);
      return;
    }
    editDiscount(round2((pct / 100) * subtotalEstimate), pct);
  }

  async function currentScopeHash(): Promise<{ hash: string; scope: DiscountScope }> {
    const scope = buildDiscountScope(
      lines,
      state.amount,
      state.percent,
      customer ? customer.id : null,
      todayISO(),
    );
    return { hash: await sha256Hex(scopeKey(scope)), scope };
  }

  async function adoptRow(row: ApprovalRow, scopeHash: string): Promise<void> {
    if (row.status === "rejected") {
      setPendingId(null);
      setPendingScope("");
      emit({ ...state, status: "rejected", approval: null });
      return;
    }
    if (row.status === "consumed") {
      setPendingId(null);
      setPendingScope("");
      if (row.scope_hash !== scopeHash) {
        emit({ ...state, status: "invalidated", approval: null });
        return;
      }
      emit({
        ...state,
        status: "approved",
        approval: {
          id: row.id,
          scopeHash: row.scope_hash,
          amount: state.amount,
          approverId: row.approver_profile_id ?? "",
          selfApproved: !!row.approver_profile_id && row.approver_profile_id === operator.profileId,
          decidedAt: row.decided_at,
          expiresAt: row.expires_at,
        },
      });
      return;
    }
    if (Date.parse(row.expires_at) <= Date.now()) {
      setPendingId(null);
      setPendingScope("");
      emit({ ...state, status: "expired", approval: null });
      return;
    }
    setPendingId(row.id);
    setPendingScope(scopeHash);
    emit({ ...state, status: "pending", approval: null });
  }

  async function checkById(approvalId: string, scopeHash: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const { row, error: readError } = await fetchApproval(tenantId, { id: approvalId });
      if (readError || !row) {
        setError(readError ?? "Approval row not found.");
        return;
      }
      await adoptRow(row, scopeHash);
    } finally {
      setBusy(false);
    }
  }

  async function requestApproval(selfApprove: boolean): Promise<void> {
    if (locked) return;
    if (!(state.amount > 0)) {
      setError("Enter a discount amount above zero first.");
      return;
    }
    if (state.amount > round2(subtotalEstimate)) {
      setError("Discount exceeds the estimated subtotal — the server would reject it.");
      return;
    }
    if (reason.trim() === "") {
      setError("A reason is required for every approval request.");
      return;
    }
    if (selfApprove && !isAdmin) return;
    setBusy(true);
    setError(null);
    try {
      const { hash, scope } = await currentScopeHash();
      const requested = await callV1Mutation<string>("request_approval", {
        p_scope_hash: hash,
        p_entity_type: DISCOUNT_ENTITY_TYPE,
        p_entity_id: null,
        p_action: DISCOUNT_ACTION,
        p_details: { ...scope, estimate_subtotal: round2(subtotalEstimate), submission_key: submissionKey },
        p_reason: reason.trim(),
      });
      let approvalId = requested.data;
      if (requested.error || !approvalId) {
        const message = requested.error?.message ?? "Approval request failed.";
        if (/already has an approval request/i.test(message)) {
          const existing = await fetchApproval(tenantId, { scopeHash: hash });
          if (existing.row) {
            await adoptRow(existing.row, hash);
            setError(`This exact discount was already requested (adopted existing request). ${message}`);
            return;
          }
        }
        setError(message);
        return;
      }
      if (selfApprove) {
        // Sole-Admin self-approval goes through the same server RPC the
        // Admin hub uses; the server counts active admins and rejects
        // self-approval once a second admin exists. Nothing is shortcut.
        const decided = await callV1Mutation("approve_override", { p_approval_id: approvalId });
        if (decided.error) {
          setError(decided.error.message);
          setPendingId(approvalId);
          setPendingScope(hash);
          await checkById(approvalId, hash);
          return;
        }
      } else {
        setPendingId(approvalId);
        setPendingScope(hash);
      }
      await checkById(approvalId, hash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval request failed.");
    } finally {
      setBusy(false);
    }
  }

  const amount = state.amount;
  const showForm = !requested || state.status === "invalidated" || state.status === "rejected" || state.status === "expired";

  return (
    <section
      aria-label="Discount and approval"
      className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"
    >
      <h2 className="text-sm font-extrabold tracking-tight">Discount</h2>
      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
        Every discount needs an Admin approval — no threshold bypass. Amounts here are estimates until the server
        confirms the sale.
      </p>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">Amount (₹)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={amountStr}
            disabled={locked}
            onChange={(e) => onAmountInput(e.target.value)}
            placeholder="0.00"
            aria-label="Discount amount"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm dark:border-white/10 dark:bg-white/5"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">Percent (%)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={percentStr}
            disabled={locked}
            onChange={(e) => onPercentInput(e.target.value)}
            placeholder="Optional"
            aria-label="Discount percent"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm dark:border-white/10 dark:bg-white/5"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">Reason (required)</span>
          <input
            type="text"
            value={reason}
            disabled={locked || requested}
            onChange={(e) => {
              setReason(e.target.value);
              emit({ ...state, reason: e.target.value });
            }}
            placeholder="Why this discount?"
            aria-label="Discount reason"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
          />
        </label>
      </div>

      <div aria-live="polite" className="mt-2 text-sm">
        {state.status === "none" && (
          <p className="text-slate-500 dark:text-slate-400">No discount — checkout behaves exactly as without one.</p>
        )}
        {state.status === "required" && (
          <p role="status" className="font-semibold text-amber-700 dark:text-amber-300">
            Approval required before this {amount.toFixed(2)} discount can be submitted.
          </p>
        )}
        {state.status === "pending" && (
          <p role="status" className="font-semibold text-sky-700 dark:text-sky-300">
            Approval requested — pending Admin decision. Non-admins: ask an Admin to decide in Admin → Approvals,
            then press Check status.
          </p>
        )}
        {state.status === "approved" && state.approval && (
          <p role="status" className="font-semibold text-teal-700 dark:text-teal-300">
            Approved{state.approval.selfApproved ? " (self-approved by sole Admin, recorded server-side)" : ""} ·
            decided {state.approval.decidedAt ? state.approval.decidedAt.slice(0, 19).replace("T", " ") : "—"}.
            Scope is re-verified immediately before submission.
          </p>
        )}
        {state.status === "rejected" && (
          <p role="alert" className="font-semibold text-rose-600 dark:text-rose-400">
            Approval rejected by Admin. Cart, customer, and payment draft are preserved. Change the discount to file
            a fresh request (each exact scope can be requested only once).
          </p>
        )}
        {state.status === "expired" && (
          <p role="alert" className="font-semibold text-rose-600 dark:text-rose-400">
            Approval expired (15-minute server window). Cart, customer, and payment draft are preserved. Change the
            discount to file a fresh request.
          </p>
        )}
        {state.status === "invalidated" && (
          <p role="alert" className="font-semibold text-rose-600 dark:text-rose-400">
            Approval invalidated — the sale scope changed after the decision. Request a fresh approval. The
            earlier pending request stays in Approvals — ask an Admin to reject it.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      {showForm && amount > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => requestApproval(false)}
            disabled={locked}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? "Working…" : "Request approval"}
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => requestApproval(true)}
              disabled={locked}
              title="Request and approve via the server RPC (server enforces sole-Admin eligibility)"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            >
              {busy ? "Working…" : "Request & self-approve (Admin)"}
            </button>
          )}
        </div>
      )}
      {state.status === "pending" && pendingId && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => checkById(pendingId, pendingScope)}
            disabled={locked}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            {busy ? "Checking…" : "Check status"}
          </button>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            Request <span className="font-mono">{pendingId.slice(0, 8)}</span> pending. Editing the discount drops
            this request and rebuilds the payment draft.
          </span>
        </div>
      )}
      {state.status === "approved" && state.approval && (
        <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
          Approval <span className="font-mono">{state.approval.id.slice(0, 8)}</span> · scope re-verified
          immediately before submission. Editing the discount invalidates the approval and rebuilds the payment
          draft.
        </p>
      )}
    </section>
  );
}
