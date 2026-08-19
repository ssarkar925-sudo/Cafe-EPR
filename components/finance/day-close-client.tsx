"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import StatCard from "@/components/ui/stat-card";
import Modal from "@/components/ui/modal";
import { useToast } from "@/components/ui/use-toast";

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
}: {
  initialOpenClose: OpenClose;
  initialClosings: ClosingRecord[];
}) {
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
  const { showToast, toastView } = useToast();

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
    const rows = openClose.rows;
    const opening = rows.reduce((s, r) => s + Number(r.opening), 0);
    const computed = rows.reduce((s, r) => s + Number(r.computed), 0);
    const adjustments = rows.reduce((s, r) => s + Number(r.adjustment), 0);
    const final = rows.reduce((s, r) => s + Number(r.final), 0);
    return { opening, computed, adjustments, final };
  }, [openClose]);

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

  const statusPill = (s: string) =>
    s === "closed"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
      : s === "open"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
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
          <h3 className="mt-4 text-base font-bold text-slate-900 dark:text-white">No open day close</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
            Open a new day close to reconcile cash, bank, wallet, floats and credit limit for a date.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <input type="date" value={openDate} onChange={(e) => setOpenDate(e.target.value)} className={`${inputClass} w-44`} />
            <button
              onClick={openDay}
              disabled={busy}
              className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Opening..." : "Open Day Close"}
            </button>
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
                {openClose.rows.map((r) => {
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

          <div className="grid gap-4 lg:grid-cols-3">
            <StatCard
              label="Owner Deposits (extra cash/bank put in)"
              value={inr(Number(deposits) || 0)}
              icon="M12 5v14M5 12h14"
              grad="from-emerald-500 to-teal-600"
            />
            <StatCard
              label="Owner Withdrawals (cash taken out)"
              value={inr(Number(withdrawals) || 0)}
              icon="M5 12h14M12 5l-7 7 7 7"
              grad="from-rose-500 to-red-600"
            />
            <StatCard
              label="Current Opening (next day auto)"
              value={inr(totals?.final ?? 0)}
              icon="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
              grad="from-blue-600 to-indigo-600"
              sub="Closing balances roll into tomorrow"
            />
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
              className="shrink-0 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Closing..." : "Confirm Day Close"}
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
                          View
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
              Reversing a day close is audited and never deletes anything. The next day&apos;s opening stays as it was.
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

      {printTarget && (
        <Modal onClose={() => setPrintTarget(null)} title={`${printTarget.closing_number} · ${fmtDate(printTarget.close_date)}`} accent="blue" size="lg">
          <div className="space-y-4 p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase text-slate-400 dark:border-white/10">
                    <th className="py-2 pr-3">Account</th>
                    <th className="py-2 pr-3 text-right">Opening</th>
                    <th className="py-2 pr-3 text-right">Movements</th>
                    <th className="py-2 pr-3 text-right">Adjust</th>
                    <th className="py-2 text-right">Closing</th>
                  </tr>
                </thead>
                <tbody>
                  {(printTarget.balances ?? []).map((b) => (
                    <tr key={b.id} className="border-b border-slate-50 last:border-0 dark:border-white/5">
                      <td className="py-2 pr-3 font-medium text-slate-800 dark:text-white">{POOL_LABEL[b.pool] ?? b.pool}</td>
                      <td className="py-2 pr-3 text-right text-slate-600 dark:text-slate-300">{inr(b.opening)}</td>
                      <td className="py-2 pr-3 text-right text-slate-600 dark:text-slate-300">{inr(b.movements)}</td>
                      <td className="py-2 pr-3 text-right text-slate-600 dark:text-slate-300">{inr(b.adjustment)}</td>
                      <td className="py-2 text-right font-bold text-slate-900 dark:text-white">{inr(b.final)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
                <p className="text-xs text-slate-400">Net Profit</p>
                <p className={`text-lg font-bold ${printTarget.net_profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{inr(printTarget.net_profit)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
                <p className="text-xs text-slate-400">Balance Check</p>
                <p className={`text-lg font-bold ${Math.abs(printTarget.balance_check) < 0.01 ? "text-slate-500" : "text-rose-500"}`}>{inr(printTarget.balance_check)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
                <p className="text-xs text-slate-400">Owner Deposits</p>
                <p className="text-lg font-bold text-slate-800 dark:text-white">{inr(printTarget.owner_deposits)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
                <p className="text-xs text-slate-400">Owner Withdrawals</p>
                <p className="text-lg font-bold text-slate-800 dark:text-white">{inr(printTarget.owner_withdrawals)}</p>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {toastView}
    </div>
  );
}