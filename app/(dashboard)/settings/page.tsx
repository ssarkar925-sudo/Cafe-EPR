import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import SettingsClient from "@/components/settings/settings-client";

export const dynamic = "force-dynamic";

type QueryResult<T> = { data: T | null };
const empty = <T,>(): Promise<QueryResult<T>> => Promise.resolve({ data: null });

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; section?: string }> }) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin"])) redirect("/dashboard");

  const { tab, section } = await searchParams;
  const activeTab = tab || "general";
  const supabase = await createClient();

  // Preload all settings datasets so every module is ready on first open.
  const needsAccounts = true;
  const needsFavorites = true;
  const needsMethods = true;
  const needsBusiness = true;
  const needsCatalog = true;

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
    { data: activeTxns },
    { data: settlementRows },
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
    needsAccounts ? supabase.from("transactions").select("portal_id, instrument_id, pool_credit, pool_out, status").eq("status", "success") : empty<any[]>(),
    needsAccounts ? supabase.from("settlements").select("source_instrument_id, dest_instrument_id, amount, status").eq("status", "success") : empty<any[]>(),
  ]);

  const bankUsage: Record<string, number> = {};
  for (const t of (bankTxn ?? []) as any[]) if (t.bank_id) bankUsage[t.bank_id] = (bankUsage[t.bank_id] ?? 0) + 1;
  const portalUsage: Record<string, number> = {};
  for (const t of (portalTxn ?? []) as any[]) if (t.portal_id) portalUsage[t.portal_id] = (portalUsage[t.portal_id] ?? 0) + 1;
  const qrUsage: Record<string, number> = {};
  for (const t of (qrTxn ?? []) as any[]) if (t.merchant_qr_id) qrUsage[t.merchant_qr_id] = (qrUsage[t.merchant_qr_id] ?? 0) + 1;

  const POOL_MAP: Record<string, string> = {
    cash: "cash",
    bank: "bank",
    upi: "upi_qr",
    wallet: "wallet",
    aeps_portal: "aeps",
    dmt_portal: "dmt",
    credit_card: "credit_card",
    debit_card: "debit_card",
  };
  let pool: Record<string, { opening: number; movements: number; current: number }> = {};
  if (needsAccounts) {
    const { data: poolData } = await supabase.rpc("get_pool_balances");
    pool = (poolData ?? {}) as Record<string, { opening: number; movements: number; current: number }>;
  }

  const countPerType: Record<string, number> = {};
  for (const i of (instruments ?? []) as any[]) {
    if (i.is_active) countPerType[i.type] = (countPerType[i.type] ?? 0) + 1;
  }

  // Map portal_id -> payment_instrument_id
  const portalToInst: Record<string, string> = {};
  for (const p of (portals ?? []) as any[]) {
    if (p.payment_instrument_id) portalToInst[p.id] = p.payment_instrument_id;
  }

  const instDeltas: Record<string, number> = {};
  for (const i of (instruments ?? []) as any[]) instDeltas[i.id] = 0;

  // 1. Tagged cash entries
  for (const e of (instBal ?? []) as any[]) {
    if (!e.instrument_id) continue;
    instDeltas[e.instrument_id] = (instDeltas[e.instrument_id] ?? 0) + (e.direction === "out" ? -Number(e.amount) : Number(e.amount));
  }

  // 2. Tagged business transactions (AEPS / DMT / etc.)
  for (const t of (activeTxns ?? []) as any[]) {
    let targetInstId = t.instrument_id;
    if (!targetInstId && t.portal_id && portalToInst[t.portal_id]) {
      targetInstId = portalToInst[t.portal_id];
    }
    if (targetInstId && instDeltas[targetInstId] !== undefined) {
      const pCredit = Number(t.pool_credit) || 0;
      const pOut = Number(t.pool_out) || 0;
      instDeltas[targetInstId] = (instDeltas[targetInstId] ?? 0) + (pCredit - pOut);
    }
  }

  // 3. Tagged settlements
  for (const s of (settlementRows ?? []) as any[]) {
    if (s.source_instrument_id && instDeltas[s.source_instrument_id] !== undefined) {
      instDeltas[s.source_instrument_id] = (instDeltas[s.source_instrument_id] ?? 0) - Number(s.amount);
    }
    if (s.dest_instrument_id && instDeltas[s.dest_instrument_id] !== undefined) {
      instDeltas[s.dest_instrument_id] = (instDeltas[s.dest_instrument_id] ?? 0) + Number(s.amount);
    }
  }

  // Build full instrument balance map
  const accounts = (instruments ?? []).map((i: any) => {
    // 1. Debit card reflects linked bank account
    if (i.type === "debit_card") {
      const linkedBank = (instruments ?? []).find((b: any) => b.id === i.details?.linked_bank_instrument_id);
      let bankLiveBalance = 0;
      if (linkedBank) {
        if ((countPerType["bank"] ?? 0) <= 1) {
          const bankPool = pool["bank"];
          bankLiveBalance = bankPool ? (bankPool.current ?? bankPool.opening + bankPool.movements) : Number(linkedBank.opening_balance ?? 0);
        } else {
          bankLiveBalance = Number(linkedBank.opening_balance ?? 0) + (instDeltas[linkedBank.id] ?? 0);
        }
      }
      return {
        ...i,
        opening_balance: 0,
        balance: bankLiveBalance,
      };
    }

    const poolKey = POOL_MAP[i.type];
    const poolEntry = poolKey ? pool[poolKey] : null;

    // 2. Single-account pool
    if (poolEntry && (countPerType[i.type] ?? 0) <= 1) {
      return {
        ...i,
        opening_balance: poolEntry.opening,
        balance: poolEntry.current ?? poolEntry.opening + poolEntry.movements,
      };
    }

    // 3. Multi-account pool: individual opening + tagged movements
    return {
      ...i,
      balance: Number(i.opening_balance ?? 0) + (instDeltas[i.id] ?? 0),
    };
  });

  const categoryCounts: Record<string, number> = {};
  for (const x of [...(products ?? []), ...(catalogServices ?? [])] as any[]) {
    if (x.category_id) categoryCounts[x.category_id] = (categoryCounts[x.category_id] ?? 0) + 1;
  }

  return (
    <SettingsClient
      initial={(settings ?? null) as any}
      initialInstruments={accounts as any}
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
      initialTab={activeTab}
      initialSection={section}
    />
  );
}
