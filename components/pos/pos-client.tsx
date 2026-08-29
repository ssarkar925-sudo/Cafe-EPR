"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { useRealtime } from "@/lib/supabase/realtime";
import { logAudit } from "@/lib/audit";
import { findDuplicateCustomer, digitsOnly, isDuplicateKeyError } from "@/lib/customers";
import { DEFAULT_WA_TEMPLATES, getWhatsAppConfig, renderWhatsAppTemplate, sendWhatsAppMessage } from "@/lib/whatsapp";
import WhatsAppSendModal from "@/components/whatsapp/whatsapp-send-modal";
import ScanFillModal from "@/components/scan-fill/scan-fill-modal";
import Modal from "@/components/ui/modal";
import type { ScanFields } from "@/lib/scan/extract";
import QuickSaleModule, { type QuickSale } from "./quick-sale";
import InstrumentSelect, { INSTRUMENT_TYPES, METHOD_ACCOUNT_TYPES, instrumentLabel, type InstrumentPick } from "./instrument-select";
import { calculateGstInvoice } from "@/lib/gst";
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
  hsn_code?: string | null;
  gst_rate?: number | string | null;
  categories: { name: string } | null;
};

export type PosService = {
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

export type PosCustomer = {
  id: string;
  name: string;
  code: string | null;
  phone: string | null;
  balance: number | string;
  gstin?: string | null;
  state_code?: string | null;
};

export type PosInstrument = { id: string; name: string; type: string };

export type PosInvoice = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  customer_id: string | null;
  discount: number | string;
  total: number | string;
  status: string;
  customers: { name: string | null } | null;
  invoice_items: {
    product_id: string | null;
    service_id: string | null;
    description: string | null;
    qty: number | string;
    rate: number | string;
    amount: number | string;
  }[];
  payments: { method: string; instrument_id: string | null; amount: number | string }[];
};

export type CartLine = {
  key: string;
  product_id: string | null;
  service_id: string | null;
  name: string;
  qty: number;
  rate: number;
  amount: number;
  cost?: number;
  hsn_sac?: string | null;
  gst_rate?: number;
  tax_treatment?: string;
};

type SaleResult = {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  total: number;
  paid: number;
  due: number;
  status: string;
  invoice_date: string;
  created_at?: string;
  previous_due?: number;
  advance_used?: number;
  change?: number;
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
  } catch {}
}

export type PosTab = "services" | "products" | "all" | "favorites";

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
  todayInvoices = [],
  initialEditingInvoice = null,
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
  todayInvoices?: PosInvoice[];
  initialEditingInvoice?: PosInvoice | null;
}) {
  const supabase = createClient();
  const router = useRouter();

  const [mode, setMode] = useState<"invoice" | "quick">(initialMode);
  const [productState, setProductState] = useState(products);
  const [serviceState, setServiceState] = useState(services);
  const [tab, setTab] = useState<PosTab>("services");
  const [view, setView] = useState<"grid" | "list">(() => {
    try {
      return localStorage.getItem("sccomm-pos-view") === "grid" ? "grid" : "list";
    } catch {
      return "grid";
    }
  });
  const [favOnly, setFavOnly] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState<"name" | "low" | "high" | "stock">("name");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [custList, setCustList] = useState(customers);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ name: "", phone: "" });
  const [posDup, setPosDup] = useState<any>(null);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [discount, setDiscount] = useState("");
  const [payments, setPayments] = useState<{ instrument_id: string; method: string; amount: string }[]>([
    {
      instrument_id: instruments.find((i) => i.type === "cash")?.id ?? "",
      method: "cash",
      amount: "",
    },
  ]);
  const [printFormat, setPrintFormat] = useState<"a4" | "thermal">(() => {
    try {
      return localStorage.getItem("sccomm-pos-print-format") === "thermal" ? "thermal" : "a4";
    } catch {
      return "thermal";
    }
  });

  const [collectDue, setCollectDue] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [dueAmount, setDueAmount] = useState("");
  const [duePick, setDuePick] = useState<InstrumentPick>({
    instrument_id: instruments.find((i) => i.type === "cash")?.id ?? "",
    method: "cash",
  });
  const [useAdvance, setUseAdvance] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SaleResult | null>(null);
  const [waStatus, setWaStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [waModal, setWaModal] = useState<{
    open: boolean;
    phone: string;
    name: string;
    msg: string;
    invNum: string;
    refId: string;
  } | null>(null);

  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customRate, setCustomRate] = useState("");
  const [customCost, setCustomCost] = useState("");
  const [customSave, setCustomSave] = useState<"none" | "product" | "service">("none");

  const [recallOpen, setRecallOpen] = useState(false);
  const [heldBills, setHeldBills] = useState<HeldBill[]>([]);
  const [draftSaved, setDraftSaved] = useState(false);

  const [showMoneyOut, setShowMoneyOut] = useState(false);
  const [moPick, setMoPick] = useState<InstrumentPick>({
    instrument_id: instruments.find((i) => i.type === "cash")?.id ?? "",
    method: "cash",
  });
  const [moAmount, setMoAmount] = useState("");
  const [moNote, setMoNote] = useState("");
  const [moBusy, setMoBusy] = useState(false);

  const [addInstOpen, setAddInstOpen] = useState(false);
  const [newInst, setNewInst] = useState({ name: "", type: "cash" });
  const [addingInst, setAddingInst] = useState(false);
  const [instList, setInstList] = useState(instruments);

  const [showEditList, setShowEditList] = useState(false);
  const [editing, setEditing] = useState<PosInvoice | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const customerSearchRef = useRef<HTMLInputElement>(null);

  useRealtime(["products", "invoices", "payments", "customers", "invoice_items"]);

  useEffect(() => {
    setProductState(products);
    setServiceState(services);
    setCustList(customers);
  }, [products, services, customers]);

  useEffect(() => {
    function h(e: KeyboardEvent) {
      if (e.key === "F2") {
        e.preventDefault();
        setMode((m) => (m === "quick" ? "invoice" : "quick"));
      } else if (e.key === "F4") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "F9") {
        e.preventDefault();
        fillExact();
      }
    }
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => setHeldBills(loadHeld()), []);

  useEffect(() => {
    if (initialEditingInvoice) {
      setMode("invoice");
      loadInvoiceForEdit(initialEditingInvoice);
    }
  }, [initialEditingInvoice]);

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of productState)
      if (p.category_id && p.categories) map.set(p.category_id, (map.get(p.category_id) ?? 0) + 1);
    for (const s of serviceState)
      if (s.category_id && s.categories) map.set(s.category_id, (map.get(s.category_id) ?? 0) + 1);
    const names = new Map<string, string>();
    for (const p of productState) if (p.categories) names.set(p.category_id!, p.categories.name);
    for (const s of serviceState) if (s.categories) names.set(s.category_id!, s.categories.name);
    return Array.from(map.entries()).map(([id, count]) => ({ id, name: names.get(id) ?? "?", count }));
  }, [productState, serviceState]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const ss: BrowserItem[] = serviceState.map((s) => ({
      id: s.id,
      item_type: "service",
      name: s.name,
      sale_price: s.sale_price,
      category_id: s.category_id,
      categories: s.categories,
      is_quick_favorite: s.is_quick_favorite,
    }));
    const ps: BrowserItem[] = productState.map((p) => ({
      id: p.id,
      item_type: "product",
      name: p.name,
      code: p.code,
      sale_price: p.sale_price,
      stock_qty: p.stock_qty,
      reorder_level: p.reorder_level,
      unit: p.unit,
      category_id: p.category_id,
      categories: p.categories,
    }));

    let list: BrowserItem[] = needle
      ? [...ss, ...ps]
      : tab === "services"
      ? favOnly
        ? ss.filter((s) => s.is_quick_favorite)
        : ss
      : tab === "products"
      ? ps
      : tab === "favorites"
      ? ss.filter((s) => s.is_quick_favorite)
      : [...ss, ...ps];

    const out = list.filter((x) => {
      if (cat !== "all" && x.category_id !== cat) return false;
      if (!needle) return true;
      return (
        x.name.toLowerCase().includes(needle) ||
        (x.code ? String(x.code).toLowerCase().includes(needle) : false) ||
        (x.categories?.name ? x.categories.name.toLowerCase().includes(needle) : false)
      );
    });

    const sorted = [...out];
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "low") sorted.sort((a, b) => Number(a.sale_price) - Number(b.sale_price));
    else if (sort === "high") sorted.sort((a, b) => Number(b.sale_price) - Number(a.sale_price));
    else sorted.sort((a, b) => Number(b.stock_qty ?? 0) - Number(a.stock_qty ?? 0));
    return sorted;
  }, [tab, q, cat, sort, favOnly, serviceState, productState]);

  const subtotal = useMemo(() => cart.reduce((sum, l) => sum + l.amount, 0), [cart]);
  const discountNum = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const selectedCustomer = custList.find((c) => c.id === customerId);

  const gstPreview = useMemo(
    () =>
      calculateGstInvoice({
        lines: cart.map((l) => ({
          qty: l.qty,
          rate: l.rate,
          gstRate: l.gst_rate ?? 0,
          hsnSac: l.hsn_sac ?? null,
          taxTreatment: (l.tax_treatment as any) || ((l.gst_rate ?? 0) > 0 ? "taxable" : "non_gst"),
        })),
        invoiceLumpSumDiscount: discountNum,
        supplierStateCode: "19",
        customerStateCode: selectedCustomer?.state_code || null,
        customerGstin: selectedCustomer?.gstin || null,
      }),
    [cart, discountNum, selectedCustomer?.state_code, selectedCustomer?.gstin]
  );

  const total = gstPreview.invoiceTotal;
  const itemCount = useMemo(() => cart.reduce((s, l) => s + l.qty, 0), [cart]);
  const paid = useMemo(() => payments.reduce((s, p) => s + (Number(p.amount) || 0), 0), [payments]);
  const defaultInstrument = instruments.find((i) => i.type === "cash") ?? ({ id: "", name: "Cash", type: "cash" } as PosInstrument);

  const methodList = useMemo(() => {
    const all = Object.keys(METHOD_BTN);
    return enabledMethods && enabledMethods.length > 0 ? all.filter((m) => enabledMethods.includes(m)) : all;
  }, [enabledMethods]);

  const activeMethod = payments.length === 1 ? payments[0].method : "";
  const accountFilter = payments.length === 1 ? METHOD_ACCOUNT_TYPES[activeMethod] ?? enabledMethods : enabledMethods;

  function quickMethod(m: string) {
    const types = METHOD_ACCOUNT_TYPES[m] ?? [m];
    const first = types.map((t) => instruments.find((i) => i.type === t)).find(Boolean);
    const instId = first?.id ?? "";
    setPayments((prev) =>
      prev.length === 1 ? [{ instrument_id: instId, method: m, amount: prev[0].amount }] : [{ instrument_id: instId, method: m, amount: "" }]
    );
  }

  function applyPaymentScan(f: ScanFields) {
    if (f.method) quickMethod(f.method);
    if (f.amount) setPaymentAmount(0, f.amount);
  }

  const custBalance = selectedCustomer ? Number(selectedCustomer.balance) : 0;
  const hasDue = custBalance > 0;
  const hasAdvance = custBalance < 0;
  const dueCollection = collectDue && hasDue ? Math.min(Math.max(Number(dueAmount) || 0, 0), custBalance) : 0;
  const advanceUsed = useAdvance && hasAdvance ? Math.min(Math.max(Number(advanceAmount) || 0, 0), Math.abs(custBalance), total) : 0;
  const invoiceDue = Math.max(0, total - paid - advanceUsed);
  const change = Math.max(0, paid + advanceUsed - total);

  useEffect(() => {
    setCollectDue(false);
    setUseAdvance(false);
    setDueAmount("");
    setAdvanceAmount("");
  }, [customerId]);

  useEffect(() => {
    setPayments((prev) =>
      prev.length === 1 && (prev[0].amount === "" || Number(prev[0].amount) === 0)
        ? [
            {
              instrument_id: prev[0].instrument_id,
              method: prev[0].method,
              amount: Math.max(0, total - advanceUsed) > 0 ? String(Math.max(0, total - advanceUsed)) : "",
            },
          ]
        : prev
    );
  }, [total, advanceUsed]);

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
    const phone = digitsOnly(newCust.phone);
    if (phone) {
      let dup: null | { id: string; name: string } = null;
      try {
        dup = await findDuplicateCustomer(supabase, phone);
      } catch (e: any) {
        alert(e.message);
        return;
      }
      if (dup) {
        setPosDup(dup);
        return;
      }
    }
    setAddingCustomer(true);
    const { data, error } = await supabase
      .from("customers")
      .insert({ name, phone: phone || null, code: nextCustCode(), opening_balance: 0, balance: 0, is_active: true })
      .select("id,name,code,phone,balance")
      .single();
    setAddingCustomer(false);
    if (error) {
      alert(isDuplicateKeyError(error.message) ? "A customer with this phone number already exists." : error.message);
      return;
    }
    const row = data as PosCustomer;
    setCustList((prev) => [...prev, row]);
    setCustomerId(row.id);
    setShowAddCustomer(false);
    setNewCust({ name: "", phone: "" });
    logAudit({ action: "create", entity: "customer", entity_id: row.id, description: `Customer created from POS: ${row.name}` });
  }

  function stockOf(id: string) {
    const p = productState.find((x) => x.id === id);
    return p ? Number(p.stock_qty) : 0;
  }

  function addLine(id: string, name: string, rate: number, isProduct: boolean) {
    setError(null);
    const existing = cart.find((l) => l.product_id === (isProduct ? id : null) && l.service_id === (!isProduct ? id : null));
    if (existing) {
      const next = existing.qty + 1;
      if (isProduct && next > stockOf(id)) {
        setError(`Only ${stockOf(id)} in stock for ${name}`);
        return;
      }
      setCart((prev) => prev.map((l) => (l.key === existing.key ? { ...l, qty: next, amount: Number((next * l.rate).toFixed(2)) } : l)));
    } else {
      if (isProduct && stockOf(id) <= 0) {
        setError(`${name} is out of stock`);
        return;
      }
      const prod = isProduct ? productState.find((p) => p.id === id) : null;
      const serv = !isProduct ? serviceState.find((s) => s.id === id) : null;
      const gstRate = Number(prod?.gst_rate ?? serv?.gst_rate ?? 0);
      const hsnSac = prod?.hsn_code ?? serv?.sac_code ?? null;
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
          gst_rate: gstRate,
          hsn_sac: hsnSac,
          tax_treatment: gstRate > 0 ? "taxable" : "non_gst",
        },
      ]);
    }
  }

  function changeQty(key: string, qty: number) {
    setCart((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = Math.max(0, qty);
        if (l.product_id && next > stockOf(l.product_id)) return l;
        return { ...l, qty: next, amount: Number((next * l.rate).toFixed(2)) };
      })
    );
  }

  function changeRate(key: string, rate: number) {
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, rate: Math.max(0, rate), amount: Number((l.qty * Math.max(0, rate)).toFixed(2)) } : l)));
  }

  function removeLine(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key));
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
      .select("id,name,type")
      .single();
    setAddingInst(false);
    if (err) {
      setError(err.message);
      return;
    }
    const row = data as PosInstrument;
    setInstList((prev) => [...prev, row]);
    setMoPick({ instrument_id: row.id, method: row.type });
    setNewInst({ name: "", type: "cash" });
    setAddInstOpen(false);
    logAudit({ action: "create", entity: "payment_instrument", entity_id: row.id, description: `Payment account added from POS: ${row.name}` });
  }

  async function recordMoneyOut() {
    setError(null);
    const amt = Number(moAmount) || 0;
    if (amt <= 0) {
      setError("Enter the amount paid out.");
      return;
    }
    setMoBusy(true);
    const { error: err } = await supabase.rpc("add_expense", {
      p_expense_date: new Date().toISOString().slice(0, 10),
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
    logAudit({ action: "create", entity: "expense", entity_id: null, description: `Money Out ${inr(amt)}`, details: { amount: amt, note: moNote.trim() || null } });
    setMoAmount("");
    setMoNote("");
    setShowMoneyOut(false);
    setAddInstOpen(false);
  }

  async function addCustomItem() {
    const name = customName.trim();
    const rate = Number(customRate) || 0;
    const cost = Number(customCost) || 0;
    if (!name || rate <= 0) {
      setError("Enter a name and a valid price.");
      return;
    }
    setError(null);
    let product_id: string | null = null,
      service_id: string | null = null;
    if (customSave === "product") {
      let n = 0;
      for (const p of productState) {
        const num = parseInt(String(p.code ?? "").replace(/\D/g, ""), 10);
        if (!Number.isNaN(num)) n = Math.max(n, num);
      }
      const { data, error } = await supabase
        .from("products")
        .insert({ name, code: "PRD-" + String(n + 1).padStart(4, "0"), sale_price: rate, cost_price: Math.max(0, cost), stock_qty: 0, is_active: true })
        .select("id,code,name,sale_price,stock_qty,reorder_level,unit,category_id,categories(name)")
        .single();
      if (error) {
        setError(error.message);
        return;
      }
      product_id = data.id;
      setProductState((prev) => [{ ...(data as unknown as PosProduct) }, ...prev]);
    } else if (customSave === "service") {
      const { data, error } = await supabase
        .from("services")
        .insert({ name, sale_price: rate, cost_price: Math.max(0, cost), is_active: true })
        .select("id,name,sale_price,category_id,is_quick_favorite,quick_sort,categories(name)")
        .single();
      if (error) {
        setError(error.message);
        return;
      }
      service_id = data.id;
      setServiceState((prev) => [{ ...(data as unknown as PosService) }, ...prev]);
    }
    setCart((prev) => [...prev, { key: `c-${Date.now()}`, product_id, service_id, name, qty: 1, rate, amount: rate, cost: Math.max(0, cost) }]);
    setCustomName("");
    setCustomRate("");
    setCustomCost("");
    setCustomSave("none");
    setCustomOpen(false);
  }

  function holdCurrent(label = "Held") {
    if (cart.length === 0) return;
    const bill: HeldBill = { savedAt: new Date().toISOString(), label, cart, discount, customerId, payments, duePick, collectDue, dueAmount, useAdvance, advanceAmount };
    const next = [...loadHeld(), bill];
    saveHeld(next);
    setHeldBills(next);
    setCart([]);
    setCustomerId("");
    setDiscount("");
    setPayments([{ instrument_id: defaultInstrument.id, method: defaultInstrument.type, amount: "" }]);
    setCollectDue(false);
    setUseAdvance(false);
    setDueAmount("");
    setAdvanceAmount("");
    setDraftSaved(true);
    window.setTimeout(() => setDraftSaved(false), 2500);
  }

  function recallBill(b: HeldBill) {
    setCart(b.cart);
    setDiscount(b.discount);
    setCustomerId(b.customerId);
    setPayments(b.payments);
    setDuePick(b.duePick);
    setCollectDue(b.collectDue);
    setDueAmount(b.dueAmount);
    setUseAdvance(b.useAdvance);
    setAdvanceAmount(b.advanceAmount);
    const next = loadHeld().filter((x) => x.savedAt !== b.savedAt);
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
    setPayments((prev) => prev.map((x, j) => (j === i ? { ...x, method: pick.method, instrument_id: pick.instrument_id } : x)));
  }

  function setPaymentAmount(i: number, amount: string) {
    setPayments((prev) => prev.map((x, j) => (j === i ? { ...x, amount } : x)));
  }

  function fillExact() {
    setPayments((prev) => [{ instrument_id: prev[0].instrument_id, method: prev[0].method, amount: Math.max(0, total - advanceUsed).toFixed(2) }]);
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
    const saleDue = Math.max(0, Number(total.toFixed(2)) - Number(paid.toFixed(2)) - Number(advanceUsed.toFixed(2)));
    if (saleDue > 0 && !customerId) {
      setError("Please select a customer to mark this sale as partial/due.");
      return;
    }
    if (
      saleDue > 0 &&
      selectedCustomer &&
      Number((selectedCustomer as any).credit_limit || 0) > 0 &&
      Number(selectedCustomer.balance || 0) + saleDue > Number((selectedCustomer as any).credit_limit) &&
      !window.confirm("Credit limit exceeded. Proceed anyway?")
    )
      return;

    const dueAmt = Math.max(0, Number(total.toFixed(2)) - Number(advanceUsed.toFixed(2)));
    const rawPmts = payments.filter((p) => Number(p.amount) > 0).map((p) => ({ method: p.method, amount: Number(p.amount), instrument_id: p.instrument_id || null }));
    let pmts = rawPmts;
    let changeAmt = 0;
    const pmtSum = rawPmts.reduce((s, p) => s + p.amount, 0);
    if (pmtSum > dueAmt) {
      changeAmt = Number((pmtSum - dueAmt).toFixed(2));
      if (rawPmts.length === 1) pmts = [{ ...rawPmts[0], amount: dueAmt }];
      else {
        const factor = dueAmt / pmtSum;
        pmts = rawPmts.map((p) => ({ ...p, amount: Number((p.amount * factor).toFixed(2)) }));
        const scaled = pmts.reduce((s, p) => s + p.amount, 0);
        if (Math.abs(scaled - dueAmt) > 0.001) pmts[pmts.length - 1] = { ...pmts[pmts.length - 1], amount: Number((pmts[pmts.length - 1].amount + (dueAmt - scaled)).toFixed(2)) };
      }
    }

    setBusy(true);
    const gstCalc = gstPreview;
    const items = gstCalc.lines.map((l, idx) => ({
      product_id: cart[idx].product_id,
      service_id: cart[idx].service_id,
      description: cart[idx].name,
      qty: l.qty,
      rate: l.rate,
      amount: l.lineTotal,
      cost_price: cart[idx].product_id || cart[idx].service_id ? 0 : cart[idx].cost ?? 0,
      hsn_sac: l.hsnSac,
      taxable_value: l.taxableValue,
      gst_rate: l.gstRate,
      cgst_rate: l.cgstRate,
      cgst_amount: l.cgstAmount,
      sgst_rate: l.sgstRate,
      sgst_amount: l.sgstAmount,
      igst_rate: l.igstRate,
      igst_amount: l.igstAmount,
      tax_treatment: l.taxTreatment,
    }));

    const today = new Date().toISOString().slice(0, 10);
    let data: any = null;
    let error: { message: string } | null = null;

    if (editing) {
      const res = await supabase.rpc("edit_invoice", {
        p_invoice_id: editing.id,
        p_customer_id: customerId || null,
        p_invoice_date: today,
        p_subtotal: Number(subtotal.toFixed(2)),
        p_discount: discountNum,
        p_total: Number(total.toFixed(2)),
        p_payments: pmts,
        p_items: items,
        p_reason: "",
      });
      data = res.data;
      error = res.error as any;
    } else {
      const res = await supabase.rpc("create_sale", {
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
      data = res.data;
      error = res.error as any;
    }

    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }

    const decrement: Record<string, number> = {};
    for (const l of cart) if (l.product_id) decrement[l.product_id] = (decrement[l.product_id] ?? 0) + l.qty;
    setProductState((prev) => prev.map((p) => (decrement[p.id] ? { ...p, stock_qty: Math.max(0, Number(p.stock_qty) - decrement[p.id]) } : p)));

    const selCust = customers.find((c) => c.id === customerId);
    const saleRes: SaleResult = {
      ...(data as SaleResult),
      id: (data as any)?.id ?? (data as any)?.invoice_id,
      change: changeAmt,
      customer_name: selCust?.name ?? null,
      customer_phone: selCust?.phone ?? null,
    };
    setSuccess(saleRes);
    setWaStatus("idle");

    const waCfg = getWhatsAppConfig();
    if (waCfg.provider !== "off" && waCfg.auto_send_pos && selCust?.phone) handleSendInvoiceWhatsApp(saleRes);

    const editedNumber = editing?.invoice_number;
    setCart([]);
    setCustomerId("");
    setDiscount("");
    setPayments([{ instrument_id: defaultInstrument.id, method: defaultInstrument.type, amount: "" }]);
    setCollectDue(false);
    setUseAdvance(false);
    setDueAmount("");
    setAdvanceAmount("");
    setEditing(null);

    logAudit({
      action: editing ? "update" : "create",
      entity: "invoice",
      entity_id: saleRes.id ?? null,
      description: editing ? `Invoice edited (${editedNumber} -> ${saleRes.invoice_number}) ${inr(total)}` : `Sale created (${inr(total)})${customerId ? " for a customer" : ""}`,
      details: { invoice_number: saleRes.invoice_number ?? null, total: Number(total.toFixed(2)), ...(editing ? { old_invoice_number: editedNumber } : {}) },
    });

    if (print && saleRes.id) window.open(printFormat === "thermal" ? `/receipt/${saleRes.id}` : `/receipt/${saleRes.id}/a4`, "_blank", "noopener");
  }

  function handleSendInvoiceWhatsApp(s: SaleResult, manual = false) {
    const cfg = getWhatsAppConfig();
    const template = cfg.templates?.pos_invoice || DEFAULT_WA_TEMPLATES.pos_invoice;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const msg = renderWhatsAppTemplate(template, {
      shop_name: "Sarkar Communication",
      invoice_number: s.invoice_number,
      invoice_date: s.invoice_date,
      customer_name: s.customer_name || "Customer",
      customer_name_line: s.customer_name ? `👤 Customer: ${s.customer_name}\n` : "",
      total_amount: inr(s.total),
      paid_amount: inr(Number(s.paid) + Number(s.change ?? 0)),
      due_amount: inr(s.due),
      status_line: s.status === "paid" ? "✅ Fully Paid" : `⚠️ Balance Due: ${inr(s.due)}`,
      receipt_url: `${origin}/receipt/${s.id}/a4`,
    });
    if (manual) {
      setWaModal({ open: true, phone: s.customer_phone || "", name: s.customer_name || "Customer", msg, invNum: s.invoice_number, refId: s.id });
      return;
    }
    setWaStatus("sending");
    sendWhatsAppMessage({ phone: s.customer_phone || "", message: msg, recipientName: s.customer_name, messageType: "pos_invoice", refId: s.id, refNumber: s.invoice_number }).then((r) =>
      setWaStatus(r.ok ? "sent" : "idle")
    );
  }

  function loadInvoiceForEdit(inv: PosInvoice) {
    setCart(
      (inv.invoice_items ?? []).map((it, i) => ({
        key: it.product_id ? `p-${it.product_id}` : it.service_id ? `s-${it.service_id}` : `c-${i}`,
        product_id: it.product_id,
        service_id: it.service_id,
        name: it.description ?? "Item",
        qty: Number(it.qty) || 1,
        rate: Number(it.rate) || 0,
        amount: Number(it.amount) || 0,
      }))
    );
    setCustomerId(inv.customer_id || "");
    setDiscount(String(Number(inv.discount) || 0));
    const lp = (inv.payments ?? []).map((p) => {
      let instrument_id = p.instrument_id || "",
        method = p.method;
      if (!instrument_id) {
        const m = instruments.find((i) => i.type === p.method);
        instrument_id = m?.id ?? defaultInstrument.id;
        if (m) method = m.type;
      }
      return { instrument_id, method, amount: String(Number(p.amount) || 0) };
    });
    setPayments(lp.length ? lp : [{ instrument_id: defaultInstrument.id, method: defaultInstrument.type, amount: "" }]);
    setEditing(inv);
    setShowEditList(false);
  }

  const payDisabled = busy || cart.length === 0;

  return (
    <div className="mx-auto max-w-[1600px] px-3 py-4 lg:px-6">
      {/* 1. Tactical Operational Bar */}
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs dark:border-white/10 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-500/20">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
              <path d="M3 6h18" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-900 dark:text-white">
                {salesTodayCount} Sales Today
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
              {inr(salesTodayAmount)} Collected
            </p>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-slate-200/80 bg-slate-100/80 p-1 dark:border-white/10 dark:bg-white/5">
            {(["invoice", "quick"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-lg px-3.5 py-1 text-xs font-black transition ${
                  mode === m
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                {m === "invoice" ? "Standard Cart POS" : "Quick Fast-Sale"}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setRecallOpen(true);
              setHeldBills(loadHeld());
            }}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <span>Recall</span>
            {heldBills.length > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[9px] font-black text-white">
                {heldBills.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => holdCurrent()}
            disabled={!cart.length}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
          >
            Hold Bill
          </button>

          <button
            type="button"
            onClick={() => setShowMoneyOut((v) => !v)}
            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300"
          >
            Money Out
          </button>
        </div>
      </div>

      {/* 2. Sub-Modules */}
      {mode === "quick" ? (
        <QuickSaleModule
          products={products}
          services={services}
          customers={customers}
          instruments={instruments}
          initialToday={todayQuickSales}
          enabledMethods={enabledMethods}
          canViewProfit={canViewProfit}
        />
      ) : (
        <>
          {editing && (
            <div className="mb-4 flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
              <span>Editing Invoice: <b>{editing.invoice_number}</b></span>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="text-amber-700 underline hover:text-amber-900 dark:text-amber-400"
              >
                Cancel Edit
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)_420px]">
            {/* Left Category Navigation */}
            <PosCategorySidebar
              categories={categories}
              totalCount={productState.length + serviceState.length}
              active={cat}
              onSelect={(id) => setCat(cat === id ? "all" : id)}
              onAddCustom={() => setCustomOpen(true)}
            />

            {/* Center Items Browser */}
            <div className="min-w-0">
              <PosItemToolbar
                tabs={[
                  { value: "services", label: "Services" },
                  { value: "products", label: "Products" },
                  { value: "all", label: "All Items" },
                  { value: "favorites", label: "Favorites" },
                ]}
                activeTab={tab}
                onTab={(t) => {
                  setTab(t as PosTab);
                  setFavOnly(t === "favorites");
                }}
                searchRef={searchRef}
                placeholder="Search services, products… (F4 or Ctrl+K)"
                q={q}
                onQ={setQ}
                sort={sort}
                onSort={(v) => setSort(v as any)}
                view={view}
                onView={setView}
              />

              <PosCategoryChips
                categories={categories}
                totalCount={productState.length + serviceState.length}
                active={cat}
                onSelect={(id) => setCat(cat === id ? "all" : id)}
                customBtn={
                  <button
                    type="button"
                    onClick={() => setCustomOpen(true)}
                    className="shrink-0 rounded-full border border-dashed border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                  >
                    + Custom Item
                  </button>
                }
              />

              {view === "grid" ? (
                <PosGrid items={filtered} onAdd={addLine} />
              ) : (
                <PosTable items={filtered} onAdd={addLine} />
              )}
            </div>

            {/* Right Sticky Cart & Billing Drawer */}
            <div className="min-w-0">
              <div className="sticky top-20 flex max-h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-[22px] border border-slate-200/90 bg-white shadow-xs dark:border-white/10 dark:bg-slate-900">
                {/* Cart Drawer Header */}
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-white/5">
                  <div>
                    <h2 className="text-sm font-black text-slate-900 dark:text-white">Current Invoice</h2>
                    <p className="text-[11px] font-bold text-slate-400">
                      {itemCount} items · {inr(total)}
                    </p>
                  </div>
                  {cart.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCart([])}
                      className="text-[11px] font-extrabold text-rose-500 hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Cart Items & Customer */}
                <div className="flex-1 overflow-y-auto px-5 py-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <CustomerSelector
                    customers={custList}
                    value={customerId}
                    onChange={setCustomerId}
                    onAddCustomer={() => setShowAddCustomer(true)}
                    searchRef={customerSearchRef}
                  />

                  {/* Cart Line Items */}
                  <div className="mt-3.5 space-y-2">
                    {cart.map((l) => (
                      <div
                        key={l.key}
                        className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3 transition hover:border-slate-200 dark:border-white/5 dark:bg-white/[0.03]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-extrabold text-slate-900 dark:text-white line-clamp-1">
                            {l.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeLine(l.key)}
                            className="rounded-lg p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                          >
                            ✕
                          </button>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="flex items-center rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-800">
                            <button
                              type="button"
                              onClick={() => changeQty(l.key, l.qty - 1)}
                              className="px-2.5 py-1 text-xs font-black text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
                            >
                              −
                            </button>
                            <span className="w-7 text-center text-xs font-black text-slate-900 dark:text-white">
                              {l.qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => changeQty(l.key, l.qty + 1)}
                              className="px-2.5 py-1 text-xs font-black text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
                            >
                              +
                            </button>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-400">@</span>
                            <input
                              type="number"
                              value={l.rate}
                              onChange={(e) => changeRate(l.key, Number(e.target.value))}
                              className="w-16 rounded-lg border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs font-bold dark:border-white/10 dark:bg-slate-800 dark:text-white"
                            />
                          </div>
                          <span className="text-xs font-black text-slate-900 dark:text-white">
                            {inr(l.amount)}
                          </span>
                        </div>
                      </div>
                    ))}

                    {cart.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">
                        Cart is empty. Tap any service or product to add.
                      </div>
                    )}
                  </div>

                  {/* Discount & Quick Presets */}
                  <div className="mt-4 space-y-3 border-t border-slate-100 pt-3 dark:border-white/5">
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                          Discount (₹)
                        </label>
                        <button
                          type="button"
                          onClick={fillExact}
                          className="text-[10px] font-black text-blue-600 dark:text-blue-400"
                        >
                          Exact Amount [F9]
                        </button>
                      </div>
                      <input
                        type="number"
                        value={discount}
                        onChange={(e) => setDiscount(e.target.value)}
                        placeholder="0.00"
                        className={inputClass}
                      />
                    </div>

                    {/* Quick Payment Tender Grid */}
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Payment Tender
                      </label>
                      <div className="mt-1 grid grid-cols-3 gap-1.5">
                        {methodList.slice(0, 6).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => quickMethod(m)}
                            className={`rounded-xl py-2 text-xs font-extrabold transition ${
                              activeMethod === m ? METHOD_BTN[m]?.active : METHOD_BTN[m]?.idle
                            }`}
                          >
                            {METHOD_BTN[m]?.label || m}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Payment Row */}
                    {payments.map((p, i) => (
                      <div key={i} className="flex gap-2">
                        <InstrumentSelect
                          instruments={instruments}
                          pick={p}
                          onChange={(x) => setPaymentInstrument(i, x)}
                          enabled={accountFilter}
                          className="w-36"
                        />
                        <input
                          type="number"
                          value={p.amount}
                          onChange={(e) => setPaymentAmount(i, e.target.value)}
                          placeholder="Amount"
                          className={inputClass}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cart Drawer Summary & Checkout Actions */}
                <div className="border-t border-slate-100 bg-slate-50/50 p-4 dark:border-white/5 dark:bg-white/[0.02]">
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-500 dark:text-slate-400">
                      <span>Subtotal</span>
                      <span className="font-bold text-slate-900 dark:text-white">{inr(subtotal)}</span>
                    </div>
                    {discountNum > 0 && (
                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                        <span>Discount</span>
                        <span className="font-bold">−{inr(discountNum)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-500 dark:text-slate-400">
                      <span>GST Tax</span>
                      <span className="font-bold text-slate-900 dark:text-white">{inr(gstPreview.totalTax)}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-black text-slate-900 dark:border-white/10 dark:text-white">
                      <span>GRAND TOTAL</span>
                      <span className="text-blue-600 dark:text-blue-400">{inr(total)}</span>
                    </div>
                    {invoiceDue > 0 && (
                      <div className="flex justify-between text-rose-600 dark:text-rose-400 font-bold">
                        <span>Balance Due</span>
                        <span>{inr(invoiceDue)}</span>
                      </div>
                    )}
                    {change > 0 && (
                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                        <span>Change to Return</span>
                        <span>{inr(change)}</span>
                      </div>
                    )}
                  </div>

                  {error && (
                    <div className="mt-2.5 rounded-xl bg-rose-50 p-2 text-xs font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                      {error}
                    </div>
                  )}

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => holdCurrent("Draft")}
                      disabled={payDisabled}
                      className="rounded-xl border border-slate-200 bg-white py-2 text-xs font-extrabold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
                    >
                      Save Draft
                    </button>
                    <button
                      type="button"
                      onClick={() => completeSale(false)}
                      disabled={payDisabled}
                      className="rounded-xl bg-slate-900 py-2 text-xs font-extrabold text-white shadow-xs transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900"
                    >
                      ₹ Settle Only
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => completeSale(true)}
                    disabled={payDisabled}
                    className="btn-3d-tactile-primary mt-2.5 flex w-full items-center justify-center gap-2 py-3.5 text-xs font-black disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span>⚡ Pay &amp; Print Thermal Receipt [Enter]</span>
                    <span>·</span>
                    <span>{inr(total)}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Popups & Modals */}
      {showAddCustomer && (
        <Modal
          onClose={() => setShowAddCustomer(false)}
          title="Create New Customer"
          subtitle="Quick register a customer profile for billing & ledger"
          accent="blue"
        >
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400">Full Name</label>
              <input
                autoFocus
                value={newCust.name}
                onChange={(e) => setNewCust((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Ramesh Roy"
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400">Mobile Number</label>
              <input
                value={newCust.phone}
                onChange={(e) => setNewCust((p) => ({ ...p, phone: e.target.value }))}
                placeholder="10-digit mobile"
                className={inputClass}
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={addCustomer}
                disabled={addingCustomer}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
              >
                {addingCustomer ? "Creating…" : "Save Customer"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {customOpen && (
        <Modal
          onClose={() => setCustomOpen(false)}
          title="Add Custom Item"
          subtitle="Add an unlisted service or product directly to cart"
          accent="blue"
        >
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400">Item Title</label>
              <input
                autoFocus
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Urgent Color Print"
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400">Selling Price (₹)</label>
                <input
                  type="number"
                  value={customRate}
                  onChange={(e) => setCustomRate(e.target.value)}
                  placeholder="0.00"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400">Cost Price (₹)</label>
                <input
                  type="number"
                  value={customCost}
                  onChange={(e) => setCustomCost(e.target.value)}
                  placeholder="0.00"
                  className={inputClass}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={addCustomItem}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
              >
                Add to Cart
              </button>
            </div>
          </div>
        </Modal>
      )}

      {recallOpen && (
        <Modal
          onClose={() => setRecallOpen(false)}
          title="Held Bills & Drafts"
          subtitle="Resume a previously suspended checkout"
          accent="amber"
          size="lg"
        >
          <div className="space-y-2">
            {heldBills.map((b) => (
              <div
                key={b.savedAt}
                className="flex items-center justify-between rounded-xl border border-slate-200 p-3 dark:border-white/10"
              >
                <div>
                  <p className="text-xs font-black text-slate-900 dark:text-white">{b.label}</p>
                  <p className="text-[10px] text-slate-400">
                    {b.cart.length} items · Saved {new Date(b.savedAt).toLocaleTimeString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => recallBill(b)}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700"
                  >
                    Resume
                  </button>
                  <button
                    type="button"
                    onClick={() => discardHeld(b.savedAt)}
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                  >
                    Discard
                  </button>
                </div>
              </div>
            ))}
            {heldBills.length === 0 && (
              <p className="py-6 text-center text-xs text-slate-400">No held bills found.</p>
            )}
          </div>
        </Modal>
      )}

      {success && (
        <Modal
          onClose={() => setSuccess(null)}
          title="Sale Completed Successfully"
          subtitle={`Invoice #${success.invoice_number}`}
          accent="emerald"
        >
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-8 w-8">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{inr(success.total)}</p>
              {success.change ? (
                <p className="text-xs font-bold text-emerald-600">Change Returned: {inr(success.change)}</p>
              ) : null}
            </div>
            <div className="flex justify-center gap-2 border-t border-slate-100 pt-3">
              <a
                href={printFormat === "thermal" ? `/receipt/${success.id}` : `/receipt/${success.id}/a4`}
                target="_blank"
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
              >
                Print Receipt
              </a>
              <button
                type="button"
                onClick={() => setSuccess(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:text-white"
              >
                Next Customer [Enter]
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showMoneyOut && (
        <Modal
          onClose={() => {
            setShowMoneyOut(false);
            setAddInstOpen(false);
          }}
          title="Money Out / Direct Expense"
          subtitle="Record cash drawer payout or shop expense"
          accent="rose"
        >
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400">Payout Account</label>
              <InstrumentSelect
                instruments={instList}
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
              <label className="text-[10px] font-black uppercase text-slate-400">Amount (₹)</label>
              <input
                type="number"
                value={moAmount}
                onChange={(e) => setMoAmount(e.target.value)}
                placeholder="0.00"
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400">Note / Purpose</label>
              <input
                value={moNote}
                onChange={(e) => setMoNote(e.target.value)}
                placeholder="e.g. Courier charges, Tea &amp; snacks"
                className={inputClass}
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={recordMoneyOut}
                disabled={moBusy}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700"
              >
                {moBusy ? "Recording…" : "Save Money Out"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {waModal && (
        <WhatsAppSendModal
          open
          onClose={() => setWaModal(null)}
          phone={waModal.phone}
          recipientName={waModal.name}
          initialMessage={waModal.msg}
          messageType="pos_invoice"
          refId={waModal.refId}
          refNumber={waModal.invNum}
        />
      )}
    </div>
  );
}