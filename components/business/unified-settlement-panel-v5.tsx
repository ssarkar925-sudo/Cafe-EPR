"use client";

import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { inr } from "@/lib/format";
import MultiPaymentCollection, { type PaymentAllocation } from "@/components/business/multi-payment-collection";
import type { PaymentInstrument } from "@/components/business/recharge-workspace";

type PaymentMethod = "cash" | "upi" | "bank" | "wallet" | "card" | "due";
type Segment = "payment" | "funding" | "economics";
type Group = "Bank" | "Credit Card" | "Wallet" | "UPI" | "Cash" | "AEPS Portal" | "DMT Portal" | "Other";

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

const METHODS: Array<{ id: PaymentMethod; label: string; hint: string; icon: string }> = [
  { id: "cash", label: "Cash", hint: "Till / counter", icon: "💵" },
  { id: "upi", label: "UPI", hint: "Shop QR / UPI", icon: "📱" },
  { id: "bank", label: "Bank", hint: "Direct transfer", icon: "🏦" },
  { id: "wallet", label: "Wallet", hint: "Digital wallet", icon: "👛" },
  { id: "card", label: "Card", hint: "Debit / credit", icon: "💳" },
  { id: "due", label: "Khata", hint: "Customer due", icon: "📒" },
];

const GROUPS: Group[] = ["Bank", "Credit Card", "Wallet", "UPI", "Cash", "AEPS Portal", "DMT Portal", "Other"];

const GROUP_META: Record<Group, { icon: string; short: string }> = {
  Bank: { icon: "🏦", short: "Bank" },
  "Credit Card": { icon: "💳", short: "Credit Card" },
  Wallet: { icon: "👛", short: "Wallet" },
  UPI: { icon: "📱", short: "UPI" },
  Cash: { icon: "💵", short: "Cash" },
  "AEPS Portal": { icon: "🪪", short: "AEPS" },
  "DMT Portal": { icon: "💸", short: "DMT" },
  Other: { icon: "💼", short: "Other" },
};

function getFundingGroup(type?: string): Group {
  const t = String(type || "").trim().toLowerCase().replace(/[-\s]+/g, "_");
  if (t === "bank" || t.includes("bank_account") || t.includes("current_account") || t.includes("savings")) return "Bank";
  if (t === "credit_card" || t.includes("credit_card") || t === "cc") return "Credit Card";
  if (t === "wallet" || t.includes("wallet")) return "Wallet";
  if (t === "upi" || t === "upi_qr" || t.includes("merchant_qr")) return "UPI";
  if (t === "cash" || t.includes("cash")) return "Cash";
  if (t === "aeps_portal" || t.includes("aeps")) return "AEPS Portal";
  if (t === "dmt_portal" || t.includes("dmt")) return "DMT Portal";
  return "Other";
}

function money(value: number | string | null | undefined) {
  const n = Number(value);
  return inr(Number.isFinite(n) ? n : 0);
}

function displayType(type?: string) {
  const group = getFundingGroup(type);
  return GROUP_META[group].short;
}

export default function UnifiedSettlementPanelV5({
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
  const activeFunding = useMemo(
    () => fundingInstruments.filter((item) => item.is_active !== false),
    [fundingInstruments],
  );

  const availableGroups = useMemo(
    () => GROUPS.filter((group) => activeFunding.some((item) => getFundingGroup(item.type) === group)),
    [activeFunding],
  );

  const selectedGroupFromAccount = useMemo(() => {
    const item = activeFunding.find((entry) => entry.id === fundingInstId);
    return item ? getFundingGroup(item.type) : null;
  }, [activeFunding, fundingInstId]);

  const fallbackGroup = availableGroups[0] ?? "Bank";
  const [segment, setSegment] = useState<Segment>("payment");
  const [activeFundingGroup, setActiveFundingGroup] = useState<Group>(selectedGroupFromAccount ?? fallbackGroup);

  useEffect(() => {
    const next = selectedGroupFromAccount ?? activeFundingGroup;
    if (!availableGroups.includes(next)) setActiveFundingGroup(fallbackGroup);
  }, [activeFundingGroup, availableGroups, fallbackGroup, selectedGroupFromAccount]);

  const visibleFunding = activeFunding.filter((item) => getFundingGroup(item.type) === activeFundingGroup);
  const selectedFunding = selectedFundingAccount ?? activeFunding.find((item) => item.id === fundingInstId) ?? null;

  const debit = Math.max(0, Number(providerCost || 0));
  const balanceKnown = typeof selectedFunding?.balance === "number";
  const balance = balanceKnown ? Number(selectedFunding?.balance) : null;
  const insufficient = balance !== null && balance < debit;
  const ready = Boolean(canSubmit && selectedFunding && !insufficient && !submitting);

  const status = submitting
    ? "Processing"
    : insufficient
      ? "Funding low"
      : customerDue > 0
        ? `Due ${money(customerDue)}`
        : ready
          ? "Ready"
          : "Review";

  const chooseMethod = (method: PaymentMethod) => {
    setCustomerPayMethod(method);
    setPartialPayment(false);
    setCustomerPaymentAllocations([]);
    setCustomerPaidNow("");
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

  const chooseFunding = (item: PaymentInstrument) => {
    setActiveFundingGroup(getFundingGroup(item.type));
    setFundingInstId(item.id);
  };

  return (
    <>
      <aside className="settlement-shell self-start min-w-0 lg:col-span-4">
        <div className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-4 pb-4 pt-4 dark:border-white/5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Settlement Console</span>
                  <span className={`rounded-full px-2 py-0.5 text-[8px] font-black ${ready ? "bg-emerald-50 text-emerald-700" : insufficient ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
                    {status}
                  </span>
                </div>
                <h3 className="mt-1 truncate text-[16px] font-black tracking-tight text-slate-950 dark:text-white">{serviceLabel}</h3>
                <p className="mt-1 truncate text-[10px] text-slate-500">
                  {targetLabel}: <strong className="font-mono text-slate-700 dark:text-slate-200">{targetValue}</strong>
                  {contextValue ? <> <span className="mx-1 text-slate-300">•</span> {contextLabel || "Context"}: <strong>{contextValue}</strong></> : null}
                </p>
              </div>
              <div className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-right dark:border-white/10 dark:bg-white/[0.03]">
                <span className="block text-[8px] font-black uppercase tracking-wide text-slate-400">{amountLabel}</span>
                <span className="mt-0.5 block font-mono text-[13px] font-black text-slate-900 dark:text-white">{money(baseAmount)}</span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-white/[0.03]">
              {([
                ["payment", "Customer Payment", "💳"],
                ["funding", "Funding Account", "🏦"],
                ["economics", "Business Economics", "📊"],
              ] as Array<[Segment, string, string]>).map(([id, label, icon]) => {
                const active = segment === id;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={submitting}
                    onClick={() => setSegment(id)}
                    className={`min-w-0 rounded-xl px-1.5 py-2.5 transition ${active ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-white dark:ring-white/10" : "text-slate-500 hover:bg-white/60 dark:hover:bg-white/[0.04]"}`}
                  >
                    <div className="text-base leading-none">{icon}</div>
                    <div className="mt-1 truncate text-[8px] font-black leading-tight">{label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {segment === "payment" && (
            <section className="border-b border-slate-100 bg-emerald-50/50 px-4 py-4 dark:border-white/5 dark:bg-emerald-950/10">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700">Customer Payment</div>
                  <div className="mt-0.5 font-mono text-[22px] font-black text-slate-950 dark:text-white">{money(customerTotal)}</div>
                  <div className="mt-0.5 text-[8px] text-slate-500">Amount + customer service fee</div>
                </div>
                <div className="text-right">
                  <div className="text-[8px] font-black uppercase text-slate-400">Collected</div>
                  <div className="font-mono text-sm font-black text-emerald-700 dark:text-emerald-400">{money(customerCollected)}</div>
                  {customerDue > 0 ? <div className="mt-0.5 text-[8px] font-black text-amber-600">Due {money(customerDue)}</div> : null}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {METHODS.map((method) => {
                  const active = customerPayMethod === method.id && !partialPayment;
                  return (
                    <button
                      key={method.id}
                      type="button"
                      disabled={submitting}
                      onClick={() => chooseMethod(method.id)}
                      className={`rounded-xl border px-2.5 py-2.5 text-left transition ${active ? "border-emerald-500 bg-white shadow-sm ring-2 ring-emerald-500/10" : "border-slate-200/90 bg-white/70 hover:bg-white dark:border-white/10 dark:bg-white/[0.03]"}`}
                    >
                      <div className="flex items-center gap-1.5"><span>{method.icon}</span><span className="text-[10px] font-black text-slate-900 dark:text-white">{method.label}</span></div>
                      <div className="mt-0.5 text-[8px] text-slate-400">{method.hint}</div>
                    </button>
                  );
                })}
              </div>

              <label className="mt-3 flex cursor-pointer items-center justify-between rounded-xl border border-indigo-200/80 bg-indigo-50/70 px-3 py-2.5 dark:border-indigo-500/20 dark:bg-indigo-950/20">
                <span>
                  <span className="block text-[9px] font-black uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Split / Multiple Payment</span>
                  <span className="block text-[8px] text-slate-500">Use two or more collection methods</span>
                </span>
                <input type="checkbox" checked={partialPayment} disabled={submitting} onChange={(event) => toggleSplit(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              </label>

              {partialPayment ? (
                <div className="mt-3 rounded-xl border border-slate-200 bg-white p-2.5 dark:border-white/10 dark:bg-slate-900">
                  <MultiPaymentCollection
                    totalDue={customerTotal}
                    disabled={submitting}
                    mode="customer"
                    initialMethod={customerPayMethod === "due" ? "cash" : customerPayMethod}
                    onChange={(rows) => {
                      setCustomerPaymentAllocations(rows);
                      const first = rows.find((row) => Number(row.amount) > 0);
                      if (first) setCustomerPayMethod(first.method as PaymentMethod);
                    }}
                  />
                  <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-[9px] font-black dark:border-white/5">
                    <span className="text-slate-400">Remaining due</span>
                    <span className={customerDue > 0 ? "text-amber-600" : "text-emerald-600"}>{money(customerDue)}</span>
                  </div>
                </div>
              ) : null}

              {customerPaymentAccount ? (
                <div className="mt-3 rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-[9px] dark:border-white/10 dark:bg-slate-900">
                  <div className="text-[8px] font-black uppercase tracking-wide text-slate-400">Collection Account</div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="truncate font-black text-slate-800 dark:text-white">{customerPaymentAccount.name}</span>
                    <span className="text-base">{GROUP_META[getFundingGroup(customerPaymentAccount.type)].icon}</span>
                  </div>
                </div>
              ) : null}
            </section>
          )}

          {segment === "funding" && (
            <section className="bg-slate-50/80 px-4 py-4 dark:bg-white/[0.02]">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">Funding Account</div>
                  <div className="mt-0.5 text-[8px] text-slate-500">Choose a category first. Only accounts from that category are shown.</div>
                </div>
                <div className="text-right">
                  <div className="text-[8px] font-black uppercase text-slate-400">Provider Debit</div>
                  <div className="font-mono text-sm font-black text-violet-700 dark:text-violet-300">{money(debit)}</div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {availableGroups.map((group) => {
                  const active = activeFundingGroup === group;
                  const count = activeFunding.filter((item) => getFundingGroup(item.type) === group).length;
                  return (
                    <button
                      key={group}
                      type="button"
                      disabled={submitting}
                      onClick={() => setActiveFundingGroup(group)}
                      className={`rounded-xl border px-2 py-2 text-left transition ${active ? "border-violet-500 bg-violet-600 text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"}`}
                    >
                      <div className="flex items-center gap-1.5"><span>{GROUP_META[group].icon}</span><span className="truncate text-[9px] font-black">{GROUP_META[group].short}</span></div>
                      <div className={`mt-0.5 text-[7px] font-bold ${active ? "text-violet-100" : "text-slate-400"}`}>{count} account{count === 1 ? "" : "s"}</div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-white/5">
                  <span className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-400">{GROUP_META[activeFundingGroup].short} Accounts</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[8px] font-black text-slate-500 dark:bg-white/5">{visibleFunding.length}</span>
                </div>

                {visibleFunding.length > 0 ? (
                  <div className="max-h-[240px] overflow-y-auto divide-y divide-slate-100 dark:divide-white/5">
                    {visibleFunding.map((item) => {
                      const selected = item.id === fundingInstId;
                      const known = typeof item.balance === "number";
                      const itemBalance = known ? Number(item.balance) : null;
                      const low = itemBalance !== null && itemBalance < debit;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          disabled={submitting}
                          onClick={() => chooseFunding(item)}
                          className={`block w-full px-3 py-3 text-left transition ${selected ? "bg-violet-50 dark:bg-violet-950/20" : "hover:bg-slate-50 dark:hover:bg-white/[0.03]"}`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"}`}>{GROUP_META[getFundingGroup(item.type)].icon}</span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className="truncate text-[10px] font-black text-slate-900 dark:text-white">{item.name}</span>
                                {selected ? <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[7px] font-black text-emerald-700">Selected</span> : null}
                              </span>
                              <span className="mt-0.5 block text-[8px] font-bold uppercase tracking-wide text-slate-400">{displayType(item.type)}</span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span className="block text-[7px] font-black uppercase text-slate-400">Available</span>
                              <span className={`block font-mono text-[10px] font-black ${low ? "text-rose-600" : "text-slate-900 dark:text-white"}`}>{itemBalance === null ? "Not available" : money(itemBalance)}</span>
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-4 py-8 text-center text-[9px] font-bold text-slate-400">No active accounts in this category.</div>
                )}
              </div>

              <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-500/20 dark:bg-violet-950/10">
                {selectedFunding ? (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-400">Selected Funding Account</div>
                        <div className="mt-1 truncate text-[11px] font-black text-slate-900 dark:text-white">{selectedFunding.name}</div>
                        <div className="mt-0.5 text-[8px] font-bold uppercase text-violet-700 dark:text-violet-300">{displayType(selectedFunding.type)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[8px] font-black uppercase text-slate-400">Debit</div>
                        <div className="font-mono text-sm font-black text-violet-700 dark:text-violet-300">{money(debit)}</div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 border-t border-violet-200/70 pt-3 text-[8px] dark:border-violet-500/10">
                      <div><span className="font-bold uppercase text-slate-400">Current Balance</span><strong className="mt-0.5 block font-mono text-[11px] text-slate-900 dark:text-white">{balance === null ? "Not available" : money(balance)}</strong></div>
                      <div className="text-right"><span className="font-bold uppercase text-slate-400">After Debit</span><strong className={`mt-0.5 block font-mono text-[11px] ${insufficient ? "text-rose-600" : "text-emerald-600"}`}>{balance === null ? "—" : money(balance - debit)}</strong></div>
                    </div>
                    <div className={`mt-3 rounded-xl px-3 py-2 text-[8px] font-black ${insufficient ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                      {insufficient ? "Insufficient balance. Select another account." : "Funding account is ready for this transaction."}
                    </div>
                  </>
                ) : (
                  <div className="py-3 text-center text-[9px] font-bold text-slate-400">Select one account to continue.</div>
                )}
              </div>
            </section>
          )}

          {segment === "economics" && (
            <section className="bg-slate-50/60 px-4 py-4 dark:bg-white/[0.02]">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300">Business Economics</div>
                  <div className="mt-0.5 text-[8px] text-slate-400">What the shop collects, funds and earns.</div>
                </div>
                <div className="text-right">
                  <div className="text-[8px] font-black uppercase text-slate-400">Net Profit</div>
                  <div className="font-mono text-[16px] font-black text-emerald-600">+{money(netProfit)}</div>
                </div>
              </div>

              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
                {[
                  ["Customer Total", money(customerTotal), "text-slate-900 dark:text-white"],
                  ["Customer Collected", money(customerCollected), "text-emerald-600"],
                  ["Customer Due", money(customerDue), customerDue > 0 ? "text-amber-600" : "text-slate-400"],
                  ["Provider Cost", money(providerCost), "text-violet-700 dark:text-violet-300"],
                  [commissionLabel || "Commission / Margin", "+" + money(commission), "text-amber-600"],
                  ["Business Profit", "+" + money(netProfit), "text-emerald-600"],
                ].map(([label, value, cls]) => (
                  <div key={label} className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5 text-[9px] last:border-b-0 dark:border-white/5">
                    <span className="font-bold text-slate-500">{label}</span>
                    <span className={`font-mono text-[10px] font-black ${cls}`}>{value}</span>
                  </div>
                ))}
              </div>

              <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[8px] text-slate-500 dark:border-white/10 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-3"><span>Funding account</span><strong className="max-w-[180px] truncate text-right text-slate-800 dark:text-slate-200">{selectedFunding?.name || "Select in Funding Account"}</strong></div>
                <div className="mt-1 flex items-center justify-between gap-3"><span>Customer method</span><strong className="capitalize text-slate-800 dark:text-slate-200">{partialPayment ? "Split / Multiple" : customerPayMethod}</strong></div>
              </div>
            </section>
          )}
        </div>
      </aside>

      <section className="min-w-0 rounded-[1.75rem] border border-slate-200/90 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-slate-900 lg:col-span-12">
        <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${ready ? "bg-emerald-500" : insufficient ? "bg-rose-500" : "bg-amber-500"}`} />
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-slate-500 dark:bg-white/5 dark:text-slate-400">Final Settlement</span>
              <span className="text-[9px] font-bold text-slate-400">{status}</span>
            </div>
            <h3 className="mt-1 text-[14px] font-black tracking-tight text-slate-950 dark:text-white">Review &amp; complete this transaction</h3>
            <p className="mt-0.5 max-w-2xl text-[9px] text-slate-500 dark:text-slate-400">{validationHint || "Customer collection, provider cost, funding debit and business margin stay reconciled before posting."}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[520px] lg:flex-1 lg:max-w-[720px]">
            {[
              ["Customer Pays", money(customerTotal), "text-slate-900 dark:text-white"],
              ["Funding Debit", money(providerCost), "text-violet-700 dark:text-violet-300"],
              ["Provider Cost", money(providerCost), "text-slate-900 dark:text-white"],
              ["Business Profit", "+" + money(netProfit), "text-emerald-600"],
            ].map(([label, value, cls]) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="text-[7px] font-black uppercase tracking-wide text-slate-400">{label}</div>
                <div className={`mt-0.5 font-mono text-[12px] font-black ${cls}`}>{value}</div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={onSubmit}
            disabled={!ready}
            className="flex shrink-0 items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-xs font-black text-white shadow-lg transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
          >
            {submitting ? "Processing…" : `✓ ${submitLabel}`}
          </button>
        </div>
      </section>
    </>
  );
}
