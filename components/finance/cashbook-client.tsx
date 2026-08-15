"use client";

import { useMemo, useState } from "react";
import { inr } from "@/lib/format";

export type CashEntry = {
  id: string;
  entry_date: string;
  method: string;
  direction: string;
  amount: number | string;
  description: string | null;
  created_at: string;
};

export default function CashbookClient({
  initialEntries,
}: {
  initialEntries: CashEntry[];
}) {
  const [method, setMethod] = useState("all");
  const [direction, setDirection] = useState<"all" | "in" | "out">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = useMemo(() => {
    return initialEntries.filter((e) => {
      if (method !== "all" && e.method !== method) return false;
      if (direction !== "all" && e.direction !== direction) return false;
      if (from && e.entry_date < from) return false;
      if (to && e.entry_date > to) return false;
      return true;
    });
  }, [initialEntries, method, direction, from, to]);

  const totals = useMemo(() => {
    let balance = 0;
    const rows = filtered.map((e) => {
      const delta = e.direction === "in" ? Number(e.amount) : -Number(e.amount);
      balance += delta;
      return { ...e, balance };
    });
    const totalIn = filtered
      .filter((e) => e.direction === "in")
      .reduce((s, e) => s + Number(e.amount), 0);
    const totalOut = filtered
      .filter((e) => e.direction === "out")
      .reduce((s, e) => s + Number(e.amount), 0);
    return { rows, totalIn, totalOut };
  }, [filtered]);

  const inputClass =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <h1 className="text-xl font-semibold text-slate-900">Cash Book</h1>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">Total In</p>
          <p className="mt-1 text-xl font-semibold text-emerald-600">
            {inr(totals.totalIn)}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">Total Out</p>
          <p className="mt-1 text-xl font-semibold text-red-600">
            {inr(totals.totalOut)}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">Closing Balance</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">
            {inr(totals.totalIn - totals.totalOut)}
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className={inputClass}
        >
          <option value="all">All methods</option>
          <option value="cash">Cash</option>
          <option value="upi">UPI</option>
          <option value="card">Card</option>
        </select>
        <div className="flex rounded-lg bg-slate-100 p-1 text-sm">
          {(["all", "in", "out"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDirection(d)}
              className={`rounded-md px-3 py-1 ${
                direction === d
                  ? "bg-white font-medium text-slate-900 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              {d[0].toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className={inputClass}
        />
        <span className="text-sm text-slate-400">to</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className={inputClass}
        />
        <span className="text-sm text-slate-500">{filtered.length} entries</span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Description</th>
              <th className="px-4 py-3 font-medium">Method</th>
              <th className="px-4 py-3 font-medium">In</th>
              <th className="px-4 py-3 font-medium">Out</th>
              <th className="px-4 py-3 font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {totals.rows.map((e) => (
              <tr key={e.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2.5 text-slate-500">{e.entry_date}</td>
                <td className="px-4 py-2.5 text-slate-900">
                  {e.description || "-"}
                </td>
                <td className="px-4 py-2.5 text-slate-700">
                  {e.method.toUpperCase()}
                </td>
                <td className="px-4 py-2.5 text-emerald-600">
                  {e.direction === "in" ? inr(e.amount) : ""}
                </td>
                <td className="px-4 py-2.5 text-red-600">
                  {e.direction === "out" ? inr(e.amount) : ""}
                </td>
                <td className="px-4 py-2.5 font-medium text-slate-900">
                  {inr(e.balance)}
                </td>
              </tr>
            ))}
            {totals.rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No cash entries match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
