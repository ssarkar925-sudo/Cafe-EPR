import { useEffect, useMemo, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { inr } from "@/lib/format";

// ── Shared visual building blocks for the POS / Quick Sale screens ──────────
// These presentational components mirror the Point of Sale design language so
// both modes stay visually identical. Business logic stays in the callers.

export type BrowserItem = {
  id: string;
  name: string;
  code?: string | null;
  sale_price: number | string;
  stock_qty?: number | string;
  reorder_level?: number | string;
  unit?: string;
  category_id?: string | null;
  categories?: { name: string } | null;
};

export type PosCustomer = {
  id: string;
  name: string;
  code?: string | null;
  phone?: string | null;
  balance?: number | string;
};

export function gradient(name: string) {
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

export const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

// Payment method quick buttons used by the QUICK PAYMENT block in POS + Quick Sale.
export const METHOD_BTN: Record<string, { label: string; active: string; idle: string }> = {
  cash: {
    label: "Cash",
    active: "bg-emerald-600 text-white ring-emerald-600",
    idle: "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100",
  },
  upi: {
    label: "UPI",
    active: "bg-cyan-600 text-white ring-cyan-600",
    idle: "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
  },
  card: {
    label: "Card",
    active: "bg-blue-600 text-white ring-blue-600",
    idle: "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
  },
  bank: {
    label: "Bank",
    active: "bg-indigo-600 text-white ring-indigo-600",
    idle: "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
  },
  wallet: {
    label: "Wallet",
    active: "bg-amber-600 text-white ring-amber-600",
    idle: "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
  },
  debit_card: {
    label: "Debit",
    active: "bg-violet-600 text-white ring-violet-600",
    idle: "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
  },
  credit_card: {
    label: "Credit",
    active: "bg-rose-600 text-white ring-rose-600",
    idle: "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
  },
};

export type Category = { id: string; name: string; count: number };

// ── Category sidebar (left column) ──────────────────────────────────────────
export function PosCategorySidebar({
  categories,
  totalCount,
  active,
  onSelect,
  onAddCustom,
}: {
  categories: Category[];
  totalCount: number;
  active: string;
  onSelect: (id: string) => void;
  onAddCustom: () => void;
}) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-6 flex max-h-[calc(100vh-4rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Categories</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <button
            onClick={() => onSelect("all")}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
              active === "all" ? "bg-[#0f172a] font-medium text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span>All items</span>
            <span className={`text-xs ${active === "all" ? "text-slate-300" : "text-slate-400"}`}>{totalCount}</span>
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                active === c.id ? "bg-[#0f172a] font-medium text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span className="truncate">{c.name}</span>
              <span className={`text-xs ${active === c.id ? "text-slate-300" : "text-slate-400"}`}>{c.count}</span>
            </button>
          ))}
        </div>
        <div className="border-t border-slate-100 p-2">
          <button
            onClick={onAddCustom}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-blue-300 bg-blue-50 px-3 py-2.5 text-sm font-medium text-blue-700 transition hover:bg-blue-100"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-4 w-4">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add Custom Item
          </button>
        </div>
      </div>
    </aside>
  );
}

// ── Toolbar (tabs + search + sort + grid/list) ──────────────────────────────
export function PosItemToolbar({
  tabs,
  activeTab,
  onTab,
  searchRef,
  placeholder,
  q,
  onQ,
  sort,
  onSort,
  view,
  onView,
}: {
  tabs: { value: string; label: string }[];
  activeTab: string;
  onTab: (t: string) => void;
  searchRef?: RefObject<HTMLInputElement | null>;
  placeholder: string;
  q: string;
  onQ: (v: string) => void;
  sort: string;
  onSort: (v: string) => void;
  view: "grid" | "list";
  onView: (v: "grid" | "list") => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="flex rounded-xl bg-slate-100 p-1 text-sm">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => onTab(t.value)}
            className={`rounded-lg px-4 py-1.5 font-medium capitalize transition ${
              activeTab === t.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="relative min-w-[180px] flex-1">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={searchRef}
          value={q}
          onChange={(e) => onQ(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>
      <select
        value={sort}
        onChange={(e) => onSort(e.target.value)}
        className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-600 outline-none focus:border-blue-500"
        title="Sort"
      >
        <option value="name">Name A–Z</option>
        <option value="low">Price low → high</option>
        <option value="high">Price high → low</option>
        <option value="stock">Stock</option>
      </select>
      <div className="flex rounded-xl bg-slate-100 p-1 text-sm">
        <button
          onClick={() => onView("grid")}
          title="Grid view"
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
            view === "grid" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </button>
        <button
          onClick={() => onView("list")}
          title="List view"
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
            view === "list" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Mobile/extra category chips row ─────────────────────────────────────────
export function PosCategoryChips({
  categories,
  totalCount,
  active,
  onSelect,
  customBtn,
  extraChips,
}: {
  categories: Category[];
  totalCount: number;
  active: string;
  onSelect: (id: string) => void;
  customBtn?: ReactNode;
  extraChips?: ReactNode;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {customBtn}
      {extraChips}
      <button
        onClick={() => onSelect("all")}
        className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
          active === "all" ? "bg-[#0f172a] text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
        }`}
      >
        All <span className="opacity-60">· {totalCount}</span>
      </button>
      {categories.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
            active === c.id ? "bg-[#0f172a] text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
          }`}
        >
          {c.name} <span className="opacity-60">· {c.count}</span>
        </button>
      ))}
    </div>
  );
}

// ── Grid view (POS product/service cards) ───────────────────────────────────
export function PosGrid({
  items,
  isProduct,
  onAdd,
  emptyText = "Nothing matches your search. Try a different name or category.",
}: {
  items: BrowserItem[];
  isProduct: boolean;
  onAdd: (id: string, name: string, price: number, isProduct: boolean) => void;
  emptyText?: string;
}) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {items.map((x) => {
        const stock = isProduct ? Number(x.stock_qty) : Infinity;
        const reorder = isProduct ? Number(x.reorder_level) : 0;
        const out = stock <= 0;
        const low = !out && stock <= reorder;
        const price = Number(x.sale_price);
        return (
          <button
            key={x.id}
            onClick={() => onAdd(x.id, x.name, price, isProduct)}
            disabled={out}
            className={`group relative flex flex-col rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-blue-400 ${
              out ? "cursor-not-allowed opacity-60" : ""
            }`}
          >
            <div className="flex items-start justify-between">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${gradient(x.name)} text-sm font-bold text-white shadow-sm`}>
                {x.name.slice(0, 1).toUpperCase()}
              </div>
              {isProduct && (
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                    out ? "bg-rose-100 text-rose-700" : low ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {out ? "OUT" : `${x.stock_qty} ${x.unit || "pc"}`}
                </span>
              )}
            </div>
            <p className="mt-2.5 line-clamp-2 text-sm font-medium leading-snug text-slate-900">{x.name}</p>
            <div className="mt-1.5 flex items-center justify-between gap-1">
              <p className="text-sm font-bold text-blue-600">{inr(price)}</p>
              <span className="rounded-md bg-slate-900/5 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 opacity-0 transition group-hover:opacity-100">
                + Add
              </span>
            </div>
          </button>
        );
      })}
      {items.length === 0 && (
        <p className="col-span-full py-14 text-center text-sm text-slate-500">{emptyText}</p>
      )}
    </div>
  );
}

// ── List view (POS table) ───────────────────────────────────────────────────
export function PosTable({
  items,
  isProduct,
  onAdd,
  emptyText = "Nothing matches your search. Try a different name or category.",
}: {
  items: BrowserItem[];
  isProduct: boolean;
  onAdd: (id: string, name: string, price: number, isProduct: boolean) => void;
  emptyText?: string;
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="py-2.5 pl-4 pr-4 font-medium">Name</th>
            {isProduct && <th className="py-2.5 pr-4 font-medium">Code</th>}
            <th className="py-2.5 pr-4 font-medium">Category</th>
            <th className="py-2.5 pr-4 font-medium">Price</th>
            {isProduct && <th className="py-2.5 pr-4 font-medium">Stock</th>}
            <th className="py-2.5 pr-4 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((x) => {
            const stock = isProduct ? Number(x.stock_qty) : Infinity;
            const reorder = isProduct ? Number(x.reorder_level) : 0;
            const out = isProduct && stock <= 0;
            const price = Number(x.sale_price);
            return (
              <tr key={x.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2.5 pl-4 pr-4">
                  <div className="flex items-center gap-2.5">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${gradient(x.name)} text-xs font-bold text-white`}>
                      {x.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="font-medium text-slate-900">{x.name}</span>
                  </div>
                </td>
                {isProduct && <td className="py-2.5 pr-4 font-mono text-xs text-slate-500">{x.code ?? "-"}</td>}
                <td className="py-2.5 pr-4 text-slate-600">{x.categories?.name ?? "-"}</td>
                <td className="py-2.5 pr-4 font-medium text-blue-600">{inr(price)}</td>
                {isProduct && (
                  <td className="py-2.5 pr-4">
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                      out ? "bg-rose-100 text-rose-700" : stock <= reorder ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                    }`}>
                      {out ? "OUT" : `${x.stock_qty} ${x.unit || "pc"}`}
                    </span>
                  </td>
                )}
                <td className="py-2.5 pr-4 text-right">
                  <button
                    onClick={() => onAdd(x.id, x.name, price, isProduct)}
                    disabled={out}
                    className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Add
                  </button>
                </td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan={isProduct ? 6 : 4} className="py-12 text-center text-sm text-slate-500">
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Customer selector (searchable dropdown) ─────────────────────────────────
export function CustomerSelector({
  customers,
  value,
  onChange,
  onAddCustomer,
  searchRef,
}: {
  customers: PosCustomer[];
  value: string;
  onChange: (id: string) => void;
  onAddCustomer: () => void;
  searchRef?: RefObject<HTMLInputElement | null>;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const selected = customers.find((c) => c.id === value);

  useEffect(() => {
    if (!value) setQ("");
  }, [value]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return customers.filter((c) => {
      if (!needle) return true;
      return (
        c.name.toLowerCase().includes(needle) ||
        (c.phone ?? "").includes(needle) ||
        (c.code ?? "").toLowerCase().includes(needle)
      );
    });
  }, [customers, q]);

  return (
    <div className="relative">
      <input
        ref={searchRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={selected ? selected.name : "Search or select customer…"}
        className={inputClass}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange("");
            setQ("");
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-rose-600"
          title="Clear to walk-in"
        >
          &#10005;
        </button>
      )}
      {open && (
        <>
          <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setQ("");
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-slate-50 ${
                !value ? "bg-blue-50" : ""
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0 text-slate-400">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span className="flex-1 text-slate-700">Walk-in customer</span>
              {!value && <span className="text-xs text-blue-600">&#10003;</span>}
            </button>
            {filtered.map((c) => {
              const b = Number(c.balance ?? 0);
              const active = c.id === value;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onChange(c.id);
                    setQ("");
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-slate-50 ${
                    active ? "bg-blue-50" : ""
                  }`}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-[10px] font-bold text-white">
                    {c.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-900">{c.name}</span>
                    <span className="block truncate text-xs text-slate-400">
                      {c.code ?? ""}
                      {c.phone ? " · " + c.phone : ""}
                      {b !== 0 ? ` · ${b > 0 ? "due " : "adv "}${inr(Math.abs(b))}` : ""}
                    </span>
                  </span>
                  {active && <span className="text-xs text-blue-600">&#10003;</span>}
                </button>
              );
            })}
            <button
              type="button"
              onClick={onAddCustomer}
              className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-sm font-medium text-blue-600 transition hover:bg-blue-50"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-3.5 w-3.5">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
              Add new customer
            </button>
          </div>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
        </>
      )}
    </div>
  );
}