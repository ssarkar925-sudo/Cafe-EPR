"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import SettingsSection from "@/components/settings/settings-section";
import { CURRENCIES, inputClass, labelClass } from "@/components/settings/settings-config";
import { generateQrDataUrl, generateUpiString } from "@/lib/qr";

export type ShopForm = {
  shopName: string;
  setShopName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  address: string;
  setAddress: (v: string) => void;
  footer: string;
  setFooter: (v: string) => void;
  currency: string;
  setCurrency: (v: string) => void;
  gstin: string;
  setGstin: (v: string) => void;
  taxRate: string;
  setTaxRate: (v: string) => void;
  logoUrl: string | null;
  setLogoUrl: (v: string | null) => void;
  upiId?: string;
  setUpiId?: (v: string) => void;
};

export default function ShopPanel({ tab, form }: { tab: string; form: ShopForm }) {
  const supabase = createClient();
  const { showToast, toastView } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [previewMode, setPreviewMode] = useState<"thermal" | "a4">("thermal");

  const [printFormat, setPrintFormat] = useState<"a4" | "thermal">(() => {
    if (typeof window === "undefined") return "a4";
    try {
      return localStorage.getItem("sccomm-pos-print-format") === "thermal" ? "thermal" : "a4";
    } catch {
      return "a4";
    }
  });

  const {
    shopName,
    setShopName,
    phone,
    setPhone,
    address,
    setAddress,
    footer,
    setFooter,
    currency,
    setCurrency,
    gstin,
    setGstin,
    taxRate,
    setTaxRate,
    logoUrl,
    setLogoUrl,
    upiId = "",
    setUpiId = () => {},
  } = form;

  // Generate live preview QR code whenever UPI ID or Shop Name changes
  useEffect(() => {
    let active = true;
    async function updateQr() {
      if (!upiId?.trim()) {
        setQrDataUrl("");
        return;
      }
      const upiUri = generateUpiString({
        upiId: upiId.trim(),
        name: shopName.trim() || "Cafe ERP",
        amount: 250.0,
        note: "Invoice #INV-SAMPLE",
      });
      const url = await generateQrDataUrl(upiUri, { width: 140, margin: 1 });
      if (active) setQrDataUrl(url);
    }
    updateQr();
    return () => {
      active = false;
    };
  }, [upiId, shopName]);

  function selectPrintFormat(fmt: "a4" | "thermal") {
    setPrintFormat(fmt);
    setPreviewMode(fmt);
    try {
      localStorage.setItem("sccomm-pos-print-format", fmt);
      showToast(
        "success",
        fmt === "a4"
          ? "Default print layout set to A4 Tax Invoice"
          : "Default print layout set to 80mm Thermal Receipt"
      );
    } catch {}
  }

  async function uploadLogo(file: File) {
    setUploading(true);
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "png";
    const path = `logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
    setUploading(false);
    if (error) {
      showToast("error", error.message);
      return;
    }
    const { data } = supabase.storage.from("logos").getPublicUrl(path);
    setLogoUrl(data.publicUrl);
    showToast("success", "Shop logo updated successfully");
  }

  function handleGstinChange(val: string) {
    setGstin(val.toUpperCase().replace(/[^A-Z0-9]/g, ""));
  }

  const isGstinValid = !gstin || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin);

  function printSampleReceipt() {
    const printWindow = window.open("", "_blank", "width=450,height=650");
    if (!printWindow) {
      showToast("error", "Popup blocked by browser. Please allow popups to test print.");
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Print - ${shopName || "Cafe ERP"}</title>
          <style>
            @page { margin: 0; size: 80mm auto; }
            body { font-family: monospace; width: 72mm; margin: 0 auto; padding: 10px 0; font-size: 12px; color: #000; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .bold { font-weight: bold; }
            .divider { border-top: 1px dashed #000; margin: 8px 0; }
            .row { display: flex; justify-content: space-between; }
            .qr-img { width: 120px; height: 120px; margin: 6px auto; display: block; }
          </style>
        </head>
        <body>
          <div class="text-center">
            <div class="bold" style="font-size: 16px;">${shopName || "CAFE ERP"}</div>
            <div>${address || "Shop Address Line"}</div>
            <div>Tel: ${phone || "+91 98XXXXXXXX"}</div>
            ${gstin ? `<div>GSTIN: ${gstin}</div>` : ""}
          </div>
          <div class="divider"></div>
          <div class="row"><span>Date: ${new Date().toLocaleDateString("en-IN")}</span><span>Time: ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span></div>
          <div class="row"><span>Invoice: #INV-SAMPLE</span><span>Cashier: Admin</span></div>
          <div class="divider"></div>
          <div class="row bold"><span>Item</span><span>Qty x Rate</span><span>Amt</span></div>
          <div class="divider"></div>
          <div class="row"><span>A4 Color Print</span><span>5 x 10.00</span><span>50.00</span></div>
          <div class="row"><span>PVC Card Lamination</span><span>2 x 30.00</span><span>60.00</span></div>
          <div class="row"><span>Online Form Fillup</span><span>1 x 140.00</span><span>140.00</span></div>
          <div class="divider"></div>
          <div class="row bold" style="font-size: 14px;"><span>TOTAL DUE</span><span>₹ 250.00</span></div>
          <div class="row"><span>Payment Mode</span><span>UPI / Cash</span></div>
          <div class="divider"></div>
          ${qrDataUrl ? `<div class="text-center"><img src="${qrDataUrl}" class="qr-img" /><div>Scan & Pay via UPI</div></div><div class="divider"></div>` : ""}
          <div class="text-center" style="font-size: 11px; white-space: pre-line;">${footer || "Thank you for visiting!\nHave a great day!"}</div>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }

  return (
    <>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Side: Form Controls */}
        <div className="space-y-6 lg:col-span-7">
          {/* TAB 1: Shop Profile & Identity */}
          <div className={tab === "general" ? "space-y-6" : "hidden"}>
            <SettingsSection
              icon="M3 9a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9ZM3 14h6m0 0 2-2m-2 2 2 2"
              tone="blue"
              title="Shop Branding & Contact"
              desc="Header information printed on top of all invoices and thermal roll slips."
            >
              {/* Logo Uploader */}
              <div className="flex items-center gap-4 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.02]">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-white shadow-sm transition hover:border-blue-500 dark:border-white/20 dark:bg-slate-800"
                >
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-2xl font-black text-slate-400 group-hover:text-blue-600">+</span>
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                    {logoUrl ? "Shop Header Logo" : "Upload Shop Logo"}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Square PNG/JPG format. Displays on A4 tax invoices and sidebar.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      {uploading ? "Uploading…" : logoUrl ? "Change Logo" : "Choose File"}
                    </button>
                    {logoUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setLogoUrl(null);
                          showToast("success", "Logo removed");
                        }}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-600 transition hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadLogo(f);
                    e.target.value = "";
                  }}
                />
              </div>

              {/* Text Fields */}
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelClass}>Shop / Business Name *</label>
                  <input
                    required
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    placeholder="e.g. Saikat Communication & Cyber Cafe"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Customer Care Phone</label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98XXXXXXXX"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Billing Currency Symbol</label>
                  <input
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    list="currencies"
                    maxLength={4}
                    className={inputClass}
                  />
                  <datalist id="currencies">
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Physical Address (Printed on Bill)</label>
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g. Station Road, Near Post Office, Pin - 700001"
                    className={inputClass}
                  />
                </div>
              </div>
            </SettingsSection>
          </div>

          {/* TAB 2: Receipt & Format Settings */}
          <div className={tab === "receipt" ? "space-y-6" : "hidden"}>
            <SettingsSection
              icon="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8"
              tone="blue"
              title="Default POS Print Layout"
              desc="Choose whether Pay & Print generates full A4 Tax Invoices or 80mm roll receipts."
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => selectPrintFormat("a4")}
                  className={`rounded-2xl p-4 text-left transition ${
                    printFormat === "a4"
                      ? "border-2 border-blue-500 bg-blue-50/60 shadow-sm dark:border-blue-500 dark:bg-blue-950/30"
                      : "border border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-slate-900"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">📄</span>
                    <span className="font-extrabold text-slate-900 dark:text-white">A4 Tax Invoice</span>
                    {printFormat === "a4" && (
                      <span className="ml-auto rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    Full-page formal A4 invoice with letterhead, GSTIN table, HSN breakdown, dynamic UPI QR, and PDF download.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => selectPrintFormat("thermal")}
                  className={`rounded-2xl p-4 text-left transition ${
                    printFormat === "thermal"
                      ? "border-2 border-blue-500 bg-blue-50/60 shadow-sm dark:border-blue-500 dark:bg-blue-950/30"
                      : "border border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-slate-900"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🧾</span>
                    <span className="font-extrabold text-slate-900 dark:text-white">80mm Thermal Receipt</span>
                    {printFormat === "thermal" && (
                      <span className="ml-auto rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    Fast roll slip for 80mm / 58mm ESC/POS thermal printers with dynamic UPI QR code and item summary.
                  </p>
                </button>
              </div>
            </SettingsSection>

            {/* UPI QR Settings */}
            <SettingsSection
              icon="M12 2a10 10 0 0 0-8.66 15L2 22l5-1.34A10 10 0 1 0 12 2z"
              tone="emerald"
              title="Shop UPI Payment QR Code"
              desc="Printed on invoices and thermal receipts for instant customer payment."
            >
              <div>
                <label className={labelClass}>Shop UPI ID (VPA)</label>
                <input
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="e.g. 9876543210@upi or storename@okaxis"
                  className={inputClass}
                />
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  When configured, customer bills automatically display a dynamic QR code that pre-fills the exact bill total on Google Pay, PhonePe, or Paytm.
                </p>
              </div>
            </SettingsSection>

            {/* Custom Footer */}
            <SettingsSection
              icon="M6 2h12a1 1 0 0 1 1 1v18l-2.5-1.5L14 21l-2.5-1.5L9 21l-2.5-1.5L5 21V3a1 1 0 0 1 1-1Z"
              tone="violet"
              title="Receipt Footer Message"
              desc="Printed at the very bottom of every bill."
            >
              <div>
                <label className={labelClass}>Footer Text / Terms</label>
                <textarea
                  rows={3}
                  value={footer}
                  onChange={(e) => setFooter(e.target.value)}
                  placeholder={"Thank you for shopping!\nGoods once sold are subject to store warranty."}
                  className={inputClass}
                />
              </div>
            </SettingsSection>
          </div>

          {/* TAB 3: GST & Tax Registration */}
          <div className={tab === "tax" ? "space-y-6" : "hidden"}>
            <SettingsSection
              icon="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8"
              tone="emerald"
              title="GST Registration & Defaults"
              desc="Printed on all tax invoices and GST reports."
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <div className="flex items-center justify-between">
                    <label className={labelClass}>GSTIN Number</label>
                    {gstin && (
                      <span
                        className={`text-[10px] font-bold ${
                          isGstinValid ? "text-emerald-600" : "text-amber-600"
                        }`}
                      >
                        {isGstinValid ? "Valid Format ✓" : "15 chars required"}
                      </span>
                    )}
                  </div>
                  <input
                    value={gstin}
                    onChange={(e) => handleGstinChange(e.target.value)}
                    placeholder="19ABCDE1234F1Z5"
                    maxLength={15}
                    className={`${inputClass} font-mono uppercase tracking-wider`}
                  />
                </div>
                <div>
                  <label className={labelClass}>Default Informational Tax Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                    placeholder="18"
                    className={inputClass}
                  />
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                GSTIN is printed on formal tax invoices and verified in monthly GSTR-1 preparation summaries.
              </p>
            </SettingsSection>
          </div>
        </div>

        {/* Right Side: Real-Time Interactive Live Receipt Simulation */}
        <div className="lg:col-span-5">
          <div className="sticky top-6 space-y-4">
            <div className="overflow-hidden rounded-[24px] border border-slate-200/90 bg-white shadow-lg dark:border-white/10 dark:bg-slate-900">
              {/* Preview Header Bar */}
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-white/5 dark:bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-600 text-xs text-white">
                    🧾
                  </span>
                  <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                    Live Receipt Simulation
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPreviewMode("thermal")}
                    className={`rounded-lg px-2 py-1 text-[10px] font-extrabold transition ${
                      previewMode === "thermal"
                        ? "bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300"
                        : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
                    }`}
                  >
                    80mm Thermal
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode("a4")}
                    className={`rounded-lg px-2 py-1 text-[10px] font-extrabold transition ${
                      previewMode === "a4"
                        ? "bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300"
                        : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
                    }`}
                  >
                    A4 Tax
                  </button>
                </div>
              </div>

              {/* Simulated Receipt Body */}
              <div className="p-5">
                {previewMode === "thermal" ? (
                  /* 80mm POS Roll Simulator */
                  <div className="mx-auto max-w-[280px] rounded-xl border border-dashed border-slate-300 bg-[#fdfbf7] p-4 font-mono text-[11px] text-slate-800 shadow-sm">
                    {/* Header */}
                    <div className="text-center">
                      <p className="text-sm font-black tracking-tight text-slate-950">
                        {shopName || "YOUR SHOP NAME"}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-600">
                        {address || "Shop Address Line, City, PIN"}
                      </p>
                      <p className="text-[10px] text-slate-600">Tel: {phone || "+91 98XXXXXXXX"}</p>
                      {gstin && <p className="text-[10px] font-bold text-slate-900">GSTIN: {gstin}</p>}
                    </div>

                    <div className="my-2.5 border-t border-dashed border-slate-400" />

                    {/* Metadata */}
                    <div className="flex justify-between text-[10px] text-slate-600">
                      <span>#INV-2026-0042</span>
                      <span>{new Date().toLocaleDateString("en-IN")}</span>
                    </div>

                    <div className="my-2 border-t border-dashed border-slate-400" />

                    {/* Items Table */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between font-bold text-slate-900">
                        <span>A4 Color Print (x5)</span>
                        <span>₹50.00</span>
                      </div>
                      <div className="flex justify-between font-bold text-slate-900">
                        <span>PVC Lamination (x2)</span>
                        <span>₹60.00</span>
                      </div>
                      <div className="flex justify-between font-bold text-slate-900">
                        <span>Online Service Fillup</span>
                        <span>₹140.00</span>
                      </div>
                    </div>

                    <div className="my-2.5 border-t border-dashed border-slate-400" />

                    {/* Total */}
                    <div className="flex justify-between text-xs font-black text-slate-950">
                      <span>NET PAYABLE</span>
                      <span>₹ 250.00</span>
                    </div>
                    <div className="mt-0.5 flex justify-between text-[10px] text-slate-500">
                      <span>Payment: UPI / QR</span>
                      <span>Status: PAID ✓</span>
                    </div>

                    {/* Dynamic QR */}
                    {qrDataUrl && (
                      <div className="mt-3 text-center">
                        <div className="mx-auto w-24 overflow-hidden rounded-lg border border-slate-300 bg-white p-1 shadow-inner">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={qrDataUrl} alt="UPI QR" className="h-full w-full" />
                        </div>
                        <p className="mt-1 text-[9px] font-bold text-slate-700">Scan &amp; Pay via UPI</p>
                        <p className="truncate text-[8px] text-slate-400">{upiId}</p>
                      </div>
                    )}

                    <div className="my-2.5 border-t border-dashed border-slate-400" />

                    {/* Footer */}
                    <div className="text-center text-[10px] leading-relaxed text-slate-600">
                      <p className="whitespace-pre-line">
                        {footer || "Thank you for shopping!\nVisit again."}
                      </p>
                    </div>
                  </div>
                ) : (
                  /* A4 Tax Invoice Simulator */
                  <div className="rounded-xl border border-slate-200 bg-white p-4 text-[10px] text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-300">
                    <div className="flex items-start justify-between border-b pb-3 dark:border-white/10">
                      <div>
                        <h4 className="text-xs font-black text-slate-900 dark:text-white">
                          {shopName || "YOUR SHOP NAME"}
                        </h4>
                        <p className="text-[9px] text-slate-500 dark:text-slate-400">
                          {address || "Shop Address Line"}
                        </p>
                        <p className="text-[9px] text-slate-500 dark:text-slate-400">
                          Phone: {phone || "+91 98XXXXXXXX"}
                        </p>
                        {gstin && (
                          <p className="text-[9px] font-bold text-blue-600 dark:text-blue-400">
                            GSTIN: {gstin}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                          TAX INVOICE
                        </span>
                        <p className="mt-1 text-[9px] font-bold text-slate-900 dark:text-white">
                          #INV-2026-0042
                        </p>
                        <p className="text-[9px] text-slate-400">{new Date().toLocaleDateString("en-IN")}</p>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1.5 border-b pb-3 dark:border-white/10">
                      <div className="flex justify-between font-bold">
                        <span>A4 Color Print (Glossy) x 5</span>
                        <span>₹ 50.00</span>
                      </div>
                      <div className="flex justify-between font-bold">
                        <span>Lamination &amp; Binding x 2</span>
                        <span>₹ 60.00</span>
                      </div>
                      <div className="flex justify-between font-bold">
                        <span>Cyber Services x 1</span>
                        <span>₹ 140.00</span>
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between font-black text-slate-900 dark:text-white">
                      <span>Total Amount:</span>
                      <span>₹ 250.00</span>
                    </div>

                    <p className="mt-3 border-t pt-2 text-center text-[9px] text-slate-400 dark:border-white/5">
                      {footer || "Thank you for shopping with us!"}
                    </p>
                  </div>
                )}

                {/* Print Test Slip Button */}
                <button
                  type="button"
                  onClick={printSampleReceipt}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-xs font-extrabold text-white shadow-md transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                >
                  <span>🖨️ Test Thermal Slip Print</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {toastView}
    </>
  );
}