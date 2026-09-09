"use client";

import { useMemo } from "react";
import { inr } from "@/lib/format";
import type { PaymentInstrument } from "@/components/business/recharge-workspace";

type SettlementFundingCardV2Props = {
  fundingInstId: string;
  setFundingInstId: (value: string) => void;
  fundingInstruments: PaymentInstrument[];
  selectedFundingAccount?: PaymentInstrument | null;
  providerCost: number;
  submitting: boolean;
  hasFundingBalance: boolean;
  insufficientFunding: boolean;
  balanceAfter: number | null;
};

function accountIcon(type?: string) {
  switch ((type || "").toLowerCase()) {
    case "credit_card":
      return "💳";
    case "wallet":
      return "👛";
    case "upi":
    case "upi_qr":
      return "⚡";
    case "bank":
      return "🏦";
    case "cash":
      return "💵";
    default:
      return "💼";
  }
}

function money(value: number) {
  return inr(Number.isFinite(value) ? value : 0);
}

export default function SettlementFundingCardV2({
  fundingInstId,
  setFundingInstId,
  fundingInstruments,
  selectedFundingAccount,
  providerCost,
  submitting,
  hasFundingBalance,
  insufficientFunding,
  balanceAfter,
}: SettlementFundingCardV2Props) {
  const activeFunding = useMemo(
    () => fundingInstruments.filter((instrument) => instrument.is_active !== false),
    [fundingInstruments]
  );

  return (
    <section className="settlement-subcard mt-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/45 p-3.5 dark:border-emerald-500/20 dark:bg-emerald-950/20">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">Funding Account</div>
          <div className="mt-1 text-[9px] text-slate-500 dark:text-slate-400">Provider cost is debited from this account</div>
        </div>
        <div className="rounded-xl bg-white/80 px-2.5 py-1.5 text-right shadow-sm dark:bg-slate-900/70">
          <div className="text-[9px] font-bold uppercase text-slate-400">Provider Debit</div>
          <div className="text-xs font-black font-mono text-emerald-600 dark:text-emerald-400">{money(providerCost)}</div>
        </div>
      </div>

      <select
        aria-label="Funding account"
        value={fundingInstId}
        onChange={(e) => setFundingInstId(e.target.value)}
        disabled={submitting}
        className="mt-3 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-xs font-black text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15 dark:border-white/10 dark:bg-slate-900 dark:text-white"
      >
        <option value="">Select funding account…</option>
        {activeFunding.map((instrument) => (
          <option key={instrument.id} value={instrument.id}>
            {instrument.name} · {instrument.type.replace(/_/g, " ").toUpperCase()}
          </option>
        ))}
      </select>

      {selectedFundingAccount ? (
        <div className="mt-3 rounded-xl border border-white/80 bg-white/75 p-3 shadow-sm dark:border-white/5 dark:bg-slate-900/60">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-base dark:bg-emerald-950/35">
                  {accountIcon(selectedFundingAccount.type)}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-xs font-black text-slate-900 dark:text-white">{selectedFundingAccount.name}</div>
                  <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
                    {selectedFundingAccount.type.replace(/_/g, " ")}
                  </div>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[9px] font-black uppercase text-slate-400">Provider Debit</div>
              <div className="mt-0.5 text-sm font-black font-mono text-emerald-700 dark:text-emerald-300">{money(providerCost)}</div>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 dark:border-white/5">
            <div>
              <div className="text-[9px] font-bold uppercase text-slate-400">Recorded balance</div>
              <div className="mt-0.5 text-xs font-black font-mono text-slate-800 dark:text-slate-100">
                {hasFundingBalance ? money(Number(selectedFundingAccount.balance)) : "Not available"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[9px] font-bold uppercase text-slate-400">After debit</div>
              <div className={`mt-0.5 text-xs font-black font-mono ${balanceAfter !== null && balanceAfter < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                {balanceAfter !== null ? money(balanceAfter) : "—"}
              </div>
            </div>
          </div>

          {insufficientFunding ? (
            <div className="mt-2 rounded-lg bg-rose-50 px-2.5 py-2 text-[10px] font-black text-rose-700 dark:bg-rose-950/35 dark:text-rose-300">
              Funding balance is below the provider debit. Choose another funding account.
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-emerald-300/70 bg-white/45 px-3 py-4 text-center text-[10px] font-bold text-emerald-700 dark:border-emerald-500/20 dark:bg-slate-900/40 dark:text-emerald-300">
          Select the business account used to settle the provider.
        </div>
      )}
    </section>
  );
}
