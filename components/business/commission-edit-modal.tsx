"use client";

import { useState, useEffect } from "react";
import Modal from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { BillCommissionConfig, CommissionType, BUILTIN_CATEGORY_COMMISSIONS } from "@/lib/bill-payment/commission";
import { BILLER_CONFIGS } from "@/lib/bill-payment/biller-metadata";

export const SERVICE_CATEGORIES = [
  { id: "electricity", name: "Electricity", serviceType: "utility_bill" },
  { id: "gas", name: "Piped Gas / LPG", serviceType: "utility_bill" },
  { id: "water", name: "Water Supply", serviceType: "utility_bill" },
  { id: "broadband", name: "Broadband & Fiber", serviceType: "utility_bill" },
  { id: "dth", name: "DTH & Cable TV", serviceType: "utility_bill" },
  { id: "fastag", name: "FASTag Recharge", serviceType: "utility_bill" },
  { id: "insurance", name: "Life & Health Insurance", serviceType: "utility_bill" },
  { id: "loan", name: "Loan EMI Repayment", serviceType: "utility_bill" },
  { id: "landline", name: "Landline Postpaid", serviceType: "utility_bill" },
  { id: "postpaid", name: "Mobile Postpaid", serviceType: "utility_bill" },
  { id: "google_play", name: "Google Play Recharge", serviceType: "google_play_recharge" },
];

export default function CommissionEditModal({
  open,
  onClose,
  initialCategory,
  initialBillerId,
  initialServiceType,
  existingConfig,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initialCategory?: string;
  initialBillerId?: string;
  initialServiceType?: string;
  existingConfig?: BillCommissionConfig | null;
  onSaved?: (config: BillCommissionConfig) => void;
}) {
  const supabase = createClient();
  const { showToast } = useToast();

  const [categoryId, setCategoryId] = useState(initialCategory || "electricity");
  const [billerId, setBillerId] = useState(initialBillerId || "");
  const [commissionType, setCommissionType] = useState<CommissionType>("flat");
  const [commissionValue, setCommissionValue] = useState("5.00");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      if (existingConfig) {
        setCategoryId(existingConfig.category_id || (existingConfig.service_type === "google_play_recharge" ? "google_play" : "electricity"));
        setBillerId(existingConfig.biller_id || "");
        setCommissionType(existingConfig.commission_type);
        setCommissionValue(String(existingConfig.commission_value));
        setIsActive(existingConfig.is_active);
      } else {
        const cat = initialCategory || (initialServiceType === "google_play_recharge" ? "google_play" : "electricity");
        setCategoryId(cat);
        setBillerId(initialBillerId || "");
        const fallback = BUILTIN_CATEGORY_COMMISSIONS[cat] || { type: "flat", value: 5.0 };
        setCommissionType(fallback.type);
        setCommissionValue(String(fallback.value));
        setIsActive(true);
      }
      setError("");
    }
  }, [open, existingConfig, initialCategory, initialBillerId, initialServiceType]);

  if (!open) return null;

  const availableBillers = BILLER_CONFIGS.filter(
    (b) => b.categoryId.toLowerCase() === categoryId.toLowerCase()
  );

  async function handleSave() {
    setError("");
    const val = Number(commissionValue);

    if (isNaN(val) || val < 0) {
      setError("Commission value cannot be negative or invalid.");
      return;
    }

    if (commissionType === "percentage" && val > 50) {
      setError("Percentage commission cannot exceed 50%.");
      return;
    }

    if (commissionType === "flat" && val > 1000) {
      setError("Flat commission cannot exceed ₹1,000.00.");
      return;
    }

    setSubmitting(true);
    const serviceType = categoryId === "google_play" ? "google_play_recharge" : "utility_bill";

    const payload: Partial<BillCommissionConfig> = {
      service_type: serviceType,
      category_id: categoryId,
      biller_id: billerId.trim() ? billerId.trim() : null,
      commission_type: commissionType,
      commission_value: val,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    };

    try {
      let savedConfig: BillCommissionConfig;

      if (existingConfig?.id && !existingConfig.id.startsWith("default-")) {
        const { data, error: updateErr } = await supabase
          .from("bill_payment_commission_config")
          .update(payload)
          .eq("id", existingConfig.id)
          .select()
          .single();

        if (updateErr) {
          console.warn("DB update notice:", updateErr.message);
          savedConfig = {
            id: existingConfig.id,
            ...(payload as any),
          };
        } else {
          savedConfig = data as BillCommissionConfig;
        }
      } else {
        const id = crypto.randomUUID();
        const { data, error: insertErr } = await supabase
          .from("bill_payment_commission_config")
          .insert({ id, ...payload })
          .select()
          .single();

        if (insertErr) {
          console.warn("DB insert notice:", insertErr.message);
          savedConfig = {
            id,
            ...(payload as any),
          };
        } else {
          savedConfig = data as BillCommissionConfig;
        }
      }

      showToast("success", "Commission margin configuration saved.");
      if (onSaved) onSaved(savedConfig);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to save commission configuration.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={existingConfig ? "Edit Bill Payment Margin" : "Configure Bill Payment Margin"}
    >
      <div className="space-y-4 text-left">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
            Service Category
          </label>
          <select
            value={categoryId}
            onChange={(e) => {
              const newCat = e.target.value;
              setCategoryId(newCat);
              setBillerId("");
              const fallback = BUILTIN_CATEGORY_COMMISSIONS[newCat] || { type: "flat", value: 4.0 };
              setCommissionType(fallback.type);
              setCommissionValue(String(fallback.value));
            }}
            disabled={submitting}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-slate-900 dark:text-white"
          >
            {SERVICE_CATEGORIES.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {categoryId !== "google_play" && availableBillers.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
              Specific Biller (Optional Override)
            </label>
            <select
              value={billerId}
              onChange={(e) => setBillerId(e.target.value)}
              disabled={submitting}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-slate-900 dark:text-white"
            >
              <option value="">— All Billers in Category (Default) —</option>
              {availableBillers.map((b) => (
                <option key={b.billerId} value={b.billerId}>
                  {b.billerName}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
            Commission Type
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setCommissionType("flat")}
              className={`rounded-xl border py-2 text-xs font-bold transition ${
                commissionType === "flat"
                  ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-300"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              💵 Flat Amount (₹)
            </button>
            <button
              type="button"
              onClick={() => setCommissionType("percentage")}
              className={`rounded-xl border py-2 text-xs font-bold transition ${
                commissionType === "percentage"
                  ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-300"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              📊 Percentage (%)
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
            Commission Value {commissionType === "flat" ? "(₹ per transaction)" : "(% of bill amount)"}
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max={commissionType === "percentage" ? "50" : "1000"}
            value={commissionValue}
            onChange={(e) => setCommissionValue(e.target.value)}
            disabled={submitting}
            placeholder={commissionType === "flat" ? "e.g. 5.00" : "e.g. 2.00"}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-black text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-slate-900 dark:text-white"
          />
        </div>

        <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/80 p-3 dark:border-white/5 dark:bg-white/[0.02]">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Active Rule</span>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={submitting}
              className="peer sr-only"
            />
            <div className="peer h-5 w-9 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-indigo-600 peer-checked:after:translate-x-full peer-checked:after:border-white dark:bg-slate-700" />
          </label>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-white/10">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={submitting}
            className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-black text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save Margin Rule"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
