"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import ProductFormModal from "./product-form-modal";
import { inr } from "@/lib/format";
import SearchableSelect from "@/components/ui/searchable-select";

export type Product = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  unit: string;
  category_id: string | null;
  sale_price: number | string;
  cost_price: number | string;
  stock_qty: number | string;
  reorder_level: number | string;
  is_active: boolean;
  categories: { name: string } | null;
};

export type CategoryRef = {
  id: string;
  name: string;
  is_active: boolean;
};

type ModalState =
  | { mode: "create" }
  | { mode: "edit"; product: Product }
  | null;

function gradient(name: string) {
  const palettes = [
    "from-blue-500 to-cyan-400",
    "from-violet-500 to-fuchsia-400",
    "from-emerald-500 to-teal-400",
    "from-amber-500 to-orange-400",
    "from-rose-500 to-pink-400",
    "from-indigo-500 to-purple-400",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palettes[h % palettes.length];
}

export default function ProductsClient({
  initialProducts,
  categories,
  embedded = false,
}: {
  initialProducts: Product[];
  categories: CategoryRef[];
  embedded?: boolean;
}) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [modal, setModal] = useState<ModalState>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const supabase = createClient();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products.filter((p) => {
      if (status === "active" && !p.is_active) return false;
      if (status === "inactive" && p.is_active) return false;
      if (cat !== "all" && p.category_id !== cat) return false;
      if (!needle) return true;
      return (
        p.name.toLowerCase().includes(needle) ||
        (p.code ?? "").toLowerCase().includes(needle)
      );
    });
  }, [products, q, cat, status]);

  const stats = useMemo(() => {
    let active = 0;
    let low = 0;
    let stockValue = 0;
    for (const p of products) {
      const qty = Number(p.stock_qty);
      if (qty > 0) stockValue += qty * Number(p.cost_price);
      if (!p.is_active) continue;
      active++;
      if (qty <= Number(p.reorder_level)) low++;
    }
    return { total: products.length, active, low, stockValue };
  }, [products]);

  function nextCode() {
    let max = 0;
    for (const p of products) {
      const n = parseInt(String(p.code ?? "").replace(/\D/g, ""), 10);
      if (!Number.isNaN(n)) max = Math.max(max, n);
    }
    return "PRD-" + String(max + 1).padStart(4, "0");
  }

  async function saveProduct(
    input: {
      name: string;
      code: string;
      description: string;
      unit: string;
      category_id: string | null;
      sale_price: number;
      cost_price: number;
      stock_qty: number;
      reorder_level: number;
    },
    product?: Product
  ) {
    if (product) {
      const { error } = await supabase
        .from("products")
        .update(input)
        .eq("id", product.id);
      if (error) {
        alert(error.message);
        return;
      }
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, ...input } : p))
      );
    } else {
      const { data, error } = await supabase
        .from("products")
        .insert({ ...input, is_active: true })
        .select("*, categories(name)")
        .single();
      if (error) {
        alert(error.message);
        return;
      }
      setProducts((prev) => [data as Product, ...prev]);
    }
    setModal(null);
    logAudit({
      action: product ? "update" : "create",
      entity: "product",
      entity_id: product?.id ?? null,
      description: product ? `Product updated: ${input.name}` : `Product created: ${input.name}`,
      details: { name: input.name },
    });
  }

  async function removeProduct(id: string) {
    setDeletingId(id);
    const { error } = await supabase
      .from("products")
      .update({ is_active: false })
      .eq("id", id);
    setDeletingId(null);
    if (error) {
      alert(error.message);
      return;
    }
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, is_active: false } : p))
    );
  }

  const selectClass =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

  const statCards = [
    {
      label: "Total Products",
      value: String(stats.total),
      icon: "M3 6h18M3 12h18M3 18h18",
      grad: "from-blue-500 to-indigo-600",
    },
    {
      label: "Active",
      value: String(stats.active),
      icon: "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14l-3-3",
      grad: "from-emerald-500 to-teal-600",
    },
    {
      label: "Low Stock",
      value: String(stats.low),
      icon: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
      grad: stats.low > 0 ? "from-rose-500 to-pink-600" : "from-slate-400 to-slate-500",
    },
    {
      label: "Stock Value",
      value: inr(stats.stockValue),
      icon: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
      grad: "from-amber-500 to-orange-600",
    },
  ];

  return (
    <div className={embedded ? "max-w-none" : "mx-auto max-w-6xl px-4 py-8 lg:px-8"}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Products</h1>
          <p className="text-sm text-slate-500">Saleable items with stock tracking.</p>
        </div>
        <button
          onClick={() => setModal({ mode: "create" })}
          className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
        >
          + Add Product
        </button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((c) => (
          <div key={c.label} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${c.grad}`} />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">{c.label}</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{c.value}</p>
              </div>
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${c.grad} text-white shadow-sm`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d={c.icon} />
                </svg>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, code..."
            className="w-full max-w-xs rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <SearchableSelect
          value={cat}
          onChange={setCat}
          options={[
            { value: "all", label: "All categories" },
            ...categories
              .filter((c) => c.is_active)
              .map((c) => ({ value: c.id, label: c.name })),
          ]}
          searchPlaceholder="Search category…"
          className="w-52"
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
        <span className="text-sm text-slate-500">{filtered.length} products</span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Cost</th>
              <th className="px-4 py-3 font-medium">Sale</th>
              <th className="px-4 py-3 font-medium">Margin</th>
              <th className="px-4 py-3 font-medium">Stock</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const cost = Number(p.cost_price);
              const sale = Number(p.sale_price);
              const margin = sale - cost;
              const low = Number(p.stock_qty) <= Number(p.reorder_level);
              return (
                <tr key={p.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${gradient(p.name)} text-xs font-bold text-white`}>
                        {p.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{p.name}</p>
                        <p className="text-xs text-slate-400">{p.code ?? "-"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {p.categories ? (
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {p.categories.name}
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{inr(cost)}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{inr(sale)}</td>
                  <td className="px-4 py-3">
                    <span className={`font-medium ${margin >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {margin >= 0 ? "+" : ""}
                      {inr(margin)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={low ? "font-medium text-red-600" : "text-slate-700"}>
                      {p.stock_qty} {p.unit}
                    </span>
                    {low && (
                      <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                        low
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${p.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {p.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setModal({ mode: "edit", product: p })}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      {p.is_active && (
                        <button
                          onClick={() => removeProduct(p.id)}
                          disabled={deletingId === p.id}
                          className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                        >
                          {deletingId === p.id ? "..." : "Deactivate"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  No products found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <ProductFormModal
          state={modal}
          categories={categories}
          onClose={() => setModal(null)}
          onSave={saveProduct}
        />
      )}
    </div>
  );
}
