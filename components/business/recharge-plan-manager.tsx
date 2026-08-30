"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";

export type PlanRow = {
  id: string;
  provider_id: string | null;
  category: string;
  amount: number | string;
  validity: string;
  data: string;
  voice: string;
  sms: string;
  description: string;
  badge: string | null;
  sort_order: number;
  is_active: boolean;
};

export type ProviderRow = { id: string; name: string; is_active: boolean };

const CATEGORIES = ["Popular Plans", "Daily 1.5GB/Day", "Daily 2GB/Day", "Annual 365 Days", "Data Only", "Talktime / Topup"];

const emptyForm = {
  provider_id: "",
  category: "Popular Plans",
  amount: "",
  validity: "",
  data: "",
  voice: "Unlimited",
  sms: "100/Day",
  description: "",
  badge: "",
  sort_order: "0",
  is_active: true,
};

export default function RechargePlanManager({ initialPlans, initialProviders }: { initialPlans: PlanRow[]; initialProviders: ProviderRow[] }) {
  const supabase = createClient();
  const { showToast, toastView } = useToast();
  const [plans, setPlans] = useState(initialPlans);
  const [providers] = useState(initialProviders.filter((p) => p.is_active));
  const [providerFilter, setProviderFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editing, setEditing] = useState<PlanRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => plans.filter((p) =>
    (providerFilter === "all" || (p.provider_id || "") === providerFilter) &&
    (categoryFilter === "all" || p.category === categoryFilter)
  ), [plans, providerFilter, categoryFilter]);

  const providerName = (id: string | null) => providers.find((p) => p.id === id)?.name || "All / Generic";

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, provider_id: providerFilter === "all" ? (providers[0]?.id || "") : providerFilter });
  }

  function openEdit(p: PlanRow) {
    setEditing(p);
    setForm({
      provider_id: p.provider_id || "",
      category: p.category,
      amount: String(p.amount),
      validity: p.validity,
      data: p.data,
      voice: p.voice,
      sms: p.sms,
      description: p.description,
      badge: p.badge || "",
      sort_order: String(p.sort_order),
      is_active: p.is_active,
    });
  }

  async function save() {
    const amount = Number(form.amount);
    if (!amount || amount <= 0) return showToast("error", "Plan amount must be greater than ₹0.");
    if (!form.validity.trim()) return showToast("error", "Validity is required.");
    setBusy(true);
    const payload = {
      provider_id: form.provider_id || null,
      category: form.category,
      amount,
      validity: form.validity.trim(),
      data: form.data.trim(),
      voice: form.voice.trim(),
      sms: form.sms.trim(),
      description: form.description.trim(),
      badge: form.badge.trim() || null,
      sort_order: Number(form.sort_order) || 0,
      is_active: form.is_active,
    };
    const result = editing
      ? await supabase.from("recharge_plan_catalog").update(payload).eq("id", editing.id).select().single()
      : await supabase.from("recharge_plan_catalog").insert(payload).select().single();
    setBusy(false);
    if (result.error) return showToast("error", result.error.message);
    if (editing) setPlans((prev) => prev.map((p) => p.id === editing.id ? result.data : p));
    else setPlans((prev) => [result.data, ...prev]);
    setEditing(null);
    setForm(emptyForm);
    showToast("success", editing ? "Recharge plan updated" : "Recharge plan added");
  }

  async function remove(p: PlanRow) {
    if (!window.confirm(`Remove ${providerName(p.provider_id)} ₹${p.amount} plan?`)) return;
    const { error } = await supabase.from("recharge_plan_catalog").delete().eq("id", p.id);
    if (error) return showToast("error", error.message);
    setPlans((prev) => prev.filter((x) => x.id !== p.id));
    showToast("success", "Recharge plan removed");
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-indigo-500">Mobile Recharge</span>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Custom Recharge Plan Catalog</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Control exactly which plans appear under “Select Plan or Enter Amount”. Provider-specific plans override generic plans.</p>
        </div>
        <button onClick={openCreate} className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white shadow-sm hover:bg-slate-700 dark:bg-white dark:text-slate-900">+ Add Plan</button>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold dark:border-white/10 dark:bg-slate-800 dark:text-white">
          <option value="all">All Providers</option>
          {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold dark:border-white/10 dark:bg-slate-800 dark:text-white">
          <option value="all">All Categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((p) => (
          <div key={p.id} className={`rounded-2xl border bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900 ${p.is_active ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[10px] font-black uppercase text-indigo-500">{providerName(p.provider_id)}</div>
                <div className="mt-1 text-xl font-black text-slate-900 dark:text-white">₹{Number(p.amount).toLocaleString("en-IN")}</div>
                <div className="text-xs font-bold text-slate-600 dark:text-slate-300">{p.category} · {p.validity}</div>
              </div>
              {p.badge && <span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-black text-amber-700">{p.badge}</span>}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] text-slate-500">
              <div><b className="block text-slate-800 dark:text-slate-200">Data</b>{p.data || "—"}</div>
              <div><b className="block text-slate-800 dark:text-slate-200">Voice</b>{p.voice || "—"}</div>
              <div><b className="block text-slate-800 dark:text-slate-200">SMS</b>{p.sms || "—"}</div>
            </div>
            <p className="mt-3 line-clamp-2 text-[11px] text-slate-500">{p.description || "Custom recharge plan"}</p>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-white/5">
              <button onClick={() => openEdit(p)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold dark:border-white/10 dark:text-slate-200">Edit</button>
              <button onClick={() => remove(p)} className="rounded-lg border border-rose-200 px-3 py-1.5 text-[11px] font-bold text-rose-600">Delete</button>
            </div>
          </div>
        ))}
      </div>

      {(editing || form.amount !== "") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center justify-between"><h2 className="text-lg font-black text-slate-900 dark:text-white">{editing ? "Edit Recharge Plan" : "Add Recharge Plan"}</h2><button onClick={() => { setEditing(null); setForm(emptyForm); }} className="text-slate-400">✕</button></div>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold">Provider<select value={form.provider_id} onChange={(e) => setForm({ ...form, provider_id: e.target.value })} className="mt-1 w-full rounded-xl border p-2.5 text-xs dark:border-white/10 dark:bg-slate-800 dark:text-white"><option value="">Generic / All Providers</option>{providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
              <label className="text-xs font-bold">Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="mt-1 w-full rounded-xl border p-2.5 text-xs dark:border-white/10 dark:bg-slate-800 dark:text-white">{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
              <label className="text-xs font-bold">Amount ₹<input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="mt-1 w-full rounded-xl border p-2.5 text-xs dark:border-white/10 dark:bg-slate-800 dark:text-white" /></label>
              <label className="text-xs font-bold">Validity<input value={form.validity} onChange={(e) => setForm({ ...form, validity: e.target.value })} placeholder="28 Days" className="mt-1 w-full rounded-xl border p-2.5 text-xs dark:border-white/10 dark:bg-slate-800 dark:text-white" /></label>
              <label className="text-xs font-bold">Data<input value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} placeholder="1.5 GB/Day" className="mt-1 w-full rounded-xl border p-2.5 text-xs dark:border-white/10 dark:bg-slate-800 dark:text-white" /></label>
              <label className="text-xs font-bold">Voice<input value={form.voice} onChange={(e) => setForm({ ...form, voice: e.target.value })} className="mt-1 w-full rounded-xl border p-2.5 text-xs dark:border-white/10 dark:bg-slate-800 dark:text-white" /></label>
              <label className="text-xs font-bold">SMS<input value={form.sms} onChange={(e) => setForm({ ...form, sms: e.target.value })} className="mt-1 w-full rounded-xl border p-2.5 text-xs dark:border-white/10 dark:bg-slate-800 dark:text-white" /></label>
              <label className="text-xs font-bold">Badge<input value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} placeholder="Best Seller" className="mt-1 w-full rounded-xl border p-2.5 text-xs dark:border-white/10 dark:bg-slate-800 dark:text-white" /></label>
              <label className="text-xs font-bold sm:col-span-2">Description<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 w-full rounded-xl border p-2.5 text-xs dark:border-white/10 dark:bg-slate-800 dark:text-white" /></label>
            </div>
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => { setEditing(null); setForm(emptyForm); }} className="rounded-xl border px-4 py-2 text-xs font-bold dark:border-white/10 dark:text-white">Cancel</button><button onClick={save} disabled={busy} className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-black text-white disabled:opacity-50">{busy ? "Saving…" : "Save Plan"}</button></div>
          </div>
        </div>
      )}
      {toastView}
    </div>
  );
}
