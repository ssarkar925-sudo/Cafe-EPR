"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ProductFormModal from "./product-form-modal";
import { inr } from "@/lib/format";

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

export default function ProductsClient({
  initialProducts,
  categories,
}: {
  initialProducts: Product[];
  categories: CategoryRef[];
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Products</h1>
        <button
          onClick={() => setModal({ mode: "create" })}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          Add Product
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, code..."
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={selectClass}>
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
          {filtered.length} products
        </span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Stock</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const low = Number(p.stock_qty) <= Number(p.reorder_level);
              return (
                <tr key={p.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 text-slate-500">{p.code ?? "-"}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {p.name}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {p.categories?.name ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-900">
                    {inr(p.sale_price)}
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
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        p.is_active
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {p.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <button
                        onClick={() => setModal({ mode: "edit", product: p })}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </button>
                      {p.is_active && (
                        <button
                          onClick={() => removeProduct(p.id)}
                          disabled={deletingId === p.id}
                          className="text-red-600 hover:text-red-800 disabled:opacity-50"
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
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-slate-500"
                >
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
