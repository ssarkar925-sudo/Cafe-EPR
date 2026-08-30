"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/lib/supabase/realtime";
import { useToast } from "@/components/ui/use-toast";
import { inr } from "@/lib/format";
import CommissionEditModal, { SERVICE_CATEGORIES } from "@/components/business/commission-edit-modal";
import { BillCommissionConfig, BUILTIN_CATEGORY_COMMISSIONS } from "@/lib/bill-payment/commission";
import { BILLER_CONFIGS } from "@/lib/bill-payment/biller-metadata";

export default function BillCommissionPanel() {
  const supabase = createClient();
  const { showToast } = useToast();

  const [configs, setConfigs] = useState<BillCommissionConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<BillCommissionConfig | null>(null);

  useRealtime(["bill_payment_commission_config"]);

  async function loadConfigs() {
    try {
      const { data, error } = await supabase
        .from("bill_payment_commission_config")
        .select("*")
        .order("service_type")
        .order("category_id")
        .order("biller_id");

      if (error) {
        console.warn("Notice: bill_payment_commission_config table query:", error.message);
        // Build initial local list from builtin defaults
        const defaults: BillCommissionConfig[] = SERVICE_CATEGORIES.map((cat) => {
          const fallback = BUILTIN_CATEGORY_COMMISSIONS[cat.id] || { type: "flat", value: 5.0 };
          return {
            id: `default-${cat.id}`,
            service_type: cat.serviceType,
            category_id: cat.id,
            biller_id: null,
            commission_type: fallback.type,
            commission_value: fallback.value,
            is_active: true,
          };
        });
        setConfigs(defaults);
      } else if (data && data.length > 0) {
        setConfigs(data as BillCommissionConfig[]);
      } else {
        // Table is empty, build default list
        const defaults: BillCommissionConfig[] = SERVICE_CATEGORIES.map((cat) => {
          const fallback = BUILTIN_CATEGORY_COMMISSIONS[cat.id] || { type: "flat", value: 5.0 };
          return {
            id: `default-${cat.id}`,
            service_type: cat.serviceType,
            category_id: cat.id,
            biller_id: null,
            commission_type: fallback.type,
            commission_value: fallback.value,
            is_active: true,
          };
        });
        setConfigs(defaults);
      }
    } catch (err: any) {
      console.warn("Failed to load configs:", err?.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadConfigs();
  }, []);

  const filteredConfigs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return configs;
    return configs.filter((c) => {
      const catName = SERVICE_CATEGORIES.find((sc) => sc.id === c.category_id)?.name || c.category_id || "";
      const billerName = BILLER_CONFIGS.find((b) => b.billerId === c.biller_id)?.billerName || c.biller_id || "";
      return (
        catName.toLowerCase().includes(q) ||
        billerName.toLowerCase().includes(q) ||
        c.service_type.toLowerCase().includes(q) ||
        c.commission_type.toLowerCase().includes(q)
      );
    });
  }, [configs, searchQuery]);

  function getCategoryName(categoryId?: string | null) {
    if (!categoryId) return "All Categories";
    return SERVICE_CATEGORIES.find((c) => c.id === categoryId)?.name || categoryId;
  }

  function getBillerName(billerId?: string | null) {
    if (!billerId) return "All Billers (Category Default)";
    return BILLER_CONFIGS.find((b) => b.billerId === billerId)?.billerName || billerId;
  }

  function openNew() {
    setEditingConfig(null);
    setModalOpen(true);
  }

  function openEdit(cfg: BillCommissionConfig) {
    setEditingConfig(cfg);
    setModalOpen(true);
  }

  function handleSaved(saved: BillCommissionConfig) {
    setConfigs((prev) => {
      const existingIdx = prev.findIndex((c) => c.id === saved.id);
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
  }

  return (
    <div className="space-y-6">
      {/* Header with Search and Add */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search bill payment commissions…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3.5 text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-slate-900 dark:text-white"
          />
        </div>

        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-indigo-600/20 transition hover:bg-indigo-700"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add Commission Rule
        </button>
      </div>

      {/* Commission Rules Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:border-white/5 dark:bg-white/[0.02] dark:text-slate-500">
                <th className="px-5 py-3.5">Category / Service</th>
                <th className="px-5 py-3.5">Biller Target</th>
                <th className="px-5 py-3.5">Type</th>
                <th className="px-5 py-3.5 text-right">Commission Value</th>
                <th className="px-5 py-3.5 text-center">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filteredConfigs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                    No commission configurations found.
                  </td>
                </tr>
              ) : (
                filteredConfigs.map((cfg) => {
                  const isBillerOverride = !!cfg.biller_id;
                  const isGooglePlay = cfg.service_type === "google_play_recharge" || cfg.category_id === "google_play";

                  return (
                    <tr key={cfg.id} className="transition hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                      <td className="px-5 py-3.5 font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded-lg text-xs font-black ${
                              isGooglePlay
                                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300"
                            }`}
                          >
                            {isGooglePlay ? "▶" : "⚡"}
                          </span>
                          <span>{getCategoryName(cfg.category_id)}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-medium text-slate-600 dark:text-slate-300">
                        {isBillerOverride ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                            ★ {getBillerName(cfg.biller_id)}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">All Billers in Category</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            cfg.commission_type === "percentage"
                              ? "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300"
                              : "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                          }`}
                        >
                          {cfg.commission_type === "percentage" ? "Percentage %" : "Flat ₹"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-black text-slate-900 dark:text-white">
                        {cfg.commission_type === "percentage" ? `${Number(cfg.commission_value).toFixed(2)}%` : inr(cfg.commission_value)}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            cfg.is_active
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400"
                          }`}
                        >
                          {cfg.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(cfg)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 dark:border-white/10 dark:text-slate-300 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300"
                        >
                          ⚙ Edit
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CommissionEditModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        existingConfig={editingConfig}
        onSaved={handleSaved}
      />
    </div>
  );
}
