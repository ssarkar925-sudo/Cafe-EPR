"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { useRealtime } from "@/lib/supabase/realtime";
import { logAudit } from "@/lib/audit";
import { findDuplicateCustomer, digitsOnly, isDuplicateKeyError } from "@/lib/customers";
import ScanFillModal from "@/components/scan-fill/scan-fill-modal";
import { showToast } from "@/components/ui/use-toast";
import type { ScanFields } from "@/lib/scan/extract";
import type { PosProduct, PosService, PosCustomer, PosInstrument, CartLine } from "./pos-client";
import { getWhatsAppConfig, sendWhatsAppMessage } from "@/lib/whatsapp";
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
  customers: { name: string; phone?: string | null } | null;
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
      instrument_id: instrumentList.find((i) => i.type === "cash")?.id ?? "",
      method: "cash",
      amount: "",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [lastSale, setLastSale] = useState<QuickSale | null>(null);
  const [waStatus, setWaStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [waModalSale, setWaModalSale] = useState<QuickSale | null>(null);
  const [waCustomPhone, setWaCustomPhone] = useState("");
  const [recentOpen, setRecentOpen] = useState(false);
  const [recentQ, setRecentQ] = useState("");
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
    instrument_id: instrumentList.find((i) => i.type === "cash")?.id ?? "",
    method: "cash",
  });
  const [moAmount, setMoAmount] = useState("");
  const [moNote, setMoNote] = useState("");
  const [moBusy, setMoBusy] = useState(false);

  const [addInstOpen, setAddInstOpen] = useState(false);
  const [newInst, setNewInst] = useState({ name: "", type: "cash" });
  const [addingInst, setAddingInst] = useState(false);

  const defaultInstrument = instrumentList.find((i) => i.type === "cash") ?? ({ id: "", name: "Cash", type: "cash" } as PosInstrument);

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
    if (enabledMethods && enabledMethods.length > 0) return all.filter((m) => m === "khata" || enabledMethods.includes(m));
    return all;
  }, [enabledMethods]);

  const activeMethod = payments.length === 1 ? payments[0].method : "";
  const accountFilter = payments.length === 1 ? METHOD_ACCOUNT_TYPES[activeMethod] ?? enabledMethods : enabledMethods;

  function quickMethod(m: string) {
    if (m === "khata") {
      setPayments([{ instrument_id: "", method: "khata", amount: "0" }]);
      return;
    }
    const types = METHOD_ACCOUNT_TYPES[m] ?? [m];
    const first = types.map((t) => instrumentList.find((i) => i.type === t)).find(Boolean);
    const instId = first?.id ?? "";
    setPayments((prev) => {
      const amt = prev.length === 1 ? prev[0].amount : (total > 0 ? String(total.toFixed(2)) : "");
      return [{ instrument_id: instId, method: m, amount: amt }];
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
        "id, sale_number, sale_date, customer_id, product_id, service_id, item_name, amount, cost, tendered, change_due, payments, status, created_at, customers(name, phone), products(name), services(name)"
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
    const phone = digitsOnly(qsNewCust.phone);
    if (phone) {
      let dup: { id: string; name: string } | null = null;
      try {
        dup = await findDuplicateCustomer(supabase, phone);
      } catch (e: any) {
        setError(e.message);
        return;
      }
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
      setError(isDuplicateKeyError(error.message) ? "A customer with this phone number already exists." : error.message);
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
    if (busy) return;
    setError(null);
    if (cart.length === 0) {
      setError("Add an item to the sale first.");
      return;
    }
    if (paid <= 0 && activeMethod !== "khata") {
      setError("Enter the amount received.");
      return;
    }
    const isPartial = paid < total - 0.01;
    if (paid > total + 0.01 && !singleCash) {
      setError(`Payments (${inr(paid)}) cannot exceed the sale amount (${inr(total)}).`);
      return;
    }
    if (isPartial && !customerId) {
      setError("Please select a customer to record partial payment / balance due.");
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    let pmts: { method: string; amount: number; instrument_id: string | null }[];
    let tendered: number | null = null;
    if (singleCash && !isPartial) {
      pmts = [
        { method: "cash", amount: Number(Math.min(paid, total).toFixed(2)), instrument_id: payments[0].instrument_id || null },
      ];
      tendered = Number(payments[0].amount) || null;
    } else {
      pmts = payments
        .filter((p) => Number(p.amount) > 0)
        .map((p) => ({ method: p.method, amount: Number(p.amount), instrument_id: p.instrument_id || null }));
      if (singleCash && isPartial) {
        tendered = paid;
      }
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

    let sale: QuickSale;
    const custObj = customers.find((c) => c.id === customerId);

    if (isPartial) {
      const saleItems = cart.map((l) => ({
        product_id: l.product_id || null,
        service_id: l.service_id || null,
        description: l.name,
        qty: l.qty,
        rate: l.rate,
        amount: Number((l.qty * l.rate).toFixed(2)),
        cost_price: l.product_id || l.service_id ? 0 : l.cost ?? 0,
      }));
      const { data: invData, error: invErr } = await supabase.rpc("create_sale", {
        p_customer_id: customerId,
        p_invoice_date: today,
        p_subtotal: Number(total.toFixed(2)),
        p_discount: 0,
        p_total: Number(total.toFixed(2)),
        p_payments: pmts,
        p_items: saleItems,
      });
      setBusy(false);
      if (invErr) {
        setError(invErr.message);
        showToast("error", invErr.message || "Sale failed");
        return;
      }
      sale = {
        id: (invData as any)?.invoice_id || (invData as any)?.id || "",
        sale_number: (invData as any)?.invoice_number || "QS-DUE",
        sale_date: today,
        customer_id: customerId,
        product_id: null,
        service_id: null,
        item_name: cart.map((c) => `${c.name} (${c.qty})`).join(", "),
        amount: total,
        cost: items.reduce((s, it) => s + it.cost_price * it.qty, 0),
        tendered: paid,
        change_due: 0,
        payments: pmts,
        status: "active",
        created_at: new Date().toISOString(),
        customers: custObj ? { name: custObj.name, phone: custObj.phone } : null,
        products: null,
        services: null,
      };
      showToast(
        "success",
        `Partial sale recorded! ${inr(paid)} received, ${inr(total - paid)} added to ${custObj?.name || "customer"}'s Khata.`
      );
    } else {
      const idempotencyKey =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
      try {
        const response = await fetch("/api/pos/quick-sale", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            p_sale_date: today,
            p_amount: 0,
            p_cost: 0,
            p_customer_id: customerId || null,
            p_tendered: tendered,
            p_payments: pmts,
            p_items: items,
            p_idempotency_key: idempotencyKey,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        setBusy(false);
        if (!response.ok) {
          const message = payload?.error || `Quick sale failed (HTTP ${response.status}).`;
          setError(message);
          showToast("error", message);
          return;
        }
        sale = payload as QuickSale;
      } catch (requestError: any) {
        setBusy(false);
        const message = requestError?.message || "Unable to reach the Quick Sale service.";
        setError(message);
        showToast("error", message);
        return;
      }
      if (custObj?.phone) {
        sale.customers = { name: custObj.name, phone: custObj.phone };
      }
    }

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
      entity_id: sale.id ?? null,
      description: `Quick sale ${inr(total)} (${itemCount} item${itemCount === 1 ? "" : "s"})`,
      details: { sale_number: sale.sale_number ?? null, amount: Number(total.toFixed(2)) },
    });

    if (print) {
      setTimeout(() => window.print(), 100);
    }
    await refresh();
  }

  // The rest of the component remains unchanged.
