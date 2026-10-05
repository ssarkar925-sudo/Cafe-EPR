import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * packages/ui/src/inward-payment-modal.tsx
 * The 4-Card Inward Payment Modal:
 * [ CASH ]  [ UPI (QR Selector) ]  [ KHATA ]  [ SPLIT ]
 */
import { useState, useEffect } from "react";
export const InwardPaymentModal = ({ isOpen, onClose, totalAmountPaisa, linkedQrs, customers, onConfirm, }) => {
    const [selectedMethod, setSelectedMethod] = useState("CASH");
    const [selectedQr, setSelectedQr] = useState(linkedQrs[0]?.identifier || "");
    const [selectedCustomerId, setSelectedCustomerId] = useState("");
    // Split state
    const [cashSplitPaisa, setCashSplitPaisa] = useState(0n);
    const [upiSplitPaisa, setUpiSplitPaisa] = useState(0n);
    const [khataSplitPaisa, setKhataSplitPaisa] = useState(0n);
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
        if (!isOpen)
            return;
        const handleKeyDown = (e) => {
            if (e.key === "Escape")
                onClose();
            if (e.key === "c" || e.key === "C")
                setSelectedMethod("CASH");
            if (e.key === "u" || e.key === "U")
                setSelectedMethod("UPI");
            if (e.key === "k" || e.key === "K")
                setSelectedMethod("KHATA");
            if (e.key === "s" || e.key === "S")
                setSelectedMethod("SPLIT");
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);
    if (!isOpen)
        return null;
    const handleConfirm = () => {
        if (selectedMethod === "CASH") {
            onConfirm({
                method: "CASH",
                allocations: [{ method: "CASH", amountPaisa: totalAmountPaisa }],
            });
        }
        else if (selectedMethod === "UPI") {
            onConfirm({
                method: "UPI",
                allocations: [{ method: "UPI", amountPaisa: totalAmountPaisa, upiQrIdentifier: selectedQr }],
            });
        }
        else if (selectedMethod === "KHATA") {
            if (!selectedCustomerId) {
                alert("Please select a customer for Khata credit.");
                return;
            }
            onConfirm({
                method: "KHATA",
                allocations: [{ method: "KHATA", amountPaisa: totalAmountPaisa, customerId: selectedCustomerId }],
            });
        }
        else if (selectedMethod === "SPLIT") {
            const splitSum = cashSplitPaisa + upiSplitPaisa + khataSplitPaisa;
            if (splitSum !== totalAmountPaisa) {
                alert(`Split total (₹${Number(splitSum) / 100}) does not match bill total (₹${totalInRupees}).`);
                return;
            }
            const allocations = [];
            if (cashSplitPaisa > 0n)
                allocations.push({ method: "CASH", amountPaisa: cashSplitPaisa });
            if (upiSplitPaisa > 0n)
                allocations.push({ method: "UPI", amountPaisa: upiSplitPaisa, upiQrIdentifier: selectedQr });
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
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4", children: _jsxs("div", { className: "w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-150", children: [_jsxs("div", { className: "bg-slate-900 px-6 py-4 text-white flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-xl font-bold tracking-tight", children: "Collect Payment" }), _jsx("p", { className: "text-xs text-slate-400", children: "Select payment method or press shortcut key" })] }), _jsxs("div", { className: "text-right", children: [_jsx("span", { className: "text-xs text-slate-400 block uppercase tracking-wider font-semibold", children: "Total Due" }), _jsxs("span", { className: "text-2xl font-black text-emerald-400", children: ["\u20B9", totalInRupees] })] })] }), _jsxs("div", { className: "p-6", children: [_jsxs("div", { className: "grid grid-cols-4 gap-3 mb-6", children: [_jsxs("button", { type: "button", onClick: () => setSelectedMethod("CASH"), className: `p-4 rounded-xl border-2 text-center transition-all cursor-pointer flex flex-col items-center justify-center ${selectedMethod === "CASH"
                                        ? "border-emerald-600 bg-emerald-50 text-emerald-900 shadow-md ring-2 ring-emerald-500/20"
                                        : "border-slate-200 hover:border-slate-300 bg-slate-50/50 text-slate-700"}`, children: [_jsx("span", { className: "text-2xl mb-1", children: "\uD83D\uDCB5" }), _jsx("span", { className: "font-bold text-sm block", children: "CASH" }), _jsx("span", { className: "text-[10px] text-slate-400 mt-1 uppercase font-semibold", children: "[Key: C]" })] }), _jsxs("button", { type: "button", onClick: () => setSelectedMethod("UPI"), className: `p-4 rounded-xl border-2 text-center transition-all cursor-pointer flex flex-col items-center justify-center ${selectedMethod === "UPI"
                                        ? "border-sky-600 bg-sky-50 text-sky-900 shadow-md ring-2 ring-sky-500/20"
                                        : "border-slate-200 hover:border-slate-300 bg-slate-50/50 text-slate-700"}`, children: [_jsx("span", { className: "text-2xl mb-1", children: "\uD83D\uDCF1" }), _jsx("span", { className: "font-bold text-sm block", children: "UPI QR" }), _jsx("span", { className: "text-[10px] text-slate-400 mt-1 uppercase font-semibold", children: "[Key: U]" })] }), _jsxs("button", { type: "button", onClick: () => setSelectedMethod("KHATA"), className: `p-4 rounded-xl border-2 text-center transition-all cursor-pointer flex flex-col items-center justify-center ${selectedMethod === "KHATA"
                                        ? "border-amber-600 bg-amber-50 text-amber-900 shadow-md ring-2 ring-amber-500/20"
                                        : "border-slate-200 hover:border-slate-300 bg-slate-50/50 text-slate-700"}`, children: [_jsx("span", { className: "text-2xl mb-1", children: "\uD83D\uDCD6" }), _jsx("span", { className: "font-bold text-sm block", children: "KHATA" }), _jsx("span", { className: "text-[10px] text-slate-400 mt-1 uppercase font-semibold", children: "[Key: K]" })] }), _jsxs("button", { type: "button", onClick: () => setSelectedMethod("SPLIT"), className: `p-4 rounded-xl border-2 text-center transition-all cursor-pointer flex flex-col items-center justify-center ${selectedMethod === "SPLIT"
                                        ? "border-purple-600 bg-purple-50 text-purple-900 shadow-md ring-2 ring-purple-500/20"
                                        : "border-slate-200 hover:border-slate-300 bg-slate-50/50 text-slate-700"}`, children: [_jsx("span", { className: "text-2xl mb-1", children: "\uD83D\uDD00" }), _jsx("span", { className: "font-bold text-sm block", children: "SPLIT" }), _jsx("span", { className: "text-[10px] text-slate-400 mt-1 uppercase font-semibold", children: "[Key: S]" })] })] }), _jsxs("div", { className: "bg-slate-50 rounded-xl p-4 border border-slate-200/80 min-h-[140px] flex flex-col justify-center", children: [selectedMethod === "CASH" && (_jsxs("div", { className: "text-center py-2", children: [_jsx("p", { className: "text-sm text-slate-600 font-medium", children: "Physical Cash Inward" }), _jsxs("p", { className: "text-xs text-slate-400 mt-1", children: ["Collecting ", _jsxs("span", { className: "font-bold text-slate-700", children: ["\u20B9", totalInRupees] }), " directly into the Shop Cash Drawer."] })] })), (selectedMethod === "UPI" || selectedMethod === "SPLIT") && (_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-xs font-semibold text-slate-700 uppercase tracking-wider block", children: "Select Linked Shop QR:" }), _jsx("div", { className: "grid grid-cols-2 gap-2", children: linkedQrs.map((qr) => (_jsxs("button", { type: "button", onClick: () => setSelectedQr(qr.identifier), className: `p-3 rounded-lg border text-left text-xs transition-all cursor-pointer ${selectedQr === qr.identifier
                                                    ? "border-sky-500 bg-sky-100/70 font-semibold text-sky-950 shadow-xs"
                                                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`, children: [_jsx("div", { className: "font-bold", children: qr.label }), _jsxs("div", { className: "text-[10px] text-slate-400 mt-0.5", children: ["Linked: ", qr.bankAccountMasked] })] }, qr.identifier))) })] })), (selectedMethod === "KHATA" || (selectedMethod === "SPLIT" && khataSplitPaisa > 0n)) && (_jsxs("div", { className: "space-y-3 mt-3", children: [_jsx("label", { className: "text-xs font-semibold text-slate-700 uppercase tracking-wider block", children: "Select Khata Customer:" }), _jsxs("select", { value: selectedCustomerId, onChange: (e) => setSelectedCustomerId(e.target.value), className: "w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm font-medium focus:ring-2 focus:ring-amber-500 outline-none", children: [_jsx("option", { value: "", children: "-- Choose Customer --" }), customers.map((c) => (_jsxs("option", { value: c.id, children: [c.name, " (", c.phone, ") \u2014 Due: \u20B9", (Number(c.currentDuePaisa) / 100).toFixed(0)] }, c.id)))] }), selectedCustomer && (_jsxs("div", { className: "text-xs bg-amber-50 border border-amber-200 rounded-lg p-2 text-amber-900 flex justify-between", children: [_jsxs("span", { children: ["Current Due: ", _jsxs("strong", { children: ["\u20B9", (Number(selectedCustomer.currentDuePaisa) / 100).toFixed(2)] })] }), _jsxs("span", { children: ["Credit Limit: ", _jsxs("strong", { children: ["\u20B9", (Number(selectedCustomer.creditLimitPaisa) / 100).toFixed(2)] })] })] }))] })), selectedMethod === "SPLIT" && (_jsxs("div", { className: "grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-slate-200", children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs font-semibold text-slate-600 block mb-1", children: "\uD83D\uDCB5 Cash (\u20B9):" }), _jsx("input", { type: "number", value: Number(cashSplitPaisa) / 100, onChange: (e) => setCashSplitPaisa(BigInt(Math.round(parseFloat(e.target.value || "0") * 100))), className: "w-full bg-white border border-slate-300 rounded-lg p-2 text-sm font-bold" })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-semibold text-slate-600 block mb-1", children: "\uD83D\uDCF1 UPI QR (\u20B9):" }), _jsx("input", { type: "number", value: Number(upiSplitPaisa) / 100, onChange: (e) => setUpiSplitPaisa(BigInt(Math.round(parseFloat(e.target.value || "0") * 100))), className: "w-full bg-white border border-slate-300 rounded-lg p-2 text-sm font-bold" })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-semibold text-slate-600 block mb-1", children: "\uD83D\uDCD6 Khata (\u20B9):" }), _jsx("input", { type: "number", value: Number(khataSplitPaisa) / 100, onChange: (e) => setKhataSplitPaisa(BigInt(Math.round(parseFloat(e.target.value || "0") * 100))), className: "w-full bg-white border border-slate-300 rounded-lg p-2 text-sm font-bold" })] })] }))] })] }), _jsxs("div", { className: "bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between", children: [_jsx("button", { type: "button", onClick: onClose, className: "px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer", children: "Cancel (Esc)" }), _jsxs("button", { type: "button", onClick: handleConfirm, className: "px-6 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-2", children: [_jsx("span", { children: "Confirm & Print Receipt" }), _jsx("span", { className: "text-xs bg-emerald-700/60 px-1.5 py-0.5 rounded font-mono", children: "\u21B5 Enter" })] })] })] }) }));
};
