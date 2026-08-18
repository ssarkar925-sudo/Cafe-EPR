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

export default function CategoriesClient({
  initialCategories,
  counts = {},
  embedded = false,
}: {
  initialCategories: Category[];
  counts?: Record<string, number>;
  embedded?: boolean;
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

  const stats = useMemo(
    () => ({
      total: categories.length,
      active: categories.filter((c) => c.is_active).length,
      items: Object.values(counts).reduce((a, b) => a + b, 0),
    }),
    [categories, counts]
  );

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

  const statCards = [
    {
      label: "Total Categories",
      value: String(stats.total),
      icon: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z",
      grad: "from-blue-500 to-indigo-600",
    },
    {
      label: "Active",
      value: String(stats.active),
      icon: "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14l-3-3",
      grad: "from-emerald-500 to-teal-600",
    },
    {
      label: "Items",
      value: String(stats.items),
      icon: "M20 6 9 17l-5-5",
      grad: "from-amber-500 to-orange-600",
    },
  ];

  return (
    <div className={embedded ? "max-w-none" : "mx-auto max-w-6xl px-4 py-8 lg:px-8"}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Categories</h1>
          <p className="text-sm text-slate-500">Group products and services.</p>
        </div>
        <button
          onClick={() => setModal({ mode: "create" })}
          className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
        >
          + Add Category
        </button>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-4">
        {statCards.map((c) => (
          <div key={c.label} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${c.grad}`} />
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-slate-500 sm:text-xs">{c.label}</p>
                <p className="mt-1 text-lg font-bold text-slate-900 sm:text-xl">{c.value}</p>
              </div>
              <div className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${c.grad} text-white shadow-sm sm:flex`}>
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
            placeholder="Search categories..."
            className="w-full max-w-xs rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
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
        <span className="text-sm text-slate-500">{filtered.length} categories</span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((c) => {
          const count = counts[c.id] ?? 0;
          return (
            <div
              key={c.id}
              className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md ${!c.is_active ? "opacity-60" : ""}`}
            >
              <div className="flex items-start gap-3">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient(c.name)} text-white shadow-sm`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{c.name}</p>
                  <p className="truncate text-xs text-slate-400">{c.description || "-"}</p>
                  <span className="mt-1.5 inline-block rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                    {count} item{count === 1 ? "" : "s"}
                  </span>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    c.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {c.is_active ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                <button
                  onClick={() => setModal({ mode: "edit", category: c })}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Edit
                </button>
                {c.is_active && (
                  <button
                    onClick={() => removeCategory(c.id)}
                    disabled={deletingId === c.id}
                    className="rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                  >
                    {deletingId === c.id ? "..." : "Deactivate"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-200 py-14 text-center text-sm text-slate-400">
            No categories found. Add the first one.
          </div>
        )}
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
