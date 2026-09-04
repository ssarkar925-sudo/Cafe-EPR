"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import CategoryFormModal from "./category-form-modal";
import {
  FolderTree,
  Search,
  Plus,
  CheckCircle2,
  Boxes,
  Layers,
  Edit,
  Power,
} from "lucide-react";

export type Category = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

type ModalState = { mode: "create" } | { mode: "edit"; category: Category } | null;

function gradient(name: string) {
  const p = [
    "from-amber-500 to-orange-600",
    "from-blue-500 to-indigo-600",
    "from-emerald-500 to-teal-600",
    "from-violet-500 to-purple-600",
    "from-rose-500 to-pink-600",
    "from-cyan-500 to-blue-600",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return p[h % p.length];
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
  const [categories, setCategories] = useState(initialCategories);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [modal, setModal] = useState<ModalState>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const supabase = createClient();

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return categories.filter(
      (c) =>
        (status === "all" || (status === "active" ? c.is_active : !c.is_active)) &&
        (!n || c.name.toLowerCase().includes(n) || String(c.description ?? "").toLowerCase().includes(n))
    );
  }, [categories, q, status]);

  const stats = useMemo(
    () => ({
      total: categories.length,
      active: categories.filter((c) => c.is_active).length,
      items: Object.values(counts).reduce((a, b) => a + b, 0),
    }),
    [categories, counts]
  );

  async function save(input: { name: string; description: string }, category?: Category) {
    if (category) {
      const { error } = await supabase.from("categories").update(input).eq("id", category.id);
      if (error) return alert(error.message);
      setCategories((p) => p.map((c) => (c.id === category.id ? { ...c, ...input } : c)));
    } else {
      const { data, error } = await supabase
        .from("categories")
        .insert({ ...input, is_active: true })
        .select()
        .single();
      if (error) return alert(error.message);
      setCategories((p) => [...p, data as Category]);
    }
    setModal(null);
  }

  async function toggleActive(category: Category) {
    setBusy(category.id);
    const newStatus = !category.is_active;
    const { error } = await supabase.from("categories").update({ is_active: newStatus }).eq("id", category.id);
    setBusy(null);
    if (error) return alert(error.message);
    setCategories((p) => p.map((c) => (c.id === category.id ? { ...c, is_active: newStatus } : c)));
  }

  const statCards = [
    { label: "Total Categories", value: String(stats.total), icon: FolderTree },
    { label: "Active Groups", value: String(stats.active), icon: CheckCircle2 },
    { label: "Assigned Catalog Items", value: String(stats.items), icon: Boxes },
  ];

  return (
    <div className={`${embedded ? "max-w-none" : "mx-auto max-w-6xl px-4 py-8 lg:px-8"}`}>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-amber-600 dark:text-amber-400">
            Catalog Master
          </p>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Categories</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Organize products and services into clear groups for inventory tracking and POS search.
          </p>
        </div>
        <button
          onClick={() => setModal({ mode: "create" })}
          className="btn-3d-tactile-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold text-white shadow-md transition hover:brightness-110 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Add Category
        </button>
      </div>

      {/* KPI Cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        {statCards.map((c, idx) => {
          const Icon = c.icon;
          const glowClass = idx === 0 ? "card-glow-amber" : idx === 1 ? "card-glow-emerald" : "card-glow-indigo";
          const iconBg =
            idx === 0
              ? "bg-gradient-to-br from-amber-500 to-amber-600 shadow-amber-500/25"
              : idx === 1
              ? "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/25"
              : "bg-gradient-to-br from-indigo-500 to-violet-600 shadow-indigo-500/25";

          return (
            <div
              key={c.label}
              className={`${glowClass} relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{c.label}</p>
                  <p className="mt-1 text-2xl font-black font-mono text-slate-900 dark:text-white">{c.value}</p>
                </div>
                <div className={`icon-box-3d flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-md ${iconBg}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search categories..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs font-semibold outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-white"
          />
        </div>

        <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold dark:bg-white/5">
          {(["all", "active", "inactive"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-lg px-3 py-1.5 transition active:scale-95 ${
                status === s
                  ? "bg-white font-black text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <span className="text-xs font-bold font-mono text-slate-400">{filtered.length} categories</span>
      </div>

      {/* Grid of Categories */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((c) => {
          const count = counts[c.id] ?? 0;
          return (
            <div
              key={c.id}
              className={`card-glow-indigo group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md hover:border-amber-400/80 dark:border-white/10 dark:bg-slate-900 dark:hover:border-amber-500/40 ${
                !c.is_active ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`icon-box-3d flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient(
                    c.name
                  )} text-xs font-black text-white shadow-md`}
                >
                  {c.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-black text-slate-900 dark:text-white">{c.name}</p>
                  <p className="truncate text-xs text-slate-400">{c.description || "No description"}</p>
                  <span className="mt-2 inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                    {count} item{count === 1 ? "" : "s"}
                  </span>
                </div>
                <span
                  className={`inline-flex items-center gap-1 shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                    c.is_active
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/40"
                      : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400"
                  }`}
                >
                  {c.is_active && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                  {c.is_active ? "Active" : "Inactive"}
                </span>
              </div>

              <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3 dark:border-white/5">
                <button
                  onClick={() => setModal({ mode: "edit", category: c })}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 active:scale-95 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                >
                  Edit
                </button>
                <button
                  onClick={() => toggleActive(c)}
                  disabled={busy === c.id}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition active:scale-95 disabled:opacity-50 ${
                    c.is_active
                      ? "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300"
                  }`}
                >
                  {busy === c.id ? "..." : c.is_active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-200 py-14 text-center dark:border-white/10">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-white/5">
              <FolderTree className="h-6 w-6" />
            </div>
            <p className="font-bold text-slate-800 dark:text-white">No categories found</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Try a different search or add a new category.
            </p>
            <button
              onClick={() => setModal({ mode: "create" })}
              className="btn-3d-tactile-primary mt-4 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-xs hover:brightness-110 active:scale-95 transition"
            >
              <Plus className="h-4 w-4" />
              Add Category
            </button>
          </div>
        )}
      </div>

      {modal && <CategoryFormModal state={modal} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
}
