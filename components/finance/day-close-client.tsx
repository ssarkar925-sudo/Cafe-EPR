"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { useRealtime } from "@/lib/supabase/realtime";
import Modal from "@/components/ui/modal";
import { useToast } from "@/components/ui/use-toast";
import { DEFAULT_WA_TEMPLATES, getWhatsAppConfig, renderWhatsAppTemplate, sendWhatsAppMessage } from "@/lib/whatsapp";
import WhatsAppSendModal from "@/components/whatsapp/whatsapp-send-modal";
import A4Actions from "@/components/pdf/a4-actions";

type CloseRow = {
  pool: string;
  seed_date: string | null;
  opening: number;
  movements: number;
  computed: number;
  adjustment: number;
  final: number;
  remarks?: string | null;
};

export type OpenClose = {
  id: string;
  closing_number: string;
  close_date: string;
  status: string;
  opened_at: string;
  rows: CloseRow[];
} | null;

export type ClosingRecord = {
  id: string;
  closing_number: string;
  close_date: string;
  status: string;
  net_profit: number;
  owner_deposits: number;
  owner_withdrawals: number;
  balance_check: number;
  opened_at: string;
  closed_at: string | null;
  remarks: string | null;
  balances: (CloseRow & { id: string })[];
};

const POOL_LABEL: Record<string, string> = {
  cash: "Cash in Hand",
  bank: "Bank Balance",
  wallet: "Wallet Balance",
  dmt: "DMT Float",
  aeps: "AEPS Float",
  upi_qr: "UPI QR",
  credit_card: "Credit Card Limit",
};

const POOL_COLOR: Record<string, string> = {
  cash: "text-indigo-600 dark:text-indigo-400",
  bank: "text-blue-600 dark:text-blue-400",
  wallet: "text-emerald-600 dark:text-emerald-400",
  dmt: "text-violet-600 dark:text-violet-400",
  aeps: "text-amber-600 dark:text-amber-400",
  upi_qr: "text-rose-600 dark:text-rose-400",
  credit_card: "text-cyan-600 dark:text-cyan-400",
};

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200";

function fmtDate(d: string | null | undefined) {
  if (!d) return "-";
  const dt = new Date(d + (d.length === 10 ? "T00:00:00" : ""));
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function normalizeOpenClose(oc: OpenClose): OpenClose {
  if (!oc) return null;
  if (typeof oc !== "object") return null;
  if (!Array.isArray((oc as any).rows) || (oc as any).rows.length === 0) return null;
  return oc;
}

export default function DayCloseClient({
  initialOpenClose,
  initialClosings,
  settings,
}: {
  initialOpenClose: OpenClose;
  initialClosings: ClosingRecord[];
  settings?: any;
}) {
  useRealtime(["closings", "closing_balances", "cash_entries", "opening_balances", "expenses", "settlements"]);

  const [openClose, setOpenClose] = useState<OpenClose>(normalizeOpenClose(initialOpenClose));
  const [closings, setClosings] = useState<ClosingRecord[]>(initialClosings);
  const [openDate, setOpenDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [adjustments, setAdjustments] = useState<Record<string, { amount: string; remarks: string }>>({});
  const [deposits, setDeposits] = useState("");
  const [withdrawals, setWithdrawals] = useState("");
  const [remarks, setRemarks] = useState("");
  const [reverseTarget, setReverseTarget] = useState<ClosingRecord | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [printTarget, setPrintTarget] = useState<ClosingRecord | null>(null);
  const [handoverModal, setHandoverModal] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [denominations, setDenominations] = useState<Record<string, string>>({
    n500: "",
    n200: "",
    n100: "",
    n50: "",
    n20: "",
    n10: "",
    n5: "",
    coins: "",
  });
  const { showToast, toastView } = useToast();
  const [waModal, setWaModal] = useState<{
    open: boolean;
    phone: string;
    name: string;
    msg: string;
    refNum: string;
    refId: string;
  } | null>(null);

  useEffect(() => {
    setOpenClose(initialOpenClose);
  }, [initialOpenClose]);

  async function refresh() {
    const supabase = createClient();
    const [{ data: oc }, { data: cl }] = await Promise.all([
      supabase.rpc("get_open_close"),
      supabase.rpc("get_closings", { p_limit: 30 }),
    ]);
    setOpenClose(normalizeOpenClose((oc as OpenClose) ?? null));
    setClosings((((cl as any)?.closings) ?? []) as ClosingRecord[]);
  }

  const totals = useMemo(() => {
    if (!openClose) return null;
    const rows = Array.isArray(openClose.rows) ? openClose.rows : [];
    const opening = rows.reduce((s, r) => s + Number(r.opening || 0), 0);
    const computed = rows.reduce((s, r) => s + Number(r.computed || 0), 0);
    const adjustments = rows.reduce((s, r) => s + Number(r.adjustment || 0), 0);
    const final = rows.reduce((s, r) => s + Number(r.final || 0), 0);
    return { opening, computed, adjustments, final };
  }, [openClose]);

  const physicalCashTotal = useMemo(() => {
    return (
      (Number(denominations.n500) || 0) * 500 +
      (Number(denominations.n200) || 0) * 200 +
      (Number(denominations.n100) || 0) * 100 +
      (Number(denominations.n50) || 0) * 50 +
      (Number(denominations.n20) || 0) * 20 +
      (Number(denominations.n10) || 0) * 10 +
      (Number(denominations.n5) || 0) * 5 +
      (Number(denominations.coins) || 0)
    );
  }, [denominations]);

  const cashRow = useMemo(() => openClose?.rows?.find((r) => r.pool === "cash") ?? null, [openClose]);
  const cashVariance = useMemo(() => {
    if (!cashRow) return 0;
    return physicalCashTotal - Number(cashRow.computed || 0);
  }, [cashRow, physicalCashTotal]);

  async function applyCashDenominationVariance() {
    if (!openClose || !cashRow) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_close_adjustment", {
      p_closing_id: openClose.id,
      p_pool: "cash",
      p_amount: cashVariance,
      p_remarks: `Physical: ₹${physicalCashTotal.toLocaleString("en-IN")} vs System: ₹${Number(cashRow.computed).toLocaleString("en-IN")}`,
    });
    setBusy(false);
    if (error) {
      showToast("error", error.message);
      return;
    }
    showToast("success", `Physical cash count ₹${physicalCashTotal.toLocaleString("en-IN")} applied to drawer.`);
    await refresh();
  }

  async function openDay() {
    if (!openDate) return;
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("open_close", { p_close_date: openDate });
    setBusy(false);
    if (error) {
      showToast("error", error.message);
      return;
    }
    showToast("success", `Day close ${(data as any).closing_number} opened.`);
    await refresh();
  }

  async function saveAdjustment(pool: string) {
    if (!openClose) return;
    const val = Number(adjustments[pool]?.amount ?? "");
    if (Number.isNaN(val)) {
      showToast("error", "Enter a valid adjustment (can be negative).");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_close_adjustment", {
      p_closing_id: openClose.id,
      p_pool: pool,
      p_amount: val,
      p_remarks: adjustments[pool]?.remarks || null,
    });
    setBusy(false);
    if (error) {
      showToast("error", error.message);
      return;
    }
    setAdjustments((a) => ({ ...a, [pool]: { amount: "", remarks: "" } }));
    showToast("success", `${POOL_LABEL[pool] ?? pool} adjustment saved.`);
    await refresh();
  }

  async function closeDay() {
    if (busy || !openClose) return;
    if (!openClose) return;
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("close_day", {
      p_closing_id: openClose.id,
      p_owner_deposits: Number(deposits) || 0,
      p_owner_withdrawals: Number(withdrawals) || 0,
      p_remarks: remarks || null,
    });
    setBusy(false);
    if (error) {
      showToast("error", error.message);
      return;
    }
    showToast("success", `${(data as any).closing_number} closed. Net profit ${inr((data as any).net_profit)}`);
    setDeposits("");
    setWithdrawals("");
    setRemarks("");
    await refresh();
  }

  async function confirmReverse() {
    if (busy || !reverseTarget) return;
    if (!reverseTarget) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("reverse_close", {
      p_closing_id: reverseTarget.id,
      p_reason: reverseReason,
    });
    setBusy(false);
    if (error) {
      showToast("error", error.message);
      return;
    }
    showToast("success", `${reverseTarget.closing_number} reversed.`);
    setReverseTarget(null);
    setReverseReason("");
    await refresh();
  }

  async function confirmCancel() {
    if (!openClose) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("cancel_open_close", {
      p_closing_id: openClose.id,
      p_reason: cancelReason.trim(),
    });
    setBusy(false);
    if (error) {
      showToast("error", error.message);
      return;
    }
    showToast("info", `${openClose.closing_number} cancelled. You can re-open it anytime.`);
    setCancelOpen(false);
    setCancelReason("");
    await refresh();
  }

  const statusPill = (s: string) =>
    s === "closed"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
      : s === "open"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
        : s === "cancelled"
          ? "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400"
          : "bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-400";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Day Close</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Reconcile every account, capture the day&apos;s profit, and lock the books. Closing balances become the next day&apos;s opening.
        </p>
      </div>

      {!openClose ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-white/15 dark:bg-slate-900">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
              <path d="M21 12a9 9 0 1 1-9-9M21 3l-9 9M15 3h6v6" />
            </svg>
          </div>
          <h3 className="mt-4 text-base font-bold text-slate-900 dark:text-white">No open day close shift</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
            Start today&apos;s shift to begin tracking cash movements, sales, and multi-pool liquidity.
          </p>

          {closings.length > 0 && (
            <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-1.5 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">
              <span className="font-medium">Previous closed shift:</span>
              <span className="font-semibold text-slate-900 dark:text-white">{closings[0].closing_number} ({fmtDate(closings[0].close_date)})</span>
              <span>· Auto-carryforward ready</span>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => {
                setOpenDate(new Date().toISOString().slice(0, 10));
                openDay();
              }}
              disabled={busy}
              className="btn-3d-tactile-primary inline-flex items-center gap-2 px-6 py-3 text-sm font-extrabold disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              {busy ? "Opening..." : "⚡ Auto-Open Today's Shift"}
            </button>

            <div className="flex items-center gap-2">
              <input type="date" value={openDate} onChange={(e) => setOpenDate(e.target.value)} className={`${inputClass} w-40 text-xs`} />
              <button
                onClick={openDay}
                disabled={busy}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/5"
              >
                Custom Date
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                {openClose.closing_number} · {fmtDate(openClose.close_date)}
              </span>
              <p className="mt-1 text-sm text-slate-400">Adjust each account to the physical count, then close.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!openClose) return;
                  const origin = typeof window !== "undefined" ? window.location.origin : "";
                  const receiptUrl = `${origin}/receipt/day-close/${openClose.id}`;
                  const cfg = getWhatsAppConfig();
                  const template = cfg.templates?.day_close || DEFAULT_WA_TEMPLATES.day_close;
                  const msg = renderWhatsAppTemplate(template, {
                    shop_name: "Sarkar Communication",
                    close_date: fmtDate(openClose.close_date),
                    closing_number: openClose.closing_number,
                    net_profit: inr((totals?.final ?? 0) - (totals?.opening ?? 0)),
                    liquid_position: inr(totals?.final ?? 0),
                    receipt_url: receiptUrl,
                  });

                  setWaModal({
                    open: true,
                    phone: "",
                    name: "Store Owner / Manager",
                    msg,
                    refNum: openClose.closing_number,
                    refId: openClose.id,
                  });
                }}
                title="Share Shift Summary on WhatsApp"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-3.5 py-2 text-xs font-black text-white shadow-md shadow-emerald-600/25 hover:brightness-110 active:scale-95 transition-all"
              >
                <span>💬 WhatsApp Summary</span>
              </button>
              <button
                onClick={() => setCancelOpen(true)}
                disabled={busy}
                title="Cancel this open day close"
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100 active:scale-95 transition-all disabled:opacity-50 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
                <span>Cancel Close</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-white/10">
                  <th className="px-4 py-3">Account</th>
                  <th className="px-3 py-3 text-right">Opening</th>
                  <th className="px-3 py-3 text-right">Movements</th>
                  <th className="px-3 py-3 text-right">Computed</th>
                  <th className="px-3 py-3 text-right">Adjustment</th>
                  <th className="px-3 py-3 text-right">Closing</th>
                </tr>
              </thead>
              <tbody>
                {(openClose.rows ?? []).map((r) => {
                  const draft = adjustments[r.pool]?.amount ?? "";
                  return (
                    <tr key={r.pool} className="border-b border-slate-50 last:border-0 dark:border-white/5">
                      <td className={`px-4 py-2.5 font-semibold ${POOL_COLOR[r.pool] ?? ""}`}>
                        {POOL_LABEL[r.pool] ?? r.pool}
                        {r.seed_date && r.seed_date !== "0001-01-01" && (
                          <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 dark:bg-white/5">
                            seed {fmtDate(r.seed_date)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300">{inr(r.opening)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300">{inr(r.movements)}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-slate-700 dark:text-slate-200">{inr(r.computed)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={draft}
                            onChange={(e) => setAdjustments((a) => ({ ...a, [r.pool]: { amount: e.target.value, remarks: a[r.pool]?.remarks ?? "" } }))}
                            className="w-28 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-right text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
                          />
                          <button
                            onClick={() => saveAdjustment(r.pool)}
                            disabled={busy}
                            className="rounded-lg bg-slate-900 px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
                          >
                            Save
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-slate-900 dark:text-white">{inr(r.final)}</td>
                    </tr>
                  );
                })}
              </tbody>
              {totals && (
                <tfoot>
                  <tr className="border-t border-slate-100 bg-slate-50 text-sm font-semibold text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-slate-100">
                    <td className="px-4 py-2.5">Total</td>
                    <td className="px-3 py-2.5 text-right">{inr(totals.opening)}</td>
                    <td className="px-3 py-2.5 text-right">{inr(totals.computed - totals.opening)}</td>
                    <td className="px-3 py-2.5 text-right">{inr(totals.computed)}</td>
                    <td className="px-3 py-2.5 text-right">{inr(totals.adjustments)}</td>
                    <td className="px-3 py-2.5 text-right text-blue-600 dark:text-blue-400">{inr(totals.final)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Physical Cash Denomination Counter & Variance Reconciler */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-white/10">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <rect width="20" height="12" x="2" y="6" rx="2" />
                    <circle cx="12" cy="12" r="2" />
                    <path d="M6 12h.01M18 12h.01" />
                  </svg>
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Cash Drawer Denomination Counter</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Count physical currency notes in the counter drawer to verify against computed cash</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setHandoverModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                    <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <path d="M6 14h12v8H6z" />
                  </svg>
                  Preview Handover Slip
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-8">
              {[
                { key: "n500", label: "₹500", mult: 500, color: "border-stone-300 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-900/40 text-stone-800 dark:text-stone-200" },
                { key: "n200", label: "₹200", mult: 200, color: "border-amber-300 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-300" },
                { key: "n100", label: "₹100", mult: 100, color: "border-indigo-300 dark:border-indigo-900/40 bg-indigo-50/70 dark:bg-indigo-950/30 text-indigo-900 dark:text-indigo-300" },
                { key: "n50", label: "₹50", mult: 50, color: "border-cyan-300 dark:border-cyan-900/40 bg-cyan-50/70 dark:bg-cyan-950/30 text-cyan-900 dark:text-cyan-300" },
                { key: "n20", label: "₹20", mult: 20, color: "border-emerald-300 dark:border-emerald-900/40 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-300" },
                { key: "n10", label: "₹10", mult: 10, color: "border-orange-300 dark:border-orange-900/40 bg-orange-50/70 dark:bg-orange-950/30 text-orange-900 dark:text-orange-300" },
                { key: "n5", label: "₹5", mult: 5, color: "border-yellow-300 dark:border-yellow-900/40 bg-yellow-50/70 dark:bg-yellow-950/30 text-yellow-900 dark:text-yellow-300" },
                { key: "coins", label: "Coins", mult: 1, color: "border-slate-300 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 text-slate-900 dark:text-slate-200" },
              ].map((d) => {
                const count = Number(denominations[d.key]) || 0;
                const subtotal = count * d.mult;
                return (
                  <div
                    key={d.key}
                    className={`group relative rounded-2xl border p-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${d.color}`}
                  >
                    <div className="flex items-center justify-between text-xs font-black">
                      <span>{d.label}</span>
                      <span className="rounded-md bg-white/80 dark:bg-black/40 px-1.5 py-0.2 text-[10px] font-black text-slate-700 dark:text-slate-200 shadow-2xs">
                        ×{count}
                      </span>
                    </div>

                    {/* Stepper with - / Input / + */}
                    <div className="mt-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.max(0, count - 1);
                          setDenominations((prev) => ({ ...prev, [d.key]: next === 0 ? "" : String(next) }));
                        }}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-black text-slate-700 hover:bg-slate-100 active:scale-90 transition-all dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                      >
                        −
                      </button>

                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="0"
                        value={denominations[d.key] ?? ""}
                        onChange={(e) => setDenominations((prev) => ({ ...prev, [d.key]: e.target.value }))}
                        className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-1 py-0.5 text-center text-xs font-black text-slate-900 outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
                      />

                      <button
                        type="button"
                        onClick={() => {
                          const next = count + 1;
                          setDenominations((prev) => ({ ...prev, [d.key]: String(next) }));
                        }}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-black text-slate-700 hover:bg-slate-100 active:scale-90 transition-all dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                      >
                        +
                      </button>
                    </div>

                    <div className="mt-1.5 text-right text-[11px] font-black text-emerald-600 dark:text-emerald-400">
                      {inr(subtotal)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* High-Contrast Live Reconciliation HUD */}
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-800/80">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {/* 1. Physical Count */}
                <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/25">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                    Physical Cash Counted
                  </span>
                  <p className="mt-1 text-xl font-black text-emerald-950 dark:text-emerald-100 tracking-tight">
                    {inr(physicalCashTotal)}
                  </p>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">From Denomination Breakdown</span>
                </div>

                {/* 2. System Expected */}
                <div className="rounded-xl border border-indigo-200/70 bg-indigo-50/50 p-3 dark:border-indigo-900/40 dark:bg-indigo-950/25">
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                    System Computed Cash
                  </span>
                  <p className="mt-1 text-xl font-black text-indigo-950 dark:text-indigo-100 tracking-tight">
                    {inr(Number(cashRow?.computed ?? 0))}
                  </p>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Recorded Inflows - Outflows</span>
                </div>

                {/* 3. Variance Status */}
                <div
                  className={`rounded-xl border p-3 ${
                    Math.abs(cashVariance) < 0.01
                      ? "border-emerald-300 bg-emerald-50/80 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                      : cashVariance > 0
                      ? "border-blue-300 bg-blue-50/80 text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
                      : "border-rose-300 bg-rose-50/80 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
                  }`}
                >
                  <span className="text-[10px] font-black uppercase tracking-wider opacity-80">
                    Cash Till Variance
                  </span>
                  <p className="mt-1 text-xl font-black tracking-tight">
                    {Math.abs(cashVariance) < 0.01
                      ? "✓ 100% Balanced"
                      : cashVariance > 0
                      ? `+${inr(cashVariance)} (Surplus)`
                      : `${inr(cashVariance)} (Shortage)`}
                  </p>
                  <span className="text-[10px] opacity-80">
                    {Math.abs(cashVariance) < 0.01
                      ? "Drawer perfectly balanced"
                      : cashVariance > 0
                      ? "Excess physical cash in till"
                      : "Deficit in drawer cash"}
                  </span>
                </div>
              </div>

              {physicalCashTotal > 0 && Math.abs(cashVariance) >= 0.01 && (
                <div className="mt-3.5 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-white/5">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Click to balance drawer with physical count:
                  </span>
                  <button
                    type="button"
                    onClick={applyCashDenominationVariance}
                    disabled={busy}
                    className="btn-3d-tactile-emerald px-4 py-2 text-xs font-black text-white active:scale-95 disabled:opacity-50"
                  >
                    Apply Physical Count as Adjustment ({cashVariance > 0 ? `+${inr(cashVariance)}` : inr(cashVariance)})
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Link
              href="/finance/settlements"
              className="bento-surface card-glow-emerald card-interactive group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-600" />
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Owner Deposits
                  </span>
                  <div className="icon-box-3d flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xs">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </div>
                </div>
                <div className="mt-2 font-mono text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                  {inr(Number(deposits) || 0)}
                </div>
              </div>
              <div className="mt-2 text-xs font-medium text-slate-400">
                Extra cash/bank capital injected
              </div>
            </Link>

            <Link
              href="/finance/settlements"
              className="bento-surface card-glow-rose card-interactive group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-rose-500 to-red-600" />
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Owner Withdrawals
                  </span>
                  <div className="icon-box-3d flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-xs">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                      <path d="M5 12h14M12 5l-7 7 7 7" />
                    </svg>
                  </div>
                </div>
                <div className="mt-2 font-mono text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                  {inr(Number(withdrawals) || 0)}
                </div>
              </div>
              <div className="mt-2 text-xs font-medium text-slate-400">
                Cash drawer drawings taken out
              </div>
            </Link>

            <Link
              href="/finance/opening-balances"
              className="bento-surface card-glow-indigo card-interactive group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-600 to-indigo-600" />
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Next Day Opening Position
                  </span>
                  <div className="icon-box-3d flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-xs">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                    </svg>
                  </div>
                </div>
                <div className="mt-2 font-mono text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                  {inr(totals?.final ?? 0)}
                </div>
              </div>
              <div className="mt-2 text-xs font-medium text-slate-400">
                Closing balances roll into tomorrow auto
              </div>
            </Link>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <label className="text-sm font-medium text-slate-500 dark:text-slate-400">Owner deposits (₹)</label>
              <input type="number" min="0" step="0.01" value={deposits} onChange={(e) => setDeposits(e.target.value)} placeholder="0.00" className={`${inputClass} mt-1`} />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <label className="text-sm font-medium text-slate-500 dark:text-slate-400">Owner withdrawals (₹)</label>
              <input type="number" min="0" step="0.01" value={withdrawals} onChange={(e) => setWithdrawals(e.target.value)} placeholder="0.00" className={`${inputClass} mt-1`} />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <label className="text-sm font-medium text-slate-500 dark:text-slate-400">Close remarks</label>
              <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional note" className={`${inputClass} mt-1`} />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/5">
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Net profit for {fmtDate(openClose.close_date)} is calculated from the P&amp;L and the balance check flags any unaccounted difference.
            </p>
            <button
              onClick={closeDay}
              disabled={busy}
              className="btn-3d-tactile-emerald shrink-0 px-6 py-3 text-sm font-black disabled:opacity-50"
            >
              {busy ? "Closing..." : "🔒 Confirm Day Close"}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Closing History</h3>
        </div>
        {closings.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No day closes yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase text-slate-400 dark:border-white/10">
                  <th className="py-2 pr-3">Number</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3 text-right">Net Profit</th>
                  <th className="py-2 pr-3 text-right">Balance Check</th>
                  <th className="py-2 pr-3">Remarks</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {closings.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 last:border-0 dark:border-white/5">
                    <td className="py-2 pr-3 font-medium text-slate-800 dark:text-white">{c.closing_number}</td>
                    <td className="py-2 pr-3 text-slate-500">{fmtDate(c.close_date)}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusPill(c.status)}`}>{c.status}</span>
                    </td>
                    <td className={`py-2 pr-3 text-right font-semibold ${c.net_profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {inr(c.net_profit)}
                    </td>
                    <td className={`py-2 pr-3 text-right font-medium ${Math.abs(c.balance_check) < 0.01 ? "text-slate-400" : "text-rose-500"}`}>
                      {inr(c.balance_check)}
                    </td>
                    <td className="max-w-[200px] truncate py-2 pr-3 text-slate-400" title={c.remarks ?? ""}>{c.remarks ?? "-"}</td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setPrintTarget(c)}
                          className="rounded-lg px-2 py-1 text-xs font-semibold text-blue-600 transition hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/10"
                        >
                          Certificate / Print
                        </button>
                        {c.status === "closed" && (
                          <button
                            onClick={() => setReverseTarget(c)}
                            className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                          >
                            Reverse
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {reverseTarget && (
        <Modal onClose={() => setReverseTarget(null)} title={`Reverse ${reverseTarget.closing_number}`} accent="rose" size="md">
          <div className="space-y-4 p-5">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Reversing a day close is audited and never deletes the close itself. The next day&apos;s opening balances auto-seeded by this close are removed — they are re-created the next time the day is closed.
            </p>
            <textarea
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              placeholder="Reason for reversal"
              rows={3}
              className={`${inputClass} resize-none`}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setReverseTarget(null)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10">
                Cancel
              </button>
              <button
                onClick={confirmReverse}
                disabled={busy}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
              >
                {busy ? "Reversing..." : "Reverse Close"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {cancelOpen && openClose && (
        <Modal onClose={() => setCancelOpen(false)} title={`Cancel ${openClose.closing_number}`} accent="rose" size="md">
          <div className="space-y-4 p-5">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              This day close was opened but has no entries yet. Cancelling it lets you re-open the same date
              without closing. The cancellation is audited and never deletes anything.
            </p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason (optional)"
              rows={3}
              className={`${inputClass} resize-none`}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setCancelOpen(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10">
                Keep open
              </button>
              <button
                onClick={confirmCancel}
                disabled={busy}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
              >
                {busy ? "Cancelling..." : "Cancel Day Close"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {printTarget && (
        <Modal onClose={() => setPrintTarget(null)} title={`Handover Certificate · ${printTarget.closing_number}`} accent="blue" size="lg">
          <div className="space-y-5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-white/10">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Store End-of-Day Handover Certificate</h2>
                <p className="text-xs text-slate-500">
                  Shift #{printTarget.closing_number} · Date: {fmtDate(printTarget.close_date)} · Status: {printTarget.status.toUpperCase()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <A4Actions
                  variant="day_close"
                  data={{
                    closing: {
                      closing_number: printTarget.closing_number,
                      close_date: printTarget.close_date,
                      status: printTarget.status,
                      opened_at: printTarget.opened_at,
                      closed_at: printTarget.closed_at,
                      net_profit: printTarget.net_profit,
                      owner_deposits: printTarget.owner_deposits,
                      owner_withdrawals: printTarget.owner_withdrawals,
                      balance_check: printTarget.balance_check,
                      remarks: printTarget.remarks,
                      rows: printTarget.balances ?? [],
                    },
                    settings,
                  }}
                  filename={`Handover_${printTarget.closing_number}_${printTarget.close_date}.pdf`}
                />
                <a
                  href={`/receipt/day-close/${printTarget.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
                >
                  Full Page A4 ↗
                </a>
              </div>
            </div>

            {/* Account Balances Table */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">1. Multi-Channel Liquidity &amp; Account Balances</h4>
              <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-100 bg-slate-50 dark:border-white/5 dark:bg-white/5">
                    <tr>
                      <th className="px-3 py-2">Channel / Asset Pool</th>
                      <th className="px-3 py-2 text-right">Opening</th>
                      <th className="px-3 py-2 text-right">Movements</th>
                      <th className="px-3 py-2 text-right">Adjustment</th>
                      <th className="px-3 py-2 text-right">Closing Position</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {(printTarget.balances ?? []).map((b) => (
                      <tr key={b.id}>
                        <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">{POOL_LABEL[b.pool] ?? b.pool}</td>
                        <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400">{inr(b.opening)}</td>
                        <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400">{inr(b.movements)}</td>
                        <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400">{inr(b.adjustment)}</td>
                        <td className="px-3 py-2 text-right font-bold text-slate-900 dark:text-white">{inr(b.final)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-slate-200 bg-slate-50 font-bold dark:border-white/10 dark:bg-white/5">
                    <tr>
                      <td className="px-3 py-2">TOTAL NET LIQUID POSITION</td>
                      <td className="px-3 py-2 text-right">{inr((printTarget.balances ?? []).reduce((s, b) => s + Number(b.opening || 0), 0))}</td>
                      <td className="px-3 py-2 text-right">{inr((printTarget.balances ?? []).reduce((s, b) => s + Number(b.movements || 0), 0))}</td>
                      <td className="px-3 py-2 text-right">{inr((printTarget.balances ?? []).reduce((s, b) => s + Number(b.adjustment || 0), 0))}</td>
                      <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">{inr((printTarget.balances ?? []).reduce((s, b) => s + Number(b.final || 0), 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Reconciliation Cards */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">2. Financial Reconciliation &amp; Audit</h4>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
                  <p className="text-[10px] font-semibold uppercase text-slate-400">Net Shift Profit</p>
                  <p className={`text-base font-bold ${printTarget.net_profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                    {inr(printTarget.net_profit)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
                  <p className="text-[10px] font-semibold uppercase text-slate-400">Owner Inflows</p>
                  <p className="text-base font-bold text-slate-800 dark:text-white">{inr(printTarget.owner_deposits)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
                  <p className="text-[10px] font-semibold uppercase text-slate-400">Owner Withdrawals</p>
                  <p className="text-base font-bold text-slate-800 dark:text-white">{inr(printTarget.owner_withdrawals)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
                  <p className="text-[10px] font-semibold uppercase text-slate-400">Balance Check</p>
                  <p className={`text-base font-bold ${Math.abs(printTarget.balance_check) < 0.01 ? "text-slate-500" : "text-rose-500"}`}>
                    {inr(printTarget.balance_check)}
                  </p>
                </div>
              </div>
            </div>

            {/* Handover Signatures */}
            <div className="grid grid-cols-2 gap-6 border-t border-dashed border-slate-200 pt-6 dark:border-white/10">
              <div className="text-center">
                <div className="mx-auto h-10 w-44 border-b border-slate-400" />
                <p className="mt-2 text-xs font-semibold text-slate-700 dark:text-slate-300">Cashier / Operator Signature</p>
                <p className="text-[10px] text-slate-400">Handed Over By</p>
              </div>
              <div className="text-center">
                <div className="mx-auto h-10 w-44 border-b border-slate-400" />
                <p className="mt-2 text-xs font-semibold text-slate-700 dark:text-slate-300">Store Manager / Auditor Signature</p>
                <p className="text-[10px] text-slate-400">Verified &amp; Received</p>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {handoverModal && openClose && (
        <Modal onClose={() => setHandoverModal(false)} title={`Shift Handover Certificate · ${openClose.closing_number}`} accent="emerald" size="lg">
          <div className="space-y-5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-white/10">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Store End-of-Day Handover Certificate</h2>
                <p className="text-xs text-slate-500">Closing #{openClose.closing_number} · Date: {fmtDate(openClose.close_date)}</p>
              </div>
              <div className="flex items-center gap-2">
                <A4Actions
                  variant="day_close"
                  data={{
                    closing: {
                      closing_number: openClose.closing_number,
                      close_date: openClose.close_date,
                      status: openClose.status,
                      rows: openClose.rows,
                    },
                    denominations,
                    physicalCashTotal,
                    settings,
                  }}
                  filename={`Handover_${openClose.closing_number}_${openClose.close_date}.pdf`}
                />
                <a
                  href={`/receipt/day-close/${openClose.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
                >
                  Full Page A4 ↗
                </a>
              </div>
            </div>

            {/* Account Balances Breakdown */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">1. Account &amp; Pool Balances</h4>
              <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-100 bg-slate-50 dark:border-white/5 dark:bg-white/5">
                    <tr>
                      <th className="px-3 py-2">Pool / Account</th>
                      <th className="px-3 py-2 text-right">Opening</th>
                      <th className="px-3 py-2 text-right">Movements</th>
                      <th className="px-3 py-2 text-right">Adjustment</th>
                      <th className="px-3 py-2 text-right">Closing Position</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {(openClose.rows ?? []).map((r) => (
                      <tr key={r.pool}>
                        <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">{POOL_LABEL[r.pool] ?? r.pool}</td>
                        <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400">{inr(r.opening)}</td>
                        <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400">{inr(r.movements)}</td>
                        <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400">{inr(r.adjustment)}</td>
                        <td className="px-3 py-2 text-right font-bold text-slate-900 dark:text-white">{inr(r.final)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {totals && (
                    <tfoot className="border-t border-slate-200 bg-slate-50 font-bold dark:border-white/10 dark:bg-white/5">
                      <tr>
                        <td className="px-3 py-2">Total Liquid Position</td>
                        <td className="px-3 py-2 text-right">{inr(totals.opening)}</td>
                        <td className="px-3 py-2 text-right">{inr(totals.computed - totals.opening)}</td>
                        <td className="px-3 py-2 text-right">{inr(totals.adjustments)}</td>
                        <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">{inr(totals.final)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Cash Drawer Denominations */}
            {physicalCashTotal > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">2. Physical Cash Drawer Denominations</h4>
                <div className="mt-2 grid grid-cols-4 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-white/10 dark:bg-white/5">
                  {[
                    { label: "₹500", count: Number(denominations.n500) || 0, val: (Number(denominations.n500) || 0) * 500 },
                    { label: "₹200", count: Number(denominations.n200) || 0, val: (Number(denominations.n200) || 0) * 200 },
                    { label: "₹100", count: Number(denominations.n100) || 0, val: (Number(denominations.n100) || 0) * 100 },
                    { label: "₹50", count: Number(denominations.n50) || 0, val: (Number(denominations.n50) || 0) * 50 },
                    { label: "₹20", count: Number(denominations.n20) || 0, val: (Number(denominations.n20) || 0) * 20 },
                    { label: "₹10", count: Number(denominations.n10) || 0, val: (Number(denominations.n10) || 0) * 10 },
                    { label: "₹5", count: Number(denominations.n5) || 0, val: (Number(denominations.n5) || 0) * 5 },
                    { label: "Coins", count: Number(denominations.coins) || 0, val: Number(denominations.coins) || 0 },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between rounded-lg bg-white p-2 dark:bg-slate-900">
                      <span className="font-semibold text-slate-600 dark:text-slate-400">{item.label} × {item.count}</span>
                      <span className="font-bold text-slate-900 dark:text-white">{inr(item.val)}</span>
                    </div>
                  ))}
                  <div className="col-span-4 mt-1 flex items-center justify-between border-t border-slate-200 pt-2 font-bold text-slate-900 dark:border-white/10 dark:text-white">
                    <span>Physical Cash Counted:</span>
                    <span className="text-emerald-600 dark:text-emerald-400">{inr(physicalCashTotal)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Handover Signatures */}
            <div className="grid grid-cols-2 gap-6 border-t border-dashed border-slate-200 pt-8 dark:border-white/10">
              <div className="text-center">
                <div className="mx-auto h-12 w-48 border-b border-slate-400" />
                <p className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">Cashier / Operator Signature</p>
                <p className="text-[10px] text-slate-400">Handed Over</p>
              </div>
              <div className="text-center">
                <div className="mx-auto h-12 w-48 border-b border-slate-400" />
                <p className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">Store Manager / Auditor Signature</p>
                <p className="text-[10px] text-slate-400">Verified &amp; Received</p>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {waModal && (
        <WhatsAppSendModal
          open={Boolean(waModal)}
          onClose={() => setWaModal(null)}
          phone={waModal.phone}
          recipientName={waModal.name}
          initialMessage={waModal.msg}
          messageType="day_close"
          refId={waModal.refId}
          refNumber={waModal.refNum}
        />
      )}

      {toastView}
    </div>
  );
}