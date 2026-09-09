"use client";

import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { inr } from "@/lib/format";
import MultiPaymentCollection, { type PaymentAllocation } from "@/components/business/multi-payment-collection";
import type { PaymentInstrument } from "@/components/business/recharge-workspace";

type PaymentMethod = "cash" | "upi" | "bank" | "wallet" | "card" | "due";
type Segment = "payment" | "funding" | "economics";

type Props = {
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

const CUSTOMER_METHODS: Array<{ id: PaymentMethod; label: string; hint: string; icon: string }> = [
  { id: "cash", label: "Cash", hint: "Till / counter", icon: "💵" },
  { id: "upi", label: "UPI", hint: "Shop UPI", icon: "📱" },
  { id: "bank", label: "Bank", hint: "Direct transfer", icon: "🏦" },
  { id: "wallet", label: "Wallet", hint: "Digital wallet", icon: "👛" },
  { id: "card", label: "Card", hint: "Debit / credit", icon: "💳" },
  { id: "due", label: "Khata", hint: "Customer due", icon: "📒" },
];

const FUNDING_GROUP_ORDER = ["Bank", "Credit Card", "Wallet", "UPI", "Cash", "AEPS Portal", "DMT Portal", "Other"];

function money(value: number) {
  return inr(Number.isFinite(Number(value)) ? Number(value) : 0);
}

function fundingGroup(type?: string) {
  const t = String(type || "").toLowerCase();
  if (t === "bank") return "Bank";
  if (t === "credit_card") return "Credit Card";
  if (t === "wallet") return "Wallet";
  if (t === "upi" || t === "upi_qr") return "UPI";
  if (t === "cash") return "Cash";
  if (t.includes("dmt")) return "DMT Portal";
  if (t.includes("aeps")) return "AEPS Portal";
  return "Other";
}

function fundingIcon(type?: string) {
  switch (fundingGroup(type)) {
    case "Bank": return "🏦";
    case "Credit Card": return "💳";
    case "Wallet": return "👛";
    case "UPI": return "📱";
    case "Cash": return "💵";
    case "AEPS Portal": return "🧳";
    case "DMT Portal": return "💸";
    default: return "💼";
  }
}

export default function UnifiedSettlementPanelV3({
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
}: Props) {
  const [activeSegment, setActiveSegment] = useState<Segment>("payment");

  const activeFunding = useMemo(
    () => fundingInstruments.filter((instrument) => instrument.is_active !== false),
    [fundingInstruments],
  );

  const availableGroups = useMemo(() => {
    const groups = new Set(activeFunding.map((instrument) => fundingGroup(instrument.type)));
    return FUNDING_GROUP_ORDER.filter((group) => groups.has(group));
  }, [activeFunding]);

  const preferredGroup = useMemo(() => {
    const selected = activeFunding.find((instrument) => instrument.id === fundingInstId);
    return selected ? fundingGroup(selected.type) : (availableGroups[0] || "Bank");
  }, [activeFunding, availableGroups, fundingInstId]);

  const [fundingGroup, setFundingGroup] = useState(preferredGroup);

  useEffect(() => {
    if (!availableGroups.includes(fundingGroup)) setFundingGroup(preferredGroup);
  }, [availableGroups, fundingGroup, preferredGroup]);

  const visibleFunding = useMemo(() => {
    return activeFunding.filter((instrument) => fundingGroup(instrument.type) === fundingGroup);
  }, [activeFunding, fundingGroup]);

  const fundingBalanceKnown = typeof selectedFundingAccount?.balance === "number";
  const availableBalance = fundingBalanceKnown ? Number(selectedFundingAccount?.balance || 0) : null;
  const debit = Math.max(0, Number(providerCost || 0));
  const insufficientFunding = availableBalance !== null && availableBalance < debit;
  const balanceAfter = availableBalance !== null ? availableBalance - debit : null;
  const fundingReady = Boolean(selectedFundingAccount) && !insufficientFunding;
  const ready = Boolean(canSubmit) && fundingReady && !submitting;

  const statusText = submitting
    ? "Processing"
    : insufficientFunding
    ? "Funding balance low"
    : !selectedFundingAccount
    ? "Select funding"
    : customerDue > 0
    ? `Due ${money(customerDue)}`
    : ready
    ? "Ready"
    : "Review required";

  const chooseMethod = (method: PaymentMethod) => {
    setCustomerPayMethod(method);
    setPartialPayment(false);
    setCustomerPaymentAllocations([]);
    setCustomerPaidNow("");
  };

  const chooseFunding = (instrument: PaymentInstrument, group: string) => {
    setFundingGroup(group);
    setFundingInstId(instrument.id);
  };

  const toggleSplit = (enabled: boolean) => {
    setPartialPayment(enabled);
    if (!enabled) {
      setCustomerPaymentAllocations([]);
      setCustomerPaidNow("");
    } else if (customerPayMethod === "due") {
      setCustomerPayMethod("cash");
    }
  };

  return (
    <>
      <aside className="settlement-shell settlement-right-panel self-start lg:col-span-4 lg:sticky lg:top-24">
        <div className="rounded-[1.75rem] border border-slate-200/90 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Settlement Console</span>
              <h3 className="mt-1 truncate text-base font-black text-slate-950 dark:text-white">{serviceLabel}</h3>
              <p className="mt-1 truncate text-[10px] text-slate-500 dark:text-slate-400">
                {targetLabel}: <strong className="font-mono text-slate-700 dark:text-slate-200">{targetValue}</strong>
                {contextValue ? <> · {contextLabel || "Context"}: <strong>{contextValue}</strong></> : null}
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black ${ready ? "bg-emerald-50 text-emerald-700" : insufficientFunding ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
              {statusText}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-white/[0.03]">
            {([
              ["payment", "Customer Payment", "💳"],
              ["funding", "Funding Account", "🏦"],
              ["economics", "Business Economics", "📊"],
            ] as Array<[Segment, string, string]>).map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                disabled={submitting}
                aria-selected={activeSegment === id}
                onClick={() => setActiveSegment(id)}
                className={`min-w-0 rounded-xl px-1.5 py-2.5 transition ${activeSegment === id ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-white dark:ring-white/10" : "text-slate-500 hover:bg-white/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"}`}
              >
                <div className="text-sm">{icon}</div>
                <div className="mt-1 text-[9px] font-black leading-tight">{label}</div>
              </button>
            ))}
          </div>

          {activeSegment === "payment" && (
            <section className="mt-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-3.5 dark:border-emerald-500/20 dark:bg-emerald-950/20">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">Customer Payment</div>
                  <div className="mt-1 font-mono text-xl font-black text-slate-950 dark:text-white">{money(customerTotal)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] font-bold uppercase text-slate-400">Collected</div>
                  <div className="font-mono text-sm font-black text-emerald-600 dark:text-emerald-400">{money(customerCollected)}</div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {CUSTOMER_METHODS.map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    disabled={submitting}
                    onClick={() => chooseMethod(method.id)}
                    className={`rounded-xl border px-2.5 py-2.5 text-left transition ${customerPayMethod === method.id && !partialPayment ? "border-emerald-500 bg-white shadow-sm ring-2 ring-emerald-500/15 dark:border-emerald-400 dark:bg-slate-900" : "border-slate-200/80 bg-white/75 hover:border-emerald-300 dark:border-white/10 dark:bg-white/5"}`}
                  >
                    <div className="flex items-center gap-1.5"><span>{method.icon}</span><span className="text-[10px] font-black text-slate-800 dark:text-slate-100">{method.label}</span></div>
                    <div className="mt-0.5 text-[8px] text-slate-400">{method.hint}</div>
                  </button>
                ))}
              </div>

              <label className="mt-3 flex cursor-pointer items-center justify-between rounded-xl border border-indigo-200/80 bg-indigo-50/70 px-3 py-2 dark:border-indigo-500/20 dark:bg-indigo-950/20">
                <span><span className="block text-[9px] font-black uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Split / Multiple Payment</span><span className="block text-[8px] text-slate-500 dark:text-slate-400">Use more than one collection method</span></span>
                <input type="checkbox" checked={partialPayment} disabled={submitting} onChange={(e) => toggleSplit(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
              </label>

              {partialPayment && (
                <div className="mt-3 rounded-xl border border-white bg-white/75 p-2.5 dark:border-white/5 dark:bg-slate-900/60">
                  <MultiPaymentCollection totalDue={customerTotal} disabled={submitting} mode="customer" initialMethod={customerPayMethod === "due" ? "cash" : customerPayMethod} onChange={(rows) => { setCustomerPaymentAllocations(rows); const first = rows.find((row) => Number(row.amount) > 0); if (first) setCustomerPayMethod(first.method as PaymentMethod); }} />
                  <div className="mt-2 flex justify-between text-[9px] font-bold"><span className="text-slate-400">Remaining due</span><span className={customerDue > 0 ? "text-amber-600" : "text-emerald-600"}>{money(customerDue)}</span></div>
                </div>
              )}

              {customerPaymentAccount && (
                <div className="mt-2 flex items-center justify-between rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 dark:border-white/5 dark:bg-slate-900/50">
                  <div><div className="text-[8px] font-black uppercase tracking-wide text-slate-400">Collection Account</div><div className="mt-0.5 text-[10px] font-black text-slate-700 dark:text-slate-200">{customerPaymentAccount.name}</div></div>
                  <div className="text-right text-base">{fundingIcon(customerPaymentAccount.type)}</div>
                </div>
              )}
            </section>
          )}

          {activeSegment === "funding" && (
            <section className="mt-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-3.5 dark:border-emerald-500/20 dark:bg-emerald-950/20">
              <div className="flex items-start justify-between gap-3">
                <div><div className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">Funding Account</div><div className="mt-1 text-[8px] leading-relaxed text-slate-500 dark:text-slate-400">Choose one account category. Only accounts in that category are displayed.</div></div>
                <div className="shrink-0 rounded-xl bg-white/80 px-2.5 py-1.5 text-right dark:bg-slate-900/70"><div className="text-[8px] font-bold uppercase text-slate-400">Provider Debit</div><div className="font-mono text-xs font-black text-emerald-700 dark:text-emerald-300">{money(debit)}</div></div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {availableGroups.map((group) => (
                  <button key={group} type="button" disabled={submitting} onClick={() => setFundingGroup(group)} className={`rounded-xl border px-2.5 py-1.5 text-[8px] font-black transition ${fundingGroup === group ? "border-slate-900 bg-slate-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-slate-900" : "border-slate-200 bg-white/80 text-slate-500 hover:border-emerald-300 hover:text-slate-900 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-400"}`}>{group}<span className="ml-1 opacity-60">{activeFunding.filter((i) => fundingGroup(i.type) === group).length}</span></button>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-1.5">
                {visibleFunding.length === 0 ? (
                  <div className="col-span-2 rounded-xl border border-dashed border-slate-300 bg-white/50 px-3 py-5 text-center text-[9px] font-bold text-slate-400 dark:border-white/10 dark:bg-white/5">No active accounts in this category.</div>
                ) : visibleFunding.map((instrument) => {
                  const selected = instrument.id === fundingInstId;
                  const known = typeof instrument.balance === "number";
                  const balance = known ? Number(instrument.balance) : null;
                  const low = balance !== null && balance < debit;
                  return (
                    <button key={instrument.id} type="button" disabled={submitting} aria-pressed={selected} onClick={() => chooseFunding(instrument, fundingGroup(instrument.type))} className={`min-w-0 rounded-xl border px-2.5 py-2.5 text-left transition ${selected ? "border-emerald-500 bg-white shadow-sm ring-2 ring-emerald-500/15 dark:border-emerald-400 dark:bg-slate-900" : "border-slate-200/80 bg-white/75 hover:border-emerald-300 dark:border-white/10 dark:bg-white/5"}`}>
                      <div className="flex min-w-0 items-start gap-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-sm dark:bg-emerald-950/35">{fundingIcon(instrument.type)}</span><span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-black text-slate-800 dark:text-slate-100">{instrument.name}</span><span className="mt-0.5 block text-[8px] font-bold uppercase text-emerald-600 dark:text-emerald-300">{fundingGroup(instrument.type)}</span></span>{selected && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[7px] font-black uppercase text-emerald-700">Selected</span>}</div>
                      <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-1.5 dark:border-white/5"><span className="text-[8px] font-bold uppercase text-slate-400">Available</span><span className={`truncate font-mono text-[9px] font-black ${low ? "text-rose-600" : "text-slate-800 dark:text-slate-100"}`}>{balance === null ? "Not available" : money(balance)}</span></div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 rounded-xl border border-white bg-white/75 p-3 dark:border-white/5 dark:bg-slate-900/60">
                {selectedFundingAccount ? (
                  <>
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[8px] font-black uppercase tracking-wide text-slate-400">Selected Account</div><div className="mt-1 flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-base dark:bg-emerald-950/35">{fundingIcon(selectedFundingAccount.type)}</span><div className="min-w-0"><div className="truncate text-xs font-black text-slate-900 dark:text-white">{selectedFundingAccount.name}</div><div className="text-[8px] font-bold uppercase text-emerald-600 dark:text-emerald-300">{fundingGroup(selectedFundingAccount.type)}</div></div></div></div><div className="text-right"><div className="text-[8px] font-bold uppercase text-slate-400">Debit</div><div className="mt-0.5 font-mono text-sm font-black text-emerald-700 dark:text-emerald-300">{money(debit)}</div></div></div>
                    <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 dark:border-white/5"><div><div className="text-[8px] font-bold uppercase text-slate-400">Current Balance</div><div className="mt-0.5 font-mono text-[10px] font-black">{availableBalance === null ? "Not available" : money(availableBalance)}</div></div><div className="text-right"><div className="text-[8px] font-bold uppercase text-slate-400">After Debit</div><div className={`mt-0.5 font-mono text-[10px] font-black ${balanceAfter !== null && balanceAfter < 0 ? "text-rose-600" : "text-emerald-600"}`}>{balanceAfter === null ? "—" : money(balanceAfter)}</div></div></div>
                    <div className={`mt-2 rounded-xl px-3 py-2 text-[8px] font-black ${insufficientFunding ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{insufficientFunding ? "Insufficient funding balance. Select another account." : "Funding account ready for provider settlement."}</div>
                  </>
                ) : <div className="text-center text-[9px] font-bold text-slate-400">Select an account above to see its settlement impact.</div>}
              </div>
            </section>
          )}

          {activeSegment === "economics" && (
            <section className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 dark:border-white/10 dark:bg-white/[0.035]">
              <div className="flex items-end justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Business Economics</div><div className="mt-1 text-[8px] text-slate-400">Live transaction economics</div></div><div className="text-right"><div className="text-[8px] font-bold uppercase text-slate-400">Net Profit</div><div className="font-mono text-base font-black text-emerald-600">+{money(netProfit)}</div></div></div>
              <div className="mt-3 space-y-2 text-[10px]"><div className="flex justify-between"><span className="text-slate-500">{amountLabel}</span><strong className="font-mono">{money(baseAmount)}</strong></div><div className="flex justify-between"><span className="text-slate-500">Customer Service Fee</span><strong className="font-mono">+{money(customerFee)}</strong></div><div className="flex justify-between"><span className="text-slate-500">Customer Total</span><strong className="font-mono text-emerald-700">{money(customerTotal)}</strong></div><div className="flex justify-between"><span className="text-slate-500">{commissionLabel || "Commission / Margin"}</span><strong className="font-mono text-amber-600">+{money(commission)}</strong></div><div className="flex justify-between"><span className="text-slate-500">Provider Cost</span><strong className="font-mono">{money(debit)}</strong></div><div className="flex justify-between border-t border-slate-200 pt-2 text-sm dark:border-white/10"><span className="font-black">Net Business Profit</span><strong className="font-mono text-emerald-600">+{money(netProfit)}</strong></div></div>
            </section>
          )}
        </div>
      </aside>

      <section className="settlement-final-shell lg:col-span-12">
        <div className="rounded-[1.75rem] border border-slate-200/90 bg-white p-4 shadow-[0_18px_55px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-900">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 xl:max-w-[340px]"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-900 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-white dark:bg-white dark:text-slate-900">Final Settlement</span><span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{statusText}</span></div><h4 className="mt-2 text-sm font-black text-slate-950 dark:text-white">Review complete money movement before posting</h4>{validationHint ? <p className="mt-1 text-[9px] text-slate-500 dark:text-slate-400">{validationHint}</p> : null}</div>
            <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4 xl:max-w-[700px]"><div className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-white/[0.04]"><div className="text-[8px] font-bold uppercase text-slate-400">Customer Pays</div><div className="mt-0.5 font-mono text-sm font-black">{money(customerTotal)}</div></div><div className="rounded-xl bg-violet-50 px-3 py-2.5 dark:bg-violet-950/20"><div className="text-[8px] font-bold uppercase text-violet-500">Funding Debit</div><div className="mt-0.5 font-mono text-sm font-black text-violet-700">{money(debit)}</div></div><div className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-white/[0.04]"><div className="text-[8px] font-bold uppercase text-slate-400">Provider Cost</div><div className="mt-0.5 font-mono text-sm font-black">{money(debit)}</div></div><div className="rounded-xl bg-emerald-50 px-3 py-2.5 dark:bg-emerald-950/20"><div className="text-[8px] font-bold uppercase text-emerald-600">Business Profit</div><div className="mt-0.5 font-mono text-sm font-black text-emerald-700">+{money(netProfit)}</div></div></div>
            <div className="xl:min-w-[220px]"><button type="button" onClick={onSubmit} disabled={!ready} className="flex w-full items-center justify-center rounded-2xl bg-slate-950 px-5 py-3.5 text-xs font-black text-white shadow-lg transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-white dark:text-slate-950">{submitting ? "Processing…" : `✓ ${submitLabel}`}</button></div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-3 text-[8px] font-bold text-slate-400 dark:border-white/5"><span>Collection: {customerPayMethod === "due" ? "Khata / Due" : customerPayMethod}</span><span>Collected: {money(customerCollected)}</span><span>Due: {money(customerDue)}</span><span>Funding: {selectedFundingAccount ? `${selectedFundingAccount.name} · ${fundingGroup(selectedFundingAccount.type)}` : "Not selected"}</span></div>
        </div>
      </section>
    </>
  );
}
