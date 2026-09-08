"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  onChange: (allocations: PaymentAllocation[]) => void;
};

const METHODS: { id: PaymentAllocation["method"]; label: string }[] = [
  { id: "cash", label: "💵 Cash" },
  { id: "upi", label: "📱 UPI" },
  { id: "bank", label: "🏦 Bank" },
  { id: "wallet", label: "👛 Wallet" },
  { id: "card", label: "💳 Card" },
];

export default function MultiPaymentCollection({ totalDue, disabled, mode = "customer", initialMethod = "cash", onChange }: Props) {
  const safeTotal = Math.max(0, Number(totalDue) || 0);
  const [allocations, setAllocations] = useState<PaymentAllocation[]>(() =>
    safeTotal > 0 ? [{ method: initialMethod, amount: safeTotal.toFixed(2), instrument_id: null }] : []
  );
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
      if (prev.length === 0) return [{ method: initialMethod, amount: safeTotal.toFixed(2), instrument_id: null }];
      const prevCollected = prev.reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0);
      if (prev.length === 1 && Math.abs(prevCollected - prevTotal) < 0.005) {
        return [{ ...prev[0], amount: safeTotal.toFixed(2) }];
      }
      return prev;
    });
    previousTotalRef.current = safeTotal;
  }, [safeTotal, initialMethod]);

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
    setAllocations((prev) => prev.map((row, i) => {
      if (i !== index) return row;
      if (patch.amount === undefined) return { ...row, ...patch };
      const otherCollected = prev.reduce((sum, item, itemIndex) => itemIndex === index ? sum : sum + Math.max(0, Number(item.amount) || 0), 0);
      const maxForRow = Math.max(0, safeTotal - otherCollected);
      const raw = patch.amount.trim() === "" ? "" : Math.max(0, Math.min(maxForRow, Number(patch.amount) || 0)).toFixed(2);
      return { ...row, ...patch, amount: raw };
    }));
  }

  function addRow() {
    if (collected >= safeTotal - 0.005) return;
    const used = new Set(allocations.map((x) => x.method));
    const nextMethod = METHODS.find((m) => !used.has(m.id))?.id || "cash";
    setAllocations((prev) => [...prev, { method: nextMethod, amount: remaining.toFixed(2), instrument_id: null }]);
  }

  function removeRow(index: number) {
    setAllocations((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-500/20 dark:bg-indigo-950/20">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-black text-slate-800 dark:text-slate-100">Partial + Multiple Payment Collection</div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400">Collect one receipt using Cash, UPI, Bank, Wallet and/or Card. Any remainder becomes Khata Due.</div>
        </div>
        <button type="button" onClick={addRow} disabled={disabled || collected >= safeTotal - 0.005 || allocations.length >= METHODS.length} className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[10px] font-black text-white disabled:opacity-40">
          + Add Payment
        </button>
      </div>
      <div className="mt-2 space-y-2">
        {allocations.map((row, index) => (
          <div key={`${index}-${row.method}`} className="grid grid-cols-[1fr_110px_auto] items-center gap-2">
            <select value={row.method} onChange={(e) => updateRow(index, { method: e.target.value as PaymentAllocation["method"] })} disabled={disabled} className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-bold text-slate-800 outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white">
              {METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <input type="number" min="0" max={safeTotal} step="0.01" value={row.amount} onChange={(e) => updateRow(index, { amount: e.target.value })} disabled={disabled} className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-black font-mono text-right outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white" />
            <button type="button" onClick={() => removeRow(index)} disabled={disabled || allocations.length <= 1} className="h-8 w-8 rounded-lg border border-rose-200 bg-white text-rose-600 disabled:opacity-30 dark:border-rose-900/40 dark:bg-slate-900" title="Remove payment">×</button>
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] font-black">
        <div className="rounded-xl bg-white px-2.5 py-2 dark:bg-slate-900"><span className="text-slate-400">Total</span><div>₹{safeTotal.toFixed(2)}</div></div>
        <div className="rounded-xl bg-white px-2.5 py-2 dark:bg-slate-900"><span className="text-slate-400">Collected</span><div className="text-emerald-600">₹{collected.toFixed(2)}</div></div>
        <div className="rounded-xl bg-white px-2.5 py-2 dark:bg-slate-900"><span className="text-slate-400">{mode === "customer" ? "Khata Due" : mode === "invoice" ? "Balance Due" : "Remaining"}</span><div className="text-amber-600">₹{remaining.toFixed(2)}</div></div>
      </div>
    </div>
  );
}
