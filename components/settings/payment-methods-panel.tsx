"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { useToast } from "@/components/ui/use-toast";
import SettingsSection from "@/components/settings/settings-section";
import ConfirmDeleteModal from "@/components/settings/confirm-dialog";
import {
  type PaymentMethodRow,
  STANDARD_METHODS,
  METHOD_STYLE,
  inputClass,
} from "@/components/settings/settings-config";

const SECTION_ICON = "M12 8c-2.2 0-4 1.3-4 3s1.8 3 4 3 4-1.3 4-3-1.8-3-4-3ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z";

export default function PaymentMethodsPanel({
  initialPaymentMethods,
  active,
}: {
  initialPaymentMethods: PaymentMethodRow[];
  active: boolean;
}) {
  const supabase = createClient();
  const { showToast, toastView } = useToast();
  const [methods, setMethods] = useState<PaymentMethodRow[]>(initialPaymentMethods);
  const [methodBusy, setMethodBusy] = useState<string | null>(null);
  const [editingMethod, setEditingMethod] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [newMethod, setNewMethod] = useState<string>("");
  const [addingMethod, setAddingMethod] = useState(false);
  const [methodDel, setMethodDel] = useState<{ row: PaymentMethodRow; referenced: boolean } | null>(null);

  const availableMethods = STANDARD_METHODS.filter((m) => !methods.some((x) => x.method === m.method));
  const sortedMethods = [...methods].sort((a, b) => a.sort_order - b.sort_order);

  async function addPaymentMethod() {
    if (!newMethod) {
      showToast("error", "Choose a payment method to enable.");
      return;
    }
    const spec = STANDARD_METHODS.find((m) => m.method === newMethod);
    if (!spec) return;
    const max = methods.reduce((m, r) => Math.max(m, r.sort_order), 0);
    setAddingMethod(true);
    const { data, error } = await supabase
      .from("payment_methods")
      .insert({ method: spec.method, label: spec.label, sort_order: max + 1 })
      .select("*")
      .single();
    setAddingMethod(false);
    if (error) {
      showToast("error", error.message);
      return;
    }
    setMethods((prev) => [...prev, data as PaymentMethodRow]);
    setNewMethod("");
    showToast("success", `${spec.label} enabled.`);
    logAudit({
      action: "create",
      entity: "payment_method",
      entity_id: (data as PaymentMethodRow).id,
      description: `Payment method enabled: ${spec.label}`,
    });
  }

  async function togglePaymentMethod(row: PaymentMethodRow) {
    const next = !row.is_active;
    setMethodBusy(row.id);
    const { error } = await supabase.from("payment_methods").update({ is_active: next }).eq("id", row.id);
    setMethodBusy(null);
    if (error) {
      showToast("error", error.message);
      return;
    }
    setMethods((prev) => prev.map((x) => (x.id === row.id ? { ...x, is_active: next } : x)));
    showToast("success", next ? `${row.label} enabled at the till.` : `${row.label} disabled at the till.`);
    logAudit({
      action: next ? "activate" : "deactivate",
      entity: "payment_method",
      entity_id: row.id,
      description: `${row.label} ${next ? "enabled" : "disabled"} at the till`,
    });
  }

  async function saveMethodLabel(row: PaymentMethodRow) {
    const label = editingLabel.trim();
    if (!label) {
      setEditingMethod(null);
      return;
    }
    const { error } = await supabase.from("payment_methods").update({ label }).eq("id", row.id);
    if (error) {
      showToast("error", error.message);
      return;
    }
    setMethods((prev) => prev.map((x) => (x.id === row.id ? { ...x, label } : x)));
    setEditingMethod(null);
    showToast("success", "Payment method renamed.");
    logAudit({
      action: "update",
      entity: "payment_method",
      entity_id: row.id,
      description: `Payment method renamed to ${label}`,
    });
  }

  async function movePaymentMethod(row: PaymentMethodRow, dir: -1 | 1) {
    const sorted = [...methods].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((x) => x.id === row.id);
    const swapWith = sorted[idx + dir];
    if (!swapWith) return;
    setMethodBusy(row.id);
    const { error } = await supabase.from("payment_methods").upsert([
      { id: row.id, sort_order: swapWith.sort_order },
      { id: swapWith.id, sort_order: row.sort_order },
    ]);
    setMethodBusy(null);
    if (error) {
      showToast("error", error.message);
      return;
    }
    setMethods((prev) =>
      prev.map((x) =>
        x.id === row.id
          ? { ...x, sort_order: swapWith.sort_order }
          : x.id === swapWith.id
            ? { ...x, sort_order: row.sort_order }
            : x
      )
    );
  }

  function startEditLabel(row: PaymentMethodRow) {
    setEditingMethod(row.id);
    setEditingLabel(row.label);
  }

  async function requestDeleteMethod(row: PaymentMethodRow) {
    const [{ count: p }, { data: qs }] = await Promise.all([
      supabase.from("payments").select("id", { count: "exact", head: true }).eq("method", row.method),
      supabase.from("quick_sales").select("id").contains("payments", [{ method: row.method }]),
    ]);
    const referenced = (p ?? 0) > 0 || (qs?.length ?? 0) > 0;
    setMethodDel({ row, referenced });
  }

  async function confirmDeleteMethod(row: PaymentMethodRow) {
    const { error } = await supabase.from("payment_methods").delete().eq("id", row.id);
    if (error) {
      showToast("error", error.message);
      return;
    }
    setMethods((prev) => prev.filter((x) => x.id !== row.id));
    setMethodDel(null);
    showToast("success", `${row.label} removed.`);
    logAudit({
      action: "delete",
      entity: "payment_method",
      entity_id: row.id,
      description: `Payment method removed: ${row.label}`,
    });
  }

  function disableReferencedMethod() {
    const del = methodDel;
    if (!del) return;
    togglePaymentMethod(del.row);
    setMethodDel(null);
  }

  return (
    <div className={active ? "mt-6" : "hidden"}>
      <SettingsSection
        icon={SECTION_ICON}
        tone="cyan"
        title="Payment Methods"
        desc="These are the methods POS and Quick Sale offer at the till. Disabled methods are hidden; reorder to set their order."
      >
        <div className="space-y-2">
          {sortedMethods.map((row, idx) => (
            <div key={row.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
              <span
                className={`rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${METHOD_STYLE[row.method] ?? "bg-slate-100 text-slate-600 ring-slate-200"} ${
                  row.is_active ? "" : "opacity-50"
                }`}
              >
                {row.method}
              </span>
              {editingMethod === row.id ? (
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <input
                    autoFocus
                    value={editingLabel}
                    onChange={(e) => setEditingLabel(e.target.value)}
                    className={inputClass + " min-w-0 flex-1"}
                  />
                  <button
                    type="button"
                    onClick={() => saveMethodLabel(row)}
                    className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingMethod(null)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <span className={`min-w-0 flex-1 truncate text-sm font-medium ${row.is_active ? "text-slate-900" : "text-slate-400 line-through"}`}>
                  {row.label}
                </span>
              )}
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  disabled={idx <= 0 || methodBusy === row.id}
                  onClick={() => movePaymentMethod(row, -1)}
                  className="rounded-md p-1 text-slate-400 transition hover:bg-white hover:text-slate-700 disabled:opacity-30"
                  title="Move up"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d="m18 15-6-6-6 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  disabled={idx >= sortedMethods.length - 1 || methodBusy === row.id}
                  onClick={() => movePaymentMethod(row, 1)}
                  className="rounded-md p-1 text-slate-400 transition hover:bg-white hover:text-slate-700 disabled:opacity-30"
                  title="Move down"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => startEditLabel(row)}
                  className="rounded-md p-1 text-slate-400 transition hover:bg-white hover:text-slate-700"
                  title="Rename"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => requestDeleteMethod(row)}
                  className="rounded-md p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                  title="Remove"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6m4-6v6" />
                  </svg>
                </button>
              </div>
              <button
                type="button"
                onClick={() => togglePaymentMethod(row)}
                disabled={methodBusy === row.id}
                className={`relative h-5 w-9 shrink-0 rounded-full transition ${
                  row.is_active ? "bg-emerald-500" : "bg-slate-300"
                } disabled:opacity-50`}
                title={row.is_active ? "Disable at the till" : "Enable at the till"}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
                    row.is_active ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select
            value={newMethod}
            onChange={(e) => setNewMethod(e.target.value)}
            className={inputClass + " min-w-[220px] flex-1"}
          >
            <option value="">Choose a method to enable…</option>
            {availableMethods.map((m) => (
              <option key={m.method} value={m.method}>
                {m.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addPaymentMethod}
            disabled={addingMethod || !newMethod || availableMethods.length === 0}
            className="rounded-lg bg-cyan-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {addingMethod ? "Adding…" : "Enable method"}
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Disabling hides the method from the till. There is no hard delete — methods are archived by
          switching them off, keeping past sales intact.
        </p>
      </SettingsSection>

      <ConfirmDeleteModal
        state={methodDel}
        kind="method"
        onCancel={() => setMethodDel(null)}
        onConfirm={() => methodDel && confirmDeleteMethod(methodDel.row)}
        onDisable={disableReferencedMethod}
      />

      {toastView}
    </div>
  );
}