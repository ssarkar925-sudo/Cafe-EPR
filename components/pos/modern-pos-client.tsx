"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import {
  calculateGstInvoice,
  type GstInvoiceCalculation,
  type TaxTreatment,
} from "@/lib/gst";
import {
  Check,
  ChevronDown,
  CirclePlus,
  Grid2X2,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Star,
  Trash2,
  UserRound,
  X,
  Zap,
} from "lucide-react";

export type ModernPosProduct = {
  id: string;
  code: string | null;
  name: string;
  sale_price: number | string;
  stock_qty: number | string;
  reorder_level: number | string;
  unit: string;
  category_id: string | null;
  hsn_code?: string | null;
  gst_rate?: number | string | null;
  categories: { name: string } | null;
};

export type ModernPosService = {
  id: string;
  name: string;
  sale_price: number | string;
  category_id: string | null;
  is_quick_favorite?: boolean;
  quick_sort?: number | null;
  sac_code?: string | null;
  gst_rate?: number | string | null;
  categories: { name: string } | null;
};

export type ModernPosCustomer = {
  id: string;
  name: string;
  code: string | null;
  phone: string | null;
  balance: number | string;
  gstin?: string | null;
  state_code?: string | null;
};

export type ModernPosInstrument = {
  id: string;
  name: string;
  type: string;
};

type PosItem = {
  id: string;
  kind: "product" | "service" | "custom";
  name: string;
  price: number;
  stock?: number;
  categoryId: string | null;
  categoryName: string;
  code?: string | null;
  hsnSac?: string | null;
  gstRate: number;
  taxTreatment: TaxTreatment;
  favorite: boolean;
};

type CartLine = PosItem & {
  key: string;
  qty: number;
  rate: number;
};

type PaymentRow = {
  instrumentId: string;
  amount: string;
};

const FAVORITES_KEY = "sccomm-pos-favorites-v2";
const VIEW_KEY = "sccomm-pos-view-v2";

const compactInput =
  "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900 dark:text-white";

function money(value: number) {
  return inr(Number.isFinite(value) ? value : 0);
}

function readFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeFavorites(value: string[]) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(value));
  } catch {}
}

function instrumentKind(type: string) {
  if (type === "upi_qr" || type === "upi") return "upi";
  if (type === "debit_card" || type === "credit_card") return "card";
  return type;
}

function itemKey(kind: PosItem["kind"], id: string) {
  return `${kind}:${id}`;
}

function normalizeCategoryName(name: string | null | undefined) {
  return (name || "Uncategorized").trim() || "Uncategorized";
}

export default function ModernPosClient({
  products,
  services,
  customers,
  instruments,
  todayInvoices,
}: {
  products: ModernPosProduct[];
  services: ModernPosService[];
  customers: ModernPosCustomer[];
  instruments: ModernPosInstrument[];
  todayInvoices: Array<{ id: string; invoice_number: string; total: number | string; status: string }>;
}) {
  const supabase = createClient();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLInputElement>(null);

  const [productState, setProductState] = useState(products);
  const [serviceState, setServiceState] = useState(services);
  const [customerState, setCustomerState] = useState(customers);
  const [favKeys, setFavKeys] = useState<string[]>(readFavorites);
  const [view, setView] = useState<"list" | "grid">(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "list";
    } catch {
      return "list";
    }
  });

  const [category, setCategory] = useState("all");
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [customerQ, setCustomerQ] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [discount, setDiscount] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customRate, setCustomRate] = useState("");
  const [customGstRate, setCustomGstRate] = useState("0");
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    id: string;
    invoice_number: string;
    total: number;
    paid: number;
    due: number;
  } | null>(null);

  useEffect(() => {
    setProductState(products);
    setServiceState(services);
    setCustomerState(customers);
  }, [products, services, customers]);

  useEffect(() => writeFavorites(favKeys), [favKeys]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {}
  }, [view]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setCheckoutOpen(false);
        setCustomOpen(false);
        setCustomerOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const customer = useMemo(
    () => customerState.find((c) => c.id === customerId) ?? null,
    [customerId, customerState]
  );

  const baseItems = useMemo<PosItem[]>(() => {
    const favorites = new Set(favKeys);
    const ps: PosItem[] = productState.map((p) => ({
      id: p.id,
      kind: "product",
      name: p.name,
      price: Number(p.sale_price) || 0,
      stock: Number(p.stock_qty) || 0,
      categoryId: p.category_id,
      categoryName: normalizeCategoryName(p.categories?.name),
      code: p.code,
      hsnSac: p.hsn_code,
      gstRate: Number(p.gst_rate) || 0,
      taxTreatment: (Number(p.gst_rate) || 0) > 0 ? "taxable" : "non_gst",
      favorite: favorites.has(itemKey("product", p.id)),
    }));
    const ss: PosItem[] = serviceState.map((s) => ({
      id: s.id,
      kind: "service",
      name: s.name,
      price: Number(s.sale_price) || 0,
      categoryId: s.category_id,
      categoryName: normalizeCategoryName(s.categories?.name),
      code: null,
      hsnSac: s.sac_code,
      gstRate: Number(s.gst_rate) || 0,
      taxTreatment: (Number(s.gst_rate) || 0) > 0 ? "taxable" : "non_gst",
      favorite: favorites.has(itemKey("service", s.id)) || Boolean(s.is_quick_favorite),
    }));
    return [...ss, ...ps];
  }, [favKeys, productState, serviceState]);

  const categories = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const item of baseItems) {
      const id = item.categoryId || "uncategorized";
      const existing = counts.get(id);
      counts.set(id, { name: item.categoryName, count: (existing?.count || 0) + 1 });
    }
    return Array.from(counts.entries())
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [baseItems]);

  const filteredItems = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return baseItems
      .filter((item) => category === "all" || (category === "favorites" ? item.favorite : (item.categoryId || "uncategorized") === category))
      .filter((item) => {
        if (!needle) return true;
        return `${item.name} ${item.code || ""} ${item.categoryName}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [baseItems, category, q]);

  const customerMatches = useMemo(() => {
    const needle = customerQ.trim().toLowerCase();
    return customerState
      .filter((c) => {
        if (!needle) return true;
        return `${c.name} ${c.code || ""} ${c.phone || ""}`.toLowerCase().includes(needle);
      })
      .slice(0, 12);
  }, [customerQ, customerState]);

  const subtotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.qty * line.rate, 0),
    [cart]
  );
  const discountValue = Math.min(subtotal, Math.max(0, Number(discount) || 0));

  const gstCalc = useMemo<GstInvoiceCalculation>(() => {
    const lines = cart.map((line) => ({
      qty: line.qty,
      rate: line.rate,
      gstRate: line.gstRate,
      hsnSac: line.hsnSac,
      taxTreatment: line.taxTreatment,
    }));
    return calculateGstInvoice({
      lines,
      invoiceLumpSumDiscount: discountValue,
      supplierStateCode: "19",
      customerStateCode: customer?.state_code || null,
      customerGstin: customer?.gstin || null,
    });
  }, [cart, customer, discountValue]);

  const total = gstCalc.invoiceTotal;

  const paymentTotal = payments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const unpaidDue = Math.max(0, total - paymentTotal);
  const canComplete = cart.length > 0 && paymentTotal <= total + 0.005;

  const activeInstruments = useMemo(
    () => instruments.filter((i) => ["cash", "upi", "upi_qr", "bank", "wallet", "debit_card", "credit_card"].includes(i.type)),
    [instruments]
  );

  const preferredInstrument = useMemo(() => {
    const wanted = ["cash", "upi", "upi_qr", "debit_card", "credit_card", "bank", "wallet"];
    for (const type of wanted) {
      const match = activeInstruments.find((i) => i.type === type);
      if (match) return match;
    }
    return activeInstruments[0] || null;
  }, [activeInstruments]);

  function toggleFavorite(item: PosItem) {
    const key = itemKey(item.kind, item.id);
    setFavKeys((current) => current.includes(key) ? current.filter((x) => x !== key) : [...current, key]);
  }

  function addItem(item: PosItem) {
    if (item.kind === "product" && (item.stock ?? 0) <= 0) return;
    setCart((current) => {
      const key = itemKey(item.kind, item.id);
      const existing = current.find((line) => line.key === key);
      if (existing) {
        if (item.kind === "product" && existing.qty >= (item.stock ?? 0)) return current;
        return current.map((line) => line.key === key ? { ...line, qty: line.qty + 1 } : line);
      }
      return [...current, { ...item, key, qty: 1, rate: item.price }];
    });
  }

  function changeQty(key: string, delta: number) {
    setCart((current) => current.flatMap((line) => {
      if (line.key !== key) return [line];
      const next = line.qty + delta;
      if (next <= 0) return [];
      if (line.kind === "product" && next > (line.stock ?? 0)) return [line];
      return [{ ...line, qty: next }];
    }));
  }

  function setLineRate(key: string, value: string) {
    const rate = Math.max(0, Number(value) || 0);
    setCart((current) => current.map((line) => line.key === key ? { ...line, rate } : line));
  }

  function openCheckout() {
    setError(null);
    const initial = preferredInstrument ? [{ instrumentId: preferredInstrument.id, amount: money(total).replace("₹", "").replace(/,/g, "") }] : [];
    setPayments(initial);
    setCheckoutOpen(true);
  }

  function addPaymentRow() {
    const used = new Set(payments.map((p) => p.instrumentId));
    const next = activeInstruments.find((i) => !used.has(i.id)) || preferredInstrument;
    if (!next) return;
    setPayments((rows) => [...rows, { instrumentId: next.id, amount: "" }]);
  }

  function updatePayment(index: number, field: keyof PaymentRow, value: string) {
    setPayments((rows) => rows.map((row, idx) => idx === index ? { ...row, [field]: value } : row));
  }

  function removePayment(index: number) {
    setPayments((rows) => rows.filter((_, idx) => idx !== index));
  }

  function addCustomItem() {
    const name = customName.trim();
    const rate = Math.max(0, Number(customRate) || 0);
    if (!name || rate <= 0) return;
    const gstRate = Math.max(0, Number(customGstRate) || 0);
    const item: PosItem = {
      id: crypto.randomUUID(),
      kind: "custom",
      name,
      price: rate,
      categoryId: null,
      categoryName: "Custom",
      hsnSac: null,
      gstRate,
      taxTreatment: gstRate > 0 ? "taxable" : "non_gst",
      favorite: false,
    };
    setCart((current) => [...current, { ...item, key: itemKey("custom", item.id), qty: 1, rate }]);
    setCustomName("");
    setCustomRate("");
    setCustomGstRate("0");
    setCustomOpen(false);
  }

  async function completeSale() {
    setError(null);
    if (!cart.length) return;
    if (paymentTotal > total + 0.005) {
      setError("Collected amount cannot be greater than the invoice total.");
      return;
    }
    if (unpaidDue > 0.005 && !customerId) {
      setError("Select a customer before saving a bill with an outstanding amount.");
      return;
    }
    if (!payments.length && total > 0 && customerId === "") {
      setError("A walk-in bill must be fully paid. Select a customer to save it as due.");
      return;
    }

    setBusy(true);
    try {
      const itemResults = gstCalc.lines;
      const payloadItems = cart.map((line, index) => ({
        product_id: line.kind === "product" ? line.id : null,
        service_id: line.kind === "service" ? line.id : null,
        description: line.name,
        qty: line.qty,
        rate: line.rate,
        amount: itemResults[index]?.lineTotal ?? line.qty * line.rate,
        hsn_sac: itemResults[index]?.hsnSac ?? line.hsnSac ?? null,
        taxable_value: itemResults[index]?.taxableValue ?? line.qty * line.rate,
        gst_rate: itemResults[index]?.gstRate ?? line.gstRate,
        cgst_rate: itemResults[index]?.cgstRate ?? 0,
        cgst_amount: itemResults[index]?.cgstAmount ?? 0,
        sgst_rate: itemResults[index]?.sgstRate ?? 0,
        sgst_amount: itemResults[index]?.sgstAmount ?? 0,
        igst_rate: itemResults[index]?.igstRate ?? 0,
        igst_amount: itemResults[index]?.igstAmount ?? 0,
        tax_treatment: itemResults[index]?.taxTreatment ?? line.taxTreatment,
      }));

      const normalizedPayments = payments
        .map((row) => ({
          instrument_id: row.instrumentId,
          method: instrumentKind(activeInstruments.find((i) => i.id === row.instrumentId)?.type || "cash"),
          amount: Math.round((Number(row.amount) || 0) * 100) / 100,
        }))
        .filter((row) => row.amount > 0);

      const { data, error: rpcError } = await supabase.rpc("create_sale", {
        p_customer_id: customerId || null,
        p_invoice_date: new Date().toISOString().slice(0, 10),
        p_subtotal: gstCalc.totalGross,
        p_discount: discountValue,
        p_total: gstCalc.invoiceTotal,
        p_payments: normalizedPayments,
        p_items: payloadItems,
        p_previous_due: 0,
        p_previous_due_method: "cash",
        p_previous_due_instrument_id: null,
        p_advance_used: 0,
        p_place_of_supply: gstCalc.placeOfSupply,
        p_supply_type: gstCalc.supplyType,
        p_customer_gstin: gstCalc.customerGstin,
        p_b2b_or_b2c: gstCalc.b2bCategory,
        p_total_taxable_value: gstCalc.totalTaxableValue,
        p_total_cgst: gstCalc.totalCgst,
        p_total_sgst: gstCalc.totalSgst,
        p_total_igst: gstCalc.totalIgst,
        p_is_reverse_charge: false,
      });

      if (rpcError) throw rpcError;

      const result = data as any;
      const invoiceId = String(result?.invoice_id || result?.id || "");
      const invoiceNumber = String(result?.invoice_number || "");
      const paid = Number(result?.paid ?? paymentTotal);
      const due = Number(result?.due ?? Math.max(0, total - paid));
      const resultTotal = Number(result?.total ?? total);

      if (!invoiceId || !invoiceNumber) throw new Error("The sale was saved but no invoice reference was returned.");

      if (customerId) {
        setCustomerState((current) => current.map((c) => c.id === customerId ? { ...c, balance: Number(c.balance || 0) + due } : c));
      }

      setSuccess({ id: invoiceId, invoice_number: invoiceNumber, total: resultTotal, paid, due });
      setCart([]);
      setDiscount("");
      setPayments([]);
      setCheckoutOpen(false);
    } catch (err: any) {
      setError(err?.message || "Unable to save the sale. Nothing in the POS was changed locally.");
    } finally {
      setBusy(false);
    }
  }

  const todayCount = todayInvoices.filter((i) => i.status !== "cancelled").length;
  const todayTotal = todayInvoices.filter((i) => i.status !== "cancelled").reduce((s, i) => s + Number(i.total || 0), 0);

  return (
    <div className="flex min-h-[calc(100vh-4.5rem)] flex-col gap-3 bg-slate-50/70 px-3 py-3 dark:bg-slate-950 sm:px-4 lg:px-5">
      <header className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900">
              <ShoppingCart className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-slate-900 dark:text-white">POS Billing</h1>
              <p className="text-[10px] font-medium text-slate-500">Sell faster. One cart. Existing accounting stays authoritative.</p>
            </div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[11px]">
          <div className="hidden rounded-lg bg-slate-50 px-2.5 py-1.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300 sm:block">
            Today <b className="text-slate-900 dark:text-white">{todayCount}</b> bills · <b className="text-slate-900 dark:text-white">{money(todayTotal)}</b>
          </div>
          <Link href="/invoices" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-bold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
            Invoices ↗
          </Link>
          <button type="button" onClick={() => { setCart([]); setDiscount(""); setCustomerId(""); setCustomerQ(""); setSuccess(null); }} className="rounded-lg bg-slate-900 px-2.5 py-1.5 font-black text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900">
            New bill
          </button>
        </div>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button type="button" onClick={() => setCategory("all")} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black ${category === "all" ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>
            All <span className="opacity-70">{baseItems.length}</span>
          </button>
          <button type="button" onClick={() => setCategory("favorites")} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black ${category === "favorites" ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300"}`}>
            <Star className="mr-1 inline h-3 w-3 fill-current" />Favorites <span className="opacity-70">{baseItems.filter((i) => i.favorite).length}</span>
          </button>
          {categories.map((c) => (
            <button key={c.id} type="button" onClick={() => setCategory(c.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${category === c.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>
              {c.name} <span className="opacity-60">{c.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-h-0 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex flex-col gap-2 border-b border-slate-100 p-3 dark:border-white/5 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search item, code or category…" className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-9 text-sm font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-800 dark:text-white" />
              {q && <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"><X className="h-3.5 w-3.5" /></button>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={() => setCustomOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-blue-300 bg-blue-50 px-3 text-xs font-black text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300"><CirclePlus className="h-3.5 w-3.5" />Custom</button>
              <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-white/10 dark:bg-slate-800">
                <button type="button" onClick={() => setView("list")} title="List view" className={`flex h-8 w-8 items-center justify-center rounded-md ${view === "list" ? "bg-white shadow-sm dark:bg-slate-900" : "text-slate-400"}`}><Search className="h-3.5 w-3.5 rotate-90" /></button>
                <button type="button" onClick={() => setView("grid")} title="Grid view" className={`flex h-8 w-8 items-center justify-center rounded-md ${view === "grid" ? "bg-white shadow-sm dark:bg-slate-900" : "text-slate-400"}`}><Grid2X2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </div>

          <div className="max-h-[calc(100vh-12.8rem)] overflow-y-auto p-2.5">
            {filteredItems.length === 0 ? (
              <div className="flex min-h-64 items-center justify-center text-sm text-slate-400">No items match this search.</div>
            ) : view === "list" ? (
              <div className="divide-y divide-slate-100 dark:divide-white/5">
                {filteredItems.map((item) => {
                  const out = item.kind === "product" && (item.stock ?? 0) <= 0;
                  return (
                    <div key={itemKey(item.kind, item.id)} className="group flex items-center gap-3 px-2 py-2.5">
                      <button type="button" onClick={() => toggleFavorite(item)} className="shrink-0 text-slate-300 hover:text-amber-500 dark:text-slate-600" aria-label={item.favorite ? "Remove favorite" : "Add favorite"}>
                        <Star className={`h-4 w-4 ${item.favorite ? "fill-amber-400 text-amber-400" : ""}`} />
                      </button>
                      <button type="button" disabled={out} onClick={() => addItem(item)} className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-45">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-bold text-slate-900 dark:text-white">{item.name}</span>
                          {item.kind === "service" && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-black uppercase text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">Service</span>}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400">
                          <span>{item.categoryName}</span>
                          {item.code && <span>· {item.code}</span>}
                          {item.kind === "product" && <span>· Stock {item.stock}</span>}
                        </div>
                      </button>
                      <div className="w-24 text-right text-sm font-black tabular-nums text-slate-900 dark:text-white">{money(item.price)}</div>
                      <button type="button" disabled={out} onClick={() => addItem(item)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-30 dark:bg-white dark:text-slate-900"><Plus className="h-4 w-4" /></button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                {filteredItems.map((item) => {
                  const out = item.kind === "product" && (item.stock ?? 0) <= 0;
                  return (
                    <div key={itemKey(item.kind, item.id)} className="rounded-lg border border-slate-200 p-2.5 dark:border-white/10">
                      <div className="flex items-start justify-between gap-2">
                        <button type="button" onClick={() => toggleFavorite(item)} className="text-slate-300 hover:text-amber-500"><Star className={`h-4 w-4 ${item.favorite ? "fill-amber-400 text-amber-400" : ""}`} /></button>
                        <span className="text-sm font-black tabular-nums text-slate-900 dark:text-white">{money(item.price)}</span>
                      </div>
                      <button type="button" disabled={out} onClick={() => addItem(item)} className="mt-2 w-full text-left disabled:opacity-40">
                        <div className="min-h-10 line-clamp-2 text-sm font-bold text-slate-900 dark:text-white">{item.name}</div>
                        <div className="mt-1 text-[10px] text-slate-400">{item.kind === "product" ? `Stock ${item.stock}` : item.categoryName}</div>
                      </button>
                      <button type="button" disabled={out} onClick={() => addItem(item)} className="mt-2 flex h-8 w-full items-center justify-center gap-1 rounded-md bg-slate-100 text-xs font-black text-slate-700 hover:bg-slate-200 disabled:opacity-30 dark:bg-slate-800 dark:text-slate-200"><Plus className="h-3.5 w-3.5" />Add</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <aside className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5 dark:border-white/5">
            <div>
              <p className="text-sm font-black text-slate-900 dark:text-white">Current bill</p>
              <p className="text-[10px] text-slate-400">{cart.length} line{cart.length === 1 ? "" : "s"}</p>
            </div>
            <button type="button" onClick={() => setCart([])} disabled={!cart.length} className="text-[10px] font-bold text-slate-400 hover:text-rose-600 disabled:opacity-30">Clear</button>
          </div>

          <div className="border-b border-slate-100 px-3 py-2.5 dark:border-white/5">
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input ref={customerRef} value={customerQ || customer?.name || ""} onFocus={() => setCustomerOpen(true)} onChange={(e) => { setCustomerQ(e.target.value); setCustomerId(""); setCustomerOpen(true); }} placeholder="Walk-in customer" className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-8 text-xs font-semibold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-slate-800 dark:text-white" />
              {(customerQ || customerId) && <button type="button" onClick={() => { setCustomerQ(""); setCustomerId(""); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><X className="h-3 w-3" /></button>}
            </div>
            {customerOpen && (
              <div className="relative z-30">
                <div className="absolute left-0 right-0 top-1 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-slate-900">
                  {customerMatches.length === 0 ? <div className="px-3 py-3 text-xs text-slate-400">No customer found.</div> : customerMatches.map((c) => (
                    <button key={c.id} type="button" onClick={() => { setCustomerId(c.id); setCustomerQ(""); setCustomerOpen(false); }} className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800">
                      <span><span className="block text-xs font-bold text-slate-900 dark:text-white">{c.name}</span><span className="text-[10px] text-slate-400">{c.code || c.phone || "Customer"}</span></span>
                      <span className="text-[10px] font-bold text-slate-500">{Number(c.balance) > 0 ? `Due ${money(Number(c.balance))}` : "Clear"}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {customer && Number(customer.balance) > 0 && <div className="mt-1.5 flex items-center justify-between text-[10px]"><span className="text-slate-400">Current customer due</span><span className="font-black text-amber-600">{money(Number(customer.balance))}</span></div>}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3">
            {!cart.length ? (
              <div className="flex h-full min-h-56 flex-col items-center justify-center text-center text-slate-400">
                <ShoppingCart className="h-8 w-8 opacity-30" />
                <p className="mt-2 text-sm font-bold">Cart is empty</p>
                <p className="text-[11px]">Tap any item to start the bill.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-white/5">
                {cart.map((line) => (
                  <div key={line.key} className="py-2.5">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-bold text-slate-900 dark:text-white">{line.name}</div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <button type="button" onClick={() => changeQty(line.key, -1)} className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"><Minus className="h-3 w-3" /></button>
                          <span className="w-5 text-center text-xs font-black tabular-nums">{line.qty}</span>
                          <button type="button" onClick={() => changeQty(line.key, 1)} className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"><Plus className="h-3 w-3" /></button>
                          <input aria-label={`Rate for ${line.name}`} value={line.rate} onChange={(e) => setLineRate(line.key, e.target.value)} className="ml-1 h-6 w-20 rounded-md border border-slate-200 bg-white px-1.5 text-right text-[11px] font-bold dark:border-white/10 dark:bg-slate-900 dark:text-white" />
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-black tabular-nums text-slate-900 dark:text-white">{money(line.qty * line.rate)}</div>
                        <button type="button" onClick={() => setCart((rows) => rows.filter((r) => r.key !== line.key))} className="mt-1 text-slate-300 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 px-3 py-2.5 dark:border-white/5">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] font-bold text-slate-400">
                Discount
                <input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" placeholder="0" className={`${compactInput} mt-1 text-right`} />
              </label>
              <div className="rounded-lg bg-slate-50 px-2.5 py-2 text-right dark:bg-slate-800">
                <div className="text-[10px] font-bold text-slate-400">Tax</div>
                <div className="text-xs font-black text-slate-800 dark:text-slate-100">{money(gstCalc.totalTax)}</div>
              </div>
            </div>
            <div className="mt-2 flex items-end justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payable</div>
                <div className="text-2xl font-black tracking-tight tabular-nums text-slate-900 dark:text-white">{money(total)}</div>
              </div>
              <button type="button" onClick={openCheckout} disabled={!cart.length} className="flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-35">
                <Zap className="h-4 w-4 fill-current" />Checkout
              </button>
            </div>
          </div>
        </aside>
      </div>

      {checkoutOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-[2px]">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/5">
              <div><h2 className="text-sm font-black text-slate-900 dark:text-white">Checkout</h2><p className="text-[10px] text-slate-400">{customer?.name || "Walk-in customer"}</p></div>
              <button type="button" onClick={() => setCheckoutOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 p-4">
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-500">Invoice total</span><span className="text-lg font-black tabular-nums text-slate-900 dark:text-white">{money(total)}</span></div>
                <div className="mt-1 flex items-center justify-between text-[11px]"><span className="text-slate-400">Collected now</span><span className="font-black text-emerald-600">{money(paymentTotal)}</span></div>
                <div className="mt-1 flex items-center justify-between text-[11px]"><span className="text-slate-400">Outstanding</span><span className={`font-black ${unpaidDue > 0 ? "text-amber-600" : "text-slate-500"}`}>{money(unpaidDue)}</span></div>
              </div>

              <div className="space-y-2">
                {payments.map((row, index) => {
                  const inst = activeInstruments.find((i) => i.id === row.instrumentId);
                  return (
                    <div key={`${row.instrumentId}-${index}`} className="grid grid-cols-[1fr_120px_34px] gap-2">
                      <div className="relative">
                        <select value={row.instrumentId} onChange={(e) => updatePayment(index, "instrumentId", e.target.value)} className={compactInput}>
                          {activeInstruments.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
                      </div>
                      <input value={row.amount} onChange={(e) => updatePayment(index, "amount", e.target.value)} inputMode="decimal" placeholder="0.00" className={`${compactInput} text-right tabular-nums`} />
                      {payments.length > 1 ? <button type="button" onClick={() => removePayment(index)} className="flex h-9 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-rose-500 dark:border-white/10"><Trash2 className="h-3.5 w-3.5" /></button> : <div />}
                    </div>
                  );
                })}
                {!payments.length && <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400 dark:border-white/10">No payment selected. Save this as customer due.</div>}
              </div>

              <div className="flex flex-wrap gap-2">
                {activeInstruments.slice(0, 5).map((inst) => (
                  <button key={inst.id} type="button" onClick={() => setPayments((rows) => rows.length ? rows.map((r, i) => i === 0 ? { ...r, instrumentId: inst.id } : r) : [{ instrumentId: inst.id, amount: Math.max(0, total - paymentTotal).toFixed(2) }])} className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-black text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200">
                    {inst.name}
                  </button>
                ))}
                <button type="button" onClick={addPaymentRow} className="rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-[11px] font-black text-slate-600 dark:border-white/10 dark:text-slate-300">+ Split</button>
              </div>

              {unpaidDue > 0.005 && !customerId && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Select a customer to keep the remaining amount in the customer ledger.</div>}
              {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</div>}

              <button type="button" onClick={completeSale} disabled={busy || !canComplete} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">
                {busy ? "Saving sale…" : <><Check className="h-4 w-4" />Complete bill · {money(total)}</>}
              </button>
              <p className="text-center text-[10px] text-slate-400">Posting uses the existing canonical sale/accounting function. POS does not write directly to reconciliation.</p>
            </div>
          </div>
        </div>
      )}

      {customOpen && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/45 p-3">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between"><h2 className="text-sm font-black text-slate-900 dark:text-white">Custom item</h2><button type="button" onClick={() => setCustomOpen(false)} className="text-slate-400"><X className="h-4 w-4" /></button></div>
            <div className="mt-3 space-y-2.5">
              <label className="block text-[10px] font-bold text-slate-400">Name<input value={customName} onChange={(e) => setCustomName(e.target.value)} autoFocus className={`${compactInput} mt-1`} placeholder="e.g. Lamination / Photo print" /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[10px] font-bold text-slate-400">Rate<input value={customRate} onChange={(e) => setCustomRate(e.target.value)} inputMode="decimal" className={`${compactInput} mt-1 text-right`} /></label>
                <label className="block text-[10px] font-bold text-slate-400">GST %<input value={customGstRate} onChange={(e) => setCustomGstRate(e.target.value)} inputMode="decimal" className={`${compactInput} mt-1 text-right`} /></label>
              </div>
              <button type="button" onClick={addCustomItem} disabled={!customName.trim() || Number(customRate) <= 0} className="mt-1 h-10 w-full rounded-lg bg-slate-900 text-sm font-black text-white disabled:opacity-35 dark:bg-white dark:text-slate-900">Add to bill</button>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-3">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 text-center shadow-2xl dark:bg-slate-900">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"><Check className="h-5 w-5" /></div>
            <h2 className="mt-3 text-lg font-black text-slate-900 dark:text-white">Bill saved</h2>
            <p className="mt-1 text-xs text-slate-500">{success.invoice_number} · {money(success.total)} · Paid {money(success.paid)}{success.due > 0 ? ` · Due ${money(success.due)}` : ""}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link href={`/receipt/${success.id}/a4`} className="flex h-10 items-center justify-center rounded-lg border border-slate-200 text-xs font-black text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200">View receipt</Link>
              <button type="button" onClick={() => setSuccess(null)} className="h-10 rounded-lg bg-slate-900 text-xs font-black text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900">New sale</button>
            </div>
            <button type="button" onClick={() => router.push(`/invoices?q=${encodeURIComponent(success.invoice_number)}`)} className="mt-2 text-[11px] font-bold text-blue-600 hover:underline">Open in existing Invoices module</button>
          </div>
        </div>
      )}
    </div>
  );
}
