/**
 * packages/ui/src/outward-payment-modal.tsx
 * Outward Payment Modal (Money leaving the business):
 * 4 True Sources: [ BANK ] [ CREDIT CARD ] [ WALLET ] [ CASH ]
 */

import React, { useState } from "react";

export interface OutwardAccountOption {
  id: string;
  name: string;
  type: "BANK" | "CREDIT_CARD" | "WALLET" | "CASH";
  balanceOrLimitLabel: string;
  metadata?: {
    dueDayOfMonth?: number;
    billingDayOfMonth?: number;
  };
}

export interface OutwardModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: OutwardAccountOption[];
  expenseCategories: { id: string; name: string }[];
  onConfirm: (payload: {
    sourceType: "BANK" | "CREDIT_CARD" | "WALLET" | "CASH";
    sourceAccountId: string;
    amountPaisa: bigint;
    expenseCategoryId: string;
    paidTo: string;
    note?: string;
  }) => void;
}

export const OutwardPaymentModal: React.FC<OutwardModalProps> = ({
  isOpen,
  onClose,
  accounts,
  expenseCategories,
  onConfirm,
}) => {
  const [sourceType, setSourceType] = useState<"BANK" | "CREDIT_CARD" | "WALLET" | "CASH">("BANK");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [amountRupees, setAmountRupees] = useState<string>("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(expenseCategories[0]?.id || "");
  const [paidTo, setPaidTo] = useState<string>("");
  const [note, setNote] = useState<string>("");

  if (!isOpen) return null;

  // Filter accounts by source type
  const eligibleAccounts = accounts.filter((a) => a.type === sourceType);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(amountRupees);
    if (!parsed || parsed <= 0) {
      alert("Please enter a valid amount.");
      return;
    }
    const accId = selectedAccountId || eligibleAccounts[0]?.id;
    if (!accId && sourceType !== "CASH") {
      alert("Please select a source account.");
      return;
    }
    if (!paidTo.trim()) {
      alert("Please specify whom the payment was made to.");
      return;
    }

    onConfirm({
      sourceType,
      sourceAccountId: accId || accounts.find((a) => a.type === "CASH")?.id || "",
      amountPaisa: BigInt(Math.round(parsed * 100)),
      expenseCategoryId: selectedCategoryId,
      paidTo: paidTo.trim(),
      note: note.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-rose-950 px-6 py-4 text-white flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Record Outward Payment</h2>
            <p className="text-xs text-rose-300">Expenses, supplier bills, and cash payouts</p>
          </div>
          <span className="text-2xl">💸</span>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* 4 SOURCE POOLS SELECTOR */}
          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-2">
              Select Payment Source:
            </label>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => {
                  setSourceType("BANK");
                  setSelectedAccountId("");
                }}
                className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                  sourceType === "BANK"
                    ? "border-blue-600 bg-blue-50 text-blue-900 font-bold shadow-xs"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"
                }`}
              >
                <span className="text-xl block mb-0.5">🏦</span>
                <span className="text-xs">BANK</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSourceType("CREDIT_CARD");
                  setSelectedAccountId("");
                }}
                className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                  sourceType === "CREDIT_CARD"
                    ? "border-indigo-600 bg-indigo-50 text-indigo-900 font-bold shadow-xs"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"
                }`}
              >
                <span className="text-xl block mb-0.5">💳</span>
                <span className="text-xs">CARD</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSourceType("WALLET");
                  setSelectedAccountId("");
                }}
                className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                  sourceType === "WALLET"
                    ? "border-amber-600 bg-amber-50 text-amber-900 font-bold shadow-xs"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"
                }`}
              >
                <span className="text-xl block mb-0.5">👛</span>
                <span className="text-xs">WALLET</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSourceType("CASH");
                  setSelectedAccountId("");
                }}
                className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                  sourceType === "CASH"
                    ? "border-emerald-600 bg-emerald-50 text-emerald-900 font-bold shadow-xs"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"
                }`}
              >
                <span className="text-xl block mb-0.5">💵</span>
                <span className="text-xs">CASH</span>
              </button>
            </div>
          </div>

          {/* SPECIFIC ACCOUNT SELECTOR */}
          {sourceType !== "CASH" && (
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">
                Choose Specific {sourceType === "BANK" ? "Bank Account" : sourceType === "CREDIT_CARD" ? "Credit Card" : "Portal Wallet"}:
              </label>
              <select
                value={selectedAccountId || eligibleAccounts[0]?.id || ""}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm font-medium focus:ring-2 focus:ring-rose-500 outline-none"
              >
                {eligibleAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — {a.balanceOrLimitLabel}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* AMOUNT & CATEGORY */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Amount (₹):</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                required
                value={amountRupees}
                onChange={(e) => setAmountRupees(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-base font-bold text-slate-900 focus:ring-2 focus:ring-rose-500 outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Expense Category:</label>
              <select
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm font-medium focus:ring-2 focus:ring-rose-500 outline-none"
              >
                {expenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* PAID TO & NOTE */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Paid To / Payee Name:</label>
              <input
                type="text"
                placeholder="e.g. Kolkata Paper Mart, WBSEDCL, Staff Advance"
                required
                value={paidTo}
                onChange={(e) => setPaidTo(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-rose-500 outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Reference / Note (Optional):</label>
              <input
                type="text"
                placeholder="e.g. Invoice #912, Bill receipt ID"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-rose-500 outline-none"
              />
            </div>
          </div>

          {/* ACTIONS */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 text-sm font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl shadow-md transition-all cursor-pointer"
            >
              Record Payment Out
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
