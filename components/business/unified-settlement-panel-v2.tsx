"use client";

import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { inr } from "@/lib/format";
import MultiPaymentCollection, { type PaymentAllocation } from "@/components/business/multi-payment-collection";
import type { PaymentInstrument } from "@/components/business/recharge-workspace";

type PaymentMethod = "cash" | "upi" | "bank" | "wallet" | "card" | "due";
type Segment = "payment" | "funding" | "economics";

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

const PAYMENT_METHODS: Array<{ id: PaymentMethod; label: string; hint: string; icon: string }> = [
  { id: "cash", label: "Cash", hint: "Till / counter", icon: "💵" },
  { id: "upi", label: "UPI", hint: "Shop UPI", icon: "📱" },
  { id: "bank", label: "Bank", hint: "Bank transfer", icon: "🏦" },
  { id: "wallet", label: "Wallet", hint: "Digital wallet", icon: "👛" },
  { id: "card", label: "Card", hint: "Debit / credit", icon: "💳" },
  { id: "due", label: "Khata", hint: "Customer due", icon: "📒" },
];

function money(value: number) {
  return inr(Number.isFinite(value) ? value : 0);
}

function accountGroup(type?: string) {
  const normalized = (type || "").toLowerCase();
  if (normalized === "bank") return "Bank";
  if (normalized === "credit_card") return "Credit Card";
  if (normalized === "wallet") return "Wallet";
  if (normalized === "cash") return "Cash";
  if (normalized === "upi" || normalized === "upi_qr") return "UPI";
  if (normalized.includes("aeps") || normalized.includes("portal")) return "AEPS / Portal";
  return "Other";
}

function accountIcon(type?: string) {
  const group = accountGroup(type);
  switch (group) {
    case "Bank": return "🏦";
    case "Credit Card": return "💳";
    case "Wallet": return "👛";
    case "Cash": return "💵";
    case "UPI": return "📱";
    case "AEPS / Portal": return "🧳";
    default: return "💼";
  }
}

export default function UnifiedSettlementPanelV2({
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
  const [activeSegment, setActiveSegment] = useState<Segment>("payment");
  const [fundingGroup, setFundingGroup] = useState("All");

  const hasFundingBalance = typeof selectedFundingAccount?.balance === "number";
  const insufficientFunding = hasFundingBalance && Number(selectedFundingAccount?.balance || 0) < Math.max(0, providerCost);
  const balanceAfter = hasFundingBalance
    ? Number(selectedFundingAccount?.balance || 0) - Math.max(0, providerCost)
    : null;

  const activeFunding = useMemo(
    () => fundingInstruments.filter((instrument) => instrument.is_active !== false),
    [fundingInstruments],
  );

  const fundingGroups = useMemo(() => {
    const order = ["All", "Bank", "Credit Card", "Wallet", "UPI", "Cash", "AEPS / Portal", "Other"];
    const counts = new Map<string, number>();
    for (const instrument of activeFunding) {
      const group = accountGroup(instrument.type);
      counts.set(group, (counts.get(group) || 0) + 1);
    }
    return order.filter((group) => group === "All" || (counts.get(group) || 0) > 0);
  }, [activeFunding]);

  const visibleFunding = useMemo(
    () => fundingGroup === "All" ? activeFunding : activeFunding.filter((instrument) => accountGroup(instrument.type) === fundingGroup),
    [activeFunding, fundingGroup],
  );

  const fundingReady = Boolean(selectedFundingAccount) && !insufficientFunding;
  const ready = canSubmit && fundingReady && !submitting;
  const statusText = submitting
    ? "Processing"
    : insufficientFunding
    ? "Funding balance low"
    : !selectedFundingAccount
    ? "Select funding"
    : customerDue > 0
    ? `Customer due ${money(customerDue)}`
    : ready
    ? "Ready to settle"
    : "Complete required fields";

  const selectSegment = (segment: Segment) => setActiveSegment(segment);

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
    } else if (customerPayMethod === "due") {
      setCustomerPayMethod("cash");
    }
  };

  const handleAllocations = (rows: PaymentAllocation[]) => {
    setCustomerPaymentAllocations(rows);
    setPartialPayment(true);
    const first = rows.find((row) => Number(row.amount) > 0);
    if (first) setCustomerPayMethod(first.method as PaymentMethod);
  };

  return (
    <>
      <aside className="settlement-shell settlement-right-panel self-start lg:col-span-5 lg:sticky lg:top-24">
        <div className="rounded-[1.75rem] border border-slate-200/90 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-900">
          <div className="border-b border-slate-100 pb-3 dark:border-white/5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Settlement Console</span>
                <h3 className="mt-1 truncate text-base font-black text-slate-950 dark:text-white">{serviceLabel}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                  <span className="font-bold">{targetLabel}:</span>
                  <span className="font-mono font-black text-slate-700 dark:text-slate-200">{targetValue}</span>
                  {contextValue ? <><span>•</span><span>{contextLabel || "Context"}: <strong>{contextValue}</strong></span></> : null}
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black ${ready ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : insufficientFunding ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"}`}>
                {statusText}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 rounded-2xl border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-white/[0.03]">
              {[
                ["payment", "Customer Payment", "💳"],
                ["funding", "Funding Account", "🏦"],
                ["economics", "Business Economics", "📊"],
              ].map(([id, label, icon]) => (
                <button
                  key={id}
                  type="button"
                  disabled={submitting}
                  onClick={() => selectSegment(id as Segment)}
                  className={`rounded-xl px-2 py-2 text-center transition ${activeSegment === id ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-white dark:ring-white/10" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}
                >
                  <div className="text-sm">{icon}</div>
                  <div className="mt-0.5 text-[9px] font-black leading-tight">{label}</div>
                </button>
              ))}
            </div>
          </div>

          {activeSegment === "payment" ? (
            <section className="mt-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/45 p-3.5 dark:border-emerald-500/20 dark:bg-emerald-950/20">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">Customer Payment</div>
                  <div className="mt-1 font-mono text-lg font-black text-slate-950 dark:text-white">{money(customerTotal)}</div>
                </div>
                <div className="rounded-xl bg-white/80 px-2.5 py-1.5 text-right dark:bg-slate-900/70">
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
                    className={`rounded-xl border px-2.5 py-2 text-left transition ${customerPayMethod === method.id && !partialPayment ? "border-emerald-500 bg-white shadow-sm ring-2 ring-emerald-500/20 dark:border-emerald-400 dark:bg-slate-900" : "border-slate-200/80 bg-white/70 hover:border-emerald-300 hover:bg-white dark:border-white/10 dark:bg-white/5"}`}
                  >
                    <div className="flex items-center gap-1.5"><span>{method.icon}</span><span className="text-[11px] font-black text-slate-800 dark:text-slate-100">{method.label}</span></div>
                    <div className="mt-0.5 text-[9px] text-slate-400">{method.hint}</div>
                  </button>
                ))}
              </div>

              <label className="mt-3 flex cursor-pointer items-center justify-between rounded-xl border border-indigo-200/80 bg-indigo-50/70 px-3 py-2 dark:border-indigo-500/20 dark:bg-indigo-950/25">
                <span>
                  <span className="block text-[10px] font-black uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Split / Multiple Payment</span>
                  <span className="block text-[9px] text-slate-500 dark:text-slate-400">Collect across multiple methods</span>
                </span>
                <input type="checkbox" checked={partialPayment} disabled={submitting} onChange={(e) => handleSplitToggle(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
              </label>

              {partialPayment ? (
                <div className="mt-3 rounded-xl border border-white/80 bg-white/65 p-2.5 dark:border-white/5 dark:bg-slate-900/60">
                  <MultiPaymentCollection totalDue={customerTotal} disabled={submitting} mode="customer" initialMethod={customerPayMethod === "due" ? "cash" : customerPayMethod} onChange={handleAllocations} />
                  <div className="mt-2 flex items-center justify-between text-[10px] font-bold"><span className="text-slate-400">Remaining due</span><span className={customerDue > 0 ? "text-amber-600" : "text-emerald-600"}>{money(customerDue)}</span></div>
                </div>
              ) : (
                <div className="mt-2 flex items-center justify-between rounded-xl bg-white/75 px-3 py-2 text-[10px] dark:bg-slate-900/60"><span className="text-slate-400">Collection mode</span><span className="font-black capitalize text-slate-700 dark:text-slate-200">{customerPayMethod === "due" ? "Khata / Due" : customerPayMethod}</span></div>
              )}

              {customerPaymentAccount ? (
                <div className="mt-2 flex items-center justify-between rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 dark:border-white/5 dark:bg-slate-900/50">
                  <div><div className="text-[9px] font-black uppercase tracking-wide text-slate-400">Collection Account</div><div className="mt-0.5 text-[11px] font-black text-slate-700 dark:text-slate-200">{customerPaymentAccount.name}</div></div>
                  <div className="text-right"><div className="text-base">{accountIcon(customerPaymentAccount.type)}</div><div className="mt-0.5 text-[8px] font-black uppercase text-slate-400">{accountGroup(customerPaymentAccount.type)}</div></div>
                </div>
              ) : null}
            </section>
          ) : null}

          {activeSegment === "funding" ? (
            <section className="mt-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/45 p-3.5 dark:border-emerald-500/20 dark:bg-emerald-950/20">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><div className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">Funding Account</div><div className="mt-1 text-[9px] text-slate-500 dark:text-slate-400">Select one business account. Only the chosen account category is displayed.</div></div>
                <div className="rounded-xl bg-white/80 px-2.5 py-1.5 text-right dark:bg-slate-900/70"><div className="text-[9px] font-bold uppercase text-slate-400">Provider Debit</div><div className="text-xs font-black font-mono text-emerald-600 dark:text-emerald-400">{money(providerCost)}</div></div>
              </div>

              <div className="mt-3 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white/70 p-1 dark:border-white/10 dark:bg-slate-900/50">
                {fundingGroups.map((group) => (
                  <button key={group} type="button" disabled={submitting} onClick={() => setFundingGroup(group)} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[9px] font-black transition ${fundingGroup === group ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900" : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5"}`}>
                    {group}
                    {group !== "All" ? <span className="ml-1 opacity-60">{activeFunding.filter((i) => accountGroup(i.type) === group).length}</span> : null}
                  </button>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-1.5">
                {visibleFunding.map((instrument) => {
                  const balanceKnown = typeof instrument.balance === "number";
                  const isLow = balanceKnown && Number(instrument.balance || 0) < Math.max(0, providerCost);
                  const selected = instrument.id === fundingInstId;
                  return (
                    <button key={instrument.id} type="button" disabled={submitting} aria-pressed={selected} onClick={() => setFundingInstId(instrument.id)} className={`min-w-0 rounded-xl border px-2.5 py-2.5 text-left transition ${selected ? "border-emerald-500 bg-white shadow-sm ring-2 ring-emerald-500/20 dark:border-emerald-400 dark:bg-slate-900" : "border-slate-200/80 bg-white/70 hover:border-emerald-300 hover:bg-white dark:border-white/10 dark:bg-white/5"}`}>
                      <div className="flex min-w-0 items-start gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-sm dark:bg-emerald-950/35">{accountIcon(instrument.type)}</span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-black text-slate-800 dark:text-slate-100">{instrument.name}</span><span className="mt-0.5 block text-[8px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">{accountGroup(instrument.type)}</span></span>
                        {selected ? <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[7px] font-black uppercase text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">Selected</span> : null}
                      </div>
                      <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-1.5 dark:border-white/5"><span className="text-[8px] font-bold uppercase text-slate-400">Available</span><span className={`truncate text-[9px] font-black font-mono ${isLow ? "text-rose-600" : "text-slate-800 dark:text-slate-100"}`}>{balanceKnown ? money(Number(instrument.balance)) : "Not available"}</span></div>
                    </button>
                  );
                })}
              </div>

              {selectedFundingAccount ? (
                <div className="mt-3 rounded-xl border border-white/80 bg-white/75 p-3 dark:border-white/5 dark:bg-slate-900/60">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[9px] font-black uppercase tracking-wide text-slate-400">Selected Funding</div><div className="mt-1 flex items-center gap-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-base dark:bg-emerald-950/35">{accountIcon(selectedFundingAccount.type)}</span><div className="min-w-0"><div className="truncate text-xs font-black text-slate-900 dark:text-white">{selectedFundingAccount.name}</div><div className="text-[8px] font-bold uppercase text-emerald-600 dark:text-emerald-300">{accountGroup(selectedFundingAccount.type)}</div></div></div></div><div className="text-right"><div className="text-[8px] font-bold uppercase text-slate-400">This Transaction</div><div className="mt-0.5 font-mono text-sm font-black text-emerald-700 dark:text-emerald-300">{money(providerCost)}</div></div></div>
                  <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 dark:border-white/5"><div><div className="text-[8px] font-bold uppercase text-slate-400">Recorded balance</div><div className="mt-0.5 font-mono text-[11px] font-black text-slate-800 dark:text-slate-100">{hasFundingBalance ? money(Number(selectedFundingAccount.balance)) : "Not available"}</div></div><div className="text-right"><div className="text-[8px] font-bold uppercase text-slate-400">After debit</div><div className={`mt-0.5 font-mono text-[11px] font-black ${balanceAfter !== null && balanceAfter < 0 ? "text-rose-600" : "text-emerald-600"}`}>{balanceAfter !== null ? money(balanceAfter) : "—"}</div></div></div>
                  <div className={`mt-2 rounded-xl px-3 py-2 text-[9px] font-black ${insufficientFunding ? "bg-rose-50 text-rose-700 dark:bg-rose-950/35 dark:text-rose-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"}`}>{insufficientFunding ? "Funding balance is below the provider debit. Choose another account." : "Funding account is ready for provider settlement."}</div>
                </div>
              ) : <div className="mt-3 rounded-xl border border-dashed border-emerald-300/70 bg-white/45 px-3 py-4 text-center text-[10px] font-bold text-emerald-700 dark:bg-slate-900/40 dark:text-emerald-300">Select a funding account to continue.</div>}
            </section>
          ) : null}

          {activeSegment === "economics" ? (
            <section className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3.5 dark:border-white/10 dark:bg-white/[0.035]">
              <div className="flex items-center justify-between"><div><div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Business Economics</div><div className="mt-0.5 text-[9px] text-slate-400">Live transaction economics</div></div><div className="rounded-xl bg-white px-2.5 py-1.5 text-right shadow-sm dark:bg-slate-900"><div className="text-[8px] font-bold uppercase text-slate-400">Net Profit</div><div className="font-mono text-sm font-black text-emerald-600 dark:text-emerald-400">+{money(netProfit)}</div></div></div>
              <div className="mt-3 space-y-2 text-[11px]">
                <div className="flex items-center justify-between"><span className="text-slate-500">{amountLabel}</span><strong className="font-mono">{money(baseAmount)}</strong></div>
                <div className="flex items-center justify-between"><span className="text-slate-500">Customer Service Fee</span><strong className="font-mono">+{money(customerFee)}</strong></div>
                <div className="flex items-center justify-between"><span className="text-slate-500">Customer Total</span><strong className="font-mono text-emerald-700 dark:text-emerald-400">{money(customerTotal)}</strong></div>
                <div className="flex items-center justify-between"><span className="text-slate-500">{commissionLabel || "Commission / Margin"}</span><strong className="font-mono text-amber-600 dark:text-amber-400">+{money(commission)}</strong></div>
                <div className="flex items-center justify-between"><span className="text-slate-500">Provider Cost</span><strong className="font-mono">{money(providerCost)}</strong></div>
                <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-sm dark:border-white/10"><span className="font-black">Net Business Profit</span><strong className="font-mono font-black text-emerald-600 dark:text-emerald-400">+{money(netProfit)}</strong></div>
              </div>
            </section>
          ) : null}
        </div>
      </aside>

      <section className="settlement-final-shell lg:col-span-12">
        <div className="rounded-[1.75rem] border border-slate-200/90 bg-white p-4 shadow-[0_18px_55px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-900">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 xl:max-w-[360px]">
              <div className="flex flex-wrap items-center gap-2"><span className="inline-flex rounded-full bg-slate-900 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-white dark:bg-white dark:text-slate-900">Final Settlement</span><span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${ready ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : insufficientFunding ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"}`}>{statusText}</span></div>
              <h4 className="mt-2 text-sm font-black text-slate-950 dark:text-white">Review money movement before posting</h4>
              {validationHint ? <p className="mt-1 text-[9px] font-medium text-slate-500 dark:text-slate-400">{validationHint}</p> : null}
            </div>
            <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4 xl:max-w-[700px]">
              <div className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-white/[0.04]"><div className="text-[8px] font-bold uppercase text-slate-400">Customer Pays</div><div className="mt-0.5 font-mono text-sm font-black">{money(customerTotal)}</div></div>
              <div className="rounded-xl bg-violet-50 px-3 py-2.5 dark:bg-violet-950/20"><div className="text-[8px] font-bold uppercase text-violet-500">Funding Debit</div><div className="mt-0.5 font-mono text-sm font-black text-violet-700 dark:text-violet-300">{money(providerCost)}</div></div>
              <div className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-white/[0.04]"><div className="text-[8px] font-bold uppercase text-slate-400">Provider Cost</div><div className="mt-0.5 font-mono text-sm font-black">{money(providerCost)}</div></div>
              <div className="rounded-xl bg-emerald-50 px-3 py-2.5 dark:bg-emerald-950/20"><div className="text-[8px] font-bold uppercase text-emerald-600">Business Profit</div><div className="mt-0.5 font-mono text-sm font-black text-emerald-700 dark:text-emerald-300">+{money(netProfit)}</div></div>
            </div>
            <div className="xl:min-w-[230px]"><button type="button" onClick={onSubmit} disabled={!ready} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3.5 text-xs font-black text-white shadow-lg transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"><span>{submitting ? "Processing…" : `✓ ${submitLabel}`}</span></button></div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-3 text-[9px] font-bold text-slate-400 dark:border-white/5"><span>Collection: {customerPayMethod === "due" ? "Khata / Due" : customerPayMethod}</span><span>Collected: {money(customerCollected)}</span><span>Due: {money(customerDue)}</span><span>Funding: {selectedFundingAccount ? `${selectedFundingAccount.name} · ${accountGroup(selectedFundingAccount.type)}` : "Not selected"}</span></div>
        </div>
      </section>
    </>
  );
}
