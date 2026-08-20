"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import { useToast } from "@/components/ui/use-toast";
import Modal from "@/components/ui/modal";
import ConfirmDeleteModal from "@/components/settings/confirm-dialog";
import {
  type InstrumentRow,
  type InstForm,
  INSTRUMENT_TYPES,
  TYPE_STYLE,
  inputClass,
  labelClass,
} from "@/components/settings/settings-config";

const EMPTY_FORM: InstForm = {
  name: "",
  type: "bank",
  opening_balance: "0",
  bank_name: "",
  account_number: "",
  ifsc: "",
  upi_id: "",
  linked: "",
  card_last4: "",
  notes: "",
};

const ADD_ICON = "M12 5v14M5 12h14";

export default function PaymentAccountsPanel({
  initialInstruments,
  active,
}: {
  initialInstruments: InstrumentRow[];
  active: boolean;
}) {
  const supabase = createClient();
  const { showToast, toastView } = useToast();
  const [instruments, setInstruments] = useState<InstrumentRow[]>(initialInstruments);
  const [addingInst, setAddingInst] = useState(false);
  const [instModal, setInstModal] = useState<{ mode: "create" | "edit"; row: InstrumentRow | null } | null>(null);
  const [instForm, setInstForm] = useState<InstForm>(EMPTY_FORM);
  const [deleteInst, setDeleteInst] = useState<{ row: InstrumentRow; referenced: boolean } | null>(null);

  function updateForm(patch: Partial<InstForm>) {
    setInstForm((prev) => ({ ...prev, ...patch }));
  }

  async function toggleInstrument(row: InstrumentRow) {
    const next = !row.is_active;
    const { error } = await supabase.from("payment_instruments").update({ is_active: next }).eq("id", row.id);
    if (error) {
      showToast("error", error.message);
      return;
    }
    setInstruments((prev) => prev.map((x) => (x.id === row.id ? { ...x, is_active: next } : x)));
    showToast("success", next ? `${row.name} activated.` : `${row.name} deactivated.`);
    logAudit({
      action: next ? "activate" : "deactivate",
      entity: "payment_instrument",
      entity_id: row.id,
      description: `${row.name} ${next ? "activated" : "deactivated"}`,
    });
  }

  function openInstCreate() {
    setInstForm(EMPTY_FORM);
    setInstModal({ mode: "create", row: null });
  }

  function openInstEdit(row: InstrumentRow) {
    const d = row.details ?? {};
    setInstForm({
      name: row.name,
      type: row.type,
      opening_balance: String(Number(row.opening_balance ?? 0)),
      bank_name: d.bank_name ?? "",
      account_number: d.account_number ?? "",
      ifsc: d.ifsc ?? "",
      upi_id: d.upi_id ?? "",
      linked: d.linked ?? "",
      card_last4: d.card_last4 ?? "",
      notes: d.notes ?? "",
    });
    setInstModal({ mode: "edit", row });
  }

  async function saveInstrument() {
    if (!instModal) return;
    const name = instForm.name.trim();
    if (!name) {
      showToast("error", "Account name is required.");
      return;
    }
    const type = instForm.type;
    const details: Record<string, string> = {};
    if (type === "bank") {
      details.bank_name = instForm.bank_name.trim();
      details.account_number = instForm.account_number.trim();
      details.ifsc = instForm.ifsc.trim();
    } else if (type === "upi") {
      details.upi_id = instForm.upi_id.trim();
      details.linked = instForm.linked.trim();
    } else if (type === "debit_card" || type === "credit_card") {
      details.card_last4 = instForm.card_last4.trim().replace(/\D/g, "").slice(-4);
    }
    details.notes = instForm.notes.trim();
    setAddingInst(true);
    if (instModal.mode === "edit" && instModal.row) {
      const { error } = await supabase
        .from("payment_instruments")
        .update({ name, type, details })
        .eq("id", instModal.row.id);
      setAddingInst(false);
      if (error) {
        showToast("error", error.message);
        return;
      }
      const prev = instModal.row;
      setInstruments((prevList) =>
        prevList.map((x) => (x.id === prev.id ? { ...x, name, type, details } : x))
      );
      showToast("success", "Payment account updated.");
      logAudit({
        action: "update",
        entity: "payment_instrument",
        entity_id: instModal.row.id,
        description: `Payment account updated: ${name}`,
      });
    } else {
      const { data, error } = await supabase
        .from("payment_instruments")
        .insert({
          name,
          type,
          details,
          opening_balance: Number(instForm.opening_balance) || 0,
        })
        .select("*")
        .single();
      setAddingInst(false);
      if (error) {
        showToast("error", error.message);
        return;
      }
      const row = data as InstrumentRow;
      setInstruments((prev) => [...prev, row]);
      showToast("success", `${name} added.`);
      logAudit({
        action: "create",
        entity: "payment_instrument",
        entity_id: row.id,
        description: `Payment account added: ${name} (${type})`,
      });
    }
    setInstModal(null);
  }

  async function requestDeleteInstrument(row: InstrumentRow) {
    const [{ count: p }, { count: c }, { data: qs }] = await Promise.all([
      supabase.from("payments").select("id", { count: "exact", head: true }).eq("instrument_id", row.id),
      supabase.from("cash_entries").select("id", { count: "exact", head: true }).eq("instrument_id", row.id),
      supabase.from("quick_sales").select("id").contains("payments", [{ instrument_id: row.id }]),
    ]);
    const referenced = (p ?? 0) > 0 || (c ?? 0) > 0 || (qs?.length ?? 0) > 0;
    setDeleteInst({ row, referenced });
  }

  async function confirmDeleteInstrument(row: InstrumentRow) {
    const { error } = await supabase.from("payment_instruments").delete().eq("id", row.id);
    if (error) {
      showToast("error", error.message);
      return;
    }
    setInstruments((prev) => prev.filter((x) => x.id !== row.id));
    setDeleteInst(null);
    showToast("success", `${row.name} deleted.`);
    logAudit({
      action: "delete",
      entity: "payment_instrument",
      entity_id: row.id,
      description: `Payment account deleted: ${row.name}`,
    });
  }

  function disableReferencedInstrument() {
    const del = deleteInst;
    if (!del) return;
    toggleInstrument(del.row);
    setDeleteInst(null);
  }

  function instSummary(row: InstrumentRow) {
    const d = row.details ?? {};
    if (row.type === "bank") {
      const parts: string[] = [];
      if (d.bank_name) parts.push(d.bank_name);
      if (d.account_number) parts.push("•••• " + String(d.account_number).replace(/\D/g, "").slice(-4));
      if (d.ifsc) parts.push("IFSC " + d.ifsc);
      return parts.join(" · ");
    }
    if (row.type === "upi") return d.upi_id || "";
    if (row.type === "debit_card" || row.type === "credit_card") return d.card_last4 ? "•••• " + d.card_last4 : "";
    return d.notes || "—";
  }

  return (
    <div className={active ? "mt-6" : "hidden"}>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Payment Accounts</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Manage the cash, bank, UPI, wallet and card accounts used at the till.
            </p>
          </div>
          <button
            type="button"
            onClick={openInstCreate}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-4 w-4">
              <path d={ADD_ICON} />
            </svg>
            Add Account
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2.5">Type</th>
                <th className="px-4 py-2.5">Account name</th>
                <th className="px-4 py-2.5">Details</th>
                <th className="px-4 py-2.5 text-right">Balance</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {instruments.map((row) => {
                const label = INSTRUMENT_TYPES.find((t) => t.value === row.type)?.label ?? row.type;
                return (
                  <tr key={row.id} className={`border-b border-slate-50 ${row.is_active ? "" : "bg-slate-50/50"}`}>
                    <td className="px-5 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${TYPE_STYLE[row.type]}`}>{label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${row.is_active ? "text-slate-900" : "text-slate-400 line-through"}`}>{row.name}</span>
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-xs text-slate-500">{instSummary(row)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{inr(Number(row.balance) || 0)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${row.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                        {row.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openInstEdit(row)}
                          className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                          title="Edit account"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                            <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => requestDeleteInstrument(row)}
                          className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                          title="Delete account"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                            <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6m4-6v6" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleInstrument(row)}
                          className={`relative ml-1 h-5 w-9 shrink-0 rounded-full transition ${row.is_active ? "bg-emerald-500" : "bg-slate-300"}`}
                          title={row.is_active ? "Disable account" : "Enable account"}
                        >
                          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${row.is_active ? "left-[18px]" : "left-0.5"}`} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {instruments.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-sm text-slate-400">
                    No payment accounts yet — add your bank, card, UPI and wallet names above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {instModal && (
        <Modal
          onClose={() => setInstModal(null)}
          as="div"
          title={instModal.mode === "create" ? "Add Payment Account" : "Edit Payment Account"}
          subtitle="Accounts appear in POS and Quick Sale as payment destinations."
          icon="M3 9a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9ZM3 14h6m0 0 2-2m-2 2 2 2"
          accent="emerald"
          size="lg"
          footer={
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setInstModal(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={saveInstrument}
                disabled={addingInst || !instForm.name.trim()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {addingInst ? "Saving…" : "Save Changes"}
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            <div>
              <label className={labelClass}>Account name *</label>
              <input
                autoFocus
                value={instForm.name}
                onChange={(e) => updateForm({ name: e.target.value })}
                placeholder="e.g. Cash in Hand, PhonePe, HDFC Savings"
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Account type</label>
                <select
                  value={instForm.type}
                  onChange={(e) => updateForm({ type: e.target.value as InstrumentRow["type"] })}
                  className={inputClass}
                >
                  {INSTRUMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              {instModal.mode === "create" ? (
                <div>
                  <label className={labelClass}>Opening balance (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={instForm.opening_balance}
                    onChange={(e) => updateForm({ opening_balance: e.target.value })}
                    className={inputClass}
                  />
                </div>
              ) : (
                <div>
                  <label className={labelClass}>Current balance</label>
                  <div className={`${inputClass} flex items-center bg-slate-50 font-semibold text-slate-700`}>
                    {inr(Number(instModal.row?.balance) || 0)}
                  </div>
                </div>
              )}
            </div>

            {instForm.type === "bank" && (
              <>
                <div>
                  <label className={labelClass}>Bank name</label>
                  <input value={instForm.bank_name} onChange={(e) => updateForm({ bank_name: e.target.value })} placeholder="e.g. HDFC Bank" className={inputClass} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Account number / reference</label>
                    <input value={instForm.account_number} onChange={(e) => updateForm({ account_number: e.target.value })} placeholder="Only last 4 shown in list" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>IFSC</label>
                    <input value={instForm.ifsc} onChange={(e) => updateForm({ ifsc: e.target.value })} placeholder="HDFC0001234" className={inputClass} />
                  </div>
                </div>
              </>
            )}

            {instForm.type === "upi" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>UPI ID</label>
                  <input value={instForm.upi_id} onChange={(e) => updateForm({ upi_id: e.target.value })} placeholder="shop@okhdfcbank" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Linked / remarks</label>
                  <input value={instForm.linked} onChange={(e) => updateForm({ linked: e.target.value })} placeholder="e.g. Merchant QR" className={inputClass} />
                </div>
              </div>
            )}

            {(instForm.type === "debit_card" || instForm.type === "credit_card") && (
              <div>
                <label className={labelClass}>Card number (last 4 digits only)</label>
                <input
                  value={instForm.card_last4}
                  onChange={(e) => updateForm({ card_last4: e.target.value })}
                  maxLength={4}
                  placeholder="1234"
                  className={inputClass}
                />
                <p className="mt-1 text-[11px] text-slate-400">Full card numbers are never stored.</p>
              </div>
            )}

            <div>
              <label className={labelClass}>Notes</label>
              <textarea
                value={instForm.notes}
                onChange={(e) => updateForm({ notes: e.target.value })}
                placeholder="e.g. Main cash drawer at the counter"
                rows={2}
                className={inputClass}
              />
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDeleteModal
        state={deleteInst}
        kind="account"
        onCancel={() => setDeleteInst(null)}
        onConfirm={() => deleteInst && confirmDeleteInstrument(deleteInst.row)}
        onDisable={disableReferencedInstrument}
      />

      {toastView}
    </div>
  );
}