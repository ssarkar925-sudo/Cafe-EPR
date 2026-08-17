"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { useRealtime } from "@/lib/supabase/realtime";
import { logAudit } from "@/lib/audit";
import QuickSaleModule, { type QuickSale } from "./quick-sale";
import InstrumentSelect, { METHOD_ACCOUNT_TYPES, type InstrumentPick } from "./instrument-select";
import {
  PosCategorySidebar,
  PosCategoryChips,
  PosItemToolbar,
  PosGrid,
  PosTable,
  CustomerSelector,
  METHOD_BTN,
  inputClass,
  type BrowserItem,
} from "./item-browser";

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
  is_quick_favorite?: boolean;
  quick_sort?: number | null;
  categories: { name: string } | null;
};

export type PosCustomer = {
  id: string;
  name: string;
  code: string | null;
  phone: string | null;
  balance: number | string;
};

export type PosInstrument = {
  id: string;
  name: string;
  type: string;
};

export type CartLine = {
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
  previous_due?: number;
  advance_used?: number;
};

type HeldBill = {
  savedAt: string;
  label: string;
  cart: CartLine[];
  discount: string;
  customerId: string;
  payments: { instrument_id: string; method: string; amount: string }[];
  duePick: InstrumentPick;
  collectDue: boolean;
  dueAmount: string;
  useAdvance: boolean;
  advanceAmount: string;
};

const HELD_KEY = "pos_held_bills";

function loadHeld(): HeldBill[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HELD_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveHeld(list: HeldBill[]) {
  try {
    localStorage.setItem(HELD_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export default function PosClient({
  products,
  services,
  customers,
  instruments,
  salesTodayCount,
  salesTodayAmount,
  initialCustomerId = "",
  initialMode = "invoice",
  todayQuickSales = [],
  enabledMethods,
  canViewProfit = true,
}: {
  products: PosProduct[];
  services: PosService[];
  customers: PosCustomer[];
  instruments: PosInstrument[];
  salesTodayCount: number;
  salesTodayAmount: number;
  initialCustomerId?: string;
  initialMode?: "invoice" | "quick";
  todayQuickSales?: QuickSale[];
  enabledMethods?: string[];
  canViewProfit?: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();

  const [mode, setMode] = useState<"invoice" | "quick">(initialMode);
  const [productState, setProductState] = useState<PosProduct[]>(products);
  const [tab, setTab] = useState<"products" | "services">("products");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState<"name" | "low" | "high" | "stock">("name");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [custList, setCustList] = useState<PosCustomer[]>(customers);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ name: "", phone: "" });
  const [posDup, setPosDup] = useState<any>(null);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [discount, setDiscount] = useState("");
  const [payments, setPayments] = useState<
    { instrument_id: string; method: string; amount: string }[]
  >([
    {
      instrument_id: instruments.find((i) => i.type === "cash")?.id ?? instruments[0]?.id ?? "",
      method: "cash",
      amount: "",
    },
  ]);
  const [collectDue, setCollectDue] = useState(false);
  const [dueAmount, setDueAmount] = useState("");
  const [duePick, setDuePick] = useState<InstrumentPick>({
    instrument_id: instruments.find((i) => i.type === "cash")?.id ?? instruments[0]?.id ?? "",
    method: "cash",
  });
  const [useAdvance, setUseAdvance] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SaleResult | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customRate, setCustomRate] = useState("");
  const [recallOpen, setRecallOpen] = useState(false);
  const [heldBills, setHeldBills] = useState<HeldBill[]>([]);
  const [draftSaved, setDraftSaved] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const customerSearchRef = useRef<HTMLInputElement>(null);

  useRealtime(["products", "invoices", "payments", "customers", "invoice_items"]);

  useEffect(() => {
    setProductState(products);
  }, [products]);

  useEffect(() => {
    setHeldBills(loadHeld());
  }, []);

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
    const out = list.filter((x: any) => {
      if (cat !== "all" && x.category_id !== cat) return false;
      if (!needle) return true;
      return (
        x.name.toLowerCase().includes(needle) ||
        (x.code ? String(x.code).toLowerCase().includes(needle) : false)
      );
    });
    const sorted = [...out];
    if (sort === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "low") {
      sorted.sort((a, b) => Number(a.sale_price) - Number(b.sale_price));
    } else if (sort === "high") {
      sorted.sort((a, b) => Number(b.sale_price) - Number(a.sale_price));
    } else if (sort === "stock") {
      sorted.sort((a: any, b: any) => Number(b.stock_qty ?? 0) - Number(a.stock_qty ?? 0));
    }
    return sorted;
  }, [tab, q, cat, sort, productState, services]);

  const subtotal = useMemo(() => cart.reduce((sum, l) => sum + l.amount, 0), [cart]);
  const discountNum = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const total = subtotal - discountNum;
  const itemCount = useMemo(() => cart.reduce((s, l) => s + l.qty, 0), [cart]);

  const paid = useMemo(() => payments.reduce((s, p) => s + (Number(p.amount) || 0), 0), [payments]);

  const defaultInstrument = instruments.find((i) => i.type === "cash") ?? instruments[0];

  const methodList = useMemo(() => {
    const all = Object.keys(METHOD_BTN);
    if (enabledMethods && enabledMethods.length > 0) return all.filter((m) => enabledMethods.includes(m));
    return all;
  }, [enabledMethods]);

  const activeMethod = payments.length === 1 ? payments[0].method : "";
  const accountFilter = payments.length === 1 ? METHOD_ACCOUNT_TYPES[activeMethod] ?? enabledMethods : enabledMethods;

  function quickMethod(m: string) {
    const types = METHOD_ACCOUNT_TYPES[m] ?? [m];
    const first = types.map((t) => instruments.find((i) => i.type === t)).find(Boolean);
    const instId = first?.id ?? "";
    setPayments((prev) => {
      if (prev.length === 1) {
        return [{ instrument_id: instId, method: m, amount: prev[0].amount }];
      }
      return [{ instrument_id: instId, method: m, amount: "" }];
    });
  }

  const selectedCustomer = custList.find((c) => c.id === customerId);
  const custBalance = selectedCustomer ? Number(selectedCustomer.balance) : 0;
  const hasDue = custBalance > 0;
  const hasAdvance = custBalance < 0;
  const dueCollection = collectDue && hasDue ? Math.min(Math.max(Number(dueAmount) || 0, 0), custBalance) : 0;
  const advanceUsed = useAdvance && hasAdvance ? Math.min(Math.max(Number(advanceAmount) || 0, 0), Math.abs(custBalance), total) : 0;
  const invoiceDue = Math.max(0, total - paid - advanceUsed);
  const change = Math.max(0, paid + advanceUsed - total);
  const insufficient = paid > 0 && paid + advanceUsed < total;

  useEffect(() => {
    setCollectDue(false);
    setUseAdvance(false);
    setDueAmount("");
    setAdvanceAmount("");
  }, [customerId]);

  useEffect(() => {
    setPayments((prev) => {
      if (prev.length === 1 && (prev[0].amount === "" || Number(prev[0].amount) === 0)) {
        const rem = Math.max(0, total - advanceUsed);
        return [{ instrument_id: prev[0].instrument_id, method: prev[0].method, amount: rem > 0 ? String(rem) : "" }];
      }
      return prev;
    });
  }, [total, advanceUsed]);

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

  function nextCustCode() {
    let max = 0;
    for (const c of custList) {
      const n = parseInt(String(c.code ?? "").replace(/\D/g, ""), 10);
      if (!Number.isNaN(n)) max = Math.max(max, n);
    }
    return "CUST-" + String(max + 1).padStart(4, "0");
  }

  async function addCustomer() {
    const name = newCust.name.trim();
    if (!name) {
      alert("Customer name is required.");
      return;
    }
    const phone = newCust.phone.trim();
    if (phone) {
      const { data: dup } = await supabase
        .from("customers")
        .select("id, name, code, phone, balance")
        .eq("phone", phone)
        .maybeSingle();
      if (dup) {
        setPosDup(dup);
        return;
      }
    }
    setAddingCustomer(true);
    const payload = {
      name,
      phone: phone || null,
      code: nextCustCode(),
      opening_balance: 0,
      balance: 0,
      is_active: true,
    };
    const { data, error } = await supabase
      .from("customers")
      .insert(payload)
      .select("id, name, code, phone, balance")
      .single();
    setAddingCustomer(false);
    if (error) {
      alert(error.message);
      return;
    }
    const row = data as PosCustomer;
    setCustList((prev) => [...prev, row]);
    setCustomerId(row.id);
    setShowAddCustomer(false);
    setNewCust({ name: "", phone: "" });
    logAudit({
      action: "create",
      entity: "customer",
      entity_id: row.id,
      description: `Customer created from POS: ${row.name}`,
    });
  }

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

  function addCustomItem() {
    const name = customName.trim();
    const rate = Number(customRate) || 0;
    if (!name || rate <= 0) {
      setError("Enter a name and a valid price.");
      return;
    }
    setError(null);
    setCart((prev) => [
      ...prev,
      { key: `c-${Date.now()}`, product_id: null, service_id: null, name, qty: 1, rate, amount: rate },
    ]);
    setCustomName("");
    setCustomRate("");
    setCustomOpen(false);
  }

  function holdCurrent(label = "Held") {
    if (cart.length === 0) return;
    const bill: HeldBill = {
      savedAt: new Date().toISOString(),
      label,
      cart,
      discount,
      customerId,
      payments,
      duePick,
      collectDue,
      dueAmount,
      useAdvance,
      advanceAmount,
    };
    const next = [...loadHeld(), bill];
    saveHeld(next);
    setHeldBills(next);
    setCart([]);
    setCustomerId("");
    setDiscount("");
    setPayments([
      { instrument_id: defaultInstrument?.id ?? "", method: defaultInstrument?.type ?? "cash", amount: "" },
    ]);
    setCollectDue(false);
    setUseAdvance(false);
    setDueAmount("");
    setAdvanceAmount("");
    setDraftSaved(true);
    window.setTimeout(() => setDraftSaved(false), 2500);
  }

  function recallBill(bill: HeldBill) {
    setCart(bill.cart);
    setDiscount(bill.discount);
    setCustomerId(bill.customerId);
    setPayments(bill.payments);
    setDuePick(bill.duePick);
    setCollectDue(bill.collectDue);
    setDueAmount(bill.dueAmount);
    setUseAdvance(bill.useAdvance);
    setAdvanceAmount(bill.advanceAmount);
    const next = loadHeld().filter((b) => b.savedAt !== bill.savedAt);
    saveHeld(next);
    setHeldBills(next);
    setRecallOpen(false);
  }

  function discardHeld(savedAt: string) {
    const next = loadHeld().filter((b) => b.savedAt !== savedAt);
    saveHeld(next);
    setHeldBills(next);
  }

  function setPaymentInstrument(i: number, pick: InstrumentPick | null) {
    if (!pick) return;
    setPayments((prev) =>
      prev.map((x, j) => (j === i ? { ...x, method: pick.method, instrument_id: pick.instrument_id } : x))
    );
  }

  function setPaymentAmount(i: number, amount: string) {
    setPayments((prev) => prev.map((x, j) => (j === i ? { ...x, amount } : x)));
  }

  function addPaymentRow() {
    setPayments((prev) => {
      const remaining = Math.max(0, total - advanceUsed - prev.reduce((s, p) => s + (Number(p.amount) || 0), 0));
      return [
        ...prev,
        {
          instrument_id: defaultInstrument?.id ?? "",
          method: defaultInstrument?.type ?? "cash",
          amount: remaining > 0 ? String(remaining.toFixed(2)) : "",
        },
      ];
    });
  }

  function fillExact() {
    setPayments((prev) => {
      const next = [...prev];
      const rem = Math.max(0, total - advanceUsed);
      next[0] = {
        instrument_id: next[0].instrument_id,
        method: next[0].method,
        amount: rem > 0 ? String(rem.toFixed(2)) : "0",
      };
      return [next[0]];
    });
  }

  async function completeSale(print: boolean) {
    setError(null);
    if (cart.length === 0) {
      setError("Cart is empty");
      return;
    }
    if (total > 0 && paid + advanceUsed <= 0) {
      setError("Enter a payment amount");
      return;
    }
    if (paid + advanceUsed > total) {
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
      .map((p) => ({ method: p.method, amount: Number(p.amount), instrument_id: p.instrument_id || null }));
    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase.rpc("create_sale", {
      p_customer_id: customerId || null,
      p_invoice_date: today,
      p_subtotal: Number(subtotal.toFixed(2)),
      p_discount: discountNum,
      p_total: Number(total.toFixed(2)),
      p_payments: pmts,
      p_items: items,
      p_previous_due: Number(dueCollection.toFixed(2)),
      p_previous_due_method: duePick.method,
      p_previous_due_instrument_id: duePick.instrument_id || null,
      p_advance_used: Number(advanceUsed.toFixed(2)),
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
        decrement[p.id] ? { ...p, stock_qty: Math.max(0, Number(p.stock_qty) - decrement[p.id]) } : p
      )
    );

    setSuccess(data as SaleResult);
    setCart([]);
    setCustomerId("");
    setDiscount("");
    setPayments([{ instrument_id: defaultInstrument?.id ?? "", method: defaultInstrument?.type ?? "cash", amount: "" }]);
    setCollectDue(false);
    setUseAdvance(false);
    setDueAmount("");
    setAdvanceAmount("");
    logAudit({
      action: "create",
      entity: "invoice",
      entity_id: (data as SaleResult)?.id ?? null,
      description: `Sale created (${inr(total)})${customerId ? " for a customer" : ""}`,
      details: { invoice_number: (data as SaleResult)?.invoice_number ?? null, total: Number(total.toFixed(2)) },
    });

    if (print) {
      const id = (data as SaleResult)?.id;
      if (id) window.open(`/receipt/${id}`, "_blank", "noopener");
    }
  }

  const labelClass = "mb-1 block text-xs font-semibold text-slate-500";

  const payDisabled = busy || cart.length === 0;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-5 lg:px-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {mode === "invoice" ? "Point of Sale" : "Quick Sale"}
          </h1>
          <p className="text-sm text-slate-500">
            {mode === "invoice"
              ? `${salesTodayCount} sale${salesTodayCount === 1 ? "" : "s"} today · ${inr(salesTodayAmount)} collected`
              : "Ultra-fast counter for walk-in sales"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mode === "invoice" && (
            <>
              <button
                onClick={() => {
                  setRecallOpen(true);
                  setHeldBills(loadHeld());
                }}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                  <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
                </svg>
                Recall Bill
                {heldBills.length > 0 && (
                  <span className="rounded-full bg-blue-100 px-1.5 text-[10px] font-bold text-blue-700">
                    {heldBills.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => holdCurrent()}
                disabled={cart.length === 0}
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Hold Bill
              </button>
            </>
          )}
          {draftSaved && (
            <span className="rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              Draft saved
            </span>
          )}
          <div className="flex rounded-xl bg-slate-100 p-1 text-sm">
            {(["invoice", "quick"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-lg px-3.5 py-1.5 font-medium capitalize transition ${
                  mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {m === "invoice" ? "Invoice" : "Quick Sale"}
              </button>
            ))}
          </div>
          {mode === "invoice" && (
            <Link
              href="/invoices"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Today's Sales
            </Link>
          )}
        </div>
      </div>

      {mode === "quick" && (
        <QuickSaleModule
          products={products}
          services={services}
          customers={customers}
          instruments={instruments}
          initialToday={todayQuickSales}
          enabledMethods={enabledMethods}
          canViewProfit={canViewProfit}
        />
      )}

      {mode === "invoice" && (
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[200px_minmax(0,1fr)_400px]">
          {/* ── Categories ─────────────────────────────── */}
          <PosCategorySidebar
            categories={categories}
            totalCount={productState.length + services.length}
            active={cat}
            onSelect={(id) => setCat(cat === id ? "all" : id)}
            onAddCustom={() => setCustomOpen(true)}
          />

          {/* ── Catalog ────────────────────────────────── */}
          <div className="min-w-0">
            <PosItemToolbar
              tabs={[
                { value: "products", label: "Products" },
                { value: "services", label: "Services" },
              ]}
              activeTab={tab}
              onTab={(t) => setTab(t as typeof tab)}
              searchRef={searchRef}
              placeholder="Search by name or code…  (Ctrl+K)"
              q={q}
              onQ={setQ}
              sort={sort}
              onSort={(v) => setSort(v as typeof sort)}
              view={view}
              onView={setView}
            />

            <PosCategoryChips
              categories={categories}
              totalCount={productState.length + services.length}
              active={cat}
              onSelect={(id) => setCat(cat === id ? "all" : id)}
              customBtn={
                <button
                  onClick={() => setCustomOpen(true)}
                  className="flex items-center gap-1 rounded-full border border-dashed border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100 lg:hidden"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-3.5 w-3.5">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Custom item
                </button>
              }
            />

            {view === "grid" ? (
              <PosGrid
                items={filtered as unknown as BrowserItem[]}
                isProduct={tab === "products"}
                onAdd={addLine}
              />
            ) : (
              <PosTable
                items={filtered as unknown as BrowserItem[]}
                isProduct={tab === "products"}
                onAdd={addLine}
              />
            )}
          </div>

          {/* ── Current Invoice ─────────────────────────── */}
          <div className="min-w-0">
            <div className="sticky top-6 flex max-h-[calc(100vh-4rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
                <div>
                  <h2 className="font-semibold text-slate-900">Current Invoice</h2>
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
                <div className="mb-3">
                  <label className={labelClass}>Customer</label>
                  <CustomerSelector
                    customers={custList}
                    value={customerId}
                    onChange={(id) => setCustomerId(id)}
                    onAddCustomer={() => setShowAddCustomer(true)}
                    searchRef={customerSearchRef}
                  />
                  {selectedCustomer && custBalance !== 0 && (
                    <div className="mt-1.5 rounded-lg bg-slate-50 p-2.5 ring-1 ring-slate-100">
                      {hasDue ? (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-slate-600">
                              Owing <span className="font-semibold text-rose-600">{inr(custBalance)}</span> from previous bills
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                const on = !collectDue;
                                setCollectDue(on);
                                if (on) setDueAmount(String(custBalance));
                              }}
                              className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium transition ${
                                collectDue ? "bg-[#0f172a] text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                              }`}
                            >
                              {collectDue ? "Collecting" : "Collect due"}
                            </button>
                          </div>
                          {collectDue && (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={dueAmount}
                                onChange={(e) => setDueAmount(e.target.value)}
                                className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500"
                              />
                              <InstrumentSelect
                                instruments={instruments}
                                pick={duePick}
                                onChange={(pick) => {
                                  if (pick) setDuePick(pick);
                                }}
                                enabled={enabledMethods}
                                className="w-40 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-blue-500"
                              />
                              <span className="text-[11px] text-slate-400">reduces their balance</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-slate-600">
                              Has advance <span className="font-semibold text-emerald-600">{inr(Math.abs(custBalance))}</span> to adjust
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                const on = !useAdvance;
                                setUseAdvance(on);
                                if (on) setAdvanceAmount(String(Math.min(total, Math.abs(custBalance))));
                              }}
                              className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium transition ${
                                useAdvance ? "bg-[#0f172a] text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                              }`}
                            >
                              {useAdvance ? "Applied" : "Use advance"}
                            </button>
                          </div>
                          {useAdvance && (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={advanceAmount}
                                onChange={(e) => setAdvanceAmount(e.target.value)}
                                className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500"
                              />
                              <span className="text-[11px] text-slate-400">max {inr(Math.abs(custBalance))} · covers part of this bill</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {cart.length === 0 ? (
                  <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
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
                            <button onClick={() => changeQty(l.key, l.qty - 1)} className="px-2 py-1 text-sm text-slate-500 transition hover:text-slate-900">
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
                            <button onClick={() => changeQty(l.key, l.qty + 1)} className="px-2 py-1 text-sm text-slate-500 transition hover:text-slate-900">
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

                <div className="mt-4 space-y-3">
                  <div>
                    <label className={labelClass}>Discount</label>
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

                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-500">QUICK PAYMENT</label>
                      {payments.length < 3 && (
                        <button onClick={addPaymentRow} className="text-xs font-medium text-blue-600 hover:text-blue-800">
                          + Split payment
                        </button>
                      )}
                    </div>

                    <div className="mb-2 grid grid-cols-2 gap-2">
                      {methodList.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => quickMethod(m)}
                          className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold ring-1 transition ${
                            activeMethod === m ? METHOD_BTN[m].active : METHOD_BTN[m].idle
                          }`}
                        >
                          {METHOD_BTN[m].label}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-2">
                      {payments.map((p, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <InstrumentSelect
                            instruments={instruments}
                            pick={p}
                            onChange={(pick) => setPaymentInstrument(i, pick)}
                            enabled={accountFilter}
                            className="w-36 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-500"
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={p.amount}
                            onChange={(e) => setPaymentAmount(i, e.target.value)}
                            placeholder={payments.length === 1 ? "Amount received" : "Amount"}
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

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <button
                        onClick={fillExact}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                      >
                        Exact amount ({inr(total)})
                      </button>
                      <div className="text-right text-xs">
                        {change > 0 ? (
                          <span className="font-medium text-emerald-600">
                            Change <span className="text-sm font-bold">{inr(change)}</span>
                          </span>
                        ) : insufficient ? (
                          <span className="font-medium text-amber-600">Insufficient amount — {inr(invoiceDue)} due</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
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
                  <div className="flex justify-between text-slate-500">
                    <span>Tax</span>
                    <span>{inr(0)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                    <span className="font-semibold text-slate-900">TOTAL</span>
                    <span className="text-xl font-bold text-blue-600">{inr(total)}</span>
                  </div>
                  {advanceUsed > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Advance applied</span>
                      <span>− {inr(advanceUsed)}</span>
                    </div>
                  )}
                  {dueCollection > 0 && (
                    <div className="flex justify-between text-rose-600">
                      <span>Previous due collected</span>
                      <span>+ {inr(dueCollection)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-500">
                    <span>Paid</span>
                    <span>{inr(paid)}</span>
                  </div>
                  <div className={`flex justify-between ${invoiceDue > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                    <span className="font-medium">Due</span>
                    <span className="font-semibold">{inr(invoiceDue)}</span>
                  </div>
                </div>

                {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => holdCurrent("Draft")}
                    disabled={payDisabled}
                    className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Save Draft
                  </button>
                  <button
                    onClick={() => completeSale(false)}
                    disabled={payDisabled}
                    className="rounded-xl bg-[#0f172a] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    ₹ Pay
                  </button>
                </div>
                <button
                  onClick={() => completeSale(true)}
                  disabled={payDisabled}
                  className="mt-2 w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-3 text-sm font-semibold text-white shadow-md transition hover:from-blue-700 hover:to-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Completing sale…" : `Pay & Print · ${inr(total)}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddCustomer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/60 p-4 backdrop-blur-sm"
          onClick={() => setShowAddCustomer(false)}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-900">Add Customer</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              A new code will be generated automatically and this customer will be selected.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Name *</label>
                <input
                  autoFocus
                  value={newCust.name}
                  onChange={(e) => setNewCust((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Customer name"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Phone</label>
                <input
                  value={newCust.phone}
                  onChange={(e) => setNewCust((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="Mobile number"
                  className={inputClass}
                />
              </div>
              {posDup && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-medium text-amber-800">
                    Customer with this mobile number already exists.
                  </p>
                  <p className="mt-0.5 text-xs text-amber-700">
                    {posDup.name} · {posDup.phone ?? ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        router.push(`/customers/${posDup.id}`);
                        setShowAddCustomer(false);
                        setPosDup(null);
                      }}
                      className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
                    >
                      View Customer
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerId(posDup.id);
                        setShowAddCustomer(false);
                        setPosDup(null);
                        setNewCust({ name: "", phone: "" });
                      }}
                      className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-blue-700"
                    >
                      Use Existing Customer
                    </button>
                    <button
                      type="button"
                      onClick={() => setPosDup(null)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50"
                    >
                      Keep editing
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowAddCustomer(false)}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={addCustomer}
                disabled={addingCustomer}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
              >
                {addingCustomer ? "Adding…" : "Add customer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {customOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/60 p-4 backdrop-blur-sm"
          onClick={() => setCustomOpen(false)}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-900">Add Custom Item</h2>
            <p className="mt-0.5 text-xs text-slate-500">A one-off item not in the catalog.</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Name *</label>
                <input
                  autoFocus
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. Delivery charge, Gift wrap…"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Price (₹) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={customRate}
                  onChange={(e) => setCustomRate(e.target.value)}
                  placeholder="0.00"
                  className={inputClass}
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setCustomOpen(false)}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={addCustomItem}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
              >
                Add item
              </button>
            </div>
          </div>
        </div>
      )}

      {recallOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/60 p-4 backdrop-blur-sm"
          onClick={() => setRecallOpen(false)}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-900">Held Bills / Drafts</h2>
            <p className="mt-0.5 text-xs text-slate-500">Pick a bill to restore it to the cart. It is removed from held list once recalled.</p>
            {heldBills.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">No held bills or drafts yet.</p>
            ) : (
              <div className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto">
                {heldBills
                  .slice()
                  .reverse()
                  .map((b) => {
                    const amt = b.cart.reduce((s, l) => s + l.amount, 0) - (Number(b.discount) || 0);
                    const label = b.label === "Draft" ? "Draft" : "Held bill";
                    return (
                      <div key={b.savedAt} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900">
                            {label} · {inr(Math.max(0, amt))}
                          </p>
                          <p className="truncate text-xs text-slate-400">
                            {b.cart.length} item{b.cart.length === 1 ? "" : "s"} ·{" "}
                            {new Date(b.savedAt).toLocaleString()}
                          </p>
                        </div>
                        <button
                          onClick={() => recallBill(b)}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700"
                        >
                          Recall
                        </button>
                        <button
                          onClick={() => discardHeld(b.savedAt)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-100"
                        >
                          Discard
                        </button>
                      </div>
                    );
                  })}
              </div>
            )}
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setRecallOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
              {Number(success.advance_used) > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Advance used</span>
                  <span className="font-medium text-emerald-600">− {inr(Number(success.advance_used))}</span>
                </div>
              )}
              {Number(success.previous_due) > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Previous due collected</span>
                  <span className="font-medium text-slate-900">+ {inr(Number(success.previous_due))}</span>
                </div>
              )}
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