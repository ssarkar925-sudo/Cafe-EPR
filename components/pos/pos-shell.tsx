"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { inr } from "@/lib/format";
import { calculateGstInvoice, type GstInvoiceCalculation } from "@/lib/gst";
import { generateQrDataUrl, generateUpiString } from "@/lib/qr";
import { createClient } from "@/lib/supabase/client";
import PosOperations from "./pos-operations";
import {
  AlertCircle,
  ArrowDownToLine,
  Check,
  ChevronDown,
  CircleUserRound,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  LayoutGrid,
  List,
  MessageSquare,
  Minus,
  Pause,
  Plus,
  Printer,
  QrCode,
  ReceiptText,
  RotateCcw,
  Search,
  ShoppingCart,
  Sparkles,
  Trash2,
  UserPlus,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import PosNewCustomerModal from "./pos-new-customer-modal";
import { playPosSound } from "./pos-sound";
import type {
  CartLine,
  OrderTab,
  PaymentChoice,
  PosCatalogItem,
  PosCustomer,
  PosInstrument,
  SplitRow,
  SuccessState,
} from "./pos-types";

export type { PosCatalogItem, PosCustomer, PosInstrument };

function money(value: number) {
  return inr(Math.round((value + Number.EPSILON) * 100) / 100);
}

function methodFromInstrument(instrument?: PosInstrument | null) {
  if (!instrument) return "cash";
  if (instrument.type === "upi_qr") return "upi";
  return instrument.type;
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function indiaToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

const HELD_STORAGE_KEY = "cafeerp-pos-held-bills-v1";
const SOUND_STORAGE_KEY = "cafeerp-pos-sound-enabled";
const VIEW_STORAGE_KEY = "cafeerp-pos-view-mode";

type HeldDraft = {
  id: string;
  heldAt: string;
  tabTitle: string;
  itemCount: number;
  totalQty: number;
  total: number;
  customerId: string;
  customerName: string;
  discount: string;
  paymentChoice: string;
  cart: CartLine[];
};

function createInitialTab(index = 1, initialCustomerId = ""): OrderTab {
  return {
    id: `tab-${Date.now()}-${index}`,
    title: `Order #${index}`,
    cart: [],
    customerId: initialCustomerId,
    customerSearch: "",
    discount: "",
    discountType: "flat",
    paymentChoice: "cash",
    cashReceived: "",
    splitRows: [],
    collectPreviousDue: false,
    useAdvance: false,
  };
}

export default function PosShell({
  shopName,
  operatorName,
  products,
  services,
  customers: initialCustomers,
  instruments,
  initialCustomerId = "",
  defaultUpiId = "",
  shopPhone = "",
}: {
  shopName: string;
  operatorName: string;
  products: PosCatalogItem[];
  services: PosCatalogItem[];
  customers: PosCustomer[];
  instruments: PosInstrument[];
  initialCustomerId?: string;
  defaultUpiId?: string;
  shopPhone?: string;
}) {
  const supabase = createClient();
  const itemSearchRef = useRef<HTMLInputElement | null>(null);
  const customerSearchRef = useRef<HTMLInputElement | null>(null);

  // Dynamic Customer state (so newly added customers appear instantly)
  const [customers, setCustomers] = useState<PosCustomer[]>(initialCustomers);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);

  // Sound and View preferences
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  useEffect(() => {
    try {
      const savedSound = localStorage.getItem(SOUND_STORAGE_KEY);
      if (savedSound !== null) setSoundEnabled(savedSound === "true");
      const savedView = localStorage.getItem(VIEW_STORAGE_KEY);
      if (savedView === "grid" || savedView === "list") setViewMode(savedView);
    } catch {
      // ignore storage failure
    }
  }, []);

  function toggleSound() {
    setSoundEnabled((curr) => {
      const next = !curr;
      try {
        localStorage.setItem(SOUND_STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  }

  function toggleViewMode(mode: "grid" | "list") {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, mode);
    } catch {}
  }

  // Multi-cart Order Tabs
  const [tabs, setTabs] = useState<OrderTab[]>([createInitialTab(1, initialCustomerId)]);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id);

  const currentTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) ?? tabs[0],
    [tabs, activeTabId]
  );

  // Helpers to mutate active tab
  const updateCurrentTab = useCallback((patch: Partial<OrderTab>) => {
    setTabs((curr) =>
      curr.map((tab) => (tab.id === activeTabId ? { ...tab, ...patch } : tab))
    );
  }, [activeTabId]);

  // Catalog Filters
  const [scope, setScope] = useState<"all" | "services" | "products">("all");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);

  // POS State & Checkout processing
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [whatsappStatus, setWhatsappStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [whatsappMsg, setWhatsappMsg] = useState("");

  // Operations drawers (Money Out, Today's Sales, Held Bills)
  const [operationsPanel, setOperationsPanel] = useState<"held" | "today" | "money-out" | null>(null);
  const [heldBills, setHeldBills] = useState<HeldDraft[]>([]);
  const [todaySales, setTodaySales] = useState<any[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [moneyOutAmount, setMoneyOutAmount] = useState("");
  const [moneyOutCategory, setMoneyOutCategory] = useState("general");
  const [moneyOutNote, setMoneyOutNote] = useState("");
  const [moneyOutSource, setMoneyOutSource] = useState("");
  const [moneyOutSaving, setMoneyOutSaving] = useState(false);

  // Catalog preparation
  const catalog = useMemo(() => {
    const merged = [...services, ...products];
    const byKey = new Map<string, PosCatalogItem>();
    for (const item of merged) byKey.set(`${item.kind}:${item.id}`, item);
    return Array.from(byKey.values());
  }, [products, services]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of catalog) {
      if (!item.category_id || !item.category_name) continue;
      counts.set(item.category_id, (counts.get(item.category_id) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([id, count]) => ({
        id,
        name: catalog.find((item) => item.category_id === id)?.category_name ?? "Other",
        count,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [catalog]);

  const filteredItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return catalog
      .filter((item) => scope === "all" || item.kind === (scope === "services" ? "service" : "product"))
      .filter((item) => category === "all" || item.category_id === category)
      .filter((item) => {
        if (!needle) return true;
        return [item.name, item.code, item.category_name, item.hsn_sac]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [catalog, scope, category, search]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === currentTab.customerId) ?? null,
    [customers, currentTab.customerId]
  );

  const customerMatches = useMemo(() => {
    const needle = currentTab.customerSearch.trim().toLowerCase();
    if (!needle) return customers.slice(0, 10);
    return customers
      .filter((c) =>
        [c.name, c.phone, c.code].filter(Boolean).some((v) => String(v).toLowerCase().includes(needle))
      )
      .slice(0, 12);
  }, [customers, currentTab.customerSearch]);

  // Tax and Total calculation for active tab
  const rawDiscount = Number(currentTab.discount) || 0;
  const grossBeforeDiscount = currentTab.cart.reduce((sum, line) => sum + line.rate * line.qty, 0);
  const effectiveDiscount = currentTab.discountType === "percent"
    ? Math.round((grossBeforeDiscount * (rawDiscount / 100)) * 100) / 100
    : Math.min(grossBeforeDiscount, rawDiscount);

  const totals: GstInvoiceCalculation = useMemo(() => {
    return calculateGstInvoice({
      lines: currentTab.cart.map((line) => ({
        qty: line.qty,
        rate: line.rate,
        gstRate: line.gstRate,
        hsnSac: line.hsnSac,
        taxTreatment: line.gstRate > 0 ? "taxable" : "non_gst",
      })),
      invoiceLumpSumDiscount: Math.max(0, effectiveDiscount),
      customerStateCode: selectedCustomer?.state_code ?? null,
      customerGstin: selectedCustomer?.gstin ?? null,
    });
  }, [currentTab.cart, effectiveDiscount, selectedCustomer]);

  const subtotal = totals.totalGross;
  const discountValue = totals.totalDiscount;
  const totalTax = totals.totalTax;
  
  // Outstanding previous due calculation
  const customerBalance = Number(selectedCustomer?.balance ?? 0);
  const customerHasDue = customerBalance > 0;
  const customerHasAdvance = customerBalance < 0;

  const dueToCollect = currentTab.collectPreviousDue && customerHasDue ? customerBalance : 0;
  const advanceToUse = currentTab.useAdvance && customerHasAdvance
    ? Math.min(totals.invoiceTotal, Math.abs(customerBalance))
    : 0;

  const total = Math.max(0, totals.invoiceTotal + dueToCollect - advanceToUse);

  // Available payment instruments
  const cashInstrument = useMemo(
    () => instruments.find((instrument) => instrument.type === "cash") ?? null,
    [instruments]
  );
  const upiInstrument = useMemo(
    () => instruments.find((instrument) => instrument.type === "upi" || instrument.type === "upi_qr") ?? null,
    [instruments]
  );
  const splitInstrumentOptions = useMemo(
    () => instruments.map((instrument) => ({ value: instrument.id, label: instrument.name })),
    [instruments]
  );

  const resolvedUpiId = defaultUpiId || upiInstrument?.account_number || "";

  // Dynamic QR Generation when UPI is selected
  useEffect(() => {
    if (currentTab.paymentChoice !== "upi" || total <= 0 || !resolvedUpiId) {
      setQrDataUrl("");
      return;
    }
    const upiStr = generateUpiString({
      upiId: resolvedUpiId,
      name: shopName || "Shop",
      amount: total,
      note: `POS ${currentTab.title}`,
    });
    void generateQrDataUrl(upiStr, { width: 220, margin: 1 }).then(setQrDataUrl);
  }, [currentTab.paymentChoice, total, resolvedUpiId, shopName, currentTab.title]);

  // Sync cash received default
  useEffect(() => {
    if (currentTab.paymentChoice === "cash" && total > 0 && !currentTab.cashReceived) {
      updateCurrentTab({ cashReceived: total.toFixed(2) });
    }
  }, [currentTab.paymentChoice, total, currentTab.cashReceived, updateCurrentTab]);

  // Keyboard Shortcuts Handler
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "F2") {
        e.preventDefault();
        addNewTab();
      } else if (e.key === "F3") {
        e.preventDefault();
        customerSearchRef.current?.focus();
        setCustomerOpen(true);
      } else if (e.key === "F4") {
        e.preventDefault();
        itemSearchRef.current?.focus();
        itemSearchRef.current?.select();
      } else if (e.key === "F8") {
        e.preventDefault();
        const choices: PaymentChoice[] = ["cash", "upi", "khata", "split"];
        const nextIdx = (choices.indexOf(currentTab.paymentChoice) + 1) % choices.length;
        selectPayment(choices[nextIdx]);
      } else if (e.key === "F9") {
        e.preventDefault();
        void completeSale();
      } else if (e.key === "Escape") {
        setCustomerOpen(false);
        setOperationsPanel(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // Tab Management Functions
  function addNewTab() {
    if (tabs.length >= 5) {
      playPosSound("warning", soundEnabled);
      setError("Maximum 5 open tabs allowed. Complete or close an order first.");
      return;
    }
    const newIdx = tabs.length + 1;
    const newTab = createInitialTab(newIdx);
    setTabs((curr) => [...curr, newTab]);
    setActiveTabId(newTab.id);
    playPosSound("tab", soundEnabled);
    setError(null);
    window.setTimeout(() => itemSearchRef.current?.focus(), 50);
  }

  function switchTab(id: string) {
    setActiveTabId(id);
    playPosSound("tab", soundEnabled);
    setError(null);
  }

  function closeTab(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (tabs.length <= 1) {
      // Reset only remaining tab
      updateCurrentTab({
        cart: [],
        discount: "",
        customerId: "",
        customerSearch: "",
        cashReceived: "",
        splitRows: [],
        collectPreviousDue: false,
        useAdvance: false,
      });
      playPosSound("delete", soundEnabled);
      return;
    }
    const filtered = tabs.filter((t) => t.id !== id);
    setTabs(filtered);
    if (activeTabId === id) {
      setActiveTabId(filtered[0].id);
    }
    playPosSound("delete", soundEnabled);
  }

  // Cart Mutators
  function addItem(item: PosCatalogItem) {
    setError(null);
    const stockQty = item.kind === "product" ? Number(item.stock_qty ?? 0) : null;
    if (item.kind === "product" && stockQty !== null && stockQty <= 0) {
      playPosSound("warning", soundEnabled);
      setError(`"${item.name}" is currently out of stock.`);
      return;
    }

    const key = `${item.kind}:${item.id}`;
    const existing = currentTab.cart.find((line) => line.key === key);

    if (existing && existing.stockQty !== null && existing.qty >= existing.stockQty) {
      playPosSound("warning", soundEnabled);
      setError(`Cannot add more. Only ${existing.stockQty} ${existing.unit} available in stock.`);
      return;
    }

    playPosSound("add", soundEnabled);

    let nextCart: CartLine[];
    if (existing) {
      nextCart = currentTab.cart.map((line) =>
        line.key === key ? { ...line, qty: line.qty + 1 } : line
      );
    } else {
      nextCart = [
        ...currentTab.cart,
        {
          key,
          id: item.id,
          kind: item.kind,
          name: item.name,
          code: item.code,
          rate: Number(item.sale_price) || 0,
          qty: 1,
          costPrice: Number(item.cost_price) || 0,
          categoryName: item.category_name ?? "",
          gstRate: Number(item.gst_rate) || 0,
          hsnSac: item.hsn_sac ?? null,
          stockQty,
          unit: item.unit ?? "pc",
        },
      ];
    }
    updateCurrentTab({ cart: nextCart });
  }

  function updateQty(key: string, nextQty: number) {
    playPosSound("click", soundEnabled);
    const updated = currentTab.cart.flatMap((line) => {
      if (line.key !== key) return [line];
      const max = line.stockQty === null ? Number.MAX_SAFE_INTEGER : Math.max(0, line.stockQty);
      const qty = Math.min(max, Math.max(0, Math.floor(nextQty)));
      return qty <= 0 ? [] : [{ ...line, qty }];
    });
    updateCurrentTab({ cart: updated });
  }

  function removeLine(key: string) {
    playPosSound("delete", soundEnabled);
    updateCurrentTab({ cart: currentTab.cart.filter((line) => line.key !== key) });
  }

  function clearActiveCart() {
    playPosSound("delete", soundEnabled);
    updateCurrentTab({
      cart: [],
      discount: "",
      cashReceived: "",
      splitRows: [],
      collectPreviousDue: false,
      useAdvance: false,
    });
  }

  function selectPayment(choice: PaymentChoice) {
    playPosSound("click", soundEnabled);
    setError(null);
    let patch: Partial<OrderTab> = { paymentChoice: choice };
    if (choice === "split" && currentTab.splitRows.length === 0) {
      const firstId = cashInstrument?.id ?? instruments[0]?.id ?? "";
      patch.splitRows = [{ id: makeId(), instrumentId: firstId, amount: total > 0 ? total.toFixed(2) : "" }];
    }
    if (choice === "cash") {
      patch.cashReceived = total > 0 ? total.toFixed(2) : "";
    }
    updateCurrentTab(patch);
  }

  function setCashTenderExact() {
    updateCurrentTab({ cashReceived: total.toFixed(2) });
    playPosSound("click", soundEnabled);
  }

  function addCashNote(amount: number) {
    const current = Number(currentTab.cashReceived) || 0;
    updateCurrentTab({ cashReceived: (current + amount).toFixed(2) });
    playPosSound("click", soundEnabled);
  }

  function roundCashNext50() {
    const next50 = Math.ceil(total / 50) * 50;
    updateCurrentTab({ cashReceived: next50.toFixed(2) });
    playPosSound("click", soundEnabled);
  }

  // Split management
  function addSplitRow() {
    const used = new Set(currentTab.splitRows.map((r) => r.instrumentId));
    const nextInst = instruments.find((i) => !used.has(i.id)) ?? instruments[0];
    const allocated = currentTab.splitRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const remaining = Math.max(0, total - allocated);
    updateCurrentTab({
      splitRows: [
        ...currentTab.splitRows,
        { id: makeId(), instrumentId: nextInst?.id ?? "", amount: remaining > 0 ? remaining.toFixed(2) : "" },
      ],
    });
    playPosSound("click", soundEnabled);
  }

  function updateSplitRow(id: string, patch: Partial<SplitRow>) {
    updateCurrentTab({
      splitRows: currentTab.splitRows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  }

  function removeSplitRow(id: string) {
    playPosSound("delete", soundEnabled);
    updateCurrentTab({
      splitRows: currentTab.splitRows.filter((r) => r.id !== id),
    });
  }

  // Operations: Hold and Recall Bills
  function holdCurrentBill() {
    if (!currentTab.cart.length) {
      setError("Add at least one item before holding this bill.");
      return;
    }
    const draft: HeldDraft = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      heldAt: new Date().toISOString(),
      tabTitle: currentTab.title,
      itemCount: currentTab.cart.length,
      totalQty: currentTab.cart.reduce((s, l) => s + l.qty, 0),
      total,
      customerId: currentTab.customerId,
      customerName: selectedCustomer?.name || "Walk-in Customer",
      discount: currentTab.discount,
      paymentChoice: currentTab.paymentChoice,
      cart: currentTab.cart,
    };

    try {
      const raw = localStorage.getItem(HELD_STORAGE_KEY);
      const existing = raw ? JSON.parse(raw) : [];
      const updated = [draft, ...existing].slice(0, 30);
      localStorage.setItem(HELD_STORAGE_KEY, JSON.stringify(updated));
      setHeldBills(updated);
    } catch {}

    playPosSound("success", soundEnabled);
    clearActiveCart();
    setOperationsPanel(null);
  }

  function recallHeldDraft(draft: HeldDraft) {
    updateCurrentTab({
      cart: draft.cart,
      customerId: draft.customerId,
      discount: draft.discount,
      paymentChoice: (draft.paymentChoice as PaymentChoice) || "cash",
    });
    try {
      const remaining = heldBills.filter((b) => b.id !== draft.id);
      localStorage.setItem(HELD_STORAGE_KEY, JSON.stringify(remaining));
      setHeldBills(remaining);
    } catch {}
    setOperationsPanel(null);
    playPosSound("tab", soundEnabled);
  }

  function deleteHeldDraft(id: string) {
    try {
      const remaining = heldBills.filter((b) => b.id !== id);
      localStorage.setItem(HELD_STORAGE_KEY, JSON.stringify(remaining));
      setHeldBills(remaining);
    } catch {}
    playPosSound("delete", soundEnabled);
  }

  async function openTodaySales() {
    setOperationsPanel("today");
    setLoadingSales(true);
    const { data } = await supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, total, paid, due, status, customers(name, phone)")
      .eq("invoice_date", indiaToday())
      .order("created_at", { ascending: false })
      .limit(40);
    setTodaySales(data ?? []);
    setLoadingSales(false);
  }

  async function handleMoneyOut(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(moneyOutAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid amount for Money Out.");
      return;
    }
    setMoneyOutSaving(true);
    const { error: rpcError } = await supabase.rpc("add_expense", {
      p_expense_date: indiaToday(),
      p_category: moneyOutCategory.trim() || "general",
      p_amount: amount,
      p_note: moneyOutNote.trim() || "POS Money Out",
      p_instrument_id: moneyOutSource || null,
      p_method: moneyOutSource ? null : "cash",
    });
    setMoneyOutSaving(false);
    if (rpcError) {
      setError(rpcError.message || "Failed to record expense.");
    } else {
      playPosSound("success", soundEnabled);
      setOperationsPanel(null);
      setMoneyOutAmount("");
      setMoneyOutNote("");
    }
  }

  // Complete Sale
  async function completeSale() {
    if (busy || !currentTab.cart.length) return;
    setError(null);

    if (currentTab.paymentChoice === "khata" && !selectedCustomer) {
      playPosSound("warning", soundEnabled);
      setError("Select or add a customer to record sale on Khata (Credit).");
      setCustomerOpen(true);
      customerSearchRef.current?.focus();
      return;
    }

    if (currentTab.paymentChoice === "cash") {
      const received = Number(currentTab.cashReceived) || 0;
      if (received + 0.005 < total) {
        playPosSound("warning", soundEnabled);
        setError(`Cash received (${money(received)}) is less than total payable (${money(total)}).`);
        return;
      }
    }

    const splitTotal = currentTab.splitRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    if (currentTab.paymentChoice === "split") {
      if (!currentTab.splitRows.length) {
        setError("Add at least one payment row in Split.");
        return;
      }
      if (Math.abs(splitTotal - total) > 0.01) {
        playPosSound("warning", soundEnabled);
        setError(`Split payments (${money(splitTotal)}) must equal total (${money(total)}).`);
        return;
      }
    }

    const paymentPayload = (() => {
      if (currentTab.paymentChoice === "khata") return [];
      if (currentTab.paymentChoice === "cash") {
        return [
          {
            method: "cash",
            instrument_id: cashInstrument?.id ?? "",
            amount: total,
          },
        ];
      }
      if (currentTab.paymentChoice === "upi") {
        return [
          {
            method: "upi",
            instrument_id: upiInstrument?.id ?? "",
            amount: total,
          },
        ];
      }
      return currentTab.splitRows.map((r) => {
        const inst = instruments.find((i) => i.id === r.instrumentId);
        return {
          method: methodFromInstrument(inst),
          instrument_id: r.instrumentId,
          amount: Number(r.amount) || 0,
        };
      });
    })();

    const itemPayload = totals.lines.map((taxLine, idx) => {
      const cLine = currentTab.cart[idx];
      return {
        product_id: cLine.kind === "product" ? cLine.id : null,
        service_id: cLine.kind === "service" ? cLine.id : null,
        description: cLine.name,
        qty: cLine.qty,
        rate: cLine.rate,
        amount: taxLine.grossAmount,
        cost_price: cLine.costPrice,
        hsn_sac: taxLine.hsnSac,
        taxable_value: taxLine.taxableValue,
        gst_rate: taxLine.gstRate,
        cgst_rate: taxLine.cgstRate,
        cgst_amount: taxLine.cgstAmount,
        sgst_rate: taxLine.sgstRate,
        sgst_amount: taxLine.sgstAmount,
        igst_rate: taxLine.igstRate,
        igst_amount: taxLine.igstAmount,
        tax_treatment: taxLine.taxTreatment,
      };
    });

    try {
      setBusy(true);
      const { data, error: rpcError } = await supabase.rpc("create_sale", {
        p_customer_id: selectedCustomer?.id ?? null,
        p_invoice_date: indiaToday(),
        p_subtotal: subtotal,
        p_discount: discountValue,
        p_total: total,
        p_payments: paymentPayload,
        p_items: itemPayload,
        p_previous_due: dueToCollect,
        p_previous_due_method: currentTab.paymentChoice === "khata" ? "cash" : currentTab.paymentChoice,
        p_previous_due_instrument_id: null,
        p_advance_used: advanceToUse,
        p_place_of_supply: totals.placeOfSupply,
        p_supply_type: totals.supplyType,
        p_customer_gstin: totals.customerGstin,
        p_b2b_or_b2c: totals.b2bCategory,
        p_total_taxable_value: totals.totalTaxableValue,
        p_total_cgst: totals.totalCgst,
        p_total_sgst: totals.totalSgst,
        p_total_igst: totals.totalIgst,
        p_is_reverse_charge: false,
      });

      if (rpcError) throw new Error(rpcError.message);
      const result = (data ?? {}) as Partial<SuccessState> & { invoice_number?: string | null };

      playPosSound("success", soundEnabled);

      setSuccess({
        invoiceId: String((result as any).id ?? ""),
        invoiceNumber: String(result.invoice_number ?? "INV-SUCCESS"),
        total: Number(result.total ?? total),
        paid: Number(result.paid ?? (currentTab.paymentChoice === "khata" ? 0 : total)),
        due: Number(result.due ?? (currentTab.paymentChoice === "khata" ? total : 0)),
        customerName: selectedCustomer?.name,
        customerPhone: selectedCustomer?.phone ?? undefined,
      });
    } catch (err: any) {
      playPosSound("warning", soundEnabled);
      setError(err?.message || "Failed to complete transaction.");
    } finally {
      setBusy(false);
    }
  }

  function handleResetAfterSale() {
    setSuccess(null);
    setWhatsappStatus("idle");
    setWhatsappMsg("");
    clearActiveCart();
    window.setTimeout(() => itemSearchRef.current?.focus(), 100);
  }

  async function sendWhatsAppInvoice() {
    if (!success?.invoiceId || !success?.customerPhone) return;
    try {
      setWhatsappStatus("sending");
      setWhatsappMsg("");
      const res = await fetch("/api/whatsapp/send-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: success.invoiceId,
          phone: success.customerPhone,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setWhatsappStatus("sent");
        setWhatsappMsg(`Invoice sent to ${success.customerPhone}!`);
      } else {
        setWhatsappStatus("error");
        setWhatsappMsg(data.error || "Failed to send WhatsApp.");
      }
    } catch {
      setWhatsappStatus("error");
      setWhatsappMsg("Network error sending WhatsApp invoice.");
    }
  }

  const remainingSplit = total - currentTab.splitRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const cashChange = Math.max(0, (Number(currentTab.cashReceived) || 0) - total);

  return (
    <div className="absolute inset-0 z-[100] flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-slate-900 text-slate-100 antialiased select-none font-sans">
      {/* CafeERP POS reference design */}
      <div className="hidden" data-pos-money-out="reference">
        <PosOperations
          cart={currentTab.cart as any}
          total={total}
          discount={currentTab.discount}
          customerId={currentTab.customerId}
          customerName={selectedCustomer?.name ?? ""}
          paymentChoice={currentTab.paymentChoice}
          cashReceived={currentTab.cashReceived}
          splitRows={currentTab.splitRows}
          instruments={instruments}
          supabase={supabase}
          onRestore={() => {}}
          onReset={() => {}}
        />
      </div>
      {/* 1. TOP COMMAND BAR */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-3.5 shadow-md">
        {/* Brand & Register */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/25">
            <ShoppingCart className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-black tracking-tight text-white">
              <span className="truncate">{shopName || "CafeERP"}</span>
              <span className="text-slate-600">/</span>
              <span className="text-cyan-400 font-extrabold uppercase">POS 2.0</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-400">
              <span className="inline-flex items-center gap-1 text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
              </span>
              <span>•</span>
              <span className="truncate">{operatorName}</span>
            </div>
          </div>
        </div>

        {/* Multi-Cart Order Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-[42vw] px-2 [scrollbar-width:none]">
          {tabs.map((tab, idx) => {
            const isActive = tab.id === activeTabId;
            const tabGross = tab.cart.reduce((s, l) => s + l.rate * l.qty, 0);
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => switchTab(tab.id)}
                className={`group flex h-9 items-center gap-2 rounded-xl px-3 text-[11px] font-black transition-all ${
                  isActive
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/30 ring-1 ring-blue-400/40"
                    : "bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                <span>{tab.title}</span>
                {tabGross > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold ${
                      isActive ? "bg-blue-900/60 text-blue-200" : "bg-slate-700 text-slate-300"
                    }`}
                  >
                    {money(tabGross)}
                  </span>
                )}
                {tabs.length > 1 && (
                  <span
                    onClick={(e) => closeTab(tab.id, e)}
                    className="flex h-4 w-4 items-center justify-center rounded hover:bg-black/20 text-white/60 hover:text-white"
                  >
                    ×
                  </span>
                )}
              </button>
            );
          })}
          {tabs.length < 5 && (
            <button
              type="button"
              onClick={addNewTab}
              title="Add New Cart Tab (F2)"
              className="flex h-9 items-center gap-1 rounded-xl border border-dashed border-slate-700 px-2.5 text-[10px] font-black text-slate-400 hover:border-blue-500 hover:text-blue-400 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Tab</span>
            </button>
          )}
        </div>

        {/* Global Action Toolbar */}
        <div className="flex items-center gap-2">
          {/* Audio toggle */}
          <button
            type="button"
            onClick={toggleSound}
            title={soundEnabled ? "Sound ON (Click to mute)" : "Sound MUTED (Click to unmute)"}
            className={`flex h-8 w-8 items-center justify-center rounded-xl border transition ${
              soundEnabled
                ? "border-slate-700 bg-slate-800/80 text-cyan-400"
                : "border-slate-800 bg-slate-900 text-slate-600"
            }`}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>

          {/* View mode toggle */}
          <div className="flex h-8 rounded-xl border border-slate-700 bg-slate-800/80 p-0.5">
            <button
              type="button"
              onClick={() => toggleViewMode("grid")}
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${
                viewMode === "grid" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
              title="Visual Card Grid"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => toggleViewMode("list")}
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${
                viewMode === "list" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
              title="High-Density Fast List"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>

          <span className="h-5 w-px bg-slate-800 mx-0.5" />

          {/* Money Out */}
          <button
            type="button"
            onClick={() => setOperationsPanel("money-out")}
            className="flex h-8 items-center gap-1.5 rounded-xl border border-rose-900/60 bg-rose-950/40 px-2.5 text-[10px] font-black text-rose-300 hover:bg-rose-900/40 transition"
          >
            <ArrowDownToLine className="h-3.5 w-3.5 text-rose-400" />
            <span className="hidden sm:inline">Money Out</span>
          </button>

          {/* Today's Sales */}
          <button
            type="button"
            onClick={() => void openTodaySales()}
            className="flex h-8 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-2.5 text-[10px] font-black text-slate-300 hover:bg-slate-700 transition"
          >
            <ReceiptText className="h-3.5 w-3.5 text-blue-400" />
            <span className="hidden sm:inline">Today's Sales</span>
          </button>

          {/* Held Bills */}
          <button
            type="button"
            onClick={() => {
              try {
                const raw = localStorage.getItem(HELD_STORAGE_KEY);
                setHeldBills(raw ? JSON.parse(raw) : []);
              } catch {}
              setOperationsPanel("held");
            }}
            className="flex h-8 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-2.5 text-[10px] font-black text-slate-300 hover:bg-slate-700 transition"
          >
            <Pause className="h-3.5 w-3.5 text-amber-400" />
            <span className="hidden sm:inline">Held</span>
          </button>
        </div>
      </header>

      {/* 2. MAIN WORKSPACE: Dual Column Layout */}
      <main className="grid min-h-0 flex-1 [grid-template-columns:minmax(0,1fr)_420px] max-[1100px]:[grid-template-columns:minmax(0,1fr)_370px] max-[880px]:[grid-template-columns:minmax(0,1fr)_330px]">
        {/* LEFT COLUMN: Catalog Explorer */}
        <section className="flex min-h-0 flex-col border-r border-slate-800 bg-slate-900/60">
          {/* Search & Scope Ribbon */}
          <div className="flex flex-col gap-2 border-b border-slate-800 bg-slate-950 p-3">
            <div className="flex items-center gap-1.5">
              <div data-pos-header-search="reference" className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  ref={itemSearchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search item, scan barcode (F4)..."
                  className="h-10 w-full rounded-xl border border-slate-800 bg-slate-900 pl-9 pr-14 text-xs font-bold text-white placeholder:text-slate-500 outline-none transition focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-9 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
                  >
                    ×
                  </button>
                ) : null}
                <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[9px] font-black text-slate-400">
                  F4
                </kbd>
              </div>

              {/* Scope Toggles */}
              <div className="flex h-10 rounded-xl border border-slate-800 bg-slate-900 p-1">
                {[
                  { id: "all", label: "ALL" },
                  { id: "services", label: "SERVICES" },
                  { id: "products", label: "PRODUCTS" },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setScope(s.id as any);
                      setCategory("all");
                    }}
                    className={`rounded-lg px-2.5 text-[10px] font-black transition ${
                      scope === s.id
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Category Ribbon */}
            <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pt-1">
              <button
                type="button"
                onClick={() => setCategory("all")}
                className={`shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-black transition ${
                  category === "all"
                    ? "bg-cyan-500 text-slate-950 shadow-sm"
                    : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                All Categories ({catalog.length})
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-black transition ${
                    category === cat.id
                      ? "bg-cyan-500 text-slate-950 shadow-sm"
                      : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  {cat.name} ({cat.count})
                </button>
              ))}
            </div>
          </div>

          {/* Catalog Items Container */}
          <div className="min-h-0 flex-1 overflow-y-auto p-3 overscroll-contain">
            {viewMode === "grid" ? (
              /* TOUCH CARD GRID */
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
                {filteredItems.map((item) => {
                  const stock = item.kind === "product" ? Number(item.stock_qty ?? 0) : null;
                  const inCartQty = currentTab.cart.find((l) => l.key === `${item.kind}:${item.id}`)?.qty ?? 0;
                  const isOutOfStock = item.kind === "product" && stock !== null && stock <= 0;

                  return (
                    <button
                      key={`${item.kind}:${item.id}`}
                      type="button"
                      disabled={isOutOfStock}
                      onClick={() => addItem(item)}
                      className={`group relative flex flex-col justify-between rounded-2xl border p-3.5 text-left transition-all active:scale-[0.98] ${
                        isOutOfStock
                          ? "border-slate-800/80 bg-slate-950/40 opacity-40 cursor-not-allowed"
                          : inCartQty > 0
                          ? "border-blue-500/80 bg-slate-800/90 shadow-md shadow-blue-500/10 ring-1 ring-blue-500/30"
                          : "border-slate-800 bg-slate-950/70 hover:border-slate-700 hover:bg-slate-800/60"
                      }`}
                    >
                      {/* Top ribbon: kind & category */}
                      <div className="flex items-center justify-between gap-1 mb-2">
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                            item.kind === "service"
                              ? "bg-cyan-500/15 text-cyan-400"
                              : "bg-amber-500/15 text-amber-400"
                          }`}
                        >
                          {item.kind}
                        </span>
                        {inCartQty > 0 && (
                          <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[9px] font-black text-white shadow-sm animate-pulse">
                            ×{inCartQty} in cart
                          </span>
                        )}
                      </div>

                      {/* Item Name */}
                      <div className="min-w-0 mb-3">
                        <h4 className="line-clamp-2 text-xs font-black text-white group-hover:text-cyan-400 transition">
                          {item.name}
                        </h4>
                        <p className="mt-0.5 truncate text-[10px] text-slate-400 font-semibold">
                          {item.category_name || "General"}
                        </p>
                      </div>

                      {/* Price & Stock footer */}
                      <div className="flex items-end justify-between border-t border-slate-800/80 pt-2">
                        <div>
                          <div className="text-[9px] text-slate-500 font-bold uppercase">Price</div>
                          <div className="text-sm font-black text-cyan-400">{money(Number(item.sale_price) || 0)}</div>
                        </div>
                        <div className="text-right">
                          <span
                            className={`text-[9px] font-bold ${
                              stock === null
                                ? "text-slate-500"
                                : stock <= 3
                                ? "text-rose-400"
                                : "text-slate-400"
                            }`}
                          >
                            {stock === null ? "Service" : stock <= 0 ? "Out" : `${stock} left`}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              /* HIGH-DENSITY FAST TABLE */
              <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 bg-slate-900/90 text-[9px] font-black uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-3 py-2.5">Type</th>
                      <th className="px-3 py-2.5">Item Name</th>
                      <th className="px-3 py-2.5">Category</th>
                      <th className="px-3 py-2.5">Stock</th>
                      <th className="px-3 py-2.5 text-right">Price</th>
                      <th className="px-3 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    {filteredItems.map((item) => {
                      const stock = item.kind === "product" ? Number(item.stock_qty ?? 0) : null;
                      const inCartQty = currentTab.cart.find((l) => l.key === `${item.kind}:${item.id}`)?.qty ?? 0;
                      const isOutOfStock = item.kind === "product" && stock !== null && stock <= 0;

                      return (
                        <tr
                          key={`${item.kind}:${item.id}`}
                          className={`hover:bg-slate-800/50 transition ${isOutOfStock ? "opacity-40" : ""}`}
                        >
                          <td className="px-3 py-2.5">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[8px] font-black uppercase ${
                                item.kind === "service"
                                  ? "bg-cyan-500/20 text-cyan-300"
                                  : "bg-amber-500/20 text-amber-300"
                              }`}
                            >
                              {item.kind === "service" ? "S" : "P"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-bold text-white">
                            <div className="flex items-center gap-1.5">
                              <span>{item.name}</span>
                              {inCartQty > 0 && (
                                <span className="rounded-full bg-blue-600 px-1.5 py-0.2 text-[8px] font-black text-white">
                                  ×{inCartQty}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-slate-400 font-semibold">{item.category_name || "—"}</td>
                          <td className="px-3 py-2.5 text-slate-400 font-mono">
                            {stock === null ? "—" : stock}
                          </td>
                          <td className="px-3 py-2.5 text-right font-black text-cyan-400">
                            {money(Number(item.sale_price) || 0)}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <button
                              type="button"
                              disabled={isOutOfStock}
                              onClick={() => addItem(item)}
                              className="inline-flex h-7 items-center justify-center gap-1 rounded-lg bg-blue-600 px-2.5 text-[10px] font-black text-white hover:bg-blue-500 disabled:opacity-40 shadow-sm"
                            >
                              <Plus className="h-3 w-3" /> Add
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!filteredItems.length && (
              <div className="flex h-56 flex-col items-center justify-center text-center">
                <Search className="h-8 w-8 text-slate-700" />
                <p className="mt-3 text-xs font-black text-slate-400">No matching items</p>
                <p className="text-[10px] text-slate-600">Try changing your search term or category filter.</p>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT COLUMN: Active Order Slip & Tender Pad */}
        <aside className="flex min-h-0 flex-col bg-slate-950 border-l border-slate-800">
          {/* Order Header */}
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-800 px-4 bg-slate-900/60">
            <div>
              <div className="text-xs font-black uppercase tracking-wider text-white">
                {currentTab.title} Slip
              </div>
              <div className="text-[10px] text-slate-400 font-semibold">
                {currentTab.cart.reduce((s, l) => s + l.qty, 0)} items · {money(total)}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={holdCurrentBill}
                title="Park this bill to finish later"
                className="flex h-7 items-center gap-1 rounded-lg border border-amber-900/50 bg-amber-950/30 px-2 text-[10px] font-black text-amber-300 hover:bg-amber-900/40"
              >
                <Pause className="h-3 w-3" /> Hold
              </button>
              <button
                type="button"
                onClick={clearActiveCart}
                className="rounded-lg px-2 py-1 text-[10px] font-black text-rose-400 hover:bg-rose-950/40"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Customer Banner & Selector */}
          <div className="shrink-0 border-b border-slate-800 bg-slate-900/40 px-3.5 py-2.5">
            <div data-pos-customer-action="reference" className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Customer</span>
              {selectedCustomer ? (
                <button
                  type="button"
                  onClick={() => updateCurrentTab({ customerId: "" })}
                  className="text-[9px] font-black text-cyan-400 hover:underline"
                >
                  Change
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setNewCustomerOpen(true)}
                  className="flex items-center gap-1 text-[9px] font-black text-cyan-400 hover:underline"
                >
                  <UserPlus className="h-3 w-3" /> + New Customer
                </button>
              )}
            </div>

            {/* Customer Search input */}
            <div className="relative">
              <CircleUserRound className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                ref={customerSearchRef}
                value={selectedCustomer ? selectedCustomer.name : currentTab.customerSearch}
                onChange={(e) => {
                  if (selectedCustomer) updateCurrentTab({ customerId: "" });
                  updateCurrentTab({ customerSearch: e.target.value });
                  setCustomerOpen(true);
                }}
                onFocus={() => setCustomerOpen(true)}
                placeholder="Walk-in Customer / Search Name & Phone..."
                className="h-8 w-full rounded-xl border border-slate-800 bg-slate-950 pl-8 pr-3 text-xs font-bold text-white outline-none focus:border-cyan-500"
              />

              {customerOpen && !selectedCustomer && (
                <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
                  <div className="max-h-48 overflow-y-auto p-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        updateCurrentTab({ customerId: "", customerSearch: "" });
                        setCustomerOpen(false);
                      }}
                      className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-xs font-bold text-slate-300 hover:bg-slate-800"
                    >
                      Walk-in Customer (Guest)
                    </button>
                    {customerMatches.map((cust) => (
                      <button
                        key={cust.id}
                        type="button"
                        onClick={() => {
                          updateCurrentTab({ customerId: cust.id, customerSearch: "" });
                          setCustomerOpen(false);
                          playPosSound("click", soundEnabled);
                        }}
                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left hover:bg-blue-600/20"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-xs font-bold text-white">{cust.name}</div>
                          <div className="text-[9px] text-slate-400">{cust.phone || cust.code || "No Phone"}</div>
                        </div>
                        {Number(cust.balance ?? 0) !== 0 && (
                          <span
                            className={`text-[9px] font-black font-mono ${
                              Number(cust.balance) > 0 ? "text-rose-400" : "text-emerald-400"
                            }`}
                          >
                            {Number(cust.balance) > 0 ? `Due ${money(Number(cust.balance))}` : `Adv ${money(Math.abs(Number(cust.balance)))}`}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Selected Customer Balances & Actions */}
            {selectedCustomer && (
              <div className="mt-2 space-y-1 rounded-xl border border-slate-800 bg-slate-950/70 p-2 text-[10px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-semibold">{selectedCustomer.phone || "Account Attached"}</span>
                  <span
                    className={`font-black ${
                      customerBalance > 0
                        ? "text-rose-400"
                        : customerBalance < 0
                        ? "text-emerald-400"
                        : "text-slate-500"
                    }`}
                  >
                    {customerBalance > 0
                      ? `Outstanding Due: ${money(customerBalance)}`
                      : customerBalance < 0
                      ? `Advance Credit: ${money(Math.abs(customerBalance))}`
                      : "Account Clear"}
                  </span>
                </div>

                {/* Due collection toggle */}
                {customerHasDue && (
                  <label className="flex items-center gap-2 pt-1 border-t border-slate-800 cursor-pointer text-amber-300">
                    <input
                      type="checkbox"
                      checked={currentTab.collectPreviousDue}
                      onChange={(e) => updateCurrentTab({ collectPreviousDue: e.target.checked })}
                      className="rounded border-slate-700 bg-slate-800 text-cyan-500"
                    />
                    <span className="font-bold text-[9px]">Collect Previous Due ({money(customerBalance)}) with this bill</span>
                  </label>
                )}

                {/* Advance deduction toggle */}
                {customerHasAdvance && (
                  <label className="flex items-center gap-2 pt-1 border-t border-slate-800 cursor-pointer text-emerald-300">
                    <input
                      type="checkbox"
                      checked={currentTab.useAdvance}
                      onChange={(e) => updateCurrentTab({ useAdvance: e.target.checked })}
                      className="rounded border-slate-700 bg-slate-800 text-cyan-500"
                    />
                    <span className="font-bold text-[9px]">
                      Use Advance Credit ({money(Math.min(totals.invoiceTotal, Math.abs(customerBalance)))})
                    </span>
                  </label>
                )}
              </div>
            )}
          </div>

          {/* Cart Lines Stepper Section */}
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 overscroll-contain">
            {currentTab.cart.map((line) => (
              <div
                key={line.key}
                className="flex items-center gap-2 border-b border-slate-800/80 py-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-black text-white">{line.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {money(line.rate)} · {line.unit}
                  </div>
                </div>

                {/* Large 38px Touch Steppers */}
                <div className="flex items-center rounded-xl border border-slate-800 bg-slate-900">
                  <button
                    type="button"
                    onClick={() => updateQty(line.key, line.qty - 1)}
                    className="flex h-8 w-8 items-center justify-center text-slate-400 hover:text-white"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-7 text-center font-mono font-black text-white">{line.qty}</span>
                  <button
                    type="button"
                    onClick={() => updateQty(line.key, line.qty + 1)}
                    className="flex h-8 w-8 items-center justify-center text-slate-400 hover:text-white"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Amount */}
                <div className="w-18 text-right font-black font-mono text-cyan-400">
                  {money(line.qty * line.rate)}
                </div>

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => removeLine(line.key)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-950/40 hover:text-rose-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            {!currentTab.cart.length && (
              <div className="flex h-44 flex-col items-center justify-center text-center">
                <ShoppingCart className="h-7 w-7 text-slate-700" />
                <p className="mt-2 text-xs font-black text-slate-400">Cart is empty</p>
                <p className="text-[10px] text-slate-600">Scan barcode or tap an item on the left.</p>
              </div>
            )}
          </div>

          {/* Financial Summary & Totalizer */}
          <div className="shrink-0 border-t border-slate-800 bg-slate-900/60 p-3 space-y-2">
            {/* Discount row with quick chips */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Discount</span>
              <div className="flex items-center gap-1">
                {["5%", "10%", "20", "50"].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => {
                      if (chip.includes("%")) {
                        updateCurrentTab({ discount: chip.replace("%", ""), discountType: "percent" });
                      } else {
                        updateCurrentTab({ discount: chip, discountType: "flat" });
                      }
                      playPosSound("click", soundEnabled);
                    }}
                    className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-0.5 text-[9px] font-bold text-slate-400 hover:border-slate-700 hover:text-white"
                  >
                    {chip.includes("%") ? chip : `₹${chip}`}
                  </button>
                ))}
                <input
                  value={currentTab.discount}
                  onChange={(e) => updateCurrentTab({ discount: e.target.value })}
                  placeholder="0.00"
                  className="h-7 w-18 rounded-lg border border-slate-800 bg-slate-950 px-2 text-right text-xs font-black font-mono text-white outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            {/* Financial Ledger lines */}
            <div className="space-y-1 text-[10px] font-semibold text-slate-400">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-mono text-slate-200">{money(subtotal)}</span>
              </div>
              {discountValue > 0 && (
                <div className="flex justify-between text-rose-400 font-bold">
                  <span>Discount</span>
                  <span className="font-mono">- {money(discountValue)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>GST Tax</span>
                <span className="font-mono text-slate-200">{money(totalTax)}</span>
              </div>
              {dueToCollect > 0 && (
                <div className="flex justify-between text-amber-400 font-bold">
                  <span>+ Previous Due Collected</span>
                  <span className="font-mono">+{money(dueToCollect)}</span>
                </div>
              )}
              {advanceToUse > 0 && (
                <div className="flex justify-between text-emerald-400 font-bold">
                  <span>- Advance Credit Used</span>
                  <span className="font-mono">-{money(advanceToUse)}</span>
                </div>
              )}
            </div>

            {/* OLED GRAND TOTAL DISPLAY */}
            <div className="flex items-center justify-between rounded-xl bg-slate-950 border border-slate-800 p-2.5 shadow-inner">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Payable</span>
              <span className="text-2xl font-black font-mono tracking-tight text-cyan-400">
                {money(total)}
              </span>
            </div>

            {/* Payment Tender Selector */}
            <div className="grid grid-cols-4 gap-1 pt-1">
              {[
                { id: "cash", label: "Cash" },
                { id: "upi", label: "UPI QR" },
                { id: "khata", label: "Khata" },
                { id: "split", label: "Split" },
              ].map((p) => {
                const isSelected = currentTab.paymentChoice === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectPayment(p.id as any)}
                    className={`h-9 rounded-xl text-[10px] font-black uppercase tracking-wide transition ${
                      isSelected
                        ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 font-extrabold"
                        : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800/60"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* CASH TENDER CONTROLS */}
            {currentTab.paymentChoice === "cash" && currentTab.cart.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5 space-y-2">
                <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
                  <button
                    type="button"
                    onClick={setCashTenderExact}
                    className="shrink-0 rounded-lg bg-emerald-950/60 border border-emerald-800/60 px-2 py-1 text-[9px] font-black text-emerald-300 hover:bg-emerald-900/60"
                  >
                    Exact
                  </button>
                  <button
                    type="button"
                    onClick={roundCashNext50}
                    className="shrink-0 rounded-lg bg-slate-900 border border-slate-800 px-2 py-1 text-[9px] font-bold text-slate-300 hover:bg-slate-800"
                  >
                    Next ₹50
                  </button>
                  {[100, 200, 500].map((note) => (
                    <button
                      key={note}
                      type="button"
                      onClick={() => addCashNote(note)}
                      className="shrink-0 rounded-lg bg-slate-900 border border-slate-800 px-2 py-1 text-[9px] font-bold text-slate-300 hover:bg-slate-800"
                    >
                      +₹{note}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase text-slate-400">Cash Received</span>
                  <input
                    value={currentTab.cashReceived}
                    onChange={(e) => updateCurrentTab({ cashReceived: e.target.value })}
                    placeholder="0.00"
                    className="h-8 w-28 rounded-lg border border-slate-800 bg-slate-900 px-2 text-right font-mono font-black text-sm text-white outline-none focus:border-cyan-500"
                  />
                </div>

                {cashChange > 0 && (
                  <div className="flex items-center justify-between rounded-lg bg-emerald-950/40 border border-emerald-900/60 px-2.5 py-1.5 text-emerald-300 font-bold text-xs">
                    <span>Change to return:</span>
                    <span className="font-black font-mono text-sm">{money(cashChange)}</span>
                  </div>
                )}
              </div>
            )}

            {/* UPI ON-SCREEN DYNAMIC QR CODE */}
            {currentTab.paymentChoice === "upi" && currentTab.cart.length > 0 && (
              <div className="flex flex-col items-center justify-center p-3 rounded-xl border border-cyan-900/60 bg-slate-950">
                <div className="p-2 bg-white rounded-xl shadow-lg">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="UPI Dynamic QR" className="h-32 w-32 object-contain" />
                  ) : (
                    <div className="h-32 w-32 flex items-center justify-center text-[10px] text-slate-400">
                      Generating QR...
                    </div>
                  )}
                </div>
                <div className="mt-2 text-center">
                  <p className="text-xs font-black text-white">
                    Scan with PhonePe / GPay / Paytm: <span className="text-cyan-400">{money(total)}</span>
                  </p>
                  <p className="text-[10px] font-mono text-slate-400 mt-0.5">{resolvedUpiId || "Shop UPI Account"}</p>
                </div>
              </div>
            )}

            {/* KHATA DUE SUMMARY */}
            {currentTab.paymentChoice === "khata" && currentTab.cart.length > 0 && (
              <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-2.5 text-[10px] space-y-1">
                <div className="text-amber-300 font-bold flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>Customer Ledger Invoice (Unpaid Credit)</span>
                </div>
                <p className="text-slate-400">
                  Total of {money(total)} will be debited to {selectedCustomer?.name || "the selected customer's"} khata ledger.
                </p>
              </div>
            )}

            {/* SPLIT PAYMENT ROWS */}
            {currentTab.paymentChoice === "split" && currentTab.cart.length > 0 && (
              <div className="rounded-xl border border-violet-900/50 bg-slate-950 p-2.5 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-bold">
                  <span className="text-violet-300">Multi-Account Split</span>
                  <span
                    className={
                      Math.abs(remainingSplit) < 0.01
                        ? "text-emerald-400 font-black"
                        : remainingSplit < 0
                        ? "text-rose-400 font-black"
                        : "text-amber-400 font-black"
                    }
                  >
                    {Math.abs(remainingSplit) < 0.01 ? "Balanced" : `Remaining: ${money(remainingSplit)}`}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {currentTab.splitRows.map((row) => (
                    <div key={row.id} className="flex items-center gap-1.5">
                      <select
                        value={row.instrumentId}
                        onChange={(e) => updateSplitRow(row.id, { instrumentId: e.target.value })}
                        className="h-8 flex-1 rounded-lg border border-slate-800 bg-slate-900 px-2 text-[10px] font-bold text-white outline-none"
                      >
                        {splitInstrumentOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <input
                        value={row.amount}
                        onChange={(e) => updateSplitRow(row.id, { amount: e.target.value })}
                        placeholder="0.00"
                        className="h-8 w-24 rounded-lg border border-slate-800 bg-slate-900 px-2 text-right font-mono font-bold text-xs text-white outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => removeSplitRow(row.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-400 hover:bg-rose-950/40"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addSplitRow}
                  className="text-[9px] font-black text-violet-400 hover:text-violet-300"
                >
                  + Add Split Row
                </button>
              </div>
            )}

            {/* Errors */}
            {error && (
              <div className="rounded-xl border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-[10px] font-bold text-rose-300">
                {error}
              </div>
            )}

            {/* MAIN CHECKOUT BUTTON */}
            <button
              type="button"
              disabled={!currentTab.cart.length || busy}
              onClick={() => void completeSale()}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-blue-600/30 hover:from-blue-500 hover:to-cyan-400 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {busy ? (
                <span>Recording Sale...</span>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Complete Sale • {money(total)} (F9)</span>
                </>
              )}
            </button>
          </div>
        </aside>
      </main>

      {/* 3. POST-SALE ACTION HUB (SUCCESS MODAL) */}
      {success && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40">
              <Check className="h-7 w-7" />
            </div>

            <h2 className="mt-4 text-xl font-black text-white">Sale Completed!</h2>
            <p className="mt-1 font-mono text-sm font-bold text-cyan-400">{success.invoiceNumber}</p>

            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-left space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Total Amount:</span>
                <strong className="text-white font-mono">{money(success.total)}</strong>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Amount Paid:</span>
                <strong className="text-emerald-400 font-mono">{money(success.paid)}</strong>
              </div>
              {success.due > 0 && (
                <div className="flex justify-between text-rose-400">
                  <span>Balance Due (Khata):</span>
                  <strong className="font-mono">{money(success.due)}</strong>
                </div>
              )}
              {success.customerName && (
                <div className="flex justify-between text-slate-400 pt-1 border-t border-slate-800">
                  <span>Customer:</span>
                  <span className="font-bold text-white">{success.customerName}</span>
                </div>
              )}
            </div>

            {/* Instant Action Grid */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <a
                href={`/receipt/${success.invoiceId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 text-xs font-black text-white hover:bg-slate-700 transition shadow-sm"
              >
                <Printer className="h-4 w-4 text-cyan-400" />
                <span>Print 80mm</span>
              </a>

              {success.customerPhone ? (
                <button
                  type="button"
                  onClick={() => void sendWhatsAppInvoice()}
                  disabled={whatsappStatus === "sending" || whatsappStatus === "sent"}
                  className="flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-800 bg-emerald-950/50 text-xs font-black text-emerald-300 hover:bg-emerald-900/50 transition disabled:opacity-50"
                >
                  <MessageSquare className="h-4 w-4" />
                  <span>
                    {whatsappStatus === "sending"
                      ? "Sending..."
                      : whatsappStatus === "sent"
                      ? "Sent ✓"
                      : "WhatsApp"}
                  </span>
                </button>
              ) : (
                <a
                  href={`/receipt/${success.invoiceId}/a4`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 text-xs font-black text-white hover:bg-slate-700 transition"
                >
                  <ExternalLink className="h-4 w-4 text-blue-400" />
                  <span>A4 Invoice</span>
                </a>
              )}
            </div>

            {whatsappMsg && (
              <p
                className={`mt-2 text-[10px] font-bold ${
                  whatsappStatus === "sent" ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {whatsappMsg}
              </p>
            )}

            <button
              type="button"
              autoFocus
              onClick={handleResetAfterSale}
              className="mt-4 flex h-11 w-full items-center justify-center rounded-xl bg-blue-600 text-xs font-black uppercase tracking-wider text-white hover:bg-blue-500 transition shadow-lg shadow-blue-600/30"
            >
              Start Next Bill (Enter)
            </button>
          </div>
        </div>
      )}

      {/* 4. DRAWER: RECALL HELD BILLS */}
      {operationsPanel === "held" && (
        <div className="fixed inset-0 z-[160] bg-slate-950/60 backdrop-blur-sm" onMouseDown={() => setOperationsPanel(null)}>
          <aside
            className="absolute right-0 top-0 flex h-full w-[min(440px,100vw)] flex-col border-l border-slate-800 bg-slate-900 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 px-5">
              <div>
                <h3 className="text-sm font-black text-white">Parked / Held Bills</h3>
                <p className="text-[10px] text-slate-400 font-semibold">Local terminal drafts</p>
              </div>
              <button
                type="button"
                onClick={() => setOperationsPanel(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-2.5">
              {!heldBills.length ? (
                <div className="flex h-52 flex-col items-center justify-center text-center">
                  <Pause className="h-8 w-8 text-slate-700" />
                  <p className="mt-2 text-xs font-black text-slate-400">No held bills</p>
                  <p className="text-[10px] text-slate-600">Click Hold on an active bill to park it here.</p>
                </div>
              ) : (
                heldBills.map((draft, idx) => (
                  <div
                    key={draft.id}
                    className="rounded-2xl border border-slate-800 bg-slate-950 p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-black text-white">
                          Draft #{heldBills.length - idx} • {draft.customerName}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {draft.itemCount} items · {new Date(draft.heldAt).toLocaleTimeString()}
                        </div>
                      </div>
                      <div className="text-sm font-black text-cyan-400 font-mono">{money(draft.total)}</div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => recallHeldDraft(draft)}
                        className="flex-1 h-8 rounded-xl bg-blue-600 text-[10px] font-black uppercase text-white hover:bg-blue-500 shadow-sm"
                      >
                        Recall to Active Bill
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteHeldDraft(draft.id)}
                        className="h-8 w-8 flex items-center justify-center rounded-xl border border-rose-900/60 bg-rose-950/40 text-rose-400 hover:bg-rose-900/60"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      )}

      {/* 5. DRAWER: TODAY'S SALES */}
      {operationsPanel === "today" && (
        <div className="fixed inset-0 z-[160] bg-slate-950/60 backdrop-blur-sm" onMouseDown={() => setOperationsPanel(null)}>
          <aside
            className="absolute right-0 top-0 flex h-full w-[min(480px,100vw)] flex-col border-l border-slate-800 bg-slate-900 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 px-5">
              <div>
                <h3 className="text-sm font-black text-white">Today's Sales Registry</h3>
                <p className="text-[10px] text-slate-400 font-semibold">{indiaToday()} invoices</p>
              </div>
              <button
                type="button"
                onClick={() => setOperationsPanel(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-slate-800">
              {loadingSales ? (
                <div className="flex h-44 items-center justify-center text-xs font-bold text-slate-400">
                  Loading sales registry...
                </div>
              ) : !todaySales.length ? (
                <div className="flex h-44 flex-col items-center justify-center text-center">
                  <ReceiptText className="h-8 w-8 text-slate-700" />
                  <p className="mt-2 text-xs font-black text-slate-400">No sales recorded today</p>
                </div>
              ) : (
                todaySales.map((sale) => (
                  <div key={sale.id} className="flex items-center justify-between p-4 hover:bg-slate-800/50">
                    <div>
                      <div className="font-mono text-xs font-black text-white">{sale.invoice_number}</div>
                      <div className="text-[10px] text-slate-400">{sale.customers?.name || "Walk-in Customer"}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-black font-mono text-cyan-400">{money(Number(sale.total))}</div>
                      <div
                        className={`text-[9px] font-bold ${
                          Number(sale.due) > 0 ? "text-rose-400" : "text-emerald-400"
                        }`}
                      >
                        {Number(sale.due) > 0 ? `Due ${money(Number(sale.due))}` : "Paid"}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      )}

      {/* 6. MODAL: MONEY OUT (EXPENSE RECORDING) */}
      {operationsPanel === "money-out" && (
        <div className="fixed inset-0 z-[170] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onMouseDown={() => setOperationsPanel(null)}>
          <form
            onSubmit={handleMoneyOut}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <div className="flex items-center gap-1.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400">
                  <ArrowDownToLine className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Record Money Out</h3>
                  <p className="text-[10px] text-slate-400">Petty cash / register outflow</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOperationsPanel(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3.5 p-5">
              <div>
                <label className="mb-1 block text-[10px] font-black uppercase text-slate-400">Amount *</label>
                <input
                  autoFocus
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={moneyOutAmount}
                  onChange={(e) => setMoneyOutAmount(e.target.value)}
                  placeholder="0.00"
                  className="h-10 w-full rounded-xl border border-rose-900/60 bg-rose-950/30 px-3 text-right font-mono text-lg font-black text-white outline-none focus:border-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase text-slate-400">Category *</label>
                  <input
                    required
                    value={moneyOutCategory}
                    onChange={(e) => setMoneyOutCategory(e.target.value)}
                    placeholder="tea, snacks, milk"
                    className="h-9 w-full rounded-xl border border-slate-800 bg-slate-950 px-2.5 text-xs font-bold text-white outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase text-slate-400">Paid From</label>
                  <select
                    value={moneyOutSource}
                    onChange={(e) => setMoneyOutSource(e.target.value)}
                    className="h-9 w-full rounded-xl border border-slate-800 bg-slate-950 px-2 text-xs font-bold text-white outline-none"
                  >
                    <option value="">Cash (Till)</option>
                    {instruments
                      .filter((i) => i.type !== "receivable")
                      .map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-black uppercase text-slate-400">Note / Reason</label>
                <input
                  value={moneyOutNote}
                  onChange={(e) => setMoneyOutNote(e.target.value)}
                  placeholder="e.g. bought stationary"
                  className="h-9 w-full rounded-xl border border-slate-800 bg-slate-950 px-2.5 text-xs font-bold text-white outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex gap-2 border-t border-slate-800 bg-slate-950 px-5 py-3.5">
              <button
                type="button"
                onClick={() => setOperationsPanel(null)}
                className="h-9 flex-1 rounded-xl border border-slate-700 bg-slate-900 text-xs font-black text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={moneyOutSaving}
                className="h-9 flex-1 rounded-xl bg-rose-600 text-xs font-black text-white hover:bg-rose-500 disabled:opacity-50 shadow-md shadow-rose-600/30"
              >
                {moneyOutSaving ? "Recording..." : "Save Expense"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 7. QUICK ADD CUSTOMER MODAL */}
      <PosNewCustomerModal
        open={newCustomerOpen}
        onClose={() => setNewCustomerOpen(false)}
        supabase={supabase}
        onCustomerCreated={(newCust) => {
          setCustomers((curr) => [newCust, ...curr]);
          updateCurrentTab({ customerId: newCust.id, customerSearch: "" });
          playPosSound("success", soundEnabled);
        }}
      />
    </div>
  );
}
