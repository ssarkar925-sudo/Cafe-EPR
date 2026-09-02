"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { inr } from "@/lib/format";
import { 
  Search, 
  X, 
  LayoutGrid, 
  List, 
  Sparkles, 
  Plus, 
  User, 
  Phone, 
  AlertCircle, 
  CheckCircle2, 
  Layers, 
  ArrowUpDown,
  Tag,
  PackageCheck,
  ShoppingBag
} from "lucide-react";

export type BrowserItem = {
  id: string;
  item_type?: "service" | "product";
  name: string;
  code?: string | null;
  sale_price: number | string;
  stock_qty?: number | string;
  reorder_level?: number | string;
  unit?: string;
  category_id?: string | null;
  categories?: { name: string } | null;
  is_quick_favorite?: boolean;
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
    "from-blue-600 to-cyan-500",
    "from-violet-600 to-fuchsia-500",
    "from-emerald-600 to-teal-500",
    "from-amber-500 to-orange-500",
    "from-rose-600 to-pink-500",
    "from-indigo-600 to-purple-500",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palettes[h % palettes.length];
}

export const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-xs outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-900/30";

export const METHOD_BTN: Record<string, { label: string; active: string; idle: string }> = {
  cash: {
    label: "Cash",
    active: "bg-emerald-600 text-white ring-2 ring-emerald-500 shadow-sm",
    idle: "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:border-emerald-900/40 dark:text-emerald-300",
  },
  upi: {
    label: "UPI QR",
    active: "bg-cyan-600 text-white ring-2 ring-cyan-500 shadow-sm",
    idle: "bg-cyan-50 text-cyan-800 border border-cyan-200 hover:bg-cyan-100 dark:bg-cyan-950/40 dark:border-cyan-900/40 dark:text-cyan-300",
  },
  card: {
    label: "Card",
    active: "bg-blue-600 text-white ring-2 ring-blue-500 shadow-sm",
    idle: "bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100 dark:bg-blue-950/40 dark:border-blue-900/40 dark:text-blue-300",
  },
  bank: {
    label: "Bank",
    active: "bg-indigo-600 text-white ring-2 ring-indigo-500 shadow-sm",
    idle: "bg-indigo-50 text-indigo-800 border border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:border-indigo-900/40 dark:text-indigo-300",
  },
  wallet: {
    label: "Wallet",
    active: "bg-amber-600 text-white ring-2 ring-amber-500 shadow-sm",
    idle: "bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 dark:bg-amber-950/40 dark:border-amber-900/40 dark:text-amber-300",
  },
  debit_card: {
    label: "Debit",
    active: "bg-violet-600 text-white ring-2 ring-violet-500 shadow-sm",
    idle: "bg-violet-50 text-violet-800 border border-violet-200 hover:bg-violet-100 dark:bg-violet-950/40 dark:border-violet-900/40 dark:text-violet-300",
  },
  credit_card: {
    label: "Credit",
    active: "bg-rose-600 text-white ring-2 ring-rose-500 shadow-sm",
    idle: "bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100 dark:bg-rose-950/40 dark:border-rose-900/40 dark:text-rose-300",
  },
};

export type Category = { id: string; name: string; count: number };

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
    <div className="hidden lg:block">
      <div className="sticky top-20 flex max-h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-[22px] border border-slate-200/90 bg-white shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-4 py-3 dark:border-white/5">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            Catalog Categories
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => onSelect("all")}
            className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition ${
              active === "all"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
            }`}
          >
            <span>All Items</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] ${
                active === "all" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500 dark:bg-white/10"
              }`}
            >
              {totalCount}
            </span>
          </button>
          {categories.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition ${
                active === c.id
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
              }`}
            >
              <span className="truncate">{c.name}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] ${
                  active === c.id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500 dark:bg-white/10"
                }`}
              >
                {c.count}
              </span>
            </button>
          ))}
        </div>
        <div className="border-t border-slate-100 p-2.5 dark:border-white/5">
          <button
            type="button"
            onClick={onAddCustom}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-blue-300 bg-blue-50/60 py-2 text-xs font-extrabold text-blue-700 transition hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
          >
            <span>+ Custom Item</span>
          </button>
        </div>
      </div>
    </div>
  );
}

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
      {/* Category Tabs */}
      <div className="flex rounded-xl border border-slate-200/90 bg-slate-100/90 p-1 dark:border-white/10 dark:bg-slate-800/80">
        {tabs.map((t) => (
          <button
            type="button"
            key={t.value}
            onClick={() => onTab(t.value)}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
              activeTab === t.value
                ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white"
                : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search Input */}
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={searchRef}
          value={q}
          onChange={(e) => onQ(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-slate-200/90 bg-white py-2 pl-10 pr-8 text-xs font-semibold text-slate-900 shadow-xs outline-none transition placeholder:text-slate-400 focus:border-blue-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
        />
        {q && (
          <button
            type="button"
            onClick={() => onQ("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Sort Selector */}
      <div className="relative flex items-center">
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value)}
          aria-label="Sort catalog items"
          className="appearance-none rounded-xl border border-slate-200/90 bg-white pl-3 pr-8 py-2 text-xs font-bold text-slate-700 shadow-xs outline-none focus:border-blue-500 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
        >
          <option value="name">Name A–Z</option>
          <option value="low">Price: Low → High</option>
          <option value="high">Price: High → Low</option>
          <option value="stock">Stock Level</option>
        </select>
        <ArrowUpDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-slate-400" />
      </div>

      {/* View Mode Toggle */}
      <div className="flex rounded-xl border border-slate-200/90 bg-slate-100/90 p-1 dark:border-white/10 dark:bg-slate-800/80">
        <button
          type="button"
          onClick={() => onView("grid")}
          title="Grid view"
          className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${
            view === "grid"
              ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white"
              : "text-slate-500 hover:text-slate-900 dark:text-slate-400"
          }`}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onView("list")}
          title="List view"
          className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${
            view === "list"
              ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white"
              : "text-slate-500 hover:text-slate-900 dark:text-slate-400"
          }`}
        >
          <List className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

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
    <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {customBtn}
      {extraChips}
      <button
        type="button"
        onClick={() => onSelect("all")}
        className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
          active === "all"
            ? "bg-blue-600 text-white shadow-sm"
            : "border border-slate-200/90 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
        }`}
      >
        All <span className="opacity-70">({totalCount})</span>
      </button>
      {categories.map((c) => (
        <button
          type="button"
          key={c.id}
          onClick={() => onSelect(c.id)}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
            active === c.id
              ? "bg-blue-600 text-white shadow-sm"
              : "border border-slate-200/90 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
          }`}
        >
          {c.name} <span className="opacity-70">({c.count})</span>
        </button>
      ))}
    </div>
  );
}

export function PosGrid({
  items,
  isProduct,
  onAdd,
  emptyText = "No items match your search.",
}: {
  items: BrowserItem[];
  isProduct?: boolean;
  onAdd: (id: string, name: string, price: number, isProduct: boolean) => void;
  emptyText?: string;
}) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {items.map((x) => {
        const isProd = x.item_type ? x.item_type === "product" : Boolean(isProduct || x.stock_qty !== undefined);
        const stock = isProd ? Number(x.stock_qty ?? 0) : Infinity;
        const reorder = isProd ? Number(x.reorder_level ?? 0) : 0;
        const out = isProd && stock <= 0;
        const low = isProd && !out && stock <= reorder;
        const price = Number(x.sale_price);

        return (
          <button
            type="button"
            key={`${isProd ? "p" : "s"}-${x.id}`}
            onClick={() => onAdd(x.id, x.name, price, isProd)}
            disabled={out}
            className={`pos-touch-tile-3d group p-4 text-left ${
              out ? "cursor-not-allowed opacity-50" : ""
            }`}
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div
                  className={`icon-box-3d h-11 w-11 shrink-0 bg-gradient-to-br ${gradient(
                    x.name
                  )} text-base font-black text-white shadow-sm`}
                >
                  {x.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                      isProd
                        ? "bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200/50"
                        : "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300 border border-cyan-200/50"
                    }`}
                  >
                    {isProd ? "PRODUCT" : "SERVICE"}
                  </span>
                  {isProd ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                        out
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                          : low
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                      }`}
                    >
                      {out ? "OUT OF STOCK" : low ? `Low (${stock})` : `Stock ${stock}`}
                    </span>
                  ) : (
                    <span className="max-w-[85px] truncate text-[10px] font-bold text-slate-400">
                      {x.categories?.name ?? "Service"}
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-3 line-clamp-2 text-xs font-black leading-snug text-slate-900 dark:text-white">
                {x.name}
              </p>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-slate-100/80 pt-3 dark:border-white/5">
              <p className="text-sm font-black text-blue-600 dark:text-blue-400">
                {inr(price)}
              </p>
              <span
                className={`rounded-xl px-3 py-1 text-[11px] font-black transition ${
                  out
                    ? "bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-400"
                    : "btn-3d-tactile-primary group-hover:scale-105"
                }`}
              >
                {out ? "Out" : "+ Add"}
              </span>
            </div>
          </button>
        );
      })}

      {items.length === 0 && (
        <div className="col-span-full rounded-2xl border border-dashed border-slate-300 p-12 text-center text-xs text-slate-400">
          {emptyText}
        </div>
      )}
    </div>
  );
}

export function PosTable({
  items,
  isProduct,
  onAdd,
  emptyText = "No items match your search.",
}: {
  items: BrowserItem[];
  isProduct?: boolean;
  onAdd: (id: string, name: string, price: number, isProduct: boolean) => void;
  emptyText?: string;
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-[20px] border border-slate-200/90 bg-white dark:border-white/10 dark:bg-slate-900">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-black uppercase text-slate-400 dark:border-white/5 dark:bg-white/[0.02]">
          <tr>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Name &amp; Code</th>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3">Price</th>
            <th className="px-4 py-3">Stock Status</th>
            <th className="px-4 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
          {items.map((x) => {
            const isProd = x.item_type ? x.item_type === "product" : Boolean(isProduct || x.stock_qty !== undefined);
            const stock = isProd ? Number(x.stock_qty ?? 0) : Infinity;
            const reorder = isProd ? Number(x.reorder_level ?? 0) : 0;
            const out = isProd && stock <= 0;
            const price = Number(x.sale_price);

            return (
              <tr key={`${isProd ? "p" : "s"}-${x.id}`} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                      isProd
                        ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                        : "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300"
                    }`}
                  >
                    {isProd ? "PROD" : "SERV"}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient(
                        x.name
                      )} text-xs font-black text-white`}
                    >
                      {x.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <span className="block truncate font-extrabold text-slate-900 dark:text-white">
                        {x.name}
                      </span>
                      {x.code && <span className="font-mono text-[10px] text-slate-400">{x.code}</span>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400">
                  {x.categories?.name ?? "—"}
                </td>
                <td className="px-4 py-2.5 font-black text-blue-600 dark:text-blue-400">
                  {inr(price)}
                </td>
                <td className="px-4 py-2.5">
                  {isProd ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        out
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                          : stock <= reorder
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      }`}
                    >
                      {out ? "OUT OF STOCK" : `${x.stock_qty} in stock`}
                    </span>
                  ) : (
                    <span className="text-slate-400">Digital / Service</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => onAdd(x.id, x.name, price, isProd)}
                    disabled={out}
                    className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-extrabold text-white transition hover:bg-blue-600 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-blue-600 dark:hover:text-white"
                  >
                    {out ? "Out" : "+ Add"}
                  </button>
                </td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan={6} className="py-12 text-center text-xs text-slate-400">
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

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
    if (!needle) return [];
    return customers.filter((c) => {
      return (
        c.name.toLowerCase().includes(needle) ||
        (c.phone && c.phone.includes(needle)) ||
        (c.code && c.code.toLowerCase().includes(needle))
      );
    });
  }, [customers, q]);

  return (
    <div className="relative">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
          Customer Account
        </label>
        <button
          type="button"
          onClick={onAddCustomer}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline dark:text-blue-400"
        >
          <Plus className="h-3 w-3" />
          <span>New Customer</span>
        </button>
      </div>

      {selected ? (
        <div className="mt-1.5 flex items-center justify-between rounded-xl border border-blue-200/90 bg-blue-50/70 p-2.5 dark:border-blue-900/40 dark:bg-blue-950/30">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white font-black text-xs">
              {selected.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-xs font-bold text-slate-900 dark:text-white">
                  {selected.name}
                </span>
                {selected.phone && (
                  <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                    {selected.phone}
                  </span>
                )}
              </div>
              {Number(selected.balance) > 0 ? (
                <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                  Khata Due: {inr(Number(selected.balance))}
                </span>
              ) : Number(selected.balance) < 0 ? (
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  Advance: {inr(Math.abs(Number(selected.balance)))}
                </span>
              ) : (
                <span className="text-[10px] font-bold text-slate-400">
                  Account Settled
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange("")}
            className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
            title="Change customer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="relative mt-1.5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchRef}
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search customer name, phone, or code…"
            className="w-full rounded-xl border border-slate-200/90 bg-white py-2 pl-8 pr-8 text-xs font-semibold text-slate-900 shadow-xs outline-none transition focus:border-blue-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-slate-400 hover:text-slate-700"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          {open && filtered.length > 0 && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
              <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-slate-800">
                {filtered.slice(0, 8).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onChange(c.id);
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-blue-50 dark:hover:bg-white/5"
                  >
                    <div>
                      <span className="block font-bold text-slate-900 dark:text-white">{c.name}</span>
                      {c.phone && <span className="block text-[10px] text-slate-400">{c.phone}</span>}
                    </div>
                    {Number(c.balance) > 0 ? (
                      <span className="text-[10px] font-bold text-rose-600">
                        Due {inr(Number(c.balance))}
                      </span>
                    ) : Number(c.balance) < 0 ? (
                      <span className="text-[10px] font-bold text-emerald-600">
                        Adv {inr(Math.abs(Number(c.balance)))}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
