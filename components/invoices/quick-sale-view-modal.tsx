"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import Modal from "@/components/ui/modal";
import { logAudit } from "@/lib/audit";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { generateUpiString, generateQrDataUrl } from "@/lib/qr";

type Detail = {
  id: string;
  sale_number: string;
  sale_date: string;
  amount: number | string;
  cost: number | string;
  tendered: number | string | null;
  change_due: number | string;
  status: string;
  created_at?: string;
  customers: { name: string; phone?: string | null; address?: string | null } | null;
  payments?: { method: string; instrument_id?: string; amount: number | string }[];
};

type LineItem = {
  id: string;
  item_name: string | null;
  qty: number | string;
  rate: number | string;
  amount: number | string;
  cost: number | string;
  products: { name: string; unit?: string | null } | null;
  services: { name: string } | null;
};

export default function QuickSaleViewModal({
  saleId,
  onClose,
  onCancelled,
}: {
  saleId: string;
  onClose: () => void;
  onCancelled?: (id: string) => void;
}) {
  const supabase = createClient();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [waSending, setWaSending] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [upiId, setUpiId] = useState<string>("");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      const [sRes, itmsRes, setsRes, defaultQrRes, upiInstRes] = await Promise.all([
        supabase
          .from("quick_sales")
          .select("*, customers(name, phone, address)")
          .eq("id", saleId)
          .single(),
        supabase
          .from("quick_sale_items")
          .select("*, products(name, unit), services(name)")
          .eq("quick_sale_id", saleId),
        supabase.from("settings").select("*").single(),
        supabase.from("upi_merchant_qrs").select("upi_id").eq("is_active", true).limit(1).maybeSingle(),
        supabase.from("payment_instruments").select("account_number").eq("type", "upi").eq("is_active", true).limit(1).maybeSingle(),
      ]);

      if (sRes.error) {
        if (active) {
          setError(sRes.error.message);
          setLoading(false);
        }
        return;
      }

      if (active) {
        setDetail(sRes.data as Detail);
        setItems((itmsRes.data ?? []) as LineItem[]);

        const computedUpi =
          (setsRes.data as any)?.upi_id ||
          defaultQrRes.data?.upi_id ||
          upiInstRes.data?.account_number ||
          "";
        setUpiId(computedUpi);

        if (computedUpi && sRes.data) {
          const str = generateUpiString({
            upiId: computedUpi,
            name: setsRes.data?.shop_name || "Shop",
            amount: Number(sRes.data.amount),
            note: `Receipt ${sRes.data.sale_number}`,
          });
          const dataUrl = await generateQrDataUrl(str, { width: 150 });
          setQrDataUrl(dataUrl);
        }

        setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [saleId, supabase]);

  async function handleCancel() {
    if (!detail) return;
    if (!window.confirm(`Cancel ${detail.sale_number} (${inr(Number(detail.amount))})? Payment entries will be reversed and inventory restored.`)) return;
    setCancelling(true);
    const { error: err } = await supabase.rpc("cancel_quick_sale", { p_sale_id: detail.id });
    setCancelling(false);
    if (err) {
      setError(err.message);
      return;
    }
    logAudit({
      action: "cancel",
      entity: "quick_sale",
      entity_id: detail.id,
      description: `Quick sale cancelled: ${detail.sale_number} (${inr(Number(detail.amount))})`,
    });
    setDetail((prev) => (prev ? { ...prev, status: "cancelled" } : null));
    if (onCancelled) onCancelled(detail.id);
  }

  async function handleSendWhatsApp() {
    if (!detail) return;
    setWaSending(true);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const receiptUrl = `${origin}/receipt/quick/${detail.id}`;
    const phone = detail.customers?.phone || "";
    const itemName = items.map((i) => i.item_name ?? i.products?.name ?? i.services?.name ?? "Item").join(", ") || "Quick sale";
    const msg = `🧾 *RECEIPT: ${detail.sale_number}*\n📅 Date: ${detail.sale_date}\n👤 Customer: ${detail.customers?.name ?? "Walk-in"}\n───────────────\n📦 Items: ${itemName}\n💰 Amount Paid: ${inr(Number(detail.amount))}\n───────────────\n📄 View / Download Receipt:\n${receiptUrl}\n\nThank you for your business!`;

    const res = await sendWhatsAppMessage({ phone, message: msg });
    setWaSending(false);
    if (res.ok) {
      setToastMsg("✓ Receipt sent via WhatsApp successfully!");
      setTimeout(() => setToastMsg(null), 3000);
    } else {
      window.open(res.fallbackUrl, "_blank", "noopener");
    }
  }

  return (
    <Modal
      onClose={onClose}
      accent="emerald"
      size="xl"
      title={
        <div className="flex items-center gap-2">
          <span>Quick Sale {detail?.sale_number || ""}</span>
          {detail && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ${
                detail.status === "cancelled"
                  ? "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-white/10"
                  : "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/40"
              }`}
            >
              {detail.status}
            </span>
          )}
        </div>
      }
    >
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <p className="text-sm text-slate-400">Loading quick sale details…</p>
        </div>
      ) : error ? (
        <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
      ) : detail ? (
        <div className="space-y-4">
          {toastMsg && (
            <div className="rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
              {toastMsg}
            </div>
          )}

          {/* Customer & Sale Metadata */}
          <div className="grid grid-cols-1 gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Customer</p>
              <p className="mt-0.5 text-sm font-bold text-slate-900">{detail.customers?.name || "Walk-in Customer"}</p>
              {detail.customers?.phone && (
                <p className="text-xs text-slate-500">📱 {detail.customers.phone}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Date & Time</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">
                {detail.sale_date}
                {detail.created_at && (
                  <span className="ml-1.5 text-xs text-slate-400">
                    ({new Date(detail.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })})
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Items Table */}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Items Purchased</p>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Item Description</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {items.length > 0 ? (
                    items.map((it) => (
                      <tr key={it.id} className="hover:bg-slate-50/50">
                        <td className="px-3 py-2.5 font-medium text-slate-900">
                          {it.products?.name || it.services?.name || it.item_name || "Quick sale item"}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-600">{it.qty}</td>
                        <td className="px-3 py-2.5 text-right text-slate-600">{inr(Number(it.rate))}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-slate-900">{inr(Number(it.amount))}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-3 py-2.5 font-medium text-slate-900">
                        {detail.customers?.name ? `Quick sale (${detail.customers.name})` : "Quick sale item"}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-600">1</td>
                      <td className="px-3 py-2.5 text-right text-slate-600">{inr(Number(detail.amount))}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-slate-900">{inr(Number(detail.amount))}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Financial Summary */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-600">Total Collected</span>
              <span className="text-base font-bold text-emerald-600">{inr(Number(detail.amount))}</span>
            </div>
            {Number(detail.tendered) > 0 && (
              <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500">
                <span>Tendered: {inr(Number(detail.tendered))}</span>
                {Number(detail.change_due) > 0 && (
                  <span>Change Given: {inr(Number(detail.change_due))}</span>
                )}
              </div>
            )}
          </div>

          {qrDataUrl && detail.status !== "cancelled" && (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-white/10 dark:bg-slate-800/50">
              <img
                src={qrDataUrl}
                alt="UPI Payment QR"
                className="h-20 w-20 rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-white/10"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-900 dark:text-white">
                  📱 Scan &amp; Pay via UPI ({inr(Number(detail.amount))})
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  GPay · PhonePe · Paytm · BHIM
                </p>
                {upiId && (
                  <p className="mt-1 font-mono text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                    {upiId}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <div className="flex items-center gap-2">
              <a
                href={`/receipt/quick/${detail.id}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />
                </svg>
                Print 80mm Receipt
              </a>
              <button
                type="button"
                onClick={handleSendWhatsApp}
                disabled={waSending}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100 disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path d="M16.75 13.96c.25.13.41.2.46.3.06.11.04.61-.21 1.18-.25.56-.68.92-1.21.99-.48.06-1.1.04-1.79-.2a9.86 9.86 0 0 1-3.66-2.47 9.87 9.87 0 0 1-2.47-3.66c-.24-.69-.26-1.31-.2-1.79.07-.53.43-.96.99-1.21.57-.25 1.07-.27 1.18-.21.1.05.17.21.3.46l.7 1.63c.12.28.16.51.04.75-.12.24-.26.43-.44.64l-.27.31c-.13.15-.22.28-.11.51.25.53.64 1.14 1.16 1.66.52.52 1.13.91 1.66 1.16.23.11.36.02.51-.11l.31-.27c.21-.18.4-.32.64-.44.24-.12.47-.08.75.04l1.63.7z" />
                  <path d="M12 2a10 10 0 0 0-8.66 15L2 22l5-1.34A10 10 0 1 0 12 2z" />
                </svg>
                {waSending ? "Sending…" : "WhatsApp"}
              </button>
            </div>

            <div className="flex items-center gap-2">
              {detail.status === "active" && (
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                >
                  {cancelling ? "Cancelling…" : "Cancel Sale"}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
