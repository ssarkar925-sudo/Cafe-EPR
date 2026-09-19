"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type PaymentAllocation = {
  method: "cash" | "upi" | "bank" | "wallet" | "card";
  amount: string;
  /** Optional concrete payment instrument used for this allocation. */
  instrument_id?: string | null;
};

type Props = {
  totalDue: number;
  disabled?: boolean;
  mode?: "customer" | "invoice" | "ledger";
  initialMethod?: PaymentAllocation["method"];
  initialAllocations?: PaymentAllocation[];
  onChange: (allocations: PaymentAllocation[]) => void;
  paymentInstruments?: Array<{ id: string; name: string; type: string; is_active?: boolean }>;
  defaultInstrumentId?: string | null;
};

const METHODS: { id: PaymentAllocation["method"]; label: string }[] = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "bank", label: "Bank" },
  { id: "wallet", label: "Wallet" },
  { id: "card", label: "Card" },
];

function instrumentMatchesMethod(type: string, method: PaymentAllocation["method"]) {
  const t = String(type || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (method === "cash") return t === "cash" || t.includes("cash");
  if (method === "upi") return t === "upi" || t === "upi_qr" || t.includes("merchant_qr");
  if (method === "bank") return t === "bank" || t.includes("bank_account") || t.includes("current_account") || t.includes("savings");
  if (method === "wallet") return t === "wallet" || t.includes("wallet");
  if (method === "card") return t === "card" || t.includes("card") || t.includes("credit_card") || t.includes("debit_card") || t === "cc";
  return false;
}

function resolveMatchingInstrument(
  method: PaymentAllocation["method"],
  preferredInstrumentId?: string | null,
  paymentInstruments: Array<{ id: string; name: string; type: string; is_active?: boolean }> = [],
): string | null {
  if (
    preferredInstrumentId &&
    paymentInstruments.some((item) => item.id === preferredInstrumentId && instrumentMatchesMethod(item.type, method))
  ) {
    return preferredInstrumentId;
  }
  const fallback = paymentInstruments.find(
    (item) => item.is_active !== false && instrumentMatchesMethod(item.type, method),
  );
  return fallback ? fallback.id : null;
}

function normalizeInitialAllocations(
  total: number,
  initialMethod: PaymentAllocation["method"],
  initialAllocations?: PaymentAllocation[],
  defaultInstrumentId?: string | null,
  paymentInstruments: Array<{ id: string; name: string; type: string; is_active?: boolean }> = [],
): PaymentAllocation[] {
  const rows = Array.isArray(initialAllocations)
    ? initialAllocations
        .filter((row) => Number(row?.amount) > 0)
        .map((row) => ({
          method: row.method,
          amount: Math.max(0, Number(row.amount) || 0).toFixed(2),
          instrument_id:
            row.instrument_id ||
            resolveMatchingInstrument(row.method, defaultInstrumentId, paymentInstruments),
        }))
    : [];

  if (rows.length > 0) return rows;
  const defaultInstrument = resolveMatchingInstrument(initialMethod, defaultInstrumentId, paymentInstruments);
  return total > 0
    ? [{ method: initialMethod, amount: total.toFixed(2), instrument_id: defaultInstrument }]
    : [];
}

export default function MultiPaymentCollection({
  totalDue,
  disabled,
  mode = "customer",
  initialMethod = "cash",
  initialAllocations,
  onChange,
  paymentInstruments = [],
  defaultInstrumentId = null,
}: Props) {
  const safeTotal = Math.max(0, Number(totalDue) || 0);
  const [internalInstruments, setInternalInstruments] = useState<Array<{ id: string; name: string; type: string; is_active?: boolean }>>([]);

  useEffect(() => {
    if (paymentInstruments && paymentInstruments.length > 0) return;
    try {
      const supabase = createClient();
      supabase
        .from("payment_instruments")
        .select("id, name, type, is_active")
        .eq("is_active", true)
        .order("name")
        .then(({ data }) => {
          if (data && data.length > 0) {
            setInternalInstruments(data);
          }
        });
    } catch {
      // Safe fallback if Supabase client cannot be initialized in test environments
    }
  }, [paymentInstruments]);

  const effectiveInstruments = useMemo(() => {
    return paymentInstruments && paymentInstruments.length > 0 ? paymentInstruments : internalInstruments;
  }, [paymentInstruments, internalInstruments]);

  const [allocations, setAllocations] = useState<PaymentAllocation[]>(() =>
    normalizeInitialAllocations(safeTotal, initialMethod, initialAllocations, defaultInstrumentId, paymentInstruments)
  );
  const [splitOpen, setSplitOpen] = useState(false);
  const previousTotalRef = useRef(safeTotal);
  const onChangeRef = useRef(onChange);
  const lastEmittedRef = useRef("");

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const prevTotal = previousTotalRef.current;
    setAllocations((prev) => {
      if (safeTotal <= 0) return [];
      if (prev.length === 0) {
        const defaultInst = resolveMatchingInstrument(initialMethod, defaultInstrumentId, effectiveInstruments);
        return [{ method: initialMethod, amount: safeTotal.toFixed(2), instrument_id: defaultInst }];
      }
      const prevCollected = prev.reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0);
      let next = prev;
      if (prev.length === 1 && Math.abs(prevCollected - prevTotal) < 0.005) {
        next = [{ ...prev[0], amount: safeTotal.toFixed(2) }];
      }
      return next.map((row) => {
        if (!row.instrument_id) {
          const resolved = resolveMatchingInstrument(row.method, defaultInstrumentId, effectiveInstruments);
          if (resolved) return { ...row, instrument_id: resolved };
        }
        return row;
      });
    });
    previousTotalRef.current = safeTotal;
  }, [safeTotal, initialMethod, defaultInstrumentId, effectiveInstruments]);

  useEffect(() => {
    const serialized = JSON.stringify(allocations);
    if (serialized === lastEmittedRef.current) return;
    lastEmittedRef.current = serialized;
    onChangeRef.current(allocations);
  }, [allocations]);

  const collected = useMemo(
    () => allocations.reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0),
    [allocations]
  );
  const remaining = Math.max(0, safeTotal - collected);

  function updateRow(index: number, patch: Partial<PaymentAllocation>) {
    setAllocations((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        let nextRow = { ...row, ...patch };
        if (patch.method && patch.method !== row.method) {
          const currentInstId = patch.instrument_id !== undefined ? patch.instrument_id : row.instrument_id;
          const stillMatches =
            currentInstId &&
            effectiveInstruments.some((item) => item.id === currentInstId && instrumentMatchesMethod(item.type, patch.method!));
          if (!stillMatches) {
            nextRow.instrument_id = resolveMatchingInstrument(patch.method, defaultInstrumentId, effectiveInstruments);
          }
        }
        if (!nextRow.instrument_id) {
          nextRow.instrument_id = resolveMatchingInstrument(nextRow.method, defaultInstrumentId, effectiveInstruments);
        }
        if (patch.amount === undefined) return nextRow;
        const otherCollected = prev.reduce(
          (sum, item, itemIndex) => (itemIndex === index ? sum : sum + Math.max(0, Number(item.amount) || 0)),
          0
        );
        const maxForRow = Math.max(0, safeTotal - otherCollected);
        const raw =
          patch.amount.trim() === "" ? "" : Math.max(0, Math.min(maxForRow, Number(patch.amount) || 0)).toFixed(2);
        return { ...nextRow, amount: raw };
      })
    );
  }

  function addRow() {
    if (safeTotal <= 0 || allocations.length >= METHODS.length) return;
    const used = new Set(allocations.map((x) => x.method));
    const nextMethod = METHODS.find((m) => !used.has(m.id))?.id || "cash";
    const nextInst = resolveMatchingInstrument(nextMethod, defaultInstrumentId, effectiveInstruments);
    setSplitOpen(true);

    setAllocations((prev) => {
      const collectedNow = prev.reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0);
      const remainingNow = Math.max(0, safeTotal - collectedNow);

      if (remainingNow > 0) {
        return [...prev, { method: nextMethod, amount: remainingNow.toFixed(2), instrument_id: nextInst }];
      }

      // The default single-payment row is normally filled to the full total.
      // Rebalance the last row so +Split immediately creates an editable mixed tender.
      if (prev.length > 0) {
        const index = prev.length - 1;
        const current = Math.max(0, Number(prev[index].amount) || 0);
        const first = Math.round((current / 2) * 100) / 100;
        const second = Math.round((current - first) * 100) / 100;
        return [
          ...prev.slice(0, index),
          { ...prev[index], amount: first.toFixed(2) },
          { method: nextMethod, amount: second.toFixed(2), instrument_id: nextInst },
        ];
      }

      return [...prev, { method: nextMethod, amount: "0.00", instrument_id: nextInst }];
    });
  }

  function removeRow(index: number) {
    setAllocations((prev) => prev.filter((_, i) => i !== index));
  }

  const rootClass = [
    "rounded-xl border border-indigo-200 bg-indigo-50/50 p-2.5 dark:border-indigo-500/20 dark:bg-indigo-950/20",
    mode === "invoice" ? "pos-standard-split-payment" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={rootClass}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Payment</span>
          <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-black">
            <span className="rounded-md bg-white px-1.5 py-1 text-slate-700 dark:bg-slate-900 dark:text-slate-200">₹{safeTotal.toFixed(2)}</span>
            <span className="rounded-md bg-white px-1.5 py-1 text-emerald-600 dark:bg-slate-900">₹{collected.toFixed(2)} paid</span>
            <span className={`rounded-md bg-white px-1.5 py-1 dark:bg-slate-900 ${remaining > 0 ? "text-amber-600" : "text-slate-500"}`}>
              ₹{remaining.toFixed(2)} {mode === "customer" ? "due" : mode === "invoice" ? "balance" : "left"}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={addRow}
          disabled={disabled || safeTotal <= 0 || allocations.length >= METHODS.length}
          className="shrink-0 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[10px] font-black text-white transition hover:bg-indigo-700 disabled:opacity-40"
        >
          + Split
        </button>
      </div>

      <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {METHODS.map((m) => {
          const active = allocations.length === 1 && allocations[0]?.method === m.id;
          return (
            <button
              key={m.id}
              type="button"
              disabled={disabled}
              onClick={() => updateRow(0, { method: m.id })}
              className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-black transition ${
                active
                  ? "bg-white text-indigo-700 ring-1 ring-indigo-200 shadow-xs dark:bg-slate-900 dark:text-indigo-300"
                  : "text-slate-500 hover:bg-white hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
              } disabled:opacity-45`}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {allocations.length === 1 && !splitOpen && allocations[0] && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-white/70 px-2 py-1.5 dark:bg-slate-900/60">
          <span className="shrink-0 text-[10px] font-bold text-slate-400">Amount</span>
          <input
            type="number"
            min="0"
            max={safeTotal}
            step="0.01"
            value={allocations[0].amount}
            onChange={(e) => updateRow(0, { amount: e.target.value })}
            disabled={disabled}
            placeholder="Amount received"
            className="min-w-0 flex-1 bg-transparent px-1 text-right text-xs font-black font-mono text-slate-900 outline-none dark:text-white"
          />
        </div>
      )}

      {(splitOpen || allocations.length > 1) && (
        <div className="mt-2 space-y-1.5">
          {allocations.map((row, index) => (
            <div key={`${index}-${row.method}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_96px_auto] items-center gap-1.5">
              <select
                value={row.method}
                onChange={(e) => updateRow(index, { method: e.target.value as PaymentAllocation["method"] })}
                disabled={disabled}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[10px] font-bold text-slate-800 outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white"
              >
                {METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <select
                value={row.instrument_id || ""}
                onChange={(e) => {
                  const chosen = e.target.value || resolveMatchingInstrument(row.method, defaultInstrumentId, effectiveInstruments);
                  updateRow(index, { instrument_id: chosen });
                }}
                disabled={disabled}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[10px] font-bold text-slate-800 outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white"
              >
                {effectiveInstruments.filter((item) => item.is_active !== false && instrumentMatchesMethod(item.type, row.method)).length === 0 && (
                  <option value="">No account configured</option>
                )}
                {effectiveInstruments.filter((item) => item.is_active !== false && instrumentMatchesMethod(item.type, row.method)).map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                max={safeTotal}
                step="0.01"
                value={row.amount}
                onChange={(e) => updateRow(index, { amount: e.target.value })}
                disabled={disabled}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-right text-[10px] font-black font-mono outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white"
              />
              <button
                type="button"
                onClick={() => removeRow(index)}
                disabled={disabled || allocations.length <= 1}
                className="h-7 w-7 rounded-lg border border-rose-200 bg-white text-xs font-black text-rose-600 disabled:opacity-30 dark:border-rose-900/40 dark:bg-slate-900"
                title="Remove payment"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-1.5 flex items-center justify-end text-[9px] font-bold text-slate-400">
        {allocations.length > 1 ? "Split collection active" : "Single payment • + Split for mixed tender"}
      </div>
    </div>
  );
}
