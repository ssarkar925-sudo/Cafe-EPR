"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/lib/supabase/realtime";
import { logAudit } from "@/lib/audit";
import { useToast } from "@/components/ui/use-toast";
import SecurityPanel from "@/components/settings/security-panel";
import ShopPanel from "@/components/settings/shop-panel";
import PaymentAccountsPanel from "@/components/settings/payment-accounts-panel";
import PaymentMethodsPanel from "@/components/settings/payment-methods-panel";
import QuickFavoritesPanel from "@/components/settings/quick-favorites-panel";
import CatalogPanel from "@/components/settings/catalog-panel";
import InventoryPanel from "@/components/settings/inventory-panel";
import BusinessSetupPanel from "@/components/settings/business-setup-panel";
import BackupPanel from "@/components/settings/backup-panel";
import NotificationsPanel from "@/components/settings/notifications-panel";
import AppearancePanel from "@/components/settings/appearance-panel";
import {
  type SettingsRow,
  type InstrumentRow,
  type ServiceFavRow,
  type PaymentMethodRow,
  type MasterData,
  SETTINGS_GROUPS,
  TABS,
  tabMeta,
} from "@/components/settings/settings-config";

const CATALOG_SECTIONS = ["products", "services", "categories"] as const;

export default function SettingsClient({
  initial,
  initialInstruments,
  initialServices = [],
  initialPaymentMethods = [],
  initialBanks,
  initialPortals,
  initialMerchantQrs,
  initialRechargeProviders,
  initialRechargeSlabs,
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
  initialRechargeProviders?: any[];
  initialRechargeSlabs?: any[];
  initialProducts?: any[];
  initialCatalogServices?: any[];
  initialCategories?: any[];
  categoryCounts?: Record<string, number>;
  initialTab?: string;
  initialSection?: string;
}) {
  useRealtime(["payment_instruments", "cash_entries", "opening_balances", "transactions", "expenses", "settlements"]);
  const supabase = createClient();
  const router = useRouter();
  const { showToast, toastView } = useToast();

  const [tab, setTab] = useState<string>(
    initialTab && TABS.some((t) => t.key === initialTab) ? initialTab : "general"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [bizSection, setBizSection] = useState<string>(
    initialSection === "portals" || initialSection === "merchant-qrs" ? initialSection : "banks"
  );
  const [catalogSection, setCatalogSection] = useState<string>(
    initialSection && (CATALOG_SECTIONS as readonly string[]).includes(initialSection)
      ? initialSection
      : "products"
  );

  const initialUpiId = (() => {
    try {
      return (initial as any)?.upi_id || (typeof window !== "undefined" ? localStorage.getItem("sccomm-shop-upi-id") : null) || "";
    } catch {
      return (initial as any)?.upi_id || "";
    }
  })();

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
  const [upiId, setUpiId] = useState(initialUpiId);
  const [saving, setSaving] = useState(false);

  // Maintain saved snapshot to accurately clear dirty state on save
  const [savedValues, setSavedValues] = useState(() => ({
    shopName: (initial?.shop_name ?? "Cafe ERP").trim(),
    phone: (initial?.phone ?? "").trim(),
    address: (initial?.address ?? "").trim(),
    footer: (initial?.receipt_footer ?? "").trim(),
    currency: (initial?.currency_symbol ?? "₹").trim(),
    logoUrl: initial?.logo_url ?? null,
    gstin: (initial?.gstin ?? "").trim(),
    taxRate: initial && initial.tax_rate != null ? String(Number(initial.tax_rate)) : "0",
    upiId: initialUpiId.trim(),
  }));

  const dirty = useMemo(
    () =>
      shopName.trim() !== savedValues.shopName ||
      phone.trim() !== savedValues.phone ||
      address.trim() !== savedValues.address ||
      footer.trim() !== savedValues.footer ||
      currency.trim() !== savedValues.currency ||
      logoUrl !== savedValues.logoUrl ||
      gstin.trim() !== savedValues.gstin ||
      taxRate.trim() !== savedValues.taxRate ||
      upiId.trim() !== savedValues.upiId,
    [savedValues, shopName, phone, address, footer, currency, logoUrl, gstin, taxRate, upiId]
  );

  const isFormTab = tab === "general" || tab === "receipt" || tab === "tax";
  const activeMeta = tabMeta[tab] ?? { title: "Settings", desc: "", group: "" };

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return SETTINGS_GROUPS;
    return SETTINGS_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter(
        (it) =>
          it.label.toLowerCase().includes(q) ||
          it.desc.toLowerCase().includes(q) ||
          g.label.toLowerCase().includes(q)
      ),
    })).filter((g) => g.items.length > 0);
  }, [searchQuery]);

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

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      localStorage.setItem("sccomm-shop-upi-id", upiId.trim());
    } catch {}

    const payload: any = {
      id: 1,
      shop_name: shopName.trim() || "Cafe ERP",
      phone,
      address,
      receipt_footer: footer,
      currency_symbol: currency,
      logo_url: logoUrl,
      gstin: gstin.trim() || null,
      tax_rate: Number(taxRate) || 0,
      upi_id: upiId.trim() || null,
    };

    let { error } = await supabase.from("settings").upsert(payload).single();
    if (error && error.message?.includes("upi_id")) {
      delete payload.upi_id;
      const res = await supabase.from("settings").upsert(payload).single();
      error = res.error;
    }
    setSaving(false);
    if (error) {
      showToast("error", error.message);
      return;
    }

    // Update saved snapshot to clear dirty state immediately
    setSavedValues({
      shopName: (shopName.trim() || "Cafe ERP").trim(),
      phone: phone.trim(),
      address: address.trim(),
      footer: footer.trim(),
      currency: currency.trim(),
      logoUrl,
      gstin: gstin.trim(),
      taxRate: String(Number(taxRate) || 0),
      upiId: upiId.trim(),
    });

    showToast("success", "Settings saved successfully.");
    logAudit({ action: "settings", entity: "settings", entity_id: "1", description: "Shop settings updated" });
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      {/* Header Banner */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between dark:border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/20">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              System Administration
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Configure system rules, payment instruments, business portals, and automations.
          </p>
        </div>

        {/* Global Save Button */}
        {isFormTab && (
          <div className="flex items-center gap-3">
            {dirty && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-600 animate-pulse" />
                Unsaved changes
              </span>
            )}
            <button
              onClick={() => (document.getElementById("save-settings") as HTMLButtonElement)?.click()}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <>
                  <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Saving…
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        )}
      </div>

      {/* Main 2-Column Responsive Workspace */}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Navigation Sidebar (Col 4) */}
        <div className="space-y-6 lg:col-span-4 xl:col-span-3">
          {/* Quick Search */}
          <div className="relative">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search settings…"
              className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900 dark:text-white"
            />
          </div>

          {/* Grouped Navigation */}
          <div className="space-y-5">
            {filteredGroups.map((g) => (
              <div key={g.id} className="space-y-1">
                <div className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {g.label}
                </div>
                <div className="space-y-1">
                  {g.items.map((it) => {
                    const isSelected = tab === it.key;
                    return (
                      <button
                        key={it.key}
                        onClick={() => switchTab(it.key)}
                        className={`group flex w-full items-start gap-3 rounded-2xl p-3 text-left transition ${
                          isSelected
                            ? "bg-blue-50 text-blue-900 shadow-sm ring-1 ring-blue-200/80 dark:bg-blue-950/40 dark:text-blue-100 dark:ring-blue-800/40"
                            : "bg-white/50 text-slate-700 hover:bg-white hover:text-slate-900 hover:shadow-sm dark:bg-transparent dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white"
                        }`}
                      >
                        <div
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition ${
                            isSelected
                              ? "bg-blue-600 text-white shadow-sm"
                              : "bg-slate-100 text-slate-500 group-hover:bg-slate-200 dark:bg-white/5 dark:text-slate-400 dark:group-hover:bg-white/10"
                          }`}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                            <path d={it.icon} />
                          </svg>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className={`text-sm font-bold truncate ${isSelected ? "text-blue-900 dark:text-white" : "text-slate-800 dark:text-slate-200"}`}>
                              {it.label}
                            </span>
                            {it.badge && (
                              <span className={`ml-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${it.badgeColor || "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"}`}>
                                {it.badge}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">
                            {it.desc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {filteredGroups.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400 dark:border-white/10">
                No matching settings found for "{searchQuery}".
              </div>
            )}
          </div>
        </div>

        {/* Right Stage Content Panel (Col 8 / 9) */}
        <div className="min-w-0 lg:col-span-8 xl:col-span-9">
          {/* Breadcrumb & Section Card Header */}
          <div className="mb-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                {activeMeta.group}
              </span>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {activeMeta.title}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {activeMeta.desc}
              </p>
            </div>
            {isFormTab && dirty && (
              <span className="hidden rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200 sm:inline-flex dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-900/40">
                ● Unsaved Changes
              </span>
            )}
          </div>

          {/* Form Settings Panels */}
          <form onSubmit={save} className={isFormTab ? "" : "hidden"}>
            <ShopPanel
              tab={tab}
              form={{
                shopName, setShopName,
                phone, setPhone,
                address, setAddress,
                footer, setFooter,
                currency, setCurrency,
                gstin, setGstin,
                taxRate, setTaxRate,
                logoUrl, setLogoUrl,
                upiId, setUpiId,
              }}
            />
            <button type="submit" id="save-settings" className="hidden" />
          </form>

          {/* Tab Content Panels */}
          <PaymentAccountsPanel initialInstruments={initialInstruments} active={tab === "payment-accounts"} />
          <PaymentMethodsPanel initialPaymentMethods={initialPaymentMethods} active={tab === "payment-methods"} />
          <QuickFavoritesPanel initialServices={initialServices} active={tab === "quick-favorites"} />

          <CatalogPanel
            active={tab === "catalog"}
            section={catalogSection}
            onSection={switchCatalog}
            initialProducts={initialProducts}
            initialCatalogServices={initialCatalogServices}
            initialCategories={initialCategories}
            categoryCounts={categoryCounts}
          />

          <InventoryPanel active={tab === "inventory"} />

          <BusinessSetupPanel
            active={tab === "business-setup"}
            section={bizSection}
            onSection={switchBiz}
            initialBanks={initialBanks}
            initialPortals={initialPortals}
            initialMerchantQrs={initialMerchantQrs}
            initialRechargeProviders={initialRechargeProviders}
            initialRechargeSlabs={initialRechargeSlabs}
          />

          <BackupPanel active={tab === "backup"} />
          <NotificationsPanel active={tab === "notifications"} />
          <AppearancePanel active={tab === "other"} />

          <div className={tab === "security" ? "" : "hidden"}>
            <SecurityPanel />
          </div>
        </div>
      </div>

      {toastView}
    </div>
  );
}