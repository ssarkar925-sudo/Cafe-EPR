import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * packages/ui/src/outward-payment-modal.tsx
 * Outward Payment Modal (Money leaving the business):
 * 4 True Sources: [ BANK ] [ CREDIT CARD ] [ WALLET ] [ CASH ]
 */
import { useState } from "react";
export const OutwardPaymentModal = ({ isOpen, onClose, accounts, expenseCategories, onConfirm, }) => {
    const [sourceType, setSourceType] = useState("BANK");
    const [selectedAccountId, setSelectedAccountId] = useState("");
    const [amountRupees, setAmountRupees] = useState("");
    const [selectedCategoryId, setSelectedCategoryId] = useState(expenseCategories[0]?.id || "");
    const [paidTo, setPaidTo] = useState("");
    const [note, setNote] = useState("");
    if (!isOpen)
        return null;
    // Filter accounts by source type
    const eligibleAccounts = accounts.filter((a) => a.type === sourceType);
    const handleSubmit = (e) => {
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
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4", children: _jsxs("div", { className: "w-full max-w-xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-150", children: [_jsxs("div", { className: "bg-rose-950 px-6 py-4 text-white flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-xl font-bold tracking-tight", children: "Record Outward Payment" }), _jsx("p", { className: "text-xs text-rose-300", children: "Expenses, supplier bills, and cash payouts" })] }), _jsx("span", { className: "text-2xl", children: "\uD83D\uDCB8" })] }), _jsxs("form", { onSubmit: handleSubmit, className: "p-6 space-y-5", children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-2", children: "Select Payment Source:" }), _jsxs("div", { className: "grid grid-cols-4 gap-2", children: [_jsxs("button", { type: "button", onClick: () => {
                                                setSourceType("BANK");
                                                setSelectedAccountId("");
                                            }, className: `p-3 rounded-xl border text-center transition-all cursor-pointer ${sourceType === "BANK"
                                                ? "border-blue-600 bg-blue-50 text-blue-900 font-bold shadow-xs"
                                                : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"}`, children: [_jsx("span", { className: "text-xl block mb-0.5", children: "\uD83C\uDFE6" }), _jsx("span", { className: "text-xs", children: "BANK" })] }), _jsxs("button", { type: "button", onClick: () => {
                                                setSourceType("CREDIT_CARD");
                                                setSelectedAccountId("");
                                            }, className: `p-3 rounded-xl border text-center transition-all cursor-pointer ${sourceType === "CREDIT_CARD"
                                                ? "border-indigo-600 bg-indigo-50 text-indigo-900 font-bold shadow-xs"
                                                : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"}`, children: [_jsx("span", { className: "text-xl block mb-0.5", children: "\uD83D\uDCB3" }), _jsx("span", { className: "text-xs", children: "CARD" })] }), _jsxs("button", { type: "button", onClick: () => {
                                                setSourceType("WALLET");
                                                setSelectedAccountId("");
                                            }, className: `p-3 rounded-xl border text-center transition-all cursor-pointer ${sourceType === "WALLET"
                                                ? "border-amber-600 bg-amber-50 text-amber-900 font-bold shadow-xs"
                                                : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"}`, children: [_jsx("span", { className: "text-xl block mb-0.5", children: "\uD83D\uDC5B" }), _jsx("span", { className: "text-xs", children: "WALLET" })] }), _jsxs("button", { type: "button", onClick: () => {
                                                setSourceType("CASH");
                                                setSelectedAccountId("");
                                            }, className: `p-3 rounded-xl border text-center transition-all cursor-pointer ${sourceType === "CASH"
                                                ? "border-emerald-600 bg-emerald-50 text-emerald-900 font-bold shadow-xs"
                                                : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"}`, children: [_jsx("span", { className: "text-xl block mb-0.5", children: "\uD83D\uDCB5" }), _jsx("span", { className: "text-xs", children: "CASH" })] })] })] }), sourceType !== "CASH" && (_jsxs("div", { children: [_jsxs("label", { className: "text-xs font-semibold text-slate-600 block mb-1", children: ["Choose Specific ", sourceType === "BANK" ? "Bank Account" : sourceType === "CREDIT_CARD" ? "Credit Card" : "Portal Wallet", ":"] }), _jsx("select", { value: selectedAccountId || eligibleAccounts[0]?.id || "", onChange: (e) => setSelectedAccountId(e.target.value), className: "w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm font-medium focus:ring-2 focus:ring-rose-500 outline-none", children: eligibleAccounts.map((a) => (_jsxs("option", { value: a.id, children: [a.name, " \u2014 ", a.balanceOrLimitLabel] }, a.id))) })] })), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs font-semibold text-slate-600 block mb-1", children: "Amount (\u20B9):" }), _jsx("input", { type: "number", step: "0.01", placeholder: "0.00", required: true, value: amountRupees, onChange: (e) => setAmountRupees(e.target.value), className: "w-full bg-white border border-slate-300 rounded-lg p-2.5 text-base font-bold text-slate-900 focus:ring-2 focus:ring-rose-500 outline-none" })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-semibold text-slate-600 block mb-1", children: "Expense Category:" }), _jsx("select", { value: selectedCategoryId, onChange: (e) => setSelectedCategoryId(e.target.value), className: "w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm font-medium focus:ring-2 focus:ring-rose-500 outline-none", children: expenseCategories.map((c) => (_jsx("option", { value: c.id, children: c.name }, c.id))) })] })] }), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs font-semibold text-slate-600 block mb-1", children: "Paid To / Payee Name:" }), _jsx("input", { type: "text", placeholder: "e.g. Kolkata Paper Mart, WBSEDCL, Staff Advance", required: true, value: paidTo, onChange: (e) => setPaidTo(e.target.value), className: "w-full bg-white border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-rose-500 outline-none" })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-semibold text-slate-600 block mb-1", children: "Reference / Note (Optional):" }), _jsx("input", { type: "text", placeholder: "e.g. Invoice #912, Bill receipt ID", value: note, onChange: (e) => setNote(e.target.value), className: "w-full bg-white border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-rose-500 outline-none" })] })] }), _jsxs("div", { className: "pt-4 border-t border-slate-200 flex items-center justify-between", children: [_jsx("button", { type: "button", onClick: onClose, className: "px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer", children: "Cancel" }), _jsx("button", { type: "submit", className: "px-6 py-2.5 text-sm font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl shadow-md transition-all cursor-pointer", children: "Record Payment Out" })] })] })] }) }));
};
