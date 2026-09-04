"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/lib/supabase/realtime";
import ServiceFormModal from "./service-form-modal";
import { inr } from "@/lib/format";
import SearchableSelect from "@/components/ui/searchable-select";
import type { CategoryRef } from "./products-client";
import {
  Layers,
  Search,
  Plus,
  ArrowRight,
  TrendingUp,
  DollarSign,
  CheckCircle2,
  XCircle,
  Percent,
} from "lucide-react";

export type Service = {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  sale_price: number | string;
  cost_price: number | string;
  is_active: boolean;
  categories: { name: string } | null;
};

type ModalState = { mode: "create" } | { mode: "edit"; service: Service } | null;

function gradient(name: string) {
  const p = [
    "from-violet-500 to-indigo-600",
    "from-blue-500 to-cyan-500",
    "from-emerald-500 to-teal-600",
    "from-amber-500 to-orange-600",
    "from-rose-500 to-pink-600",
    "from-purple-500 to-fuchsia-600",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return p[h % p.length];
}

export default function ServicesClient({
  initialServices,
  categories,
  embedded = false,
}: {
  initialServices: Service[];
  categories: CategoryRef[];
  embedded?: boolean;
}) {
  useRealtime(["services", "categories"]);
  const [services, setServices] = useState<Service[]>(initialServices);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [modal, setModal] = useState<ModalState>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const supabase = createClient();

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return services.filter(
      (s) =>
        (status === "all" || (status === "active" ? s.is_active : !s.is_active)) &&
        (cat === "all" || s.category_id === cat) &&
        (!n || s.name.toLowerCase().includes(n) || (s.description ?? "").toLowerCase().includes(n))
    );
  }, [services, q, cat, status]);

  const stats = useMemo(() => {
    const a = services.filter((s) => s.is_active);
    const sale = a.reduce((x, s) => x + Number(s.sale_price), 0);
    const cost = a.reduce((x, s) => x + Number(s.cost_price), 0);
    return {
      total: services.length,
      active: a.length,
      avg: a.length ? sale / a.length : 0,
      margin: sale - cost,
    };
  }, [services]);

  async function saveService(
    input: {
      name: string;
      description: string;
      category_id: string | null;
      sale_price: number;
      cost_price: number;
    },
    service?: Service
  ) {
    if (service) {
      const { error } = await supabase.from("services").update(input).eq("id", service.id);
      if (error) return alert(error.message);
      setServices((p) => p.map((s) => (s.id === service.id ? { ...s, ...input } : s)));
    } else {
      const { data, error } = await supabase
        .from("services")
        .insert({ ...input, is_active: true })
        .select("*, categories(name)")
        .single();
      if (error) return alert(error.message);
      setServices((p) => [data as Service, ...p]);
    }
    setModal(null);
  }

  async function setServiceActive(id: string, active: boolean) {
    setDeletingId(id);
    const { error } = await supabase.from("services").update({ is_active: active }).eq("id", id);
    setDeletingId(null);
    if (error) return alert(error.message);
    setServices((p) => p.map((s) => (s.id === id ? { ...s, is_active: active } : s)));
  }

  const statCards = [
    { label: "Total Services", value: String(stats.total), icon: Layers, grad: "from-violet-500 to-indigo-600", glow: "card-glow-indigo", valColor: "text-indigo-700 dark:text-indigo-300" },
    { label: "Active Services", value: String(stats.active), icon: CheckCircle2, grad: "from-emerald-500 to-teal-600", glow: "card-glow-emerald", valColor: "text-emerald-700 dark:text-emerald-300" },
    { label: "Avg Sale Price", value: inr(stats.avg), icon: DollarSign, grad: "from-amber-500 to-orange-600", glow: "card-glow-amber", valColor: "text-amber-700 dark:text-amber-300" },
    { label: "Gross Margin", value: inr(stats.margin), icon: TrendingUp, grad: stats.margin >= 0 ? "from-cyan-500 to-blue-600" : "from-rose-500 to-pink-600", glow: stats.margin >= 0 ? "card-glow-cyan" : "card-glow-rose", valColor: stats.margin >= 0 ? "text-cyan-700 dark:text-cyan-300" : "text-rose-700 dark:text-rose-300" },
  ];

  return (
    <div className={`${embedded ? "max-w-none" : "mx-auto max-w-6xl px-4 py-8 lg:px-8"}`}>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-black uppercase tracking-[0.18em] text-violet-600 dark:text-violet-400">
            Catalog Master
          </p>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Services Catalog</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Billable service charges, printing, scanning, typing, internet sessions, and rates.
          </p>
        </div>
        <button
          onClick={() => setModal({ mode: "create" })}
          className="btn-3d-tactile-primary flex items-center gap-1.5 px-4 py-2.5 text-xs font-black shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Add Service
        </button>
      </div>

      {/* KPI Cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.label}
              className={`bento-surface relative overflow-hidden rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5 ${c.glow}`}
            >
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${c.grad}`} />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{c.label}</p>
                  <p className={`mt-1.5 font-mono text-2xl font-black ${c.valColor}`}>{c.value}</p>
                </div>
                <div className={`icon-box-3d flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${c.grad} text-white shadow-sm`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Search & Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search services..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs font-semibold outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100 dark:border-white/10 dark:bg-slate-900 dark:text-white"
          />
        </div>

        <div className="w-52">
          <SearchableSelect
            value={cat}
            onChange={setCat}
            options={[
              { value: "all", label: "All Categories" },
              ...categories.filter((c) => c.is_active).map((c) => ({ value: c.id, label: c.name })),
            ]}
            searchPlaceholder="Search category…"
          />
        </div>

        <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold dark:bg-white/5">
          {(["all", "active", "inactive"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-lg px-3 py-1.5 transition ${
                status === s
                  ? "bg-white font-black text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <span className="text-xs font-bold text-slate-400">{filtered.length} services</span>
      </div>

      {/* Services Table */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50/75 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-bold uppercase tracking-wider">Service Name</th>
                <th className="px-4 py-3 font-bold uppercase tracking-wider">Category</th>
                <th className="px-4 py-3 text-right font-bold uppercase tracking-wider">Cost Price</th>
                <th className="px-4 py-3 text-right font-bold uppercase tracking-wider">Sale Price</th>
                <th className="px-4 py-3 text-right font-bold uppercase tracking-wider">Gross Margin</th>
                <th className="px-4 py-3 text-center font-bold uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-right font-bold uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filtered.map((s) => {
                const cost = Number(s.cost_price);
                const sale = Number(s.sale_price);
                const margin = sale - cost;
                return (
                  <tr key={s.id} className="hover:bg-slate-50/75 dark:hover:bg-white/5 transition">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient(
                            s.name
                          )} text-xs font-black text-white`}
                        >
                          {s.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-black text-slate-900 dark:text-white">{s.name}</p>
                          {s.description && (
                            <p className="max-w-xs truncate text-[11px] text-slate-400">{s.description}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      {s.categories ? (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                          {s.categories.name}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right font-medium text-slate-500 dark:text-slate-400">
                      {inr(cost)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-black text-slate-900 dark:text-white">
                      {inr(sale)}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span
                        className={`font-black ${
                          margin >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {margin >= 0 ? "+" : ""}
                        {inr(margin)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          s.is_active
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400"
                        }`}
                      >
                        {s.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setModal({ mode: "edit", service: s })}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setServiceActive(s.id, !s.is_active)}
                          disabled={deletingId === s.id}
                          className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
                            s.is_active
                              ? "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                          }`}
                        >
                          {deletingId === s.id ? "..." : s.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="mx-auto max-w-sm">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-white/5">
                        <Layers className="h-6 w-6" />
                      </div>
                      <p className="font-bold text-slate-800 dark:text-white">No services found</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Try changing your filters or add your first billable service.
                      </p>
                      <button
                        onClick={() => setModal({ mode: "create" })}
                        className="mt-4 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-violet-700"
                      >
                        + Add Service
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
