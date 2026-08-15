"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import CustomerFormModal from "./customer-form-modal";

export type Customer = {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  opening_balance: number | string;
  balance: number | string;
  is_active: boolean;
};

type ModalState =
  | { mode: "create" }
  | { mode: "edit"; customer: Customer }
  | null;

function inr(n: number | string) {
  return (
    "₹" +
    Number(n).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export default function CustomersClient({
  initialCustomers,
}: {
  initialCustomers: Customer[];
}) {
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [modal, setModal] = useState<ModalState>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const supabase = createClient();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return customers.filter((c) => {
      if (status === "active" && !c.is_active) return false;
      if (status === "inactive" && c.is_active) return false;
      if (!needle) return true;
      return (
        c.name.toLowerCase().includes(needle) ||
        (c.phone ?? "").includes(needle) ||
        (c.code ?? "").toLowerCase().includes(needle)
      );
    });
  }, [customers, q, status]);

  function nextCode() {
    let max = 0;
    for (const c of customers) {
      const n = parseInt(String(c.code ?? "").replace(/\D/g, ""), 10);
      if (!Number.isNaN(n)) max = Math.max(max, n);
    }
    return "CUST-" + String(max + 1).padStart(4, "0");
  }

  async function saveCustomer(
    input: {
      name: string;
      phone: string;
      email: string;
      address: string;
      opening_balance: number;
    },
    customer?: Customer
  ) {
    if (customer) {
      const { error } = await supabase
        .from("customers")
        .update(input)
        .eq("id", customer.id);
      if (error) {
        alert(error.message);
        return;
      }
      setCustomers((prev) =>
        prev.map((c) => (c.id === customer.id ? { ...c, ...input } : c))
      );
    } else {
      const payload = {
        ...input,
        code: nextCode(),
        balance: input.opening_balance,
        is_active: true,
      };
      const { data, error } = await supabase
        .from("customers")
        .insert(payload)
        .select()
        .single();
      if (error) {
        alert(error.message);
        return;
      }
      setCustomers((prev) => [data as Customer, ...prev]);
    }
    setModal(null);
  }

  async function removeCustomer(id: string) {
    setDeletingId(id);
    const { error } = await supabase
      .from("customers")
      .update({ is_active: false })
      .eq("id", id);
    setDeletingId(null);
    if (error) {
      alert(error.message);
      return;
    }
    setCustomers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, is_active: false } : c))
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Customers</h1>
        <button
          onClick={() => setModal({ mode: "create" })}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          Add Customer
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, phone, code..."
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
        <div className="flex rounded-lg bg-slate-100 p-1 text-sm">
          {(["all", "active", "inactive"] as const).map((s) => (
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
        <span className="text-sm text-slate-500">
          {filtered.length} customers
        </span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Balance</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-500">{c.code ?? "-"}</td>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {c.name}
                </td>
                <td className="px-4 py-3 text-slate-700">{c.phone ?? "-"}</td>
                <td className="px-4 py-3 text-slate-900">{inr(c.balance)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      c.is_active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {c.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-3">
                    <button
                      onClick={() => setModal({ mode: "edit", customer: c })}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Edit
                    </button>
                    {c.is_active && (
                      <button
                        onClick={() => removeCustomer(c.id)}
                        disabled={deletingId === c.id}
                        className="text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        {deletingId === c.id ? "..." : "Deactivate"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No customers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <CustomerFormModal
          state={modal}
          onClose={() => setModal(null)}
          onSave={saveCustomer}
        />
      )}
    </div>
  );
}
