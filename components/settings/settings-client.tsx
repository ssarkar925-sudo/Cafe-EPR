"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { getTheme, setTheme, type Theme } from "@/components/theme-provider";
import { logAudit } from "@/lib/audit";
import MasterClient from "@/components/business/master-client";
import ProductsClient from "@/components/catalog/products-client";
import ServicesClient from "@/components/catalog/services-client";
import CategoriesClient from "@/components/catalog/categories-client";

export type SettingsRow = {
  shop_name: string;
  phone: string | null;
  address: string | null;
  receipt_footer: string | null;
  currency_symbol: string;
  logo_url: string | null;
  gstin: string | null;
  tax_rate: number | string | null;
};

export type InstrumentRow = {
  id: string;
  name: string;
  type: "cash" | "bank" | "upi" | "wallet" | "debit_card" | "credit_card";
  is_active: boolean;
  details: any;
  opening_balance: number | string;
  balance: number | string;
};

export type ServiceFavRow = {
  id: string;
  name: string;
  sale_price: number | string;
  is_quick_favorite: boolean;
  quick_sort: number | null;
};

export type PaymentMethodRow = {
  id: string;
  method: string;
  label: string;
  is_active: boolean;
  sort_order: number;
};

type MasterData = { rows: any[]; usage: Record<string, number> };

const CURRENCIES = ["₹", "$", "€", "£", "৳", "ر.س"];

const INSTRUMENT_TYPES: { value: InstrumentRow["type"]; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank account" },
  { value: "upi", label: "UPI" },
  { value: "wallet", label: "Wallet" },
  { value: "debit_card", label: "Debit card" },
  { value: "credit_card", label: "Credit card" },
];

const TYPE_STYLE: Record<string, string> = {
  cash: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  bank: "bg-blue-50 text-blue-700 ring-blue-200",
  upi: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  wallet: "bg-amber-50 text-amber-700 ring-amber-200",
  debit_card: "bg-violet-50 text-violet-700 ring-violet-200",
  credit_card: "bg-rose-50 text-rose-700 ring-rose-200",
};

const METHOD_STYLE: Record<string, string> = {
  cash: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  card: "bg-blue-50 text-blue-700 ring-blue-200",
  bank: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  upi: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  wallet: "bg-amber-50 text-amber-700 ring-amber-200",
  debit_card: "bg-violet-50 text-violet-700 ring-violet-200",
  credit_card: "bg-rose-50 text-rose-700 ring-rose-200",
};

const STANDARD_METHODS: { method: string; label: string }[] = [
  { method: "cash", label: "Cash" },
  { method: "card", label: "Card" },
  { method: "bank", label: "Bank" },
  { method: "upi", label: "UPI" },
  { method: "wallet", label: "Wallet" },
  { method: "debit_card", label: "Debit Card" },
  { method: "credit_card", label: "Credit Card" },
];

const TABS: { key: string; label: string; icon: string }[] = [
  { key: "general", label: "General", icon: "M3 9a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" },
  { key: "receipt", label: "Receipt & Printer", icon: "M6 2h12a1 1 0 0 1 1 1v18l-2.5-1.5L14 21l-2.5-1.5L9 21l-2.5-1.5L5 21V3a1 1 0 0 1 1-1Z" },
  { key: "payment-accounts", label: "Payment Accounts", icon: "M3 9a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9ZM3 14h6m0 0 2-2m-2 2 2 2" },
  { key: "payment-methods", label: "Payment Methods", icon: "M12 8c-2.2 0-4 1.3-4 3s1.8 3 4 3 4-1.3 4-3-1.8-3-4-3ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
  { key: "quick-favorites", label: "Quick Sale Favorites", icon: "M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2l-6.1 3.4 1.4-6.8L2.2 9.1l6.9-.8L12 2z" },
  { key: "catalog", label: "Catalog", icon: "M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v9" },
  { key: "business-setup", label: "Business Setup", icon: "M3 21V9l9-6 9 6v12M9 21v-6h6v6" },
  { key: "tax", label: "Tax & GST", icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" },
  { key: "backup", label: "Backup & Data", icon: "M21 12v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 8l5-5 5 5M12 3v13" },
  { key: "notifications", label: "Notifications", icon: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" },
  { key: "other", label: "Other Settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" },
];

const tabMeta: Record<string, { title: string; desc: string }> = {
  general: { title: "General", desc: "Shop identity and currency." },
  receipt: { title: "Receipt & Printer", desc: "Footer line printed on every 80mm receipt." },
  "payment-accounts": { title: "Payment Accounts", desc: "Named cash, bank, UPI, wallet and card accounts used at the till." },
  "payment-methods": { title: "Payment Methods", desc: "Which payment methods the till offers, and their order." },
  "quick-favorites": { title: "Quick Sale Favorites", desc: "Popular service buttons on the Quick Sale counter." },
  catalog: { title: "Catalog Management", desc: "Products, services and categories." },
  "business-setup": { title: "Business Setup", desc: "Banks, settlement portals and merchant QR codes." },
  tax: { title: "Tax & GST", desc: "GST registration shown on receipts." },
  backup: { title: "Backup & Data", desc: "Download your data as CSV." },
  notifications: { title: "Notifications", desc: "Alert channels for low stock and daily summaries." },
  other: { title: "Other Settings", desc: "Appearance for this browser." },
};

const THEMES: { key: Theme; label: string; icon: string; hint: string }[] = [
  { key: "light", label: "Light", icon: "M12 3v2m0 14v2M5.6 5.6l1.4 1.4m9.9 9.9 1.4 1.4M3 12h2m14 0h2M5.6 18.4l1.4-1.4m9.9-9.9 1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z", hint: "Bright & clean" },
  { key: "dark", label: "Dark", icon: "M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z", hint: "Easy on the eyes" },
  { key: "system", label: "System", icon: "M12 3a9 9 0 0 0 0 18c.5-2 .5-3.5 0-5a4.5 4.5 0 0 1 0-8c.5-1.5.5-3 0-5ZM3.5 12h17", hint: "Follow your device" },
];

export default function SettingsClient({
  initial,
  initialInstruments,
  initialServices = [],
  initialPaymentMethods = [],
  initialBanks,
  initialPortals,
  initialMerchantQrs,
  initialProducts = [],
  initialCatalogServices = [],
  initialCategories = [],
  categoryCounts = {},
  initialTab,
  initialSection,
}: {
  initial: SettingsRow | null;
  initialInstruments: InstrumentRow[];
  initialServices?: ServiceFavRow[];
  initialPaymentMethods?: PaymentMethodRow[];
  initialBanks?: MasterData;
  initialPortals?: MasterData;
  initialMerchantQrs?: MasterData;
  initialProducts?: any[];
  initialCatalogServices?: any[];
  initialCategories?: any[];
  categoryCounts?: Record<string, number>;
  initialTab?: string;
  initialSection?: string;
}) {
  const [tab, setTab] = useState<string>(
    initialTab && TABS.some((t) => t.key === initialTab) ? initialTab : "general"
  );
  const [bizSection, setBizSection] = useState<string>(
    initialSection === "portals" || initialSection === "merchant-qrs" ? initialSection : "banks"
  );
  const CATALOG_SECTIONS = ["products", "services", "categories"] as const;
  const [catalogSection, setCatalogSection] = useState<string>(
    initialSection && (CATALOG_SECTIONS as readonly string[]).includes(initialSection)
      ? initialSection
      : "products"
  );
  const [shopName, setShopName] = useState(initial?.shop_name ?? "Cafe ERP");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [footer, setFooter] = useState(initial?.receipt_footer ?? "");
  const [currency, setCurrency] = useState(initial?.currency_symbol ?? "₹");
  const [logoUrl, setLogoUrl] = useState<string | null>(initial?.logo_url ?? null);
  const [gstin, setGstin] = useState(initial?.gstin ?? "");
  const [taxRate, setTaxRate] = useState(
    initial && initial.tax_rate != null ? String(Number(initial.tax_rate)) : "0"
  );
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [theme, setThemeState] = useState<Theme>(() => getTheme());
  const [instruments, setInstruments] = useState<InstrumentRow[]>(initialInstruments);
  const [addingInst, setAddingInst] = useState(false);
  const [instModal, setInstModal] = useState<{ mode: "create" | "edit"; row: InstrumentRow | null } | null>(null);
  const [instForm, setInstForm] = useState({
    name: "",
    type: "bank" as InstrumentRow["type"],
    opening_balance: "0",
    bank_name: "",
    account_number: "",
    ifsc: "",
    upi_id: "",
    linked: "",
    card_last4: "",
    notes: "",
  });
  const [deleteInst, setDeleteInst] = useState<{ row: InstrumentRow; referenced: boolean } | null>(null);
  const [methodDel, setMethodDel] = useState<{ row: PaymentMethodRow; referenced: boolean } | null>(null);
  const [services, setServices] = useState<ServiceFavRow[]>(initialServices);
  const [favBusyId, setFavBusyId] = useState<string | null>(null);
  const [methods, setMethods] = useState<PaymentMethodRow[]>(initialPaymentMethods);
  const [methodBusy, setMethodBusy] = useState<string | null>(null);
  const [editingMethod, setEditingMethod] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [newMethod, setNewMethod] = useState<string>("");
  const [addingMethod, setAddingMethod] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  const supabase = createClient();

  const dirty = useMemo(
    () =>
      shopName !== (initial?.shop_name ?? "Cafe ERP") ||
      phone !== (initial?.phone ?? "") ||
      address !== (initial?.address ?? "") ||
      footer !== (initial?.receipt_footer ?? "") ||
      currency !== (initial?.currency_symbol ?? "₹") ||
      logoUrl !== (initial?.logo_url ?? null) ||
      gstin !== (initial?.gstin ?? "") ||
      taxRate !== (initial?.tax_rate != null ? String(Number(initial.tax_rate)) : "0"),
    [initial, shopName, phone, address, footer, currency, logoUrl, gstin, taxRate]
  );

  useEffect(() => {
    setThemeState(getTheme());
  }, []);

  function flash(type: "success" | "error", text: string) {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  }

  function switchTab(key: string) {
    setTab(key);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", key);
    if (key === "business-setup") url.searchParams.set("section", bizSection);
    window.history.replaceState(null, "", url.toString());
  }

  function switchBiz(section: string) {
    setBizSection(section);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "business-setup");
    url.searchParams.set("section", section);
    window.history.replaceState(null, "", url.toString());
  }

  function switchCatalog(section: string) {
    setCatalogSection(section);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "catalog");
    url.searchParams.set("section", section);
    window.history.replaceState(null, "", url.toString());
  }

  async function uploadLogo(file: File) {
    setUploading(true);
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "png";
    const path = `logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
    setUploading(false);
    if (error) {
      flash("error", error.message);
      return;
    }
    const { data } = supabase.storage.from("logos").getPublicUrl(path);
    setLogoUrl(data.publicUrl);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setToast(null);
    const { error } = await supabase
      .from("settings")
      .upsert({
        id: 1,
        shop_name: shopName.trim() || "Cafe ERP",
        phone,
        address,
        receipt_footer: footer,
        currency_symbol: currency,
        logo_url: logoUrl,
        gstin: gstin.trim() || null,
        tax_rate: Number(taxRate) || 0,
      })
      .single();
    setSaving(false);
    if (error) {
      flash("error", error.message);
      return;
    }
    flash("success", "Settings saved.");
    logAudit({ action: "settings", entity: "settings", entity_id: "1", description: "Shop settings updated" });
  }

  function chooseTheme(t: Theme) {
    setThemeState(t);
    setTheme(t);
  }

  async function toggleInstrument(row: InstrumentRow) {
    const next = !row.is_active;
    const { error } = await supabase.from("payment_instruments").update({ is_active: next }).eq("id", row.id);
    if (error) {
      flash("error", error.message);
      return;
    }
    setInstruments((prev) => prev.map((x) => (x.id === row.id ? { ...x, is_active: next } : x)));
    flash("success", next ? `${row.name} activated.` : `${row.name} deactivated.`);
    logAudit({
      action: next ? "activate" : "deactivate",
      entity: "payment_instrument",
      entity_id: row.id,
      description: `${row.name} ${next ? "activated" : "deactivated"}`,
    });
  }

  function openInstCreate() {
    setInstForm({
      name: "",
      type: "bank",
      opening_balance: "0",
      bank_name: "",
      account_number: "",
      ifsc: "",
      upi_id: "",
      linked: "",
      card_last4: "",
      notes: "",
    });
    setInstModal({ mode: "create", row: null });
  }

  function openInstEdit(row: InstrumentRow) {
    const d = row.details ?? {};
    setInstForm({
      name: row.name,
      type: row.type,
      opening_balance: String(Number(row.opening_balance ?? 0)),
      bank_name: d.bank_name ?? "",
      account_number: d.account_number ?? "",
      ifsc: d.ifsc ?? "",
      upi_id: d.upi_id ?? "",
      linked: d.linked ?? "",
      card_last4: d.card_last4 ?? "",
      notes: d.notes ?? "",
    });
    setInstModal({ mode: "edit", row });
  }

  async function saveInstrument() {
    if (!instModal) return;
    const name = instForm.name.trim();
    if (!name) {
      flash("error", "Account name is required.");
      return;
    }
    const type = instForm.type;
    const details: Record<string, string> = {};
    if (type === "bank") {
      details.bank_name = instForm.bank_name.trim();
      details.account_number = instForm.account_number.trim();
      details.ifsc = instForm.ifsc.trim();
    } else if (type === "upi") {
      details.upi_id = instForm.upi_id.trim();
      details.linked = instForm.linked.trim();
    } else if (type === "debit_card" || type === "credit_card") {
      details.card_last4 = instForm.card_last4.trim().replace(/\D/g, "").slice(-4);
    }
    details.notes = instForm.notes.trim();
    setAddingInst(true);
    if (instModal.mode === "edit" && instModal.row) {
      const { error } = await supabase
        .from("payment_instruments")
        .update({ name, type, details })
        .eq("id", instModal.row.id);
      setAddingInst(false);
      if (error) {
        flash("error", error.message);
        return;
      }
      const prev = instModal.row;
      setInstruments((prevList) =>
        prevList.map((x) => (x.id === prev.id ? { ...x, name, type, details } : x))
      );
      flash("success", "Payment account updated.");
      logAudit({
        action: "update",
        entity: "payment_instrument",
        entity_id: instModal.row.id,
        description: `Payment account updated: ${name}`,
      });
    } else {
      const { data, error } = await supabase
        .from("payment_instruments")
        .insert({
          name,
          type,
          details,
          opening_balance: Number(instForm.opening_balance) || 0,
        })
        .select("*")
        .single();
      setAddingInst(false);
      if (error) {
        flash("error", error.message);
        return;
      }
      const row = data as InstrumentRow;
      setInstruments((prev) => [...prev, row]);
      flash("success", `${name} added.`);
      logAudit({
        action: "create",
        entity: "payment_instrument",
        entity_id: row.id,
        description: `Payment account added: ${name} (${type})`,
      });
    }
    setInstModal(null);
  }

  async function requestDeleteInstrument(row: InstrumentRow) {
    const [{ count: p }, { count: c }, { data: qs }] = await Promise.all([
      supabase.from("payments").select("id", { count: "exact", head: true }).eq("instrument_id", row.id),
      supabase.from("cash_entries").select("id", { count: "exact", head: true }).eq("instrument_id", row.id),
      supabase.from("quick_sales").select("id").contains("payments", [{ instrument_id: row.id }]),
    ]);
    const referenced = (p ?? 0) > 0 || (c ?? 0) > 0 || (qs?.length ?? 0) > 0;
    setDeleteInst({ row, referenced });
  }

  async function confirmDeleteInstrument(row: InstrumentRow) {
    const { error } = await supabase.from("payment_instruments").delete().eq("id", row.id);
    if (error) {
      flash("error", error.message);
      return;
    }
    setInstruments((prev) => prev.filter((x) => x.id !== row.id));
    setDeleteInst(null);
    flash("success", `${row.name} deleted.`);
    logAudit({
      action: "delete",
      entity: "payment_instrument",
      entity_id: row.id,
      description: `Payment account deleted: ${row.name}`,
    });
  }

  function instSummary(row: InstrumentRow) {
    const d = row.details ?? {};
    if (row.type === "bank") {
      const parts: string[] = [];
      if (d.bank_name) parts.push(d.bank_name);
      if (d.account_number) parts.push("•••• " + String(d.account_number).replace(/\D/g, "").slice(-4));
      if (d.ifsc) parts.push("IFSC " + d.ifsc);
      return parts.join(" · ");
    }
    if (row.type === "upi") return d.upi_id || "";
    if (row.type === "debit_card" || row.type === "credit_card") return d.card_last4 ? "•••• " + d.card_last4 : "";
    return d.notes || "—";
  }

  async function requestDeleteMethod(row: PaymentMethodRow) {
    const [{ count: p }, { data: qs }] = await Promise.all([
      supabase.from("payments").select("id", { count: "exact", head: true }).eq("method", row.method),
      supabase.from("quick_sales").select("id").contains("payments", [{ method: row.method }]),
    ]);
    const referenced = (p ?? 0) > 0 || (qs?.length ?? 0) > 0;
    setMethodDel({ row, referenced });
  }

  async function confirmDeleteMethod(row: PaymentMethodRow) {
    const { error } = await supabase.from("payment_methods").delete().eq("id", row.id);
    if (error) {
      flash("error", error.message);
      return;
    }
    setMethods((prev) => prev.filter((x) => x.id !== row.id));
    setMethodDel(null);
    flash("success", `${row.label} removed.`);
    logAudit({
      action: "delete",
      entity: "payment_method",
      entity_id: row.id,
      description: `Payment method removed: ${row.label}`,
    });
  }

  function updateForm(patch: Partial<typeof instForm>) {
    setInstForm((prev) => ({ ...prev, ...patch }));
  }

  function setMethodDelActive() {
    const del = deleteInst;
    if (!del) return;
    toggleInstrument(del.row);
    setDeleteInst(null);
  }

  function setMethodDelMethodActive() {
    const del = methodDel;
    if (!del) return;
    togglePaymentMethod(del.row);
    setMethodDel(null);
  }

  async function toggleFavorite(row: ServiceFavRow) {
    const next = !row.is_quick_favorite;
    setFavBusyId(row.id);
    const max = services.reduce((m, s) => (s.is_quick_favorite && (s.quick_sort ?? 0) > m ? s.quick_sort ?? 0 : m), 0);
    const { error } = await supabase
      .from("services")
      .update({ is_quick_favorite: next, quick_sort: next ? max + 1 : 0 })
      .eq("id", row.id);
    setFavBusyId(null);
    if (error) {
      flash("error", error.message);
      return;
    }
    setServices((prev) => prev.map((x) => (x.id === row.id ? { ...x, is_quick_favorite: next, quick_sort: next ? max + 1 : 0 } : x)));
    flash("success", next ? `${row.name} added to Quick Sale.` : `${row.name} removed from Quick Sale.`);
    logAudit({
      action: next ? "favorite" : "unfavorite",
      entity: "service",
      entity_id: row.id,
      description: `Quick Sale ${next ? "favourite added" : "favourite removed"}: ${row.name}`,
    });
  }

  async function moveFavorite(row: ServiceFavRow, dir: -1 | 1) {
    const favs = services
      .filter((s) => s.is_quick_favorite)
      .sort((a, b) => (a.quick_sort ?? 0) - (b.quick_sort ?? 0));
    const idx = favs.findIndex((s) => s.id === row.id);
    const swapWith = favs[idx + dir];
    if (!swapWith) return;
    setFavBusyId(row.id);
    const a = row.quick_sort ?? 0;
    const b = swapWith.quick_sort ?? 0;
    const { error } = await supabase
      .from("services")
      .upsert([
        { id: row.id, quick_sort: b },
        { id: swapWith.id, quick_sort: a },
      ]);
    setFavBusyId(null);
    if (error) {
      flash("error", error.message);
      return;
    }
    setServices((prev) =>
      prev.map((x) => (x.id === row.id ? { ...x, quick_sort: b } : x.id === swapWith.id ? { ...x, quick_sort: a } : x))
    );
  }

  async function addPaymentMethod() {
    if (!newMethod) {
      flash("error", "Choose a payment method to enable.");
      return;
    }
    const spec = STANDARD_METHODS.find((m) => m.method === newMethod);
    if (!spec) return;
    const max = methods.reduce((m, r) => Math.max(m, r.sort_order), 0);
    setAddingMethod(true);
    const { data, error } = await supabase
      .from("payment_methods")
      .insert({ method: spec.method, label: spec.label, sort_order: max + 1 })
      .select("*")
      .single();
    setAddingMethod(false);
    if (error) {
      flash("error", error.message);
      return;
    }
    setMethods((prev) => [...prev, data as PaymentMethodRow]);
    setNewMethod("");
    flash("success", `${spec.label} enabled.`);
    logAudit({
      action: "create",
      entity: "payment_method",
      entity_id: (data as PaymentMethodRow).id,
      description: `Payment method enabled: ${spec.label}`,
    });
  }

  async function togglePaymentMethod(row: PaymentMethodRow) {
    const next = !row.is_active;
    setMethodBusy(row.id);
    const { error } = await supabase.from("payment_methods").update({ is_active: next }).eq("id", row.id);
    setMethodBusy(null);
    if (error) {
      flash("error", error.message);
      return;
    }
    setMethods((prev) => prev.map((x) => (x.id === row.id ? { ...x, is_active: next } : x)));
    flash("success", next ? `${row.label} enabled at the till.` : `${row.label} disabled at the till.`);
    logAudit({
      action: next ? "activate" : "deactivate",
      entity: "payment_method",
      entity_id: row.id,
      description: `${row.label} ${next ? "enabled" : "disabled"} at the till`,
    });
  }

  async function saveMethodLabel(row: PaymentMethodRow) {
    const label = editingLabel.trim();
    if (!label) {
      setEditingMethod(null);
      return;
    }
    const { error } = await supabase.from("payment_methods").update({ label }).eq("id", row.id);
    if (error) {
      flash("error", error.message);
      return;
    }
    setMethods((prev) => prev.map((x) => (x.id === row.id ? { ...x, label } : x)));
    setEditingMethod(null);
    flash("success", "Payment method renamed.");
    logAudit({
      action: "update",
      entity: "payment_method",
      entity_id: row.id,
      description: `Payment method renamed to ${label}`,
    });
  }

  async function movePaymentMethod(row: PaymentMethodRow, dir: -1 | 1) {
    const sorted = [...methods].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((x) => x.id === row.id);
    const swapWith = sorted[idx + dir];
    if (!swapWith) return;
    setMethodBusy(row.id);
    const { error } = await supabase.from("payment_methods").upsert([
      { id: row.id, sort_order: swapWith.sort_order },
      { id: swapWith.id, sort_order: row.sort_order },
    ]);
    setMethodBusy(null);
    if (error) {
      flash("error", error.message);
      return;
    }
    setMethods((prev) =>
      prev.map((x) =>
        x.id === row.id
          ? { ...x, sort_order: swapWith.sort_order }
          : x.id === swapWith.id
            ? { ...x, sort_order: row.sort_order }
            : x
      )
    );
  }

  function startEditLabel(row: PaymentMethodRow) {
    setEditingMethod(row.id);
    setEditingLabel(row.label);
  }

  async function exportCsv(kind: "customers" | "invoices" | "ledger") {
    setExporting(kind);
    let rows: any[] = [];
    let headers: string[] = [];
    let map: (r: any) => (string | number)[] = () => [];
    try {
      if (kind === "customers") {
        const { data, error } = await supabase
          .from("customers")
          .select("code, name, phone, email, address, opening_balance, balance, customer_type, is_active, created_at")
          .order("created_at");
        if (error) throw new Error(error.message);
        headers = ["Code", "Name", "Phone", "Email", "Address", "Opening Balance", "Balance", "Type", "Active", "Created At"];
        rows = (data ?? []) as any[];
        map = (r) => [r.code, r.name, r.phone, r.email, r.address, r.opening_balance, r.balance, r.customer_type, r.is_active, r.created_at];
      } else if (kind === "invoices") {
        const { data, error } = await supabase
          .from("invoices")
          .select("invoice_number, invoice_date, customers(name), subtotal, discount, total, paid, due, status")
          .order("created_at");
        if (error) throw new Error(error.message);
        headers = ["Invoice", "Date", "Customer", "Subtotal", "Discount", "Total", "Paid", "Due", "Status"];
        rows = (data ?? []) as any[];
        map = (r) => [r.invoice_number, r.invoice_date, r.customers?.name ?? "", r.subtotal, r.discount, r.total, r.paid, r.due, r.status];
      } else {
        const { data, error } = await supabase
          .from("customer_ledger")
          .select("entry_date, customers(name), type, description, debit, credit, balance_after")
          .order("created_at");
        if (error) throw new Error(error.message);
        headers = ["Date", "Customer", "Type", "Description", "Debit", "Credit", "Balance After"];
        rows = (data ?? []) as any[];
        map = (r) => [r.entry_date, r.customers?.name ?? "", r.type, r.description, r.debit, r.credit, r.balance_after];
      }
    } catch (e: any) {
      setExporting(null);
      flash("error", e.message || "Export failed.");
      return;
    }

    const csv = (v: any) => {
      if (v === null || v === undefined) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const lines = [headers.join(","), ...rows.map((r) => map(r).map(csv).join(","))];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    setExporting(null);
    flash("success", `${kind} exported.`);
    logAudit({
      action: "export",
      entity: "report",
      entity_id: null,
      description: `Exported ${kind} CSV from Settings → Backup & Data`,
    });
  }

  const inputClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const labelClass = "mb-1 block text-xs font-semibold text-slate-500";

  const isFormTab = tab === "general" || tab === "receipt" || tab === "tax";
  const availableMethods = STANDARD_METHODS.filter((m) => !methods.some((x) => x.method === m.method));
  const sortedMethods = [...methods].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="text-sm text-slate-500">{tabMeta[tab]?.desc}</p>
        </div>
        {isFormTab && (
          <button
            onClick={() => (document.getElementById("save-settings") as HTMLButtonElement)?.click()}
            disabled={saving || !dirty}
            className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        )}
      </div>

      <div className="mt-6 flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-100/80 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
              tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d={t.icon} />
            </svg>
            <span className="whitespace-nowrap">{t.label}</span>
          </button>
        ))}
      </div>
      <form onSubmit={save} className={isFormTab ? "" : "hidden"}>
        <div className={`mt-6 space-y-6 ${tab === "general" ? "" : "hidden"}`}>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
                  <path d="M3 9a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9ZM3 14h6m0 0 2-2m-2 2 2 2" />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Shop Profile</h2>
                <p className="text-xs text-slate-400">Shown at the top of every thermal receipt.</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl ring-2 ring-slate-200 transition hover:ring-blue-400"
              >
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-slate-300">+</span>
                )}
              </button>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700">{logoUrl ? "Shop logo" : "Add a shop logo"}</p>
                <p className="text-xs text-slate-400">PNG/JPG, square works best</p>
                <div className="mt-1.5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    {uploading ? "Uploading…" : logoUrl ? "Change" : "Upload"}
                  </button>
                  {logoUrl && (
                    <button
                      type="button"
                      onClick={() => setLogoUrl(null)}
                      className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadLogo(f);
                  e.target.value = "";
                }}
              />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass}>Shop name *</label>
                <input required value={shopName} onChange={(e) => setShopName(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Phone</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98XXXXXXXX" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Currency</label>
                <input
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  list="currencies"
                  maxLength={4}
                  className={inputClass}
                />
                <datalist id="currencies">
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Address</label>
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Shop address for the receipt" className={inputClass} />
              </div>
            </div>
          </section>
        </div>

        <div className={`mt-6 space-y-6 ${tab === "receipt" ? "" : "hidden"}`}>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
                  <path d="M6 2h12a1 1 0 0 1 1 1v18l-2.5-1.5L14 21l-2.5-1.5L9 21l-2.5-1.5L5 21V3a1 1 0 0 1 1-1Z" />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Receipt</h2>
                <p className="text-xs text-slate-400">Tail line printed on every 80mm receipt.</p>
              </div>
            </div>
            <div>
              <label className={labelClass}>Receipt footer</label>
              <textarea
                rows={3}
                value={footer}
                onChange={(e) => setFooter(e.target.value)}
                placeholder={"Thank you for shopping!\nVisit again"}
                className={inputClass}
              />
            </div>
          </section>
        </div>

        <div className={`mt-6 space-y-6 ${tab === "tax" ? "" : "hidden"}`}>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">GST Registration</h2>
                <p className="text-xs text-slate-400">Printed on receipts when filled in.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>GSTIN</label>
                <input
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value)}
                  placeholder="22ABCDE1234F1Z5"
                  maxLength={15}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Default tax rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  placeholder="0"
                  className={inputClass}
                />
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              The rate is informational for receipts. Billing applies tax only through invoice
              discount/line entries — there is no automatic tax engine.
            </p>
          </section>
        </div>

        <button type="submit" id="save-settings" className="hidden" />
      </form>

      <div className={tab === "payment-accounts" ? "mt-6" : "hidden"}>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Payment Accounts</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Manage the cash, bank, UPI, wallet and card accounts used at the till.
              </p>
            </div>
            <button
              type="button"
              onClick={openInstCreate}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-4 w-4">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add Account
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Account name</th>
                  <th className="px-4 py-2.5">Details</th>
                  <th className="px-4 py-2.5 text-right">Balance</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {instruments.map((row) => {
                  const label = INSTRUMENT_TYPES.find((t) => t.value === row.type)?.label ?? row.type;
                  return (
                    <tr key={row.id} className={`border-b border-slate-50 ${row.is_active ? "" : "bg-slate-50/50"}`}>
                      <td className="px-5 py-3">
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${TYPE_STYLE[row.type]}`}>{label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-medium ${row.is_active ? "text-slate-900" : "text-slate-400 line-through"}`}>{row.name}</span>
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-xs text-slate-500">{instSummary(row)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">{inr(Number(row.balance) || 0)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${row.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                          {row.is_active ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openInstEdit(row)}
                            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                            title="Edit account"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                              <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => requestDeleteInstrument(row)}
                            className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                            title="Delete account"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                              <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6m4-6v6" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleInstrument(row)}
                            className={`relative ml-1 h-5 w-9 shrink-0 rounded-full transition ${row.is_active ? "bg-emerald-500" : "bg-slate-300"}`}
                            title={row.is_active ? "Disable account" : "Enable account"}
                          >
                            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${row.is_active ? "left-[18px]" : "left-0.5"}`} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {instruments.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-14 text-center text-sm text-slate-400">
                      No payment accounts yet — add your bank, card, UPI and wallet names above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* ── Add / edit payment account modal ───────────────── */}
      {instModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#020617]/60 p-4 backdrop-blur-sm"
          onClick={() => setInstModal(null)}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {instModal.mode === "create" ? "Add Payment Account" : "Edit Payment Account"}
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Accounts appear in POS and Quick Sale as payment destinations.
                </p>
              </div>
              <button onClick={() => setInstModal(null)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" title="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <div>
                <label className={labelClass}>Account name *</label>
                <input
                  autoFocus
                  value={instForm.name}
                  onChange={(e) => updateForm({ name: e.target.value })}
                  placeholder="e.g. Cash in Hand, PhonePe, HDFC Savings"
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Account type</label>
                  <select
                    value={instForm.type}
                    onChange={(e) => updateForm({ type: e.target.value as InstrumentRow["type"] })}
                    className={inputClass}
                  >
                    {INSTRUMENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                {instModal.mode === "create" ? (
                  <div>
                    <label className={labelClass}>Opening balance (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={instForm.opening_balance}
                      onChange={(e) => updateForm({ opening_balance: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                ) : (
                  <div>
                    <label className={labelClass}>Current balance</label>
                    <div className={`${inputClass} flex items-center bg-slate-50 font-semibold text-slate-700`}>
                      {inr(Number(instModal.row?.balance) || 0)}
                    </div>
                  </div>
                )}
              </div>

              {instForm.type === "bank" && (
                <>
                  <div>
                    <label className={labelClass}>Bank name</label>
                    <input value={instForm.bank_name} onChange={(e) => updateForm({ bank_name: e.target.value })} placeholder="e.g. HDFC Bank" className={inputClass} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Account number / reference</label>
                      <input value={instForm.account_number} onChange={(e) => updateForm({ account_number: e.target.value })} placeholder="Only last 4 shown in list" className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>IFSC</label>
                      <input value={instForm.ifsc} onChange={(e) => updateForm({ ifsc: e.target.value })} placeholder="HDFC0001234" className={inputClass} />
                    </div>
                  </div>
                </>
              )}

              {instForm.type === "upi" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>UPI ID</label>
                    <input value={instForm.upi_id} onChange={(e) => updateForm({ upi_id: e.target.value })} placeholder="shop@okhdfcbank" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Linked / remarks</label>
                    <input value={instForm.linked} onChange={(e) => updateForm({ linked: e.target.value })} placeholder="e.g. Merchant QR" className={inputClass} />
                  </div>
                </div>
              )}

              {(instForm.type === "debit_card" || instForm.type === "credit_card") && (
                <div>
                  <label className={labelClass}>Card number (last 4 digits only)</label>
                  <input
                    value={instForm.card_last4}
                    onChange={(e) => updateForm({ card_last4: e.target.value })}
                    maxLength={4}
                    placeholder="1234"
                    className={inputClass}
                  />
                  <p className="mt-1 text-[11px] text-slate-400">Full card numbers are never stored.</p>
                </div>
              )}

              <div>
                <label className={labelClass}>Notes</label>
                <textarea
                  value={instForm.notes}
                  onChange={(e) => updateForm({ notes: e.target.value })}
                  placeholder="e.g. Main cash drawer at the counter"
                  rows={2}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setInstModal(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={saveInstrument}
                disabled={addingInst || !instForm.name.trim()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {addingInst ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Safe delete / disable modal (accounts + methods) ── */}
      {(deleteInst || methodDel) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#020617]/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            {deleteInst?.referenced || methodDel?.referenced ? (
              <>
                <h3 className="text-lg font-bold text-slate-900">Used by existing transactions</h3>
                <p className="mt-1 text-sm text-slate-500">
                  This {deleteInst ? "payment account" : "payment method"} is used by existing transactions.
                  Disable it instead to preserve financial history.
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    onClick={() => { setDeleteInst(null); setMethodDel(null); }}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { if (deleteInst) setMethodDelActive(); else setMethodDelMethodActive(); }}
                    className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600"
                  >
                    Disable Account
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold text-slate-900">
                  Delete {deleteInst ? "Payment Account" : "Payment Method"}?
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  “{deleteInst?.row.name ?? methodDel?.row.label}” has no transaction history and will be permanently
                  removed. This cannot be undone.
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    onClick={() => { setDeleteInst(null); setMethodDel(null); }}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { if (deleteInst) confirmDeleteInstrument(deleteInst.row); else if (methodDel) confirmDeleteMethod(methodDel.row); }}
                    className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className={tab === "payment-methods" ? "mt-6" : "hidden"}>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-100 text-cyan-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
                <path d="M12 8c-2.2 0-4 1.3-4 3s1.8 3 4 3 4-1.3 4-3-1.8-3-4-3ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Payment Methods</h2>
              <p className="text-xs text-slate-400">
                These are the methods POS and Quick Sale offer at the till. Disabled methods are hidden; reorder to set their order.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {sortedMethods.map((row, idx) => (
              <div key={row.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
                <span
                  className={`rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${METHOD_STYLE[row.method] ?? "bg-slate-100 text-slate-600 ring-slate-200"} ${
                    row.is_active ? "" : "opacity-50"
                  }`}
                >
                  {row.method}
                </span>
                {editingMethod === row.id ? (
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <input
                      autoFocus
                      value={editingLabel}
                      onChange={(e) => setEditingLabel(e.target.value)}
                      className={inputClass + " min-w-0 flex-1"}
                    />
                    <button
                      type="button"
                      onClick={() => saveMethodLabel(row)}
                      className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingMethod(null)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <span className={`min-w-0 flex-1 truncate text-sm font-medium ${row.is_active ? "text-slate-900" : "text-slate-400 line-through"}`}>
                    {row.label}
                  </span>
                )}
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={idx <= 0 || methodBusy === row.id}
                    onClick={() => movePaymentMethod(row, -1)}
                    className="rounded-md p-1 text-slate-400 transition hover:bg-white hover:text-slate-700 disabled:opacity-30"
                    title="Move up"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                      <path d="m18 15-6-6-6 6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    disabled={idx >= sortedMethods.length - 1 || methodBusy === row.id}
                    onClick={() => movePaymentMethod(row, 1)}
                    className="rounded-md p-1 text-slate-400 transition hover:bg-white hover:text-slate-700 disabled:opacity-30"
                    title="Move down"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => startEditLabel(row)}
                    className="rounded-md p-1 text-slate-400 transition hover:bg-white hover:text-slate-700"
                    title="Rename"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => requestDeleteMethod(row)}
                    className="rounded-md p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    title="Remove"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6m4-6v6" />
                    </svg>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => togglePaymentMethod(row)}
                  disabled={methodBusy === row.id}
                  className={`relative h-5 w-9 shrink-0 rounded-full transition ${
                    row.is_active ? "bg-emerald-500" : "bg-slate-300"
                  } disabled:opacity-50`}
                  title={row.is_active ? "Disable at the till" : "Enable at the till"}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
                      row.is_active ? "left-[18px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <select
              value={newMethod}
              onChange={(e) => setNewMethod(e.target.value)}
              className={inputClass + " min-w-[220px] flex-1"}
            >
              <option value="">Choose a method to enable…</option>
              {availableMethods.map((m) => (
                <option key={m.method} value={m.method}>
                  {m.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addPaymentMethod}
              disabled={addingMethod || !newMethod || availableMethods.length === 0}
              className="rounded-lg bg-cyan-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {addingMethod ? "Adding…" : "Enable method"}
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Disabling hides the method from the till. There is no hard delete — methods are archived by
            switching them off, keeping past sales intact.
          </p>
        </section>
      </div>
      <div className={tab === "quick-favorites" ? "mt-6" : "hidden"}>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4.5 w-4.5">
                <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2l-6.1 3.4 1.4-6.8L2.2 9.1l6.9-.8L12 2z" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Quick Sale Favourites</h2>
              <p className="text-xs text-slate-400">
                Choose which services show as big "Popular" buttons on the Quick Sale counter. Use the arrows to order them.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {services.map((row) => {
              const fav = row.is_quick_favorite;
              const favs = services.filter((s) => s.is_quick_favorite).sort((a, b) => (a.quick_sort ?? 0) - (b.quick_sort ?? 0));
              const idx = favs.findIndex((s) => s.id === row.id);
              return (
                <div key={row.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-xs font-bold text-white">
                    {row.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{row.name}</span>
                    <span className="block text-[11px] text-slate-400">₹{Number(row.sale_price)}</span>
                  </span>
                  {fav && (
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => moveFavorite(row, -1)}
                        disabled={idx <= 0 || favBusyId === row.id}
                        className="rounded-md p-1 text-slate-400 transition hover:bg-white hover:text-slate-700 disabled:opacity-30"
                        title="Move up"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                          <path d="m18 15-6-6-6 6" />
                        </svg>
                      </button>
                      <button
                        onClick={() => moveFavorite(row, 1)}
                        disabled={idx < 0 || idx >= favs.length - 1 || favBusyId === row.id}
                        className="rounded-md p-1 text-slate-400 transition hover:bg-white hover:text-slate-700 disabled:opacity-30"
                        title="Move down"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleFavorite(row)}
                    disabled={favBusyId === row.id}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                      fav ? "bg-amber-500" : "bg-slate-300"
                    } disabled:opacity-50`}
                    title={fav ? "Remove from favourites" : "Add to favourites"}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                        fav ? "left-[22px]" : "left-0.5"
                      }`}
                    />
                  </button>
                </div>
              );
            })}
            {services.length === 0 && (
              <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-400 ring-1 ring-slate-100">
                No services yet — add some in Settings → Catalog → Services first.
              </p>
            )}
          </div>
        </section>
      </div>

      <div className={tab === "catalog" ? "mt-6" : "hidden"}>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
                <path d="M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v9" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Catalog Management</h2>
              <p className="text-xs text-slate-400">
                Products, services and categories. Items in use are deactivated, never deleted.
              </p>
            </div>
          </div>

          <div className="mb-2 flex gap-1 rounded-xl bg-slate-100 p-1 text-sm">
            {(
              [
                { key: "products", label: "Products" },
                { key: "services", label: "Services" },
                { key: "categories", label: "Categories" },
              ] as const
            ).map((s) => (
              <button
                key={s.key}
                onClick={() => switchCatalog(s.key)}
                className={`rounded-lg px-3 py-1.5 font-medium transition ${
                  catalogSection === s.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="-mx-6 -mb-6">
            {catalogSection === "products" && (
              <ProductsClient embedded initialProducts={initialProducts} categories={initialCategories} />
            )}
            {catalogSection === "services" && (
              <ServicesClient embedded initialServices={initialCatalogServices} categories={initialCategories} />
            )}
            {catalogSection === "categories" && (
              <CategoriesClient embedded initialCategories={initialCategories} counts={categoryCounts} />
            )}
          </div>
        </section>
      </div>

      <div className={tab === "business-setup" ? "mt-6" : "hidden"}>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
                <path d="M3 21V9l9-6 9 6v12M9 21v-6h6v6" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Business Setup</h2>
              <p className="text-xs text-slate-400">
                Banks, settlement portals and merchant QR codes used by AEPS / DMT / UPI. Records with
                past transactions are archived (deactivated), never deleted.
              </p>
            </div>
          </div>

          <div className="mb-2 flex gap-1 rounded-xl bg-slate-100 p-1 text-sm">
            {(
              [
                { key: "banks", label: "Banks" },
                { key: "portals", label: "Portals" },
                { key: "merchant-qrs", label: "Merchant QRs" },
              ] as const
            ).map((s) => (
              <button
                key={s.key}
                onClick={() => switchBiz(s.key)}
                className={`rounded-lg px-3 py-1.5 font-medium transition ${
                  bizSection === s.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="-mx-6 -mb-6">
            {bizSection === "banks" && (
              <MasterClient
                embedded
                title="AEPS Banks"
                desc="Banks used for AEPS cash withdrawals."
                table="aeps_banks"
                fields={[
                  { key: "name", label: "Bank Name", required: true, placeholder: "State Bank of India" },
                  { key: "code", label: "Code", placeholder: "SBI" },
                ]}
                rows={initialBanks?.rows ?? []}
                usage={initialBanks?.usage ?? {}}
              />
            )}
            {bizSection === "portals" && (
              <MasterClient
                embedded
                title="AEPS Portals"
                desc="AEPS settlement portals used by the shop."
                table="aeps_portals"
                fields={[
                  { key: "name", label: "Portal Name", required: true, placeholder: "PayNearby" },
                  { key: "code", label: "Code", placeholder: "PN" },
                  { key: "remarks", label: "Remarks", placeholder: "Settlement daily by 6 PM" },
                ]}
                rows={initialPortals?.rows ?? []}
                usage={initialPortals?.usage ?? {}}
              />
            )}
            {bizSection === "merchant-qrs" && (
              <MasterClient
                embedded
                title="UPI Merchant QRs"
                desc="Shop UPI QR codes used for UPI cash-out transfers."
                table="upi_merchant_qrs"
                fields={[
                  { key: "display_name", label: "Display Name", required: true, placeholder: "Shop Main QR" },
                  { key: "upi_id", label: "UPI ID", required: true, placeholder: "shop@sbi" },
                ]}
                rows={initialMerchantQrs?.rows ?? []}
                usage={initialMerchantQrs?.usage ?? {}}
                display={(r) => r.display_name || r.name || ""}
              />
            )}
          </div>
        </section>
      </div>

      <div className={tab === "backup" ? "mt-6" : "hidden"}>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
                <path d="M21 12v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 8l5-5 5 5M12 3v13" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Backup & Data</h2>
              <p className="text-xs text-slate-400">
                Download a CSV snapshot of your data. Full backups live in your Supabase project.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(
              [
                { key: "customers", label: "Customers", hint: "Directory, balances & types" },
                { key: "invoices", label: "Invoices", hint: "Every bill with payments" },
                { key: "ledger", label: "Customer Ledger", hint: "All ledger entries" },
              ] as const
            ).map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => exportCsv(b.key)}
                disabled={exporting === b.key}
                className="flex flex-col items-start gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-blue-300 hover:bg-blue-50/50 disabled:opacity-50"
              >
                <span className="text-sm font-semibold text-slate-900">{exporting === b.key ? "Exporting…" : b.label}</span>
                <span className="text-xs text-slate-400">{b.hint}</span>
                <span className="mt-1 rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white">Download CSV</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className={tab === "notifications" ? "mt-6" : "hidden"}>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Notifications</h2>
              <p className="text-xs text-slate-400">Alert channels for low stock and daily summaries.</p>
            </div>
          </div>
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto h-10 w-10 text-slate-300">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            <p className="mt-3 text-sm font-medium text-slate-600">No notification channels configured yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-slate-400">
              There is no push/email/SMS integration in this build. Low-stock and unpaid-invoice alerts
              are shown live in the bell icon at the top of the app.
            </p>
          </div>
        </section>
      </div>

      <div className={tab === "other" ? "mt-6" : "hidden"}>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
                <path d="M12 3a9 9 0 1 0 0 18V3ZM12 3a9 9 0 0 1 9 9h-9V3Z" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Theme</h2>
              <p className="text-xs text-slate-400">Appearance for this browser.</p>
            </div>
          </div>
          <div className="grid max-w-md grid-cols-3 gap-3">
            {THEMES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => chooseTheme(t.key)}
                className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition ${
                  theme === t.key
                    ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/20"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`h-5 w-5 ${theme === t.key ? "text-blue-600" : "text-slate-500"}`}>
                  <path d={t.icon} />
                </svg>
                <span className={`text-xs font-medium ${theme === t.key ? "text-blue-700" : "text-slate-700"}`}>{t.label}</span>
                <span className="text-[10px] text-slate-400">{t.hint}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div
            className={`rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg ${
              toast.type === "success" ? "bg-emerald-600" : "bg-rose-600"
            }`}
          >
            {toast.text}
          </div>
        </div>
      )}
    </div>
  );
}