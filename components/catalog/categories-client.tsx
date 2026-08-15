"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import CategoryFormModal from "./category-form-modal";

export type Category = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

type ModalState =
  | { mode: "create" }
  | { mode: "edit"; category: Category }
  | null;

export default function CategoriesClient({
  initialCategories,
}: {
  initialCategories: Category[];
}) {
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [modal, setModal] = useState<ModalState>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const supabase = createClient();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return categories.filter((c) => {
      if (status === "active" && !c.is_active) return false;
      if (status === "inactive" && c.is_active) return false;
      if (!needle) return true;
      return c.name.toLowerCase().includes(needle);
    });
  }, [categories, q, status]);

  async function saveCategory(
    input: { name: string; description: string },
    category?: Category
  ) {
    if (category) {
      const { error } = await supabase
        .from("categories")
        .update(input)
        .eq("id", category.id);
      if (error) {
        alert(error.message);
        return;
      }
      setCategories((prev) =>
        prev.map((c) => (c.id === category.id ? { ...c, ...input } : c))
      );
    } else {
      const { data, error } = await supabase
        .from("categories")
        .insert({ ...input, is_active: true })
        .select()
        .single();
      if (error) {
        alert(error.message);
        return;
      }
      setCategories((prev) => [...prev, data as Category]);
    }
    setModal(null);
  }

  async function removeCategory(id: string) {
    setDeletingId(id);
    const { error } = await supabase
      .from("categories")
      .update({ is_active: false })
      .eq("id", id);
    setDeletingId(null);
    if (error) {
      alert(error.message);
      return;
    }
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, is_active: false } : c))
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Categories</h1>
        <button
          onClick={() => setModal({ mode: "create" })}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          Add Category
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search categories..."
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
          {filtered.length} categories
        </span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Description</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {c.name}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {c.description || "-"}
                </td>
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
                      onClick={() => setModal({ mode: "edit", category: c })}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Edit
                    </button>
                    {c.is_active && (
                      <button
                        onClick={() => removeCategory(c.id)}
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
                  colSpan={4}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No categories found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <CategoryFormModal
          state={modal}
          onClose={() => setModal(null)}
          onSave={saveCategory}
        />
      )}
    </div>
  );
}
