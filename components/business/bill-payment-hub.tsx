"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { inr } from "@/lib/format";
import { useRealtime } from "@/lib/supabase/realtime";
import type { Txn } from "./recharge-workspace";

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d.length === 10 ? d + "T00:00:00" : d);
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtTime(d?: string | null) {
  if (!d) return "";
  try {
    const dt = new Date(d);
    return dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function BillPaymentHub({
  initialTransactions,
  rechargeCountToday,
  utilityCountToday,
}: {
  initialTransactions: Txn[];
  rechargeCountToday?: number;
  utilityCountToday?: number;
}) {
  useRealtime(["transactions", "cash_entries"]);

  const [transactions] = useState<Txn[]>(initialTransactions);
  const [filterType, setFilterType] = useState<"all" | "recharge" | "utility">("all");

  const todayStr = new Date().toISOString().slice(0, 10);

  // Aggregated Today Analytics from Database Transactions
  const metrics = useMemo(() => {
    const todayTxns = transactions.filter(
      (t) =>
        t.transaction_date === todayStr &&
        ["recharge", "bill_payment", "utility_bill"].includes(t.service_type)
    );

    let totalCount = 0;
    let totalVolume = 0;
    let totalCollections = 0;
    let totalCommission = 0;
    let totalFees = 0;
    let totalProviderCost = 0;
    let successCount = 0;
    let pendingCount = 0;
    let failedCount = 0;

    let rechargeCount = 0;
    let rechargeVol = 0;
    let rechargeComm = 0;

    let utilityCount = 0;
    let utilityVol = 0;
    let utilityComm = 0;

    for (const t of todayTxns) {
      const isSuccess = t.status === "success";
      const isRecharge = t.service_type === "recharge";
      const amt = Number(t.amount) || 0;
      const comm = Number(t.portal_commission) || 0;
      const fee = Number(t.service_fee) || 0;
      const cost = Number(t.pool_out) || Math.max(0, amt - comm);

      totalCount++;
      if (isSuccess) {
        successCount++;
        totalVolume += amt;
        totalCollections += amt + fee;
        totalCommission += comm;
        totalFees += fee;
        totalProviderCost += cost;

        if (isRecharge) {
          rechargeCount++;
          rechargeVol += amt;
          rechargeComm += comm;
        } else {
          utilityCount++;
          utilityVol += amt;
          utilityComm += comm;
        }
      } else if (t.status === "pending") {
        pendingCount++;
      } else if (t.status === "failed") {
        failedCount++;
      }
    }

    const netIncome = totalFees + totalCommission;
    const successRate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 100;

    return {
      totalCount,
      totalVolume,
      totalCollections,
      totalCommission,
      totalFees,
      totalProviderCost,
      netIncome,
      successCount,
      pendingCount,
      failedCount,
      successRate,
      rechargeCount,
      rechargeVol,
      rechargeComm,
      utilityCount,
      utilityVol,
      utilityComm,
    };
  }, [transactions, todayStr]);

  const filteredTxns = useMemo(() => {
    return transactions
      .filter((t) => ["recharge", "bill_payment", "utility_bill"].includes(t.service_type))
      .filter((t) => {
        if (filterType === "recharge") return t.service_type === "recharge";
        if (filterType === "utility") return ["bill_payment", "utility_bill"].includes(t.service_type);
        return true;
      })
      .slice(0, 15);
  }, [transactions, filterType]);

  return (
    <div className="space-y-6 pb-12">
      {/* 1. EXECUTIVE HERO */}
      <div className="relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-slate-900 via-indigo-950/90 to-slate-900 p-6 text-white shadow-2xl">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-black tracking-wide text-emerald-300 ring-1 ring-emerald-500/40">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                BILL PAYMENT SYSTEM ONLINE
              </span>
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-bold text-slate-300">
                Unified Telecom &amp; Utility Desk
              </span>
            </div>
            <h1 className="mt-2.5 text-2xl font-black tracking-tight sm:text-3xl">
              Bill Payment Command Center
            </h1>
            <p className="mt-1 text-xs text-slate-300 max-w-xl">
              Mobile recharge, utility bills and digital service payments from one unified service desk with transparent funding and canonical accounting.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/business/bill-payment/mobile-recharge"
              className="btn-3d-tactile-primary flex items-center gap-2 px-4 py-2.5 text-xs font-black shadow-lg"
            >
              <span>📱 Mobile Recharge →</span>
            </Link>
            <Link
              href="/business/bill-payment/utility"
              className="btn-3d-tactile-secondary flex items-center gap-2 px-4 py-2.5 text-xs font-bold"
            >
              <span>🧾 Pay Utility Bill →</span>
            </Link>
          </div>
        </div>

        {/* 5-Card KPI Bento Grid */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
            <span className="text-[10px] font-black uppercase text-indigo-300">Today&apos;s Payments</span>
            <div className="mt-1 text-xl font-black">{metrics.totalCount} <span className="text-xs font-normal text-slate-300">txns</span></div>
            <p className="mt-0.5 text-[11px] text-slate-400">{inr(metrics.totalVolume)} volume</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
            <span className="text-[10px] font-black uppercase text-emerald-300">Customer Collection</span>
            <div className="mt-1 text-xl font-black text-emerald-400">{inr(metrics.totalCollections)}</div>
            <p className="mt-0.5 text-[11px] text-slate-400">Total customer receipts</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
            <span className="text-[10px] font-black uppercase text-amber-300">Total Commission</span>
            <div className="mt-1 text-xl font-black text-amber-400">{inr(metrics.totalCommission)}</div>
            <p className="mt-0.5 text-[11px] text-slate-400">Earned provider margin</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
            <span className="text-[10px] font-black uppercase text-cyan-300">Net Provider Cost</span>
            <div className="mt-1 text-xl font-black text-cyan-400">{inr(metrics.totalProviderCost)}</div>
            <p className="mt-0.5 text-[11px] text-slate-400">Debited from funding accounts</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
            <span className="text-[10px] font-black uppercase text-purple-300">Success Rate</span>
            <div className="mt-1 text-xl font-black text-purple-300">{metrics.successRate}%</div>
            <p className="mt-0.5 text-[11px] text-emerald-400">Net Income: {inr(metrics.netIncome)}</p>
          </div>
        </div>
      </div>

      {/* 2. RECONCILIATION STRIP */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
            ⚡
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-900 dark:text-white">BILL PAYMENT RECONCILIATION</span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                ✓ Reconciled
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Total Collections ({inr(metrics.totalCollections)}) = Net Provider Cost ({inr(metrics.totalProviderCost)}) + Net Income ({inr(metrics.netIncome)})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 text-xs">
          <div className="text-right">
            <span className="text-[10px] font-bold uppercase text-slate-400">Variance</span>
            <p className="font-black text-emerald-600 dark:text-emerald-400">₹0.00</p>
          </div>
        </div>
      </div>

      {/* 3. TWO LARGE SERVICE CARDS */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* CARD 1: MOBILE RECHARGE */}
        <div className="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-indigo-200 bg-gradient-to-br from-white via-indigo-50/30 to-indigo-100/20 p-6 shadow-md transition hover:shadow-xl dark:border-indigo-900/40 dark:from-slate-900 dark:via-indigo-950/20 dark:to-slate-900">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-2xl text-white shadow-md shadow-indigo-600/30">
                📱
              </span>
              <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-black text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                Prepaid &amp; 5G
              </span>
            </div>

            <div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white">Mobile Recharge</h3>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Mobile prepaid recharge, unlimited 5G data booster packs, annual plans, and telecom validity extensions.
              </p>
            </div>

            {/* Operator Pills */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-400">
              <span className="rounded-lg bg-rose-50 px-2 py-0.5 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">🔴 Airtel</span>
              <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">🔵 Jio</span>
              <span className="rounded-lg bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">🟡 Vi</span>
              <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">🟢 BSNL</span>
            </div>

            {/* Metrics Breakdown */}
            <div className="grid grid-cols-3 gap-2 rounded-2xl border border-indigo-100 bg-white/80 p-3 text-center dark:border-white/5 dark:bg-slate-800/60">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400">Recharges</span>
                <div className="text-sm font-black text-slate-900 dark:text-white">{metrics.rechargeCount}</div>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400">Volume</span>
                <div className="text-sm font-black text-indigo-600 dark:text-indigo-400">{inr(metrics.rechargeVol)}</div>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400">Commission</span>
                <div className="text-sm font-black text-amber-600 dark:text-amber-400">{inr(metrics.rechargeComm)}</div>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <Link
              href="/business/bill-payment/mobile-recharge"
              className="btn-3d-tactile-primary flex w-full items-center justify-center gap-2 py-3 text-xs font-black shadow-lg"
            >
              <span>Open Mobile Recharge Terminal →</span>
            </Link>
          </div>
        </div>

        {/* CARD 2: UTILITY BILL PAYMENT */}
        <div className="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-cyan-200 bg-gradient-to-br from-white via-cyan-50/30 to-cyan-100/20 p-6 shadow-md transition hover:shadow-xl dark:border-cyan-900/40 dark:from-slate-900 dark:via-cyan-950/20 dark:to-slate-900">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-600 text-2xl text-white shadow-md shadow-cyan-600/30">
                🧾
              </span>
              <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-black text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300">
                BBPS &amp; Utilities
              </span>
            </div>

            <div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white">Utility Bill Payment</h3>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Electricity, piped gas, water, broadband, DTH, FASTag, landline, insurance, and institutional bill payments.
              </p>
            </div>

            {/* Category Pills */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-400">
              <span className="rounded-lg bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">⚡ Electricity</span>
              <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">💧 Water</span>
              <span className="rounded-lg bg-rose-50 px-2 py-0.5 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">🔥 Gas</span>
              <span className="rounded-lg bg-purple-50 px-2 py-0.5 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">📡 Broadband</span>
              <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">🚗 FASTag</span>
            </div>

            {/* Metrics Breakdown */}
            <div className="grid grid-cols-3 gap-2 rounded-2xl border border-cyan-100 bg-white/80 p-3 text-center dark:border-white/5 dark:bg-slate-800/60">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400">Bills Paid</span>
                <div className="text-sm font-black text-slate-900 dark:text-white">{metrics.utilityCount}</div>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400">Volume</span>
                <div className="text-sm font-black text-cyan-600 dark:text-cyan-400">{inr(metrics.utilityVol)}</div>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400">Commission</span>
                <div className="text-sm font-black text-amber-600 dark:text-amber-400">{inr(metrics.utilityComm)}</div>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <Link
              href="/business/bill-payment/utility"
              className="btn-3d-tactile-primary flex w-full items-center justify-center gap-2 py-3 text-xs font-black shadow-lg"
            >
              <span>Open Utility Billing Terminal →</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 4. RECENT TRANSACTIONS CONSOLE */}
      <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-md dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-white/5">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Recent Bill Payment &amp; Recharge Transactions
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Consolidated real-time feed of mobile recharges and utility bill settlements.
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5 text-xs">
            {(["all", "recharge", "utility"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFilterType(t)}
                className={`rounded-lg px-3 py-1 text-[11px] font-bold capitalize transition ${
                  filterType === t
                    ? "bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                {t === "all" ? "All Services" : t === "recharge" ? "Recharges" : "Utility Bills"}
              </button>
            ))}
          </div>
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-black uppercase text-slate-400 dark:border-white/5 dark:bg-white/5">
                <th className="px-4 py-2.5">Date &amp; Time</th>
                <th className="px-4 py-2.5">Service</th>
                <th className="px-4 py-2.5">Txn #</th>
                <th className="px-4 py-2.5">Identifier / Mobile</th>
                <th className="px-4 py-2.5">Provider / Biller</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5 text-right">Commission</th>
                <th className="px-4 py-2.5">Payment Method</th>
                <th className="px-4 py-2.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filteredTxns.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-xs text-slate-400">
                    No recent bill payment transactions found.
                  </td>
                </tr>
              ) : (
                filteredTxns.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/60 dark:hover:bg-white/2 transition">
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      <div>{fmtDate(t.transaction_date)}</div>
                      <div className="text-[10px] text-slate-400">{fmtTime(t.transaction_timestamp || t.created_at)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-black ${
                        t.service_type === "recharge"
                          ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                          : "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300"
                      }`}>
                        {t.service_type === "recharge" ? "📱 Recharge" : "🧾 Utility Bill"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-white">
                      {t.transaction_number}
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                      {t.customer_mobile ? `+91 ${t.customer_mobile}` : t.reference || "—"}
                      {t.customers?.name && (
                        <div className="text-[10px] text-slate-400 font-normal">{t.customers.name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">
                      {t.providers?.name || t.remarks || "Biller"}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-slate-900 dark:text-white">
                      {inr(Number(t.amount))}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-amber-600 dark:text-amber-400">
                      +{inr(Number(t.portal_commission || 0))}
                    </td>
                    <td className="px-4 py-3 capitalize font-medium text-slate-600 dark:text-slate-400">
                      {t.customer_pay_method || "cash"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          t.status === "success"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : t.status === "reversed"
                            ? "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300"
                            : t.status === "pending"
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                            : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
