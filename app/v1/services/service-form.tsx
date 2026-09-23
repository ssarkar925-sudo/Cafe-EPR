"use client";

/**
 * Shared Record-only service form island — V1 Services milestone (client).
 *
 * Submits record_service_txn exclusively through lib/v1/v1-rpc.ts with a
 * caller-supplied idempotency key (retained for safe retry). Field sets
 * below are EXACTLY the frozen G5 per-type columns; the details payload
 * carries only frozen keys (the server ignores unknown keys, but none are
 * sent). Client checks mirror the contract minimally (presence, formats,
 * non-negativity); the server remains authoritative and its errors are
 * shown verbatim. No provider APIs, webhooks, credentials, settlement, or
 * accounting choices exist anywhere here.
 */

import { useState } from "react";
import { callV1Mutation } from "@/lib/v1/v1-rpc";
import type { V1ClaimMethod, V1ServiceType } from "@/lib/v1/v1-contracts";

export interface ServiceInstrument {
  id: string;
  name: string;
  itype: string;
}

interface FieldDef {
  key: string;
  label: string;
  required: boolean;
  type: "text" | "select" | "amount";
  options?: string[];
  placeholder?: string;
}

/** Frozen G5 field sets. Keys must stay within the service_transactions
 *  columns; values mirror the server CHECK constraints. */
export const SERVICE_FIELDS: Record<V1ServiceType, FieldDef[]> = {
  aeps: [
    { key: "aadhaar_last4", label: "Aadhaar last 4 digits", required: true, type: "text", placeholder: "4 digits only" },
    { key: "aeps_txn_type", label: "AEPS transaction type", required: true, type: "select", options: ["cash_out", "balance_enquiry", "mini_statement"] },
    { key: "bank_ref", label: "Bank ref (optional)", required: false, type: "text" },
    { key: "portal_ref", label: "Portal ref (optional)", required: false, type: "text" },
  ],
  dmt: [
    { key: "sender_name", label: "Sender name", required: true, type: "text" },
    { key: "sender_mobile", label: "Sender mobile (optional)", required: false, type: "text" },
    { key: "beneficiary_name", label: "Beneficiary name", required: true, type: "text" },
    { key: "beneficiary_mobile", label: "Beneficiary mobile (optional)", required: false, type: "text" },
    { key: "beneficiary_bank", label: "Beneficiary bank (optional)", required: false, type: "text" },
    { key: "beneficiary_ifsc", label: "Beneficiary IFSC (optional)", required: false, type: "text" },
    { key: "beneficiary_account", label: "Beneficiary account", required: true, type: "text" },
    { key: "transfer_method", label: "Transfer method (optional)", required: false, type: "select", options: ["bank_account", "upi"] },
  ],
  upi: [
    { key: "upi_id", label: "UPI id", required: true, type: "text" },
    { key: "merchant_qr_ref", label: "Merchant QR ref", required: true, type: "text" },
  ],
  recharge: [
    { key: "provider_ref", label: "Provider ref", required: true, type: "text" },
    { key: "receiver_number", label: "Receiver number", required: true, type: "text" },
    { key: "plan_ref", label: "Plan ref (optional)", required: false, type: "text" },
  ],
  bbps: [
    { key: "biller_ref", label: "Biller ref", required: true, type: "text" },
    { key: "consumer_number", label: "Consumer number", required: true, type: "text" },
    { key: "bill_amount", label: "Bill amount (₹, 0 allowed)", required: true, type: "amount" },
  ],
};

const COLLECT_METHODS: V1ClaimMethod[] = ["cash", "upi", "card", "wallet", "credit"];

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function newKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

interface Success {
  id: string;
  transaction_number: string;
  claim_id: string | null;
}

export default function ServiceForm({
  type,
  instruments,
}: {
  type: V1ServiceType;
  instruments: ServiceInstrument[];
}) {
  const fields = SERVICE_FIELDS[type];
  const [values, setValues] = useState<Record<string, string>>({});
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("");
  const [commission, setCommission] = useState("");
  const [collectMethod, setCollectMethod] = useState("");
  const [collectInstrument, setCollectInstrument] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Success | null>(null);
  const [key, setKey] = useState(newKey());

  function set(key_: string, value: string): void {
    setValues((prev) => ({ ...prev, [key_]: value }));
  }

  function validate(): string | null {
    if (!date) return "Transaction date required.";
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return "Amount must be positive.";
    for (const key_ of ["fee", "commission"]) {
      const raw = key_ === "fee" ? fee : commission;
      if (raw.trim() === "") continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return "Fee/commission must be non-negative.";
    }
    for (const f of fields) {
      const raw = (values[f.key] ?? "").trim();
      if (f.required && raw === "") return `${f.label} is required.`;
      if (raw === "") continue;
      if (f.key === "aadhaar_last4" && !/^[0-9]{4}$/.test(raw)) {
        return "AEPS requires 4-digit aadhaar_last4.";
      }
      if (f.key === "aeps_txn_type" && !["cash_out", "balance_enquiry", "mini_statement"].includes(raw)) {
        return "AEPS requires a valid aeps_txn_type.";
      }
      if (f.key === "transfer_method" && !["bank_account", "upi"].includes(raw)) {
        return "DMT transfer_method must be bank_account or upi.";
      }
      if (f.key === "bill_amount") {
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) return "BBPS requires non-negative bill_amount.";
      }
    }
    const wantCollect = collectMethod !== "" || collectInstrument !== "";
    if (wantCollect && (collectMethod === "" || collectInstrument === "")) {
      return "Collection needs both method and instrument, or neither.";
    }
    return null;
  }

  async function submit(): Promise<void> {
    if (busy) return;
    const failed = validate();
    if (failed) {
      setError(failed);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Frozen keys only; empty optionals are omitted (the server treats
      // missing and blank identically via nullif guards).
      const details: Record<string, string | number> = {};
      for (const f of fields) {
        const raw = (values[f.key] ?? "").trim();
        if (raw === "") continue;
        details[f.key] = f.key === "bill_amount" ? round2(Number(raw)) : raw;
      }
      const res = await callV1Mutation<Success>("record_service_txn", {
        p_service_type: type,
        p_transaction_date: date,
        p_amount: round2(Number(amount)),
        p_fee: fee.trim() === "" ? 0 : round2(Number(fee)),
        p_commission: commission.trim() === "" ? 0 : round2(Number(commission)),
        p_details: details,
        ...(collectMethod !== ""
          ? { p_collect_method: collectMethod, p_collect_instrument_id: collectInstrument }
          : {}),
        p_idempotency_key: key,
      });
      if (res.error || !res.data) {
        setError(res.error?.message ?? "Service record failed.");
        return;
      }
      setDone({
        id: String(res.data.id),
        transaction_number: String(res.data.transaction_number),
        claim_id: res.data.claim_id ? String(res.data.claim_id) : null,
      });
    } finally {
      setBusy(false);
    }
  }

  function recordAnother(): void {
    setValues({});
    setAmount("");
    setFee("");
    setCommission("");
    setCollectMethod("");
    setCollectInstrument("");
    setDone(null);
    setError(null);
    setKey(newKey());
  }

  if (done) {
    return (
      <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 dark:border-teal-500/20 dark:bg-teal-500/10">
        <p role="status" className="text-sm font-extrabold text-teal-800 dark:text-teal-200">
          Service transaction recorded.
        </p>
        <p className="mt-1 font-mono text-sm font-bold">{done.transaction_number}</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Local record only — no provider was contacted.
          {done.claim_id
            ? ` Collection claim recorded (${done.claim_id.slice(0, 8)}); recognition is a separate back-office step.`
            : ""}
        </p>
        <button
          type="button"
          onClick={recordAnother}
          className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800"
        >
          Record another
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">Amount (₹)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm dark:border-white/10 dark:bg-white/5"
          />
        </label>
        <span className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">Fee (₹)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm dark:border-white/10 dark:bg-white/5"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">Commission (₹)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm dark:border-white/10 dark:bg-white/5"
            />
          </label>
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {fields.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{f.label}</span>
            {f.type === "select" ? (
              <select
                value={values[f.key] ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
              >
                <option value="">{f.required ? "Select…" : "None"}</option>
                {(f.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={f.key === "bill_amount" ? "number" : "text"}
                min={f.key === "bill_amount" ? 0 : undefined}
                step={f.key === "bill_amount" ? "0.01" : undefined}
                value={values[f.key] ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.placeholder ?? ""}
                inputMode={f.key === "aadhaar_last4" ? "numeric" : undefined}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm dark:border-white/10 dark:bg-white/5"
              />
            )}
          </label>
        ))}
      </div>

      <fieldset className="rounded-xl border border-slate-100 p-3 dark:border-white/5">
        <legend className="px-1 text-xs font-bold text-slate-600 dark:text-slate-300">
          Linked collection (optional)
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">Method</span>
            <select
              value={collectMethod}
              onChange={(e) => setCollectMethod(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
            >
              <option value="">None</option>
              {COLLECT_METHODS.map((m) => (
                <option key={m} value={m} className="capitalize">
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">Instrument</span>
            <select
              value={collectInstrument}
              onChange={(e) => setCollectInstrument(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
            >
              <option value="">None</option>
              {instruments.map((ins) => (
                <option key={ins.id} value={ins.id}>
                  {ins.name} ({ins.itype})
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
          Both or neither. The claim collects the service amount; recognition stays a back-office step.
        </p>
      </fieldset>

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
        {busy ? "Recording…" : "Record service transaction"}
      </button>
      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        One record, one idempotency identity — retries replay instead of duplicating. Record-only: no provider call.
      </p>
    </div>
  );
}
