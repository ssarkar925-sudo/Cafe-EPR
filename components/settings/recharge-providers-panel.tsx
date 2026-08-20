"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/ui/modal";
import { useToast } from "@/components/ui/use-toast";
import { inr } from "@/lib/format";

export type RechargeProvider = {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
};

export type RechargeSlab = {
  id: string;
  provider_id: string;
  min_amount: number | string;
  max_amount: number | string;
  commission_percent: number | string;
};

function gradient(name: string) {
  const palettes = [
    "from-blue-500 to-cyan-400",
    "from-violet-500 to-fuchsia-400",
    "from-emerald-500 to-teal-400",
    "from-amber-500 to-orange-400",
    "from-rose-500 to-pink-400",
    "from-indigo-500 to-purple-400",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palettes[h % palettes.length];
}

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100";

export default function RechargeProvidersPanel({
  initialProviders,
  initialSlabs,
}: {
  initialProviders: RechargeProvider[];
  initialSlabs: RechargeSlab[];
}) {
  const [providers, setProviders] = useState<RechargeProvider[]>(initialProviders);
  const [slabs, setSlabs] = useState<RechargeSlab[]>(initialSlabs);
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RechargeProvider | null>(null);
  const [form, setForm] = useState({ name: "", sort_order: "0" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(initialProviders[0]?.id ?? null);
  const [slabForm, setSlabForm] = useState({ min: "", max: "", percent: "" });
  const [slabError, setSlabError] = useState("");
  const supabase = createClient();
  const { showToast, toastView } = useToast();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return providers;
    return providers.filter((p) => p.name.toLowerCase().includes(needle));
  }, [providers, q]);

  const slabsFor = (providerId: string) =>
    slabs
      .filter((s) => s.provider_id === providerId)
      .sort((a, b) => Number(a.min_amount) - Number(b.min_amount));

  function openCreate() {
    setForm({ name: "", sort_order: "0" });
    setEditing(null);
    setError("");
    setShowForm(true);
  }

  function openEdit(p: RechargeProvider) {
    setForm({ name: p.name, sort_order: String(p.sort_order) });
    setEditing(p);
    setError("");
    setShowForm(true);
  }

  async function saveProvider() {
    if (!form.name.trim()) return setError("Provider name is required.");
    setBusy(true);
    if (editing) {
      const { error } = await supabase
        .from("recharge_providers")
        .update({ name: form.name.trim(), sort_order: Number(form.sort_order) || 0 })
        .eq("id", editing.id);
      setBusy(false);
      if (error) return setError(error.message);
      setProviders((prev) =>
        prev.map((p) => (p.id === editing.id ? { ...p, name: form.name.trim(), sort_order: Number(form.sort_order) || 0 } : p))
      );
      showToast("success", "Provider updated");
    } else {
      const { data, error } = await supabase
        .from("recharge_providers")
        .insert({ name: form.name.trim(), sort_order: Number(form.sort_order) || 0 })
        .select()
        .single();
      setBusy(false);
      if (error) return setError(error.message);
      setProviders((prev) => [data, ...prev]);
      setOpenId(data.id);
      showToast("success", "Provider added");
    }
    setShowForm(false);
  }

  async function toggleActive(p: RechargeProvider) {
    const { error } = await supabase.from("recharge_providers").update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) return showToast("error", error.message);
    setProviders((prev) => prev.map((x) => (x.id === p.id ? { ...x, is_active: !p.is_active } : x)));
    showToast("success", `${p.name} ${p.is_active ? "deactivated" : "activated"}`);
  }

  async function deleteProvider(p: RechargeProvider) {
    const { error } = await supabase.from("recharge_providers").delete().eq("id", p.id);
    if (error) return showToast("error", error.message);
    setProviders((prev) => prev.filter((x) => x.id !== p.id));
    setSlabs((prev) => prev.filter((s) => s.provider_id !== p.id));
    setOpenId(null);
    showToast("success", "Provider deleted");
  }

  async function addSlab(providerId: string) {
    setSlabError("");
    const min = Number(slabForm.min);
    const max = Number(slabForm.max);
    const percent = Number(slabForm.percent);
    if (!slabForm.min || isNaN(min) || min < 0) return setSlabError("Min amount is required.");
    if (!slabForm.max || isNaN(max) || max <= min) return setSlabError("Max amount must be greater than min.");
    if (isNaN(percent) || percent < 0) return setSlabError("Commission % cannot be negative.");
    const { data, error } = await supabase
      .from("recharge_commission_slabs")
      .insert({ provider_id: providerId, min_amount: min, max_amount: max, commission_percent: percent })
      .select()
      .single();
    if (error) return setSlabError(error.message);
    setSlabs((prev) => [data, ...prev]);
    setSlabForm({ min: "", max: "", percent: "" });
    showToast("success", "Commission slab added");
  }

  async function deleteSlab(s: RechargeSlab) {
    const { error } = await supabase.from("recharge_commission_slabs").delete().eq("id", s.id);
    if (error) return showToast("error", error.message);
    setSlabs((prev) => prev.filter((x) => x.id !== s.id));
    showToast("success", "Slab removed");
  }

  const actionBtn =
    "inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium transition";

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Recharge Providers</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Providers and their commission slabs (₹100–200 → 1%, ₹201–400 → 2%, …). Commission is the shop&apos;s earnings.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4"><path d="M12 5v14M5 12h14" /></svg>
          Add Provider
        </button>
      </div>

      <div className="mt-4 relative min-w-[220px] max-w-md">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search provider…"
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {filtered.map((p) => {
          const pSlabs = slabsFor(p.id);
          const open = openId === p.id;
          return (
            <div
              key={p.id}
              className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md ${!p.is_active ? "opacity-70" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient(p.name)} text-white shadow-sm`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{p.name}</p>
                    <p className="text-xs text-slate-400">{pSlabs.length} slab{pSlabs.length === 1 ? "" : "s"}</p>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                  {p.is_active ? "Active" : "Inactive"}
                </span>
              </div>

              {pSlabs.length > 0 && (
                <div className="mt-3 overflow-hidden rounded-xl border border-slate-100">
                  <table className="min-w-full divide-y divide-slate-100 text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Min</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Max</th>
                        <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">Commission</th>
                        <th className="px-2 py-1.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {pSlabs.map((s) => (
                        <tr key={s.id}>
                          <td className="px-3 py-1.5 text-slate-700">{inr(Number(s.min_amount))}</td>
                          <td className="px-3 py-1.5 text-slate-700">{inr(Number(s.max_amount))}</td>
                          <td className="px-3 py-1.5 text-right font-semibold text-emerald-600">{Number(s.commission_percent)}%</td>
                          <td className="px-2 py-1.5">
                            <button onClick={() => deleteSlab(s)} title="Remove slab" className="text-slate-400 transition hover:text-rose-600">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4"><path d="M6 6l12 12M18 6 6 18" /></svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {open ? (
                <div className="mt-3 grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold text-slate-500">Min ₹</label>
                    <input type="number" min="0" step="0.01" value={slabForm.min} onChange={(e) => setSlabForm((f) => ({ ...f, min: e.target.value }))} placeholder="100" className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold text-slate-500">Max ₹</label>
                    <input type="number" min="0" step="0.01" value={slabForm.max} onChange={(e) => setSlabForm((f) => ({ ...f, max: e.target.value }))} placeholder="200" className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold text-slate-500">%</label>
                    <input type="number" min="0" step="0.01" value={slabForm.percent} onChange={(e) => setSlabForm((f) => ({ ...f, percent: e.target.value }))} placeholder="1" className={inputClass} />
                  </div>
                  <button
                    onClick={() => addSlab(p.id)}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                  >
                    Add
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setOpenId(p.id)}
                  className="mt-3 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-500 transition hover:border-blue-400 hover:text-blue-600"
                >
                  + Add commission slab
                </button>
              )}
              {open && slabError && (
                <p className="mt-2 text-xs text-rose-600">{slabError}</p>
              )}

              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <div className="flex gap-2">
                  <button onClick={() => openEdit(p)} className={`${actionBtn} text-slate-600 hover:bg-slate-50`}>Edit</button>
                  <button onClick={() => toggleActive(p)} className={`${actionBtn} ${p.is_active ? "text-rose-600 hover:bg-rose-50" : "text-emerald-600 hover:bg-emerald-50"}`}>
                    {p.is_active ? "Deactivate" : "Activate"}
                  </button>
                  <button onClick={() => deleteProvider(p)} className={`${actionBtn} text-rose-600 hover:bg-rose-50`}>Delete</button>
                </div>
                <button onClick={() => setOpenId(open ? null : p.id)} className="text-xs text-slate-400 hover:text-slate-600">
                  {open ? "Hide" : "Slabs"}
                </button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-200 py-14 text-center text-sm text-slate-400">
            No providers found. Add the first one.
          </div>
        )}
      </div>

      {showForm && (
        <Modal
          onClose={() => setShowForm(false)}
          size="md"
          accent="blue"
          icon="M13 2 3 14h7l-1 8 10-12h-7l1-8Z"
          title={editing ? "Edit Provider" : "Add Provider"}
          subtitle="Used by the Recharge module to compute commission."
          footer={
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={saveProvider} disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50">
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Provider Name *</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Jio, Airtel, Vi…" className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Sort Order</label>
              <input type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))} className={inputClass} />
            </div>
          </div>
          {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        </Modal>
      )}
      {toastView}
    </div>
  );
}