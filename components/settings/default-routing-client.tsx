"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";


type Instrument = {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
};

type Route = {
  id: string;
  purpose: string;
  service_type: string | null;
  provider_key: string | null;
  customer_payment_method: string | null;
  funding_method: string | null;
  instrument_id: string;
  priority: number;
  is_system_default: boolean;
  source: string;
  notes: string | null;
};

const COLLECTION_METHODS = [
  { key: "cash", label: "Cash", allowed: ["cash"] },
  { key: "upi", label: "UPI", allowed: ["upi", "upi_qr"] },
  { key: "bank", label: "Bank", allowed: ["bank"] },
  { key: "wallet", label: "Wallet", allowed: ["wallet"] },
  { key: "card", label: "Card", allowed: ["debit_card", "credit_card"] },
] as const;

const FUNDING_SERVICES = [
  { key: "recharge", label: "Mobile Recharge", hint: "Operator / gateway funding" },
  { key: "bill_payment", label: "Utility / BBPS", hint: "Biller settlement funding" },
  { key: "google_play", label: "Google Play", hint: "Voucher / code funding" },
] as const;

const FUNDING_TYPES = ["bank", "upi", "upi_qr", "wallet", "debit_card", "credit_card", "aeps_portal", "dmt_portal"];

function labelType(type: string) {
  const labels: Record<string, string> = {
    cash: "Cash",
    bank: "Bank",
    upi: "UPI",
    upi_qr: "UPI QR",
    wallet: "Wallet",
    debit_card: "Debit Card",
    credit_card: "Credit Card",
    aeps_portal: "AEPS Float",
    dmt_portal: "DMT Float",
  };
  return labels[type] || type.replace(/_/g, " ");
}

export default function DefaultRoutingClient() {
  const supabase = createClient();
  const { showToast, toastView } = useToast();
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: insts, error: instErr }, { data: rs, error: routeErr }] = await Promise.all([
      supabase.from("payment_instruments").select("id,name,type,is_active").order("type").order("name"),
      supabase.from("payment_routing_defaults").select("*").eq("is_active", true).order("purpose").order("service_type").order("customer_payment_method"),
    ]);
    setLoading(false);
    if (instErr) {
      showToast("error", instErr.message);
      return;
    }
    if (routeErr) {
      showToast("error", routeErr.message);
      return;
    }
    setInstruments((insts || []) as Instrument[]);
    setRoutes((rs || []) as Route[]);
  }, [showToast, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const byId = useMemo(() => new Map(instruments.map((i) => [i.id, i])), [instruments]);
  const active = useMemo(() => instruments.filter((i) => i.is_active), [instruments]);

  const routeFor = useCallback(
    (purpose: string, serviceType?: string | null, method?: string | null) =>
      routes.find(
        (r) =>
          r.purpose === purpose &&
          (r.service_type || null) === (serviceType || null) &&
          (r.customer_payment_method || null) === (method || null) &&
          (r.provider_key || null) === null &&
          (r.funding_method || null) === null
      ) || null,
    [routes]
  );

  const setDefault = useCallback(
    async ({ purpose, serviceType = null, method = null, instrumentId }: { purpose: string; serviceType?: string | null; method?: string | null; instrumentId: string }) => {
      const key = `${purpose}:${serviceType || ""}:${method || ""}`;
      setBusyKey(key);
      const { error } = await supabase.rpc("set_payment_routing_default", {
        p_purpose: purpose,
        p_instrument_id: instrumentId,
        p_service_type: serviceType,
        p_provider_key: null,
        p_customer_payment_method: method,
        p_funding_method: null,
        p_user_id: null,
        p_priority: 100,
        p_notes: "Managed from Defaults & Routing control center",
      });
      setBusyKey(null);
      if (error) {
        showToast("error", error.message);
        return;
      }
      showToast("success", "Default route updated.");
      await load();
    },
    [load, showToast, supabase]
  );

  const clearDefault = useCallback(
    async ({ purpose, serviceType = null, method = null }: { purpose: string; serviceType?: string | null; method?: string | null }) => {
      const key = `${purpose}:${serviceType || ""}:${method || ""}`;
      setBusyKey(key);
      const { error } = await supabase.rpc("clear_payment_routing_default", {
        p_purpose: purpose,
        p_service_type: serviceType,
        p_provider_key: null,
        p_customer_payment_method: method,
        p_funding_method: null,
        p_user_id: null,
      });
      setBusyKey(null);
      if (error) {
        showToast("error", error.message);
        return;
      }
      showToast("success", "Default route cleared.");
      await load();
    },
    [load, showToast, supabase]
  );

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200/90 bg-white/95 p-6 shadow-sm dark:border-white/10 dark:bg-slate-900/95">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">Control Center</div>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 dark:text-white">Defaults &amp; Routing</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Configure the account the ERP should select automatically. Transaction-level choices still override these defaults, while historical transactions keep the account they originally used.
            </p>
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <section className="rounded-3xl border border-slate-200/90 bg-white/95 p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/95">
        <div className="mb-4">
          <h2 className="text-base font-black text-slate-900 dark:text-white">Customer collection defaults</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">These defaults select the account that receives customer money for the matching payment method.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {COLLECTION_METHODS.map((method) => {
            const route = routeFor("customer_collection", null, method.key === "card" ? null : method.key);
            const cardRoutes = method.key === "card" ? routes.filter((r) => r.purpose === "customer_collection" && !r.service_type && r.customer_payment_method === null) : [];
            const selected = route ? byId.get(route.instrument_id) : cardRoutes.length ? byId.get(cardRoutes[0].instrument_id) : null;
            const options = active.filter((i) => method.allowed.includes(i.type as never));
            const key = `customer_collection::${method.key === "card" ? "" : method.key}`;
            return (
              <div key={method.key} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-950/40">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-slate-900 dark:text-white">{method.label}</div>
                    <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Automatic collection account</div>
                  </div>
                  {selected && <span className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-extrabold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">Default</span>}
                </div>
                <select
                  value={selected?.id || ""}
                  onChange={(e) => {
                    if (!e.target.value) {
                      void clearDefault({ purpose: "customer_collection", method: method.key === "card" ? null : method.key });
                    } else {
                      void setDefault({ purpose: "customer_collection", method: method.key === "card" ? "card" : method.key, instrumentId: e.target.value });
                    }
                  }}
                  disabled={busyKey === key || loading || options.length === 0}
                  className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900 dark:text-white"
                >
                  <option value="">Not configured</option>
                  {options.map((i) => <option key={i.id} value={i.id}>{i.name} · {labelType(i.type)}</option>)}
                </select>
                {selected?.id && route?.is_system_default && <div className="mt-2 text-[10px] font-semibold text-amber-600 dark:text-amber-300">System seed — replace it whenever a different account should be automatic.</div>}
                {options.length === 0 && <div className="mt-2 text-[10px] font-semibold text-rose-600 dark:text-rose-300">No active compatible account is configured.</div>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200/90 bg-white/95 p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/95">
        <div className="mb-4">
          <h2 className="text-base font-black text-slate-900 dark:text-white">Provider funding defaults</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">These accounts fund the external operator, biller, or voucher provider. Cash is intentionally excluded.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {FUNDING_SERVICES.map((service) => {
            const route = routeFor("provider_funding", service.key, null);
            const selected = route ? byId.get(route.instrument_id) : null;
            const options = active.filter((i) => FUNDING_TYPES.includes(i.type));
            const key = `provider_funding:${service.key}:`;
            return (
              <div key={service.key} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-950/40">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-slate-900 dark:text-white">{service.label}</div>
                    <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{service.hint}</div>
                  </div>
                  {selected && <span className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-extrabold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">Default</span>}
                </div>
                <select
                  value={selected?.id || ""}
                  onChange={(e) => {
                    if (!e.target.value) {
                      void clearDefault({ purpose: "provider_funding", serviceType: service.key });
                    } else {
                      void setDefault({ purpose: "provider_funding", serviceType: service.key, instrumentId: e.target.value });
                    }
                  }}
                  disabled={busyKey === key || loading || options.length === 0}
                  className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900 dark:text-white"
                >
                  <option value="">Not configured</option>
                  {options.map((i) => <option key={i.id} value={i.id}>{i.name} · {labelType(i.type)}</option>)}
                </select>
                {selected?.id && route?.is_system_default && <div className="mt-2 text-[10px] font-semibold text-amber-600 dark:text-amber-300">System seed — replace it with the account you actually want to fund this service.</div>}
                {options.length === 0 && <div className="mt-2 text-[10px] font-semibold text-rose-600 dark:text-rose-300">No active online funding account is configured.</div>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/70 p-5 dark:border-white/10 dark:bg-slate-950/40">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">↯</div>
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white">Routing rules are additive</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              A specific service/provider default can override a generic business default later. The resolver records the chosen instrument on the transaction, so changing a default never rewrites history.
            </p>
          </div>
        </div>
      </section>

      {toastView}
    </div>
  );
}
