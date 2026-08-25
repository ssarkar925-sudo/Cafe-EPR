"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import Modal from "@/components/ui/modal";

export type Purchase = {
  id: string;
  purchase_number: string;
  supplier_id: string | null;
  supplier_invoice_no: string | null;
  purchase_date: string;
  subtotal: number;
  tax_total: number;
  total: number;
  paid: number;
  due: number;
  status: "draft" | "completed" | "cancelled";
  notes: string | null;
  created_at: string;
  suppliers?: { id: string; name: string; code: string } | null;
  purchase_items?: PurchaseItem[];
};

export type PurchaseItem = {
  id: string;
  purchase_id: string;
  product_id: string;
  qty: number;
  purchase_rate: number;
  taxable_value: number;
  gst_rate: number;
  tax_amount: number;
  total_amount: number;
  returned_qty: number;
  products?: { id: string; name: string; code: string; cost_price: number; stock_qty: number } | null;
};

type ProductOption = {
  id: string;
  name: string;
  code: string;
  cost_price: number;
  stock_qty: number;
  gst_rate: number;
};

type SupplierOption = {
  id: string;
  name: string;
  code: string;
  current_balance: number;
};

export default function PurchasesClient() {
  const supabase = useMemo(() => createClient(), []);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Create Purchase Form
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<
    Array<{
      product_id: string;
      qty: string;
      purchase_rate: string;
      gst_rate: number;
    }>
  >([]);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank" | "credit" | "partial">("cash");
  const [paidAmount, setPaidAmount] = useState("");
  const [saving, setSaving] = useState(false);

  // Purchase Details & Return State
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnItems, setReturnItems] = useState<Record<string, string>>({});
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [returnReason, setReturnReason] = useState("");
  const [returning, setReturning] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [purRes, prodRes, supRes] = await Promise.all([
      supabase
        .from("purchases")
        .select("*, suppliers(id, name, code), purchase_items(*, products(id, name, code, cost_price, stock_qty))")
        .order("purchase_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("products").select("id, name, code, cost_price, stock_qty, gst_rate").eq("is_active", true),
      supabase.from("suppliers").select("id, name, code, current_balance").eq("is_active", true),
    ]);

    if (purRes.data) setPurchases(purRes.data as Purchase[]);
    if (prodRes.data) setProducts(prodRes.data as ProductOption[]);
    if (supRes.data) setSuppliers(supRes.data as SupplierOption[]);
    setLoading(false);
  }

  function resetNewForm() {
    setSupplierId("");
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setSupplierInvoiceNo("");
    setNotes("");
    setItems([]);
    setPaymentMethod("cash");
    setPaidAmount("");
  }

  function addItemRow() {
    if (products.length === 0) {
      alert("No active catalog products available.");
      return;
    }
    const p = products[0];
    setItems((prev) => [
      ...prev,
      {
        product_id: p.id,
        qty: "1",
        purchase_rate: String(p.cost_price || 0),
        gst_rate: Number(p.gst_rate || 0),
      },
    ]);
  }

  function removeItemRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateItemRow(index: number, field: string, value: any) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, [field]: value };
        if (field === "product_id") {
          const selectedP = products.find((p) => p.id === value);
          if (selectedP) {
            updated.purchase_rate = String(selectedP.cost_price || 0);
            updated.gst_rate = Number(selectedP.gst_rate || 0);
          }
        }
        return updated;
      })
    );
  }

  // Calculate Subtotal, Tax, Total
  let calcSubtotal = 0;
  let calcTaxTotal = 0;
  items.forEach((it) => {
    const q = Number(it.qty) || 0;
    const r = Number(it.purchase_rate) || 0;
    const g = Number(it.gst_rate) || 0;
    const taxable = q * r;
    const tax = taxable * (g / 100);
    calcSubtotal += taxable;
    calcTaxTotal += tax;
  });
  const calcTotal = Math.round((calcSubtotal + calcTaxTotal) * 100) / 100;

  async function handleCreatePurchase(e: React.FormEvent) {
    e.preventDefault();
    if (items.length === 0) {
      alert("Please add at least one product item to the purchase bill.");
      return;
    }

    let actualPaid = 0;
    const paymentLegs = [];

    if (paymentMethod === "cash") {
      actualPaid = calcTotal;
      paymentLegs.push({ method: "cash", amount: calcTotal });
    } else if (paymentMethod === "bank") {
      actualPaid = calcTotal;
      paymentLegs.push({ method: "bank", amount: calcTotal });
    } else if (paymentMethod === "credit") {
      actualPaid = 0;
    } else if (paymentMethod === "partial") {
      actualPaid = Number(paidAmount) || 0;
      if (actualPaid > calcTotal) {
        alert("Paid amount cannot exceed total bill amount.");
        return;
      }
      if (actualPaid > 0) {
        paymentLegs.push({ method: "cash", amount: actualPaid });
      }
    }

    const payloadItems = items.map((it) => ({
      product_id: it.product_id,
      qty: Number(it.qty),
      purchase_rate: Number(it.purchase_rate),
      gst_rate: Number(it.gst_rate || 0),
    }));

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("create_purchase", {
        p_supplier_id: supplierId ? supplierId : null,
        p_purchase_date: purchaseDate,
        p_supplier_invoice_no: supplierInvoiceNo.trim() || null,
        p_items: payloadItems,
        p_payments: paymentLegs,
        p_notes: notes.trim() || null,
      });

      if (error) {
        alert("Error recording purchase: " + error.message);
      } else {
        setNewModalOpen(false);
        resetNewForm();
        loadData();
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  function openReturnModal(pur: Purchase) {
    setSelectedPurchase(pur);
    const initialReturns: Record<string, string> = {};
    (pur.purchase_items || []).forEach((pi) => {
      initialReturns[pi.id] = "";
    });
    setReturnItems(initialReturns);
    setRefundAmount("");
    setReturnReason("");
    setReturnModalOpen(true);
  }

  async function handleProcessReturn(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPurchase) return;

    const returnPayload = Object.entries(returnItems)
      .filter(([_, qtyStr]) => Number(qtyStr) > 0)
      .map(([purchase_item_id, qtyStr]) => ({
        purchase_item_id,
        return_qty: Number(qtyStr),
      }));

    if (returnPayload.length === 0) {
      alert("Please specify a return quantity for at least one item.");
      return;
    }

    setReturning(true);
    try {
      const { error } = await supabase.rpc("process_purchase_return", {
        p_purchase_id: selectedPurchase.id,
        p_items: returnPayload,
        p_refund_amount: Number(refundAmount) || 0,
        p_refund_method: refundMethod,
        p_reason: returnReason.trim(),
      });

      if (error) {
        alert("Error processing purchase return: " + error.message);
      } else {
        setReturnModalOpen(false);
        setDetailsOpen(false);
        loadData();
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setReturning(false);
    }
  }

  const filteredPurchases = purchases.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.purchase_number.toLowerCase().includes(q) ||
      (p.supplier_invoice_no && p.supplier_invoice_no.toLowerCase().includes(q)) ||
      (p.suppliers?.name && p.suppliers.name.toLowerCase().includes(q))
    );
  });

  const totalInwardPurchases = purchases.reduce((acc, p) => acc + Number(p.total || 0), 0);
  const totalPurchasesDue = purchases.reduce((acc, p) => acc + Number(p.due || 0), 0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Inward Purchases & Restock
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Record inventory purchases with perpetual Moving Weighted Average Cost (WAC) and supplier billing
          </p>
        </div>
        <button
          onClick={() => {
            resetNewForm();
            addItemRow();
            setNewModalOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Record Purchase Bill
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-slate-900">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Total Inward Purchases
          </div>
          <div className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
            {inr(totalInwardPurchases)}
          </div>
          <div className="mt-1 text-xs text-slate-400">{purchases.length} Purchase Bills Inwarded</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-slate-900">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Total Purchase Due (Payable)
          </div>
          <div className="mt-2 text-3xl font-bold text-rose-600 dark:text-rose-400">
            {inr(totalPurchasesDue)}
          </div>
          <div className="mt-1 text-xs text-slate-400">Supplier Credit Outstanding</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-slate-900">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Costing Invariant
          </div>
          <div className="mt-2 flex items-center gap-2 text-lg font-bold text-emerald-600 dark:text-emerald-400">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Moving WAC Active
          </div>
          <div className="mt-1 text-xs text-slate-400">Balance Sheet Asset (Not Operating Expense)</div>
        </div>
      </div>

      {/* Filter & Purchases Table */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search purchases by purchase number, supplier, or invoice number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-transparent px-4 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:text-white"
          />
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-slate-400">Loading purchase bills...</div>
        ) : filteredPurchases.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">No purchase records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10 dark:text-slate-400">
                <tr>
                  <th className="py-3 px-4">Purchase #</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">Bill Ref</th>
                  <th className="py-3 px-4 text-right">Items</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Paid</th>
                  <th className="py-3 px-4 text-right">Due</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filteredPurchases.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                    <td className="py-3.5 px-4 font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                      {p.purchase_number}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-slate-600 dark:text-slate-400">
                      {p.purchase_date}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-900 dark:text-white">
                      {p.suppliers?.name || "Unspecified Supplier"}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-500">
                      {p.supplier_invoice_no || "—"}
                    </td>
                    <td className="py-3.5 px-4 text-right font-medium text-slate-700 dark:text-slate-300">
                      {p.purchase_items?.length || 0}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-slate-900 dark:text-white">
                      {inr(p.total)}
                    </td>
                    <td className="py-3.5 px-4 text-right text-emerald-600 dark:text-emerald-400 font-medium">
                      {inr(p.paid)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-rose-600 dark:text-rose-400">
                      {inr(p.due)}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        onClick={() => {
                          setSelectedPurchase(p);
                          setDetailsOpen(true);
                        }}
                        className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300"
                      >
                        View
                      </button>
                      <button
                        onClick={() => openReturnModal(p)}
                        className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-300"
                      >
                        Return
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Inward Purchase Modal */}
      {newModalOpen && (
        <Modal
          as="form"
          onSubmit={handleCreatePurchase}
          onClose={() => setNewModalOpen(false)}
          title="Record Inward Purchase Bill"
          subtitle="Inward restock with Moving WAC calculation and Tender selection"
          icon="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M12 12v6m-3-3l3-3 3 3"
          accent="indigo"
          size="xl"
          footer={
            <div className="flex items-center justify-between w-full">
              <div className="text-sm">
                <span className="text-slate-500">Bill Total: </span>
                <span className="font-bold text-slate-900 dark:text-white">{inr(calcTotal)}</span>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setNewModalOpen(false)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
                >
                  {saving ? "Posting Purchase..." : "Post Purchase"}
                </button>
              </div>
            </div>
          }
        >
          <div className="space-y-6">
            {/* Header Details */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Supplier / Vendor
                </label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
                >
                  <option value="">Unregistered / Walk-in Supplier</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Purchase Date *
                </label>
                <input
                  type="date"
                  required
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Supplier Bill / Invoice #
                </label>
                <input
                  type="text"
                  placeholder="e.g. INV-2026-089"
                  value={supplierInvoiceNo}
                  onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Line Items Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Line Items ({items.length})
                </div>
                <button
                  type="button"
                  onClick={addItemRow}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                >
                  + Add Product Row
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-400">
                    <tr>
                      <th className="py-2.5 px-3">Product</th>
                      <th className="py-2.5 px-3 w-24">Qty</th>
                      <th className="py-2.5 px-3 w-28">Rate (₹)</th>
                      <th className="py-2.5 px-3 w-24">GST %</th>
                      <th className="py-2.5 px-3 text-right">Line Total</th>
                      <th className="py-2.5 px-3 text-center w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {items.map((it, idx) => {
                      const curProd = products.find((p) => p.id === it.product_id);
                      const q = Number(it.qty) || 0;
                      const r = Number(it.purchase_rate) || 0;
                      const lineTot = q * r * (1 + Number(it.gst_rate || 0) / 100);

                      // Calculate resulting WAC preview
                      const curStock = Number(curProd?.stock_qty || 0);
                      const curCost = Number(curProd?.cost_price || 0);
                      const newStock = curStock + q;
                      const previewWac =
                        newStock > 0 ? ((curStock * curCost + q * r) / newStock).toFixed(2) : r.toFixed(2);

                      return (
                        <tr key={idx}>
                          <td className="py-2 px-3">
                            <select
                              value={it.product_id}
                              onChange={(e) => updateItemRow(idx, "product_id", e.target.value)}
                              className="w-full rounded-lg border border-slate-300 bg-transparent px-2.5 py-1.5 text-xs outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white"
                            >
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.code}) — On Hand: {p.stock_qty} @ ₹{p.cost_price}
                                </option>
                              ))}
                            </select>
                            <div className="mt-1 text-[10px] text-slate-400">
                              Resulting WAC Preview: <span className="font-semibold text-emerald-600">₹{previewWac}</span>
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min="0.001"
                              step="any"
                              required
                              value={it.qty}
                              onChange={(e) => updateItemRow(idx, "qty", e.target.value)}
                              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              required
                              value={it.purchase_rate}
                              onChange={(e) => updateItemRow(idx, "purchase_rate", e.target.value)}
                              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <select
                              value={it.gst_rate}
                              onChange={(e) => updateItemRow(idx, "gst_rate", Number(e.target.value))}
                              className="w-full rounded-lg border border-slate-300 bg-transparent px-2 py-1.5 text-xs outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white"
                            >
                              <option value="0">0%</option>
                              <option value="5">5%</option>
                              <option value="12">12%</option>
                              <option value="18">18%</option>
                              <option value="28">28%</option>
                            </select>
                          </td>
                          <td className="py-2 px-3 text-right font-semibold text-slate-900 dark:text-white">
                            {inr(lineTot)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => removeItemRow(idx)}
                              className="text-rose-500 hover:text-rose-700"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payment Tender Selection */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-white/10 dark:bg-slate-900/50">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-3">
                Payment Settlement Tender
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e: any) => setPaymentMethod(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
                  >
                    <option value="cash">Full Cash Payment (Cash Drawer Outflow)</option>
                    <option value="bank">Full Bank Transfer / NEFT / IMPS (Bank Outflow)</option>
                    <option value="credit">100% Credit (Supplier Payable Due)</option>
                    <option value="partial">Partial Payment (Split Cash & Due)</option>
                  </select>
                </div>

                {paymentMethod === "partial" && (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Amount Paid in Cash (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={paidAmount}
                      onChange={(e) => setPaidAmount(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
                    />
                    <div className="mt-1 text-xs text-slate-400">
                      Remaining Due to Supplier: {inr(Math.max(0, calcTotal - (Number(paidAmount) || 0)))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Purchase Details Modal */}
      {detailsOpen && selectedPurchase && (
        <Modal
          as="div"
          onClose={() => setDetailsOpen(false)}
          title={`Purchase Bill: ${selectedPurchase.purchase_number}`}
          subtitle={`Supplier: ${selectedPurchase.suppliers?.name || "Unspecified"} • Date: ${selectedPurchase.purchase_date}`}
          icon="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"
          accent="indigo"
          size="lg"
          footer={
            <div className="flex justify-between w-full">
              <button
                type="button"
                onClick={() => openReturnModal(selectedPurchase)}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
              >
                Return Goods to Supplier
              </button>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
              >
                Close
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-3 text-xs dark:bg-white/5">
              <div>
                <span className="text-slate-400">Subtotal:</span>
                <div className="font-bold text-slate-900 dark:text-white">{inr(selectedPurchase.subtotal)}</div>
              </div>
              <div>
                <span className="text-slate-400">Tax Total:</span>
                <div className="font-bold text-slate-900 dark:text-white">{inr(selectedPurchase.tax_total)}</div>
              </div>
              <div>
                <span className="text-slate-400">Total Bill:</span>
                <div className="font-bold text-indigo-600 dark:text-indigo-400">{inr(selectedPurchase.total)}</div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th className="py-2.5 px-3">Product</th>
                    <th className="py-2.5 px-3 text-right">Purchased</th>
                    <th className="py-2.5 px-3 text-right">Returned</th>
                    <th className="py-2.5 px-3 text-right">Rate</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {(selectedPurchase.purchase_items || []).map((pi) => (
                    <tr key={pi.id}>
                      <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white">
                        {pi.products?.name || "Product"}
                        <div className="text-[10px] font-mono text-slate-400">{pi.products?.code}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right">{pi.qty}</td>
                      <td className="py-2.5 px-3 text-right text-rose-500 font-semibold">{pi.returned_qty}</td>
                      <td className="py-2.5 px-3 text-right">{inr(pi.purchase_rate)}</td>
                      <td className="py-2.5 px-3 text-right font-bold">{inr(pi.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}

      {/* Purchase Return Modal */}
      {returnModalOpen && selectedPurchase && (
        <Modal
          as="form"
          onSubmit={handleProcessReturn}
          onClose={() => setReturnModalOpen(false)}
          title={`Process Return: ${selectedPurchase.purchase_number}`}
          subtitle={`Return goods from specific purchase lots with verified Moving WAC cost relief`}
          icon="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"
          accent="rose"
          size="lg"
          footer={
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setReturnModalOpen(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={returning}
                className="rounded-xl bg-rose-600 px-5 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {returning ? "Processing Return..." : "Confirm Return"}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th className="py-2.5 px-3">Product</th>
                    <th className="py-2.5 px-3 text-right">Purchased</th>
                    <th className="py-2.5 px-3 text-right">Available to Return</th>
                    <th className="py-2.5 px-3 text-right">Purchase Rate</th>
                    <th className="py-2.5 px-3 text-right w-28">Return Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {(selectedPurchase.purchase_items || []).map((pi) => {
                    const remaining = pi.qty - pi.returned_qty;
                    return (
                      <tr key={pi.id}>
                        <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white">
                          {pi.products?.name}
                        </td>
                        <td className="py-2.5 px-3 text-right">{pi.qty}</td>
                        <td className="py-2.5 px-3 text-right font-semibold text-emerald-600">{remaining}</td>
                        <td className="py-2.5 px-3 text-right">{inr(pi.purchase_rate)}</td>
                        <td className="py-2.5 px-3 text-right">
                          <input
                            type="number"
                            min="0"
                            max={remaining}
                            step="any"
                            placeholder="0"
                            value={returnItems[pi.id] || ""}
                            onChange={(e) =>
                              setReturnItems((prev) => ({ ...prev, [pi.id]: e.target.value }))
                            }
                            className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs text-right outline-none focus:border-rose-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Reason for Return
              </label>
              <input
                type="text"
                placeholder="e.g. Defective stock, expired batch, incorrect order"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-rose-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

