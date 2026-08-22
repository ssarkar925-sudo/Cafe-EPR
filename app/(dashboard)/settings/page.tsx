import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import SettingsClient from "@/components/settings/settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; section?: string }>;
}) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin"])) redirect("/dashboard");

  const { tab, section } = await searchParams;

  const supabase = await createClient();
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
    supabase.from("payment_instruments").select("*").order("type").order("name"),
    supabase
      .from("services")
      .select("id, name, sale_price, is_quick_favorite, quick_sort")
      .eq("is_active", true)
      .order("is_quick_favorite", { ascending: false })
      .order("quick_sort")
      .order("name"),
    supabase.from("payment_methods").select("*").order("sort_order").order("label"),
    supabase.from("aeps_banks").select("*").order("name"),
    supabase.from("transactions").select("bank_id").eq("service_type", "aeps"),
    supabase.from("aeps_portals").select("*").order("name"),
    supabase.from("transactions").select("portal_id").eq("service_type", "aeps"),
    supabase.from("upi_merchant_qrs").select("*").order("display_name"),
    supabase.from("transactions").select("merchant_qr_id").eq("service_type", "upi"),
    supabase
      .from("cash_entries")
      .select("instrument_id, direction, amount")
      .not("instrument_id", "is", null),
    supabase
      .from("products")
      .select("*, categories(name)")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("services")
      .select("*, categories(name)")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("categories").select("*").order("name"),
    supabase.from("recharge_providers").select("*").order("sort_order").order("name"),
    supabase.from("recharge_commission_slabs").select("*"),
  ]);

  const bankUsage: Record<string, number> = {};
  for (const t of (bankTxn ?? []) as { bank_id: string | null }[]) {
    if (t.bank_id) bankUsage[t.bank_id] = (bankUsage[t.bank_id] ?? 0) + 1;
  }
  const portalUsage: Record<string, number> = {};
  for (const t of (portalTxn ?? []) as { portal_id: string | null }[]) {
    if (t.portal_id) portalUsage[t.portal_id] = (portalUsage[t.portal_id] ?? 0) + 1;
  }
  const qrUsage: Record<string, number> = {};
  for (const t of (qrTxn ?? []) as { merchant_qr_id: string | null }[]) {
    if (t.merchant_qr_id) qrUsage[t.merchant_qr_id] = (qrUsage[t.merchant_qr_id] ?? 0) + 1;
  }

  const POOL_MAP: Record<string, string> = {
    cash: "cash", bank: "bank", debit_card: "bank",
    credit_card: "credit_card", upi: "upi_qr", wallet: "wallet",
  };

  // Current account balance = pool-aware balance (includes opening_balances seeds + day-close + settlements + all movements)
  const { data: poolData } = await supabase.rpc("get_pool_balances");
  const pool = (poolData ?? {}) as Record<string, { opening: number; movements: number; current: number }>;

  const countPerPool: Record<string, number> = {};
  for (const i of (instruments ?? []) as any[]) {
    const p = POOL_MAP[i.type] ?? i.type;
    countPerPool[p] = (countPerPool[p] ?? 0) + 1;
  }

  const balMap: Record<string, number> = {};
  for (const e of (instBal ?? []) as { instrument_id: string | null; direction: string; amount: number | string }[]) {
    if (!e.instrument_id) continue;
    const delta = e.direction === "out" ? -Number(e.amount) : Number(e.amount);
    balMap[e.instrument_id] = (balMap[e.instrument_id] ?? 0) + delta;
  }

  const accounts = (instruments ?? []).map((i: any) => {
    const poolKey = POOL_MAP[i.type] ?? i.type;
    const poolEntry = pool[poolKey];
    if (poolEntry && countPerPool[poolKey] === 1) {
      return { ...i, balance: poolEntry.current ?? (poolEntry.opening + poolEntry.movements) };
    }
    return { ...i, balance: Number(i.opening_balance ?? 0) + (balMap[i.id] ?? 0) };
  });

  const categoryCounts: Record<string, number> = {};
  for (const p of (products ?? []) as { category_id: string | null }[]) {
    if (p.category_id) categoryCounts[p.category_id] = (categoryCounts[p.category_id] ?? 0) + 1;
  }
  for (const s of (catalogServices ?? []) as { category_id: string | null }[]) {
    if (s.category_id) categoryCounts[s.category_id] = (categoryCounts[s.category_id] ?? 0) + 1;
  }

  return (
    <SettingsClient
      initial={(settings ?? null) as any}
      initialInstruments={(accounts ?? []) as any}
      initialServices={(services ?? []) as any}
      initialPaymentMethods={(paymentMethods ?? []) as any}
      initialBanks={{ rows: (banks ?? []) as any, usage: bankUsage }}
      initialPortals={{ rows: (portals ?? []) as any, usage: portalUsage }}
      initialMerchantQrs={{ rows: (qrs ?? []) as any, usage: qrUsage }}
      initialRechargeProviders={(rechargeProviders ?? []) as any}
      initialRechargeSlabs={(rechargeSlabs ?? []) as any}
      initialProducts={(products ?? []) as any}
      initialCatalogServices={(catalogServices ?? []) as any}
      initialCategories={(categories ?? []) as any}
      categoryCounts={categoryCounts}
      initialTab={tab}
      initialSection={section}
    />
  );
}