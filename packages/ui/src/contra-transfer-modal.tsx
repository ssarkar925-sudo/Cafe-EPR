/**
 * packages/ui/src/contra-transfer-modal.tsx
 * Universal Contra Transfer Modal:
 * FROM (Source) ➔ TO (Destination) internal liquidity rebalancing.
 */

import React, { useState } from "react";

export interface TransferAccountOption {
  id: string;
  name: string;
  type: "CASH" | "BANK" | "WALLET" | "CREDIT_CARD";
  balanceLabel: string;
}

export interface ContraModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: TransferAccountOption[];
  onConfirm: (payload: {
    fromAccountId: string;
    toAccountId: string;
    amountPaisa: bigint;
    feePaisa?: bigint;
    note?: string;
  }) => void;
}

export const ContraTransferModal: React.FC<ContraModalProps> = ({
  isOpen,
  onClose,
  accounts,
  onConfirm,
}) => {
  const [fromAccountId, setFromAccountId] = useState<string>(accounts[0]?.id || "");
  const [toAccountId, setToAccountId] = useState<string>(accounts[1]?.id || "");
  const [amountRupees, setAmountRupees] = useState<string>("");
  const [feeRupees, setFeeRupees] = useState<string>("");
  const [note, setNote] = useState<string>("");

  if (!isOpen) return null;

  // Preset quick chips
  const applyPreset = (fromType: string, toType: string, defaultFee: string = "") => {
    const from = accounts.find((a) => a.type === fromType);
    const to = accounts.find((a) => a.type === toType);
    if (from) setFromAccountId(from.id);
    if (to) setToAccountId(to.id);
    setFeeRupees(defaultFee);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(amountRupees);
    if (!amount || amount <= 0) {
      alert("Please enter a valid transfer amount.");
      return;
    }
    if (fromAccountId === toAccountId) {
      alert("Source and destination accounts cannot be the same.");
      return;
    }

    const fee = parseFloat(feeRupees || "0");
    onConfirm({
      fromAccountId,
      toAccountId,
      amountPaisa: BigInt(Math.round(amount * 100)),
      feePaisa: fee > 0 ? BigInt(Math.round(fee * 100)) : undefined,
      note: note.trim() || undefined,
    });
  };

  const fromAcc = accounts.find((a) => a.id === fromAccountId);
  const toAcc = accounts.find((a) => a.id === toAccountId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-indigo-950 px-6 py-4 text-white flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Move Money Between Accounts</h2>
            <p className="text-xs text-indigo-300">Internal transfers, ATM withdrawals, and settlements</p>
          </div>
          <span className="text-2xl">🔄</span>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* QUICK PRESET CHIPS */}
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              ⚡ Quick Presets:
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => applyPreset("BANK", "CASH")}
                className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors cursor-pointer"
              >
                🏦 ➔ 💵 ATM Cash Out
              </button>
              <button
                type="button"
                onClick={() => applyPreset("CASH", "BANK")}
                className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors cursor-pointer"
              >
                💵 ➔ 🏦 CDM Cash Deposit
              </button>
              <button
                type="button"
                onClick={() => applyPreset("WALLET", "BANK", "5.00")}
                className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors cursor-pointer"
              >
                👛 ➔ 🏦 AEPS to Bank (₹5 Fee)
              </button>
              <button
                type="button"
                onClick={() => applyPreset("BANK", "WALLET")}
                className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors cursor-pointer"
              >
                🏦 ➔ 👛 Load Portal Float
              </button>
              <button
                type="button"
                onClick={() => applyPreset("BANK", "CREDIT_CARD")}
                className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors cursor-pointer"
              >
                🏦 ➔ 💳 Pay Credit Card
              </button>
            </div>
          </div>

          {/* FROM ➔ TO SELECTORS */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">
                📤 FROM (Money Leaving):
              </label>
              <select
                value={fromAccountId}
                onChange={(e) => setFromAccountId(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — ({a.balanceLabel})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-center -my-2 text-indigo-600">
              <span className="bg-white border border-slate-200 shadow-xs px-2.5 py-0.5 rounded-full text-xs font-bold">
                ⬇️ Transferring To
              </span>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">
                📥 TO (Money Receiving):
              </label>
              <select
                value={toAccountId}
                onChange={(e) => setToAccountId(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — ({a.balanceLabel})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* AMOUNT & FEE */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Transfer Amount (₹):</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                required
                value={amountRupees}
                onChange={(e) => setAmountRupees(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-base font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Payout/Portal Fee (₹):</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={feeRupees}
                onChange={(e) => setFeeRupees(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-base font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">e.g. ₹5 IMPS charge on AEPS payout</span>
            </div>
          </div>

          {/* NOTE */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Note / Reference (Optional):</label>
            <input
              type="text"
              placeholder="e.g. CDM Slip #412, IMPS UTR"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          {/* LEDGER EXPLANATION */}
          <div className="text-xs bg-indigo-50 border border-indigo-200 rounded-lg p-2.5 text-indigo-900">
            ℹ️ <strong>Internal Transfer:</strong> Moves money from {fromAcc?.name || "Source"} to {toAcc?.name || "Destination"}. This does not affect shop revenue or net profit.
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
              className="px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-md transition-all cursor-pointer"
            >
              Confirm & Move Money
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
