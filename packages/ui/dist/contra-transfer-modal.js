import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * packages/ui/src/contra-transfer-modal.tsx
 * Universal Contra Transfer Modal:
 * FROM (Source) ➔ TO (Destination) internal liquidity rebalancing.
 */
import { useState } from "react";
export const ContraTransferModal = ({ isOpen, onClose, accounts, onConfirm, }) => {
    const [fromAccountId, setFromAccountId] = useState(accounts[0]?.id || "");
    const [toAccountId, setToAccountId] = useState(accounts[1]?.id || "");
    const [amountRupees, setAmountRupees] = useState("");
    const [feeRupees, setFeeRupees] = useState("");
    const [note, setNote] = useState("");
    if (!isOpen)
        return null;
    // Preset quick chips
    const applyPreset = (fromType, toType, defaultFee = "") => {
        const from = accounts.find((a) => a.type === fromType);
        const to = accounts.find((a) => a.type === toType);
        if (from)
            setFromAccountId(from.id);
        if (to)
            setToAccountId(to.id);
        setFeeRupees(defaultFee);
    };
    const handleSubmit = (e) => {
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
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4", children: _jsxs("div", { className: "w-full max-w-xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-150", children: [_jsxs("div", { className: "bg-indigo-950 px-6 py-4 text-white flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-xl font-bold tracking-tight", children: "Move Money Between Accounts" }), _jsx("p", { className: "text-xs text-indigo-300", children: "Internal transfers, ATM withdrawals, and settlements" })] }), _jsx("span", { className: "text-2xl", children: "\uD83D\uDD04" })] }), _jsxs("form", { onSubmit: handleSubmit, className: "p-6 space-y-5", children: [_jsxs("div", { children: [_jsx("span", { className: "text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5", children: "\u26A1 Quick Presets:" }), _jsxs("div", { className: "flex flex-wrap gap-1.5", children: [_jsx("button", { type: "button", onClick: () => applyPreset("BANK", "CASH"), className: "text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors cursor-pointer", children: "\uD83C\uDFE6 \u2794 \uD83D\uDCB5 ATM Cash Out" }), _jsx("button", { type: "button", onClick: () => applyPreset("CASH", "BANK"), className: "text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors cursor-pointer", children: "\uD83D\uDCB5 \u2794 \uD83C\uDFE6 CDM Cash Deposit" }), _jsx("button", { type: "button", onClick: () => applyPreset("WALLET", "BANK", "5.00"), className: "text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors cursor-pointer", children: "\uD83D\uDC5B \u2794 \uD83C\uDFE6 AEPS to Bank (\u20B95 Fee)" }), _jsx("button", { type: "button", onClick: () => applyPreset("BANK", "WALLET"), className: "text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors cursor-pointer", children: "\uD83C\uDFE6 \u2794 \uD83D\uDC5B Load Portal Float" }), _jsx("button", { type: "button", onClick: () => applyPreset("BANK", "CREDIT_CARD"), className: "text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors cursor-pointer", children: "\uD83C\uDFE6 \u2794 \uD83D\uDCB3 Pay Credit Card" })] })] }), _jsxs("div", { className: "bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs font-semibold text-slate-600 block mb-1", children: "\uD83D\uDCE4 FROM (Money Leaving):" }), _jsx("select", { value: fromAccountId, onChange: (e) => setFromAccountId(e.target.value), className: "w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none", children: accounts.map((a) => (_jsxs("option", { value: a.id, children: [a.name, " \u2014 (", a.balanceLabel, ")"] }, a.id))) })] }), _jsx("div", { className: "flex justify-center -my-2 text-indigo-600", children: _jsx("span", { className: "bg-white border border-slate-200 shadow-xs px-2.5 py-0.5 rounded-full text-xs font-bold", children: "\u2B07\uFE0F Transferring To" }) }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-semibold text-slate-600 block mb-1", children: "\uD83D\uDCE5 TO (Money Receiving):" }), _jsx("select", { value: toAccountId, onChange: (e) => setToAccountId(e.target.value), className: "w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none", children: accounts.map((a) => (_jsxs("option", { value: a.id, children: [a.name, " \u2014 (", a.balanceLabel, ")"] }, a.id))) })] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs font-semibold text-slate-600 block mb-1", children: "Transfer Amount (\u20B9):" }), _jsx("input", { type: "number", step: "0.01", placeholder: "0.00", required: true, value: amountRupees, onChange: (e) => setAmountRupees(e.target.value), className: "w-full bg-white border border-slate-300 rounded-lg p-2.5 text-base font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-semibold text-slate-600 block mb-1", children: "Payout/Portal Fee (\u20B9):" }), _jsx("input", { type: "number", step: "0.01", placeholder: "0.00", value: feeRupees, onChange: (e) => setFeeRupees(e.target.value), className: "w-full bg-white border border-slate-300 rounded-lg p-2.5 text-base font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none" }), _jsx("span", { className: "text-[10px] text-slate-400 mt-0.5 block", children: "e.g. \u20B95 IMPS charge on AEPS payout" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-semibold text-slate-600 block mb-1", children: "Note / Reference (Optional):" }), _jsx("input", { type: "text", placeholder: "e.g. CDM Slip #412, IMPS UTR", value: note, onChange: (e) => setNote(e.target.value), className: "w-full bg-white border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" })] }), _jsxs("div", { className: "text-xs bg-indigo-50 border border-indigo-200 rounded-lg p-2.5 text-indigo-900", children: ["\u2139\uFE0F ", _jsx("strong", { children: "Internal Transfer:" }), " Moves money from ", fromAcc?.name || "Source", " to ", toAcc?.name || "Destination", ". This does not affect shop revenue or net profit."] }), _jsxs("div", { className: "pt-4 border-t border-slate-200 flex items-center justify-between", children: [_jsx("button", { type: "button", onClick: onClose, className: "px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer", children: "Cancel" }), _jsx("button", { type: "submit", className: "px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-md transition-all cursor-pointer", children: "Confirm & Move Money" })] })] })] }) }));
};
