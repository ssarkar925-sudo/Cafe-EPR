"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BILLER_CATEGORIES, POPULAR_BILLERS } from "@/components/business/utility-bill-workspace";
import { getBillerConfig, getFallbackBillerConfig } from "@/lib/bill-payment/biller-metadata";
import type { NormalizedBillResponse, BillerConfig } from "@/lib/bill-payment/types";

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function clean(value: string) {
  return value.trim();
}

export default function CustomerDetailsWorkspace({
  initialCategory,
  initialBiller,
}: {
  initialCategory?: string;
  initialBiller?: string;
}) {
  const [categoryId, setCategoryId] = useState(initialCategory || "electricity");
  const billers = useMemo(() => POPULAR_BILLERS.filter((b) => b.categoryId === categoryId), [categoryId]);
  const [billerId, setBillerId] = useState(initialBiller || billers[0]?.id || "");
  const [params, setParams] = useState<Record<string, string>>({});
  const [customerMobile, setCustomerMobile] = useState("");
  const [result, setResult] = useState<NormalizedBillResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "fetching" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const requestSeq = useRef(0);

  const category = useMemo(() => BILLER_CATEGORIES.find((c) => c.id === categoryId) || BILLER_CATEGORIES[0], [categoryId]);
  const biller = useMemo(() => POPULAR_BILLERS.find((b) => b.id === billerId) || null, [billerId]);
  const config: BillerConfig = useMemo(
    () => getBillerConfig(billerId) || getFallbackBillerConfig(categoryId, biller?.name || category.name),
    [billerId, categoryId, biller, category]
  );

  useEffect(() => {
    const first = billers[0]?.id || "";
    setBillerId((current) => billers.some((b) => b.id === current) ? current : first);
    setParams({});
    setCustomerMobile("");
    setResult(null);
    setStatus("idle");
    setMessage("");
  }, [categoryId, billers]);

  const fetchCustomer = useCallback(async () => {
    const required = config.parameters.filter((p) => p.required);
    for (const p of required) {
      if (!clean(params[p.key] || "")) {
        setStatus("error");
        setMessage(`Please enter ${p.label}.`);
        return;
      }
    }

    const lookupParams: Record<string, string> = {};
    for (const p of config.parameters) {
      const value = clean(params[p.key] || "");
      if (value) lookupParams[p.key] = value;
    }
    if (customerMobile.trim()) lookupParams.mobileNumber = customerMobile.trim();

    const seq = ++requestSeq.current;
    setStatus("fetching");
    setMessage("");
    setResult(null);

    try {
      const url = new URL("/api/bill-payment/fetch", window.location.origin);
      url.searchParams.set("billerId", billerId);
      url.searchParams.set("category", categoryId);
      Object.entries(lookupParams).forEach(([key, value]) => url.searchParams.set(key, value));

      const response = await fetch(url.toString(), { cache: "no-store", signal: AbortSignal.timeout(12000) });
      const data: NormalizedBillResponse = await response.json().catch(() => ({ ok: false, configured: false, source: "provider_error", error: "Invalid lookup response" } as NormalizedBillResponse));
      if (seq !== requestSeq.current) return;

      if (!data.ok || data.status !== "verified") {
        setStatus("error");
        setMessage(data.error || "Customer details could not be verified.");
        return;
      }

      setResult(data);
      setStatus("success");
      setMessage("Customer details verified successfully.");
    } catch (error) {
      if (seq !== requestSeq.current) return;
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Customer lookup failed.");
    }
  }, [billerId, categoryId, config, customerMobile, params]);

  const primary = config.parameters[0];
  const canFetch = config.supportsFetch && config.parameters.filter((p) => p.required).every((p) => clean(params[p.key] || ""));

  useEffect(() => {
    if (!primary) return;
    const value = clean(params[primary.key] || "");
    const minLength = primary.minLength || 6;
    if (value.length < minLength || !config.supportsFetch) return;
    const timer = setTimeout(() => void fetchCustomer(), 700);
    return () => clearTimeout(timer);
  }, [params, primary, config.supportsFetch, fetchCustomer]);

  return (
    <div className="space-y-6 pb-12">
      <div className="rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 p-6 text-white shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex rounded-full bg-emerald-500/20 px-3 py-1 text-[10px] font-black tracking-wide text-emerald-300 ring-1 ring-emerald-500/40">CUSTOMER LOOKUP ONLY</span>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Biller Customer Details</h1>
            <p className="mt-1 max-w-2xl text-xs text-slate-300">Select a biller and enter the customer identifier. The system retrieves customer information only. No bill payment, funding, commission or settlement is performed here.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-md dark:border-white/10 dark:bg-slate-900 lg:col-span-7">
          <div>
            <label className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">1. Select Service Category</label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {BILLER_CATEGORIES.map((item) => (
                <button key={item.id} type="button" onClick={() => setCategoryId(item.id)} className={`rounded-2xl border p-3 text-center transition ${categoryId === item.id ? "border-cyan-500 bg-cyan-50 ring-2 ring-cyan-500/20 dark:bg-cyan-950/40" : "border-slate-200 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800/50"}`}>
                  <div className="text-xl">{item.icon}</div>
                  <div className="mt-1 text-[11px] font-black text-slate-800 dark:text-slate-200">{item.name}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 dark:border-white/5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">2. Select Biller</label>
              <span className="text-[10px] font-bold text-slate-400">{billers.length} available</span>
            </div>
            <select value={billerId} onChange={(e) => { setBillerId(e.target.value); setParams({}); setResult(null); setStatus("idle"); setMessage(""); }} className="mt-2 w-full rounded-2xl border border-slate-300 bg-white p-3 text-xs font-black text-slate-900 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white">
              {billers.map((item) => <option key={item.id} value={item.id}>{item.name}{item.state ? ` (${item.state})` : ""}</option>)}
            </select>
          </div>

          <div className="border-t border-slate-100 pt-4 dark:border-white/5">
            <label className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">3. Customer Identifier</label>
            <div className="mt-2 space-y-3">
              {config.parameters.map((field) => (
                <div key={field.key}>
                  <label className="text-[11px] font-bold text-slate-500">{field.label}{field.required ? " *" : ""}</label>
                  <input type={field.type === "number" ? "text" : field.type} inputMode={field.type === "number" || field.type === "tel" ? "numeric" : undefined} value={params[field.key] || ""} onChange={(e) => { setParams((current) => ({ ...current, [field.key]: e.target.value })); setResult(null); setStatus("idle"); setMessage(""); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void fetchCustomer(); } }} placeholder={field.placeholder} minLength={field.minLength} maxLength={field.maxLength} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-black text-slate-900 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white" />
                  {field.hint && <p className="mt-1 text-[10px] text-slate-400">{field.hint}</p>}
                </div>
              ))}

              <div>
                <label className="text-[11px] font-bold text-slate-500">Customer Mobile Number (optional)</label>
                <input type="tel" inputMode="numeric" maxLength={10} value={customerMobile} onChange={(e) => { setCustomerMobile(e.target.value.replace(/\D/g, "").slice(0, 10)); setResult(null); }} placeholder="10-digit mobile number" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-black text-slate-900 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white" />
              </div>

              <button type="button" onClick={() => void fetchCustomer()} disabled={!canFetch || status === "fetching"} className="w-full rounded-2xl bg-cyan-600 px-4 py-3 text-sm font-black text-white shadow-lg hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50">
                {status === "fetching" ? "🔄 Fetching Customer Details…" : "🔍 Fetch Customer Details"}
              </button>

              {!getBillerConfig(billerId) && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-bold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">This biller is listed in Café ERP, but its live customer-lookup mapping still needs to be configured.</div>}

              {message && <div className={`rounded-xl p-3 text-[11px] font-bold ${status === "success" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : status === "error" ? "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300" : "bg-slate-50 text-slate-600 dark:bg-white/5 dark:text-slate-300"}`}>{status === "success" ? "✓ " : "⚠ "}{message}</div>}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-slate-50/60 p-6 shadow-md dark:border-white/10 dark:bg-slate-900/60 lg:col-span-5">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Customer Information</span>
          <h2 className="mt-1 text-lg font-black text-slate-900 dark:text-white">Verified Customer Details</h2>

          {!result && <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center dark:border-white/10 dark:bg-slate-800/50"><div className="text-3xl">👤</div><p className="mt-2 text-sm font-black text-slate-700 dark:text-slate-200">No customer loaded</p><p className="mt-1 text-xs text-slate-400">Enter the biller identifier and fetch the customer record.</p></div>}

          {result && <div className="mt-5 space-y-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20"><div className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Customer Name</div><div className="mt-1 text-xl font-black text-slate-900 dark:text-white">{result.customerName || "Not supplied by biller"}</div></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-800/70"><div className="text-[10px] font-black uppercase text-slate-400">Biller</div><div className="mt-1 text-xs font-black text-slate-900 dark:text-white">{result.billerName || biller?.name || category.name}</div></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-800/70"><div className="text-[10px] font-black uppercase text-slate-400">Customer ID</div><div className="mt-1 break-all text-xs font-black text-slate-900 dark:text-white">{result.customerIdentifier || params[primary?.key || ""] || "—"}</div></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-800/70"><div className="text-[10px] font-black uppercase text-slate-400">Mobile</div><div className="mt-1 text-xs font-black text-slate-900 dark:text-white">{customerMobile || "Not supplied"}</div></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-800/70"><div className="text-[10px] font-black uppercase text-slate-400">Verified At</div><div className="mt-1 text-xs font-black text-slate-900 dark:text-white">{fmtDate(result.fetchedAt)}</div></div>
            </div>
            <div className="rounded-xl bg-cyan-50 p-3 text-[11px] font-bold text-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-200">✓ Customer lookup completed. This screen does not initiate or record a bill payment.</div>
          </div>}
        </section>
      </div>
    </div>
  );
}
