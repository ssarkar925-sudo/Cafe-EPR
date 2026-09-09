"use client";

import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { inr } from "@/lib/format";
import MultiPaymentCollection, { type PaymentAllocation } from "@/components/business/multi-payment-collection";
import SettlementFundingCardV2 from "@/components/business/settlement-funding-card-v2";
import type { PaymentInstrument } from "@/components/business/recharge-workspace";

type PaymentMethod = "cash" | "upi" | "bank" | "wallet" | "card" | "due";

type UnifiedSettlementPanelProps = {
  serviceLabel: string;
  targetLabel: string;
  targetValue: string;
  contextLabel?: string;
  contextValue?: string;
  amountLabel: string;
  baseAmount: number;
  customerFee: number;
  customerTotal: number;
  customerCollected: number;
  customerDue: number;
  customerPayMethod: PaymentMethod;
  setCustomerPayMethod: (method: PaymentMethod) => void;
  partialPayment: boolean;
  setPartialPayment: (enabled: boolean) => void;
  customerPaidNow: string;
  setCustomerPaidNow: (value: string) => void;
  customerPaymentAllocations: PaymentAllocation[];
  setCustomerPaymentAllocations: Dispatch<SetStateAction<PaymentAllocation[]>>;
  customerPaymentAccount?: PaymentInstrument | null;
  fundingInstId: string;
  setFundingInstId: (value: string) => void;
  fundingInstruments: PaymentInstrument[];
  selectedFundingAccount?: PaymentInstrument | null;
  providerCost: number;
  commission: number;
  commissionLabel?: string;
  netProfit: number;
  onSubmit: () => void | Promise<void>;
  submitting: boolean;
  canSubmit: boolean;
  submitLabel: string;
  validationHint?: string;
};

const PAYMENT_METHODS: Array<{ id: PaymentMethod; label: string; hint: string }> = [
  { id: "cash", label: "Cash", hint: "Till / counter" },
  { id: "upi", label: "UPI", hint: "Shop UPI" },
  { id: "bank", label: "Bank", hint: "Bank transfer" },
  { id: "wallet", label: "Wallet", hint: "Digital wallet" },
  { id: "card", label: "Card", hint: "Debit / credit" },
  { id: "due", label: "Khata", hint: "Customer due" },
];

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

export default function UnifiedSettlementPanel({
  serviceLabel,
  targetLabel,
  targetValue,
  contextLabel,
  contextValue,
  amountLabel,
  baseAmount,
  customerFee,
  customerTotal,
  customerCollected,
  customerDue,
  customerPayMethod,
  setCustomerPayMethod,
  partialPayment,
  setPartialPayment,
  customerPaidNow,
  setCustomerPaidNow,
  customerPaymentAllocations,
  setCustomerPaymentAllocations,
  customerPaymentAccount,
  fundingInstId,
  setFundingInstId,
  fundingInstruments,
  selectedFundingAccount,
  providerCost,
  commission,
  commissionLabel,
  netProfit,
  onSubmit,
  submitting,
  canSubmit,
  submitLabel,
  validationHint,
}: UnifiedSettlementPanelProps) {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.cafeBillRechargeSettlement = "1";
    return () => {
      delete root.dataset.cafeBillRechargeSettlement;
    };
  }, []);

  const hasFundingBalance = typeof selectedFundingAccount?.balance === "number";
  const insufficientFunding =
    hasFundingBalance && Number(selectedFundingAccount?.balance || 0) < Math.max(0, providerCost);
  const balanceAfter = hasFundingBalance
    ? Number(selectedFundingAccount?.balance || 0) - Math.max(0, providerCost)
    : null;

  const handleSinglePaymentMethod = (method: PaymentMethod) => {
    setCustomerPayMethod(method);
    setPartialPayment(false);
    setCustomerPaymentAllocations([]);
    setCustomerPaidNow("");
  };

  const handleSplitToggle = (enabled: boolean) => {
    setPartialPayment(enabled);
    if (!enabled) {
      setCustomerPaymentAllocations([]);
      setCustomerPaidNow("");
      return;
    }
    if (customerPayMethod === "due") setCustomerPayMethod("cash");
  };

  const handleAllocations = (rows: PaymentAllocation[]) => {
    setCustomerPaymentAllocations(rows);
    setPartialPayment(true);
    const first = rows.find((row) => Number(row.amount) > 0);
    if (first) setCustomerPayMethod(first.method as PaymentMethod);
  };

  const fundingReady = Boolean(selectedFundingAccount) && !insufficientFunding;
  const ready = canSubmit && fundingReady && !submitting;
  const statusText = submitting
    ? "Processing transaction"
    : insufficientFunding
    ? "Insufficient funding balance"
    : !selectedFundingAccount
    ? "Select funding account"
    : customerDue > 0
    ? `Customer due ${money(customerDue)}`
    : ready
    ? "Ready to settle"
    : "Complete required fields";

  return (
    <>
      <aside className="settlement-shell settlement-right-panel self-start lg:col-span-4 lg:sticky lg:top-24">
        <div className="rounded-[1.75rem] border border-slate-200/90 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-white/5">
            <div className="min-w-0">
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Settlement Console</span>
              <h3 className="mt-1 text-base font-black tracking-tight text-slate-950 dark:text-white">{serviceLabel}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                <span className="font-bold">{targetLabel}:</span>
                <span className="font-mono font-black text-slate-700 dark:text-slate-200">{targetValue}</span>
                {contextValue ? (
                  <>
                    <span className="text-slate-300 dark:text-slate-600">•</span>
                    <span>{contextLabel || "Context"}: <strong>{contextValue}</strong></span>
                  </>
                ) : null}
              </div>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${ready ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/20 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"}`}>
              {statusText}
            </span>
          </div>

          <section className="settlement-subcard mt-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/45 p-3.5 dark:border-emerald-500/20 dark:bg-emerald-950/20">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">Customer Payment</div>
                <div className="mt-1 text-lg font-black font-mono text-slate-950 dark:text-white">{money(customerTotal)}</div>
              </div>
              <div className="rounded-xl bg-white/80 px-2.5 py-1.5 text-right shadow-sm dark:bg-slate-900/70">
                <div className="text-[9px] font-bold uppercase text-slate-400">Collected</div>
                <div className="text-xs font-black font-mono text-emerald-600 dark:text-emerald-400">{money(customerCollected)}</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {PAYMENT_METHODS.map((method) => (
                <button
                  key={method.id}
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSinglePaymentMethod(method.id)}
                  className={`rounded-xl border px-2.5 py-2 text-left transition ${
                    customerPayMethod === method.id && !partialPayment
                      ? "border-emerald-500 bg-white shadow-sm ring-2 ring-emerald-500/20 dark:border-emerald-400 dark:bg-slate-900"
                      : "border-slate-200/80 bg-white/70 hover:border-emerald-300 hover:bg-white dark:border-white/10 dark:bg-white/5"
                  }`}
                >
                  <div className="text-[11px] font-black text-slate-800 dark:text-slate-100">{method.label}</div>
                  <div className="mt-0.5 text-[9px] font-medium text-slate-400">{method.hint}</div>
                </button>
              ))}
            </div>

            <label className="mt-3 flex cursor-pointer items-center justify-between rounded-xl border border-indigo-200/80 bg-indigo-50/70 px-3 py-2 dark:border-indigo-500/20 dark:bg-indigo-950/25">
              <span>
                <span className="block text-[10px] font-black uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Split / Multiple Payment</span>
                <span className="block text-[9px] text-slate-500 dark:text-slate-400">Collect across more than one method</span>
              </span>
              <input
                type="checkbox"
                checked={partialPayment}
                disabled={submitting}
                onChange={(e) => handleSplitToggle(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
            </label>

            {partialPayment ? (
              <div className="mt-3 rounded-xl border border-white/80 bg-white/65 p-2.5 dark:border-white/5 dark:bg-slate-900/60">
                <MultiPaymentCollection
                  totalDue={customerTotal}
                  disabled={submitting}
                  mode="customer"
                  initialMethod={customerPayMethod === "due" ? "cash" : customerPayMethod}
                  onChange={handleAllocations}
                />
                <div className="mt-2 flex items-center justify-between text-[10px] font-bold">
                  <span className="text-slate-400">Remaining due</span>
                  <span className={customerDue > 0 ? "text-amber-600" : "text-emerald-600"}>{money(customerDue)}</span>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex items-center justify-between rounded-xl bg-white/75 px-3 py-2 text-[10px] dark:bg-slate-900/60">
                <span className="text-slate-400">Collection mode</span>
                <span className="font-black capitalize text-slate-700 dark:text-slate-200">{customerPayMethod === "due" ? "Khata / Due" : customerPayMethod}</span>
              </div>
            )}

            {customerPaymentAccount ? (
              <div className="mt-2 flex items-center justify-between rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 dark:border-white/5 dark:bg-slate-900/50">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">Collection Account</div>
                  <div className="mt-0.5 text-[11px] font-black text-slate-700 dark:text-slate-200">{customerPaymentAccount.name}</div>
                </div>
                <div className="text-right">
                  <div className="text-[16px] leading-none">{accountIcon(customerPaymentAccount.type)}</div>
                  <div className="mt-1 text-[8px] font-black uppercase text-slate-400">{customerPaymentAccount.type.replace(/_/g, " ")}</div>
                </div>
              </div>
            ) : null}
          </section>

          <SettlementFundingCardV2
            fundingInstId={fundingInstId}
            setFundingInstId={setFundingInstId}
            fundingInstruments={fundingInstruments}
            selectedFundingAccount={selectedFundingAccount}
            providerCost={providerCost}
            submitting={submitting}
            hasFundingBalance={hasFundingBalance}
            insufficientFunding={insufficientFunding}
            balanceAfter={balanceAfter}
          />

          <section className="settlement-subcard mt-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3.5 dark:border-white/10 dark:bg-white/[0.035]">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Business Economics</div>
            <div className="mt-3 space-y-2 text-[11px]">
              <div className="flex items-center justify-between gap-3"><span className="text-slate-500">{amountLabel}</span><strong className="font-mono text-slate-900 dark:text-white">{money(baseAmount)}</strong></div>
              <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Customer Service Fee</span><strong className="font-mono text-slate-900 dark:text-white">+{money(customerFee)}</strong></div>
              <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Customer Total</span><strong className="font-mono text-emerald-700 dark:text-emerald-400">{money(customerTotal)}</strong></div>
              <div className="flex items-center justify-between gap-3"><span className="text-slate-500">{commissionLabel || "Commission / Margin"}</span><strong className="font-mono text-amber-600 dark:text-amber-400">+{money(commission)}</strong></div>
              <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Provider Cost</span><strong className="font-mono text-slate-900 dark:text-white">{money(providerCost)}</strong></div>
              <div className="mt-2 flex items-center justify-between gap-3 border-t border-slate-200 pt-2 text-sm dark:border-white/10"><span className="font-black text-slate-800 dark:text-white">Net Business Profit</span><strong className="font-mono font-black text-emerald-600 dark:text-emerald-400">+{money(netProfit)}</strong></div>
            </div>
          </section>
        </div>
      </aside>

      <section className="settlement-final-shell lg:col-span-12">
        <div className="rounded-[1.75rem] border border-slate-200/90 bg-white p-4 shadow-[0_18px_55px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-900">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-white dark:bg-white dark:text-slate-900">Final Settlement</span>
                <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${ready ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : insufficientFunding ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"}`}>{statusText}</span>
              </div>
              <h4 className="mt-2 text-base font-black tracking-tight text-slate-950 dark:text-white">Review the complete money movement before posting</h4>
              {validationHint ? <p className="mt-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">{validationHint}</p> : null}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[620px] lg:grid-cols-4">
              <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/[0.04]"><div className="text-[9px] font-bold uppercase text-slate-400">Customer Pays</div><div className="mt-0.5 text-sm font-black font-mono text-slate-950 dark:text-white">{money(customerTotal)}</div></div>
              <div className="rounded-xl bg-violet-50 px-3 py-2 dark:bg-violet-950/20"><div className="text-[9px] font-bold uppercase text-violet-500">Funding Debit</div><div className="mt-0.5 text-sm font-black font-mono text-violet-700 dark:text-violet-300">{money(providerCost)}</div></div>
              <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/[0.04]"><div className="text-[9px] font-bold uppercase text-slate-400">Provider Cost</div><div className="mt-0.5 text-sm font-black font-mono text-slate-950 dark:text-white">{money(providerCost)}</div></div>
              <div className="rounded-xl bg-emerald-50 px-3 py-2 dark:bg-emerald-950/20"><div className="text-[9px] font-bold uppercase text-emerald-600">Business Profit</div><div className="mt-0.5 text-sm font-black font-mono text-emerald-700 dark:text-emerald-300">+{money(netProfit)}</div></div>
            </div>

            <div className="lg:min-w-[230px]">
              <button
                type="button"
                onClick={onSubmit}
                disabled={!ready}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3.5 text-xs font-black text-white shadow-lg transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                <span>{submitting ? "Processing…" : `✓ ${submitLabel}`}</span>
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-3 text-[9px] font-bold text-slate-400 dark:border-white/5">
            <span>Collection: {customerPayMethod === "due" ? "Khata / Due" : customerPayMethod}</span>
            <span>Collected: {money(customerCollected)}</span>
            <span>Due: {money(customerDue)}</span>
            <span>Funding: {selectedFundingAccount ? `${selectedFundingAccount.name} · ${selectedFundingAccount.type.replace(/_/g, " ")}` : "Not selected"}</span>
          </div>
        </div>
      </section>
    </>
  );
}
