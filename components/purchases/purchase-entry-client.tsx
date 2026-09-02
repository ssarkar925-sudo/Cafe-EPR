"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import {
  ShoppingBag,
  Plus,
  Trash2,
  ArrowLeft,
  Building2,
  Calendar,
  FileText,
  Boxes,
  CheckCircle2,
  AlertCircle,
  TrendingDown,
  CreditCard,
  Banknote,
  DollarSign,
  ShieldCheck,
  RotateCcw,
  Sparkles,
} from "lucide-react";

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
  phone?: string | null;
};

export default function PurchaseEntryClient() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [supplierId, setSupplierId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
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
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "bank" | "credit" | "partial"
  >("cash");
  const [paidAmount, setPaidAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successBillNo, setSuccessBillNo] = useState<string | null>(null);

  useEffect(() => {
    loadPrerequisites();
  }, []);

  async function loadPrerequisites() {
    setLoading(true);
    const [prodRes, supRes] = await Promise.all([
      supabase
        .from("products")
        .select("id, name, code, cost_price, stock_qty, gst_rate")
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabase
        .from("suppliers")
        .select("id, name, code, current_balance, phone")
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ]);

    if (prodRes.data) {
      setProducts(prodRes.data as ProductOption[]);
      if (prodRes.data.length > 0 && items.length === 0) {
        const first = prodRes.data[0];
        setItems([
          {
            product_id: first.id,
            qty: "1",
            purchase_rate: String(first.cost_price || 0),
            gst_rate: Number(first.gst_rate || 0),
          },
        ]);
      }
    }
    if (supRes.data) setSuppliers(supRes.data as SupplierOption[]);
    setLoading(false);
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
    if (items.length <= 1) {
      alert("A purchase bill must contain at least one product row.");
      return;
    }
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

  // Calculate Subtotal, Tax, and Total
  const { calcSubtotal, calcTaxTotal, calcTotal } = useMemo(() => {
    let sub = 0;
    let tax = 0;
    items.forEach((it) => {
      const q = Number(it.qty) || 0;
      const r = Number(it.purchase_rate) || 0;
      const g = Number(it.gst_rate) || 0;
      const taxable = q * r;
      const itemTax = taxable * (g / 100);
      sub += taxable;
      tax += itemTax;
    });
    return {
      calcSubtotal: sub,
      calcTaxTotal: tax,
      calcTotal: Math.round((sub + tax) * 100) / 100,
    };
  }, [items]);

  // Selected supplier details
  const selectedSupplierObj = useMemo(() => {
    return suppliers.find((s) => s.id === supplierId) || null;
  }, [suppliers, supplierId]);

  // Handle Form Submission
  async function handleSubmitPurchase(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setErrorMsg("");

    if (items.length === 0) {
      setErrorMsg("Please add at least one product to the purchase bill.");
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.product_id) {
        setErrorMsg(`Item #${i + 1} has no product selected.`);
        return;
      }
      if (Number(it.qty) <= 0 || isNaN(Number(it.qty))) {
        setErrorMsg(`Item #${i + 1} must have a quantity greater than zero.`);
        return;
      }
      if (Number(it.purchase_rate) < 0 || isNaN(Number(it.purchase_rate))) {
        setErrorMsg(`Item #${i + 1} must have a valid non-negative purchase rate.`);
        return;
      }
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
        setErrorMsg("Paid amount cannot exceed the total bill amount.");
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
        setErrorMsg("Error recording purchase: " + error.message);
      } else {
        const billNo = data?.purchase_number || "Recorded";
        setSuccessBillNo(billNo);
      }
    } catch (err: any) {
      setErrorMsg("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleResetForNewBill() {
    setSuccessBillNo(null);
    setSupplierId("");
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setSupplierInvoiceNo("");
    setNotes("");
    setPaymentMethod("cash");
    setPaidAmount("");
    if (products.length > 0) {
      const first = products[0];
      setItems([
        {
          product_id: first.id,
          qty: "1",
          purchase_rate: String(first.cost_price || 0),
          gst_rate: Number(first.gst_rate || 0),
        },
      ]);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner Navigation */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/purchases"
              className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Purchases History
            </Link>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
              <ShoppingBag className="h-3.5 w-3.5" />
              STOCK INWARD WORKSTATION
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Receive Stock & Record Purchase Bill
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
            Inward inventory from supplier bills with perpetual Moving Weighted Average Cost (WAC) recalculation and Accounts Payable ledger settlement.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/inventory/movements"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
          >
            <Boxes className="h-3.5 w-3.5 text-indigo-500" />
            View Movements Journal
          </Link>
          <Link
            href="/purchases"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
          >
            <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
            Purchases History
          </Link>
        </div>
      </div>

      {/* Success Notification Banner */}
      {successBillNo && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900/40 dark:bg-emerald-950/30">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-emerald-900 dark:text-emerald-200">
                Purchase Bill Successfully Recorded!
              </h3>
              <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                Physical inventory has been restocked, moving weighted average costs have been recalculated, and supplier liabilities updated.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleResetForNewBill}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
                >
                  + Record Another Purchase Bill
                </button>
                <Link
                  href="/purchases"
                  className="rounded-xl border border-emerald-300 bg-white px-4 py-2 text-xs font-bold text-emerald-800 shadow-xs hover:bg-emerald-50 dark:border-white/10 dark:bg-slate-900 dark:text-emerald-300"
                >
                  View Inward History →
                </Link>
                <Link
                  href="/inventory/movements"
                  className="rounded-xl border border-emerald-300 bg-white px-4 py-2 text-xs font-bold text-emerald-800 shadow-xs hover:bg-emerald-50 dark:border-white/10 dark:bg-slate-900 dark:text-emerald-300"
                >
                  View Stock Movements Ledger →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Workstation Entry Form */}
      {!successBillNo && (
        <form onSubmit={handleSubmitPurchase} className="space-y-6">
          {/* Section 1: Supplier & Invoice Information */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-white/5">
              <Building2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white">
                1. Supplier & Invoice Reference
              </h2>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* Supplier Selection */}
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Supplier / Vendor Master *
                </label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">Walk-in / Direct Unregistered Supplier</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code}) — Balance Due: {inr(s.current_balance)}
                    </option>
                  ))}
                </select>
                {selectedSupplierObj && (
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Account: <strong className="text-slate-800 dark:text-white">{selectedSupplierObj.name}</strong></span>
                    <span className="font-semibold text-rose-600 dark:text-rose-400">
                      Balance: {inr(selectedSupplierObj.current_balance)}
                    </span>
                  </div>
                )}
              </div>

              {/* Purchase Date */}
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Inward Date *
                </label>
                <input
                  type="date"
                  required
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
              </div>

              {/* Supplier Invoice / Bill # */}
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Supplier Invoice # / Bill Reference
                </label>
                <input
                  type="text"
                  placeholder="e.g. INV-2026-9042"
                  value={supplierInvoiceNo}
                  onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Product Line Items */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div className="flex items-center gap-2">
                <Boxes className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white">
                  2. Received Product Items & Moving WAC Recalculation
                </h2>
              </div>
              <button
                type="button"
                onClick={addItemRow}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Product Row
              </button>
            </div>

            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50/75 text-slate-600 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-400">
                  <tr>
                    <th className="py-3 px-4 font-bold uppercase tracking-wider">Product Master Item</th>
                    <th className="py-3 px-4 font-bold uppercase tracking-wider w-28">Inward Qty</th>
                    <th className="py-3 px-4 font-bold uppercase tracking-wider w-36">Purchase Rate (₹)</th>
                    <th className="py-3 px-4 font-bold uppercase tracking-wider w-28">GST Rate %</th>
                    <th className="py-3 px-4 text-right font-bold uppercase tracking-wider">Line Total (incl. tax)</th>
                    <th className="py-3 px-4 text-center font-bold uppercase tracking-wider w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {items.map((it, idx) => {
                    const curProd = products.find((p) => p.id === it.product_id);
                    const q = Number(it.qty) || 0;
                    const r = Number(it.purchase_rate) || 0;
                    const g = Number(it.gst_rate) || 0;
                    const taxable = q * r;
                    const lineTot = taxable * (1 + g / 100);

                    // Moving WAC Preview
                    const curStock = Number(curProd?.stock_qty || 0);
                    const curCost = Number(curProd?.cost_price || 0);
                    const newStock = curStock + q;
                    const previewWac =
                      newStock > 0 ? ((curStock * curCost + q * r) / newStock).toFixed(2) : r.toFixed(2);

                    return (
                      <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition">
                        {/* Product Picker */}
                        <td className="py-3 px-4">
                          <select
                            value={it.product_id}
                            onChange={(e) => updateItemRow(idx, "product_id", e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none transition focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                          >
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.code || "No SKU"}) — Current Stock: {p.stock_qty} @ ₹{p.cost_price}
                              </option>
                            ))}
                          </select>
                          <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-400">
                            <span>Current On-Hand: <strong className="text-slate-700 dark:text-slate-300">{curStock} units</strong></span>
                            <span>·</span>
                            <span>
                              Resulting Weighted Cost:{" "}
                              <strong className="text-emerald-600 dark:text-emerald-400">₹{previewWac}</strong>
                            </span>
                          </div>
                        </td>

                        {/* Quantity */}
                        <td className="py-3 px-4 align-top">
                          <input
                            type="number"
                            min="0.001"
                            step="any"
                            required
                            value={it.qty}
                            onChange={(e) => updateItemRow(idx, "qty", e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none transition focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                          />
                        </td>

                        {/* Purchase Rate (Excl Tax) */}
                        <td className="py-3 px-4 align-top">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            required
                            value={it.purchase_rate}
                            onChange={(e) => updateItemRow(idx, "purchase_rate", e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none transition focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                          />
                        </td>

                        {/* GST Rate */}
                        <td className="py-3 px-4 align-top">
                          <select
                            value={it.gst_rate}
                            onChange={(e) => updateItemRow(idx, "gst_rate", Number(e.target.value))}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none transition focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                          >
                            <option value="0">0%</option>
                            <option value="5">5%</option>
                            <option value="12">12%</option>
                            <option value="18">18%</option>
                            <option value="28">28%</option>
                          </select>
                        </td>

                        {/* Line Total */}
                        <td className="py-3 px-4 text-right align-top font-mono font-black text-slate-900 dark:text-white text-sm">
                          {inr(lineTot)}
                        </td>

                        {/* Remove Action */}
                        <td className="py-3 px-4 text-center align-top">
                          <button
                            type="button"
                            onClick={() => removeItemRow(idx)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 transition"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Financial Totals Breakdown Bar */}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 rounded-2xl bg-indigo-50/60 p-4 border border-indigo-100 dark:border-indigo-900/30 dark:bg-indigo-950/20">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Taxable Subtotal</span>
                <p className="mt-1 text-xl font-black text-slate-900 dark:text-white">{inr(calcSubtotal)}</p>
              </div>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">GST / Tax Amount</span>
                <p className="mt-1 text-xl font-black text-slate-900 dark:text-white">{inr(calcTaxTotal)}</p>
              </div>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Grand Total Inward</span>
                <p className="mt-1 text-2xl font-black text-indigo-700 dark:text-indigo-300">{inr(calcTotal)}</p>
              </div>
            </div>
          </div>

          {/* Section 3: Payment Settlement Tender & Notes */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-white/5">
              <CreditCard className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white">
                3. Payment Settlement Tender
              </h2>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Payment Method Selector */}
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Payment Mode *
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e: any) => setPaymentMethod(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold outline-none transition focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                >
                  <option value="cash">Full Cash Payment (Immediate Cash Drawer Outflow)</option>
                  <option value="bank">Full Bank Transfer / NEFT / UPI (Bank Account Outflow)</option>
                  <option value="credit">100% Credit (Supplier Balance Due)</option>
                  <option value="partial">Partial Payment (Split Cash Paid & Credit Due)</option>
                </select>
              </div>

              {/* Partial Amount Input */}
              {paymentMethod === "partial" ? (
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Immediate Cash Amount Paid (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold outline-none transition focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                  />
                  <div className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-semibold">
                    Remaining Due to Supplier: {inr(Math.max(0, calcTotal - (Number(paidAmount) || 0)))}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Settlement Status
                  </label>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-700 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300">
                    {paymentMethod === "credit"
                      ? `Full Liability: ${inr(calcTotal)} payable to supplier`
                      : `Fully Settled: ${inr(calcTotal)} paid immediately`}
                  </div>
                </div>
              )}
            </div>

            {/* Bill Notes */}
            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                Inward Stock Notes / Delivery Remarks
              </label>
              <input
                type="text"
                placeholder="e.g. Received via Blue Dart Courier, Challan #4421, goods verified intact"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold outline-none transition focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>

            {errorMsg && (
              <div className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                {errorMsg}
              </div>
            )}
          </div>

          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-white/10 dark:bg-slate-900">
            <div>
              <span className="text-xs text-slate-400">Grand Bill Total:</span>
              <p className="text-2xl font-black text-indigo-700 dark:text-indigo-300">
                {inr(calcTotal)}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/purchases"
                className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 transition"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 transition disabled:opacity-60"
              >
                {saving ? "Posting Inward Purchase..." : "Confirm & Post Purchase Bill"}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
