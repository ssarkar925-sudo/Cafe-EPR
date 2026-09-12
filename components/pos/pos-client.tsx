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
import Modal from "@/components/ui/modal";
import { showToast } from "@/components/ui/use-toast";
import InstrumentSelect, { METHOD_ACCOUNT_TYPES, type InstrumentPick } from "./instrument-select";
import { calculateGstInvoice } from "@/lib/gst";
import {
  ShoppingBag,
  Zap,
  BookmarkCheck,
  RotateCcw,
  Printer,
  FileText,
  Plus,
  Minus,
  Trash2,
  Check,
  Search,
  X,
  Star,
  ReceiptText,
  ArrowRight,
  Split,
} from "lucide-react";
import {
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
};

const HELD_KEY = "pos_held_bills_v2";
const STARRED_KEY = "pos_starred_items_v2";

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

function loadStarred(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STARRED_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveStarred(keys: string[]) {
  try {
    localStorage.setItem(STARRED_KEY, JSON.stringify(keys));
  } catch {}
}

export type PosTab = "all" | "services" | "products" | "favorites";

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
  todayQuickSales?: any[];
  enabledMethods?: string[];
  canViewProfit?: boolean;
  todayInvoices?: PosInvoice[];
  initialEditingInvoice?: PosInvoice | null;
}) {
  const supabase = createClient();
  const router = useRouter();

  const defaultInstrument = useMemo(
    () =>
      instruments.find((i) => i.type === "cash") ??
      instruments[0] ??
      ({ id: "", name: "Cash", type: "cash" } as PosInstrument),
    [instruments]
  );

  const [productState, setProductState] = useState(products);
  const [serviceState, setServiceState] = useState(services);
  const [custList, setCustList] = useState(customers);
  const [starredKeys, setStarredKeys] = useState<string[]>(loadStarred);

  // Requirement 2: List view must be the default
  const [view, setView] = useState<"grid" | "list">(() => {
    try {
      const saved = localStorage.getItem("sccomm-pos-view");
      return saved === "grid" ? "grid" : "list";
    } catch {
      return "list";
    }
  });

  const [tab, setTab] = useState<PosTab>("all");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState<"name" | "low" | "high" | "stock">("name");

  // Cart & customer in bill (Requirement 7)
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ name: "", phone: "" });
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [discount, setDiscount] = useState("");

  // Payment UI state (Requirements 5 & 6)
  const [isSplit, setIsSplit] = useState(false);
  const [primaryMethod, setPrimaryMethod] = useState("cash");
  const [payments, setPayments] = useState<{ instrument_id: string; method: string; amount: string }[]>([
    {
      instrument_id: defaultInstrument.id,
      method: defaultInstrument.type,
      amount: "",
    },
  ]);

  const [printFormat, setPrintFormat] = useState<"a4" | "thermal">(() => {
    try {
      return localStorage.getItem("sccomm-pos-print-format") === "a4" ? "a4" : "thermal";
    } catch {
      return "thermal";
    }
  });

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
  const [customGstRate, setCustomGstRate] = useState("0");

  const [recallOpen, setRecallOpen] = useState(false);
  const [heldBills, setHeldBills] = useState<HeldBill[]>([]);

  const [editing, setEditing] = useState<PosInvoice | null>(null);

  const [highlightedCartKey, setHighlightedCartKey] = useState<string | null>(null);
  const highlightTimerRef = useRef<NodeJS.Timeout | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const customerSearchRef = useRef<HTMLInputElement>(null);

  useRealtime(["products", "invoices", "payments", "customers", "invoice_items"]);

  useEffect(() => {
    setProductState(products);
    setServiceState(services);
    setCustList(customers);
  }, [products, services, customers]);

  useEffect(() => {
    saveStarred(starredKeys);
  }, [starredKeys]);

  useEffect(() => {
    try {
      localStorage.setItem("sccomm-pos-view", view);
    } catch {}
  }, [view]);

  // Keyboard shortcut invariants (F2, F4, Ctrl+K, F9, Enter, Escape)
  useEffect(() => {
    function h(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "F2") {
        e.preventDefault();
        // F2 switches to Fast / Favorites tab
        setTab((t) => (t === "favorites" ? "all" : "favorites"));
        setCat("all");
      } else if (e.key === "F3") {
        e.preventDefault();
        customerSearchRef.current?.focus();
      } else if (e.key === "F4") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "F9") {
        e.preventDefault();
        fillExact();
      } else if (e.key === "Enter" && !e.shiftKey && !customOpen && !showAddCustomer && !recallOpen) {
        // If success modal is open, Enter triggers Next Customer
        if (success) {
          e.preventDefault();
          setSuccess(null);
        }
      } else if (e.key === "Escape") {
        setCustomOpen(false);
        setShowAddCustomer(false);
        setRecallOpen(false);
        setSuccess(null);
      }
    }
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [customOpen, showAddCustomer, recallOpen, success]);

  useEffect(() => setHeldBills(loadHeld()), []);

  useEffect(() => {
    if (initialEditingInvoice) {
      loadInvoiceForEdit(initialEditingInvoice);
    }
  }, [initialEditingInvoice]);

  const triggerCartHighlight = (key: string) => {
    setHighlightedCartKey(key);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedCartKey(null);
    }, 1000);

    setTimeout(() => {
      if (typeof document !== "undefined") {
        const el = document.querySelector(`[data-cart-item-key="${key}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 50);
  };

  const toggleStar = (id: string, isProduct: boolean) => {
    const key = `${isProduct ? "p" : "s"}-${id}`;
    setStarredKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  // Requirement 1: Dynamic categories for top chips
  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of productState)
      if (p.category_id && p.categories) map.set(p.category_id, (map.get(p.category_id) ?? 0) + 1);
    for (const s of serviceState)
      if (s.category_id && s.categories) map.set(s.category_id, (map.get(s.category_id) ?? 0) + 1);
    const names = new Map<string, string>();
    for (const p of productState) if (p.categories) names.set(p.category_id!, p.categories.name);
    for (const s of serviceState) if (s.categories) names.set(s.category_id!, s.categories.name);
    return Array.from(map.entries())
      .map(([id, count]) => ({ id, name: names.get(id) ?? "Uncategorized", count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [productState, serviceState]);

  // Requirement 3: Unified Fast/Favorites
  const allItems = useMemo<BrowserItem[]>(() => {
    const starredSet = new Set(starredKeys);
    const ss: BrowserItem[] = serviceState.map((s) => ({
      id: s.id,
      item_type: "service",
      name: s.name,
      sale_price: s.sale_price,
      category_id: s.category_id,
      categories: s.categories,
      is_quick_favorite: s.is_quick_favorite,
      favorite: starredSet.has(`s-${s.id}`) || Boolean(s.is_quick_favorite),
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
      favorite: starredSet.has(`p-${p.id}`),
    }));
    return [...ss, ...ps];
  }, [serviceState, productState, starredKeys]);

  const favoritesCount = useMemo(
    () => allItems.filter((i) => i.favorite).length,
    [allItems]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = allItems;

    // Filter by tab
    if (tab === "services") list = list.filter((x) => x.item_type === "service");
    else if (tab === "products") list = list.filter((x) => x.item_type === "product");
    else if (tab === "favorites") list = list.filter((x) => x.favorite);

    // Filter by category
    if (cat === "favorites") {
      list = list.filter((x) => x.favorite);
    } else if (cat !== "all") {
      list = list.filter((x) => x.category_id === cat);
    }

    // Filter by search query
    if (needle) {
      list = list.filter((x) =>
        x.name.toLowerCase().includes(needle) ||
        (x.code ? String(x.code).toLowerCase().includes(needle) : false) ||
        (x.categories?.name ? x.categories.name.toLowerCase().includes(needle) : false)
      );
    }

    const sorted = [...list];
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "low") sorted.sort((a, b) => Number(a.sale_price) - Number(b.sale_price));
    else if (sort === "high") sorted.sort((a, b) => Number(b.sale_price) - Number(a.sale_price));
    else sorted.sort((a, b) => Number(b.stock_qty ?? 0) - Number(a.stock_qty ?? 0));

    return sorted;
  }, [allItems, tab, cat, q, sort]);

  // Cart calculations
  const subtotal = useMemo(() => cart.reduce((sum, l) => sum + l.amount, 0), [cart]);
  const discountNum = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const selectedCustomer = custList.find((c) => c.id === customerId);

  // Requirement 9: GST calculation
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

  const methodList = useMemo(() => {
    const defaultMethods = ["cash", "upi", "card", "khata"];
    if (enabledMethods && enabledMethods.length > 0) {
      const allowed = new Set([...enabledMethods, "khata"]);
      return defaultMethods.filter((m) => allowed.has(m));
    }
    return defaultMethods;
  }, [enabledMethods]);

  // Sync payment amounts with total when in single payment mode
  useEffect(() => {
    if (!isSplit) {
      if (primaryMethod === "khata") {
        setPayments([{ instrument_id: "", method: "khata", amount: "0" }]);
      } else {
        const types = METHOD_ACCOUNT_TYPES[primaryMethod] ?? [primaryMethod];
        const matchedInst = types.map((t) => instruments.find((i) => i.type === t)).find(Boolean);
        const instId = matchedInst?.id ?? defaultInstrument.id;
        setPayments([
          {
            instrument_id: instId,
            method: primaryMethod,
            amount: total > 0 ? String(total.toFixed(2)) : "",
          },
        ]);
      }
    }
  }, [total, isSplit, primaryMethod, instruments, defaultInstrument]);

  const custBalance = selectedCustomer ? Number(selectedCustomer.balance) : 0;
  const invoiceDue = Math.max(0, total - paid);
  const change = primaryMethod === "cash" && !isSplit ? Math.max(0, paid - total) : 0;

  function setSingleMethod(m: string) {
    setPrimaryMethod(m);
    setIsSplit(false);
    if (m === "khata") {
      setPayments([{ instrument_id: "", method: "khata", amount: "0" }]);
    } else {
      const types = METHOD_ACCOUNT_TYPES[m] ?? [m];
      const matched = types.map((t) => instruments.find((i) => i.type === t)).find(Boolean);
      setPayments([
        {
          instrument_id: matched?.id ?? defaultInstrument.id,
          method: m,
          amount: total > 0 ? String(total.toFixed(2)) : "",
        },
      ]);
    }
  }

  function addSplitPaymentRow() {
    const nextInst =
      instruments.find((i) => !payments.some((p) => p.instrument_id === i.id)) ??
      defaultInstrument;
    const remaining = Math.max(0, total - paid);
    setPayments((prev) => [
      ...prev,
      {
        instrument_id: nextInst.id,
        method: nextInst.type === "upi_qr" ? "upi" : nextInst.type,
        amount: remaining > 0 ? String(remaining.toFixed(2)) : "",
      },
    ]);
  }

  function updateSplitRow(index: number, field: "instrument_id" | "amount", val: string) {
    setPayments((prev) =>
      prev.map((row, idx) => {
        if (idx !== index) return row;
        if (field === "instrument_id") {
          const inst = instruments.find((i) => i.id === val);
          return {
            ...row,
            instrument_id: val,
            method: inst?.type === "upi_qr" ? "upi" : inst?.type ?? "cash",
          };
        }
        return { ...row, amount: val };
      })
    );
  }

  function removeSplitRow(index: number) {
    setPayments((prev) => prev.filter((_, idx) => idx !== index));
  }

  function fillExact() {
    if (primaryMethod === "khata") return;
    setPayments([
      {
        instrument_id: payments[0]?.instrument_id || defaultInstrument.id,
        method: payments[0]?.method || "cash",
        amount: total > 0 ? String(total.toFixed(2)) : "0",
      },
    ]);
  }

  function stockOf(id: string) {
    const p = productState.find((x) => x.id === id);
    return p ? Number(p.stock_qty) : 0;
  }

  function addLine(id: string, name: string, rate: number, isProduct: boolean) {
    setError(null);
    const existing = cart.find(
      (l) => l.product_id === (isProduct ? id : null) && l.service_id === (!isProduct ? id : null)
    );
    if (existing) {
      const next = existing.qty + 1;
      if (isProduct && next > stockOf(id)) {
        setError(`Only ${stockOf(id)} in stock for ${name}`);
        return;
      }
      setCart((prev) =>
        prev.map((l) =>
          l.key === existing.key
            ? { ...l, qty: next, amount: Number((next * l.rate).toFixed(2)) }
            : l
        )
      );
      triggerCartHighlight(existing.key);
    } else {
      if (isProduct && stockOf(id) <= 0) {
        setError(`${name} is out of stock`);
        return;
      }
      const prod = isProduct ? productState.find((p) => p.id === id) : null;
      const serv = !isProduct ? serviceState.find((s) => s.id === id) : null;
      const gstRate = Number(prod?.gst_rate ?? serv?.gst_rate ?? 0);
      const hsnSac = prod?.hsn_code ?? serv?.sac_code ?? null;
      const itemKey = `${isProduct ? "p" : "s"}-${id}`;
      setCart((prev) => [
        ...prev,
        {
          key: itemKey,
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
      triggerCartHighlight(itemKey);
    }
  }

  function changeQty(key: string, qty: number) {
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.key !== key) return l;
          const next = Math.max(0, qty);
          if (l.product_id && next > stockOf(l.product_id)) return l;
          return { ...l, qty: next, amount: Number((next * l.rate).toFixed(2)) };
        })
        .filter((l) => l.qty > 0)
    );
  }

  function changeRate(key: string, rate: number) {
    setCart((prev) =>
      prev.map((l) =>
        l.key === key
          ? {
              ...l,
              rate: Math.max(0, rate),
              amount: Number((l.qty * Math.max(0, rate)).toFixed(2)),
            }
          : l
      )
    );
  }

  function removeLine(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key));
  }

  function resetSaleDraft() {
    setCart([]);
    setCustomerId("");
    setDiscount("");
    setIsSplit(false);
    setPrimaryMethod("cash");
    setPayments([
      { instrument_id: defaultInstrument.id, method: defaultInstrument.type, amount: "" },
    ]);
    setError(null);
    setSuccess(null);
    setEditing(null);
  }

  function holdCurrent(label = "Held Bill") {
    if (cart.length === 0) return;
    const bill: HeldBill = {
      savedAt: new Date().toISOString(),
      label,
      cart,
      discount,
      customerId,
      payments,
    };
    const next = [...loadHeld(), bill];
    saveHeld(next);
    setHeldBills(next);
    resetSaleDraft();
    showToast("success", "Bill held successfully");
  }

  function recallBill(b: HeldBill) {
    setCart(b.cart || []);
    setDiscount(b.discount || "");
    setCustomerId(b.customerId || "");
    setPayments(
      b.payments && b.payments.length > 0
        ? b.payments
        : [{ instrument_id: defaultInstrument.id, method: defaultInstrument.type, amount: "" }]
    );
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

  async function addCustomItem() {
    const name = customName.trim();
    const rate = Number(customRate) || 0;
    const gstRate = Number(customGstRate) || 0;
    if (!name || rate <= 0) {
      setError("Enter an item title and a valid price.");
      return;
    }
    setError(null);
    const customKey = `c-${Date.now()}`;
    setCart((prev) => [
      ...prev,
      {
        key: customKey,
        product_id: null,
        service_id: null,
        name,
        qty: 1,
        rate,
        amount: rate,
        gst_rate: gstRate,
        tax_treatment: gstRate > 0 ? "taxable" : "non_gst",
      },
    ]);
    triggerCartHighlight(customKey);
    setCustomName("");
    setCustomRate("");
    setCustomGstRate("0");
    setCustomOpen(false);
  }

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
        alert(`A customer with phone ${phone} already exists: ${dup.name}`);
        setCustomerId(dup.id);
        setShowAddCustomer(false);
        return;
      }
    }
    setAddingCustomer(true);
    const { data, error } = await supabase
      .from("customers")
      .insert({
        name,
        phone: phone || null,
        code: nextCustCode(),
        opening_balance: 0,
        balance: 0,
        is_active: true,
      })
      .select("id, name, code, phone, balance, gstin, state_code")
      .single();
    setAddingCustomer(false);
    if (error) {
      alert(isDuplicateKeyError(error.message) ? "Customer already exists." : error.message);
      return;
    }
    const row = data as PosCustomer;
    setCustList((prev) => [...prev, row]);
    setCustomerId(row.id);
    setShowAddCustomer(false);
    setNewCust({ name: "", phone: "" });
    showToast("success", `Customer ${row.name} registered`);
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
    setEditing(inv);
  }

  // Requirement 10: Canonical create_sale financial path (with Invariant #1369 busy guard)
  async function completeSale(print: boolean) {
    if (busy) return;
    setError(null);

    if (cart.length === 0) {
      setError("Add items to the bill first.");
      return;
    }

    if (total > 0 && paid <= 0 && primaryMethod !== "khata") {
      setError("Enter the payment amount or select Khata / Due.");
      return;
    }

    const saleDue = Math.max(0, Number(total.toFixed(2)) - Number(paid.toFixed(2)));
    if (saleDue > 0.01 && !customerId) {
      setError("Please select a customer to mark the remaining balance as Khata / Due.");
      return;
    }

    // Format payment entries for database RPC
    let pmts = payments
      .filter((p) => Number(p.amount) > 0)
      .map((p) => ({
        method: p.method === "khata" ? "cash" : p.method,
        amount: Number(Number(p.amount).toFixed(2)),
        instrument_id: p.instrument_id || null,
      }));

    let changeAmt = 0;
    if (primaryMethod === "cash" && !isSplit && paid > total) {
      changeAmt = Number((paid - total).toFixed(2));
      pmts = [{ ...pmts[0], amount: Number(total.toFixed(2)) }];
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
      cost_price: 0,
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
    let rpcError: { message: string } | null = null;

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
        p_reason: "Updated from POS workspace",
      });
      data = res.data;
      rpcError = res.error as any;
    } else {
      const res = await supabase.rpc("create_sale", {
        p_customer_id: customerId || null,
        p_invoice_date: today,
        p_subtotal: Number(subtotal.toFixed(2)),
        p_discount: discountNum,
        p_total: Number(total.toFixed(2)),
        p_payments: pmts,
        p_items: items,
        p_previous_due: 0,
        p_previous_due_method: defaultInstrument.type,
        p_previous_due_instrument_id: defaultInstrument.id || null,
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
      data = res.data;
      rpcError = res.error as any;
    }

    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      showToast("error", rpcError.message || "Failed to process sale");
      return;
    }

    // Decrement local product stock for immediate UI responsiveness
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

    const selCust = custList.find((c) => c.id === customerId);
    const saleRes: SaleResult = {
      ...(data as SaleResult),
      id: (data as any)?.id ?? (data as any)?.invoice_id,
      change: changeAmt,
      customer_name: selCust?.name ?? null,
      customer_phone: selCust?.phone ?? null,
    };

    setSuccess(saleRes);
    setWaStatus("idle");
    showToast("success", `Sale saved • ${inr(total)} • #${saleRes.invoice_number}`);

    // Auto WhatsApp send if configured
    const waCfg = getWhatsAppConfig();
    if (waCfg.provider !== "off" && waCfg.auto_send_pos && selCust?.phone) {
      handleSendInvoiceWhatsApp(saleRes);
    }

    logAudit({
      action: editing ? "update" : "create",
      entity: "invoice",
      entity_id: saleRes.id ?? null,
      description: editing
        ? `Invoice edited (${editing.invoice_number}) ${inr(total)}`
        : `Sale created (${inr(total)})${customerId ? " for customer" : ""}`,
      details: { invoice_number: saleRes.invoice_number, total: Number(total.toFixed(2)) },
    });

    // Reset current sale draft
    setCart([]);
    setCustomerId("");
    setDiscount("");
    setIsSplit(false);
    setPrimaryMethod("cash");
    setPayments([
      { instrument_id: defaultInstrument.id, method: defaultInstrument.type, amount: "" },
    ]);
    setEditing(null);

    if (print && saleRes.id) {
      window.open(
        printFormat === "thermal" ? `/receipt/${saleRes.id}` : `/receipt/${saleRes.id}/a4`,
        "_blank",
        "noopener"
      );
    }
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
      setWaModal({
        open: true,
        phone: s.customer_phone || "",
        name: s.customer_name || "Customer",
        msg,
        invNum: s.invoice_number,
        refId: s.id,
      });
      return;
    }
    setWaStatus("sending");
    sendWhatsAppMessage({
      phone: s.customer_phone || "",
      message: msg,
      recipientName: s.customer_name,
      messageType: "pos_invoice",
      refId: s.id,
      refNumber: s.invoice_number,
    }).then((r) => setWaStatus(r.ok ? "sent" : "failed"));
  }

  const payDisabled = busy || cart.length === 0;

  return (
    <div className="mx-auto max-w-[1600px] px-3 py-3 lg:px-5">
      {/* 1. TOP COMMAND BAR: Sleek, compact, non-duplicated header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white px-4 py-2.5 shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs dark:bg-white dark:text-slate-900">
            <ShoppingBag className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-black tracking-tight text-slate-900 dark:text-white">
                POS Billing
              </h1>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {salesTodayCount} Sales Today · {inr(salesTodayAmount)} Collected
              </span>
            </div>
            <p className="text-[10px] font-semibold text-slate-400">
              Modern billing workspace · Fast counter checkout
            </p>
          </div>
        </div>

        {/* Action tray & Invoices link */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {heldBills.length > 0 && (
            <button
              type="button"
              onClick={() => setRecallOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-1.5 font-bold text-amber-800 transition hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Recall ({heldBills.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => holdCurrent()}
            disabled={!cart.length}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
          >
            <BookmarkCheck className="h-3.5 w-3.5 text-slate-400" />
            <span>Hold</span>
          </button>

          <button
            type="button"
            onClick={resetSaleDraft}
            disabled={!cart.length && !customerId}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
          >
            New Bill
          </button>

          {/* Requirement 11: Link to existing Invoices module */}
          <Link
            href="/invoices"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 font-black text-slate-800 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
          >
            <span>Invoices</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {editing && (
        <div className="mb-3 flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <span>
            Editing Invoice: <b>{editing.invoice_number}</b>
          </span>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              resetSaleDraft();
            }}
            className="text-amber-700 underline hover:text-amber-900 dark:text-amber-400"
          >
            Cancel Edit
          </button>
        </div>
      )}

      {/* 2. CATEGORIES AT TOP (Requirement 1) */}
      <div className="mb-3 rounded-2xl border border-slate-200/90 bg-white p-2.5 shadow-xs dark:border-white/10 dark:bg-slate-900">
        <PosCategoryChips
          categories={categories}
          totalCount={allItems.length}
          favCount={favoritesCount}
          active={cat}
          onSelect={(selectedId) => {
            setCat(cat === selectedId ? "all" : selectedId);
            if (selectedId === "favorites") setTab("favorites");
          }}
        />
      </div>

      {/* 3. MAIN WORKSPACE: Catalog (Left) + Compact Bill Drawer (Right) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* CATALOG COLUMN */}
        <div className="min-w-0">
          <PosItemToolbar
            tabs={[
              { value: "all", label: "All Items" },
              { value: "services", label: "Services" },
              { value: "products", label: "Products" },
              { value: "favorites", label: "⭐ Favorites" },
            ]}
            activeTab={tab}
            onTab={(t) => {
              setTab(t as PosTab);
              if (t === "favorites") setCat("favorites");
            }}
            searchRef={searchRef}
            placeholder="Search items, code, category… (Ctrl+K or F4)"
            q={q}
            onQ={setQ}
            sort={sort}
            onSort={(v) => setSort(v as any)}
            view={view}
            onView={setView}
            action={
              <button
                type="button"
                onClick={() => setCustomOpen(true)}
                className="touch-manipulation inline-flex items-center gap-1.5 h-9 rounded-xl border border-dashed border-blue-400 bg-blue-50/70 px-3 text-xs font-black text-blue-700 transition hover:bg-blue-100 active:scale-95 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>+ Custom</span>
              </button>
            }
          />

          {/* Catalog items display: List view is default (Requirement 2) */}
          {view === "list" ? (
            <PosTable
              items={filtered}
              onAdd={addLine}
              onToggleFavorite={toggleStar}
              emptyText="No items match your catalog search."
            />
          ) : (
            <PosGrid
              items={filtered}
              onAdd={addLine}
              onToggleFavorite={toggleStar}
              emptyText="No items match your catalog search."
            />
          )}
        </div>

        {/* COMPACT BILL DRAWER (Requirement 4) */}
        <div className="pos-billing-drawer min-w-0">
          <div className="sticky top-3 flex max-h-[calc(100vh-5.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs dark:border-white/10 dark:bg-slate-900">
            {/* Bill Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/5">
              <div>
                <h2 className="text-sm font-black text-slate-900 dark:text-white">Current Bill</h2>
                <p className="text-[11px] font-bold text-slate-400">
                  {itemCount} item{itemCount === 1 ? "" : "s"} · {inr(total)}
                </p>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={resetSaleDraft}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-500 hover:underline"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {/* Customer Section in the Bill (Requirement 7) */}
            <div className="border-b border-slate-100 px-4 py-3 dark:border-white/5">
              <CustomerSelector
                customers={custList}
                value={customerId}
                onChange={setCustomerId}
                onAddCustomer={() => setShowAddCustomer(true)}
                searchRef={customerSearchRef}
              />
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="space-y-2">
                {cart.map((l) => (
                  <div
                    key={l.key}
                    data-cart-item-key={l.key}
                    className={`rounded-xl border p-2.5 transition-all duration-300 ${
                      highlightedCartKey === l.key
                        ? "border-blue-500 bg-blue-50/90 shadow-md ring-2 ring-blue-500/40 dark:bg-blue-950/50 dark:border-blue-500"
                        : "border-slate-100 bg-slate-50/70 hover:border-slate-200 dark:border-white/5 dark:bg-white/[0.03]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-black text-slate-900 dark:text-white">
                          {l.name}
                        </span>
                        <span className="text-[9px] font-bold uppercase text-slate-400">
                          {l.product_id ? "Product" : "Service"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLine(l.key)}
                        className="rounded-lg p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                        title="Remove item"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center rounded-lg border border-slate-200 bg-white shadow-xs dark:border-white/10 dark:bg-slate-800">
                        <button
                          type="button"
                          onClick={() => changeQty(l.key, l.qty - 1)}
                          className="px-2 py-0.5 text-xs font-black text-slate-600 hover:bg-slate-100 hover:text-rose-600 dark:text-slate-300 dark:hover:bg-white/10"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-7 text-center text-xs font-black text-slate-950 dark:text-white">
                          {l.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => changeQty(l.key, l.qty + 1)}
                          className="px-2 py-0.5 text-xs font-black text-slate-600 hover:bg-slate-100 hover:text-emerald-600 dark:text-slate-300 dark:hover:bg-white/10"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>

                      <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-0.5 shadow-xs dark:border-white/10 dark:bg-slate-800">
                        <span className="text-[10px] font-bold text-slate-400">@</span>
                        <input
                          type="number"
                          value={l.rate}
                          onChange={(e) => changeRate(l.key, Number(e.target.value))}
                          className="w-14 bg-transparent text-right text-xs font-black text-slate-900 focus:outline-none dark:text-white"
                        />
                      </div>

                      <span className="text-xs font-black tabular-nums text-slate-900 dark:text-white">
                        {inr(l.amount)}
                      </span>
                    </div>
                  </div>
                ))}

                {cart.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400 dark:border-white/10">
                    <ReceiptText className="mx-auto h-8 w-8 opacity-30 mb-2" />
                    <p className="font-bold">Bill is empty</p>
                    <p className="text-[10px] mt-0.5">Click any item in catalog to add.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Pricing & Compact Payment Section (Requirements 5, 6, 9) */}
            <div className="border-t border-slate-100 bg-slate-50/60 p-4 dark:border-white/5 dark:bg-white/[0.02]">
              {/* Summary line items */}
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>Subtotal</span>
                  <span className="font-bold text-slate-900 dark:text-white">{inr(subtotal)}</span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Discount (₹)</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      placeholder="0.00"
                      className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-right text-xs font-bold shadow-xs dark:border-white/10 dark:bg-slate-800 dark:text-white focus:outline-none"
                    />
                  </div>
                </div>

                {gstPreview.totalTax > 0 && (
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span>GST Tax</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {inr(gstPreview.totalTax)}
                    </span>
                  </div>
                )}

                <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-black text-slate-900 dark:border-white/10 dark:text-white">
                  <span>PAYABLE</span>
                  <span className="text-blue-600 dark:text-blue-400">{inr(total)}</span>
                </div>

                {invoiceDue > 0.01 && (
                  <div className="flex justify-between font-bold text-rose-600 dark:text-rose-400">
                    <span>Khata Due</span>
                    <span>{inr(invoiceDue)}</span>
                  </div>
                )}

                {change > 0 && (
                  <div className="flex justify-between font-bold text-emerald-600 dark:text-emerald-400">
                    <span>Change to Return</span>
                    <span>{inr(change)}</span>
                  </div>
                )}
              </div>

              {/* Compact Payment Method Selector (Requirement 5) */}
              <div className="mt-3 border-t border-slate-200/80 pt-2.5 dark:border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Payment Method
                  </span>
                  {/* Requirement 6: Split payment on-demand toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsSplit((s) => !s);
                      if (!isSplit && payments.length <= 1) {
                        addSplitPaymentRow();
                      }
                    }}
                    className={`inline-flex items-center gap-1 text-[10px] font-black ${
                      isSplit
                        ? "text-blue-600 dark:text-blue-400 underline"
                        : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
                    }`}
                  >
                    <Split className="h-3 w-3" />
                    <span>{isSplit ? "Single Tender" : "+ Split Pay"}</span>
                  </button>
                </div>

                {!isSplit ? (
                  // Compact Single Tender Grid
                  <div className="mt-1.5 space-y-2">
                    <div className="grid grid-cols-4 gap-1.5">
                      {methodList.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setSingleMethod(m)}
                          className={`rounded-xl py-1.5 text-xs font-black transition ${
                            primaryMethod === m
                              ? METHOD_BTN[m]?.active || "bg-blue-600 text-white"
                              : METHOD_BTN[m]?.idle || "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {METHOD_BTN[m]?.label || m}
                        </button>
                      ))}
                    </div>

                    {primaryMethod === "khata" ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-2 text-center text-[11px] font-bold text-amber-900 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-200">
                        Total {inr(total)} will be posted to Customer Khata ledger.
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <select
                          value={payments[0]?.instrument_id}
                          onChange={(e) => {
                            const instId = e.target.value;
                            const inst = instruments.find((i) => i.id === instId);
                            setPayments((prev) => [
                              {
                                ...prev[0],
                                instrument_id: instId,
                                method: inst?.type === "upi_qr" ? "upi" : inst?.type ?? primaryMethod,
                              },
                            ]);
                          }}
                          className="h-8 flex-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 shadow-xs outline-none dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                        >
                          {instruments
                            .filter((i) => {
                              const allowed = METHOD_ACCOUNT_TYPES[primaryMethod] ?? [primaryMethod];
                              return allowed.includes(i.type);
                            })
                            .map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.name}
                              </option>
                            ))}
                        </select>
                        <input
                          type="number"
                          value={payments[0]?.amount}
                          onChange={(e) =>
                            setPayments((prev) => [{ ...prev[0], amount: e.target.value }])
                          }
                          placeholder="Amount"
                          className="h-8 w-24 rounded-xl border border-slate-200 bg-white px-2 text-right text-xs font-bold shadow-xs dark:border-white/10 dark:bg-slate-800 dark:text-white"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  // Multi-tender Split Payment View (Requirement 6)
                  <div className="mt-2 space-y-1.5">
                    {payments.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <select
                          value={p.instrument_id}
                          onChange={(e) => updateSplitRow(idx, "instrument_id", e.target.value)}
                          className="h-8 flex-1 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 shadow-xs dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                        >
                          {instruments.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={p.amount}
                          onChange={(e) => updateSplitRow(idx, "amount", e.target.value)}
                          placeholder="0.00"
                          className="h-8 w-20 rounded-xl border border-slate-200 bg-white px-2 text-right text-xs font-bold shadow-xs dark:border-white/10 dark:bg-slate-800 dark:text-white"
                        />
                        {payments.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSplitRow(idx)}
                            className="rounded-lg p-1 text-slate-400 hover:text-rose-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] font-bold text-slate-400">
                        Remaining: {inr(Math.max(0, total - paid))}
                      </span>
                      <button
                        type="button"
                        onClick={addSplitPaymentRow}
                        className="text-[11px] font-bold text-blue-600 hover:underline dark:text-blue-400"
                      >
                        + Add Instrument
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-2.5 rounded-xl bg-rose-50 p-2 text-xs font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                  {error}
                </div>
              )}

              {/* Checkout Action Buttons */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => completeSale(false)}
                  disabled={payDisabled}
                  className="rounded-xl border border-slate-200 bg-white py-2 text-xs font-black text-slate-800 shadow-xs transition hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                >
                  Save Bill
                </button>
                <button
                  type="button"
                  onClick={() => completeSale(true)}
                  disabled={payDisabled}
                  className="rounded-xl bg-blue-600 py-2 text-xs font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-40"
                >
                  Pay &amp; Print
                </button>
              </div>

              <button
                type="button"
                onClick={() => completeSale(true)}
                disabled={payDisabled}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 py-3 text-xs font-black text-white shadow-md hover:bg-slate-800 disabled:opacity-40 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
              >
                <Zap className="h-4 w-4" />
                <span>Complete Sale [Enter]</span>
                <span>·</span>
                <span>{inr(total)}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MODALS */}
      {/* 1. Add Customer Modal */}
      {showAddCustomer && (
        <Modal
          onClose={() => setShowAddCustomer(false)}
          title="Create New Customer"
          subtitle="Quick register customer for billing & Khata ledger"
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
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-white/5">
              <button
                type="button"
                onClick={addCustomer}
                disabled={addingCustomer}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
              >
                {addingCustomer ? "Saving…" : "Save Customer"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 2. Add Custom Item Modal */}
      {customOpen && (
        <Modal
          onClose={() => setCustomOpen(false)}
          title="Add Custom Item"
          subtitle="Add an unlisted service or product to this bill"
          accent="blue"
        >
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400">Item Title</label>
              <input
                autoFocus
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Urgent Color Print / Form Fill"
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
                <label className="text-[10px] font-black uppercase text-slate-400">GST Rate (%)</label>
                <input
                  type="number"
                  value={customGstRate}
                  onChange={(e) => setCustomGstRate(e.target.value)}
                  placeholder="0"
                  className={inputClass}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-white/5">
              <button
                type="button"
                onClick={addCustomItem}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
              >
                Add to Bill
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 3. Recall Held Bills Modal */}
      {recallOpen && (
        <Modal
          onClose={() => setRecallOpen(false)}
          title="Held Bills & Suspended Drafts"
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

      {/* 4. Sale Success Modal (Requirement 11: Links to existing Invoices module) */}
      {success && (
        <Modal
          onClose={() => setSuccess(null)}
          title="Sale Completed Successfully"
          subtitle={`Invoice #${success.invoice_number}`}
          accent="emerald"
        >
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              <Check className="h-7 w-7" />
            </div>

            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Total Billed
              </span>
              <p className="text-2xl font-black text-slate-950 dark:text-white">
                {inr(success.total)}
              </p>
              {success.change ? (
                <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-black text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  <span>Change to Return:</span>
                  <span>{inr(success.change)}</span>
                </div>
              ) : null}
              {success.due > 0 ? (
                <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-black text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                  <span>Khata Due:</span>
                  <span>{inr(success.due)}</span>
                </div>
              ) : null}
              {success.customer_name && (
                <p className="mt-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                  Customer: <span className="text-slate-900 dark:text-white">{success.customer_name}</span>
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 border-t border-slate-100 pt-3 dark:border-white/5">
              <a
                href={printFormat === "thermal" ? `/receipt/${success.id}` : `/receipt/${success.id}/a4`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white hover:bg-blue-700"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Print Receipt</span>
              </a>

              <a
                href={`/receipt/${success.id}/a4`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-white dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>A4 Tax Bill</span>
              </a>

              <button
                type="button"
                onClick={() => handleSendInvoiceWhatsApp(success, true)}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700"
              >
                <span>💬 WhatsApp</span>
              </button>
            </div>

            {/* Requirement 11: Link to existing Invoices module */}
            <div className="pt-1 space-y-2">
              <button
                type="button"
                autoFocus
                onClick={() => setSuccess(null)}
                className="w-full rounded-xl bg-slate-950 py-3 text-xs font-black text-white shadow-sm hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
              >
                Next Customer [Enter] →
              </button>

              <button
                type="button"
                onClick={() => {
                  setSuccess(null);
                  router.push(`/invoices?q=${encodeURIComponent(success.invoice_number)}`);
                }}
                className="block w-full text-center text-[11px] font-bold text-blue-600 hover:underline dark:text-blue-400"
              >
                View in Invoices Module ↗
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 5. WhatsApp Modal */}
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
