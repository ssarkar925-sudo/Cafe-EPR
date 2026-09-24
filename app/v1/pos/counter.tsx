"use client";

/**
 * POS counter island — Phase 6 Step 1 (client draft UI only).
 *
 * Covers the Phase-5 UI states reachable without checkout: idle,
 * scanning, cart-ready, customer-selected (see
 * docs/architecture/v1-pos-state-component-spec.md §2; later states such
 * as payment-entry / submitting / server-confirmed arrive with later
 * steps — no separate state architecture is invented here).
 *
 * Data arrives as a server-rendered snapshot (props); this island performs
 * zero reads and zero mutations. The cart is an ephemeral client-side
 * draft: leaving the counter discards it, nothing is reserved, and every
 * figure is labeled an estimate. create_sale, payments, discounts,
 * approvals, offline queue, and thermal printing are NOT implemented.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { V1SaleLine } from "@/lib/v1/v1-contracts";
import { getEnrolledDevice, type V1LocalDevice } from "@/lib/v1/v1-device";
import PosCheckout from "./checkout";

export interface PosProduct {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: string;
  sale_price: number;
  /** Display-only availability (remaining − active held over sellable lots). */
  available: number;
  band: string;
  bandLabel: string;
  earliestExpiry: string | null;
}

export interface PosCustomer {
  id: string;
  name: string;
  phone: string | null;
  credit_limit: number | null;
}

export interface PosInstrument {
  id: string;
  name: string;
  itype: string;
}

function newSubmissionKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

type ScanStatus =
  | { kind: "idle" }
  | { kind: "empty" }
  | { kind: "added"; name: string; qty: number }
  | { kind: "capped"; name: string; available: number }
  | { kind: "unavailable"; name: string }
  | { kind: "not-found"; code: string };

function inr(n: number): string {
  return `₹${n.toFixed(2)}`;
}

export default function PosCounter({
  products,
  customers,
  instruments,
  businessName,
  snapshotAt,
  operator,
  tenantId,
}: {
  products: PosProduct[];
  customers: PosCustomer[];
  instruments: PosInstrument[];
  businessName: string;
  snapshotAt: string;
  operator: { displayName: string; role: string; profileId: string };
  tenantId: string;
}) {
  const [barcode, setBarcode] = useState("");
  const [scanStatus, setScanStatus] = useState<ScanStatus>({ kind: "idle" });
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<V1SaleLine[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [device, setDevice] = useState<V1LocalDevice | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [saleKey, setSaleKey] = useState("");
  const keyHashRef = useRef("");
  const barcodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDevice(getEnrolledDevice());
    barcodeRef.current?.focus();
  }, []);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.barcode ?? "").toLowerCase().includes(q) ||
          (p.sku ?? "").toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [products, search]);

  const matches = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    const pool = customers;
    if (!q) return pool.slice(0, 20);
    return pool
      .filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q))
      .slice(0, 20);
  }, [customers, customerQuery]);

  const customer = customerId ? (customers.find((c) => c.id === customerId) ?? null) : null;

  const subtotal = cart.reduce((sum, l) => sum + l.qty * l.rate, 0);

  // Phase-5 UI state, derived (Step 1 covers idle → customer-selected).
  const posState = cart.length === 0 ? (barcode ? "scanning" : "idle") : customer ? "customer-selected" : "cart-ready";

  function focusBarcode() {
    barcodeRef.current?.focus();
  }

  function addProduct(product: PosProduct): void {
    if (product.available <= 0) {
      setScanStatus({ kind: "unavailable", name: product.name });
      focusBarcode();
      return;
    }
    const current = cart.find((l) => l.product_id === product.id)?.qty ?? 0;
    if (current >= product.available) {
      setScanStatus({ kind: "capped", name: product.name, available: product.available });
      focusBarcode();
      return;
    }
    const nextQty = Math.min(current + 1, product.available);
    setCart((prev) => {
      const line = prev.find((l) => l.product_id === product.id);
      if (!line) return [...prev, { product_id: product.id, qty: 1, rate: product.sale_price }];
      return prev.map((l) =>
        l.product_id === product.id ? { ...l, qty: Math.min(line.qty + 1, product.available) } : l,
      );
    });
    setScanStatus(
      nextQty >= product.available
        ? { kind: "capped", name: product.name, available: product.available }
        : { kind: "added", name: product.name, qty: nextQty },
    );
    focusBarcode();
  }

  function submitBarcode(event: React.FormEvent): void {
    event.preventDefault();
    const code = barcode.trim();
    if (!code) {
      setScanStatus({ kind: "empty" });
      focusBarcode();
      return;
    }
    const product = products.find((p) => (p.barcode ?? "") === code) ?? null;
    setBarcode("");
    if (!product) {
      setScanStatus({ kind: "not-found", code });
      focusBarcode();
      return;
    }
    addProduct(product);
  }

  function setQty(productId: string, qty: number): void {
    const product = byId.get(productId);
    if (!product) return;
    const clamped = Math.min(Math.max(1, Math.floor(qty) || 1), Math.max(1, product.available));
    setCart((prev) => prev.map((l) => (l.product_id === productId ? { ...l, qty: clamped } : l)));
  }

  function removeLine(productId: string): void {
    setCart((prev) => prev.filter((l) => l.product_id !== productId));
    setSelectedLineId((sel) => (sel === productId ? null : sel));
  }

  function clearCart(): void {
    setCart([]);
    setSelectedLineId(null);
    setScanStatus({ kind: "idle" });
    focusBarcode();
  }

  // Changing the customer never touches cart lines: independent state.
  function selectCustomer(id: string | null): void {
    setCustomerId(id);
  }

  // One idempotency identity per logical submission: created on checkout
  // open, regenerated only when the cart changes (a new submission).
  // Retries of the same submission always reuse the stored key, so the
  // server replays instead of duplicating.
  function openCheckout(): void {
    if (cart.length === 0 || checkoutOpen) return;
    const hash = JSON.stringify(cart.map((l) => [l.product_id, l.qty, l.rate]));
    if (!saleKey || keyHashRef.current !== hash) {
      setSaleKey(newSubmissionKey());
      keyHashRef.current = hash;
    }
    setCheckoutOpen(true);
  }

  function completeSale(): void {
    setCart([]);
    setSelectedLineId(null);
    setScanStatus({ kind: "idle" });
    setCheckoutOpen(false);
    focusBarcode();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* Cart controls lock while checkout is open: the submission owns one
          idempotency identity bound to these exact lines. */}
      <fieldset disabled={checkoutOpen} className="min-w-0 space-y-4 border-0 p-0">
      {/* A. Header */}
      <header className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-extrabold tracking-tight">POS counter</h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {operator.displayName} · <span className="font-mono">{operator.role}</span> ·{" "}
            {device && device.serverDeviceId ? (
              <span>
                Device enrolled · epoch {device.deviceEpoch ?? "?"} · watermark {device.lastWatermark ?? "?"}
              </span>
            ) : (
              <span>Device not enrolled on this browser</span>
            )}
          </p>
        </div>
        <span
          aria-label={`Counter state: ${posState}`}
          className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-bold dark:bg-white/10"
        >
          {posState}
        </span>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Customer: <span className="font-bold text-slate-700 dark:text-slate-200">{customer ? customer.name : "Walk-in"}</span>
        </div>
        <button
          type="button"
          onClick={clearCart}
          disabled={cart.length === 0}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
        >
          Clear cart
        </button>
      </header>

      <p className="rounded-xl border border-slate-200 bg-white/60 px-4 py-2 text-xs text-slate-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-400">
        Catalog snapshot {snapshotAt.slice(0, 19).replace("T", " ")} UTC · availability is a display estimate only.
        All totals are estimates — the server sets final values at sale time (later step).
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          {/* B. Barcode / search */}
          <section
            aria-label="Barcode and product search"
            className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"
          >
            <form onSubmit={submitBarcode}>
              <label htmlFor="pos-barcode" className="text-sm font-extrabold tracking-tight">
                Scan barcode
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  ref={barcodeRef}
                  id="pos-barcode"
                  type="text"
                  autoFocus
                  autoComplete="off"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setBarcode("");
                  }}
                  placeholder="Scanner wedge input — Enter submits, Esc clears"
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm dark:border-white/10 dark:bg-white/[0.02]"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800"
                >
                  Add
                </button>
              </div>
            </form>

            <div className="mt-3">
              <label htmlFor="pos-search" className="text-sm font-extrabold tracking-tight">
                Search products
              </label>
              <input
                id="pos-search"
                type="text"
                autoComplete="off"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type name, barcode, or SKU"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.02]"
              />
            </div>

            <div aria-live="polite" className="mt-2 min-h-6 text-sm">
              {scanStatus.kind === "added" && (
                <p role="status" className="font-semibold text-teal-700 dark:text-teal-300">
                  Added {scanStatus.name} × {scanStatus.qty}.
                </p>
              )}
              {scanStatus.kind === "empty" && (
                <p role="status" className="text-slate-500 dark:text-slate-400">
                  Empty scan ignored — scan or type a barcode, then press Enter.
                </p>
              )}
              {scanStatus.kind === "capped" && (
                <p role="status" className="font-semibold text-amber-700 dark:text-amber-300">
                  Only {scanStatus.available} × {scanStatus.name} available — quantity capped.
                </p>
              )}
              {scanStatus.kind === "unavailable" && (
                <p role="alert" className="font-semibold text-rose-600 dark:text-rose-400">
                  {scanStatus.name} is out of stock — not added to the cart.
                </p>
              )}
              {scanStatus.kind === "not-found" && (
                <p role="alert" className="font-semibold text-rose-600 dark:text-rose-400">
                  Product not found for barcode “{scanStatus.code}” — cart unchanged.
                </p>
              )}
            </div>
          </section>

          {/* C. Product results */}
          <section
            aria-label="Product results"
            className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"
          >
            <h2 className="text-sm font-extrabold tracking-tight">Products</h2>
            {products.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                No active products in the catalog snapshot. Add products under Masters first.
              </p>
            ) : search.trim() === "" ? (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {products.length} active products loaded. Scan a barcode or search above.
              </p>
            ) : results.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                No products match “{search.trim()}”.
              </p>
            ) : (
              <>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {results.length} match{results.length === 1 ? "" : "es"}.
                </p>
                <ul className="mt-2 divide-y divide-slate-100 dark:divide-white/5">
                  {results.map((p) => {
                    const inCart = cart.find((l) => l.product_id === p.id)?.qty ?? 0;
                    const atCap = inCart >= p.available;
                    return (
                      <li key={p.id} className="flex items-center gap-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{p.name}</p>
                          <p className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {p.barcode ?? "no barcode"} · {p.unit} · {inr(p.sale_price)}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {p.available > 0 ? (
                              <span>
                                {p.available} available · {p.bandLabel}
                                {p.earliestExpiry ? ` · earliest expiry ${p.earliestExpiry}` : ""}
                              </span>
                            ) : (
                              <span className="font-bold text-rose-600 dark:text-rose-400">Out of stock</span>
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={p.available <= 0 || atCap}
                          onClick={() => addProduct(p)}
                          title={p.available <= 0 ? "Out of stock" : atCap ? `Only ${p.available} available` : `Add ${p.name}`}
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Add
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>

          {/* E. Customer */}
          <section
            aria-label="Customer selection"
            className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"
          >
            <h2 className="text-sm font-extrabold tracking-tight">Customer</h2>
            {customer ? (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{customer.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {customer.phone ?? "no phone"}
                    {customer.credit_limit !== null ? ` · limit ${inr(customer.credit_limit)} (info only)` : ""}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                    Credit limits are enforced server-side at sale time. Changing the customer does not alter cart lines.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => selectCustomer(null)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                >
                  Back to Walk-in
                </button>
              </div>
            ) : (
              <>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Walk-in (no customer). Search and select a khata customer optionally.
                </p>
                <input
                  id="pos-customer-search"
                  type="text"
                  autoComplete="off"
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                  placeholder="Search name or phone"
                  aria-label="Search customers"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.02]"
                />
                {customers.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    No active customers in the snapshot. Walk-in sales only.
                  </p>
                ) : matches.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    No customers match “{customerQuery.trim()}”.
                  </p>
                ) : (
                  <ul className="mt-2 max-h-48 divide-y divide-slate-100 overflow-y-auto dark:divide-white/5">
                    {matches.map((c) => (
                      <li key={c.id} className="flex items-center gap-3 py-1.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{c.name}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">{c.phone ?? "no phone"}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => selectCustomer(c.id)}
                          className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                        >
                          Select
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        </div>

        {/* D. Cart */}
        <div className="lg:col-span-2">
          <section
            aria-label="Cart"
            className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03] lg:sticky lg:top-4"
          >
            <h2 className="text-sm font-extrabold tracking-tight">Cart</h2>
            {cart.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Empty cart. Scan a barcode or add a product to begin.
              </p>
            ) : (
              <>
                <ul
                  aria-label="Cart lines"
                  onKeyDown={(e) => {
                    if ((e.key === "Delete" || e.key === "Del") && selectedLineId) removeLine(selectedLineId);
                  }}
                  className="mt-2 divide-y divide-slate-100 dark:divide-white/5"
                >
                  {cart.map((line) => {
                    const product = byId.get(line.product_id);
                    if (!product) return null;
                    return (
                      <li key={line.product_id}>
                        <button
                          type="button"
                          onClick={() => setSelectedLineId(line.product_id)}
                          aria-pressed={selectedLineId === line.product_id}
                          className={`block w-full rounded-xl px-2 py-2 text-left transition ${
                            selectedLineId === line.product_id
                              ? "bg-slate-100 ring-1 ring-slate-300 dark:bg-white/10 dark:ring-white/20"
                              : "hover:bg-slate-50 dark:hover:bg-white/5"
                          }`}
                        >
                          <span className="block truncate text-sm font-bold">{product.name}</span>
                          <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                            {inr(line.rate)} each · line {inr(line.qty * line.rate)} (estimate)
                          </span>
                        </button>
                        <div className="flex items-center gap-2 px-2 pb-2">
                          <button
                            type="button"
                            aria-label={`Decrease quantity of ${product.name}`}
                            onClick={() => setQty(line.product_id, line.qty - 1)}
                            disabled={line.qty <= 1}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={Math.max(1, product.available)}
                            value={line.qty}
                            aria-label={`Quantity of ${product.name}`}
                            onChange={(e) => setQty(line.product_id, Number(e.target.value))}
                            className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center font-mono text-sm dark:border-white/10 dark:bg-white/[0.02]"
                          />
                          <button
                            type="button"
                            aria-label={`Increase quantity of ${product.name}`}
                            onClick={() => setQty(line.product_id, line.qty + 1)}
                            disabled={line.qty >= product.available}
                            title={line.qty >= product.available ? `Only ${product.available} available` : "Increase quantity"}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10"
                          >
                            +
                          </button>
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">max {product.available}</span>
                          <button
                            type="button"
                            onClick={() => removeLine(line.product_id)}
                            aria-label={`Remove ${product.name} from cart`}
                            className="ml-auto rounded-lg px-2 py-1 text-xs font-bold text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <dl className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm dark:border-white/5">
                  <div className="flex justify-between">
                    <dt className="text-slate-500 dark:text-slate-400">Subtotal (estimate)</dt>
                    <dd className="font-mono font-bold">{inr(subtotal)}</dd>
                  </div>
                  <div className="flex justify-between text-slate-400 dark:text-slate-500">
                    <dt>Discount — later step</dt>
                    <dd className="font-mono">{inr(0)}</dd>
                  </div>
                  <div className="flex justify-between text-base">
                    <dt className="font-extrabold">Total (estimate)</dt>
                    <dd className="font-mono font-extrabold">{inr(subtotal)}</dd>
                  </div>
                </dl>
                <button
                  type="button"
                  onClick={openCheckout}
                  disabled={cart.length === 0}
                  title="Open checkout"
                  className="mt-3 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Checkout · {inr(subtotal)} (estimate)
                </button>
                <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                  Client-side draft only. No stock is reserved and nothing is posted from this screen.
                </p>
              </>
            )}
          </section>
        </div>
      </div>
      </fieldset>
      {checkoutOpen && cart.length > 0 && (
        <PosCheckout
          lines={cart}
          products={products}
          customer={customer}
          instruments={instruments}
          estimateTotal={subtotal}
          saleKey={saleKey}
          tenantId={tenantId}
          businessName={businessName}
          operator={operator}
          onClose={() => setCheckoutOpen(false)}
          onSuccess={completeSale}
        />
      )}
    </div>
  );
}
