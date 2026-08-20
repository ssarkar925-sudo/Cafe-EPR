"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { useToast } from "@/components/ui/use-toast";
import SecurityPanel from "@/components/settings/security-panel";
import ShopPanel from "@/components/settings/shop-panel";
import PaymentAccountsPanel from "@/components/settings/payment-accounts-panel";
import PaymentMethodsPanel from "@/components/settings/payment-methods-panel";
import QuickFavoritesPanel from "@/components/settings/quick-favorites-panel";
import CatalogPanel from "@/components/settings/catalog-panel";
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
  const supabase = createClient();
  const { showToast, toastView } = useToast();

  const [tab, setTab] = useState<string>(
    initialTab && TABS.some((t) => t.key === initialTab) ? initialTab : "general"
  );
  const [bizSection, setBizSection] = useState<string>(
    initialSection === "portals" || initialSection === "merchant-qrs" ? initialSection : "banks"
  );
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

  const isFormTab = tab === "general" || tab === "receipt" || tab === "tax";

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
      showToast("error", error.message);
      return;
    }
    showToast("success", "Settings saved.");
    logAudit({ action: "settings", entity: "settings", entity_id: "1", description: "Shop settings updated" });
  }

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
          }}
        />
        <button type="submit" id="save-settings" className="hidden" />
      </form>

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

      <BusinessSetupPanel
        active={tab === "business-setup"}
        section={bizSection}
        onSection={switchBiz}
        initialBanks={initialBanks}
        initialPortals={initialPortals}
        initialMerchantQrs={initialMerchantQrs}
      />

      <BackupPanel active={tab === "backup"} />
      <NotificationsPanel active={tab === "notifications"} />
      <AppearancePanel active={tab === "other"} />

      <div className={tab === "security" ? "" : "hidden"}>
        <SecurityPanel />
      </div>

      {toastView}
    </div>
  );
}