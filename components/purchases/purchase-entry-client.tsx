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
      <div className="card-glow-indigo relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.04] via-white to-white p-6 shadow-xs transition-all duration-200 hover:shadow-md dark:border-indigo-500/30 dark:from-indigo-950/25 dark:via-slate-900 dark:to-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Link
                href="/purchases"
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white transition active:scale-95 duration-150"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Purchases History
              </Link>
              <span className="text-slate-300 dark:text-slate-700">/</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700 ring-1 ring-indigo-500/20 dark:bg-indigo-950/60 dark:text-indigo-300 dark:ring-indigo-500/30">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
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
              className="btn-3d-tactile-secondary inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 active:scale-95 duration-150 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
            >
              <Boxes className="h-3.5 w-3.5 text-indigo-500" />
              <span>Movements Journal</span>
            </Link>
            <Link
              href="/purchases"
              className="btn-3d-tactile-secondary inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 active:scale-95 duration-150 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
              <span>Purchases History</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Success Notification Banner */}
      {successBillNo && (
        <div className="card-glow-emerald rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.08] via-emerald-500/[0.02] to-white p-6 shadow-sm dark:border-emerald-500/40 dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-900">
          <div className="flex items-start gap-4">
            <div className="icon-box-3d flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-black text-emerald-950 dark:text-emerald-200">
                  Purchase Bill Successfully Recorded!
                </h3>
                <span className="font-mono text-xs font-bold rounded-full bg-emerald-100 px-2.5 py-0.5 text-emerald-800 ring-1 ring-emerald-500/20 dark:bg-emerald-950 dark:text-emerald-300">
                  Bill #{successBillNo}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-emerald-700/90 dark:text-emerald-300">
                Physical inventory has been restocked, moving weighted average costs have been recalculated, and supplier liabilities updated in Accounts Payable.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleResetForNewBill}
                  className="btn-3d-tactile-primary rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-black text-white shadow-sm hover:brightness-110 active:scale-95 duration-150 transition"
                >
                  + Record Another Purchase Bill
                </button>
                <Link
                  href="/purchases"
                  className="btn-3d-tactile-secondary rounded-xl border border-emerald-300 bg-white px-4 py-2 text-xs font-bold text-emerald-800 shadow-xs hover:bg-emerald-50 active:scale-95 duration-150 transition dark:border-white/10 dark:bg-slate-900 dark:text-emerald-300"
                >
                  View Inward History →
                </Link>
                <Link
                  href="/inventory/movements"
                  className="btn-3d-tactile-secondary rounded-xl border border-emerald-300 bg-white px-4 py-2 text-xs font-bold text-emerald-800 shadow-xs hover:bg-emerald-50 active:scale-95 duration-150 transition dark:border-white/10 dark:bg-slate-900 dark:text-emerald-300"
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
          <div className="card-glow-indigo rounded-2xl border border-indigo-500/20 bg-white p-6 shadow-xs transition hover:shadow-md dark:border-indigo-500/30 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div className="flex items-center gap-2.5">
                <div className="icon-box-3d flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-xs">
                  <Building2 className="h-4 w-4" />
                </div>
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  1. Supplier & Invoice Reference
                </h2>
              </div>
              <span className="text-[11px] font-bold text-slate-400">Step 1 of 3</span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* Supplier Selection */}
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Supplier / Vendor Master <span className="text-rose-500">*</span>
                </label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">Walk-in / Direct Unregistered Supplier</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code}) — Balance Due: {inr(s.current_balance)}
                    </option>
                  ))}
                </select>
                {selectedSupplierObj && (
                  <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-[11px] ring-1 ring-slate-200 dark:bg-slate-800/60 dark:ring-white/5">
                    <span className="text-slate-600 dark:text-slate-400">
                      Account: <strong className="text-slate-900 dark:text-white">{selectedSupplierObj.name}</strong>
                    </span>
                    <span className={`font-mono font-bold ${Number(selectedSupplierObj.current_balance) > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                      Khata Balance: {inr(selectedSupplierObj.current_balance)}
                    </span>
                  </div>
                )}
              </div>

              {/* Purchase Date */}
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Inward Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-white"
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
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Product Line Items */}
          <div className="card-glow-indigo rounded-2xl border border-indigo-500/20 bg-white p-6 shadow-xs transition hover:shadow-md dark:border-indigo-500/30 dark:bg-slate-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div className="flex items-center gap-2.5">
                <div className="icon-box-3d flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-xs">
                  <Boxes className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
                    2. Received Product Items & Moving WAC Recalculation
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Real-time weighted average costing simulation on stock addition
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={addItemRow}
                className="btn-3d-tactile-primary inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-black text-white shadow-sm hover:bg-indigo-700 active:scale-95 duration-150 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Product Row</span>
              </button>
            </div>

            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50/75 text-slate-600 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-400">
                  <tr>
                    <th className="py-3 px-4 font-black uppercase tracking-wider">Product Master Item</th>
                    <th className="py-3 px-4 font-black uppercase tracking-wider w-32">Inward Qty</th>
                    <th className="py-3 px-4 font-black uppercase tracking-wider w-40">Purchase Rate (₹)</th>
                    <th className="py-3 px-4 font-black uppercase tracking-wider w-32">GST Rate %</th>
                    <th className="py-3 px-4 text-right font-black uppercase tracking-wider">Line Total (incl. tax)</th>
                    <th className="py-3 px-4 text-center font-black uppercase tracking-wider w-12"></th>
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
                      <tr key={idx} className="hover:bg-slate-50/70 dark:hover:bg-white/5 transition">
                        {/* Product Picker */}
                        <td className="py-3.5 px-4">
                          <select
                            value={it.product_id}
                            onChange={(e) => updateItemRow(idx, "product_id", e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                          >
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.code || "No SKU"}) — Current Stock: {p.stock_qty} @ ₹{p.cost_price}
                              </option>
                            ))}
                          </select>
                          <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="font-mono">
                              On-Hand: <strong className="text-slate-800 dark:text-slate-200">{curStock} units</strong>
                            </span>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-700 ring-1 ring-emerald-500/20 dark:bg-emerald-950/60 dark:text-emerald-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Simulated WAC: <strong className="font-mono">₹{previewWac}</strong>
                            </span>
                          </div>
                        </td>

                        {/* Quantity */}
                        <td className="py-3.5 px-4 align-top">
                          <input
                            type="number"
                            min="0.001"
                            step="any"
                            required
                            value={it.qty}
                            onChange={(e) => updateItemRow(idx, "qty", e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono font-bold outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                          />
                        </td>

                        {/* Purchase Rate (Excl Tax) */}
                        <td className="py-3.5 px-4 align-top">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            required
                            value={it.purchase_rate}
                            onChange={(e) => updateItemRow(idx, "purchase_rate", e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono font-bold outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                          />
                        </td>

                        {/* GST Rate */}
                        <td className="py-3.5 px-4 align-top">
                          <select
                            value={it.gst_rate}
                            onChange={(e) => updateItemRow(idx, "gst_rate", Number(e.target.value))}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                          >
                            <option value="0">0%</option>
                            <option value="5">5%</option>
                            <option value="12">12%</option>
                            <option value="18">18%</option>
                            <option value="28">28%</option>
                          </select>
                        </td>

                        {/* Line Total */}
                        <td className="py-3.5 px-4 text-right align-top font-mono font-black text-slate-900 dark:text-white text-sm">
                          {inr(lineTot)}
                        </td>

                        {/* Remove Action */}
                        <td className="py-3.5 px-4 text-center align-top">
                          <button
                            type="button"
                            onClick={() => removeItemRow(idx)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600 active:scale-95 duration-150 transition dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
                            title="Remove row"
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
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="card-glow-indigo rounded-2xl bg-gradient-to-br from-indigo-500/[0.06] via-white to-white p-4 border border-indigo-500/20 dark:border-indigo-500/30 dark:from-indigo-950/25 dark:via-slate-900 dark:to-slate-900">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Taxable Subtotal</span>
                  <div className="icon-box-3d flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400">
                    <FileText className="h-3.5 w-3.5" />
                  </div>
                </div>
                <p className="mt-1 font-mono text-2xl font-black tracking-tight tabular-nums text-slate-900 dark:text-white">{inr(calcSubtotal)}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">Before applicable GST</p>
              </div>

              <div className="card-glow-amber rounded-2xl bg-gradient-to-br from-amber-500/[0.06] via-white to-white p-4 border border-amber-500/20 dark:border-amber-500/30 dark:from-amber-950/25 dark:via-slate-900 dark:to-slate-900">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">GST / Tax Amount</span>
                  <div className="icon-box-3d flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                </div>
                <p className="mt-1 font-mono text-2xl font-black tracking-tight tabular-nums text-amber-700 dark:text-amber-300">{inr(calcTaxTotal)}</p>
                <p className="mt-0.5 text-[11px] text-amber-700/80 dark:text-amber-400">Input Tax Credit (ITC) claimable</p>
              </div>

              <div className="card-glow-emerald rounded-2xl bg-gradient-to-br from-emerald-500/[0.08] via-white to-white p-4 border border-emerald-500/30 dark:border-emerald-500/40 dark:from-emerald-950/30 dark:via-slate-900 dark:to-slate-900">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Grand Total Inward</span>
                  <div className="icon-box-3d flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </div>
                </div>
                <p className="mt-1 font-mono text-2xl font-black tracking-tight tabular-nums text-emerald-700 dark:text-emerald-300">{inr(calcTotal)}</p>
                <p className="mt-0.5 text-[11px] text-emerald-700/80 dark:text-emerald-400">Total payable liability</p>
              </div>
            </div>
          </div>

          {/* Section 3: Payment Settlement Tender & Notes */}
          <div className="card-glow-indigo rounded-2xl border border-indigo-500/20 bg-white p-6 shadow-xs transition hover:shadow-md dark:border-indigo-500/30 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div className="flex items-center gap-2.5">
                <div className="icon-box-3d flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-xs">
                  <CreditCard className="h-4 w-4" />
                </div>
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  3. Payment Settlement Tender
                </h2>
              </div>
              <span className="text-[11px] font-bold text-slate-400">Step 3 of 3</span>
            </div>

            {/* Payment Method Selector Tiles */}
            <div className="mt-4">
              <label className="mb-2 block text-xs font-bold text-slate-700 dark:text-slate-300">
                Settlement Tender Mode <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  {
                    id: "cash",
                    label: "Full Cash",
                    desc: "Immediate drawer outflow",
                    icon: Banknote,
                  },
                  {
                    id: "bank",
                    label: "Bank / NEFT / UPI",
                    desc: "Bank account outflow",
                    icon: Building2,
                  },
                  {
                    id: "credit",
                    label: "100% Credit",
                    desc: "Full supplier liability",
                    icon: CreditCard,
                  },
                  {
                    id: "partial",
                    label: "Partial Split",
                    desc: "Split cash & credit due",
                    icon: Sparkles,
                  },
                ].map((mode) => {
                  const Icon = mode.icon;
                  const active = paymentMethod === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setPaymentMethod(mode.id as any)}
                      className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all duration-150 active:scale-95 ${
                        active
                          ? "border-indigo-600 bg-indigo-50/75 shadow-xs ring-2 ring-indigo-600/30 dark:border-indigo-500 dark:bg-indigo-950/50"
                          : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/75 dark:border-white/10 dark:bg-slate-800/60 dark:hover:bg-slate-800"
                      }`}
                    >
                      <div className="flex w-full items-center justify-between">
                        <Icon
                          className={`h-4 w-4 ${
                            active ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400"
                          }`}
                        />
                        {active && (
                          <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-pulse" />
                        )}
                      </div>
                      <span
                        className={`mt-2 text-xs font-black ${
                          active ? "text-indigo-950 dark:text-white" : "text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {mode.label}
                      </span>
                      <span className="mt-0.5 text-[10px] text-slate-400">{mode.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Partial Amount Input or Settlement Status */}
              {paymentMethod === "partial" ? (
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Immediate Cash Amount Paid (₹) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-mono font-bold outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                  />
                  <div className="mt-1.5 flex items-center justify-between rounded-lg bg-rose-50 px-3 py-1 text-xs text-rose-700 ring-1 ring-rose-500/20 dark:bg-rose-950/40 dark:text-rose-300">
                    <span>Remaining Due to Supplier:</span>
                    <strong className="font-mono">{inr(Math.max(0, calcTotal - (Number(paidAmount) || 0)))}</strong>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Settlement Status
                  </label>
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-700 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300">
                    <span>
                      {paymentMethod === "credit"
                        ? "Full Supplier Liability"
                        : "Immediate Outflow Cleared"}
                    </span>
                    <span className="font-mono font-black text-indigo-700 dark:text-indigo-300">
                      {paymentMethod === "credit" ? inr(calcTotal) + " due" : inr(calcTotal) + " paid"}
                    </span>
                  </div>
                </div>
              )}

              {/* Bill Notes */}
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Inward Stock Notes / Delivery Remarks
                </label>
                <input
                  type="text"
                  placeholder="e.g. Received via Blue Dart Courier, Challan #4421, goods verified intact"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            {errorMsg && (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700 ring-1 ring-rose-500/20 dark:bg-rose-950/40 dark:text-rose-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* Action Bar */}
          <div className="card-glow-indigo flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-indigo-500/20 bg-white p-6 shadow-xs dark:border-indigo-500/30 dark:bg-slate-900">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Grand Bill Total Inward:</span>
              <p className="mt-0.5 font-mono text-2xl sm:text-3xl font-black tracking-tight text-indigo-700 dark:text-indigo-300 tabular-nums">
                {inr(calcTotal)}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/purchases"
                className="btn-3d-tactile-secondary rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 transition active:scale-95 duration-150"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="btn-3d-tactile-primary rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-2.5 text-xs font-black text-white shadow-md shadow-indigo-600/20 hover:brightness-110 active:scale-95 duration-150 disabled:opacity-60 transition"
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
