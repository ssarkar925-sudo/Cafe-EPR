/**
 * packages/ui/src/inward-payment-modal.tsx
 * The 4-Card Inward Payment Modal:
 * [ CASH ]  [ UPI (QR Selector) ]  [ KHATA ]  [ SPLIT ]
 */

import React, { useState, useEffect } from "react";

export interface UpiQrOption {
  identifier: string;
  label: string;
  bankAccountMasked: string;
}

export interface CustomerOption {
  id: string;
  name: string;
  phone: string;
  currentDuePaisa: bigint;
  creditLimitPaisa: bigint;
}

export interface InwardModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalAmountPaisa: bigint;
  linkedQrs: UpiQrOption[];
  customers: CustomerOption[];
  onConfirm: (payload: {
    method: "CASH" | "UPI" | "KHATA" | "SPLIT";
    allocations: {
      method: "CASH" | "UPI" | "KHATA";
      amountPaisa: bigint;
      upiQrIdentifier?: string;
      customerId?: string;
    }[];
  }) => void;
}

export const InwardPaymentModal: React.FC<InwardModalProps> = ({
  isOpen,
  onClose,
  totalAmountPaisa,
  linkedQrs,
  customers,
  onConfirm,
}) => {
  const [selectedMethod, setSelectedMethod] = useState<"CASH" | "UPI" | "KHATA" | "SPLIT">("CASH");
  const [selectedQr, setSelectedQr] = useState<string>(linkedQrs[0]?.identifier || "");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  
  // Split state
  const [cashSplitPaisa, setCashSplitPaisa] = useState<bigint>(0n);
  const [upiSplitPaisa, setUpiSplitPaisa] = useState<bigint>(0n);
  const [khataSplitPaisa, setKhataSplitPaisa] = useState<bigint>(0n);

  const totalInRupees = (Number(totalAmountPaisa) / 100).toFixed(2);

  // Initialize split amounts when opening split
  useEffect(() => {
    if (selectedMethod === "SPLIT") {
      setCashSplitPaisa(totalAmountPaisa);
      setUpiSplitPaisa(0n);
      setKhataSplitPaisa(0n);
    }
  }, [selectedMethod, totalAmountPaisa]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "c" || e.key === "C") setSelectedMethod("CASH");
      if (e.key === "u" || e.key === "U") setSelectedMethod("UPI");
      if (e.key === "k" || e.key === "K") setSelectedMethod("KHATA");
      if (e.key === "s" || e.key === "S") setSelectedMethod("SPLIT");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (selectedMethod === "CASH") {
      onConfirm({
        method: "CASH",
        allocations: [{ method: "CASH", amountPaisa: totalAmountPaisa }],
      });
    } else if (selectedMethod === "UPI") {
      onConfirm({
        method: "UPI",
        allocations: [{ method: "UPI", amountPaisa: totalAmountPaisa, upiQrIdentifier: selectedQr }],
      });
    } else if (selectedMethod === "KHATA") {
      if (!selectedCustomerId) {
        alert("Please select a customer for Khata credit.");
        return;
      }
      onConfirm({
        method: "KHATA",
        allocations: [{ method: "KHATA", amountPaisa: totalAmountPaisa, customerId: selectedCustomerId }],
      });
    } else if (selectedMethod === "SPLIT") {
      const splitSum = cashSplitPaisa + upiSplitPaisa + khataSplitPaisa;
      if (splitSum !== totalAmountPaisa) {
        alert(`Split total (₹${Number(splitSum)/100}) does not match bill total (₹${totalInRupees}).`);
        return;
      }
      const allocations: any[] = [];
      if (cashSplitPaisa > 0n) allocations.push({ method: "CASH", amountPaisa: cashSplitPaisa });
      if (upiSplitPaisa > 0n) allocations.push({ method: "UPI", amountPaisa: upiSplitPaisa, upiQrIdentifier: selectedQr });
      if (khataSplitPaisa > 0n) {
        if (!selectedCustomerId) {
          alert("Please select a customer for the Khata split portion.");
          return;
        }
        allocations.push({ method: "KHATA", amountPaisa: khataSplitPaisa, customerId: selectedCustomerId });
      }
      onConfirm({ method: "SPLIT", allocations });
    }
  };

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Collect Payment</h2>
            <p className="text-xs text-slate-400">Select payment method or press shortcut key</p>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-400 block uppercase tracking-wider font-semibold">Total Due</span>
            <span className="text-2xl font-black text-emerald-400">₹{totalInRupees}</span>
          </div>
        </div>

        {/* 4 CARDS SELECTOR */}
        <div className="p-6">
          <div className="grid grid-cols-4 gap-3 mb-6">
            {/* CARD 1: CASH */}
            <button
              type="button"
              onClick={() => setSelectedMethod("CASH")}
              className={`p-4 rounded-xl border-2 text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                selectedMethod === "CASH"
                  ? "border-emerald-600 bg-emerald-50 text-emerald-900 shadow-md ring-2 ring-emerald-500/20"
                  : "border-slate-200 hover:border-slate-300 bg-slate-50/50 text-slate-700"
              }`}
            >
              <span className="text-2xl mb-1">💵</span>
              <span className="font-bold text-sm block">CASH</span>
              <span className="text-[10px] text-slate-400 mt-1 uppercase font-semibold">[Key: C]</span>
            </button>

            {/* CARD 2: UPI */}
            <button
              type="button"
              onClick={() => setSelectedMethod("UPI")}
              className={`p-4 rounded-xl border-2 text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                selectedMethod === "UPI"
                  ? "border-sky-600 bg-sky-50 text-sky-900 shadow-md ring-2 ring-sky-500/20"
                  : "border-slate-200 hover:border-slate-300 bg-slate-50/50 text-slate-700"
              }`}
            >
              <span className="text-2xl mb-1">📱</span>
              <span className="font-bold text-sm block">UPI QR</span>
              <span className="text-[10px] text-slate-400 mt-1 uppercase font-semibold">[Key: U]</span>
            </button>

            {/* CARD 3: KHATA */}
            <button
              type="button"
              onClick={() => setSelectedMethod("KHATA")}
              className={`p-4 rounded-xl border-2 text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                selectedMethod === "KHATA"
                  ? "border-amber-600 bg-amber-50 text-amber-900 shadow-md ring-2 ring-amber-500/20"
                  : "border-slate-200 hover:border-slate-300 bg-slate-50/50 text-slate-700"
              }`}
            >
              <span className="text-2xl mb-1">📖</span>
              <span className="font-bold text-sm block">KHATA</span>
              <span className="text-[10px] text-slate-400 mt-1 uppercase font-semibold">[Key: K]</span>
            </button>

            {/* CARD 4: SPLIT */}
            <button
              type="button"
              onClick={() => setSelectedMethod("SPLIT")}
              className={`p-4 rounded-xl border-2 text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                selectedMethod === "SPLIT"
                  ? "border-purple-600 bg-purple-50 text-purple-900 shadow-md ring-2 ring-purple-500/20"
                  : "border-slate-200 hover:border-slate-300 bg-slate-50/50 text-slate-700"
              }`}
            >
              <span className="text-2xl mb-1">🔀</span>
              <span className="font-bold text-sm block">SPLIT</span>
              <span className="text-[10px] text-slate-400 mt-1 uppercase font-semibold">[Key: S]</span>
            </button>
          </div>

          {/* METHOD-SPECIFIC OPTIONS */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 min-h-[140px] flex flex-col justify-center">
            {/* CASH DETAILS */}
            {selectedMethod === "CASH" && (
              <div className="text-center py-2">
                <p className="text-sm text-slate-600 font-medium">Physical Cash Inward</p>
                <p className="text-xs text-slate-400 mt-1">Collecting <span className="font-bold text-slate-700">₹{totalInRupees}</span> directly into the Shop Cash Drawer.</p>
              </div>
            )}

            {/* UPI QR SELECTOR */}
            {(selectedMethod === "UPI" || selectedMethod === "SPLIT") && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">
                  Select Linked Shop QR:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {linkedQrs.map((qr) => (
                    <button
                      key={qr.identifier}
                      type="button"
                      onClick={() => setSelectedQr(qr.identifier)}
                      className={`p-3 rounded-lg border text-left text-xs transition-all cursor-pointer ${
                        selectedQr === qr.identifier
                          ? "border-sky-500 bg-sky-100/70 font-semibold text-sky-950 shadow-xs"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <div className="font-bold">{qr.label}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Linked: {qr.bankAccountMasked}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* KHATA CUSTOMER SELECTOR */}
            {(selectedMethod === "KHATA" || (selectedMethod === "SPLIT" && khataSplitPaisa > 0n)) && (
              <div className="space-y-3 mt-3">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">
                  Select Khata Customer:
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm font-medium focus:ring-2 focus:ring-amber-500 outline-none"
                >
                  <option value="">-- Choose Customer --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone}) — Due: ₹{(Number(c.currentDuePaisa)/100).toFixed(0)}
                    </option>
                  ))}
                </select>

                {selectedCustomer && (
                  <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg p-2 text-amber-900 flex justify-between">
                    <span>Current Due: <strong>₹{(Number(selectedCustomer.currentDuePaisa)/100).toFixed(2)}</strong></span>
                    <span>Credit Limit: <strong>₹{(Number(selectedCustomer.creditLimitPaisa)/100).toFixed(2)}</strong></span>
                  </div>
                )}
              </div>
            )}

            {/* SPLIT BREAKDOWN INPUTS */}
            {selectedMethod === "SPLIT" && (
              <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-slate-200">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">💵 Cash (₹):</label>
                  <input
                    type="number"
                    value={Number(cashSplitPaisa) / 100}
                    onChange={(e) => setCashSplitPaisa(BigInt(Math.round(parseFloat(e.target.value || "0") * 100)))}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">📱 UPI QR (₹):</label>
                  <input
                    type="number"
                    value={Number(upiSplitPaisa) / 100}
                    onChange={(e) => setUpiSplitPaisa(BigInt(Math.round(parseFloat(e.target.value || "0") * 100)))}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">📖 Khata (₹):</label>
                  <input
                    type="number"
                    value={Number(khataSplitPaisa) / 100}
                    onChange={(e) => setKhataSplitPaisa(BigInt(Math.round(parseFloat(e.target.value || "0") * 100)))}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm font-bold"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          >
            Cancel (Esc)
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-6 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-2"
          >
            <span>Confirm & Print Receipt</span>
            <span className="text-xs bg-emerald-700/60 px-1.5 py-0.5 rounded font-mono">↵ Enter</span>
          </button>
        </div>
      </div>
    </div>
  );
};
