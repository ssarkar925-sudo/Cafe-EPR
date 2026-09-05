"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Modal from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useRealtime } from "@/lib/supabase/realtime";

type Provider = { id: string; name: string; is_active: boolean; sort_order: number };
type Slab = { id: string; provider_id: string; min_amount: number | string; max_amount: number | string; commission_percent: number | string; created_at?: string };

const EMPTY = { provider_id: "", min_amount: "0", max_amount: "999999", commission_percent: "0" };
const money = (n: number | string) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function RechargeCommissionManager() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { showToast, toastView } = useToast();
  useRealtime(["recharge_providers", "recharge_commission_slabs"]);

  const isRecharge = pathname === "/business/bill-payment" && (searchParams.get("tab") || "recharge") === "recharge";
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [slabs, setSlabs] = useState<Slab[]>([]);
  const [providerId, setProviderId] = useState("all");
  const [editing, setEditing] = useState<Slab | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const providerName = (id: string) => providers.find((p) => p.id === id)?.name || "Unknown provider";

  const load = async () => {
    setLoading(true);
    const [{ data: ps, error: pe }, { data: ss, error: se }] = await Promise.all([
      supabase.from("recharge_providers").select("id,name,is_active,sort_order").eq("is_active", true).order("sort_order").order("name"),
      supabase.from("recharge_commission_slabs").select("id,provider_id,min_amount,max_amount,commission_percent,created_at").order("provider_id").order("min_amount"),
    ]);
    setLoading(false);
    if (pe || se) {
      showToast("error", pe?.message || se?.message || "Unable to load recharge commission rules.");
      return;
    }
    setProviders((ps ?? []) as Provider[]);
    setSlabs((ss ?? []) as Slab[]);
  };

  useEffect(() => {
    if (isRecharge && open) void load();
  }, [isRecharge, open]);

  useEffect(() => {
    if (!providerId && providers[0]) setProviderId(providers[0].id);
  }, [providers, providerId]);

  const filtered = useMemo(
    () => slabs.filter((s) => providerId === "all" || s.provider_id === providerId),
    [slabs, providerId],
  );

  function startAdd() {
    const selected = providerId === "all" ? (providers[0]?.id || "") : providerId;
    setEditing(null);
    setForm({ ...EMPTY, provider_id: selected });
  }

  function startEdit(slab: Slab) {
    setEditing(slab);
    setForm({
      provider_id: slab.provider_id,
      min_amount: String(slab.min_amount),
      max_amount: String(slab.max_amount),
      commission_percent: String(slab.commission_percent),
    });
  }

  function validate() {
    const min = Number(form.min_amount);
    const max = Number(form.max_amount);
    const pct = Number(form.commission_percent);
    if (!form.provider_id) return "Please select a provider.";
    if (!Number.isFinite(min) || min < 0) return "Minimum amount must be 0 or greater.";
    if (!Number.isFinite(max) || max < min) return "Maximum amount must be greater than or equal to minimum amount.";
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return "Commission percentage must be between 0% and 100%.";

    const overlap = slabs.find((s) => {
      if (s.provider_id !== form.provider_id || s.id === editing?.id) return false;
      const a = Number(s.min_amount), b = Number(s.max_amount);
      return min <= b && max >= a;
    });
    if (overlap) {
      return `Amount range overlaps with ${money(overlap.min_amount)}–${money(overlap.max_amount)} for this provider.`;
    }
    return null;
  }

  async function save() {
    const error = validate();
    if (error) {
      showToast("error", error);
      return;
    }
    setBusy(true);
    const payload = {
      provider_id: form.provider_id,
      min_amount: Number(form.min_amount),
      max_amount: Number(form.max_amount),
      commission_percent: Number(form.commission_percent),
    };
    const result = editing
      ? await supabase.from("recharge_commission_slabs").update(payload).eq("id", editing.id).select().single()
      : await supabase.from("recharge_commission_slabs").insert(payload).select().single();
    setBusy(false);
    if (result.error) {
      showToast("error", result.error.message);
      return;
    }
    setSlabs((prev) => editing ? prev.map((s) => s.id === editing.id ? result.data as Slab : s) : [...prev, result.data as Slab].sort((a, b) => a.provider_id.localeCompare(b.provider_id) || Number(a.min_amount) - Number(b.min_amount)));
    setEditing(null);
    setForm(EMPTY);
    showToast("success", editing ? "Recharge commission slab updated." : "Recharge commission slab added.");
  }

  async function remove(slab: Slab) {
    if (!window.confirm(`Delete ${providerName(slab.provider_id)} slab ${money(slab.min_amount)}–${money(slab.max_amount)} at ${slab.commission_percent}%?`)) return;
    const { error } = await supabase.from("recharge_commission_slabs").delete().eq("id", slab.id);
    if (error) {
      showToast("error", error.message);
      return;
    }
    setSlabs((prev) => prev.filter((s) => s.id !== slab.id));
    showToast("success", "Recharge commission slab deleted.");
  }

  if (!isRecharge) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); void load(); }}
        className="fixed bottom-20 right-5 z-[60] inline-flex items-center gap-2 rounded-2xl border border-amber-400/30 bg-slate-950 px-4 py-3 text-xs font-black text-white shadow-xl shadow-amber-500/15 ring-1 ring-white/10 backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 sm:bottom-6 sm:right-40"
        title="Manage recharge provider commission slabs"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300">%</span>
        <span>Commission Slabs</span>
      </button>

      {open && (
        <Modal
          onClose={() => { if (!busy) setOpen(false); }}
          title="Recharge Provider Commission Slabs"
          subtitle="Add, edit or remove provider-wise amount slabs used by the recharge terminal."
          icon="M19 5 5 19M7 7h.01M17 17h.01"
          accent="amber"
          size="xl"
        >
          <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-[220px] flex-1">
                <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Provider</label>
                <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold dark:border-white/10 dark:bg-slate-950 dark:text-white">
                  <option value="all">All Providers</option>
                  {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <button type="button" onClick={startAdd} disabled={!providers.length || loading} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50">+ Add Slab</button>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
              <b>How it works:</b> the recharge terminal matches the selected provider and recharge amount to one amount slab and calculates commission as <b>Amount × Commission %</b>. Keep ranges non-overlapping.
            </div>

            {loading ? (
              <div className="py-12 text-center text-sm text-slate-500">Loading commission slabs…</div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-white/10">
                <div className="text-3xl">%</div>
                <h3 className="mt-2 text-sm font-black text-slate-900 dark:text-white">No commission slabs configured</h3>
                <p className="mt-1 text-xs text-slate-500">Add a slab for this provider to make the commission percentage calculate automatically during recharge.</p>
                <button type="button" onClick={startAdd} className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white">+ Add First Slab</button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-[10px] font-black uppercase tracking-wider text-slate-500 dark:bg-white/[0.03]">
                    <tr><th className="px-4 py-3">Provider</th><th className="px-4 py-3 text-right">Min Amount</th><th className="px-4 py-3 text-right">Max Amount</th><th className="px-4 py-3 text-right">Commission</th><th className="px-4 py-3 text-right">Actions</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {filtered.map((slab) => (
                      <tr key={slab.id} className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">{providerName(slab.provider_id)}</td>
                        <td className="px-4 py-3 text-right font-mono">₹{money(slab.min_amount)}</td>
                        <td className="px-4 py-3 text-right font-mono">₹{money(slab.max_amount)}</td>
                        <td className="px-4 py-3 text-right"><span className="rounded-lg bg-amber-100 px-2.5 py-1 font-mono font-black text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{Number(slab.commission_percent)}%</span></td>
                        <td className="px-4 py-3 text-right"><div className="flex justify-end gap-2"><button type="button" onClick={() => startEdit(slab)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold dark:border-white/10 dark:text-slate-200">Edit</button><button type="button" onClick={() => void remove(slab)} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-600">Delete</button></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {(editing || form.provider_id) && (
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/20">
                <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black text-slate-900 dark:text-white">{editing ? "Edit Commission Slab" : "Add Commission Slab"}</h3><p className="text-[11px] text-slate-500">This rule is used by future recharge calculations.</p></div><button type="button" onClick={() => { setEditing(null); setForm(EMPTY); }} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">✕</button></div>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 md:col-span-1">Provider<select value={form.provider_id} onChange={(e) => setForm((v) => ({ ...v, provider_id: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950 dark:text-white">{providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Min ₹<input type="number" min="0" step="0.01" value={form.min_amount} onChange={(e) => setForm((v) => ({ ...v, min_amount: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950 dark:text-white" /></label>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Max ₹<input type="number" min="0" step="0.01" value={form.max_amount} onChange={(e) => setForm((v) => ({ ...v, max_amount: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950 dark:text-white" /></label>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Commission %<input type="number" min="0" max="100" step="0.01" value={form.commission_percent} onChange={(e) => setForm((v) => ({ ...v, commission_percent: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950 dark:text-white" /></label>
                </div>
                <div className="mt-4 flex justify-end"><button type="button" onClick={() => void save()} disabled={busy} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-black text-white disabled:opacity-50">{busy ? "Saving…" : editing ? "Update Slab" : "Add Slab"}</button></div>
              </div>
            )}
          </div>
          {toastView}
        </Modal>
      )}
    </>
  );
}
