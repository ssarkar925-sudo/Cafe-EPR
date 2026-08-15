"use client";

import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type SettingsRow = {
  shop_name: string;
  phone: string | null;
  address: string | null;
  receipt_footer: string | null;
  currency_symbol: string;
  logo_url: string | null;
};

const CURRENCIES = ["₹", "$", "€", "£", "৳", "ر.س"];

export default function SettingsClient({
  initial,
}: {
  initial: SettingsRow | null;
}) {
  const [shopName, setShopName] = useState(initial?.shop_name ?? "SCC OMM Cafe");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [footer, setFooter] = useState(initial?.receipt_footer ?? "");
  const [currency, setCurrency] = useState(initial?.currency_symbol ?? "₹");
  const [logoUrl, setLogoUrl] = useState<string | null>(initial?.logo_url ?? null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const supabase = createClient();

  const dirty = useMemo(
    () =>
      shopName !== (initial?.shop_name ?? "SCC OMM Cafe") ||
      phone !== (initial?.phone ?? "") ||
      address !== (initial?.address ?? "") ||
      footer !== (initial?.receipt_footer ?? "") ||
      currency !== (initial?.currency_symbol ?? "₹") ||
      logoUrl !== (initial?.logo_url ?? null),
    [initial, shopName, phone, address, footer, currency, logoUrl]
  );

  function flash(type: "success" | "error", text: string) {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  }

  async function uploadLogo(file: File) {
    setUploading(true);
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "png";
    const path = `logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
    setUploading(false);
    if (error) {
      flash("error", error.message);
      return;
    }
    const { data } = supabase.storage.from("logos").getPublicUrl(path);
    setLogoUrl(data.publicUrl);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setToast(null);
    const { error } = await supabase
      .from("settings")
      .upsert({
        id: 1,
        shop_name: shopName.trim() || "SCC OMM Cafe",
        phone,
        address,
        receipt_footer: footer,
        currency_symbol: currency,
        logo_url: logoUrl,
      })
      .single();
    setSaving(false);
    if (error) {
      flash("error", error.message);
      return;
    }
    flash("success", "Settings saved.");
  }

  const inputClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const labelClass = "mb-1 block text-xs font-semibold text-slate-500";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="text-sm text-slate-500">Shop identity, receipt and appearance.</p>
        </div>
        <button
          onClick={() => (document.getElementById("save-settings") as HTMLButtonElement)?.click()}
          disabled={saving || !dirty}
          className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <form onSubmit={save} className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
                  <path d="M3 9a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9ZM3 14h6m0 0 2-2m-2 2 2 2" />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Shop Profile</h2>
                <p className="text-xs text-slate-400">Shown at the top of every thermal receipt.</p>
              </div>
            </div>

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
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
                  <path d="M6 2h12a1 1 0 0 1 1 1v18l-2.5-1.5L14 21l-2.5-1.5L9 21l-2.5-1.5L5 21V3a1 1 0 0 1 1-1Z" />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Receipt</h2>
                <p className="text-xs text-slate-400">Tail line printed on every 80mm receipt.</p>
              </div>
            </div>
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
          </section>

          <button type="submit" id="save-settings" className="hidden" />
        </form>

        <aside className="lg:sticky lg:top-6 h-fit">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Live receipt preview</p>
          <div className="rounded-2xl bg-slate-200 p-4 shadow-inner">
            <div className="mx-auto max-w-[260px] rounded bg-white p-4 font-mono text-xs leading-relaxed text-slate-900 shadow">
              <div className="text-center">
                {logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="Logo" className="mx-auto mb-1 h-10 w-10 rounded object-cover" />
                )}
                <p className="text-sm font-bold">{shopName || "Shop name"}</p>
                {address && <p>{address}</p>}
                {phone && <p>Ph: {phone}</p>}
              </div>
              <div className="my-2 border-t border-dashed border-slate-400" />
              <div className="flex justify-between">
                <span>Invoice</span>
                <span>INV-0001</span>
              </div>
              <div className="flex justify-between">
                <span>Date</span>
                <span>{new Date().toISOString().slice(0, 10)}</span>
              </div>
              <div className="my-2 border-t border-dashed border-slate-400" />
              <p>Sample Item</p>
              <div className="flex justify-between">
                <span className="pl-3">1 x {currency}100.00</span>
                <span>{currency}100.00</span>
              </div>
              <div className="my-2 border-t border-dashed border-slate-400" />
              <div className="flex justify-between text-sm font-bold">
                <span>TOTAL</span>
                <span>{currency}100.00</span>
              </div>
              {footer && (
                <>
                  <div className="my-2 border-t border-dashed border-slate-400" />
                  <div className="whitespace-pre-line text-center">{footer}</div>
                </>
              )}
            </div>
          </div>
        </aside>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div
            className={`rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg ${
              toast.type === "success" ? "bg-emerald-600" : "bg-rose-600"
            }`}
          >
            {toast.text}
          </div>
        </div>
      )}
    </div>
  );
}
