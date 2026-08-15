"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import TxnFormModal from "./txn-form-modal";

export type Txn = {
  id: string;
  transaction_number: string;
  service_type: string;
  direction: string;
  transaction_date: string;
  customer_name: string | null;
  phone: string | null;
  aadhaar_last4: string | null;
  bank_name: string | null;
  account_last4: string | null;
  reference: string | null;
  amount: number | string;
  commission: number | string;
  status: string;
  profiles: { full_name: string } | null;
};

const SERVICE_LABEL: Record<string, string> = {
  aeps: "AEPS",
  dmt: "DMT",
  upi: "UPI",
};

export default function TransactionsClient({
  initialTransactions,
  initialCustomers,
}: {
  initialTransactions: Txn[];
  initialCustomers: { id: string; name: string; code: string }[];
}) {
  const [txns, setTxns] = useState<Txn[]>(initialTransactions);
  const [q, setQ] = useState("");
  const [service, setService] = useState<"all" | "aeps" | "dmt" | "upi">("all");
  const [status, setStatus] = useState<"all" | "completed" | "cancelled">("all");
  const [modal, setModal] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const supabase = createClient();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return txns.filter((t) => {
      if (service !== "all" && t.service_type !== service) return false;
      if (status !== "all" && t.status !== status) return false;
      if (!needle) return true;
      return (
        t.transaction_number.toLowerCase().includes(needle) ||
        (t.customer_name ?? "").toLowerCase().includes(needle) ||
        (t.reference ?? "").toLowerCase().includes(needle) ||
        (t.phone ?? "").toLowerCase().includes(needle)
      );
    });
  }, [txns, q, service, status]);

  const totals = useMemo(() => {
    const comp = filtered.filter((t) => t.status === "completed");
    return {
      amount: comp.reduce((s, t) => s + Number(t.amount), 0),
      commission: comp.reduce((s, t) => s + Number(t.commission), 0),
      cashIn: comp
        .filter((t) => t.direction === "in")
        .reduce((s, t) => s + Number(t.amount) + Number(t.commission), 0),
      cashOut: comp
        .filter((t) => t.direction === "out")
        .reduce((s, t) => s + Number(t.amount), 0),
    };
  }, [filtered]);

  async function createTxn(input: Record<string, unknown>) {
    const { data, error } = await supabase.rpc("create_txn", {
      p_service_type: input.service_type,
      p_transaction_date: input.transaction_date,
      p_customer_id: input.customer_id ?? null,
      p_customer_name: input.customer_name ?? null,
      p_phone: input.phone ?? null,
      p_aadhaar_last4: input.aadhaar_last4 ?? null,
      p_bank_name: input.bank_name ?? null,
      p_account_last4: input.account_last4 ?? null,
      p_reference: input.reference ?? null,
      p_amount: Number(input.amount),
      p_commission: Number(input.commission ?? 0),
    });
    if (error) {
      alert(error.message);
      return;
    }
    const d = data as Record<string, unknown>;
    setTxns((prev) => [
      {
        id: d.id as string,
        transaction_number: d.transaction_number as string,
        service_type: input.service_type as string,
        direction: d.direction as string,
        transaction_date: input.transaction_date as string,
        customer_name: (input.customer_name as string) || "Walk-in",
        phone: (input.phone as string) || null,
        aadhaar_last4: (input.aadhaar_last4 as string) || null,
        bank_name: (input.bank_name as string) || null,
        account_last4: (input.account_last4 as string) || null,
        reference: (input.reference as string) || null,
        amount: Number(input.amount),
        commission: Number(input.commission ?? 0),
        status: "completed",
        profiles: null,
      },
      ...prev,
    ]);
    setModal(false);
  }

  async function cancelTxn(id: string) {
    if (!window.confirm("Cancel this transaction? Its cash entry will be reversed.")) {
      return;
    }
    setBusyId(id);
    const { error } = await supabase.rpc("cancel_txn", { p_txn_id: id });
    setBusyId(null);
    if (error) {
      alert(error.message);
      return;
    }
    setTxns((prev) => prev.map((t) => (t.id === id ? { ...t, status: "cancelled" } : t)));
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            AEPS / DMT / UPI Transactions
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Cash-in &amp; cash-out banking services. Cash book is updated
            automatically.
          </p>
        </div>
        <button
          onClick={() => setModal(true)}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          New Transaction
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search txn no, name, RRN, phone..."
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
        <div className="flex rounded-lg bg-slate-100 p-1 text-sm">
          {(["all", "aeps", "dmt", "upi"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setService(s)}
              className={`rounded-md px-3 py-1 ${
                service === s
                  ? "bg-white font-medium text-slate-900 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              {s === "all" ? "All" : SERVICE_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg bg-slate-100 p-1 text-sm">
          {(["all", "completed", "cancelled"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-md px-3 py-1 ${
                status === s
                  ? "bg-white font-medium text-slate-900 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-xs text-slate-500">Total amount</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {inr(totals.amount)}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-xs text-slate-500">Commission earned</p>
          <p className="mt-1 text-lg font-semibold text-emerald-600">
            {inr(totals.commission)}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-xs text-slate-500">Cash in</p>
          <p className="mt-1 text-lg font-semibold text-emerald-600">
            {inr(totals.cashIn)}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-xs text-slate-500">Cash out</p>
          <p className="mt-1 text-lg font-semibold text-red-600">
            {inr(totals.cashOut)}
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Txn No</th>
              <th className="px-4 py-3 font-medium">Service</th>
              <th className="px-4 py-3 font-medium">Direction</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Reference</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Commission</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-500">{t.transaction_date}</td>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {t.transaction_number}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                    {SERVICE_LABEL[t.service_type]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      t.direction === "in"
                        ? "text-emerald-600"
                        : "text-red-600"
                    }
                  >
                    {t.direction === "in" ? "IN" : "OUT"}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-900">
                  {t.customer_name || "-"}
                  {t.phone && (
                    <span className="block text-xs text-slate-400">
                      {t.phone}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">{t.reference || "-"}</td>
                <td className="px-4 py-3 text-slate-900">{inr(t.amount)}</td>
                <td className="px-4 py-3 text-emerald-600">{inr(t.commission)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      t.status === "completed"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {t.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {t.status === "completed" && (
                    <button
                      onClick={() => cancelTxn(t.id)}
                      disabled={busyId === t.id}
                      className="text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      {busyId === t.id ? "..." : "Cancel"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No transactions found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <TxnFormModal
          customers={initialCustomers}
          onClose={() => setModal(false)}
          onSave={createTxn}
        />
      )}
    </div>
  );
}
