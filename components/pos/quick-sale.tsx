"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { useRealtime } from "@/lib/supabase/realtime";
import { logAudit } from "@/lib/audit";
import ScanFillModal from "@/components/scan-fill/scan-fill-modal";
import type { ScanFields } from "@/lib/scan/extract";
import type { PosProduct, PosService, PosCustomer, PosInstrument, CartLine } from "./pos-client";
import InstrumentSelect, { INSTRUMENT_TYPES, METHOD_ACCOUNT_TYPES, instrumentLabel, type InstrumentPick } from "./instrument-select";
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

export type QuickSale = {
  id: string;
  sale_number: string;
  sale_date: string;
  customer_id: string | null;
  product_id: string | null;
  service_id: string | null;
  item_name: string | null;
  amount: number;
  cost: number;
  tendered: number | null;
  change_due: number;
  payments: { method: string; amount: number; instrument_id?: string | null }[];
  status: string;
  created_at: string;
  customers: { name: string } | null;
  products: { name: string } | null;
  services: { name: string } | null;
};

type PaymentRow = { instrument_id: string; method: string; amount: string };

function instrumentName(instruments: PosInstrument[], id: string | null | undefined) {
  if (!id) return "Cash";
  return instruments.find((i) => i.id === id)?.name ?? "Cash";
}

function paymentLabel(instruments: PosInstrument[], p: { instrument_id?: string | null; method?: string }) {
  if (p.instrument_id) return instrumentName(instruments, p.instrument_id);
  return instrumentLabel(p.method ?? "cash");
}

const HELD_KEY = "quick_held";

type HeldQuick = { savedAt: string; cart: CartLine[]; customerId: string; payments: PaymentRow[] };

function loadHeld(): HeldQuick[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HELD_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export default function QuickSaleModule({
  products,
  services,
  customers,
  instruments,
  initialToday = [],
  enabledMethods,
  canViewProfit = true,
}: {
  products: PosProduct[];
  services: PosService[];
  customers: PosCustomer[];
  instruments: PosInstrument[];
  initialToday?: QuickSale[];
  enabledMethods?: string[];
  canViewProfit?: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();
  useRealtime(["quick_sales", "quick_sale_items", "products", "services", "payment_instruments", "expenses", "cash_entries"]);

  const [todayList, setTodayList] = useState<QuickSale[]>(initialToday);
  const [instrumentList, setInstrumentList] = useState<PosInstrument[]>(instruments);
  const [tab, setTab] = useState<"services" | "products">("services");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState<"name" | "low" | "high" | "stock">("name");
  const [favOnly, setFavOnly] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [payments, setPayments] = useState<PaymentRow[]>([
    {
      instrument_id: instrumentList.find((i) => i.type === "cash")?.id ?? instrumentList[0]?.id ?? "",
      method: "cash",
      amount: "",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [lastSale, setLastSale] = useState<QuickSale | null>(null);
  const [recentOpen, setRecentOpen] = useState(false);
  const [showMoneyOut, setShowMoneyOut] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customRate, setCustomRate] = useState("");
  const [customCost, setCustomCost] = useState("");
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [qsNewCust, setQsNewCust] = useState({ name: "", phone: "" });
  const [qsDup, setQsDup] = useState<any>(null);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [recallOpen, setRecallOpen] = useState(false);
  const [held, setHeld] = useState<HeldQuick[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLInputElement>(null);
  const payRef = useRef<HTMLInputElement>(null);

  const [view, setView] = useState<"grid" | "list">(() => {
    try {
      return localStorage.getItem("sccomm-qs-view") === "grid" ? "grid" : "list";
    } catch {
      return "list";
    }
  });

  function switchView(v: "grid" | "list") {
    setView(v);
    try {
      localStorage.setItem("sccomm-qs-view", v);
    } catch {
      /* ignore */
    }
  }

  const [moPick, setMoPick] = useState<InstrumentPick>({
    instrument_id: instrumentList.find((i) => i.type === "cash")?.id ?? instrumentList[0]?.id ?? "",
    method: "cash",
  });
  const [moAmount, setMoAmount] = useState("");
  const [moNote, setMoNote] = useState("");
  const [moBusy, setMoBusy] = useState(false);

  const [addInstOpen, setAddInstOpen] = useState(false);
  const [newInst, setNewInst] = useState({ name: "", type: "cash" });
  const [addingInst, setAddingInst] = useState(false);

  const defaultInstrument = instrumentList.find((i) => i.type === "cash") ?? instrumentList[0];

  useEffect(() => {
    setHeld(loadHeld());
  }, []);

  const favServices = useMemo(
    () =>
      services
        .filter((s) => s.is_quick_favorite)
        .sort((a, b) => (a.quick_sort ?? 0) - (b.quick_sort ?? 0)),
    [services]
  );

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      if (p.category_id && p.categories) map.set(p.category_id, (map.get(p.category_id) ?? 0) + 1);
    }
    for (const s of services) {
      if (s.category_id && s.categories) map.set(s.category_id, (map.get(s.category_id) ?? 0) + 1);
    }
    const names = new Map<string, string>();
    for (const p of products) if (p.categories) names.set(p.category_id!, p.categories.name);
    for (const s of services) if (s.categories) names.set(s.category_id!, s.categories.name);
    return Array.from(map.entries()).map(([id, count]) => ({ id, name: names.get(id) ?? "?", count }));
  }, [products, services]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list: (PosProduct | PosService)[] = tab === "services" ? (favOnly ? favServices : services) : products;
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
    return sorted as BrowserItem[];
  }, [tab, q, cat, sort, favOnly, favServices, products, services]);

  const total = useMemo(() => cart.reduce((s, l) => s + l.amount, 0), [cart]);
  const itemCount = useMemo(() => cart.reduce((s, l) => s + l.qty, 0), [cart]);
  const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const singleCash = payments.length === 1 && payments[0].method === "cash";
  const change = singleCash ? Math.max(0, paid - total) : 0;
  const due = Math.max(0, total - paid);
  const insufficient = paid > 0 && paid < total;

  const methodList = useMemo(() => {
    const all = Object.keys(METHOD_BTN);
    if (enabledMethods && enabledMethods.length > 0) return all.filter((m) => enabledMethods.includes(m));
    return all;
  }, [enabledMethods]);

  const activeMethod = payments.length === 1 ? payments[0].method : "";
  const accountFilter = payments.length === 1 ? METHOD_ACCOUNT_TYPES[activeMethod] ?? enabledMethods : enabledMethods;

  function quickMethod(m: string) {
    const types = METHOD_ACCOUNT_TYPES[m] ?? [m];
    const first = types.map((t) => instrumentList.find((i) => i.type === t)).find(Boolean);
    const instId = first?.id ?? "";
    setPayments((prev) => {
      if (prev.length === 1) {
        return [{ instrument_id: instId, method: m, amount: prev[0].amount }];
      }
      return [{ instrument_id: instId, method: m, amount: total > 0 ? String(total.toFixed(2)) : "" }];
    });
  }

  const summary = useMemo(() => {
    let count = 0;
    let collected = 0;
    let totalCost = 0;
    const byMethod = new Map<string, number>();
    for (const s of todayList) {
      if (s.status !== "active") continue;
      count++;
      collected += Number(s.amount) || 0;
      totalCost += Number(s.cost) || 0;
      for (const p of s.payments ?? []) {
        const key = paymentLabel(instrumentList, p);
        byMethod.set(key, (byMethod.get(key) ?? 0) + (Number(p.amount) || 0));
      }
    }
    return {
      count,
      collected,
      profit: collected - totalCost,
      avg: count > 0 ? collected / count : 0,
      byMethod: Array.from(byMethod.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [todayList, instrumentList]);

  async function refresh() {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("quick_sales")
      .select(
        "id, sale_number, sale_date, customer_id, product_id, service_id, item_name, amount, cost, tendered, change_due, payments, status, created_at, customers(name), products(name), services(name)"
      )
      .eq("sale_date", today)
      .order("created_at", { ascending: false });
    if (data) setTodayList(data as unknown as QuickSale[]);
  }

  function stockOf(productId: string) {
    const p = products.find((x) => x.id === productId);
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
          l.key === existing.key ? { ...l, qty: nextQty, amount: Number((nextQty * l.rate).toFixed(2)) } : l
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
        l.key === key ? { ...l, rate: Math.max(0, rate), amount: Number((l.qty * Math.max(0, rate)).toFixed(2)) } : l
      )
    );
  }

  function removeLine(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key));
  }

  function addCustomItem() {
    const name = customName.trim();
    const rate = Number(customRate) || 0;
    const cost = Number(customCost) || 0;
    if (!name || rate <= 0) {
      setError("Enter a name and a valid price.");
      return;
    }
    setError(null);
    setCart((prev) => [
      ...prev,
      {
        key: `c-${Date.now()}`,
        product_id: null,
        service_id: null,
        name,
        qty: 1,
        rate,
        amount: rate,
        cost: Math.max(0, cost),
      },
    ]);
    setCustomName("");
    setCustomRate("");
    setCustomCost("");
    setCustomOpen(false);
  }

  async function addQuickCustomer() {
    const name = qsNewCust.name.trim();
    if (!name) {
      setError("Customer name is required.");
      return;
    }
    const phone = qsNewCust.phone.trim();
    if (phone) {
      const { data: dup } = await supabase
        .from("customers")
        .select("id, name, code, phone, balance")
        .eq("phone", phone)
        .maybeSingle();
      if (dup) {
        setQsDup(dup);
        return;
      }
    }
    setAddingCustomer(true);
    const { count } = await supabase.from("customers").select("id", { count: "exact", head: true });
    const nextNo = (count ?? 0) + 1;
    const code = `CUS-${String(nextNo).padStart(4, "0")}`;
    const { data, error } = await supabase
      .from("customers")
      .insert({
        name,
        phone: phone || null,
        code,
        opening_balance: 0,
        balance: 0,
        is_active: true,
      })
      .select()
      .single();
    setAddingCustomer(false);
    if (error) {
      setError(error.message);
      return;
    }
    setCustomerId(data.id);
    setShowAddCustomer(false);
    setQsNewCust({ name: "", phone: "" });
  }

  function setPaymentInstrument(i: number, pick: InstrumentPick | null) {
    if (!pick) {
      setAddInstOpen(true);
      return;
    }
    setPayments((prev) =>
      prev.map((x, j) => (j === i ? { ...x, method: pick.method, instrument_id: pick.instrument_id } : x))
    );
  }

  function setPaymentAmount(i: number, v: string) {
    setPayments((prev) => prev.map((x, j) => (j === i ? { ...x, amount: v } : x)));
  }

  function applyPaymentScan(f: ScanFields) {
    if (f.method) quickMethod(f.method);
    if (f.amount) setPaymentAmount(0, f.amount);
  }

  function addPaymentRow() {
    setPayments((prev) => {
      const remaining = Math.max(0, total - prev.reduce((s, p) => s + (Number(p.amount) || 0), 0));
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
      next[0] = {
        instrument_id: next[0].instrument_id,
        method: next[0].method,
        amount: total > 0 ? String(total.toFixed(2)) : "0",
      };
      return [next[0]];
    });
  }

  function holdCart() {
    if (cart.length === 0) return;
    const h: HeldQuick = { savedAt: new Date().toISOString(), cart, customerId, payments };
    const next = [...loadHeld(), h];
    try {
      localStorage.setItem(HELD_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setHeld(next);
    setCart([]);
    setCustomerId("");
  }

  function recallHeld(h: HeldQuick) {
    setCart(h.cart);
    setCustomerId(h.customerId);
    setPayments(
      h.payments && h.payments.length > 0
        ? h.payments
        : [{ instrument_id: defaultInstrument?.id ?? "", method: defaultInstrument?.type ?? "cash", amount: "" }]
    );
    const next = loadHeld().filter((x) => x.savedAt !== h.savedAt);
    try {
      localStorage.setItem(HELD_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setHeld(next);
    setRecallOpen(false);
  }

  function discardHeld(savedAt: string) {
    const next = loadHeld().filter((x) => x.savedAt !== savedAt);
    try {
      localStorage.setItem(HELD_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setHeld(next);
  }

  function clearCart() {
    if (cart.length === 0) return;
    if (window.confirm("Clear the current sale?")) {
      setCart([]);
    }
  }

  async function record(print: boolean) {
    setError(null);
    if (cart.length === 0) {
      setError("Add an item to the sale first.");
      return;
    }
    if (paid <= 0) {
      setError("Enter the amount received.");
      return;
    }
    if (paid < total) {
      setError(`Amount received (${inr(paid)}) is less than the total (${inr(total)}).`);
      return;
    }
    if (!singleCash && Math.abs(paid - total) > 0.01) {
      setError(`Payments (${inr(paid)}) must equal the sale amount (${inr(total)}).`);
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    let pmts: { method: string; amount: number; instrument_id: string | null }[];
    let tendered: number | null = null;
    if (singleCash) {
      pmts = [
        { method: "cash", amount: Number(total.toFixed(2)), instrument_id: payments[0].instrument_id || null },
      ];
      tendered = Number(payments[0].amount) || null;
    } else {
      pmts = payments
        .filter((p) => Number(p.amount) > 0)
        .map((p) => ({ method: p.method, amount: Number(p.amount), instrument_id: p.instrument_id || null }));
    }
    const items = cart.map((l) => ({
      product_id: l.product_id,
      service_id: l.service_id,
      item_name: l.product_id || l.service_id ? null : l.name,
      qty: l.qty,
      rate: l.rate,
      cost_price: l.product_id || l.service_id ? 0 : l.cost ?? 0,
    }));
    setBusy(true);
    const { data, error: err } = await supabase.rpc("record_quick_sale", {
      p_sale_date: today,
      p_amount: 0,
      p_cost: 0,
      p_customer_id: customerId || null,
      p_tendered: tendered,
      p_payments: pmts,
      p_items: items,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    const sale = data as unknown as QuickSale;
    setLastSale(sale);
    setCart([]);
    setCustomerId("");
    setPayments([
      {
        instrument_id: defaultInstrument?.id ?? "",
        method: defaultInstrument?.type ?? "cash",
        amount: "",
      },
    ]);
    logAudit({
      action: "create",
      entity: "quick_sale",
      entity_id: (data as any)?.id ?? null,
      description: `Quick sale ${inr(total)} (${itemCount} item${itemCount === 1 ? "" : "s"})`,
      details: { sale_number: (data as any)?.sale_number ?? null, amount: Number(total.toFixed(2)) },
    });
    refresh();
    if (print && sale.id) {
      window.open(`/receipt/quick/${sale.id}`, "_blank", "noopener");
    }
  }

  async function cancelSale(s: QuickSale) {
    if (!window.confirm(`Cancel ${s.sale_number} (${inr(s.amount)})? Entries will be reversed and stock restored.`)) return;
    const { error: err } = await supabase.rpc("cancel_quick_sale", { p_sale_id: s.id });
    if (err) {
      setError(err.message);
      return;
    }
    logAudit({
      action: "cancel",
      entity: "quick_sale",
      entity_id: s.id,
      description: `Quick sale cancelled: ${s.sale_number} (${inr(s.amount)})`,
    });
    refresh();
  }

  async function editSale(s: QuickSale) {
    const replaceCart = cart.length > 0
      ? window.confirm(`Your current cart has items. Replace them with the items of ${s.sale_number}?`)
      : true;
    if (!replaceCart) return;
    if (!window.confirm(`Edit ${s.sale_number} (${inr(s.amount)})?\n\nThe sale's items load into the cart and the original is cancelled — save again to record your changes.`)) {
      return;
    }

    const { data: lines, error: loadErr } = await supabase
      .from("quick_sale_items")
      .select("product_id, service_id, item_name, qty, rate, amount, cost")
      .eq("quick_sale_id", s.id)
      .order("created_at", { ascending: true });
    if (loadErr) {
      setError(loadErr.message);
      return;
    }
    if (!lines || lines.length === 0) {
      setError("This sale has no line items to load.");
      return;
    }

    const nextCart: CartLine[] = (lines as { product_id: string | null; service_id: string | null; item_name: string | null; qty: number; rate: number; amount: number; cost: number }[]).map((l) => {
      const prod = l.product_id ? products.find((p) => p.id === l.product_id) : null;
      const serv = l.service_id ? services.find((x) => x.id === l.service_id) : null;
      return {
        key: l.product_id ? `p-${l.product_id}` : l.service_id ? `s-${l.service_id}` : `c-${Date.now()}-${Math.random()}`,
        product_id: l.product_id,
        service_id: l.service_id,
        name: l.item_name ?? prod?.name ?? serv?.name ?? "Custom item",
        qty: Number(l.qty),
        rate: Number(l.rate),
        amount: Number(l.amount),
        cost: Number(l.cost) || 0,
      };
    });

    const pmts: PaymentRow[] = (s.payments ?? []).map((p) => ({
      instrument_id: p.instrument_id ?? "",
      method: p.method ?? "cash",
      amount: p.amount != null ? String(p.amount) : "",
    }));
    if (pmts.length === 0) {
      pmts.push({
        instrument_id: defaultInstrument?.id ?? "",
        method: defaultInstrument?.type ?? "cash",
        amount: "",
      });
    }

    const { error: cancelErr } = await supabase.rpc("cancel_quick_sale", { p_sale_id: s.id });
    if (cancelErr) {
      setError(cancelErr.message);
      return;
    }

    setCart(nextCart);
    setCustomerId(s.customer_id ?? "");
    setPayments(pmts);
    setRecentOpen(false);
    setError(null);
    logAudit({
      action: "cancel",
      entity: "quick_sale",
      entity_id: s.id,
      description: `Quick sale loaded for editing (original cancelled): ${s.sale_number}`,
    });
    refresh();
  }

  async function addInstrument() {
    const name = newInst.name.trim();
    if (!name) {
      setError("Enter the card / account name.");
      return;
    }
    setAddingInst(true);
    const { data, error: err } = await supabase
      .from("payment_instruments")
      .insert({ name, type: newInst.type, is_active: true })
      .select("id, name, type")
      .single();
    setAddingInst(false);
    if (err) {
      setError(err.message);
      return;
    }
    const row = data as PosInstrument;
    setInstrumentList((prev) => [...prev, row]);
    setMoPick({ instrument_id: row.id, method: row.type });
    setNewInst({ name: "", type: "cash" });
    setAddInstOpen(false);
    logAudit({
      action: "create",
      entity: "payment_instrument",
      entity_id: row.id,
      description: `Payment account added from POS: ${row.name}`,
    });
  }

  async function recordMoneyOut() {
    setError(null);
    const amt = Number(moAmount) || 0;
    if (amt <= 0) {
      setError("Enter the amount paid out.");
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    setMoBusy(true);
    const { error: err } = await supabase.rpc("add_expense", {
      p_expense_date: today,
      p_category: "Money Out",
      p_amount: Number(amt.toFixed(2)),
      p_note: moNote.trim() || null,
      p_instrument_id: moPick.instrument_id || null,
      p_method: moPick.instrument_id ? null : moPick.method,
    });
    setMoBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    logAudit({
      action: "create",
      entity: "expense",
      entity_id: null,
      description: `Money Out ${inr(amt)}`,
      details: { amount: amt, note: moNote.trim() || null },
    });
    setMoAmount("");
    setMoNote("");
    setShowMoneyOut(false);
    refresh();
  }

  // Shortcuts: Ctrl+K search, F1 recent, F2 search, F3 customer, F4 hold, F8 payment, F9 pay & print, Esc close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "Escape") {
        setRecentOpen(false);
        setRecallOpen(false);
        setShowMoneyOut(false);
        setCustomOpen(false);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "F1") {
        e.preventDefault();
        setRecentOpen((v) => !v);
      }
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "F3") {
        e.preventDefault();
        customerRef.current?.focus();
      }
      if (e.key === "F4") {
        e.preventDefault();
        holdCart();
      }
      if (e.key === "F8") {
        e.preventDefault();
        payRef.current?.focus();
      }
      if (e.key === "F9") {
        e.preventDefault();
        if (!busy && cart.length > 0) record(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const labelClass = "mb-1 block text-xs font-semibold text-slate-500";
  const payDisabled = busy || cart.length === 0;

  return (
    <div className="mt-5">
      {/* ── Compact today stats (no dashboard cards) ─────── */}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white px-4 py-2.5 text-xs text-slate-500 shadow-sm ring-1 ring-slate-200">
        <span className="font-semibold uppercase tracking-wide text-slate-400">Today</span>
        <span>
          {summary.count} order{summary.count === 1 ? "" : "s"}
        </span>
        <span className="text-slate-300">·</span>
        <span>
          <span className="font-semibold text-slate-700">{inr(summary.collected)}</span> collected
        </span>
        {canViewProfit && (
          <>
            <span className="text-slate-300">·</span>
            <span>
              <span className="font-semibold text-emerald-600">{inr(summary.profit)}</span> profit
            </span>
          </>
        )}
        <span className="text-slate-300">·</span>
        <span>avg {inr(summary.avg)}</span>
        {summary.byMethod.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {summary.byMethod.map(([name, amt]) => (
              <span key={name} className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                {name} <span className="font-semibold text-slate-800">{inr(amt)}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[200px_minmax(0,1fr)_400px]">
        {/* ── Categories ─────────────────────────────── */}
        <PosCategorySidebar
          categories={categories}
          totalCount={products.length + services.length}
          active={cat}
          onSelect={(id) => setCat(cat === id ? "all" : id)}
          onAddCustom={() => setCustomOpen(true)}
        />

        {/* ── Catalog ────────────────────────────────── */}
        <div className="min-w-0">
          <PosItemToolbar
            tabs={[
              { value: "services", label: "Services" },
              { value: "products", label: "Products" },
            ]}
            activeTab={tab}
            onTab={(t) => setTab(t as typeof tab)}
            searchRef={searchRef}
            placeholder="Search services, products…  (Ctrl+K)"
            q={q}
            onQ={setQ}
            sort={sort}
            onSort={(v) => setSort(v as typeof sort)}
            view={view}
            onView={switchView}
          />

          <PosCategoryChips
            categories={categories}
            totalCount={products.length + services.length}
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
            extraChips={
              tab === "services" ? (
                <button
                  onClick={() => setFavOnly((v) => !v)}
                  title="Show quick-sale favourites only"
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    favOnly ? "bg-amber-500 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="mr-1 inline h-3 w-3 -translate-y-px">
                    <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2l-6.1 3.4 1.4-6.8L2.2 9.1l6.9-.8L12 2z" />
                  </svg>
                  Favourites
                </button>
              ) : null
            }
          />

          {view === "grid" ? (
            <PosGrid items={filtered} isProduct={tab === "products"} onAdd={addLine} />
          ) : (
            <PosTable items={filtered} isProduct={tab === "products"} onAdd={addLine} />
          )}
        </div>

        {/* ── Current Sale ───────────────────────────── */}
        <div className="min-w-0">
          <div className="sticky top-6 flex max-h-[calc(100vh-4rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <div>
                <h2 className="font-semibold text-slate-900">Current Sale</h2>
                <p className="text-xs text-slate-400">
                  {itemCount} items · {inr(total)}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setRecallOpen(true)}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-blue-600 transition hover:bg-blue-50"
                  title="Recall held sale"
                >
                  Recall{held.length > 0 ? ` (${held.length})` : ""}
                </button>
                {cart.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="mb-3">
                <label className={labelClass}>Customer (F3)</label>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <CustomerSelector
                      customers={customers}
                      value={customerId}
                      onChange={setCustomerId}
                      onAddCustomer={() => setShowAddCustomer(true)}
                      searchRef={customerRef}
                    />
                  </div>
                  <button
                    onClick={() => setShowAddCustomer(true)}
                    className="shrink-0 rounded-lg bg-[#0f172a] px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
                    title="Add new customer"
                  >
                    + Add
                  </button>
                </div>
              </div>

              {cart.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
                      <path d="M6 2h12a1 1 0 0 1 1 1v18l-2.5-1.5L14 21l-2.5-1.5L9 21l-2.5-1.5L5 21V3a1 1 0 0 1 1-1Z" />
                    </svg>
                  </div>
                  <p className="text-sm text-slate-500">Your cart is empty</p>
                  <p className="text-xs text-slate-400">Tap services or products to add them</p>
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

              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-500">QUICK PAYMENT</label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setScanOpen(true)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-800"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                        <path d="M4 7V4h3M9 4h2M4 11v2M17 4h3v3M20 9v2M20 17v3h-3M15 20h-2M4 17v3h3M4 15v-2" />
                      </svg>
                      Scan
                    </button>
                    {payments.length < 3 && (
                      <button onClick={addPaymentRow} className="text-xs font-medium text-blue-600 hover:text-blue-800">
                        + Split payment
                      </button>
                    )}
                  </div>
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
                        instruments={instrumentList}
                        pick={p}
                        onChange={(pick) => setPaymentInstrument(i, pick)}
                        enabled={accountFilter}
                        className="w-36 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-500"
                      />
                      <input
                        ref={payments.length === 1 ? payRef : undefined}
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
                      <span className="font-medium text-amber-600">Insufficient amount — {inr(due)} due</span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 px-5 py-4">
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span>{inr(total)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                  <span className="font-semibold text-slate-900">TOTAL</span>
                  <span className="text-xl font-bold text-blue-600">{inr(total)}</span>
                </div>
                {paid > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>Received</span>
                    <span className="font-medium text-blue-600">{inr(paid)}</span>
                  </div>
                )}
                {change > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Change</span>
                    <span>− {inr(change)}</span>
                  </div>
                )}
                <div className={`flex justify-between ${due > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                  <span className="font-medium">Due</span>
                  <span className="font-semibold">{inr(due)}</span>
                </div>
              </div>

              {lastSale && lastSale.status === "active" && (
                <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-2.5 ring-1 ring-emerald-100">
                  <p className="text-sm font-semibold text-emerald-800">
                    {lastSale.sale_number} · {inr(Number(lastSale.amount))}
                  </p>
                  <div className="flex items-center gap-2">
                    <a
                      href={`/receipt/quick/${lastSale.id}`}
                      target="_blank"
                      className="text-xs font-semibold text-emerald-700 hover:underline"
                    >
                      Receipt
                    </a>
                    <button onClick={() => setLastSale(null)} className="text-xs font-medium text-emerald-700 hover:underline">
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={holdCart}
                  disabled={payDisabled}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Hold Sale
                </button>
                <button
                  onClick={() => setRecentOpen(true)}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Recent Sales (F1)
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setShowMoneyOut((v) => !v)}
                  className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    showMoneyOut ? "bg-rose-600 text-white" : "border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                  }`}
                >
                  Money Out
                </button>
                <button
                  onClick={() => record(false)}
                  disabled={payDisabled}
                  className="rounded-xl bg-[#0f172a] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ₹ Pay
                </button>
              </div>
              <button
                onClick={() => record(true)}
                disabled={payDisabled}
                className="mt-2 w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-3 text-sm font-semibold text-white shadow-md transition hover:from-blue-700 hover:to-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Completing sale…" : `Pay & Print · ${inr(total)} (F9)`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Money Out panel */}
      {showMoneyOut && (
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Money Out</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Paid out (recharge transfer, bill payment, settlement to bank/UPI/wallet…). Recorded in the cash book as an outgoing entry against the account.
              </p>
            </div>
            <button onClick={() => setShowMoneyOut(false)} className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              ✕
            </button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClass}>Pay from (account / card)</label>
              <InstrumentSelect
                instruments={instrumentList}
                pick={moPick}
                onChange={(pick) => {
                  if (pick) setMoPick(pick);
                  else setAddInstOpen(true);
                }}
                enabled={enabledMethods}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Amount (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={moAmount}
                onChange={(e) => setMoAmount(e.target.value)}
                placeholder="0.00"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Note</label>
              <input
                value={moNote}
                onChange={(e) => setMoNote(e.target.value)}
                placeholder="e.g. Airtel recharge, Electricity bill…"
                className={inputClass}
              />
            </div>
          </div>
          {addInstOpen && (
            <div className="mt-4 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <input
                  value={newInst.name}
                  onChange={(e) => setNewInst((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Account / card name"
                  className={inputClass}
                />
                <select value={newInst.type} onChange={(e) => setNewInst((p) => ({ ...p, type: e.target.value }))} className={inputClass}>
                  {INSTRUMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <button
                    onClick={addInstrument}
                    disabled={addingInst}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    {addingInst ? "Adding…" : "Add account"}
                  </button>
                  <button onClick={() => setAddInstOpen(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Deducts from{" "}
              <span className="font-semibold text-slate-600">
                {moPick.instrument_id ? instrumentName(instrumentList, moPick.instrument_id) : instrumentLabel(moPick.method)}
              </span>{" "}
              balance (In − Out = Balance)
            </p>
            <button
              onClick={recordMoneyOut}
              disabled={moBusy}
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
            >
              {moBusy ? "Recording…" : `Record Money Out · ${inr(Number(moAmount) || 0)}`}
            </button>
          </div>
        </div>
      )}

      {/* Recent sales modal */}
      {recentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/60 p-4 backdrop-blur-sm" onClick={() => setRecentOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Recent Quick Sales (Today)</h2>
              <button onClick={() => setRecentOpen(false)} className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                ✕
              </button>
            </div>
            {todayList.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">No quick sales recorded today yet.</p>
            ) : (
              <div className="mt-4 max-h-[55vh] space-y-2 overflow-y-auto">
                {todayList.slice(0, 30).map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {s.item_name ?? s.products?.name ?? s.services?.name ?? "Quick sale"} ·{" "}
                        <span className="font-bold">{inr(Number(s.amount))}</span>
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {s.sale_number} · {s.customers?.name ?? "Walk-in"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <a
                        href={`/receipt/quick/${s.id}`}
                        target="_blank"
                        className="rounded-md px-2 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-50"
                      >
                        Receipt
                      </a>
                      {s.status === "active" ? (
                        <>
                          <button
                            onClick={() => editSale(s)}
                            className="rounded-md px-2 py-1 text-[11px] font-medium text-amber-600 hover:bg-amber-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => cancelSale(s)}
                            className="rounded-md px-2 py-1 text-[11px] font-medium text-rose-500 hover:bg-rose-50"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-500">Cancelled</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-5 flex justify-end">
              <button onClick={() => setRecentOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Held list modal */}
      {recallOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/60 p-4 backdrop-blur-sm" onClick={() => setRecallOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-900">Held Sales</h2>
            <p className="mt-0.5 text-xs text-slate-500">Recalling a sale restores its items to the cart.</p>
            {held.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">No held sales.</p>
            ) : (
              <div className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto">
                {held
                  .slice()
                  .reverse()
                  .map((h) => (
                    <div key={h.savedAt} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">{inr(h.cart.reduce((s, l) => s + l.amount, 0))}</p>
                        <p className="truncate text-xs text-slate-400">
                          {h.cart.length} item{h.cart.length === 1 ? "" : "s"} · {new Date(h.savedAt).toLocaleString()}
                        </p>
                      </div>
                      <button onClick={() => recallHeld(h)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700">
                        Recall
                      </button>
                      <button onClick={() => discardHeld(h.savedAt)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-100">
                        Discard
                      </button>
                    </div>
                  ))}
              </div>
            )}
            <div className="mt-5 flex justify-end">
              <button onClick={() => setRecallOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom item modal */}
      {customOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/60 p-4 backdrop-blur-sm" onClick={() => setCustomOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-900">Add Custom Item</h2>
            <p className="mt-0.5 text-xs text-slate-500">A one-off item not in the catalog.</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className={labelClass}>Name *</label>
                <input autoFocus value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="e.g. Delivery charge…" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Price (₹) *</label>
                <input type="number" min="0" step="0.01" value={customRate} onChange={(e) => setCustomRate(e.target.value)} placeholder="0.00" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>
                  Cost price (₹) <span className="font-normal text-slate-400">— optional, used for income</span>
                </label>
                <input type="number" min="0" step="0.01" value={customCost} onChange={(e) => setCustomCost(e.target.value)} placeholder="0.00" className={inputClass} />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setCustomOpen(false)} className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={addCustomItem} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700">
                Add item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add customer modal */}
      {showAddCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/60 p-4 backdrop-blur-sm" onClick={() => setShowAddCustomer(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-900">Add Customer</h2>
            <p className="mt-0.5 text-xs text-slate-500">A new code is generated automatically and this customer gets selected.</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className={labelClass}>Name *</label>
                <input autoFocus value={qsNewCust.name} onChange={(e) => setQsNewCust((p) => ({ ...p, name: e.target.value }))} placeholder="Customer name" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Phone</label>
                <input value={qsNewCust.phone} onChange={(e) => setQsNewCust((p) => ({ ...p, phone: e.target.value }))} placeholder="Mobile number" className={inputClass} />
              </div>
              {qsDup && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-medium text-amber-800">Customer with this mobile number already exists.</p>
                  <p className="mt-0.5 text-xs text-amber-700">{qsDup.name} · {qsDup.phone ?? ""}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => { router.push(`/customers/${qsDup.id}`); setShowAddCustomer(false); setQsDup(null); }} className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-100">
                      View Customer
                    </button>
                    <button type="button" onClick={() => { setCustomerId(qsDup.id); setShowAddCustomer(false); setQsDup(null); setQsNewCust({ name: "", phone: "" }); }} className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-blue-700">
                      Use Existing Customer
                    </button>
                    <button type="button" onClick={() => setQsDup(null)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50">
                      Keep editing
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowAddCustomer(false)} className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={addQuickCustomer} disabled={addingCustomer} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50">
                {addingCustomer ? "Adding…" : "Add customer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shortcut bar */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-[#0f172a] px-4 py-2.5 text-[11px] font-medium text-slate-300">
        <span className="font-bold uppercase tracking-wide text-slate-500">Shortcuts</span>
        {[
          ["Ctrl+K", "Search"],
          ["F1", "Recent"],
          ["F3", "Customer"],
          ["F4", "Hold"],
          ["F8", "Payment"],
          ["F9", "Pay & Print"],
          ["Esc", "Close"],
        ].map(([k, label]) => (
          <span key={k} className="flex items-center gap-1">
            <kbd className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white">{k}</kbd>
            {label}
          </span>
        ))}
      </div>

      <ScanFillModal
        open={scanOpen}
        mode="payment"
        title="Scan Payment"
        onClose={() => setScanOpen(false)}
        onApply={applyPaymentScan}
      />
    </div>
  );
}