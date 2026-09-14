"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { inr } from "@/lib/format";
import { calculateGstInvoice, type GstInvoiceCalculation } from "@/lib/gst";
import { generateQrDataUrl, generateUpiString } from "@/lib/qr";
import { createClient } from "@/lib/supabase/client";
import PosOperations from "./pos-operations";
import { useDashboardShell } from "@/components/dashboard-shell-context";
import ThemeToggle from "@/components/theme-toggle";
import CloudSyncBadge from "@/components/cloud-sync-badge";
import WhatsAppStatusBadge from "@/components/whatsapp/whatsapp-status-badge";
import Modal, { useBodyScrollLock } from "@/components/ui/modal";
import GlobalQuickAccess from "@/components/global-quick-access";
import GlobalSearch from "@/components/global-search";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleUserRound,
  Clock,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  LayoutGrid,
  List,
  Loader2,
  Menu,
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
import PosCustomItemModal from "./pos-custom-item-modal";
import { playPosSound } from "./pos-sound";
import type {
  CartLine,
  OrderTab,
  PaymentChoice,
  PosCatalogItem,
  PosCategory,
  PosCustomer,
  PosInstrument,
  PosMerchantQr,
  SplitRow,
  SuccessState,
} from "./pos-types";

export type { PosCatalogItem, PosCustomer, PosInstrument, PosMerchantQr, PosCategory };

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
  products: initialProducts,
  services: initialServices,
  customers: initialCustomers,
  instruments,
  merchantQrs = [],
  categories: storeCategories = [],
  initialCustomerId = "",
  defaultUpiId = "",
  shopPhone = "",
  userId = "",
}: {
  shopName: string;
  operatorName: string;
  products: PosCatalogItem[];
  services: PosCatalogItem[];
  customers: PosCustomer[];
  instruments: PosInstrument[];
  merchantQrs?: PosMerchantQr[];
  categories?: PosCategory[];
  initialCustomerId?: string;
  defaultUpiId?: string;
  shopPhone?: string;
  userId?: string;
}) {
  const supabase = createClient();
  const { collapsed, toggleSidebar, setMobileOpen } = useDashboardShell();
  const itemSearchRef = useRef<HTMLInputElement | null>(null);
  const customerSearchRef = useRef<HTMLInputElement | null>(null);

  // Realtime multi-device synchronization (Mobile <-> Web)
  const deviceIdRef = useRef<string>("");
  const isRemoteSyncRef = useRef<boolean>(false);
  const lastSyncTimestampRef = useRef<number>(0);
  const initialMountRef = useRef<boolean>(true);
  const channelRef = useRef<any>(null);
  const channelSubscribedRef = useRef<boolean>(false);
  const [peerDevice, setPeerDevice] = useState<string | null>(null);
  const [syncFlash, setSyncFlash] = useState<string | null>(null);

  if (!deviceIdRef.current && typeof window !== "undefined") {
    let devId = sessionStorage.getItem("cafeerp_pos_device_id");
    if (!devId) {
      devId = "pos_dev_" + Math.random().toString(36).slice(2, 9);
      sessionStorage.setItem("cafeerp_pos_device_id", devId);
    }
    deviceIdRef.current = devId;
  }

  // Dynamic Catalog state (so custom ad-hoc added items appear instantly)
  const [products, setProducts] = useState<PosCatalogItem[]>(initialProducts);
  const [services, setServices] = useState<PosCatalogItem[]>(initialServices);
  const [customItemOpen, setCustomItemOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);

  // Merchant QR state
  const [selectedMerchantQrId, setSelectedMerchantQrId] = useState<string>(
    merchantQrs?.[0]?.id || ""
  );

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

  // 1. Rehydrate draft tabs from localStorage on first mount
  useEffect(() => {
    try {
      const savedTabs = localStorage.getItem(`cafeerp_pos_tabs_${userId || "shared"}`);
      if (savedTabs) {
        const parsed = JSON.parse(savedTabs);
        if (Array.isArray(parsed) && parsed.length > 0) {
          isRemoteSyncRef.current = true;
          setTabs(parsed);
          const savedActiveTab = localStorage.getItem(`cafeerp_pos_active_tab_${userId || "shared"}`);
          if (savedActiveTab && parsed.some((t: OrderTab) => t.id === savedActiveTab)) {
            setActiveTabId(savedActiveTab);
          } else {
            setActiveTabId(parsed[0].id);
          }
        }
      }
    } catch (e) {
      console.warn("Failed to load POS local draft:", e);
    }
  }, [userId]);

  // 2. Persist to localStorage & Broadcast to peer devices (Mobile <-> Web)
  useEffect(() => {
    // Skip the very first initial render so we don't overwrite peer state before rehydration
    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }

    // Always persist to localStorage
    try {
      localStorage.setItem(`cafeerp_pos_tabs_${userId || "shared"}`, JSON.stringify(tabs));
      localStorage.setItem(`cafeerp_pos_active_tab_${userId || "shared"}`, activeTabId);
    } catch {}

    // If change was triggered by an incoming remote sync, don't rebroadcast (prevent infinite loop)
    if (isRemoteSyncRef.current) {
      isRemoteSyncRef.current = false;
      return;
    }

    // Broadcast change to other devices
    if (channelRef.current && channelSubscribedRef.current) {
      const now = Date.now();
      lastSyncTimestampRef.current = now;
      const isMobile =
        typeof window !== "undefined" &&
        (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
          window.innerWidth < 768);
      channelRef.current.send({
        type: "broadcast",
        event: "cart_sync",
        payload: {
          deviceId: deviceIdRef.current,
          deviceType: isMobile ? "Mobile" : "Web",
          tabs,
          activeTabId,
          timestamp: now,
        },
      });
    }
  }, [tabs, activeTabId, userId]);

  // 3. Supabase Realtime Channel for Multi-Device Sync (Mobile <-> Web)
  useEffect(() => {
    if (!supabase) return;

    const isMobile =
      typeof window !== "undefined" &&
      (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        window.innerWidth < 768);
    const myDeviceType = isMobile ? "Mobile" : "Web";
    const myDeviceId = deviceIdRef.current;
    const channelName = `pos-cart-sync:${userId || "shared"}`;

    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false },
        presence: { key: myDeviceId },
      },
    });

    channelRef.current = channel;

    channel
      .on("broadcast", { event: "cart_sync" }, ({ payload }) => {
        if (!payload || payload.deviceId === myDeviceId) return;
        if (payload.timestamp && payload.timestamp < lastSyncTimestampRef.current) {
          return;
        }
        if (payload.timestamp) {
          lastSyncTimestampRef.current = payload.timestamp;
        }

        if (Array.isArray(payload.tabs) && payload.tabs.length > 0) {
          isRemoteSyncRef.current = true;
          setTabs(payload.tabs);
          if (payload.activeTabId) {
            setActiveTabId(payload.activeTabId);
          }
          const fromDevice = payload.deviceType || (myDeviceType === "Mobile" ? "Web" : "Mobile");
          setSyncFlash(`Synced with ${fromDevice}`);
          setTimeout(() => setSyncFlash(null), 3000);
        }
      })
      .on("broadcast", { event: "request_sync" }, ({ payload }) => {
        if (!payload || payload.deviceId === myDeviceId) return;
        setTabs((currentTabs) => {
          setActiveTabId((currentActiveId) => {
            if (channelRef.current && channelSubscribedRef.current) {
              const now = Date.now();
              channelRef.current.send({
                type: "broadcast",
                event: "cart_sync",
                payload: {
                  deviceId: myDeviceId,
                  deviceType: myDeviceType,
                  tabs: currentTabs,
                  activeTabId: currentActiveId,
                  timestamp: now,
                },
              });
            }
            return currentActiveId;
          });
          return currentTabs;
        });
      })
      .on("broadcast", { event: "sale_completed" }, ({ payload }) => {
        if (!payload || payload.deviceId === myDeviceId) return;
        isRemoteSyncRef.current = true;
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
        const fromDevice = payload.deviceType || (myDeviceType === "Mobile" ? "Web" : "Mobile");
        setSyncFlash(`Sale completed on ${fromDevice} (${payload.invoiceNumber || "Done"})`);
        setTimeout(() => setSyncFlash(null), 4000);
      })
      .on("presence", { event: "sync" }, () => {
        const presenceState = channel.presenceState();
        let foundPeer: string | null = null;
        for (const key of Object.keys(presenceState)) {
          if (key === myDeviceId) continue;
          const presences = presenceState[key] as any[];
          if (presences && presences.length > 0) {
            const peerInfo = presences[0];
            foundPeer = peerInfo.deviceType || (myDeviceType === "Mobile" ? "Web" : "Mobile");
            break;
          }
        }
        setPeerDevice(foundPeer);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          channelSubscribedRef.current = true;
          await channel.track({
            deviceId: myDeviceId,
            deviceType: myDeviceType,
            onlineAt: Date.now(),
          });
          channel.send({
            type: "broadcast",
            event: "request_sync",
            payload: { deviceId: myDeviceId },
          });
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          channelSubscribedRef.current = false;
        }
      });

    return () => {
      channelSubscribedRef.current = false;
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, updateCurrentTab]);

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
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Operations drawers (Money Out, Today's Sales, Held Bills)
  const [mounted, setMounted] = useState(false);
  const [operationsPanel, setOperationsPanel] = useState<"held" | "today" | "money-out" | null>(null);
  const [heldBills, setHeldBills] = useState<HeldDraft[]>([]);
  const [todaySales, setTodaySales] = useState<any[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [moneyOutAmount, setMoneyOutAmount] = useState("");
  const [moneyOutCategory, setMoneyOutCategory] = useState("general");
  const [moneyOutNote, setMoneyOutNote] = useState("");
  const [moneyOutSource, setMoneyOutSource] = useState("");
  const [moneyOutSaving, setMoneyOutSaving] = useState(false);

  // Mobile responsive cart drawer state
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useBodyScrollLock(Boolean(success || operationsPanel || (mobileCartOpen && mounted)) && mounted);

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
    () =>
      instruments.map((instrument) => {
        const typeLabel = instrument.type ? instrument.type.toUpperCase().replace("_", " ") : "ACCOUNT";
        return {
          value: instrument.id,
          label: `${instrument.name} (${typeLabel})`,
        };
      }),
    [instruments]
  );

  const activeMerchantQr = useMemo(
    () => merchantQrs?.find((q) => q.id === selectedMerchantQrId) ?? merchantQrs?.[0],
    [merchantQrs, selectedMerchantQrId]
  );

  const resolvedUpiId =
    activeMerchantQr?.upi_id ||
    defaultUpiId ||
    upiInstrument?.account_number ||
    (upiInstrument?.details as any)?.upi_id ||
    "";

  // Dynamic QR Generation when UPI is selected
  useEffect(() => {
    if (currentTab.paymentChoice !== "upi" || total <= 0 || !resolvedUpiId) {
      setQrDataUrl("");
      return;
    }
    const upiStr = generateUpiString({
      upiId: resolvedUpiId,
      name: activeMerchantQr?.display_name || shopName || "Shop",
      amount: total,
      note: `POS ${currentTab.title}`,
    });
    void generateQrDataUrl(upiStr, { width: 220, margin: 1 }).then(setQrDataUrl);
  }, [currentTab.paymentChoice, total, resolvedUpiId, activeMerchantQr?.display_name, shopName, currentTab.title]);

  // Sync cash received default
  useEffect(() => {
    if (currentTab.paymentChoice === "cash" && total > 0 && !currentTab.cashReceived) {
      updateCurrentTab({ cashReceived: total.toFixed(2) });
    }
  }, [currentTab.paymentChoice, total, currentTab.cashReceived, updateCurrentTab]);

  function handleAddCustomItem(item: Omit<CartLine, "key">) {
    const key = `custom:${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newCartLine: CartLine = {
      ...item,
      key,
    };
    updateCurrentTab({ cart: [...currentTab.cart, newCartLine] });
    playPosSound("add", soundEnabled);
  }

  function handleCustomItemCreated(item: PosCatalogItem) {
    if (item.kind === "service") {
      setServices((prev) => [item, ...prev]);
    } else {
      setProducts((prev) => [item, ...prev]);
    }
    addItem(item);
    playPosSound("add", soundEnabled);
  }

  // Keyboard Shortcuts Handler
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setGlobalSearchOpen(true);
      } else if (e.key === "F2") {
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
      } else if (e.key === "F7") {
        e.preventDefault();
        setCustomItemOpen(true);
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
      const firstId = instruments[0]?.id ?? cashInstrument?.id ?? "";
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
        { id: makeId(), instrumentId: nextInst?.id ?? instruments[0]?.id ?? "", amount: remaining > 0 ? remaining.toFixed(2) : "" },
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
        product_id: (!cLine.isCustom && cLine.kind === "product") ? cLine.id : null,
        service_id: (!cLine.isCustom && cLine.kind === "service") ? cLine.id : null,
        description: cLine.name,
        qty: cLine.qty,
        rate: cLine.rate,
        amount: taxLine.grossAmount,
        cost_price: cLine.costPrice || 0,
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
        invoiceId: String((result as any).id || (result as any).invoice_id || ""),
        invoiceNumber: String(result.invoice_number ?? "INV-SUCCESS"),
        total: Number(result.total ?? total),
        paid: Number(result.paid ?? (currentTab.paymentChoice === "khata" ? 0 : total)),
        due: Number(result.due ?? (currentTab.paymentChoice === "khata" ? total : 0)),
        customerName: selectedCustomer?.name,
        customerPhone: selectedCustomer?.phone ?? undefined,
      });
      setMobileCartOpen(false);

      // Notify peer devices that this sale was completed so their cart also clears
      if (channelRef.current && channelSubscribedRef.current) {
        const isMobile =
          typeof window !== "undefined" &&
          (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
            window.innerWidth < 768);
        channelRef.current.send({
          type: "broadcast",
          event: "sale_completed",
          payload: {
            deviceId: deviceIdRef.current,
            deviceType: isMobile ? "Mobile" : "Web",
            invoiceNumber: result.invoice_number ?? "INV-SUCCESS",
          },
        });
      }
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

  async function handleDownloadPdf() {
    if (!success?.invoiceId || downloadingPdf) return;
    try {
      setDownloadingPdf(true);

      let invoiceData: any = null;
      let invoiceItems: any[] = [];
      let invoicePayments: any[] = [];
      let storeSettings: any = null;

      try {
        const [invRes, itmRes, payRes, setRes] = await Promise.all([
          supabase.from("invoices").select("*, customers(*)").eq("id", success.invoiceId).maybeSingle(),
          supabase.from("invoice_items").select("*").eq("invoice_id", success.invoiceId).order("id", { ascending: true }),
          supabase.from("payments").select("*").eq("invoice_id", success.invoiceId).order("received_at", { ascending: true }),
          supabase.from("settings").select("*").maybeSingle(),
        ]);
        if (invRes.data) {
          invoiceData = invRes.data;
          invoiceItems = itmRes.data || [];
          invoicePayments = payRes.data || [];
          storeSettings = setRes.data || {};
        }
      } catch (fetchErr) {
        console.warn("Could not fetch remote invoice data, falling back:", fetchErr);
      }

      if (!invoiceData) {
        invoiceData = {
          id: success.invoiceId,
          invoice_number: success.invoiceNumber,
          invoice_date: indiaToday(),
          subtotal,
          discount: discountValue,
          total: success.total,
          paid: success.paid,
          due: success.due,
          status: success.due > 0 ? "partial" : "paid",
          customers: success.customerName ? { name: success.customerName, phone: success.customerPhone } : null,
        };
        invoiceItems = currentTab.cart.map((c) => ({
          description: c.name,
          qty: c.qty,
          rate: c.rate,
          amount: c.qty * c.rate,
        }));
        invoicePayments = [{ method: currentTab.paymentChoice, amount: success.paid }];
      }

      const [{ pdf }, { default: InvoicePdf }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/pdf/invoice-pdf"),
      ]);

      const blob = await pdf(
        <InvoicePdf
          invoice={invoiceData}
          items={invoiceItems}
          payments={invoicePayments}
          settings={storeSettings || { shop_name: shopName }}
          upiId={defaultUpiId}
        />
      ).toBlob();

      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `Invoice-${success.invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (err) {
      console.error("Client PDF generation error:", err);
      window.open(`/receipt/${success.invoiceId}/a4`, "_blank");
    } finally {
      setDownloadingPdf(false);
    }
  }

  const remainingSplit = total - currentTab.splitRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const cashChange = Math.max(0, (Number(currentTab.cashReceived) || 0) - total);

  return (
    <div className="cafeerp-pos-reference absolute inset-0 z-10 flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-slate-50 text-slate-900 antialiased select-none font-sans dark:bg-slate-950 dark:text-slate-100">
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
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/95 px-2.5 sm:px-3.5 shadow-xs backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/95 transition-all">
        {/* Left: Sidebar Toggle, Mobile Hamburger, Brand & Breadcrumbs */}
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          {/* Mobile Hamburger Toggle (< lg) */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white transition lg:hidden shrink-0"
          >
            <Menu className="h-4 w-4" />
          </button>

          {/* Desktop Sidebar Collapse / Expand Toggle (lg+) */}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden lg:flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white transition cursor-pointer shrink-0"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              {collapsed ? <path d="M13 5l7 7-7 7M5 5l7 7-7 7"/> : <path d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/>}
            </svg>
          </button>

          {/* Brand Icon & Location / Breadcrumbs */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-blue-600 to-cyan-500 text-white shadow-md shadow-indigo-500/20">
              <ShoppingCart className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 whitespace-nowrap">
                <span>Café ERP</span>
                <span>/</span>
                <span>1. Sales Hub</span>
                <span>/</span>
                <span className="text-blue-600 dark:text-blue-400 font-black">POS</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-black tracking-tight text-slate-900 dark:text-white">
                <span className="truncate max-w-[100px] sm:max-w-[150px]">{shopName || "CafeERP"}</span>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="hidden xs:inline">Live</span>
                </span>
                <span className="text-[10px] font-medium text-slate-400 hidden xl:inline">• {operatorName}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Global Search Bar */}
        <div className="flex-1 flex justify-center max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg mx-2 sm:mx-4 min-w-0">
          <button
            type="button"
            onClick={() => setGlobalSearchOpen(true)}
            className="group flex w-full items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-100/70 px-3 py-1.5 text-xs text-slate-400 shadow-inner transition hover:border-blue-500/50 hover:bg-white hover:text-slate-600 hover:shadow-xs dark:border-white/10 dark:bg-slate-800/60 dark:hover:border-blue-400/50 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
          >
            <Search className="h-3.5 w-3.5 text-slate-400 group-hover:text-blue-500 dark:group-hover:text-cyan-400 transition-colors shrink-0" />
            <span className="flex-1 text-left truncate text-[11px] sm:text-xs">
              Search anything (invoices, items, customers)…
            </span>
            <kbd className="hidden sm:inline-flex shrink-0 items-center gap-0.5 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-black text-slate-500 shadow-2xs dark:border-white/10 dark:bg-slate-900 dark:text-slate-400">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Right: Global Status & Utilities */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Mobile Cart Button in Header (< lg) */}
          <button
            type="button"
            onClick={() => setMobileCartOpen(true)}
            className="flex lg:hidden h-8 items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-2.5 text-white shadow-md shadow-blue-500/20 active:scale-95 transition"
            aria-label="Open Cart"
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            <span className="font-mono font-black text-[11px]">{money(total)}</span>
            {currentTab.cart.reduce((s, l) => s + l.qty, 0) > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[8px] font-black text-white">
                {currentTab.cart.reduce((s, l) => s + l.qty, 0)}
              </span>
            )}
          </button>

          {/* Multi-Device Realtime Sync Indicator (Mobile <-> Web) */}
          {syncFlash && (
            <div className="flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-emerald-700 dark:text-emerald-300 animate-pulse">
              <Sparkles className="h-3 w-3 text-emerald-500 shrink-0" />
              <span className="truncate max-w-[90px] sm:max-w-none">{syncFlash}</span>
            </div>
          )}

          {peerDevice ? (
            <div
              title={`Real-time sync active with ${peerDevice}`}
              className="hidden sm:flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-300 shadow-xs"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{peerDevice} Synced</span>
            </div>
          ) : (
            <div
              title="Real-time multi-device cloud sync active. Open POS on mobile or web to sync instantly."
              className="hidden xl:flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              <span>Live Sync</span>
            </div>
          )}

          {/* WhatsApp Status Badge */}
          <WhatsAppStatusBadge />

          {/* Theme toggle */}
          <ThemeToggle />

          {/* Back / Exit link */}
          <Link
            href="/dashboard"
            title="Exit POS to Dashboard"
            className="flex h-8 items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 px-2.5 text-[10px] font-bold text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Exit</span>
          </Link>
        </div>
      </header>

      {/* 2. QUICK ACCESS STRIP (hidden on mobile to maximize catalog height) */}
      <div className="pos-quick-access-strip shrink-0 border-b border-slate-200/80 bg-white/90 px-2 sm:px-3 py-0.5 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/90 transition-all hidden md:block">
        <GlobalQuickAccess />
      </div>

      {/* 3. MAIN WORKSPACE: Adaptive Dual Column Layout (Mobile Sheet + Desktop Split) */}
      <main className="flex min-h-0 flex-1 relative overflow-hidden lg:grid lg:[grid-template-columns:minmax(0,1fr)_420px] max-[1100px]:lg:[grid-template-columns:minmax(0,1fr)_370px]">
        {/* LEFT COLUMN: Catalog Explorer */}
        <section className="flex min-h-0 flex-1 flex-col w-full border-r border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/50">
          {/* Search & Scope Ribbon */}
          <div className="flex flex-col gap-2 border-b border-slate-200 bg-white p-2.5 sm:p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-1.5 min-w-0">
              <div data-pos-header-search="reference" className="relative flex-1 min-w-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  ref={itemSearchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search item, scan barcode (F4)..."
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-10 sm:pr-14 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:focus:bg-slate-900 dark:focus:ring-blue-900/30"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-3 sm:right-9 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white text-xs p-1"
                  >
                    ×
                  </button>
                ) : null}
                <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-black text-slate-400 dark:border-slate-700 dark:bg-slate-800 hidden sm:inline-block">
                  F4
                </kbd>
              </div>

              {/* Add Custom Item Button */}
              <button
                type="button"
                onClick={() => setCustomItemOpen(true)}
                title="Register Custom Item on the fly (F7)"
                className="flex h-10 items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-2.5 sm:px-3 text-xs font-black text-blue-700 shadow-xs transition hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/50 shrink-0"
              >
                <Sparkles className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                <span className="hidden sm:inline">+ Custom Item</span>
                <span className="sm:hidden">+ Item</span>
                <kbd className="hidden md:inline rounded bg-blue-100/80 px-1 py-0.2 text-[9px] font-bold text-blue-800 dark:bg-blue-900/60 dark:text-blue-200">
                  F7
                </kbd>
              </button>

              {/* Scope Toggles (Desktop & Tablet >= sm) */}
              <div className="hidden sm:flex h-10 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-950 shrink-0">
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
                        ? "bg-white text-blue-700 shadow-sm dark:bg-blue-600 dark:text-white"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Mobile Scope Bar (< sm) */}
            <div className="flex sm:hidden items-center justify-between gap-1 pt-0.5">
              <div className="flex h-8.5 flex-1 rounded-xl border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-950">
                {[
                  { id: "all", label: "ALL ITEMS" },
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
                    className={`flex-1 rounded-lg text-[10px] font-black transition ${
                      scope === s.id
                        ? "bg-white text-blue-700 shadow-xs dark:bg-blue-600 dark:text-white"
                        : "text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Category Ribbon + View Mode Toggle on right */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [-webkit-overflow-scrolling:touch] min-w-0">
                <button
                  type="button"
                  onClick={() => setCategory("all")}
                  className={`shrink-0 rounded-xl px-3 py-1.5 text-[10px] font-black transition active:scale-95 ${
                    category === "all"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                  }`}
                >
                  All Categories ({catalog.length})
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`shrink-0 rounded-xl px-3 py-1 text-[10px] font-black transition ${
                      category === cat.id
                        ? "bg-blue-600 text-white shadow-sm"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                    }`}
                  >
                    {cat.name} ({cat.count})
                  </button>
                ))}
              </div>

              {/* View mode toggle (Grid / List) */}
              <div className="flex h-7.5 rounded-xl border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-800/80 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleViewMode("grid")}
                  className={`flex h-6.5 w-6.5 items-center justify-center rounded-lg transition ${
                    viewMode === "grid" ? "bg-white text-blue-600 shadow-xs dark:bg-blue-600 dark:text-white" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                  title="Visual Card Grid"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => toggleViewMode("list")}
                  className={`flex h-6.5 w-6.5 items-center justify-center rounded-lg transition ${
                    viewMode === "list" ? "bg-white text-blue-600 shadow-xs dark:bg-blue-600 dark:text-white" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                  title="High-Density Fast List"
                >
                  <List className="h-3.5 w-3.5" />
                </button>
              </div>
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
                          ? "border-slate-200 bg-slate-100/60 opacity-40 cursor-not-allowed dark:border-slate-800/80 dark:bg-slate-950/40"
                          : inCartQty > 0
                          ? "border-blue-500 bg-blue-50/60 shadow-md shadow-blue-500/10 ring-1 ring-blue-500/30 dark:border-blue-500/80 dark:bg-slate-800/90"
                          : "border-slate-200/90 bg-white shadow-sm hover:border-blue-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                      }`}
                    >
                      {/* Top ribbon: kind & category */}
                      <div className="flex items-center justify-between gap-1 mb-2">
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                            item.kind === "service"
                              ? "bg-blue-100 text-blue-700 dark:bg-cyan-500/15 dark:text-cyan-400"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
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
                        <h4 className="line-clamp-2 text-xs font-black text-slate-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-cyan-400 transition">
                          {item.name}
                        </h4>
                        <p className="mt-0.5 truncate text-[10px] text-slate-500 font-semibold dark:text-slate-400">
                          {item.category_name || "General"}
                        </p>
                      </div>

                      {/* Price & Stock footer */}
                      <div className="flex items-end justify-between border-t border-slate-100 pt-2 dark:border-slate-800/80">
                        <div>
                          <div className="text-[9px] text-slate-400 font-bold uppercase">Price</div>
                          <div className="text-sm font-black text-blue-600 dark:text-cyan-400">{money(Number(item.sale_price) || 0)}</div>
                        </div>
                        <div className="text-right">
                          <span
                            className={`text-[9px] font-bold ${
                              stock === null
                                ? "text-slate-400"
                                : stock <= 3
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-slate-500 dark:text-slate-400"
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
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-black uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2.5">Type</th>
                      <th className="px-3 py-2.5">Item Name</th>
                      <th className="px-3 py-2.5">Category</th>
                      <th className="px-3 py-2.5">Stock</th>
                      <th className="px-3 py-2.5 text-right">Price</th>
                      <th className="px-3 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-900">
                    {filteredItems.map((item) => {
                      const stock = item.kind === "product" ? Number(item.stock_qty ?? 0) : null;
                      const inCartQty = currentTab.cart.find((l) => l.key === `${item.kind}:${item.id}`)?.qty ?? 0;
                      const isOutOfStock = item.kind === "product" && stock !== null && stock <= 0;

                      return (
                        <tr
                          key={`${item.kind}:${item.id}`}
                          className={`hover:bg-blue-50/40 transition dark:hover:bg-slate-800/50 ${isOutOfStock ? "opacity-40" : ""}`}
                        >
                          <td className="px-3 py-2.5">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[8px] font-black uppercase ${
                                item.kind === "service"
                                  ? "bg-blue-100 text-blue-700 dark:bg-cyan-500/20 dark:text-cyan-300"
                                  : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                              }`}
                            >
                              {item.kind === "service" ? "S" : "P"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-white">
                            <div className="flex items-center gap-1.5">
                              <span>{item.name}</span>
                              {inCartQty > 0 && (
                                <span className="rounded-full bg-blue-600 px-1.5 py-0.2 text-[8px] font-black text-white">
                                  ×{inCartQty}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-slate-500 font-semibold dark:text-slate-400">{item.category_name || "—"}</td>
                          <td className="px-3 py-2.5 text-slate-500 font-mono dark:text-slate-400">
                            {stock === null ? "—" : stock}
                          </td>
                          <td className="px-3 py-2.5 text-right font-black text-blue-600 dark:text-cyan-400">
                            {money(Number(item.sale_price) || 0)}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <button
                              type="button"
                              disabled={isOutOfStock}
                              onClick={() => addItem(item)}
                              className="inline-flex h-7 items-center justify-center gap-1 rounded-lg bg-blue-600 px-2.5 text-[10px] font-black text-white hover:bg-blue-700 disabled:opacity-40 shadow-sm"
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
                <Search className="h-8 w-8 text-slate-300 dark:text-slate-700" />
                <p className="mt-3 text-xs font-black text-slate-500 dark:text-slate-400">No matching items</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-600">Try changing your search term or category filter.</p>
              </div>
            )}
          </div>

          {/* MOBILE FLOATING CART DOCK (Visible only on < lg) */}
          <div className="lg:hidden shrink-0 border-t border-slate-200/90 bg-white/95 backdrop-blur-xl px-3.5 py-2.5 shadow-2xl dark:border-slate-800/90 dark:bg-slate-900/95 pb-[calc(0.6rem+env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setMobileCartOpen(true)}
                className="flex items-center gap-2.5 min-w-0 text-left flex-1"
              >
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
                  <ShoppingCart className="h-5 w-5" />
                  {currentTab.cart.reduce((s, l) => s + l.qty, 0) > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white ring-2 ring-white dark:ring-slate-900">
                      {currentTab.cart.reduce((s, l) => s + l.qty, 0)}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
                    {currentTab.cart.reduce((s, l) => s + l.qty, 0)} items in {currentTab.title}
                  </div>
                  <div className="text-base font-black font-mono text-blue-600 dark:text-cyan-400 truncate">
                    {money(total)}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMobileCartOpen(true)}
                className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 px-4 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-blue-600/25 active:scale-95 transition shrink-0"
              >
                <span>View Cart & Pay</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: Active Order Slip & Tender Pad (Slide-Over Sheet on Mobile, Fixed Column on Desktop) */}
        <aside
          className={`
            flex min-h-0 flex-col bg-white border-slate-200 dark:bg-slate-950 dark:border-slate-800
            lg:relative lg:flex lg:border-l lg:translate-y-0
            fixed inset-0 z-50 transition-transform duration-300 ease-out
            ${mobileCartOpen ? "translate-y-0" : "translate-y-full lg:translate-y-0"}
          `}
        >
          {/* 1. Order Tabs & Cart Actions Header */}
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 px-3 bg-slate-50/90 dark:border-slate-800 dark:bg-slate-900/80 gap-2">
            {/* Left: Mobile Back button + Multi-Order Tabs */}
            <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-0.5">
              {/* Mobile Back button */}
              <button
                type="button"
                onClick={() => setMobileCartOpen(false)}
                className="flex lg:hidden h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-black text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 shadow-xs active:scale-95 transition shrink-0"
              >
                <ArrowLeft className="h-3 w-3 text-blue-600 dark:text-cyan-400" />
                <span>Catalog</span>
              </button>

              {/* Order Tabs */}
              {tabs.map((tab) => {
                const isActive = tab.id === activeTabId;
                const tabItemCount = tab.cart.reduce((s, l) => s + l.qty, 0);
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => switchTab(tab.id)}
                    className={`group flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[10px] font-black transition-all shrink-0 ${
                      isActive
                        ? "bg-blue-600 text-white shadow-xs"
                        : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    <span>{tab.title}</span>
                    {tabItemCount > 0 && (
                      <span className={`text-[9px] font-bold ${isActive ? "text-blue-100" : "text-slate-400"}`}>
                        ({tabItemCount})
                      </span>
                    )}
                    {tabs.length > 1 && (
                      <span
                        role="button"
                        onClick={(e) => closeTab(tab.id, e)}
                        className="flex h-3.5 w-3.5 items-center justify-center rounded hover:bg-black/20 text-white/70 hover:text-white transition ml-0.5"
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
                  className="flex h-7 items-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white/60 px-2 text-[9px] font-black text-slate-500 hover:border-blue-500 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400 shrink-0"
                >
                  <Plus className="h-3 w-3" />
                  <span>Tab</span>
                  <kbd className="text-[8px] font-bold text-slate-400">F2</kbd>
                </button>
              )}
            </div>

            {/* Right: Cart Actions (Hold & Clear) */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Hold Current Tab */}
              <button
                type="button"
                onClick={holdCurrentBill}
                title="Park this bill to finish later (F4)"
                className="flex h-7 items-center gap-1 rounded-lg border border-amber-300 bg-amber-50/50 px-2 text-[9px] font-black text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-300 shrink-0"
              >
                <Pause className="h-3 w-3 text-amber-600" />
                <span>Hold</span>
              </button>

              {/* Clear Active Cart */}
              <button
                type="button"
                onClick={clearActiveCart}
                title="Clear current cart items"
                className="flex h-7 items-center rounded-lg px-2 text-[9px] font-black text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 shrink-0"
              >
                Clear
              </button>

              {/* Close 'X' button on Mobile */}
              <button
                type="button"
                onClick={() => setMobileCartOpen(false)}
                className="flex lg:hidden h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white shrink-0"
                aria-label="Close cart drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* 2. POS Quick Operations Strip & Items Count */}
          <div className="flex h-8 shrink-0 items-center justify-between border-b border-slate-200/80 bg-slate-100/70 px-3 dark:border-slate-800 dark:bg-slate-900/60 gap-1.5">
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {/* Audio Toggle */}
              <button
                type="button"
                onClick={toggleSound}
                title={soundEnabled ? "Sound ON (Click to mute)" : "Sound MUTED (Click to unmute)"}
                className={`flex h-6 w-6 items-center justify-center rounded-md border transition ${
                  soundEnabled
                    ? "border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-400"
                    : "border-slate-200 bg-white text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600"
                }`}
              >
                {soundEnabled ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
              </button>

              {/* Money Out */}
              <button
                type="button"
                onClick={() => setOperationsPanel("money-out")}
                className="flex h-6 items-center gap-1 rounded-md border border-rose-200 bg-white px-1.5 text-[9px] font-black text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 transition shrink-0"
                title="Money Out / Record Expense"
              >
                <ArrowDownToLine className="h-3 w-3 text-rose-500" />
                <span>Money Out</span>
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
                title="Parked / Held Bills"
                className="flex h-6 items-center gap-1 rounded-md border border-amber-200 bg-white px-1.5 text-[9px] font-black text-amber-800 hover:bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300 transition shrink-0"
              >
                <Pause className="h-3 w-3 text-amber-600" />
                <span>{heldBills.length > 0 ? `${heldBills.length.toString().padStart(2, "0")} Held` : "Held"}</span>
              </button>

              {/* Today's Sales */}
              <button
                type="button"
                onClick={() => void openTodaySales()}
                title="Today's Sales Registry"
                className="flex h-6 items-center gap-1 rounded-md border border-blue-200 bg-white px-1.5 text-[9px] font-black text-blue-700 hover:bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300 transition shrink-0"
              >
                <ReceiptText className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                <span>Sales</span>
              </button>
            </div>

            {/* Active Cart Summary Badge */}
            <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 truncate shrink-0">
              <span>{currentTab.cart.reduce((s, l) => s + l.qty, 0)} items</span>
              <span className="mx-1 text-slate-300 dark:text-slate-600">·</span>
              <span className="font-mono font-black text-slate-900 dark:text-white">{money(total)}</span>
            </div>
          </div>

          {/* 3. Customer Banner & Selector */}
          <div className="shrink-0 border-b border-slate-200 bg-slate-50/50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/40">
            <div data-pos-customer-action="reference" className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 shrink-0">
                Customer
              </span>

              {/* + New Customer or Change */}
              <div className="shrink-0">
                {selectedCustomer ? (
                  <button
                    type="button"
                    onClick={() => updateCurrentTab({ customerId: "" })}
                    className="text-[9px] font-black text-blue-600 hover:underline dark:text-cyan-400"
                  >
                    Change
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setNewCustomerOpen(true)}
                    className="flex items-center gap-1 text-[9px] font-black text-blue-600 hover:underline dark:text-cyan-400"
                  >
                    <UserPlus className="h-3 w-3" />
                    <span>+ New Customer</span>
                  </button>
                )}
              </div>
            </div>

            {/* Customer Search input */}
            <div className="relative">
              <CircleUserRound className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
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
                className="h-8 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:focus:border-cyan-500"
              />

              {customerOpen && !selectedCustomer && (
                <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                  <div className="max-h-48 overflow-y-auto p-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        updateCurrentTab({ customerId: "", customerSearch: "" });
                        setCustomerOpen(false);
                      }}
                      className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
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
                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left hover:bg-blue-50 dark:hover:bg-blue-600/20"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-xs font-bold text-slate-900 dark:text-white">{cust.name}</div>
                          <div className="text-[9px] text-slate-500 dark:text-slate-400">{cust.phone || cust.code || "No Phone"}</div>
                        </div>
                        {Number(cust.balance ?? 0) !== 0 && (
                          <span
                            className={`text-[9px] font-black font-mono ${
                              Number(cust.balance) > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
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
              <div className="mt-2 space-y-1 rounded-xl border border-slate-200 bg-white p-2 text-[10px] shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 font-semibold dark:text-slate-400">{selectedCustomer.phone || "Account Attached"}</span>
                  <span
                    className={`font-black ${
                      customerBalance > 0
                        ? "text-rose-600 dark:text-rose-400"
                        : customerBalance < 0
                        ? "text-emerald-600 dark:text-emerald-400"
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
                  <label className="flex items-center gap-2 pt-1 border-t border-slate-100 cursor-pointer text-amber-800 dark:border-slate-800 dark:text-amber-300">
                    <input
                      type="checkbox"
                      checked={currentTab.collectPreviousDue}
                      onChange={(e) => updateCurrentTab({ collectPreviousDue: e.target.checked })}
                      className="rounded border-slate-300 bg-white text-blue-600 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-cyan-500"
                    />
                    <span className="font-bold text-[9px]">Collect Previous Due ({money(customerBalance)}) with this bill</span>
                  </label>
                )}

                {/* Advance deduction toggle */}
                {customerHasAdvance && (
                  <label className="flex items-center gap-2 pt-1 border-t border-slate-100 cursor-pointer text-emerald-800 dark:border-slate-800 dark:text-emerald-300">
                    <input
                      type="checkbox"
                      checked={currentTab.useAdvance}
                      onChange={(e) => updateCurrentTab({ useAdvance: e.target.checked })}
                      className="rounded border-slate-300 bg-white text-blue-600 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-cyan-500"
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
                className="flex items-center gap-2 border-b border-slate-100 py-2 text-xs dark:border-slate-800/80"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-black text-slate-900 dark:text-white">{line.name}</span>
                    {line.isCustom && (
                      <span className="shrink-0 rounded bg-amber-100 px-1 py-0.2 text-[9px] font-black text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                        Temp
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono dark:text-slate-400">
                    {money(line.rate)} · {line.unit}
                  </div>
                </div>

                {/* Touch Steppers */}
                <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => updateQty(line.key, line.qty - 1)}
                    className="flex h-9 w-9 items-center justify-center text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white active:scale-90 transition"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-8 text-center font-mono font-black text-slate-900 dark:text-white">{line.qty}</span>
                  <button
                    type="button"
                    onClick={() => updateQty(line.key, line.qty + 1)}
                    className="flex h-9 w-9 items-center justify-center text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white active:scale-90 transition"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Amount */}
                <div className="w-18 text-right font-black font-mono text-blue-600 dark:text-cyan-400">
                  {money(line.qty * line.rate)}
                </div>

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => removeLine(line.key)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-500 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 active:scale-90 transition"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}

            {!currentTab.cart.length && (
              <div className="flex h-44 flex-col items-center justify-center text-center">
                <ShoppingCart className="h-7 w-7 text-slate-300 dark:text-slate-700" />
                <p className="mt-2 text-xs font-black text-slate-600 dark:text-slate-400">Cart is empty</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-600">Scan barcode or tap an item on the left.</p>
              </div>
            )}
          </div>

          {/* Financial Summary & Totalizer */}
          <div className="shrink-0 border-t border-slate-200 bg-slate-50/80 p-3 sm:p-3.5 space-y-2 dark:border-slate-800 dark:bg-slate-900/60 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            {/* Discount row with quick chips */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Discount</span>
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
                    className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[9px] font-bold text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:text-white active:scale-95"
                  >
                    {chip.includes("%") ? chip : `₹${chip}`}
                  </button>
                ))}
                <input
                  value={currentTab.discount}
                  onChange={(e) => updateCurrentTab({ discount: e.target.value })}
                  placeholder="0.00"
                  className="h-7 w-18 rounded-lg border border-slate-200 bg-white px-2 text-right text-xs font-black font-mono text-slate-900 outline-none focus:border-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:focus:border-cyan-500"
                />
              </div>
            </div>

            {/* Financial Ledger lines */}
            <div className="space-y-1 text-[10px] font-semibold text-slate-600 dark:text-slate-400">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-mono text-slate-900 dark:text-slate-200">{money(subtotal)}</span>
              </div>
              {discountValue > 0 && (
                <div className="flex justify-between text-rose-600 dark:text-rose-400 font-bold">
                  <span>Discount</span>
                  <span className="font-mono">- {money(discountValue)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>GST Tax</span>
                <span className="font-mono text-slate-900 dark:text-slate-200">{money(totalTax)}</span>
              </div>
              {dueToCollect > 0 && (
                <div className="flex justify-between text-amber-700 dark:text-amber-400 font-bold">
                  <span>+ Previous Due Collected</span>
                  <span className="font-mono">+{money(dueToCollect)}</span>
                </div>
              )}
              {advanceToUse > 0 && (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-bold">
                  <span>- Advance Credit Used</span>
                  <span className="font-mono">-{money(advanceToUse)}</span>
                </div>
              )}
            </div>

            {/* OLED GRAND TOTAL DISPLAY */}
            <div className="flex items-center justify-between rounded-xl bg-slate-100/90 border border-slate-200 p-2.5 shadow-inner dark:bg-slate-950 dark:border-slate-800">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Total Payable</span>
              <span className="text-2xl font-black font-mono tracking-tight text-blue-600 dark:text-cyan-400">
                {money(total)}
              </span>
            </div>

            {/* Payment Tender Selector */}
            <div className="grid grid-cols-4 gap-1.5 pt-1">
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
                    className={`h-10 sm:h-9 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all active:scale-95 ${
                      isSelected
                        ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20 font-extrabold ring-1 ring-blue-400/30 scale-[1.02]"
                        : "bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 dark:bg-slate-900 dark:border-white/10 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/60"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* CASH TENDER CONTROLS */}
            {currentTab.paymentChoice === "cash" && currentTab.cart.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-2.5 space-y-2 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
                  <button
                    type="button"
                    onClick={setCashTenderExact}
                    className="shrink-0 rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1 text-[9px] font-black text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:border-emerald-800/60 dark:text-emerald-300"
                  >
                    Exact
                  </button>
                  <button
                    type="button"
                    onClick={roundCashNext50}
                    className="shrink-0 rounded-lg bg-slate-100 border border-slate-200 px-2 py-1 text-[9px] font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Next ₹50
                  </button>
                  {[100, 200, 500].map((note) => (
                    <button
                      key={note}
                      type="button"
                      onClick={() => addCashNote(note)}
                      className="shrink-0 rounded-lg bg-slate-100 border border-slate-200 px-2 py-1 text-[9px] font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      +₹{note}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400">Cash Received</span>
                  <input
                    value={currentTab.cashReceived}
                    onChange={(e) => updateCurrentTab({ cashReceived: e.target.value })}
                    placeholder="0.00"
                    className="h-8 w-28 rounded-lg border border-slate-200 bg-slate-50 px-2 text-right font-mono font-black text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-cyan-500"
                  />
                </div>

                {cashChange > 0 && (
                  <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 text-emerald-800 font-bold text-xs dark:bg-emerald-950/40 dark:border-emerald-900/60 dark:text-emerald-300">
                    <span>Change to return:</span>
                    <span className="font-black font-mono text-sm">{money(cashChange)}</span>
                  </div>
                )}
              </div>
            )}

            {/* UPI ON-SCREEN DYNAMIC QR CODE */}
            {currentTab.paymentChoice === "upi" && currentTab.cart.length > 0 && (
              <div className="flex flex-col items-center justify-center p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 dark:border-cyan-900/60 dark:bg-slate-950">
                {/* Multi Merchant QR selector if more than 1 QR configured */}
                {merchantQrs.length > 1 && (
                  <div className="w-full flex items-center gap-1.5 mb-2.5 overflow-x-auto pb-1 [scrollbar-width:none]">
                    <span className="text-[9px] font-black uppercase text-slate-500 dark:text-slate-400 shrink-0">QR Account:</span>
                    {merchantQrs.map((mqr) => {
                      const isCurrent = activeMerchantQr?.id === mqr.id;
                      return (
                        <button
                          key={mqr.id}
                          type="button"
                          onClick={() => setSelectedMerchantQrId(mqr.id)}
                          className={`shrink-0 rounded-lg px-2 py-0.5 text-[9px] font-bold border transition ${
                            isCurrent
                              ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800"
                          }`}
                        >
                          {mqr.display_name || mqr.qr_name || mqr.upi_id}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="p-2.5 bg-white rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 dark:shadow-lg">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="UPI Dynamic QR" className="h-36 w-36 object-contain" />
                  ) : resolvedUpiId ? (
                    <div className="h-36 w-36 flex flex-col items-center justify-center text-[10px] text-slate-400 gap-1">
                      <span className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent" />
                      <span>Generating QR...</span>
                    </div>
                  ) : (
                    <div className="h-36 w-36 flex flex-col items-center justify-center text-center p-2 text-[10px] text-amber-600 dark:text-amber-400">
                      <AlertCircle className="h-6 w-6 mb-1 text-amber-500" />
                      <span className="font-bold">No UPI ID Found</span>
                      <span className="text-[8px] text-slate-500 mt-1">Configure in Settings → Payments</span>
                    </div>
                  )}
                </div>

                <div className="mt-2.5 text-center">
                  <p className="text-xs font-black text-slate-900 dark:text-white">
                    Scan with PhonePe / GPay / Paytm: <span className="text-blue-600 dark:text-cyan-400">{money(total)}</span>
                  </p>
                  {resolvedUpiId ? (
                    <div className="mt-1 flex items-center justify-center gap-1">
                      <span className="text-[10px] font-mono font-bold text-slate-600 dark:text-slate-400">
                        {resolvedUpiId}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(resolvedUpiId);
                          setCopiedUpi(true);
                          setTimeout(() => setCopiedUpi(false), 2000);
                        }}
                        className="rounded px-1.5 py-0.5 text-[8px] font-bold text-blue-600 hover:bg-blue-50 dark:text-cyan-400 dark:hover:bg-slate-800"
                        title="Copy UPI ID"
                      >
                        {copiedUpi ? "Copied! ✓" : "Copy"}
                      </button>
                    </div>
                  ) : null}
                  {(activeMerchantQr?.display_name || activeMerchantQr?.qr_name) && (
                    <p className="text-[9px] text-slate-400 font-semibold">{activeMerchantQr.display_name || activeMerchantQr.qr_name}</p>
                  )}
                </div>
              </div>
            )}

            {/* KHATA DUE SUMMARY */}
            {currentTab.paymentChoice === "khata" && currentTab.cart.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[10px] space-y-1 dark:border-amber-900/50 dark:bg-amber-950/20">
                <div className="text-amber-800 dark:text-amber-300 font-bold flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                  <span>Customer Ledger Invoice (Unpaid Credit)</span>
                </div>
                <p className="text-slate-600 dark:text-slate-400">
                  Total of {money(total)} will be debited to {selectedCustomer?.name || "the selected customer's"} khata ledger.
                </p>
              </div>
            )}

            {/* SPLIT PAYMENT ROWS */}
            {currentTab.paymentChoice === "split" && currentTab.cart.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-2.5 space-y-2 dark:border-violet-900/50 dark:bg-slate-950">
                <div className="flex items-center justify-between text-[10px] font-bold">
                  <span className="text-slate-700 dark:text-violet-300">Multi-Account Split</span>
                  <span
                    className={
                      Math.abs(remainingSplit) < 0.01
                        ? "text-emerald-600 dark:text-emerald-400 font-black"
                        : remainingSplit < 0
                        ? "text-rose-600 dark:text-rose-400 font-black"
                        : "text-amber-600 dark:text-amber-400 font-black"
                    }
                  >
                    {Math.abs(remainingSplit) < 0.01 ? "Balanced ✓" : `Remaining: ${money(remainingSplit)}`}
                  </span>
                </div>

                {splitInstrumentOptions.length === 0 ? (
                  <div className="p-2 text-center text-[10px] text-amber-700 bg-amber-50 rounded-lg border border-amber-200">
                    No payment accounts active. Please check Settings → Payment Accounts.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {currentTab.splitRows.map((row) => (
                      <div key={row.id} className="flex items-center gap-1.5">
                        <select
                          value={row.instrumentId}
                          onChange={(e) => updateSplitRow(row.id, { instrumentId: e.target.value })}
                          className="h-8 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 text-[10px] font-bold text-slate-900 outline-none focus:border-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
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
                          className="h-8 w-24 rounded-lg border border-slate-200 bg-slate-50 px-2 text-right font-mono font-bold text-xs text-slate-900 outline-none focus:border-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={() => removeSplitRow(row.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={addSplitRow}
                  className="text-[9px] font-black text-blue-600 hover:text-blue-700 dark:text-violet-400 dark:hover:text-violet-300"
                >
                  + Add Split Row
                </button>
              </div>
            )}

            {/* Errors */}
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                {error}
              </div>
            )}

            {/* MAIN CHECKOUT BUTTON */}
            <button
              type="button"
              disabled={!currentTab.cart.length || busy}
              onClick={() => void completeSale()}
              className="flex h-12 sm:h-13 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-xs sm:text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-blue-600/25 hover:from-blue-700 hover:via-indigo-700 hover:to-blue-800 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
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
      {success && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 p-3 sm:p-4 backdrop-blur-md animate-fade-in dark:bg-black/80">
          <div className="w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-4 sm:p-6 shadow-2xl text-center dark:border-slate-800 dark:bg-slate-900 animate-modal-panel">
            <div className="mx-auto flex h-13 w-13 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:ring-emerald-500/40">
              <Check className="h-6 w-6 sm:h-7 sm:w-7" />
            </div>

            <h2 className="mt-3 text-lg sm:text-xl font-black text-slate-900 dark:text-white">Sale Completed!</h2>
            <p className="mt-0.5 font-mono text-xs sm:text-sm font-bold text-blue-600 dark:text-cyan-400">{success.invoiceNumber}</p>

            <div className="mt-3 sm:mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 sm:p-4 text-left space-y-1.5 text-xs dark:border-slate-800 dark:bg-slate-950">
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Total Amount:</span>
                <strong className="text-slate-900 font-mono dark:text-white">{money(success.total)}</strong>
              </div>
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Amount Paid:</span>
                <strong className="text-emerald-600 font-mono dark:text-emerald-400">{money(success.paid)}</strong>
              </div>
              {success.due > 0 && (
                <div className="flex justify-between text-rose-600 dark:text-rose-400">
                  <span>Balance Due (Khata):</span>
                  <strong className="font-mono">{money(success.due)}</strong>
                </div>
              )}
              {success.customerName && (
                <div className="flex justify-between text-slate-500 pt-1 border-t border-slate-200 dark:text-slate-400 dark:border-slate-800">
                  <span>Customer:</span>
                  <span className="font-bold text-slate-900 dark:text-white truncate max-w-[180px]">{success.customerName}</span>
                </div>
              )}
            </div>

            {/* Instant Action Grid: All 4 Operations with minimum 44px touch height */}
            <div className="mt-3.5 sm:mt-4 grid grid-cols-2 gap-2">
              <a
                href={`/receipt/${success.invoiceId}?print=true`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-black text-slate-800 hover:bg-slate-100 transition shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700 active:scale-95"
              >
                <Printer className="h-4 w-4 text-blue-600 dark:text-cyan-400" />
                <span>Print 80mm</span>
              </a>

              <a
                href={`/receipt/${success.invoiceId}/a4?print=true`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-black text-slate-800 hover:bg-slate-100 transition shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700 active:scale-95"
              >
                <FileText className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <span>Print A4</span>
              </a>

              <button
                type="button"
                onClick={() => void handleDownloadPdf()}
                disabled={downloadingPdf}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 text-xs font-black text-blue-700 hover:bg-blue-100 transition shadow-xs dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/50 disabled:opacity-50 cursor-pointer active:scale-95"
              >
                {downloadingPdf ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
                    <span>Generating PDF...</span>
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span>Download PDF</span>
                  </>
                )}
              </button>

              {success.customerPhone ? (
                <button
                  type="button"
                  onClick={() => void sendWhatsAppInvoice()}
                  disabled={whatsappStatus === "sending" || whatsappStatus === "sent"}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-black text-emerald-700 hover:bg-emerald-100 transition disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-900/50 shadow-xs active:scale-95"
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
                <button
                  type="button"
                  onClick={() => {
                    const phone = window.prompt("Enter customer 10-digit WhatsApp phone number:");
                    if (phone && phone.trim()) {
                      setSuccess((prev) => (prev ? { ...prev, customerPhone: phone.trim() } : null));
                    }
                  }}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-black text-emerald-700 hover:bg-emerald-100 transition dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 shadow-xs active:scale-95"
                >
                  <MessageSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span>WhatsApp</span>
                </button>
              )}
            </div>

            {whatsappMsg && (
              <p
                className={`mt-2 text-[10px] font-bold ${
                  whatsappStatus === "sent" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {whatsappMsg}
              </p>
            )}

            <button
              type="button"
              autoFocus
              onClick={handleResetAfterSale}
              className="mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 text-xs font-black uppercase tracking-wider text-white hover:bg-blue-700 active:scale-98 transition shadow-lg shadow-blue-600/25 cursor-pointer"
            >
              Start Next Bill (Enter)
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* 4. DRAWER: RECALL HELD BILLS */}
      {operationsPanel === "held" && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-md transition-opacity animate-fade-in dark:bg-black/80" onMouseDown={() => setOperationsPanel(null)}>
          <aside
            className="absolute right-0 top-0 flex h-full w-[min(440px,100vw)] flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-drawer-right"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-5 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">Parked / Held Bills</h3>
                <p className="text-[10px] text-slate-500 font-semibold dark:text-slate-400">Local terminal drafts</p>
              </div>
              <button
                type="button"
                onClick={() => setOperationsPanel(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-2.5">
              {!heldBills.length ? (
                <div className="flex h-52 flex-col items-center justify-center text-center">
                  <Pause className="h-8 w-8 text-slate-300 dark:text-slate-700" />
                  <p className="mt-2 text-xs font-black text-slate-600 dark:text-slate-400">No held bills</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-600">Click Hold on an active bill to park it here.</p>
                </div>
              ) : (
                heldBills.map((draft, idx) => (
                  <div
                    key={draft.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3 dark:border-slate-800 dark:bg-slate-950"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-black text-slate-900 dark:text-white">
                          Draft #{heldBills.length - idx} • {draft.customerName}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          {draft.itemCount} items · {new Date(draft.heldAt).toLocaleTimeString()}
                        </div>
                      </div>
                      <div className="text-sm font-black text-blue-600 font-mono dark:text-cyan-400">{money(draft.total)}</div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => recallHeldDraft(draft)}
                        className="flex-1 h-8 rounded-xl bg-blue-600 text-[10px] font-black uppercase text-white hover:bg-blue-700 shadow-sm"
                      >
                        Recall to Active Bill
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteHeldDraft(draft.id)}
                        className="h-8 w-8 flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>,
        document.body
      )}

      {/* 5. DRAWER: TODAY'S SALES */}
      {operationsPanel === "today" && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-md transition-opacity animate-fade-in dark:bg-black/80" onMouseDown={() => setOperationsPanel(null)}>
          <aside
            className="absolute right-0 top-0 flex h-full w-[min(480px,100vw)] flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-drawer-right"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-5 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">Today's Sales Registry</h3>
                <p className="text-[10px] text-slate-500 font-semibold dark:text-slate-400">{indiaToday()} invoices</p>
              </div>
              <button
                type="button"
                onClick={() => setOperationsPanel(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {loadingSales ? (
                <div className="flex h-44 items-center justify-center text-xs font-bold text-slate-500 dark:text-slate-400">
                  Loading sales registry...
                </div>
              ) : !todaySales.length ? (
                <div className="flex h-44 flex-col items-center justify-center text-center">
                  <ReceiptText className="h-8 w-8 text-slate-300 dark:text-slate-700" />
                  <p className="mt-2 text-xs font-black text-slate-600 dark:text-slate-400">No sales recorded today</p>
                </div>
              ) : (
                todaySales.map((sale) => (
                  <div key={sale.id} className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <div>
                      <div className="font-mono text-xs font-black text-slate-900 dark:text-white">{sale.invoice_number}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">{sale.customers?.name || "Walk-in Customer"}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-black font-mono text-blue-600 dark:text-cyan-400">{money(Number(sale.total))}</div>
                      <div
                        className={`text-[9px] font-bold ${
                          Number(sale.due) > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
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
        </div>,
        document.body
      )}

      {/* 6. MODAL: MONEY OUT (EXPENSE RECORDING) */}
      {operationsPanel === "money-out" && (
        <Modal
          as="form"
          onSubmit={handleMoneyOut}
          onClose={() => setOperationsPanel(null)}
          title="Record Money Out"
          subtitle="Petty cash / register outflow"
          icon="ArrowDownToLine"
          accent="rose"
          size="sm"
          footer={
            <div className="flex w-full gap-2">
              <button
                type="button"
                onClick={() => setOperationsPanel(null)}
                className="h-9 flex-1 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={moneyOutSaving}
                className="h-9 flex-1 rounded-xl bg-rose-600 text-xs font-black text-white hover:bg-rose-700 disabled:opacity-50 shadow-md shadow-rose-600/30"
              >
                {moneyOutSaving ? "Recording..." : "Save Expense"}
              </button>
            </div>
          }
        >
          <div className="space-y-3.5">
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase text-slate-500 dark:text-slate-400">Amount *</label>
              <input
                autoFocus
                required
                type="number"
                min="0.01"
                step="0.01"
                value={moneyOutAmount}
                onChange={(e) => setMoneyOutAmount(e.target.value)}
                placeholder="0.00"
                className="h-10 w-full rounded-xl border border-rose-200 bg-rose-50/50 px-3 text-right font-mono text-lg font-black text-slate-900 outline-none focus:border-rose-500 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[10px] font-black uppercase text-slate-500 dark:text-slate-400">Category *</label>
                <input
                  required
                  value={moneyOutCategory}
                  onChange={(e) => setMoneyOutCategory(e.target.value)}
                  placeholder="tea, snacks, milk"
                  className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-900 outline-none focus:border-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-black uppercase text-slate-500 dark:text-slate-400">Paid From</label>
                <select
                  value={moneyOutSource}
                  onChange={(e) => setMoneyOutSource(e.target.value)}
                  className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-900 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
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
              <label className="mb-1 block text-[10px] font-black uppercase text-slate-500 dark:text-slate-400">Note / Reason</label>
              <input
                value={moneyOutNote}
                onChange={(e) => setMoneyOutNote(e.target.value)}
                placeholder="e.g. bought stationary"
                className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-900 outline-none focus:border-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:focus:border-cyan-500"
              />
            </div>
          </div>
        </Modal>
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

      {/* 8. QUICK ADD CUSTOM ITEM (TEMPORARY CART-ONLY) */}
      <PosCustomItemModal
        open={customItemOpen}
        onClose={() => setCustomItemOpen(false)}
        onAddCustomItem={handleAddCustomItem}
      />

      {/* 9. GLOBAL SYSTEM SEARCH MODAL */}
      <GlobalSearch
        open={globalSearchOpen}
        onClose={() => setGlobalSearchOpen(false)}
      />
    </div>
  );
}
