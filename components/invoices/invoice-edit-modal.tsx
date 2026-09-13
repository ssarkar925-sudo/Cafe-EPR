"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { calculateGstInvoice } from "@/lib/gst";
import Modal from "@/components/ui/modal";


type CatalogItem = {
  id: string;
  kind: "product" | "service";
  name: string;
  rate: number;
  costPrice: number;
  gstRate: number;
  hsnSac: string | null;
  stockQty: number | null;
};

type EditLine = CatalogItem & {
  key: string;
  qty: number;
};

type Props = {
  invoiceId: string;
  onClose: () => void;
  onSaved: () => void;
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export default function InvoiceEditModal({ invoiceId, onClose, onSaved }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [oldCustomerId, setOldCustomerId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [lines, setLines] = useState<EditLine[]>([]);
  const [discount, setDiscount] = useState("");
  const [payments, setPayments] = useState<any[]>([]);
  const [oldPaid, setOldPaid] = useState(0);
  const [advanceUsed, setAdvanceUsed] = useState(0);
  const [placeOfSupply, setPlaceOfSupply] = useState<string | null>(null);
  const [supplyType, setSupplyType] = useState("intra_state");
  const [customerGstin, setCustomerGstin] = useState<string | null>(null);
  const [b2bOrB2c, setB2bOrB2c] = useState("B2C_SMALL");
  const [reverseCharge, setReverseCharge] = useState(false);
  const [addKey, setAddKey] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const [inv, its, pays, custs, products, services] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", invoiceId).single(),
        supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId).order("id"),
        supabase.from("payments").select("*").eq("invoice_id", invoiceId).order("received_at"),
        supabase.from("customers").select("id,name,phone,balance,gstin,state_code").eq("is_active", true).order("name").limit(1000),
        supabase.from("products").select("id,name,sale_price,cost_price,stock_qty,hsn_code,gst_rate").eq("is_active", true).order("name").limit(2000),
        supabase.from("services").select("id,name,sale_price,cost_price,sac_code,gst_rate").eq("is_active", true).order("name").limit(2000),
      ]);
      if (cancelled) return;
      if (inv.error || !inv.data) {
        setError(inv.error?.message || "Invoice not found.");
        setLoading(false);
        return;
      }
      if (inv.data.status === "cancelled") {
        setError("Cancelled invoices cannot be edited.");
        setLoading(false);
        return;
      }

      const productCatalog: CatalogItem[] = (products.data ?? []).map((p: any) => ({
        id: p.id, kind: "product", name: p.name, rate: Number(p.sale_price) || 0,
        costPrice: Number(p.cost_price) || 0, gstRate: Number(p.gst_rate) || 0,
        hsnSac: p.hsn_code ?? null, stockQty: Number(p.stock_qty ?? 0),
      }));
      const serviceCatalog: CatalogItem[] = (services.data ?? []).map((s: any) => ({
        id: s.id, kind: "service", name: s.name, rate: Number(s.sale_price) || 0,
        costPrice: Number(s.cost_price) || 0, gstRate: Number(s.gst_rate) || 0,
        hsnSac: s.sac_code ?? null, stockQty: null,
      }));
      const allCatalog = [...productCatalog, ...serviceCatalog];

      const mappedLines: EditLine[] = (its.data ?? []).map((item: any, index: number) => {
        const kind: "product" | "service" = item.product_id ? "product" : "service";
        const id = item.product_id || item.service_id;
        const current = allCatalog.find((x) => x.kind === kind && x.id === id);
        return {
          key: `${kind}:${id}:${index}`,
          id,
          kind,
          name: item.description || current?.name || "Item",
          rate: Number(item.rate) || 0,
          qty: Number(item.qty) || 1,
          costPrice: Number(item.cost_price) || current?.costPrice || 0,
          gstRate: Number(item.gst_rate) || 0,
          hsnSac: item.hsn_sac || current?.hsnSac || null,
          stockQty: kind === "product" ? (current?.stockQty ?? null) : null,
        };
      });

      const paid = Number(inv.data.paid) || 0;
      const paymentTotal = round2((pays.data ?? []).reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0));
      const inferredAdvance = round2(Math.max(0, paid - paymentTotal));

      setInvoiceNumber(String(inv.data.invoice_number ?? ""));
      setInvoiceDate(String(inv.data.invoice_date ?? ""));
      setCustomerId(String(inv.data.customer_id ?? ""));
      setOldCustomerId(inv.data.customer_id ?? null);
      setCustomers(custs.data ?? []);
      setCatalog(allCatalog);
      setLines(mappedLines);
      setDiscount(String(Number(inv.data.discount) || 0));
      setPayments(pays.data ?? []);
      setOldPaid(paid);
      setAdvanceUsed(inferredAdvance);
      setPlaceOfSupply(inv.data.place_of_supply ?? null);
      setSupplyType(String(inv.data.supply_type ?? "intra_state"));
      setCustomerGstin(inv.data.customer_gstin ?? null);
      setB2bOrB2c(String(inv.data.b2b_or_b2c ?? "B2C_SMALL"));
      setReverseCharge(Boolean(inv.data.is_reverse_charge));
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [invoiceId, supabase]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === customerId) ?? null,
    [customers, customerId]
  );

  const totals = useMemo(() => calculateGstInvoice({
    lines: lines.map((line) => ({ qty: line.qty, rate: line.rate, gstRate: line.gstRate, hsnSac: line.hsnSac, taxTreatment: line.gstRate > 0 ? "taxable" : "non_gst" })),
    invoiceLumpSumDiscount: Math.max(0, Number(discount) || 0),
    customerStateCode: selectedCustomer?.state_code ?? null,
    customerGstin: selectedCustomer?.gstin ?? customerGstin ?? null,
  }), [lines, discount, selectedCustomer, customerGstin]);

  const paymentTotal = useMemo(
    () => round2(payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0)),
    [payments]
  );

  function updateLine(key: string, patch: Partial<EditLine>) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  function addItem() {
    const item = catalog.find((candidate) => `${candidate.kind}:${candidate.id}` === addKey);
    if (!item) return;
    const existing = lines.find((line) => line.id === item.id && line.kind === item.kind);
    if (existing) {
      updateLine(existing.key, { qty: existing.qty + 1 });
    } else {
      setLines((current) => [...current, { ...item, key: `${item.kind}:${item.id}:${Date.now()}`, qty: 1 }]);
    }
    setAddKey("");
  }

  async function save() {
    if (saving) return;
    setError(null);
    if (!lines.length) { setError("Invoice must contain at least one item."); return; }
    if (!invoiceDate) { setError("Invoice date is required."); return; }
    if (advanceUsed > 0 && customerId !== oldCustomerId) {
      setError("This invoice uses customer advance. Keep the original customer when editing it.");
      return;
    }

    for (const line of lines) {
      if (line.qty <= 0 || !Number.isFinite(line.qty)) { setError(`Invalid quantity for ${line.name}.`); return; }
      if (line.rate < 0 || !Number.isFinite(line.rate)) { setError(`Invalid rate for ${line.name}.`); return; }
      if (line.kind === "product") {
        const oldQty = (lines.find((x) => x.key === line.key)?.qty ?? 0);
        void oldQty;
      }
    }

    const newTotal = round2(totals.invoiceTotal);
    if (newTotal + 0.005 < oldPaid) {
      setError(`New invoice total ${inr(newTotal)} cannot be less than the ${inr(oldPaid)} already collected. Reduce the edit or use a return/refund workflow.`);
      return;
    }

    const itemPayload = totals.lines.map((taxLine, index) => {
      const line = lines[index];
      return {
        product_id: line.kind === "product" ? line.id : null,
        service_id: line.kind === "service" ? line.id : null,
        description: line.name,
        qty: line.qty,
        rate: line.rate,
        amount: taxLine.grossAmount,
        cost_price: line.costPrice,
        hsn_sac: taxLine.hsnSac,
        taxable_value: taxLine.taxableValue,
        gst_rate: taxLine.gstRate,
        cgst_rate: taxLine.cgstRate,
        cgst_amount: taxLine.cgstAmount,
        sgst_rate: taxLine.sgstRate,
        sgst_amount: taxLine.sgstAmount,
        igst_rate: taxLine.igstRate,
        igst_amount: taxLine.igstAmount,
        tax_treatment: taxLine.taxTreatment,
      };
    });

    setSaving(true);
    const { error: rpcError } = await supabase.rpc("edit_invoice", {
      p_invoice_id: invoiceId,
      p_customer_id: customerId || null,
      p_invoice_date: invoiceDate,
      p_subtotal: round2(totals.totalGross),
      p_discount: round2(totals.totalDiscount),
      p_total: newTotal,
      p_payments: payments.map((payment) => ({ method: payment.method, amount: Number(payment.amount) || 0, instrument_id: payment.instrument_id ?? null })),
      p_items: itemPayload,
      p_reason: "Edited from unified invoice ledger",
      p_place_of_supply: totals.placeOfSupply,
      p_supply_type: totals.supplyType,
      p_customer_gstin: totals.customerGstin,
      p_b2b_or_b2c: totals.b2bCategory,
      p_total_taxable_value: totals.totalTaxableValue,
      p_total_cgst: totals.totalCgst,
      p_total_sgst: totals.totalSgst,
      p_total_igst: totals.totalIgst,
      p_is_reverse_charge: reverseCharge,
      p_advance_used: advanceUsed,
    } as any);
    setSaving(false);

    if (rpcError) {
      setError(rpcError.message || "Invoice edit failed. No changes were saved.");
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <Modal
      onClose={onClose}
      title={invoiceNumber ? `Edit ${invoiceNumber}` : "Edit Invoice"}
      subtitle="Changes are applied atomically: the old invoice is retained as a cancelled audit record and the corrected invoice receives a new number."
      icon="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"
      accent="blue"
      size="xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-slate-400">Collected payments are preserved; stock and customer ledger are reversed/re-applied transactionally.</div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold dark:border-white/10">Cancel</button>
            <button type="button" onClick={() => void save()} disabled={loading || saving} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{saving ? "Saving…" : "Save Invoice"}</button>
          </div>
        </div>
      }
    >
      {loading ? <div className="py-16 text-center text-sm text-slate-400">Loading invoice…</div> : (
        <div className="space-y-5">
          {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 ring-1 ring-rose-200">{error}</div>}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="text-xs font-bold text-slate-500">Invoice date<input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-800 dark:text-white" /></label>
            <label className="text-xs font-bold text-slate-500 md:col-span-2">Customer<select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-800 dark:text-white"><option value="">Walk-in Customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ""}</option>)}</select></label>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead><tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:border-white/10 dark:bg-slate-950"><th className="px-3 py-2">Item</th><th className="px-3 py-2 w-24">Qty</th><th className="px-3 py-2 w-32">Rate</th><th className="px-3 py-2 w-28">GST</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 w-16"></th></tr></thead>
              <tbody>
                {lines.map((line) => <tr key={line.key} className="border-b border-slate-100 dark:border-white/5">
                  <td className="px-3 py-2"><div className="font-semibold text-slate-800 dark:text-slate-100">{line.name}</div><div className="text-[10px] text-slate-400">{line.kind === "product" ? "Product" : "Service"}{line.hsnSac ? ` · ${line.hsnSac}` : ""}</div></td>
                  <td className="px-3 py-2"><input type="number" min="0.001" step="0.001" value={line.qty} onChange={(e) => updateLine(line.key, { qty: Number(e.target.value) })} className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-white/10 dark:bg-slate-800 dark:text-white" /></td>
                  <td className="px-3 py-2"><input type="number" min="0" step="0.01" value={line.rate} onChange={(e) => updateLine(line.key, { rate: Number(e.target.value) })} className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-white/10 dark:bg-slate-800 dark:text-white" /></td>
                  <td className="px-3 py-2 text-xs font-semibold text-slate-500">{line.gstRate}%</td>
                  <td className="px-3 py-2 text-right font-bold">{inr(line.rate * line.qty)}</td>
                  <td className="px-3 py-2 text-right"><button type="button" onClick={() => removeLine(line.key)} className="rounded-lg px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50">Remove</button></td>
                </tr>)}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={addKey} onChange={(e) => setAddKey(e.target.value)} className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold dark:border-white/10 dark:bg-slate-800 dark:text-white"><option value="">Add product or service…</option>{catalog.map((item) => <option key={`${item.kind}:${item.id}`} value={`${item.kind}:${item.id}`}>{item.kind === "product" ? "Product" : "Service"} · {item.name} · {inr(item.rate)}</option>)}</select>
            <button type="button" onClick={addItem} disabled={!addKey} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-black text-white disabled:opacity-40 dark:bg-white dark:text-slate-900">Add Item</button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Payment preservation</p>
              <p className="mt-1 text-sm font-bold">Already collected: {inr(oldPaid)}</p>
              <p className="text-xs text-slate-500">Payment rows: {inr(paymentTotal)}{advanceUsed > 0 ? ` · Advance applied: ${inr(advanceUsed)}` : ""}</p>
              <p className="mt-2 text-[11px] text-slate-400">Payments are not edited here. If the corrected total is higher, the difference becomes due; if it is lower than the collected amount, the edit is blocked.</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
              <div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">Gross</span><span className="font-bold">{inr(totals.totalGross)}</span></div>
              <div className="mt-1 flex items-center justify-between"><label className="text-xs font-semibold text-slate-500">Discount</label><input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm dark:border-white/10 dark:bg-slate-800 dark:text-white" /></div>
              <div className="mt-1 flex items-center justify-between text-xs text-slate-500"><span>Tax</span><span>{inr(totals.totalTax)}</span></div>
              <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-base font-black dark:border-white/10"><span>Total</span><span>{inr(totals.invoiceTotal)}</span></div>
              <div className="mt-1 flex items-center justify-between text-xs font-bold"><span>New due</span><span className={Math.max(0, totals.invoiceTotal - oldPaid) > 0 ? "text-rose-600" : "text-emerald-600"}>{inr(Math.max(0, totals.invoiceTotal - oldPaid))}</span></div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
