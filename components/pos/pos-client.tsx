"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { useRealtime } from "@/lib/supabase/realtime";

export type PosProduct = {
  id: string;
  code: string | null;
  name: string;
  sale_price: number | string;
  stock_qty: number | string;
  reorder_level: number | string;
  unit: string;
  category_id: string | null;
  categories: { name: string } | null;
};

export type PosService = {
  id: string;
  name: string;
  sale_price: number | string;
  category_id: string | null;
  categories: { name: string } | null;
};

export type PosCustomer = {
  id: string;
  name: string;
  code: string | null;
  phone: string | null;
  balance: number | string;
};

type CartLine = {
  key: string;
  product_id: string | null;
  service_id: string | null;
  name: string;
  qty: number;
  rate: number;
  amount: number;
};

type SaleResult = {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  total: number;
  paid: number;
  due: number;
  status: string;
  invoice_date: string;
};

const METHODS = ["cash", "upi", "card"] as const;
const METHOD_STYLE: Record<string, string> = {
  cash: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  upi: "bg-blue-50 text-blue-700 ring-blue-200",
  card: "bg-violet-50 text-violet-700 ring-violet-200",
};

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

export default function PosClient({
  products,
  services,
  customers,
  salesTodayCount,
  salesTodayAmount,
  initialCustomerId = "",
}: {
  products: PosProduct[];
  services: PosService[];
  customers: PosCustomer[];
  salesTodayCount: number;
  salesTodayAmount: number;
  initialCustomerId?: string;
}) {
  const supabase = createClient();

  const [productState, setProductState] = useState<PosProduct[]>(products);
  const [tab, setTab] = useState<"products" | "services">("products");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [discount, setDiscount] = useState("");
  const [payments, setPayments] = useState<{ method: string; amount: string }[]>([
    { method: "cash", amount: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SaleResult | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useRealtime(["products", "invoices", "payments", "customers", "invoice_items"]);

  useEffect(() => {
    setProductState(products);
  }, [products]);

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of productState) {
      if (p.category_id && p.categories) map.set(p.category_id, (map.get(p.category_id) ?? 0) + 1);
    }
    for (const s of services) {
      if (s.category_id && s.categories) map.set(s.category_id, (map.get(s.category_id) ?? 0) + 1);
    }
    const names = new Map<string, string>();
    for (const p of productState) if (p.categories) names.set(p.category_id!, p.categories.name);
    for (const s of services) if (s.categories) names.set(s.category_id!, s.categories.name);
    return Array.from(map.entries()).map(([id, count]) => ({ id, name: names.get(id) ?? "?", count }));
  }, [productState, services]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = tab === "products" ? productState : services;
    return list.filter((x: any) => {
      if (cat !== "all" && x.category_id !== cat) return false;
      if (!needle) return true;
      return (
        x.name.toLowerCase().includes(needle) ||
        (x.code ? String(x.code).toLowerCase().includes(needle) : false)
      );
    });
  }, [tab, q, cat, productState, services]);

  const subtotal = useMemo(() => cart.reduce((sum, l) => sum + l.amount, 0), [cart]);
  const discountNum = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const total = subtotal - discountNum;
  const itemCount = useMemo(() => cart.reduce((s, l) => s + l.qty, 0), [cart]);

  const paid = useMemo(() => payments.reduce((s, p) => s + (Number(p.amount) || 0), 0), [payments]);
  const due = Math.max(0, total - paid);

  useEffect(() => {
    setPayments((prev) => {
      if (prev.length === 1 && (prev[0].amount === "" || Number(prev[0].amount) === 0)) {
        return [{ method: prev[0].method, amount: total > 0 ? String(total) : "" }];
      }
      return prev;
    });
  }, [total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const selectedCustomer = customers.find((c) => c.id === customerId);

  function stockOf(productId: string) {
    const p = productState.find((x) => x.id === productId);
    return p ? Number(p.stock_qty) : 0;
  }

  function addLine(id: string, name: string, rate: number, isProduct: boolean) {
    setError(null);
    const existing = cart.find(
      (l) => l.product_id === (isProduct ? id : null) && l.service_id === (!isProduct ? id : null)
    );
    if (existing) {
      const nextQty = existing.qty + 1;
      if (isProduct && nextQty > stockOf(id)) {
        setError(`Only ${stockOf(id)} in stock for ${name}`);
        return;
      }
      setCart((prev) =>
        prev.map((l) =>
          l.key === existing.key
            ? { ...l, qty: nextQty, amount: Number((nextQty * l.rate).toFixed(2)) }
            : l
        )
      );
    } else {
      if (isProduct && stockOf(id) <= 0) {
        setError(`${name} is out of stock`);
        return;
      }
      setCart((prev) => [
        ...prev,
        {
          key: `${isProduct ? "p" : "s"}-${id}`,
          product_id: isProduct ? id : null,
          service_id: isProduct ? null : id,
          name,
          qty: 1,
          rate,
          amount: rate,
        },
      ]);
    }
  }

  function changeQty(key: string, qty: number) {
    setCart((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const nextQty = Math.max(0, qty);
        if (l.product_id && nextQty > stockOf(l.product_id)) return l;
        return { ...l, qty: nextQty, amount: Number((nextQty * l.rate).toFixed(2)) };
      })
    );
  }

  function changeRate(key: string, rate: number) {
    setCart((prev) =>
      prev.map((l) =>
        l.key === key
          ? { ...l, rate: Math.max(0, rate), amount: Number((l.qty * Math.max(0, rate)).toFixed(2)) }
          : l
      )
    );
  }

  function removeLine(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key));
  }

  function setPaymentMethod(i: number, method: string) {
    setPayments((prev) => prev.map((x, j) => (j === i ? { ...x, method } : x)));
  }

  function setPaymentAmount(i: number, amount: string) {
    setPayments((prev) => prev.map((x, j) => (j === i ? { ...x, amount } : x)));
  }

  function addPaymentRow() {
    setPayments((prev) => {
      const remaining = Math.max(0, total - prev.reduce((s, p) => s + (Number(p.amount) || 0), 0));
      return [...prev, { method: "upi", amount: remaining > 0 ? String(remaining.toFixed(2)) : "" }];
    });
  }

  function fillExact() {
    setPayments((prev) => {
      const next = [...prev];
      next[0] = { method: next[0].method, amount: String(total.toFixed(2)) };
      return [next[0]];
    });
  }

  async function completeSale() {
    setError(null);
    if (cart.length === 0) {
      setError("Cart is empty");
      return;
    }
    if (paid <= 0) {
      setError("Enter a payment amount");
      return;
    }
    if (paid > total) {
      setError("Paid amount exceeds total");
      return;
    }

    setBusy(true);
    const items = cart.map((l) => ({
      product_id: l.product_id,
      service_id: l.service_id,
      description: l.name,
      qty: l.qty,
      rate: l.rate,
      amount: l.amount,
    }));
    const pmts = payments
      .filter((p) => Number(p.amount) > 0)
      .map((p) => ({ method: p.method, amount: Number(p.amount) }));
    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase.rpc("create_sale", {
      p_customer_id: customerId || null,
      p_invoice_date: today,
      p_subtotal: Number(subtotal.toFixed(2)),
      p_discount: discountNum,
      p_total: Number(total.toFixed(2)),
      p_payments: pmts,
      p_items: items,
    });

    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }

    const decrement: Record<string, number> = {};
    for (const l of cart) {
      if (l.product_id) decrement[l.product_id] = (decrement[l.product_id] ?? 0) + l.qty;
    }
    setProductState((prev) =>
      prev.map((p) =>
        decrement[p.id]
          ? { ...p, stock_qty: Math.max(0, Number(p.stock_qty) - decrement[p.id]) }
          : p
      )
    );

    setSuccess(data as SaleResult);
    setCart([]);
    setCustomerId("");
    setDiscount("");
    setPayments([{ method: "cash", amount: "" }]);
  }

  const inputClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Point of Sale</h1>
          <p className="text-sm text-slate-500">
            {salesTodayCount} sale{salesTodayCount === 1 ? "" : "s"} today · {inr(salesTodayAmount)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
            {itemCount} item{itemCount === 1 ? "" : "s"} in cart
          </span>
          <span className="rounded-lg bg-blue-100 px-3 py-1.5 text-xs font-medium text-blue-700">
            Cart {inr(total)}
          </span>
          <Link href="/invoices" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            Today's Sales
          </Link>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-xl bg-slate-100 p-1 text-sm">
              {(["products", "services"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-lg px-4 py-1.5 font-medium capitalize transition ${
                    tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="relative min-w-[200px] flex-1">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name or code…  (Ctrl+K)"
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setCat("all")}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                cat === "all"
                  ? "bg-[#0f172a] text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCat(cat === c.id ? "all" : c.id)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                  cat === c.id
                    ? "bg-[#0f172a] text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {c.name} <span className="opacity-60">· {c.count}</span>
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {filtered.map((x: any) => {
              const isProduct = tab === "products";
              const stock = isProduct ? Number(x.stock_qty) : Infinity;
              const reorder = isProduct ? Number(x.reorder_level) : 0;
              const out = stock <= 0;
              const low = !out && stock <= reorder;
              const price = Number(isProduct ? x.sale_price : x.sale_price);
              return (
                <button
                  key={x.id}
                  onClick={() => addLine(x.id, x.name, price, isProduct)}
                  disabled={out}
                  className={`group relative flex flex-col rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-blue-400 ${
                    out ? "cursor-not-allowed opacity-60" : ""
                  }`}
                >
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${gradient(x.name)} text-sm font-bold text-white shadow-sm`}>
                    {x.name.slice(0, 1).toUpperCase()}
                  </div>
                  <p className="mt-2.5 line-clamp-2 text-sm font-medium leading-snug text-slate-900">{x.name}</p>
                  <div className="mt-1.5 flex items-end justify-between gap-1">
                    <p className="text-sm font-bold text-blue-600">{inr(price)}</p>
                    {isProduct && (
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                          out
                            ? "bg-rose-100 text-rose-700"
                            : low
                              ? "bg-amber-100 text-amber-700"
                              : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {out ? "OUT" : `${x.stock_qty} ${x.unit || "pc"}`}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="col-span-full py-14 text-center text-sm text-slate-500">
                Nothing matches your search. Try a different name or category.
              </p>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <div className="sticky top-6 flex max-h-[calc(100vh-4rem)] flex-col rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="font-semibold text-slate-900">Current Order</h2>
                <p className="text-xs text-slate-400">{itemCount} items · {inr(total)}</p>
              </div>
              {cart.length > 0 && (
                <button
                  onClick={() => setCart([])}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {cart.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
                      <path d="M6 2h12a1 1 0 0 1 1 1v18l-2.5-1.5L14 21l-2.5-1.5L9 21l-2.5-1.5L5 21V3a1 1 0 0 1 1-1Z" />
                    </svg>
                  </div>
                  <p className="text-sm text-slate-500">Your cart is empty</p>
                  <p className="text-xs text-slate-400">Tap products or services to add them</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {cart.map((l) => (
                    <div key={l.key} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-slate-900">{l.name}</p>
                        <button
                          onClick={() => removeLine(l.key)}
                          className="text-xs text-slate-400 transition hover:text-rose-600"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="mt-2.5 flex items-center gap-2">
                        <div className="flex items-center rounded-lg bg-white ring-1 ring-slate-200">
                          <button
                            onClick={() => changeQty(l.key, l.qty - 1)}
                            className="px-2 py-1 text-sm text-slate-500 transition hover:text-slate-900"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={l.qty}
                            onChange={(e) => changeQty(l.key, Number(e.target.value))}
                            className="w-12 border-x border-slate-200 bg-transparent py-1 text-center text-sm outline-none"
                          />
                          <button
                            onClick={() => changeQty(l.key, l.qty + 1)}
                            className="px-2 py-1 text-sm text-slate-500 transition hover:text-slate-900"
                          >
                            +
                          </button>
                        </div>
                        <span className="text-xs text-slate-400">x</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={l.rate}
                          onChange={(e) => changeRate(l.key, Number(e.target.value))}
                          className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-sm outline-none focus:border-blue-500"
                        />
                        <span className="ml-auto text-sm font-semibold text-slate-900">{inr(l.amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4">
                <label className="mb-1 block text-xs font-semibold text-slate-500">Customer</label>
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={inputClass}>
                  <option value="">Walk-in customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {Number(c.balance) !== 0 ? `(due ${inr(Math.abs(Number(c.balance)))})` : ""}
                    </option>
                  ))}
                </select>
                {selectedCustomer && Number(selectedCustomer.balance) > 0 && (
                  <p className="mt-1 text-xs text-rose-600">
                    This customer owes {inr(Number(selectedCustomer.balance))} on previous invoices.
                  </p>
                )}
              </div>

              <div className="mt-3">
                <label className="mb-1 block text-xs font-semibold text-slate-500">Discount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="0.00"
                  className={inputClass}
                />
              </div>

              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-500">Payments</label>
                  {payments.length < 3 && (
                    <button onClick={addPaymentRow} className="text-xs font-medium text-blue-600 hover:text-blue-800">
                      + Split payment
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {payments.map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex rounded-lg bg-slate-100 p-0.5">
                        {METHODS.map((m) => (
                          <button
                            key={m}
                            onClick={() => setPaymentMethod(i, m)}
                            className={`rounded-md px-2 py-1 text-xs font-medium capitalize transition ${
                              p.method === m
                                ? "bg-white text-slate-900 shadow-sm"
                                : "text-slate-500"
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={p.amount}
                        onChange={(e) => setPaymentAmount(i, e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500"
                      />
                      {payments.length > 1 && (
                        <button
                          onClick={() => setPayments((prev) => prev.filter((_, j) => j !== i))}
                          className="text-xs text-slate-400 hover:text-rose-600"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={fillExact}
                  className="mt-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Exact amount ({inr(total)})
                </button>
              </div>
            </div>

            <div className="border-t border-slate-100 px-5 py-4">
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span>{inr(subtotal)}</span>
                </div>
                {discountNum > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Discount</span>
                    <span>− {inr(discountNum)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                  <span className="font-semibold text-slate-900">Total</span>
                  <span className="text-xl font-bold text-slate-900">{inr(total)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Paid</span>
                  <span>{inr(paid)}</span>
                </div>
                <div className={`flex justify-between ${due > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                  <span className="font-medium">Due</span>
                  <span className="font-semibold">{inr(due)}</span>
                </div>
              </div>

              {error && (
                <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
              )}

              <button
                onClick={completeSale}
                disabled={busy || cart.length === 0}
                className="mt-4 w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-3 text-sm font-semibold text-white shadow-md transition hover:from-blue-700 hover:to-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Completing sale…" : `Complete Sale · ${inr(total)}`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {success && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <svg viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h2 className="mt-3 text-lg font-bold text-slate-900">Sale Complete</h2>
            <p className="mt-1 font-mono text-2xl font-bold tracking-tight text-blue-600">{success.invoice_number}</p>
            <div className="mt-4 space-y-1.5 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Total</span>
                <span className="font-medium text-slate-900">{inr(success.total)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Paid</span>
                <span className="font-medium text-slate-900">{inr(success.paid)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Due</span>
                <span className={`font-semibold ${success.due > 0 ? "text-amber-600" : "text-emerald-600"}`}>{inr(success.due)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Status</span>
                <span className={`font-semibold capitalize ${success.status === "paid" ? "text-emerald-600" : "text-amber-600"}`}>{success.status}</span>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-2">
              <a
                href={`/receipt/${success.id}`}
                target="_blank"
                className="rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                Print Receipt (80mm)
              </a>
              <a
                href={`/receipt/${success.id}/a4`}
                target="_blank"
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                A4 Print / Download PDF
              </a>
              <button
                onClick={() => setSuccess(null)}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                New Sale
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
