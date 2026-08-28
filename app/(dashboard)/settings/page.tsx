import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import SettingsCommandShell from "@/components/settings/settings-command-shell";
import SettingsHub from "@/components/settings/settings-hub";

export const dynamic = "force-dynamic";

type QueryResult<T> = { data: T | null };

const empty = <T,>(): Promise<QueryResult<T>> => Promise.resolve({ data: null });

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; section?: string }> }) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin"])) redirect("/dashboard");

  const { tab, section } = await searchParams;
  const supabase = await createClient();

  // The command center can open many modules, but each module only needs a small
  // subset of the settings data. Avoid fetching every catalog/provider/transaction
  // table on every navigation; this keeps the settings workspace responsive.
  const needsAccounts = tab === "payment-accounts";
  const needsFavorites = tab === "quick-favorites";
  const needsMethods = tab === "payment-methods";
  const needsBusiness = tab === "business-setup";
  const needsCatalog = tab === "catalog";

  const [
    { data: settings },
    { data: instruments },
    { data: services },
    { data: paymentMethods },
    { data: banks },
    { data: bankTxn },
    { data: portals },
    { data: portalTxn },
    { data: qrs },
    { data: qrTxn },
    { data: instBal },
    { data: products },
    { data: catalogServices },
    { data: categories },
    { data: rechargeProviders },
    { data: rechargeSlabs },
  ] = await Promise.all([
    supabase.from("settings").select("*").single(),
    needsAccounts ? supabase.from("payment_instruments").select("*").order("type").order("name") : empty<any[]>(),
    needsFavorites ? supabase.from("services").select("id, name, sale_price, is_quick_favorite, quick_sort").eq("is_active", true).order("is_quick_favorite", { ascending: false }).order("quick_sort").order("name") : empty<any[]>(),
    needsMethods ? supabase.from("payment_methods").select("*").order("sort_order").order("label") : empty<any[]>(),
    needsBusiness ? supabase.from("aeps_banks").select("*").order("name") : empty<any[]>(),
    needsBusiness ? supabase.from("transactions").select("bank_id").eq("service_type", "aeps") : empty<any[]>(),
    needsBusiness ? supabase.from("aeps_portals").select("*").order("name") : empty<any[]>(),
    needsBusiness ? supabase.from("transactions").select("portal_id").eq("service_type", "aeps") : empty<any[]>(),
    needsBusiness ? supabase.from("upi_merchant_qrs").select("*").order("display_name") : empty<any[]>(),
    needsBusiness ? supabase.from("transactions").select("merchant_qr_id").eq("service_type", "upi") : empty<any[]>(),
    needsAccounts ? supabase.from("cash_entries").select("instrument_id, direction, amount").not("instrument_id", "is", null) : empty<any[]>(),
    needsCatalog ? supabase.from("products").select("*, categories(name)").order("created_at", { ascending: false }).limit(500) : empty<any[]>(),
    needsCatalog ? supabase.from("services").select("*, categories(name)").order("created_at", { ascending: false }).limit(500) : empty<any[]>(),
    needsCatalog ? supabase.from("categories").select("*").order("name") : empty<any[]>(),
    needsBusiness ? supabase.from("recharge_providers").select("*").order("sort_order").order("name") : empty<any[]>(),
    needsBusiness ? supabase.from("recharge_commission_slabs").select("*") : empty<any[]>(),
  ]);

  const bankUsage: Record<string, number> = {};
  for (const t of (bankTxn ?? []) as any[]) if (t.bank_id) bankUsage[t.bank_id] = (bankUsage[t.bank_id] ?? 0) + 1;
  const portalUsage: Record<string, number> = {};
  for (const t of (portalTxn ?? []) as any[]) if (t.portal_id) portalUsage[t.portal_id] = (portalUsage[t.portal_id] ?? 0) + 1;
  const qrUsage: Record<string, number> = {};
  for (const t of (qrTxn ?? []) as any[]) if (t.merchant_qr_id) qrUsage[t.merchant_qr_id] = (qrUsage[t.merchant_qr_id] ?? 0) + 1;

  const POOL_MAP: Record<string, string> = { cash: "cash", bank: "bank", debit_card: "bank", credit_card: "credit_card", upi: "upi_qr", wallet: "wallet" };
  let pool: Record<string, { opening: number; movements: number; current: number }> = {};
  if (needsAccounts) {
    const { data: poolData } = await supabase.rpc("get_pool_balances");
    pool = (poolData ?? {}) as Record<string, { opening: number; movements: number; current: number }>;
  }

  const countPerPool: Record<string, number> = {};
  for (const i of (instruments ?? []) as any[]) {
    const p = POOL_MAP[i.type] ?? i.type;
    countPerPool[p] = (countPerPool[p] ?? 0) + 1;
  }
  const balMap: Record<string, number> = {};
  for (const e of (instBal ?? []) as any[]) {
    if (!e.instrument_id) continue;
    balMap[e.instrument_id] = (balMap[e.instrument_id] ?? 0) + (e.direction === "out" ? -Number(e.amount) : Number(e.amount));
  }
  const accounts = (instruments ?? []).map((i: any) => {
    const p = POOL_MAP[i.type] ?? i.type;
    const entry = pool[p];
    return entry && countPerPool[p] === 1
      ? { ...i, balance: entry.current ?? entry.opening + entry.movements }
      : { ...i, balance: Number(i.opening_balance ?? 0) + (balMap[i.id] ?? 0) };
  });

  const categoryCounts: Record<string, number> = {};
  for (const x of [...(products ?? []), ...(catalogServices ?? [])] as any[]) {
    if (x.category_id) categoryCounts[x.category_id] = (categoryCounts[x.category_id] ?? 0) + 1;
  }

  const props = {
    initial: (settings ?? null) as any,
    initialInstruments: accounts as any,
    initialServices: (services ?? []) as any,
    initialPaymentMethods: (paymentMethods ?? []) as any,
    initialBanks: { rows: (banks ?? []) as any, usage: bankUsage },
    initialPortals: { rows: (portals ?? []) as any, usage: portalUsage },
    initialMerchantQrs: { rows: (qrs ?? []) as any, usage: qrUsage },
    initialRechargeProviders: (rechargeProviders ?? []) as any,
    initialRechargeSlabs: (rechargeSlabs ?? []) as any,
    initialProducts: (products ?? []) as any,
    initialCatalogServices: (catalogServices ?? []) as any,
    initialCategories: (categories ?? []) as any,
    categoryCounts,
    initialTab: tab,
    initialSection: section,
  };

  if (!tab) return <SettingsHub shopName={settings?.shop_name || "Sarkar Communication"} />;
  return <SettingsCommandShell {...props} />;
}
