"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ServiceFormModal from "./service-form-modal";
import { inr } from "@/lib/format";
import type { CategoryRef } from "./products-client";

export type Service = {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  price: number | string;
  is_active: boolean;
  categories: { name: string } | null;
};

type ModalState =
  | { mode: "create" }
  | { mode: "edit"; service: Service }
  | null;

export default function ServicesClient({
  initialServices,
  categories,
}: {
  initialServices: Service[];
  categories: CategoryRef[];
}) {
  const [services, setServices] = useState<Service[]>(initialServices);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [modal, setModal] = useState<ModalState>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const supabase = createClient();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return services.filter((s) => {
      if (status === "active" && !s.is_active) return false;
      if (status === "inactive" && s.is_active) return false;
      if (cat !== "all" && s.category_id !== cat) return false;
      if (!needle) return true;
      return s.name.toLowerCase().includes(needle);
    });
  }, [services, q, cat, status]);

  async function saveService(
    input: {
      name: string;
      description: string;
      category_id: string | null;
      price: number;
    },
    service?: Service
  ) {
    if (service) {
      const { error } = await supabase
        .from("services")
        .update(input)
        .eq("id", service.id);
      if (error) {
        alert(error.message);
        return;
      }
      setServices((prev) =>
        prev.map((s) => (s.id === service.id ? { ...s, ...input } : s))
      );
    } else {
      const { data, error } = await supabase
        .from("services")
        .insert({ ...input, is_active: true })
        .select("*, categories(name)")
        .single();
      if (error) {
        alert(error.message);
        return;
      }
      setServices((prev) => [data as Service, ...prev]);
    }
    setModal(null);
  }

  async function removeService(id: string) {
    setDeletingId(id);
    const { error } = await supabase
      .from("services")
      .update({ is_active: false })
      .eq("id", id);
    setDeletingId(null);
    if (error) {
      alert(error.message);
      return;
    }
    setServices((prev) =>
      prev.map((s) => (s.id === id ? { ...s, is_active: false } : s))
    );
  }

  const selectClass =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Services</h1>
        <button
          onClick={() => setModal({ mode: "create" })}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          Add Service
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search services..."
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className={selectClass}
        >
          <option value="all">All categories</option>
          {categories
            .filter((c) => c.is_active)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
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
          {filtered.length} services
        </span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {s.name}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {s.categories?.name ?? "-"}
                </td>
                <td className="px-4 py-3 text-slate-900">{inr(s.price)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      s.is_active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {s.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-3">
                    <button
                      onClick={() => setModal({ mode: "edit", service: s })}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Edit
                    </button>
                    {s.is_active && (
                      <button
                        onClick={() => removeService(s.id)}
                        disabled={deletingId === s.id}
                        className="text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        {deletingId === s.id ? "..." : "Deactivate"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No services found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <ServiceFormModal
          state={modal}
          categories={categories}
          onClose={() => setModal(null)}
          onSave={saveService}
        />
      )}
    </div>
  );
}
