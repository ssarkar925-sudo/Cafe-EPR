"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import SettingsSection from "@/components/settings/settings-section";
import { CURRENCIES, inputClass, labelClass } from "@/components/settings/settings-config";

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
  const [printFormat, setPrintFormat] = useState<"a4" | "thermal">(() => {
    if (typeof window === "undefined") return "a4";
    try {
      return localStorage.getItem("sccomm-pos-print-format") === "thermal" ? "thermal" : "a4";
    } catch {
      return "a4";
    }
  });

  function selectPrintFormat(fmt: "a4" | "thermal") {
    setPrintFormat(fmt);
    try {
      localStorage.setItem("sccomm-pos-print-format", fmt);
      showToast("success", fmt === "a4" ? "Default print layout set to A4 Tax Invoice" : "Default print layout set to 80mm Thermal Receipt");
    } catch {}
  }

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
  }

  return (
    <>
      <div className={`mt-6 space-y-6 ${tab === "general" ? "" : "hidden"}`}>
        <SettingsSection
          icon="M3 9a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9ZM3 14h6m0 0 2-2m-2 2 2 2"
          tone="blue"
          title="Shop Profile"
          desc="Shown at the top of every thermal receipt."
        >
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl ring-2 ring-slate-200 transition hover:ring-blue-400"
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-slate-300">+</span>
              )}
            </button>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-700">{logoUrl ? "Shop logo" : "Add a shop logo"}</p>
              <p className="text-xs text-slate-400">PNG/JPG, square works best</p>
              <div className="mt-1.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  {uploading ? "Uploading…" : logoUrl ? "Change" : "Upload"}
                </button>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={() => setLogoUrl(null)}
                    className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
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

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass}>Shop name *</label>
              <input required value={shopName} onChange={(e) => setShopName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98XXXXXXXX" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Currency</label>
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
              <label className={labelClass}>Address</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Shop address for the receipt" className={inputClass} />
            </div>
          </div>
        </SettingsSection>
      </div>

      <div className={`mt-6 space-y-6 ${tab === "receipt" ? "" : "hidden"}`}>
        <SettingsSection
          icon="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8"
          tone="blue"
          title="Default POS Print Layout"
          desc="Choose whether Pay & Print generates full A4 Tax Invoices / PDF or 80mm roll receipts."
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => selectPrintFormat("a4")}
              className={`text-left rounded-2xl p-4 transition ${
                printFormat === "a4"
                  ? "border-2 border-blue-500 bg-blue-50/40 dark:border-blue-600 dark:bg-blue-950/20 shadow-sm"
                  : "border border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-slate-900 dark:hover:border-white/20"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">📄</span>
                <span className="font-bold text-slate-900 dark:text-white">A4 Tax Invoice / PDF</span>
                {printFormat === "a4" && (
                  <span className="ml-auto rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                    Active (Default)
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                Full-page professional A4 tax invoice with shop letterhead, GSTIN, customer details, HSN table, and PDF download.
              </p>
            </button>

            <button
              type="button"
              onClick={() => selectPrintFormat("thermal")}
              className={`text-left rounded-2xl p-4 transition ${
                printFormat === "thermal"
                  ? "border-2 border-blue-500 bg-blue-50/40 dark:border-blue-600 dark:bg-blue-950/20 shadow-sm"
                  : "border border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-slate-900 dark:hover:border-white/20"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">🧾</span>
                <span className="font-bold text-slate-900 dark:text-white">80mm Thermal Receipt</span>
                {printFormat === "thermal" && (
                  <span className="ml-auto rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                    Active
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                Compact slip for fast thermal roll POS printers.
              </p>
            </button>
          </div>
        </SettingsSection>

        <SettingsSection
          icon="M6 2h12a1 1 0 0 1 1 1v18l-2.5-1.5L14 21l-2.5-1.5L9 21l-2.5-1.5L5 21V3a1 1 0 0 1 1-1Z"
          tone="violet"
          title="Receipt & Invoice Footer"
          desc="Custom tail note printed at the bottom of bills and receipts."
        >
          <div>
            <label className={labelClass}>Receipt footer</label>
            <textarea
              rows={3}
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
              placeholder={"Thank you for shopping!\nVisit again"}
              className={inputClass}
            />
          </div>
        </SettingsSection>

        <SettingsSection
          icon="M12 2a10 10 0 0 0-8.66 15L2 22l5-1.34A10 10 0 1 0 12 2z"
          tone="emerald"
          title="UPI Payment QR Code"
          desc="Set your default Shop UPI ID for dynamic QR codes generated on invoices and receipts."
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
              When configured, all A4 tax invoices, downloadable PDFs, and 80mm thermal receipts automatically print a dynamic UPI QR code with pre-filled invoice amount.
            </p>
          </div>
        </SettingsSection>
      </div>

      <div className={`mt-6 space-y-6 ${tab === "tax" ? "" : "hidden"}`}>
        <SettingsSection
          icon="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8"
          tone="emerald"
          title="GST Registration"
          desc="Printed on receipts when filled in."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>GSTIN</label>
              <input
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
                placeholder="22ABCDE1234F1Z5"
                maxLength={15}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Default tax rate (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                placeholder="0"
                className={inputClass}
              />
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            The rate is informational for receipts. Billing applies tax only through invoice
            discount/line entries — there is no automatic tax engine.
          </p>
        </SettingsSection>
      </div>

      {toastView}
    </>
  );
}