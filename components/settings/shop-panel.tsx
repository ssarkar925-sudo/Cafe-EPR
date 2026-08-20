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
};

export default function ShopPanel({ tab, form }: { tab: string; form: ShopForm }) {
  const supabase = createClient();
  const { showToast, toastView } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

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
          icon="M6 2h12a1 1 0 0 1 1 1v18l-2.5-1.5L14 21l-2.5-1.5L9 21l-2.5-1.5L5 21V3a1 1 0 0 1 1-1Z"
          tone="violet"
          title="Receipt"
          desc="Tail line printed on every 80mm receipt."
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