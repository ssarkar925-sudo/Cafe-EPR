"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { inr } from "@/lib/format";
import { calculateGstInvoice, type GstInvoiceCalculation } from "@/lib/gst";
import { createClient } from "@/lib/supabase/client";
import {
  Check,
  ChevronDown,
  CircleUserRound,
  CreditCard,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";

export type PosCatalogItem = {
  id: string;
  kind: "product" | "service";
  name: string;
  code?: string | null;
  sale_price: number | string;
  cost_price?: number | string;
  stock_qty?: number | string;
  reorder_level?: number | string;
  unit?: string;
  category_id?: string | null;
  category_name?: string | null;
  gst_rate?: number | string | null;
  hsn_sac?: string | null;
};

export type PosCustomer = {
  id: string;
  name: string;
  code?: string | null;
  phone?: string | null;
  balance?: number | string | null;
  gstin?: string | null;
  state_code?: string | null;
};

export type PosInstrument = {
  id: string;
  name: string;
  type: string;
};

type CartLine = {
  key: string;
  id: string;
  kind: "product" | "service";
  name: string;
  code?: string | null;
  rate: number;
  qty: number;
  costPrice: number;
  categoryName: string;
  gstRate: number;
  hsnSac: string | null;
  stockQty: number | null;
  unit: string;
};

type PaymentChoice = "cash" | "upi" | "khata" | "split";

type SplitRow = {
  id: string;
  instrumentId: string;
  amount: string;
};

type SuccessState = {
  invoiceNumber: string;
  total: number;
  paid: number;
  due: number;
};

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

function MiniDropdown({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handle(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-700 shadow-sm outline-none hover:border-slate-300 focus:border-blue-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown className={`h-3 w-3 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-slate-900">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[10px] font-bold ${
                option.value === value
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
                  : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5"
              }`}
            >
              <span className="truncate">{option.label}</span>
              {option.value === value && <Check className="h-3 w-3 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PaymentButton({
  label,
  active,
  disabled,
  onClick,
  tone,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  tone: "cash" | "upi" | "khata" | "split";
}) {
  const toneClass = {
    cash: active
      ? "border-emerald-600 bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
      : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
    upi: active
      ? "border-cyan-600 bg-cyan-600 text-white shadow-md shadow-cyan-500/20"
      : "border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100",
    khata: active
      ? "border-slate-900 bg-slate-900 text-white shadow-md shadow-slate-900/15"
      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100",
    split: active
      ? "border-violet-600 bg-violet-600 text-white shadow-md shadow-violet-500/20"
      : "border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100",
  }[tone];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex h-10 items-center justify-center rounded-lg border text-[10px] font-black uppercase tracking-wide transition active:scale-[0.98] ${toneClass} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      {label}
    </button>
  );
}

export default function PosShell({
  shopName,
  operatorName,
  products,
  services,
  customers,
  instruments,
  initialCustomerId = "",
}: {
  shopName: string;
  operatorName: string;
  products: PosCatalogItem[];
  services: PosCatalogItem[];
  customers: PosCustomer[];
  instruments: PosInstrument[];
  initialCustomerId?: string;
}) {
  const supabase = createClient();
  const itemSearchRef = useRef<HTMLInputElement | null>(null);
  const customerSearchRef = useRef<HTMLInputElement | null>(null);

  const [scope, setScope] = useState<"all" | "services" | "products">("all");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState("");
  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [splitRows, setSplitRows] = useState<SplitRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "F2") {
        event.preventDefault();
        resetBill();
      } else if (event.key === "F3") {
        event.preventDefault();
        customerSearchRef.current?.focus();
      } else if (event.key === "F4") {
        event.preventDefault();
        itemSearchRef.current?.focus();
      } else if (event.key === "F9") {
        event.preventDefault();
        void completeSale();
      } else if (event.key === "Escape") {
        setCustomerOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

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
      .map(([id, count]) => ({ id, name: catalog.find((item) => item.category_id === id)?.category_name ?? "Other", count }))
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

  const selectedCustomer = customers.find((customer) => customer.id === customerId) ?? null;

  const customerMatches = useMemo(() => {
    const needle = customerSearch.trim().toLowerCase();
    if (!needle) return customers.slice(0, 8);
    return customers
      .filter((customer) => [customer.name, customer.phone, customer.code].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle)))
      .slice(0, 10);
  }, [customers, customerSearch]);

  const totals: GstInvoiceCalculation = useMemo(() => {
    return calculateGstInvoice({
      lines: cart.map((line) => ({
        qty: line.qty,
        rate: line.rate,
        gstRate: line.gstRate,
        hsnSac: line.hsnSac,
        taxTreatment: line.gstRate > 0 ? "taxable" : "non_gst",
      })),
      invoiceLumpSumDiscount: Math.max(0, Number(discount) || 0),
      customerStateCode: selectedCustomer?.state_code ?? null,
      customerGstin: selectedCustomer?.gstin ?? null,
    });
  }, [cart, discount, selectedCustomer]);

  const total = totals.invoiceTotal;
  const subtotal = totals.totalGross;
  const discountValue = totals.totalDiscount;

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

  useEffect(() => {
    if (paymentChoice === "cash" && total > 0 && !cashReceived) setCashReceived(total.toFixed(2));
  }, [paymentChoice, total, cashReceived]);

  useEffect(() => {
    if (paymentChoice === "split" && splitRows.length === 0) {
      setSplitRows([
        {
          id: makeId(),
          instrumentId: cashInstrument?.id ?? instruments[0]?.id ?? "",
          amount: total > 0 ? total.toFixed(2) : "",
        },
      ]);
    }
  }, [paymentChoice, splitRows.length, total, cashInstrument, instruments]);

  function addItem(item: PosCatalogItem) {
    setError(null);
    const stockQty = item.kind === "product" ? Number(item.stock_qty ?? 0) : null;
    if (item.kind === "product" && stockQty !== null && stockQty <= 0) return;
    setCart((current) => {
      const key = `${item.kind}:${item.id}`;
      const existing = current.find((line) => line.key === key);
      if (existing) {
        if (existing.stockQty !== null && existing.qty >= existing.stockQty) return current;
        return current.map((line) => (line.key === key ? { ...line, qty: line.qty + 1 } : line));
      }
      return [
        ...current,
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
    });
  }

  function updateQty(key: string, nextQty: number) {
    setCart((current) =>
      current.flatMap((line) => {
        if (line.key !== key) return [line];
        const max = line.stockQty === null ? Number.MAX_SAFE_INTEGER : Math.max(0, line.stockQty);
        const qty = Math.min(max, Math.max(0, Math.floor(nextQty)));
        return qty <= 0 ? [] : [{ ...line, qty }];
      })
    );
  }

  function removeLine(key: string) {
    setCart((current) => current.filter((line) => line.key !== key));
  }

  function resetBill() {
    setCart([]);
    setDiscount("");
    setCustomerId("");
    setCustomerSearch("");
    setCustomerOpen(false);
    setPaymentChoice("cash");
    setCashReceived("");
    setSplitRows([]);
    setError(null);
    setSuccess(null);
    window.setTimeout(() => itemSearchRef.current?.focus(), 50);
  }

  function selectPayment(choice: PaymentChoice) {
    setError(null);
    setPaymentChoice(choice);
    if (choice === "split") {
      const firstId = cashInstrument?.id ?? instruments[0]?.id ?? "";
      setSplitRows([{ id: makeId(), instrumentId: firstId, amount: total > 0 ? total.toFixed(2) : "" }]);
    }
    if (choice !== "cash") setCashReceived("");
    if (choice === "cash" && total > 0) setCashReceived(total.toFixed(2));
  }

  function addSplitRow() {
    const used = new Set(splitRows.map((row) => row.instrumentId));
    const next = instruments.find((instrument) => !used.has(instrument.id)) ?? instruments[0];
    const allocated = splitRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    const remaining = Math.max(0, total - allocated);
    setSplitRows((current) => [
      ...current,
      { id: makeId(), instrumentId: next?.id ?? "", amount: remaining > 0 ? remaining.toFixed(2) : "" },
    ]);
  }

  function updateSplitRow(id: string, patch: Partial<SplitRow>) {
    setSplitRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeSplitRow(id: string) {
    setSplitRows((current) => current.filter((row) => row.id !== id));
  }

  async function completeSale() {
    if (busy || !cart.length) return;
    setError(null);

    if (paymentChoice === "khata" && !selectedCustomer) {
      setError("Select a customer before using Khata.");
      setCustomerOpen(true);
      customerSearchRef.current?.focus();
      return;
    }

    if (paymentChoice === "cash") {
      const received = Number(cashReceived) || 0;
      if (received + 0.005 < total) {
        setError(`Cash received is less than ${money(total)}.`);
        return;
      }
    }

    const splitTotal = splitRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    if (paymentChoice === "split") {
      if (!splitRows.length) {
        setError("Add at least one payment in Split.");
        return;
      }
      if (splitRows.some((row) => !row.instrumentId || (Number(row.amount) || 0) <= 0)) {
        setError("Every split payment needs an account and positive amount.");
        return;
      }
      if (Math.abs(splitTotal - total) > 0.01) {
        setError(`Split must equal ${money(total)}. Remaining: ${money(total - splitTotal)}.`);
        return;
      }
    }

    const paymentPayload = (() => {
      if (paymentChoice === "khata") return [];
      if (paymentChoice === "cash") {
        return [
          {
            method: "cash",
            instrument_id: cashInstrument?.id ?? "",
            amount: total,
          },
        ];
      }
      if (paymentChoice === "upi") {
        return [
          {
            method: "upi",
            instrument_id: upiInstrument?.id ?? "",
            amount: total,
          },
        ];
      }
      return splitRows.map((row) => {
        const instrument = instruments.find((candidate) => candidate.id === row.instrumentId);
        return {
          method: methodFromInstrument(instrument),
          instrument_id: row.instrumentId,
          amount: Number(row.amount) || 0,
        };
      });
    })();

    const itemPayload = totals.lines.map((taxLine, index) => {
      const cartLine = cart[index];
      return {
        product_id: cartLine.kind === "product" ? cartLine.id : null,
        service_id: cartLine.kind === "service" ? cartLine.id : null,
        description: cartLine.name,
        qty: cartLine.qty,
        rate: cartLine.rate,
        amount: taxLine.grossAmount,
        cost_price: cartLine.costPrice,
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
        p_previous_due: 0,
        p_previous_due_method: "cash",
        p_previous_due_instrument_id: null,
        p_advance_used: 0,
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
      const result = (data ?? {}) as Partial<SuccessState>;
      setSuccess({
        invoiceNumber: String(result.invoice_number ?? "Invoice"),
        total: Number(result.total ?? total),
        paid: Number(result.paid ?? (paymentChoice === "khata" ? 0 : total)),
        due: Number(result.due ?? (paymentChoice === "khata" ? total : 0)),
      });
    } catch (saleError: any) {
      setError(saleError?.message || "Unable to complete the sale.");
    } finally {
      setBusy(false);
    }
  }

  const remainingSplit = total - splitRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const cashChange = Math.max(0, (Number(cashReceived) || 0) - total);

  return (
    <div className="fixed inset-0 z-[100] flex h-[100dvh] min-h-0 w-screen flex-col overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-white">
      <header className="flex h-14 shrink-0 items-center border-b border-slate-200 bg-white px-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
            <ShoppingCart className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-black">{shopName || "CafeERP"}</span>
              <span className="text-slate-300">/</span>
              <span className="text-sm font-extrabold text-blue-600 dark:text-blue-400">POS</span>
            </div>
          </div>
          <span className="hidden h-5 w-px bg-slate-200 sm:block dark:bg-white/10" />
          <div className="hidden items-center gap-2 text-[10px] font-bold text-slate-500 sm:flex dark:text-slate-400">
            <span>Register 01</span>
            <span>Operator: {operatorName || "Operator"}</span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-700 sm:flex dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Online
          </span>
          <button
            type="button"
            onClick={resetBill}
            className="h-8 rounded-lg bg-blue-600 px-3.5 text-[10px] font-black text-white shadow-sm hover:bg-blue-700"
          >
            + New Bill <span className="ml-1 opacity-70">F2</span>
          </button>
          <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300" aria-label="More POS actions">
            …
          </button>
        </div>
      </header>

      <nav className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-white/10 dark:bg-slate-900">
        {[
          { value: "all", label: "ALL" },
          { value: "services", label: "SERVICES" },
          { value: "products", label: "PRODUCTS" },
        ].map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => {
              setScope(item.value as typeof scope);
              setCategory("all");
            }}
            className={`shrink-0 border-b-2 px-3 py-2 text-[10px] font-black tracking-wide ${
              scope === item.value
                ? "border-blue-600 text-blue-700 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            {item.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px shrink-0 bg-slate-200 dark:bg-white/10" />
        {categories.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setScope("all");
              setCategory(item.id);
            }}
            className={`shrink-0 rounded-md px-2.5 py-1 text-[10px] font-bold ${
              category === item.id
                ? "bg-blue-600 text-white"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
            }`}
            title={`${item.count} items`}
          >
            {item.name}
          </button>
        ))}
      </nav>

      <main className="grid min-h-0 flex-1 [grid-template-columns:minmax(0,1fr)_390px] max-[1100px]:[grid-template-columns:minmax(0,1fr)_350px] max-[860px]:[grid-template-columns:minmax(0,1fr)_330px]">
        <section className="flex min-h-0 flex-col border-r border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-950">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 dark:border-white/10 dark:bg-slate-900">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                ref={itemSearchRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search / Scan barcode"
                className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-12 text-[10px] font-semibold outline-none focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-slate-950 dark:focus:bg-slate-900"
              />
              <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[8px] font-black text-slate-400 dark:border-white/10 dark:bg-slate-800">F4</kbd>
            </div>
            <span className="hidden text-[9px] font-bold text-slate-400 sm:block">{filteredItems.length} items</span>
          </div>

          <div className="flex h-9 shrink-0 items-center border-b border-slate-200 bg-slate-50 px-4 text-[8px] font-black uppercase tracking-wider text-slate-400 dark:border-white/10 dark:bg-slate-950">
            <span className="w-[46%]">Item</span>
            <span className="w-[20%]">Category</span>
            <span className="w-[13%]">Price</span>
            <span className="w-[13%]">Stock</span>
            <span className="w-[8%] text-right">Add</span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white dark:bg-slate-950">
            {filteredItems.map((item) => {
              const stock = item.kind === "product" ? Number(item.stock_qty ?? 0) : null;
              const existingQty = cart.find((line) => line.key === `${item.kind}:${item.id}`)?.qty ?? 0;
              const outOfStock = item.kind === "product" && stock !== null && stock <= 0;
              return (
                <div
                  key={`${item.kind}:${item.id}`}
                  className={`group flex min-h-[46px] items-center border-b border-slate-100 px-4 text-[10px] dark:border-white/5 ${outOfStock ? "opacity-45" : "hover:bg-blue-50/50 dark:hover:bg-white/[0.025]"}`}
                >
                  <button
                    type="button"
                    disabled={outOfStock}
                    onClick={() => addItem(item)}
                    className="flex w-[46%] min-w-0 items-center gap-2.5 text-left disabled:cursor-not-allowed"
                  >
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-black ${item.kind === "service" ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                      {item.kind === "service" ? "S" : "P"}
                    </span>
                    <span className="min-w-0 truncate font-extrabold text-slate-800 dark:text-slate-100">
                      {item.name}
                      {existingQty > 0 && <span className="ml-1.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[8px] font-black text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">×{existingQty}</span>}
                    </span>
                  </button>
                  <span className="w-[20%] truncate pr-2 text-slate-500 dark:text-slate-400">{item.category_name || "—"}</span>
                  <span className="w-[13%] font-black text-blue-600 dark:text-blue-400">{money(Number(item.sale_price) || 0)}</span>
                  <span className="w-[13%] text-slate-500 dark:text-slate-400">{stock === null ? "—" : stock}</span>
                  <span className="flex w-[8%] justify-end">
                    <button
                      type="button"
                      disabled={outOfStock}
                      onClick={() => addItem(item)}
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-white shadow-sm hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-800"
                      aria-label={`Add ${item.name}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
              );
            })}
            {!filteredItems.length && (
              <div className="flex h-full min-h-40 flex-col items-center justify-center px-6 text-center">
                <Search className="h-6 w-6 text-slate-300" />
                <p className="mt-2 text-xs font-black text-slate-500 dark:text-slate-400">No items found</p>
                <p className="mt-1 text-[10px] text-slate-400">Try another search or category.</p>
              </div>
            )}
          </div>
        </section>

        <aside className="min-h-0 overflow-hidden bg-white dark:bg-slate-900">
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex min-h-[54px] shrink-0 items-center justify-between border-b border-slate-200 px-3.5 dark:border-white/10">
              <div>
                <div className="text-[11px] font-black uppercase tracking-wide">Current Bill</div>
                <div className="text-[9px] font-bold text-slate-400">{cart.reduce((sum, item) => sum + item.qty, 0)} items · {money(total)}</div>
              </div>
              <button type="button" onClick={resetBill} className="rounded-md px-2 py-1 text-[9px] font-black text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10">Clear</button>
            </div>

            <div className="shrink-0 border-b border-slate-200 px-3.5 py-2.5 dark:border-white/10">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Customer</span>
                {selectedCustomer ? (
                  <button type="button" onClick={() => setCustomerId("")} className="text-[8px] font-black text-blue-600 hover:text-blue-700">Change</button>
                ) : (
                  <button type="button" onClick={() => setCustomerOpen(true)} className="flex items-center gap-1 text-[8px] font-black text-blue-600"><UserPlus className="h-3 w-3" /> New</button>
                )}
              </div>
              <div className="relative">
                <CircleUserRound className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  ref={customerSearchRef}
                  value={selectedCustomer ? selectedCustomer.name : customerSearch}
                  onChange={(event) => {
                    if (selectedCustomer) setCustomerId("");
                    setCustomerSearch(event.target.value);
                    setCustomerOpen(true);
                  }}
                  onFocus={() => setCustomerOpen(true)}
                  placeholder="Walk-in / search customer..."
                  className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-2 text-[10px] font-semibold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-slate-950"
                />
                {customerOpen && !selectedCustomer && (
                  <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900">
                    <div className="max-h-40 overflow-y-auto p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerId("");
                          setCustomerSearch("");
                          setCustomerOpen(false);
                        }}
                        className="flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[10px] font-bold text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5"
                      >
                        Walk-in Customer
                      </button>
                      {customerMatches.map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          onClick={() => {
                            setCustomerId(customer.id);
                            setCustomerSearch("");
                            setCustomerOpen(false);
                          }}
                          className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left hover:bg-blue-50 dark:hover:bg-blue-500/10"
                        >
                          <span className="min-w-0 truncate text-[10px] font-bold text-slate-800 dark:text-slate-100">{customer.name}</span>
                          <span className="ml-2 shrink-0 text-[8px] font-semibold text-slate-400">{customer.phone || customer.code || ""}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {selectedCustomer && (
                <div className="mt-1 flex items-center justify-between text-[8px] font-semibold text-slate-400">
                  <span>{selectedCustomer.phone || selectedCustomer.code || "Customer"}</span>
                  <span className={Number(selectedCustomer.balance ?? 0) > 0 ? "text-rose-600" : "text-emerald-600"}>
                    {Number(selectedCustomer.balance ?? 0) > 0 ? `Due ${money(Number(selectedCustomer.balance))}` : "Clear"}
                  </span>
                </div>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col px-3.5 pt-2">
              <div className="flex h-7 shrink-0 items-center border-b border-slate-100 text-[8px] font-black uppercase tracking-wider text-slate-400 dark:border-white/5">
                <span className="min-w-0 flex-1">Item</span>
                <span className="w-12 text-center">Qty</span>
                <span className="w-20 text-right">Amount</span>
                <span className="w-6" />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {cart.map((line) => (
                  <div key={line.key} className="flex min-h-[48px] items-center border-b border-slate-100 dark:border-white/5">
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="truncate text-[10px] font-extrabold text-slate-800 dark:text-slate-100">{line.name}</div>
                      <div className="text-[8px] font-semibold text-slate-400">{money(line.rate)} · {line.unit}</div>
                    </div>
                    <div className="flex w-12 items-center justify-center">
                      <button type="button" onClick={() => updateQty(line.key, line.qty - 1)} className="flex h-5 w-5 items-center justify-center rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Minus className="h-2.5 w-2.5" /></button>
                      <span className="w-5 text-center text-[9px] font-black">{line.qty}</span>
                      <button type="button" onClick={() => updateQty(line.key, line.qty + 1)} className="flex h-5 w-5 items-center justify-center rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Plus className="h-2.5 w-2.5" /></button>
                    </div>
                    <div className="w-20 text-right text-[10px] font-black">{money(line.qty * line.rate)}</div>
                    <button type="button" onClick={() => removeLine(line.key)} className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-300 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10" aria-label={`Remove ${line.name}`}><Trash2 className="h-3 w-3" /></button>
                  </div>
                ))}
                {!cart.length && (
                  <div className="flex min-h-40 items-center justify-center px-5 text-center">
                    <div>
                      <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800"><ShoppingCart className="h-4 w-4" /></div>
                      <p className="mt-2 text-[10px] font-black text-slate-500 dark:text-slate-400">Your bill is empty</p>
                      <p className="mt-1 text-[9px] text-slate-400">Select an item from the list to begin.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-3.5 pb-3 pt-2.5 dark:border-white/10 dark:bg-slate-950">
              <div className="flex items-center gap-2 pb-2">
                <span className="text-[9px] font-black uppercase tracking-wide text-slate-500">Discount</span>
                <input
                  value={discount}
                  onChange={(event) => setDiscount(event.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="ml-auto h-7 w-24 rounded-md border border-slate-200 bg-white px-2 text-right text-[10px] font-bold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-slate-900"
                />
              </div>

              <div className="space-y-0.5 text-[9px]">
                <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="font-bold">{money(subtotal)}</span></div>
                {discountValue > 0 && <div className="flex justify-between text-rose-600"><span>Discount</span><span className="font-bold">−{money(discountValue)}</span></div>}
                <div className="flex justify-between"><span className="text-slate-500">GST</span><span className="font-bold">{money(totals.totalTax)}</span></div>
              </div>

              <div className="mt-2 flex items-end justify-between border-t border-slate-200 pt-2 dark:border-white/10">
                <span className="text-[9px] font-black uppercase tracking-wide text-slate-500">Grand Total</span>
                <span className="text-[21px] font-black leading-none tracking-tight text-blue-600 dark:text-blue-400">{money(total)}</span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <PaymentButton label="Cash" tone="cash" active={paymentChoice === "cash"} disabled={!cart.length || busy} onClick={() => selectPayment("cash")} />
                <PaymentButton label="UPI" tone="upi" active={paymentChoice === "upi"} disabled={!cart.length || busy} onClick={() => selectPayment("upi")} />
                <PaymentButton label="Khata" tone="khata" active={paymentChoice === "khata"} disabled={!cart.length || busy} onClick={() => selectPayment("khata")} />
                <PaymentButton label="Split" tone="split" active={paymentChoice === "split"} disabled={!cart.length || busy} onClick={() => selectPayment("split")} />
              </div>

              {paymentChoice === "cash" && cart.length > 0 && (
                <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-1.5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                  <span className="text-[8px] font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Received</span>
                  <input value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} inputMode="decimal" className="ml-auto h-7 w-24 rounded-md border border-emerald-200 bg-white px-2 text-right text-[10px] font-black outline-none dark:border-emerald-900/50 dark:bg-slate-900" />
                  <span className="text-[8px] font-bold text-emerald-700 dark:text-emerald-300">Change {money(cashChange)}</span>
                </div>
              )}

              {paymentChoice === "split" && cart.length > 0 && (
                <div className="mt-1.5 rounded-lg border border-violet-200 bg-violet-50/60 p-2 dark:border-violet-900/50 dark:bg-violet-950/20">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[8px] font-black uppercase tracking-wide text-violet-700 dark:text-violet-300">Split Payment</span>
                    <span className={`text-[8px] font-black ${Math.abs(remainingSplit) < 0.01 ? "text-emerald-600" : remainingSplit < 0 ? "text-rose-600" : "text-violet-700"}`}>
                      {Math.abs(remainingSplit) < 0.01 ? "Balanced" : `Remaining ${money(remainingSplit)}`}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {splitRows.map((row) => (
                      <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_80px_26px] items-center gap-1.5">
                        <MiniDropdown value={row.instrumentId} options={splitInstrumentOptions} placeholder="Account" onChange={(value) => updateSplitRow(row.id, { instrumentId: value })} />
                        <input value={row.amount} onChange={(event) => updateSplitRow(row.id, { amount: event.target.value })} inputMode="decimal" className="h-8 rounded-lg border border-violet-200 bg-white px-2 text-right text-[10px] font-bold outline-none focus:border-violet-500 dark:border-violet-900/50 dark:bg-slate-900" />
                        <button type="button" onClick={() => removeSplitRow(row.id)} className="flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:bg-slate-900" aria-label="Remove split payment"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={addSplitRow} className="mt-1.5 text-[8px] font-black text-violet-700 hover:text-violet-900 dark:text-violet-300">+ Add payment</button>
                </div>
              )}

              {paymentChoice === "upi" && cart.length > 0 && (
                <div className="mt-1.5 rounded-lg border border-cyan-100 bg-cyan-50 px-2 py-1.5 text-[8px] font-bold text-cyan-800 dark:border-cyan-900/40 dark:bg-cyan-950/20 dark:text-cyan-300">
                  {upiInstrument ? `Account: ${upiInstrument.name}` : "UPI account will use the configured default."}
                </div>
              )}

              {error && <div className="mt-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[9px] font-bold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}

              <button
                type="button"
                disabled={!cart.length || busy}
                onClick={() => void completeSale()}
                className="mt-2 flex h-11 w-full items-center justify-center rounded-lg bg-blue-600 text-[10px] font-black uppercase tracking-wide text-white shadow-md shadow-blue-500/15 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {busy ? "Processing…" : `Complete Sale · ${money(total)}`}
              </button>
              <div className="mt-1 text-center text-[8px] font-semibold text-slate-400">F9 to complete</div>
            </div>
          </div>
        </aside>
      </main>

      {success && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-2xl dark:border-white/10 dark:bg-slate-900">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300"><Check className="h-6 w-6" /></div>
            <h2 className="mt-3 text-lg font-black">Sale Completed</h2>
            <p className="mt-1 text-[10px] font-bold text-slate-400">{success.invoiceNumber}</p>
            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-left dark:bg-slate-950">
              <div className="flex justify-between text-xs"><span className="text-slate-500">Total</span><strong>{money(success.total)}</strong></div>
              <div className="mt-1 flex justify-between text-xs"><span className="text-slate-500">Paid</span><strong>{money(success.paid)}</strong></div>
              <div className="mt-1 flex justify-between text-xs"><span className="text-slate-500">Due</span><strong className={success.due > 0 ? "text-rose-600" : "text-emerald-600"}>{money(success.due)}</strong></div>
            </div>
            <button type="button" onClick={resetBill} className="mt-4 h-10 w-full rounded-lg bg-blue-600 text-[10px] font-black uppercase tracking-wide text-white hover:bg-blue-700">New Bill</button>
          </div>
        </div>
      )}
    </div>
  );
}
