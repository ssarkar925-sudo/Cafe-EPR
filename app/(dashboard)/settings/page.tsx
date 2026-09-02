import { redirect } from "next/navigation";
import { getUserRole, hasRole } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import SystemSettingsClient from "@/components/settings/system-settings-client";

export const dynamic = "force-dynamic";

async function safeQuery<T>(fn: () => PromiseLike<{ data: T | null }>, fallback: T): Promise<T> {
  try {
    const res = await fn();
    return res.data ?? fallback;
  } catch {
    return fallback;
  }
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; section?: string }>;
}) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin"])) redirect("/dashboard");

  const resolvedSearchParams = await searchParams;
  const initialTab = resolvedSearchParams?.tab;
  const initialSection = resolvedSearchParams?.section;

  const supabase = await createClient();

  const [
    initial,
    initialInstruments,
    initialServices,
    initialPaymentMethods,
    initialBanks,
    initialPortals,
    initialMerchantQrs,
    initialRechargeProviders,
    initialRechargeSlabs,
    initialProducts,
    initialCatalogServices,
    initialCategories,
  ] = await Promise.all([
    safeQuery(async () => supabase.from("settings").select("*").limit(1).maybeSingle(), null),
    safeQuery(async () => supabase.from("payment_instruments").select("*").order("name"), []),
    safeQuery(async () => supabase.from("service_favorites").select("*"), []),
    safeQuery(async () => supabase.from("payment_methods").select("*").order("sort_order"), []),
    safeQuery(async () => supabase.from("master_banks").select("*"), []),
    safeQuery(async () => supabase.from("master_portals").select("*"), []),
    safeQuery(async () => supabase.from("master_merchant_qrs").select("*"), []),
    safeQuery(async () => supabase.from("recharge_providers").select("*"), []),
    safeQuery(async () => supabase.from("recharge_commission_slabs").select("*"), []),
    safeQuery(async () => supabase.from("products").select("id, name, sku, category_id, is_active").limit(200), []),
    safeQuery(async () => supabase.from("services").select("id, name, code, category_id, is_active").limit(200), []),
    safeQuery(async () => supabase.from("categories").select("*"), []),
  ]);

  return (
    <SystemSettingsClient
      initial={initial as any}
      initialInstruments={(initialInstruments ?? []) as any}
      initialServices={(initialServices ?? []) as any}
      initialPaymentMethods={(initialPaymentMethods ?? []) as any}
      initialBanks={{ rows: (initialBanks as any[]) ?? [], usage: {} }}
      initialPortals={{ rows: (initialPortals as any[]) ?? [], usage: {} }}
      initialMerchantQrs={{ rows: (initialMerchantQrs as any[]) ?? [], usage: {} }}
      initialRechargeProviders={(initialRechargeProviders ?? []) as any[]}
      initialRechargeSlabs={(initialRechargeSlabs ?? []) as any[]}
      initialProducts={(initialProducts ?? []) as any[]}
      initialCatalogServices={(initialCatalogServices ?? []) as any[]}
      initialCategories={(initialCategories ?? []) as any[]}
      initialTab={initialTab}
      initialSection={initialSection}
    />
  );
}
