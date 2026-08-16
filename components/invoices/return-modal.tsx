"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import SearchableSelect from "@/components/ui/searchable-select";
import { logAudit } from "@/lib/audit";
import type { InvoiceRow } from "./invoices-client";
type Item = {
  id: string;
  description: string | null;
  product_id: string | null;
  service_id: string | null;
  qty: number | string;
  rate: number | string;
  amount: number | string;
  returned_qty: number | string;
  products: { name: string } | null;
  services: { name: string } | null;
};

const METHODS = ["cash", "upi", "card"] as const;

export default function ReturnModal({
  invoiceId,
  onClose,
  onReturned,
}: {
  invoiceId: string;
  onClose: () => void;
  onReturned: (row: InvoiceRow) => void;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [invoice, setInvoice] = useState<InvoiceRow | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState<string>("");
  const [method, setMethod] = useState<string>("cash");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [inv, its] = await Promise.all([
        supabase
          .from("invoices")
          .select(
            "id, invoice_number, invoice_date, total, paid, due, returned, refunded, status, customers(name)"
          )
          .eq("id", invoiceId)
          .single(),
        supabase
          .from("invoice_items")
          .select("*, products(name), services(name)")
          .eq("invoice_id", invoiceId)
          .order("id", { ascending: true }),
      ]);
      const data = (its.data ?? []) as Item[];
      setItems(data);
      setInvoice((inv.data as unknown) as InvoiceRow);
      const map: Record<string, number> = {};
      for (const it of data) {
        const avail = Number(it.qty) - Number(it.returned_qty || 0);
        map[it.id] = avail > 0 ? avail : 0;
      }
      setQtyMap(map);
    }
    load();
  }, [invoiceId]);

  const returnValue = useMemo(() => {
    let v = 0;
    for (const it of items) {
      const q = qtyMap[it.id] ?? 0;
      if (q > 0) v += q * Number(it.rate);
    }
    return v;
  }, [items, qtyMap]);

  const maxRefund = useMemo(() => {
    if (!invoice) return 0;
    const maxByValue = Math.min(returnValue, Number(invoice.paid));
    return Math.max(0, maxByValue);
  }, [returnValue, invoice]);

  const refundNum = Math.min(Math.max(Number(refund) || 0, 0), maxRefund);

  useEffect(() => {
    setRefund((r) => {
      const n = Number(r) || 0;
      return n > maxRefund ? String(maxRefund) : r;
    });
  }, [maxRefund]);

  function setQty(id: string, qty: number) {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    const max = Number(it.qty) - Number(it.returned_qty || 0);
    setQtyMap((m) => ({ ...m, [id]: Math.max(0, Math.min(qty, max)) }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = items
      .filter((it) => (qtyMap[it.id] ?? 0) > 0)
      .map((it) => ({ invoice_item_id: it.id, qty: qtyMap[it.id] }));
    if (payload.length === 0) {
      setError("Select at least one item to return.");
      return;
    }
    setBusy(true);
    const { data, error: err } = await supabase.rpc("process_return", {
      p_invoice_id: invoiceId,
      p_items: payload,
      p_refund: refundNum,
      p_refund_method: refundNum > 0 ? method : "cash",
      p_reason: reason,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    const r = data as {
      return_number: string;
      returned: number;
      refund: number;
      full: boolean;
      paid: number;
      due: number;
      status: string;
    };
    if (invoice) {
      onReturned({
        ...invoice,
        returned: Number(invoice.returned) + r.returned,
        refunded: Number(invoice.refunded) + r.refund,
        paid: r.paid,
        due: r.due,
        status: r.status,
      });
    }
    onClose();
    logAudit({
      action: "create",
      entity: "return",
      entity_id: (data as { id?: string })?.id ?? null,
      description: `${r.full ? "Full" : "Partial"} return ${r.return_number} (${inr(r.returned)})${r.refund > 0 ? `, refund ${inr(r.refund)}` : ""}`,
      details: { return_number: r.return_number, returned: r.returned, refund: r.refund, full: r.full },
    });
  }

  const remaining = items.reduce(
    (s, it) => s + (Number(it.qty) - Number(it.returned_qty || 0)),
    0
  );
  const allSelected = items.every(
    (it) =>
      Number(it.qty) - Number(it.returned_qty || 0) === 0 ||
      (qtyMap[it.id] ?? 0) === Number(it.qty) - Number(it.returned_qty || 0)
  );

  function selectAll() {
    const m: Record<string, number> = {};
    for (const it of items) {
      const avail = Number(it.qty) - Number(it.returned_qty || 0);
      m[it.id] = avail > 0 ? avail : 0;
    }
    setQtyMap(m);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/60 p-4 backdrop-blur-sm">
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Return Items
            </h2>
            <p className="text-xs text-slate-400">
              {invoice?.invoice_number ?? ""} ·{" "}
              {invoice?.customers?.name ?? "Walk-in customer"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        {invoice && (
          <div className="grid grid-cols-2 gap-3 border-b border-slate-100 px-6 py-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-slate-400">Invoice total</p>
              <p className="font-semibold text-slate-900">
                {inr(invoice.total)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Paid</p>
              <p className="font-semibold text-slate-900">{inr(invoice.paid)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Due</p>
              <p className="font-semibold text-slate-900">{inr(invoice.due)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Returnable qty</p>
              <p className="font-semibold text-slate-900">{remaining}</p>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Loading items…
            </p>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">
                  Line items
                </p>
                <button
                  type="button"
                  onClick={allSelected ? () => setQtyMap({}) : selectAll}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  {allSelected ? "Clear all" : "Return all"}
                </button>
              </div>

              <div className="space-y-2">
                {items.map((it) => {
                  const avail = Number(it.qty) - Number(it.returned_qty || 0);
                  const qty = qtyMap[it.id] ?? 0;
                  return (
                    <div
                      key={it.id}
                      className={`flex items-center gap-3 rounded-xl border p-3 transition ${
                        qty > 0
                          ? "border-rose-200 bg-rose-50/50"
                          : "border-slate-200"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-900">
                          {it.products?.name ??
                            it.services?.name ??
                            it.description ??
                            "-"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {avail <= 0 ? (
                            <span className="text-slate-400">
                              Fully returned
                            </span>
                          ) : (
                            <>
                              {avail} left · {inr(it.rate)} each
                            </>
                          )}
                        </p>
                      </div>
                      <div className="text-right text-sm font-medium text-slate-900">
                        {inr(qty * Number(it.rate))}
                      </div>
                      {avail > 0 && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setQty(it.id, qty - 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-white"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={0}
                            max={avail}
                            value={qty}
                            onChange={(e) =>
                              setQty(it.id, Number(e.target.value) || 0)
                            }
                            className="h-7 w-14 rounded-lg border border-slate-200 text-center text-sm text-slate-900 outline-none focus:border-rose-400"
                          />
                          <button
                            type="button"
                            onClick={() => setQty(it.id, qty + 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-white"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 rounded-xl bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-900">
                    Return value
                  </p>
                  <p className="text-lg font-bold text-rose-600">
                    {inr(returnValue)}
                  </p>
                </div>

                {maxRefund > 0 && (
                  <>
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span className="font-medium">
                          Refund to customer (partial return payment)
                        </span>
                        <button
                          type="button"
                          onClick={() => setRefund(String(maxRefund))}
                          className="rounded-md bg-slate-200 px-2 py-0.5 font-medium text-slate-700 transition hover:bg-slate-300"
                        >
                          Max {inr(maxRefund)}
                        </button>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <SearchableSelect
                          value={method}
                          onChange={setMethod}
                          options={METHODS.map((m) => ({ value: m, label: m.toUpperCase() }))}
                          searchPlaceholder="Search method…"
                          showClear={false}
                          className="w-28"
                        />
                        <input
                          type="number"
                          min={0}
                          max={maxRefund}
                          step="0.01"
                          value={refund}
                          onChange={(e) => setRefund(e.target.value)}
                          placeholder={`0 - ${maxRefund}`}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Leave at 0 for a no-money return. Refund cannot exceed{" "}
                        {inr(maxRefund)}.
                      </p>
                    </div>

                    <div className="mt-4">
                      <label className="mb-1 block text-xs font-semibold text-slate-500">
                        Reason (optional)
                      </label>
                      <textarea
                        rows={2}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g. Damaged item, wrong product…"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
                      />
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {error && (
          <p className="mx-6 mb-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
          <div className="text-sm">
            <p className="text-slate-500">
              Return value{" "}
              <span className="font-bold text-rose-600">
                {inr(returnValue)}
              </span>
            </p>
            <p className="text-slate-500">
              Refund{" "}
              <span className="font-bold text-slate-900">
                {inr(refundNum)}
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || returnValue <= 0}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Processing…" : "Process Return"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
