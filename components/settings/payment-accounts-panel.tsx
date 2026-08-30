"use client";

import { useCallback, useEffect, useState } from "react";
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
  credit_limit: "",
  used_limit: "0",
  bank_name: "",
  account_number: "",
  ifsc: "",
  upi_id: "",
  linked: "",
  card_last4: "",
  notes: "",
};

const INST_POOL: Record<string, string> = {
  cash: "cash",
  bank: "bank",
  upi: "upi_qr",
  wallet: "wallet",
  aeps_portal: "aeps",
  dmt_portal: "dmt",
  credit_card: "credit_card",
  debit_card: "debit_card",
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

  useEffect(() => {
    setInstruments(initialInstruments);
  }, [initialInstruments]);

  // Maps instrument type → pool key used by get_pool_balances RPC
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

  const refreshLiveBalances = useCallback(async () => {
    // Fetch instruments, pool balances (includes day-close seeds + ALL sources),
    // and per-instrument tagged cash_entries (fallback for multi-account pools)
    const [{ data: insts }, poolResult, { data: ces }] = await Promise.all([
      supabase.from("payment_instruments").select("*").order("type").order("name"),
      supabase.rpc("get_pool_balances"),
      supabase.from("cash_entries").select("instrument_id, direction, amount").not("instrument_id", "is", null),
    ]);

    if (!insts) return;

    // Parse pool balances from RPC (includes opening seeds + day-close + all movements)
    const pool = (poolResult.data ?? {}) as Record<string, { opening: number; movements: number; current: number }>;

    // Count active instruments per type
    const countPerType: Record<string, number> = {};
    for (const i of insts as InstrumentRow[]) {
      if (i.is_active) countPerType[i.type] = (countPerType[i.type] ?? 0) + 1;
    }

    // Build instrument-tagged cash_entries map (fallback for multi-account pools)
    const balMap: Record<string, number> = {};
    for (const e of (ces ?? []) as { instrument_id: string | null; direction: string; amount: number | string }[]) {
      if (!e.instrument_id) continue;
      const delta = e.direction === "out" ? -Number(e.amount) : Number(e.amount);
      balMap[e.instrument_id] = (balMap[e.instrument_id] ?? 0) + delta;
    }

    const updated = (insts as InstrumentRow[]).map((i) => {
      const poolKey = POOL_MAP[i.type];
      const poolEntry = poolKey ? pool[poolKey] : undefined;

      // 1. Linked Debit Card: reflects linked bank account
      if (i.type === "debit_card") {
        const bankEntry = pool["bank"];
        return {
          ...i,
          balance: bankEntry ? (bankEntry.current ?? bankEntry.opening + bankEntry.movements) : Number(i.opening_balance ?? 0),
          opening_balance: bankEntry?.opening ?? Number(i.opening_balance ?? 0),
        };
      }

      // 2. Credit Card: reflects available credit limit
      if (i.type === "credit_card") {
        const creditEntry = pool["credit_card"];
        return {
          ...i,
          balance: creditEntry ? (creditEntry.current ?? creditEntry.opening + creditEntry.movements) : (Number(i.opening_balance ?? 0) + (balMap[i.id] ?? 0)),
        };
      }

      // 3. Single active account for its type: authoritative pool balance
      if (poolEntry && (countPerType[i.type] ?? 0) <= 1) {
        return {
          ...i,
          opening_balance: poolEntry.opening,
          balance: poolEntry.current ?? poolEntry.opening + poolEntry.movements,
        };
      }

      // 4. Multi-account pool: individual opening + tagged cash_entries
      return {
        ...i,
        balance: Number(i.opening_balance ?? 0) + (balMap[i.id] ?? 0),
      };
    });
    setInstruments(updated);
  }, [supabase]);

  useEffect(() => {
    const channel = supabase
      .channel("payment-accounts-live-" + Math.random().toString(36).slice(2))
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_entries" }, refreshLiveBalances)
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_instruments" }, refreshLiveBalances)
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, refreshLiveBalances)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, refreshLiveBalances)
      .on("postgres_changes", { event: "*", schema: "public", table: "settlements" }, refreshLiveBalances)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, refreshLiveBalances]);

  function updateForm(patch: Partial<InstForm>) {
    setInstForm((prev) => ({ ...prev, ...patch }));
  }

  async function toggleInstrument(row: InstrumentRow) {
    const next = !row.is_active;
    // DEACTIVATION GUARD: Block deactivation if account holds a non-zero balance!
    if (!next && Math.abs(Number(row.balance || 0)) > 0.001) {
      showToast(
        "error",
        `Cannot deactivate "${row.name}" because it has an active balance of ${inr(row.balance ?? 0)}. Transfer or settle funds to ₹0.00 first.`
      );
      return;
    }

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
      credit_limit: d.credit_limit ? String(d.credit_limit) : "",
      used_limit: d.used_limit ? String(d.used_limit) : "0",
      bank_name: d.bank_name ?? "",
      account_number: d.account_number ?? "",
      ifsc: d.ifsc ?? "",
      upi_id: d.upi_id ?? "",
      linked: d.linked ?? "",
      card_last4: d.card_last4 ?? "",
      portal_code: d.portal_code ?? "",
      agent_code: d.agent_code ?? "",
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
    } else if (type === "debit_card") {
      details.card_last4 = instForm.card_last4.trim().replace(/\D/g, "").slice(-4);
      details.bank_name = instForm.bank_name.trim();
    } else if (type === "credit_card") {
      const fullLimit = Number(instForm.credit_limit) || 0;
      const usedLimit = Number(instForm.used_limit) || 0;
      details.credit_limit = String(fullLimit);
      details.used_limit = String(usedLimit);
      details.card_last4 = instForm.card_last4.trim().replace(/\D/g, "").slice(-4);
      details.bank_name = instForm.bank_name.trim();
    } else if (type === "aeps_portal") {
      details.portal_code = (instForm.portal_code ?? "").trim();
    } else if (type === "dmt_portal") {
      details.agent_code = (instForm.agent_code ?? "").trim();
    }
    details.notes = instForm.notes.trim();

    // Calculated opening balance (even ₹0.00 is a valid explicit seed)
    const openingBal =
      type === "credit_card"
        ? Math.max(0, (Number(instForm.credit_limit) || 0) - (Number(instForm.used_limit) || 0))
        : Number(instForm.opening_balance) || 0;

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
          opening_balance: openingBal,
          is_active: true,
        })
        .select("*")
        .single();
      if (error) {
        setAddingInst(false);
        showToast("error", error.message);
        return;
      }
      const row = data as InstrumentRow;
      setInstruments((prev) => [...prev, row]);
      const pool = INST_POOL[type];
      
      // Mandatory atomic opening snapshot recording (record even if openingBal is 0)
      if (pool) {
        const { error: seedErr } = await supabase.rpc("set_opening_balance", {
          p_pool: pool,
          p_amount: openingBal,
          p_as_of: new Date().toISOString().slice(0, 10),
          p_instrument_id: row.id,
          p_remarks: `Opening available balance for ${name}`,
        });
        if (seedErr) {
          showToast("error", `${name} added, but its opening balance was not seeded (${seedErr.message}).`);
        }
      }
      showToast("success", `Payment account "${name}" created and initialized.`);
      logAudit({
        action: "create",
        entity: "payment_instrument",
        entity_id: row.id,
        description: `Payment account added: ${name} (${type}), opening balance ${openingBal} seeded to ${pool}`,
      });
      setAddingInst(false);
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
    if (row.type === "debit_card") {
      const parts: string[] = [];
      if (d.bank_name) parts.push(d.bank_name);
      if (d.card_last4) parts.push("•••• " + d.card_last4);
      return parts.join(" · ") || "Debit Card";
    }
    if (row.type === "credit_card") {
      const parts: string[] = [];
      if (d.bank_name) parts.push(d.bank_name);
      if (d.card_last4) parts.push("•••• " + d.card_last4);
      if (d.credit_limit) parts.push("Limit " + inr(Number(d.credit_limit)));
      return parts.join(" · ") || "Credit Card";
    }
    if (row.type === "aeps_portal") {
      const parts: string[] = [];
      if (d.portal_code) parts.push("Portal: " + d.portal_code);
      if (d.notes) parts.push(d.notes);
      return parts.join(" · ") || "AEPS Provider Float";
    }
    if (row.type === "dmt_portal") {
      const parts: string[] = [];
      if (d.agent_code) parts.push("Agent: " + d.agent_code);
      if (d.notes) parts.push(d.notes);
      return parts.join(" · ") || "DMT Remittance Float";
    }
    return d.notes || "—";
  }

  return (
    <div className={active ? "mt-6" : "hidden"}>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between dark:border-white/5">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Payment Accounts</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Manage cash drawers, bank accounts, UPI handles, and credit cards with live credit limit tracking.
            </p>
          </div>
          <button
            type="button"
            onClick={openInstCreate}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 hover:brightness-110"
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
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:border-white/5 dark:bg-white/5">
                <th className="px-5 py-2.5">Type</th>
                <th className="px-4 py-2.5">Account name</th>
                <th className="px-4 py-2.5">Details</th>
                <th className="px-4 py-2.5 text-right">Balance / Limits</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {instruments.map((row) => {
                const label = INSTRUMENT_TYPES.find((t) => t.value === row.type)?.label ?? row.type;
                const totalLimit = Number(row.details?.credit_limit || 0);
                const currentBal = Number(row.balance) || 0;
                const usedLimit = totalLimit > 0 ? Math.max(0, totalLimit - currentBal) : 0;
                const usedPercent = totalLimit > 0 ? Math.min(100, Math.round((usedLimit / totalLimit) * 100)) : 0;

                return (
                  <tr key={row.id} className={`border-b border-slate-50 dark:border-white/5 ${row.is_active ? "" : "bg-slate-50/50 dark:bg-white/5"}`}>
                    <td className="px-5 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${TYPE_STYLE[row.type]}`}>{label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${row.is_active ? "text-slate-900 dark:text-white" : "text-slate-400 line-through"}`}>{row.name}</span>
                    </td>
                    <td className="max-w-[240px] truncate px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{instSummary(row)}</td>
                    <td className="px-4 py-3 text-right">
                      {row.type === "credit_card" && totalLimit > 0 ? (
                        <div className="space-y-1">
                          <div className="font-bold text-emerald-600 dark:text-emerald-400">
                            {inr(currentBal)} <span className="text-[10px] font-normal uppercase text-slate-400">Available</span>
                          </div>
                          <div className="flex items-center justify-end gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <span>Used: <strong className="text-rose-600 dark:text-rose-400">{inr(usedLimit)}</strong> / {inr(totalLimit)}</span>
                          </div>
                          <div className="h-1.5 w-28 ml-auto overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div
                              className={`h-full transition-all ${
                                usedPercent > 85 ? "bg-rose-500" : usedPercent > 50 ? "bg-amber-500" : "bg-emerald-500"
                              }`}
                              style={{ width: `${usedPercent}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{inr(currentBal)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${row.is_active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-400"}`}>
                        {row.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openInstEdit(row)}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
                          title="Edit account"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                            <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => requestDeleteInstrument(row)}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                          title="Delete account"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                            <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6m4-6v6" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleInstrument(row)}
                          className={`relative ml-1 h-5 w-9 shrink-0 rounded-full transition ${row.is_active ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"}`}
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
                    No payment accounts yet — add your cash, bank, credit card, UPI and wallet accounts above.
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
          subtitle="Accounts appear in POS, Invoices, Expenses, and Settlements with live balance/limit tracking."
          icon="M3 9a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9ZM3 14h6m0 0 2-2m-2 2 2 2"
          accent="emerald"
          size="lg"
          footer={
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setInstModal(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={saveInstrument}
                disabled={addingInst || !instForm.name.trim()}
                className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {addingInst ? "Saving…" : "Save Changes"}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Account Name *</label>
              <input
                autoFocus
                value={instForm.name}
                onChange={(e) => updateForm({ name: e.target.value })}
                placeholder="e.g. HDFC Regalia Credit Card, ICICI Coral, Main Cash Drawer"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Account Type</label>
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

              {/* For standard accounts (non-credit-card) */}
              {instForm.type !== "credit_card" && (
                <div>
                  {instModal.mode === "create" ? (
                    <div>
                      <label className={labelClass}>Opening Balance (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={instForm.opening_balance}
                        onChange={(e) => updateForm({ opening_balance: e.target.value })}
                        className={inputClass}
                      />
                      <p className="mt-1 text-[11px] text-slate-400">
                        Seeds the {INSTRUMENT_TYPES.find((t) => t.value === instForm.type)?.label ?? instForm.type} pool opening balance.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className={labelClass}>Current Balance</label>
                      <div className={`${inputClass} flex items-center bg-slate-50 font-semibold text-slate-700 dark:bg-white/5 dark:text-white`}>
                        {inr(Number(instModal.row?.balance) || 0)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Credit Card Specific Full Limit & Used Limit Section */}
            {instForm.type === "credit_card" && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4 dark:border-rose-900/30 dark:bg-rose-950/20">
                <div className="flex items-center gap-2 mb-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-600 text-white shadow-sm">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                      <rect x="2" y="5" width="20" height="14" rx="2" />
                      <line x1="2" y1="10" x2="22" y2="10" />
                    </svg>
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-900 dark:text-rose-300">
                    Credit Card Limit Management
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Full Credit Limit (₹) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={instForm.credit_limit}
                      onChange={(e) => updateForm({ credit_limit: e.target.value })}
                      placeholder="e.g. 100000"
                      className={inputClass}
                    />
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Total approved limit on this card.</p>
                  </div>
                  <div>
                    <label className={labelClass}>Currently Used / Outstanding Limit (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={instForm.used_limit}
                      onChange={(e) => updateForm({ used_limit: e.target.value })}
                      placeholder="0.00"
                      className={inputClass}
                    />
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Initial outstanding balance already spent.</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between rounded-xl bg-white p-3 shadow-sm dark:bg-slate-900 border border-rose-100 dark:border-white/5">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Calculated Available Credit Limit:</span>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    {inr(Math.max(0, (Number(instForm.credit_limit) || 0) - (Number(instForm.used_limit) || 0)))}
                  </span>
                </div>
              </div>
            )}

            {instForm.type === "bank" && (
              <>
                <div>
                  <label className={labelClass}>Bank Name</label>
                  <input value={instForm.bank_name} onChange={(e) => updateForm({ bank_name: e.target.value })} placeholder="e.g. HDFC Bank, SBI" className={inputClass} />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Account Number / Reference</label>
                    <input value={instForm.account_number} onChange={(e) => updateForm({ account_number: e.target.value })} placeholder="Account number" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>IFSC Code</label>
                    <input value={instForm.ifsc} onChange={(e) => updateForm({ ifsc: e.target.value })} placeholder="HDFC0001234" className={inputClass} />
                  </div>
                </div>
              </>
            )}

            {instForm.type === "upi" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>UPI ID / VPA</label>
                  <input value={instForm.upi_id} onChange={(e) => updateForm({ upi_id: e.target.value })} placeholder="shop@okhdfcbank" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Linked QR / Remarks</label>
                  <input value={instForm.linked} onChange={(e) => updateForm({ linked: e.target.value })} placeholder="e.g. Counter QR Stand" className={inputClass} />
                </div>
              </div>
            )}

            {(instForm.type === "debit_card" || instForm.type === "credit_card") && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Card Issuer / Bank Name</label>
                  <input
                    value={instForm.bank_name}
                    onChange={(e) => updateForm({ bank_name: e.target.value })}
                    placeholder="e.g. HDFC, Axis, SBI, ICICI"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Card Number (Last 4 Digits)</label>
                  <input
                    value={instForm.card_last4}
                    onChange={(e) => updateForm({ card_last4: e.target.value })}
                    maxLength={4}
                    placeholder="1234"
                    className={`${inputClass} font-mono`}
                  />
                </div>
              </div>
            )}

            {instForm.type === "aeps_portal" && (
              <div>
                <label className={labelClass}>Portal Code / Identifier</label>
                <input
                  value={instForm.portal_code ?? ""}
                  onChange={(e) => updateForm({ portal_code: e.target.value })}
                  placeholder="e.g. DIGIPAY, EZEEPAY, SPICEMONEY"
                  className={inputClass}
                />
              </div>
            )}

            {instForm.type === "dmt_portal" && (
              <div>
                <label className={labelClass}>Agent Code / DMT Provider ID</label>
                <input
                  value={instForm.agent_code ?? ""}
                  onChange={(e) => updateForm({ agent_code: e.target.value })}
                  placeholder="e.g. DMT-DIGIPAY-01, EZEEPAY-DMT"
                  className={inputClass}
                />
              </div>
            )}

            <div>
              <label className={labelClass}>Notes &amp; Description</label>
              <textarea
                value={instForm.notes}
                onChange={(e) => updateForm({ notes: e.target.value })}
                placeholder="e.g. Account details, usage guidelines, or branch notes."
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