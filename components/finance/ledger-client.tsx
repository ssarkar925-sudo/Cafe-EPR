"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";

export type LedgerCustomer = {
  id: string;
  name: string;
  code: string | null;
  balance: number | string;
};

type LedgerRow = {
  id: string;
  entry_date: string;
  type: string;
  description: string | null;
  debit: number | string;
  credit: number | string;
  balance_after: number | string;
  created_at: string;
};

export default function LedgerClient({
  customers,
}: {
  customers: LedgerCustomer[];
}) {
  const supabase = createClient();
  const [customerId, setCustomerId] = useState<string>(customers[0]?.id ?? "");
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!customerId) {
      setRows([]);
      return;
    }
    setLoading(true);
    supabase
      .from("customer_ledger")
      .select("*")
      .eq("customer_id", customerId)
      .order("entry_date", { ascending: true })
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setRows((data ?? []) as LedgerRow[]);
        setLoading(false);
      });
  }, [customerId]);

  const selected = customers.find((c) => c.id === customerId);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <h1 className="text-xl font-semibold text-slate-900">Customer Ledger</h1>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        >
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.code ?? "-"})
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-500">
          Current balance:{" "}
          <span className="font-semibold text-slate-900">
            {inr(selected?.balance ?? 0)}
          </span>
        </span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Description</th>
              <th className="px-4 py-3 font-medium">Debit</th>
              <th className="px-4 py-3 font-medium">Credit</th>
              <th className="px-4 py-3 font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  Loading...
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No ledger entries yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2.5 text-slate-500">{r.entry_date}</td>
                <td className="px-4 py-2.5">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                    {r.type}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-slate-900">
                  {r.description || "-"}
                </td>
                <td className="px-4 py-2.5 text-red-600">
                  {Number(r.debit) > 0 ? inr(r.debit) : ""}
                </td>
                <td className="px-4 py-2.5 text-emerald-600">
                  {Number(r.credit) > 0 ? inr(r.credit) : ""}
                </td>
                <td className="px-4 py-2.5 font-medium text-slate-900">
                  {inr(r.balance_after)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
