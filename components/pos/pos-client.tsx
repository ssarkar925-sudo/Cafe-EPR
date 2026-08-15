"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { useRealtime } from "@/lib/supabase/realtime";

export type PosProduct = {
  id: string;
  code: string | null;
  name: string;
  sale_price: number | string;
  stock_qty: number | string;
  unit: string;
  category_id: string | null;
  categories: { name: string } | null;
};

export type PosService = {
  id: string;
  name: string;
  price: number | string;
  category_id: string | null;
  categories: { name: string } | null;
};

export type PosCustomer = { id: string; name: string; code: string | null };

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

export default function PosClient({
  products,
  services,
  customers,
}: {
  products: PosProduct[];
  services: PosService[];
  customers: PosCustomer[];
}) {
  const supabase = createClient();

  const [productState, setProductState] = useState<PosProduct[]>(products);
  const [tab, setTab] = useState<"products" | "services">("products");

  useRealtime(["products", "invoices", "payments"]);

  useEffect(() => {
    setProductState(products);
  }, [products]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [payments, setPayments] = useState<{ method: string; amount: string }[]>([
    { method: "cash", amount: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SaleResult | null>(null);

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of productState) {
      if (p.category_id && p.categories) map.set(p.category_id, p.categories.name);
    }
    for (const s of services) {
      if (s.category_id && s.categories) map.set(s.category_id, s.categories.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [productState, services]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = tab === "products" ? productState : services;
    return list.filter((x: any) => {
      if (cat !== "all" && x.category_id !== cat) return false;
      if (!needle) return true;
      return x.name.toLowerCase().includes(needle);
    });
  }, [tab, q, cat, productState, services]);

  const total = useMemo(
    () => cart.reduce((sum, l) => sum + l.amount, 0),
    [cart]
  );

  const paid = useMemo(
    () => payments.reduce((s, p) => s + (Number(p.amount) || 0), 0),
    [payments]
  );
  const due = Math.max(0, total - paid);

  useEffect(() => {
    setPayments((prev) => {
      if (prev.length === 1 && (prev[0].amount === "" || Number(prev[0].amount) === 0)) {
        return [{ method: prev[0].method, amount: total > 0 ? String(total) : "" }];
      }
      return prev;
    });
  }, [total]);

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
      p_subtotal: Number(total.toFixed(2)),
      p_discount: 0,
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
    setPayments([{ method: "cash", amount: "" }]);
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";
  const selectClass = inputClass;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
      <h1 className="text-xl font-semibold text-slate-900">Point of Sale</h1>

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg bg-slate-100 p-1 text-sm">
              <button
                onClick={() => setTab("products")}
                className={`rounded-md px-4 py-1 ${
                  tab === "products"
                    ? "bg-white font-medium text-slate-900 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                Products
              </button>
              <button
                onClick={() => setTab("services")}
                className={`rounded-md px-4 py-1 ${
                  tab === "services"
                    ? "bg-white font-medium text-slate-900 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                Services
              </button>
            </div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search..."
              className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
            <select value={cat} onChange={(e) => setCat(e.target.value)} className={selectClass}>
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {filtered.map((x: any) => {
              const isProduct = tab === "products";
              const stock = isProduct ? Number(x.stock_qty) : Infinity;
              const out = stock <= 0;
              return (
                <button
                  key={x.id}
                  onClick={() => addLine(x.id, x.name, Number(isProduct ? x.sale_price : x.price), isProduct)}
                  disabled={out}
                  className={`rounded-xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-blue-400 ${
                    out ? "cursor-not-allowed opacity-50" : ""
                  }`}
                >
                  <p className="text-sm font-medium text-slate-900">{x.name}</p>
                  <p className="mt-1 text-sm text-blue-600">
                    {inr(isProduct ? x.sale_price : x.price)}
                  </p>
                  {isProduct && (
                    <p className={`mt-0.5 text-xs ${out ? "text-red-600" : "text-slate-500"}`}>
                      {out ? "Out of stock" : `${x.stock_qty} ${x.unit}`}
                    </p>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="col-span-full py-10 text-center text-sm text-slate-500">
                Nothing matches your search.
              </p>
            )}
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-6 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-slate-900">Cart</h2>
              {cart.length > 0 && (
                <button
                  onClick={() => setCart([])}
                  className="text-xs text-red-600 hover:text-red-800"
                >
                  Clear
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                Add products or services to start a sale.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {cart.map((l) => (
                  <div key={l.key} className="rounded-lg bg-slate-50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-900">
                        {l.name}
                      </span>
                      <button
                        onClick={() => removeLine(l.key)}
                        className="text-xs text-slate-400 hover:text-red-600"
                      >
                        remove
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={l.qty}
                        onChange={(e) => changeQty(l.key, Number(e.target.value))}
                        className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-blue-500"
                      />
                      <span className="text-xs text-slate-400">x</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={l.rate}
                        onChange={(e) => changeRate(l.key, Number(e.target.value))}
                        className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-blue-500"
                      />
                      <span className="ml-auto text-sm font-medium text-slate-900">
                        {inr(l.amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Customer
              </label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className={selectClass}
              >
                <option value="">Walk-in customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code ?? "-"})
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">
                  Payments
                </label>
                <button
                  onClick={() =>
                    setPayments((prev) => [...prev, { method: "cash", amount: "" }])
                  }
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  + Add payment
                </button>
              </div>
              <div className="space-y-2">
                {payments.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={p.method}
                      onChange={(e) =>
                        setPayments((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, method: e.target.value } : x))
                        )
                      }
                      className="rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-blue-500"
                    >
                      {METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m.toUpperCase()}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={p.amount}
                      onChange={(e) =>
                        setPayments((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x))
                        )
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    />
                    {payments.length > 1 && (
                      <button
                        onClick={() =>
                          setPayments((prev) => prev.filter((_, j) => j !== i))
                        }
                        className="text-xs text-slate-400 hover:text-red-600"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 space-y-1 border-t border-slate-200 pt-4 text-sm">
              <div className="flex justify-between text-slate-700">
                <span>Total</span>
                <span className="font-medium">{inr(total)}</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>Paid</span>
                <span className="font-medium">{inr(paid)}</span>
              </div>
              <div className="flex justify-between text-slate-900">
                <span>Due</span>
                <span className="font-semibold">{inr(due)}</span>
              </div>
            </div>

            {error && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              onClick={completeSale}
              disabled={busy || cart.length === 0}
              className="mt-4 w-full rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? "Completing sale..." : "Complete Sale"}
            </button>
          </div>
        </div>
      </div>

      {success && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-xl">
            <h2 className="text-lg font-semibold text-emerald-600">Sale Complete</h2>
            <p className="mt-3 text-3xl font-bold text-slate-900">
              {success.invoice_number}
            </p>
            <div className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between text-slate-700">
                <span>Total</span>
                <span className="font-medium">{inr(success.total)}</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>Paid</span>
                <span className="font-medium">{inr(success.paid)}</span>
              </div>
              <div className="flex justify-between text-slate-900">
                <span>Due</span>
                <span className="font-semibold">{inr(success.due)}</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>Status</span>
                <span className="font-medium uppercase">{success.status}</span>
              </div>
            </div>
            <button
              onClick={() => setSuccess(null)}
              className="mt-5 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              New Sale
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
