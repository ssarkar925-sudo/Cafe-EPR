"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import SearchableSelect from "@/components/ui/searchable-select";
import Modal from "@/components/ui/modal";
import ScanFillModal from "@/components/scan-fill/scan-fill-modal";
import type { ScanFields } from "@/lib/scan/extract";
import type { CustomerRow, Master, Txn } from "./business-client";

function toLocalInput(value: string) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function BusinessFormModal({
  service,
  label,
  customers,
  banks,
  portals,
  qrs,
  rechargeProviders = [],
  rechargeSlabs = [],
  txns,
  initial,
  onClose,
  onSave,
}: {
  service: string;
  label: string;
  customers: CustomerRow[];
  banks: Master[];
  portals: Master[];
  qrs: Master[];
  rechargeProviders?: Master[];
  rechargeSlabs?: { provider_id: string; min_amount: number | string; max_amount: number | string; commission_percent: number | string }[];
  txns: Txn[];
  initial?: Txn;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  const supabase = createClient();
  const [form, setForm] = useState(() => ({
    transaction_timestamp: initial?.transaction_timestamp
      ? toLocalInput(initial.transaction_timestamp)
      : initial
        ? `${initial.transaction_date}T00:00`
        : toLocalInput(new Date().toISOString()),
    customer_id: initial?.customer_id ?? "",
    customer_mobile: initial?.customer_mobile ?? "",
    bank_id: initial?.bank_id ?? "",
    portal_id: initial?.portal_id ?? "",
    provider_id: initial?.provider_id ?? "",
    merchant_qr_id: initial?.merchant_qr_id ?? "",
    aadhaar_last4: initial?.aadhaar_last4 ?? "",
    transfer_method: initial?.transfer_method ?? "bank_account",
    sender_name: initial?.sender_name ?? "",
    sender_mobile: initial?.sender_mobile ?? "",
    beneficiary_name: initial?.beneficiary_name ?? "",
    beneficiary_mobile: initial?.beneficiary_mobile ?? "",
    beneficiary_bank: initial?.beneficiary_bank ?? "",
    beneficiary_ifsc: initial?.beneficiary_ifsc ?? "",
    beneficiary_account: initial?.beneficiary_account ?? "",
    upi_id: initial?.upi_id ?? "",
    amount: initial ? String(initial.amount) : "",
    service_fee: initial ? String(initial.service_fee) : "",
    portal_commission: initial ? String(initial.portal_commission) : "",
    reference: initial?.reference ?? "",
    status: initial?.status ?? "success",
    remarks: initial?.remarks ?? "",
    fee_source: initial?.fee_source ?? "cut_from_withdrawal",
    paid_from: initial?.paid_from ?? "bank",
    customer_pay_method: initial?.customer_pay_method ?? "cash",
  }));
  const [error, setError] = useState("");
  const [scanOpen, setScanOpen] = useState(false);

  const selectedCustomer = customers.find((c) => c.id === form.customer_id);

  useEffect(() => {
    if (selectedCustomer?.phone && !initial) {
      setForm((f) => ({ ...f, customer_mobile: selectedCustomer.phone ?? "" }));
    }
  }, [form.customer_id, selectedCustomer, initial]);

  const customerStats = useMemo(() => {
    if (!form.customer_id) return null;
    const rows = txns.filter((t) => t.customer_id === form.customer_id && t.status === "success");
    if (service === "dmt") {
      const transferred = rows.reduce((s, t) => s + Number(t.amount), 0);
      const net = rows.reduce((s, t) => s + Number(t.service_fee) - Number(t.portal_commission), 0);
      const advance = Number(form.amount) - net;
      return {
        count: rows.length,
        primary: transferred,
        primaryLabel: "Transferred",
        secondary: net,
        secondaryLabel: "Net Income",
        advance,
      };
    }
    const fees = rows.reduce((s, t) => s + Number(t.service_fee), 0);
    return {
      count: rows.length,
      primary: fees,
      primaryLabel: "Customer Fees",
      secondary: 0,
      secondaryLabel: "",
      advance: 0,
    };
  }, [form.customer_id, form.amount, txns, service]);

  const commissionPreview = useMemo(() => {
    if (service !== "recharge" || !form.provider_id) return null;
    const amount = Number(form.amount);
    if (!amount || amount <= 0) return null;
    const slab = rechargeSlabs
      .filter((s) => s.provider_id === form.provider_id && amount >= Number(s.min_amount) && amount <= Number(s.max_amount))
      .sort((a, b) => Number(a.min_amount) - Number(b.min_amount))[0];
    if (!slab) return { missing: true as const };
    const commission = Math.round(amount * Number(slab.commission_percent)) / 100;
    return {
      missing: false as const,
      percent: Number(slab.commission_percent),
      commission,
      cost: amount - commission,
    };
  }, [service, form.provider_id, form.amount, rechargeSlabs]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function applyScanned(f: ScanFields) {
    const updates: Partial<typeof form> = {};
    if (f.amount) updates.amount = f.amount;
    if (f.reference) updates.reference = f.reference;
    if (f.aadhaar_last4) updates.aadhaar_last4 = f.aadhaar_last4;
    if (f.customer_mobile) updates.customer_mobile = f.customer_mobile;
    if (f.sender_name) updates.sender_name = f.sender_name;
    if (f.sender_mobile) updates.sender_mobile = f.sender_mobile;
    if (f.beneficiary_name) updates.beneficiary_name = f.beneficiary_name;
    if (f.beneficiary_bank) updates.beneficiary_bank = f.beneficiary_bank;
    if (f.beneficiary_ifsc) updates.beneficiary_ifsc = f.beneficiary_ifsc;
    if (f.beneficiary_account) updates.beneficiary_account = f.beneficiary_account;
    if (f.upi_id) updates.upi_id = f.upi_id;
    if (f.service_fee) updates.service_fee = f.service_fee;
    if (f.portal_commission) updates.portal_commission = f.portal_commission;
    if (f.status) updates.status = f.status;
    if (f.bank_name) {
      const q = f.bank_name.toLowerCase();
      const b = banks.find(
        (x) => x.name && (x.name.toLowerCase().includes(q) || q.includes(x.name.toLowerCase()))
      );
      if (b) updates.bank_id = b.id;
    }
    if (f.portal_name) {
      const q = f.portal_name.toLowerCase();
      const p = portals.find(
        (x) => x.name && (x.name.toLowerCase().includes(q) || q.includes(x.name.toLowerCase()))
      );
      if (p) updates.portal_id = p.id;
    }
    if (f.transaction_date) {
      const time = form.transaction_timestamp ? form.transaction_timestamp.slice(11) : "00:00";
      updates.transaction_timestamp = `${f.transaction_date}T${time}`;
    }
    setForm((prev) => ({ ...prev, ...updates }));
  }

  async function submit() {
    const amount = Number(form.amount);
    const fee = Number(form.service_fee || 0);
    const commission = Number(form.portal_commission || 0);

    if (!form.transaction_timestamp) return setError("Transaction date & time is required.");
    if (!amount || amount <= 0) return setError("Amount is required.");
    if (fee < 0) return setError("Fee cannot be negative.");
    if (commission < 0) return setError("Portal charge cannot be negative.");
    if (["aeps", "upi"].includes(service) && fee <= 0) return setError("Service fee is required.");

    if (service === "aeps") {
      if (!form.bank_id) return setError("Please choose the customer's bank.");
      if (!form.portal_id) return setError("Please choose the AEPS portal.");
      if (!/^\d{4}$/.test(form.aadhaar_last4)) return setError("Enter the last 4 digits of Aadhaar (4 digits).");
    }
    if (service === "dmt") {
      if (!form.sender_name.trim()) return setError("Sender name is required.");
      if (!form.reference.trim()) return setError("RRN / reference is required.");
    }
    if (service === "upi") {
      if (!form.merchant_qr_id) return setError("Please choose the merchant QR.");
    }
    if (form.customer_pay_method === "due") {
      if (!form.customer_id) {
        return setError("Please select a customer from the top dropdown to mark this transaction as Due (Credit).");
      }
      if (selectedCustomer && Number((selectedCustomer as any).credit_limit || 0) > 0) {
        const totalDueAfter = Number((selectedCustomer as any).balance || 0) + amount + fee;
        if (totalDueAfter > Number((selectedCustomer as any).credit_limit)) {
          const allow = window.confirm(
            `⚠️ Credit Limit Alert: Customer's total due will be ₹${totalDueAfter.toFixed(2)}, which exceeds their credit limit of ₹${Number((selectedCustomer as any).credit_limit)}. Proceed anyway?`
          );
          if (!allow) return;
        }
      }
    }

    if (service === "recharge") {
      if (!form.provider_id) return setError("Please choose the recharge provider.");
      if (!form.customer_mobile.trim()) return setError("Enter the recharge number (mobile number being recharged).");
      if (!commissionPreview || commissionPreview.missing) return setError("No commission slab covers this amount for this provider. Add a slab in Settings → Business Setup → Recharge Providers.");
    }

    // Zero-Click Automated Duplicate RRN / Reference Guard
    if (form.reference && form.reference.trim()) {
      const { data: dupTx } = await supabase
        .from("transactions")
        .select("id, transaction_number, transaction_date, amount, service_type")
        .eq("reference", form.reference.trim())
        .limit(1);

      if (dupTx && dupTx.length > 0 && (!initial || dupTx[0].id !== initial.id)) {
        const tx = dupTx[0];
        const proceed = window.confirm(
          `⚠️ Duplicate Reference / RRN Detected!\n\nReference "${form.reference.trim()}" is already used on ${tx.service_type.toUpperCase()} #${tx.transaction_number} on ${tx.transaction_date} (₹${tx.amount}).\n\nProceed and record anyway?`
        );
        if (!proceed) return;
      }
    }

    setError("");
    if (service === "recharge") {
      onSave({
        p_provider_id: form.provider_id,
        p_transaction_date: form.transaction_timestamp.slice(0, 10),
        p_transaction_timestamp: new Date(form.transaction_timestamp).toISOString(),
        p_customer_id: form.customer_id || null,
        p_customer_mobile: form.customer_mobile.trim() || null,
        p_reference: form.reference.trim() || null,
        p_remarks: form.remarks.trim() || null,
        p_status: form.status,
        p_amount: amount,
        p_customer_pay_method: form.customer_pay_method || "cash",
      });
      return;
    }
    onSave({
      p_service_type: service,
      p_transaction_date: form.transaction_timestamp.slice(0, 10),
      p_transaction_timestamp: new Date(form.transaction_timestamp).toISOString(),
      p_customer_id: form.customer_id || null,
      p_customer_mobile: form.customer_mobile.trim() || null,
      p_bank_id: form.bank_id || null,
      p_portal_id: form.portal_id || null,
      p_merchant_qr_id: form.merchant_qr_id || null,
      p_aadhaar_last4: form.aadhaar_last4 || null,
      p_transfer_method: form.transfer_method || null,
      p_sender_name: form.sender_name || null,
      p_sender_mobile: form.sender_mobile || null,
      p_beneficiary_name: form.beneficiary_name || null,
      p_beneficiary_mobile: form.beneficiary_mobile || null,
      p_beneficiary_bank: form.beneficiary_bank || null,
      p_beneficiary_ifsc: form.beneficiary_ifsc || null,
      p_beneficiary_account: form.beneficiary_account || null,
      p_upi_id: form.upi_id || null,
      p_amount: amount,
      p_service_fee: fee,
      p_portal_commission: commission,
      p_reference: form.reference.trim() || null,
      p_status: form.status,
      p_remarks: form.remarks.trim() || null,
      p_fee_source: service === "aeps" ? form.fee_source : null,
      p_paid_from: service === "dmt" ? form.paid_from : null,
      p_customer_pay_method: service === "dmt" || service === "upi" ? form.customer_pay_method : null,
    });
  }

  const input = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const labelCls = "mb-1 block text-xs font-semibold text-slate-500";

  return (
    <Modal
      onClose={onClose}
      title={initial ? `Edit ${label} Transaction` : `Record ${label} Transaction`}
      subtitle={`Numbered automatically: ${service === "aeps" ? "AEP-XXXX" : service === "dmt" ? "DMT-XXXX" : service === "upi" ? "UPI-XXXX" : "RCH-XXXX"}.`}
      icon={service === "aeps" ? "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 0v4M7 17a5 5 0 0 1 10 0" : service === "dmt" ? "M22 2 11 13M22 2 15 22l-4-9-9-4z" : service === "upi" ? "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-12-1 2 2 4-4" : "M13 2 3 14h7l-1 8 10-12h-7l1-8Z"}
      accent={service === "aeps" ? "amber" : service === "dmt" ? "violet" : service === "upi" ? "emerald" : "blue"}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={submit} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700">
            {initial ? "Save Changes" : "Save Transaction"}
          </button>
        </div>
      }
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-400">
          {service === "aeps" ? "AEPS" : service === "dmt" ? "DMT" : service === "upi" ? "UPI" : "Recharge"} transaction
        </p>
        {service !== "recharge" && (
        <button
          onClick={() => setScanOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M4 7V4h3M9 4h2M4 11v2M17 4h3v3M20 9v2M20 17v3h-3M15 20h-2M4 17v3h3M4 15v-2" />
          </svg>
          Scan &amp; Fill
        </button>
      )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Transaction Date & Time *</label>
            <input type="datetime-local" value={form.transaction_timestamp} onChange={(e) => set("transaction_timestamp", e.target.value)} className={input} />
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <SearchableSelect
            value={form.status}
            onChange={(v) => set("status", v)}
            options={[
              { value: "success", label: "Success — posts cash entry" },
              { value: "pending", label: "Pending" },
              { value: "failed", label: "Failed" },
            ]}
            searchPlaceholder="Search status…"
            showClear={false}
          />
          </div>

          <div className="sm:col-span-2">
            <label className={labelCls}>Customer</label>
            <SearchableSelect
            value={form.customer_id}
            onChange={(v) => set("customer_id", v)}
            options={[
              { value: "", label: "Walk-in / no saved customer" },
              ...customers.map((c) => ({
                value: c.id,
                label: `${c.name} (${c.code})${c.phone ? ` · ${c.phone}` : ""}`,
              })),
            ]}
            searchPlaceholder="Search customer by name, code or mobile…"
            showClear={false}
          />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Customer Mobile (optional)</label>
            <input
              type="tel"
              value={form.customer_mobile}
              onChange={(e) => set("customer_mobile", e.target.value)}
              placeholder="98XXXXXXXX"
              className={input}
            />
          </div>

          {customerStats && (
            <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800 sm:col-span-2">
              <p>
                {customerStats.count} successful {label} transactions · {customerStats.primaryLabel}: <b>{inr(customerStats.primary)}</b>
                {customerStats.secondaryLabel && <> · {customerStats.secondaryLabel}: <b>{inr(customerStats.secondary)}</b></>}
              </p>
              {service === "dmt" && (
                <p className="mt-0.5 text-blue-600">
                  Advance on this transfer: <b>{inr(customerStats.advance)}</b>{" "}
                  {customerStats.advance < 0 && "(more than earned income — verify)"}
                </p>
              )}
            </div>
          )}

          {service === "aeps" && (
            <>
              <div>
                <label className={labelCls}>Customer Bank *</label>
                <SearchableSelect
                  value={form.bank_id}
                  onChange={(v) => set("bank_id", v)}
                  options={[
                    { value: "", label: "Select bank" },
                    ...banks.filter((b) => b.name).map((b) => ({ value: b.id, label: b.name })),
                  ]}
                  searchPlaceholder="Search bank…"
                  showClear={false}
                />
              </div>
              <div>
                <label className={labelCls}>AEPS Portal *</label>
                <SearchableSelect
                  value={form.portal_id}
                  onChange={(v) => set("portal_id", v)}
                  options={[
                    { value: "", label: "Select portal" },
                    ...portals.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                  searchPlaceholder="Search portal…"
                  showClear={false}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Aadhaar (last 4 digits) *</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={form.aadhaar_last4}
                  onChange={(e) => set("aadhaar_last4", e.target.value.replace(/\D/g, ""))}
                  placeholder="XXXX"
                  className={input}
                />
                <p className="mt-0.5 text-[11px] text-slate-400">Only the last 4 digits are stored. Never full Aadhaar.</p>
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Fee Handling</label>
                <div className="flex gap-2">
                  {[
                    { value: "cut_from_withdrawal", label: "Cut from withdrawal" },
                    { value: "separate_cash", label: "Collect separately in cash" },
                    { value: "upi", label: "Collect via UPI" },
                  ].map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => set("fee_source", o.value)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                        form.fee_source === o.value
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-600"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {form.fee_source === "cut_from_withdrawal"
                    ? "Cash out = withdrawal minus fee. Example: ₹1,000 withdrawal with ₹10 fee → hand over ₹990."
                    : form.fee_source === "upi"
                      ? "Hand over the full withdrawal amount; the fee is collected separately to your UPI account."
                      : "Hand over the full amount and collect the fee as cash on top."}
                </p>
              </div>
            </>
          )}

          {service === "dmt" && (
            <>
              <div className="flex items-center gap-2 pt-1 sm:col-span-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Transfer Details</span>
                <div className="h-px flex-1 bg-slate-100" />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Transfer Method</label>
                <div className="flex gap-2">
                  {["bank_account", "upi"].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => set("transfer_method", m)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                        form.transfer_method === m
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-600"
                      }`}
                    >
                      {m === "upi" ? "UPI Transfer" : "Bank Account Transfer"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Sender Name *</label>
                <input value={form.sender_name} onChange={(e) => set("sender_name", e.target.value)} className={input} />
              </div>
              <div>
                <label className={labelCls}>Sender Mobile (optional)</label>
                <input type="tel" value={form.sender_mobile} onChange={(e) => set("sender_mobile", e.target.value)} className={input} />
              </div>
              {form.transfer_method === "bank_account" ? (
                <>
                  <div>
                    <label className={labelCls}>Beneficiary Name (optional)</label>
                    <input value={form.beneficiary_name} onChange={(e) => set("beneficiary_name", e.target.value)} className={input} />
                  </div>
                  <div>
                    <label className={labelCls}>Beneficiary Mobile (optional)</label>
                    <input type="tel" value={form.beneficiary_mobile} onChange={(e) => set("beneficiary_mobile", e.target.value)} className={input} />
                  </div>
                  <div>
                    <label className={labelCls}>Beneficiary Bank (optional)</label>
                    <input value={form.beneficiary_bank} onChange={(e) => set("beneficiary_bank", e.target.value)} className={input} />
                  </div>
                  <div>
                    <label className={labelCls}>Beneficiary IFSC (optional)</label>
                    <input value={form.beneficiary_ifsc} onChange={(e) => set("beneficiary_ifsc", e.target.value.toUpperCase())} className={input} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Beneficiary Account Number (optional)</label>
                    <input value={form.beneficiary_account} onChange={(e) => set("beneficiary_account", e.target.value)} className={input} />
                  </div>
                </>
              ) : (
                <div className="sm:col-span-2">
                  <label className={labelCls}>Beneficiary UPI ID (optional)</label>
                  <input value={form.upi_id} onChange={(e) => set("upi_id", e.target.value)} placeholder="name@upi" className={input} />
                </div>
              )}

              <div className="flex items-center gap-2 pt-1 sm:col-span-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Money Flow</span>
                <div className="h-px flex-1 bg-slate-100" />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Money Sent From</label>
                <div className="flex gap-2">
                  {[
                    { value: "bank", label: "Our Bank Account" },
                    { value: "portal", label: "DMT Portal Wallet" },
                  ].map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => set("paid_from", o.value)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                        form.paid_from === o.value
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-600"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                {form.paid_from === "bank" && banks.length > 0 && (
                  <div className="mt-2">
                    <label className={labelCls}>Select Source Bank Account (optional)</label>
                    <SearchableSelect
                      value={form.bank_id}
                      onChange={(v) => set("bank_id", v)}
                      options={banks.map((b) => ({ value: b.id, label: b.name }))}
                      placeholder="Choose our Bank Account..."
                    />
                  </div>
                )}
                {form.paid_from === "portal" && portals.length > 0 && (
                  <div className="mt-2">
                    <label className={labelCls}>Select DMT Portal (optional)</label>
                    <SearchableSelect
                      value={form.portal_id}
                      onChange={(v) => set("portal_id", v)}
                      options={portals.map((p) => ({ value: p.id, label: p.name }))}
                      placeholder="Choose DMT Portal..."
                    />
                  </div>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Customer Paid You Via</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { value: "cash", label: "Cash", icon: "💵" },
                    { value: "bank", label: "Bank Transfer", icon: "🏦" },
                    { value: "upi", label: "UPI QR", icon: "📱" },
                    { value: "due", label: "Due (Credit)", icon: "📋" },
                  ].map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => set("customer_pay_method", o.value)}
                      className={`rounded-xl border px-2.5 py-2 text-center text-xs font-semibold transition ${
                        form.customer_pay_method === o.value
                          ? o.value === "due"
                            ? "border-rose-500 bg-rose-50 text-rose-700 shadow-sm dark:bg-rose-950/40 dark:text-rose-300"
                            : o.value === "upi"
                            ? "border-pink-500 bg-pink-50 text-pink-700 shadow-sm dark:bg-pink-950/40 dark:text-pink-300"
                            : o.value === "bank"
                            ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm dark:bg-blue-950/40 dark:text-blue-300"
                            : "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
                      }`}
                    >
                      <span className="block text-sm mb-0.5">{o.icon}</span>
                      {o.label}
                    </button>
                  ))}
                </div>
                {form.customer_pay_method === "due" && (
                  <p className="mt-1 text-xs font-medium text-rose-600">
                    Transfer amount + fee will be added to the selected customer's outstanding Due.
                  </p>
                )}
                {form.customer_pay_method === "bank" && (
                  <p className="mt-1 text-xs font-medium text-blue-600">
                    Amount received will increase your Bank balance.
                  </p>
                )}
                {form.customer_pay_method === "upi" && (
                  <p className="mt-1 text-xs font-medium text-pink-600">
                    Amount received on merchant QR will increase your UPI QR balance.
                  </p>
                )}
              </div>
            </>
          )}

          {service === "upi" && (
            <>
            <div className="sm:col-span-2">
              <label className={labelCls}>Merchant QR *</label>
              <SearchableSelect
              value={form.merchant_qr_id}
              onChange={(v) => set("merchant_qr_id", v)}
              options={[
                { value: "", label: "Select merchant QR" },
                ...qrs.map((qr) => ({
                  value: qr.id,
                  label: `${qr.display_name || qr.name}${qr.upi_id ? ` (${qr.upi_id})` : ""}`,
                })),
              ]}
              searchPlaceholder="Search merchant…"
              showClear={false}
            />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Customer Paid You Via</label>
              <div className="flex gap-2">
                {[
                  { value: "qr", label: "UPI QR (merchant)" },
                  { value: "cash", label: "Cash" },
                ].map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => set("customer_pay_method", o.value)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                      form.customer_pay_method === o.value
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {form.customer_pay_method === "qr"
                  ? "Customer pays amount + fee to your QR; you hand out the amount in cash."
                  : "Customer pays amount + fee in cash; you hand out the amount."}
              </p>
            </div>
            </>
          )}

          {service === "recharge" && (
            <>
            <div className="sm:col-span-2">
              <label className={labelCls}>Provider *</label>
              <SearchableSelect
                value={form.provider_id}
                onChange={(v) => set("provider_id", v)}
                options={[
                  { value: "", label: "Select provider" },
                  ...rechargeProviders.map((p) => ({ value: p.id, label: p.name })),
                ]}
                searchPlaceholder="Search provider…"
                showClear={false}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Recharge Number (mobile / customer) *</label>
              <input
                type="tel"
                value={form.customer_mobile}
                onChange={(e) => set("customer_mobile", e.target.value)}
                placeholder="98XXXXXXXX"
                className={input}
              />
              <p className="mt-0.5 text-[11px] text-slate-400">The number being recharged.</p>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Customer Paid You Via</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { value: "cash", label: "Cash", icon: "💵" },
                  { value: "bank", label: "Bank Transfer", icon: "🏦" },
                  { value: "upi", label: "UPI QR", icon: "📱" },
                  { value: "due", label: "Due (Credit)", icon: "📋" },
                ].map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => set("customer_pay_method", o.value)}
                    className={`rounded-xl border px-2.5 py-2 text-center text-xs font-semibold transition ${
                      form.customer_pay_method === o.value
                        ? o.value === "due"
                          ? "border-rose-500 bg-rose-50 text-rose-700 shadow-sm dark:bg-rose-950/40 dark:text-rose-300"
                          : o.value === "upi"
                          ? "border-pink-500 bg-pink-50 text-pink-700 shadow-sm dark:bg-pink-950/40 dark:text-pink-300"
                          : o.value === "bank"
                          ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm dark:bg-blue-950/40 dark:text-blue-300"
                          : "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
                    }`}
                  >
                    <span className="block text-sm mb-0.5">{o.icon}</span>
                    {o.label}
                  </button>
                ))}
              </div>
              {form.customer_pay_method === "due" && (
                <p className="mt-1 text-xs font-medium text-rose-600">
                  Recharge of ₹{form.amount || "0"} will be added to the selected customer's outstanding Due (Khata).
                </p>
              )}
              {form.customer_pay_method === "bank" && (
                <p className="mt-1 text-xs font-medium text-blue-600">
                  Recharge of ₹{form.amount || "0"} received in Bank account will increase your Bank balance.
                </p>
              )}
              {form.customer_pay_method === "upi" && (
                <p className="mt-1 text-xs font-medium text-pink-600">
                  Recharge of ₹{form.amount || "0"} received on merchant QR will increase your UPI QR balance.
                </p>
              )}
            </div>
            {commissionPreview && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 sm:col-span-2">
                {commissionPreview.missing ? (
                  <p>No commission slab covers ₹{form.amount} for this provider — add a slab in Settings.</p>
                ) : (
                  <p>
                    Commission <b>{commissionPreview.percent}%</b> = <b>{inr(commissionPreview.commission)}</b> earned · Recharge float debited <b>{inr(commissionPreview.cost)}</b>
                  </p>
                )}
              </div>
            )}
            </>
          )}

          {service === "dmt" && (
            <div className="flex items-center gap-2 pt-1 sm:col-span-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Amount & Fees</span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
          )}
          <div>
            <label className={labelCls}>{service === "dmt" ? "Transfer Amount *" : service === "upi" ? "UPI Amount Received *" : service === "recharge" ? "Recharge Amount *" : "Withdrawal Amount *"}</label>
            <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} className={input} />
          </div>
          <div>
            <label className={labelCls}>{service === "dmt" ? "Customer Fee Charged" : "Service Fee"}</label>
            {service === "recharge" ? (
              <input type="number" value="0" disabled className={`${input} opacity-60`} />
            ) : (
              <input type="number" min="0" step="0.01" value={form.service_fee} onChange={(e) => set("service_fee", e.target.value)} className={input} />
            )}
          </div>
          {service !== "upi" && (
            <div>
              <label className={labelCls}>{service === "aeps" ? "Portal Commission" : "Portal Charge"}</label>
              {service === "recharge" ? (
                <input type="number" value={commissionPreview && !commissionPreview.missing ? commissionPreview.commission : ""} disabled className={`${input} opacity-60`} placeholder="Auto from slabs" />
              ) : (
                <input type="number" min="0" step="0.01" value={form.portal_commission} onChange={(e) => set("portal_commission", e.target.value)} className={input} />
              )}
            </div>
          )}
          {service === "dmt" && (
            <div className="flex items-center gap-2 pt-1 sm:col-span-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Reference</span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
          )}
          <div>
            <label className={labelCls}>{service === "dmt" ? "RRN / Reference *" : "Reference / RRN"}</label>
            <input value={form.reference} onChange={(e) => set("reference", e.target.value)} className={input} />
          </div>
          {service === "dmt" && (
            <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-3.5 sm:col-span-2 dark:border-violet-900/40 dark:bg-violet-950/30">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">DMT Money Flow Summary</span>
                <span className="text-xs font-semibold text-violet-600 dark:text-violet-400">
                  Shop Net Profit: {inr(Math.max(0, Number(form.service_fee || 0) - Number(form.portal_commission || 0)))}
                </span>
              </div>
              <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs">
                <div className="rounded-lg bg-white/90 p-2.5 shadow-xs dark:bg-slate-900/80">
                  <div className="flex items-center justify-between font-semibold text-rose-600 dark:text-rose-400">
                    <span>📤 Money Out (Debited):</span>
                    <span className="text-sm font-bold">{inr(Number(form.amount) || 0)}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Sent from <b>{form.paid_from === "portal" ? "DMT Portal Wallet" : "Our Bank Account"}</b> to beneficiary
                  </p>
                </div>
                <div className="rounded-lg bg-white/90 p-2.5 shadow-xs dark:bg-slate-900/80">
                  <div className="flex items-center justify-between font-semibold text-emerald-600 dark:text-emerald-400">
                    <span>📥 Money In (Collected):</span>
                    <span className="text-sm font-bold">{inr((Number(form.amount) || 0) + (Number(form.service_fee) || 0))}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Collected via <b>{form.customer_pay_method === "due" ? "Due (Credit)" : form.customer_pay_method === "upi" ? "UPI QR" : form.customer_pay_method === "bank" ? "Bank Transfer" : "Cash"}</b> ({inr(Number(form.amount) || 0)} transfer + {inr(Number(form.service_fee) || 0)} fee)
                  </p>
                </div>
              </div>
            </div>
          )}
          <div className="sm:col-span-2">
            <label className={labelCls}>Remarks</label>
            <textarea rows={2} value={form.remarks} onChange={(e) => set("remarks", e.target.value)} className={input} />
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}

        <ScanFillModal
          open={scanOpen}
          mode={service === "aeps" ? "aeps" : service === "dmt" ? "dmt" : "upi"}
          title={`Scan & Fill — ${service === "aeps" ? "AEPS" : service === "dmt" ? "DMT" : "UPI"}`}
          onClose={() => setScanOpen(false)}
          onApply={applyScanned}
        />
    </Modal>
  );
}
