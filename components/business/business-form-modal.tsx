"use client";

import { useEffect, useMemo, useState } from "react";
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
  txns: Txn[];
  initial?: Txn;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => void;
}) {
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

  function submit() {
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
      if (!form.customer_id && !form.customer_mobile.trim()) return setError("Customer mobile is required.");
    }
    if (service === "dmt") {
      if (!form.customer_id && !form.customer_mobile.trim()) return setError("Customer mobile is required.");
      if (!form.sender_name.trim()) return setError("Sender name is required.");
      if (form.transfer_method === "bank_account") {
        if (!form.beneficiary_name.trim()) return setError("Beneficiary name is required.");
        if (!form.beneficiary_account.trim()) return setError("Beneficiary account number is required.");
        if (!form.beneficiary_ifsc.trim()) return setError("Beneficiary IFSC is required.");
        if (!form.beneficiary_bank.trim()) return setError("Beneficiary bank is required.");
      } else {
        if (!form.upi_id.trim()) return setError("Beneficiary UPI ID is required.");
      }
    }
    if (service === "upi") {
      if (!form.merchant_qr_id) return setError("Please choose the merchant QR.");
      if (!form.customer_id && !form.customer_mobile.trim()) return setError("Customer mobile is required.");
    }

    setError("");
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
    });
  }

  const input = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const labelCls = "mb-1 block text-xs font-semibold text-slate-500";

  return (
    <Modal
      onClose={onClose}
      title={initial ? `Edit ${label} Transaction` : `Record ${label} Transaction`}
      subtitle={`Numbered automatically: ${service === "aeps" ? "AEP-XXXX" : service === "dmt" ? "DMT-XXXX" : "UPI-XXXX"}.`}
      icon={service === "aeps" ? "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 0v4M7 17a5 5 0 0 1 10 0" : service === "dmt" ? "M22 2 11 13M22 2 15 22l-4-9-9-4z" : "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-12-1 2 2 4-4"}
      accent={service === "aeps" ? "amber" : service === "dmt" ? "violet" : "emerald"}
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
          {service === "aeps" ? "AEPS" : service === "dmt" ? "DMT" : "UPI"} transaction
        </p>
        <button
          onClick={() => setScanOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M4 7V4h3M9 4h2M4 11v2M17 4h3v3M20 9v2M20 17v3h-3M15 20h-2M4 17v3h3M4 15v-2" />
          </svg>
          Scan &amp; Fill
        </button>
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
              ...customers.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` })),
            ]}
            searchPlaceholder="Search customer…"
            showClear={false}
          />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Customer Mobile {!form.customer_id ? "*" : "(optional)"}</label>
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
            </>
          )}

          {service === "dmt" && (
            <>
              <div className="sm:col-span-2">
                <label className={labelCls}>Transfer Method *</label>
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
                <label className={labelCls}>Sender Mobile</label>
                <input type="tel" value={form.sender_mobile} onChange={(e) => set("sender_mobile", e.target.value)} className={input} />
              </div>
              {form.transfer_method === "bank_account" ? (
                <>
                  <div>
                    <label className={labelCls}>Beneficiary Name *</label>
                    <input value={form.beneficiary_name} onChange={(e) => set("beneficiary_name", e.target.value)} className={input} />
                  </div>
                  <div>
                    <label className={labelCls}>Beneficiary Mobile</label>
                    <input type="tel" value={form.beneficiary_mobile} onChange={(e) => set("beneficiary_mobile", e.target.value)} className={input} />
                  </div>
                  <div>
                    <label className={labelCls}>Beneficiary Bank *</label>
                    <input value={form.beneficiary_bank} onChange={(e) => set("beneficiary_bank", e.target.value)} className={input} />
                  </div>
                  <div>
                    <label className={labelCls}>Beneficiary IFSC *</label>
                    <input value={form.beneficiary_ifsc} onChange={(e) => set("beneficiary_ifsc", e.target.value.toUpperCase())} className={input} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Beneficiary Account Number *</label>
                    <input value={form.beneficiary_account} onChange={(e) => set("beneficiary_account", e.target.value)} className={input} />
                  </div>
                </>
              ) : (
                <div className="sm:col-span-2">
                  <label className={labelCls}>Beneficiary UPI ID *</label>
                  <input value={form.upi_id} onChange={(e) => set("upi_id", e.target.value)} placeholder="name@upi" className={input} />
                </div>
              )}
            </>
          )}

          {service === "upi" && (
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
          )}

          <div>
            <label className={labelCls}>{service === "dmt" ? "Transfer Amount *" : service === "upi" ? "UPI Amount Received *" : "Withdrawal Amount *"}</label>
            <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} className={input} />
          </div>
          <div>
            <label className={labelCls}>{service === "dmt" ? "Customer Fee Charged" : "Service Fee"}</label>
            <input type="number" min="0" step="0.01" value={form.service_fee} onChange={(e) => set("service_fee", e.target.value)} className={input} />
          </div>
          {service !== "upi" && (
            <div>
              <label className={labelCls}>{service === "aeps" ? "Portal Commission" : "Portal Charge"}</label>
              <input type="number" min="0" step="0.01" value={form.portal_commission} onChange={(e) => set("portal_commission", e.target.value)} className={input} />
            </div>
          )}
          <div>
            <label className={labelCls}>Reference / RRN</label>
            <input value={form.reference} onChange={(e) => set("reference", e.target.value)} className={input} />
          </div>
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
