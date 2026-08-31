"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
const BUSINESS_SECTIONS = ["banks", "portals", "merchant-qrs", "recharge", "recharge-slabs", "recharge-providers", "bill-payment", "bill-commission"] as const;

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
  useRealtime([
    "payment_instruments",
    "cash_entries",
    "opening_balances",
    "transactions",
    "expenses",
    "settlements",
    "recharge_providers",
    "recharge_commission_slabs",
    "bill_payment_commission_config",
  ]);

  const supabase = createClient();
  const router = useRouter();
  const { showToast, toastView } = useToast();

  const [tab, setTab] = useState<string>(initialTab && TABS.some((t) => t.key === initialTab) ? initialTab : "general");

  useEffect(() => {
    if (initialTab && TABS.some((t) => t.key === initialTab)) {
      setTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (initialSection) {
      if (initialSection === "recharge-slabs" || initialSection === "recharge-providers" || initialSection === "recharge") {
        setBizSection("recharge");
      } else if (initialSection === "bill-payment" || initialSection === "bill-commission") {
        setBizSection("bill-payment");
      } else if (["banks", "portals", "merchant-qrs"].includes(initialSection)) {
        setBizSection(initialSection);
      }
      if ((CATALOG_SECTIONS as readonly string[]).includes(initialSection)) {
        setCatalogSection(initialSection);
      }
    }
  }, [initialSection]);

  const [searchQuery, setSearchQuery] = useState("");
  const [bizSection, setBizSection] = useState<string>(() => {
    if (!initialSection) return "banks";
    if (initialSection === "recharge-slabs" || initialSection === "recharge-providers" || initialSection === "recharge") {
      return "recharge";
    }
    if (initialSection === "bill-payment" || initialSection === "bill-commission") {
      return "bill-payment";
    }
    if (["banks", "portals", "merchant-qrs"].includes(initialSection)) {
      return initialSection;
    }
    return "banks";
  });
  const [catalogSection, setCatalogSection] = useState<string>(
    initialSection && (CATALOG_SECTIONS as readonly string[]).includes(initialSection) ? initialSection : "products"
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
  const [taxRate, setTaxRate] = useState(initial && initial.tax_rate != null ? String(Number(initial.tax_rate)) : "0");
  const [upiId, setUpiId] = useState(initialUpiId);
  const [saving, setSaving] = useState(false);

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
  const activeMeta = tabMeta[tab] ?? { title: "Settings", desc: "", group: "Control Center" };

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

  function switchTab(key: string, sectionKey?: string) {
    setTab(key);
    if (sectionKey) {
      if (key === "business-setup") {
        setBizSection(sectionKey);
      } else if (key === "catalog") {
        setCatalogSection(sectionKey);
      }
    }
    const url = new URL(window.location.href);
    url.searchParams.set("tab", key);
    if (key === "business-setup") {
      url.searchParams.set("section", sectionKey || bizSection);
    } else if (key === "catalog") {
      url.searchParams.set("section", sectionKey || catalogSection);
    } else {
      url.searchParams.delete("section");
    }
    window.history.replaceState(null, "", url.toString());
  }

  function switchBiz(section: string) {
    const normalized =
      section === "recharge-slabs" || section === "recharge-providers"
        ? "recharge"
        : section === "bill-commission"
        ? "bill-payment"
        : section;
    if (!["banks", "portals", "merchant-qrs", "recharge", "bill-payment"].includes(normalized)) return;
    setBizSection(normalized);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "business-setup");
    url.searchParams.set("section", normalized);
    window.history.replaceState(null, "", url.toString());
  }

  function switchCatalog(section: string) {
    setCatalogSection(section);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "catalog");
    url.searchParams.set("section", section);
    window.history.replaceState(null, "", url.toString());
  }

  async function save(e?: React.FormEvent) {
    if (e) e.preventDefault();
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
    logAudit({
      action: "settings",
      entity: "settings",
      entity_id: "1",
      description: "Shop settings updated",
    });
    router.refresh();
  }

  function resetForm() {
    setShopName(savedValues.shopName);
    setPhone(savedValues.phone);
    setAddress(savedValues.address);
    setFooter(savedValues.footer);
    setCurrency(savedValues.currency);
    setLogoUrl(savedValues.logoUrl);
    setGstin(savedValues.gstin);
    setTaxRate(savedValues.taxRate);
    setUpiId(savedValues.upiId);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8 space-y-6">
      {/* 1. Executive Top Header */}
      <div className="rounded-3xl border border-slate-200/90 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/90">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 ring-4 ring-blue-50 dark:ring-blue-950/50">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 4.3l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.2.6.77 1 1.51 1H21a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15Z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                  Settings &amp; System Control Center
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Operational Hub
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
                Configure business profile, payment accounts, BBPS commissions, team permissions, and financial automation.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/ai/self-audit"
              className="inline-flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-3.5 py-2 text-xs font-bold text-purple-700 shadow-sm transition hover:bg-purple-100 dark:border-purple-500/30 dark:bg-purple-950/40 dark:text-purple-300"
            >
              <span>🔮</span>
              <span>Financial Self-Audit</span>
            </Link>
            <Link
              href="/pos"
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-700 shadow-sm transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              <span>⚡</span>
              <span>POS Billing</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 2. Main Master-Detail Settings Workspace */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Category Navigator */}
        <div className="space-y-4 lg:col-span-4 xl:col-span-3">
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
              placeholder="Search setting modules… (/)"
              className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-8 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900 dark:text-white"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          {/* Grouped Navigation */}
          <div className="space-y-6">
            {filteredGroups.map((g) => (
              <div key={g.id} className="space-y-1.5">
                <div className="px-3 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {g.label}
                </div>
                <div className="space-y-1">
                  {g.items.map((it) => {
                    const isSelected =
                      tab === it.key && (!it.section || (it.key === "business-setup" && bizSection === it.section) || (it.key === "catalog" && catalogSection === it.section));

                    if (it.directHref) {
                      return (
                        <Link
                          key={it.key + (it.section || "")}
                          href={it.directHref}
                          className="group flex w-full items-center justify-between rounded-2xl border border-slate-200/70 bg-white/70 p-3 text-left transition hover:border-slate-300 hover:bg-white hover:shadow-sm dark:border-white/5 dark:bg-slate-900/60 dark:hover:bg-white/5"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition ${it.accent || "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"}`}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                                <path d={it.icon} />
                              </svg>
                            </div>
                            <div className="min-w-0">
                              <span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                                {it.label}
                              </span>
                              <span className="block truncate text-[10px] text-slate-400 dark:text-slate-500">
                                {it.desc}
                              </span>
                            </div>
                          </div>
                          <span className="shrink-0 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 text-xs font-bold pl-2">
                            ↗
                          </span>
                        </Link>
                      );
                    }

                    return (
                      <button
                        key={it.key + (it.section || "")}
                        onClick={() => switchTab(it.key, it.section)}
                        className={`group flex w-full items-start gap-3 rounded-2xl p-3 text-left transition ${
                          isSelected
                            ? "bg-blue-600 text-white shadow-md shadow-blue-600/25 ring-2 ring-blue-600"
                            : "border border-slate-200/70 bg-white/70 text-slate-800 hover:border-slate-300 hover:bg-white hover:shadow-sm dark:border-white/5 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-white/5"
                        }`}
                      >
                        <div
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition ${
                            isSelected
                              ? "bg-white/20 text-white"
                              : it.accent || "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"
                          }`}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="h-4 w-4"
                          >
                            <path d={it.icon} />
                          </svg>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-bold truncate ${isSelected ? "text-white" : "text-slate-900 dark:text-white"}`}>
                              {it.label}
                            </span>
                            {it.badge && (
                              <span
                                className={`ml-1.5 rounded-full px-2 py-0.5 text-[9px] font-extrabold ${
                                  isSelected
                                    ? "bg-white/20 text-white"
                                    : it.badgeColor || "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"
                                }`}
                              >
                                {it.badge}
                              </span>
                            )}
                          </div>
                          <p className={`mt-0.5 truncate text-[10px] ${isSelected ? "text-blue-100" : "text-slate-400 dark:text-slate-500"}`}>
                            {it.desc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Detail Workspace */}
        <div className="min-w-0 lg:col-span-8 xl:col-span-9 space-y-6">
          {/* Active Header Banner */}
          <div className="flex items-center justify-between rounded-3xl border border-slate-200/90 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/90">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                {activeMeta.group}
              </span>
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                {activeMeta.title}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {activeMeta.desc}
              </p>
            </div>

            {isFormTab && dirty && (
              <div className="flex items-center gap-2">
                <button
                  onClick={resetForm}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
                >
                  Discard
                </button>
                <button
                  onClick={() => save()}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-bold text-white shadow-md shadow-blue-500/25 hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            )}
          </div>

          {/* Form Tab (General, Receipt, Tax) */}
          <form onSubmit={save} className={isFormTab ? "" : "hidden"}>
            <ShopPanel
              tab={tab}
              form={{
                shopName,
                setShopName,
                phone,
                setPhone,
                address,
                setAddress,
                footer,
                setFooter,
                currency,
                setCurrency,
                gstin,
                setGstin,
                taxRate,
                setTaxRate,
                logoUrl,
                setLogoUrl,
                upiId,
                setUpiId,
              }}
            />
            <button type="submit" id="save-settings" className="hidden" />
          </form>

          {/* Sub-Panels */}
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

      {/* 3. Sticky Floating Save Bar (When dirty) */}
      {isFormTab && dirty && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 rounded-2xl border border-slate-300 bg-slate-900/95 px-5 py-3 shadow-2xl backdrop-blur-xl text-white dark:border-white/20">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs font-bold">Unsaved configuration changes detected</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetForm}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"
            >
              Reset
            </button>
            <button
              onClick={() => save()}
              disabled={saving}
              className="rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-bold text-white shadow-md shadow-blue-500/50 hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      )}

      {toastView}
    </div>
  );
}
