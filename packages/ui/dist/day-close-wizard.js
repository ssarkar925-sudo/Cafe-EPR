import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * packages/ui/src/day-close-wizard.tsx
 * The 5-Minute Nightly Day-Close & Reconciliation Wizard.
 * Cash Denomination Counter, Variance Audit, and Portal Float Verification.
 */
import { useState } from "react";
const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1];
export const DayCloseWizard = ({ businessDate, openingCashPaisa, computedCashInPaisa, computedCashOutPaisa, expectedCashPaisa, portalFloats, onLockDay, }) => {
    const [counts, setCounts] = useState({
        500: 0,
        200: 0,
        100: 0,
        50: 0,
        20: 0,
        10: 0,
        5: 0,
        2: 0,
        1: 0,
    });
    const [verifiedPortals, setVerifiedPortals] = useState({});
    // Compute total counted cash
    let totalCountedPaisa = 0n;
    for (const d of DENOMINATIONS) {
        const c = counts[d] || 0;
        totalCountedPaisa += BigInt(d) * BigInt(c) * 100n;
    }
    const variancePaisa = totalCountedPaisa - expectedCashPaisa;
    const isExactMatch = variancePaisa === 0n;
    const isShortage = variancePaisa < 0n;
    const handleCountChange = (denom, valueStr) => {
        const val = parseInt(valueStr || "0", 10);
        setCounts((prev) => ({ ...prev, [denom]: Math.max(0, isNaN(val) ? 0 : val) }));
    };
    const togglePortalVerify = (id) => {
        setVerifiedPortals((prev) => ({ ...prev, [id]: !prev[id] }));
    };
    const handleLock = () => {
        const denomsList = DENOMINATIONS.map((d) => {
            const c = counts[d] || 0;
            return {
                value: d,
                count: c,
                subtotalPaisa: BigInt(d) * BigInt(c) * 100n,
            };
        });
        onLockDay({
            businessDate,
            countedDenominations: denomsList,
            actualCountedCashPaisa: totalCountedPaisa,
            variancePaisa,
            verifiedPortalIds: Object.keys(verifiedPortals).filter((k) => verifiedPortals[k]),
        });
    };
    return (_jsxs("div", { className: "w-full max-w-4xl mx-auto bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden", children: [_jsxs("div", { className: "bg-slate-900 px-6 py-5 text-white flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-xl font-bold tracking-tight", children: "Nightly Day-Close Wizard" }), _jsxs("p", { className: "text-xs text-slate-400", children: ["Business Date: ", businessDate] })] }), _jsxs("div", { className: "bg-slate-800 px-4 py-2 rounded-xl text-right", children: [_jsx("span", { className: "text-[10px] text-slate-400 uppercase tracking-wider block font-semibold", children: "Expected In Drawer" }), _jsxs("span", { className: "text-xl font-black text-amber-400", children: ["\u20B9", (Number(expectedCashPaisa) / 100).toFixed(2)] })] })] }), _jsxs("div", { className: "p-6 space-y-8", children: [_jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsx("h3", { className: "text-sm font-bold text-slate-800 uppercase tracking-wider", children: "Step 1: Count Physical Cash Drawer Notes" }), _jsx("span", { className: "text-xs text-slate-500 font-medium", children: "Enter quantity of each bill" })] }), _jsx("div", { className: "grid grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200", children: DENOMINATIONS.map((d) => {
                                    const c = counts[d] || 0;
                                    const subtotal = d * c;
                                    return (_jsxs("div", { className: "flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200 shadow-xs", children: [_jsxs("span", { className: "font-bold text-slate-700 text-sm w-14", children: ["\u20B9", d] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-xs text-slate-400", children: "x" }), _jsx("input", { type: "number", min: "0", value: counts[d] || "", placeholder: "0", onChange: (e) => handleCountChange(d, e.target.value), className: "w-16 p-1 text-center font-bold text-sm border border-slate-300 rounded focus:ring-2 focus:ring-emerald-500 outline-none" })] }), _jsxs("span", { className: "text-xs font-semibold text-slate-500 w-16 text-right", children: ["= \u20B9", subtotal] })] }, d));
                                }) })] }), _jsxs("div", { className: "bg-slate-50 p-5 rounded-xl border border-slate-200", children: [_jsx("h3", { className: "text-sm font-bold text-slate-800 uppercase tracking-wider mb-4", children: "Step 2: Cash Reconciliation Audit" }), _jsxs("div", { className: "grid grid-cols-4 gap-4 text-center mb-6", children: [_jsxs("div", { className: "bg-white p-3 rounded-xl border border-slate-200 shadow-xs", children: [_jsx("span", { className: "text-[10px] text-slate-400 font-semibold block uppercase", children: "Opening Cash" }), _jsxs("span", { className: "text-base font-bold text-slate-800", children: ["\u20B9", (Number(openingCashPaisa) / 100).toFixed(2)] })] }), _jsxs("div", { className: "bg-white p-3 rounded-xl border border-slate-200 shadow-xs", children: [_jsx("span", { className: "text-[10px] text-slate-400 font-semibold block uppercase", children: "+ Cash Inward" }), _jsxs("span", { className: "text-base font-bold text-emerald-600", children: ["+\u20B9", (Number(computedCashInPaisa) / 100).toFixed(2)] })] }), _jsxs("div", { className: "bg-white p-3 rounded-xl border border-slate-200 shadow-xs", children: [_jsx("span", { className: "text-[10px] text-slate-400 font-semibold block uppercase", children: "- Cash Outward" }), _jsxs("span", { className: "text-base font-bold text-rose-600", children: ["-\u20B9", (Number(computedCashOutPaisa) / 100).toFixed(2)] })] }), _jsxs("div", { className: "bg-white p-3 rounded-xl border border-slate-200 shadow-xs", children: [_jsx("span", { className: "text-[10px] text-slate-400 font-semibold block uppercase", children: "= Expected In Drawer" }), _jsxs("span", { className: "text-base font-bold text-indigo-600", children: ["\u20B9", (Number(expectedCashPaisa) / 100).toFixed(2)] })] })] }), _jsxs("div", { className: `p-4 rounded-xl border flex items-center justify-between ${isExactMatch
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                                    : isShortage
                                        ? "bg-rose-50 border-rose-200 text-rose-900"
                                        : "bg-amber-50 border-amber-200 text-amber-900"}`, children: [_jsxs("div", { children: [_jsx("span", { className: "font-bold text-sm block", children: isExactMatch
                                                    ? "🎉 PERFECT CASH MATCH!"
                                                    : isShortage
                                                        ? "⚠️ CASH SHORTAGE DETECTED"
                                                        : "ℹ️ CASH OVERAGE DETECTED" }), _jsxs("span", { className: "text-xs opacity-80", children: ["Counted: \u20B9", (Number(totalCountedPaisa) / 100).toFixed(2), " | Expected: \u20B9", (Number(expectedCashPaisa) / 100).toFixed(2)] })] }), _jsxs("div", { className: "text-right", children: [_jsx("span", { className: "text-xs uppercase font-semibold block", children: "Variance" }), _jsxs("span", { className: "text-xl font-black", children: [isShortage ? "-" : "+", "\u20B9", (Number(variancePaisa < 0n ? -variancePaisa : variancePaisa) / 100).toFixed(2)] })] })] })] }), _jsxs("div", { children: [_jsx("h3", { className: "text-sm font-bold text-slate-800 uppercase tracking-wider mb-3", children: "Step 3: Portal & Digital Wallet Balances" }), _jsx("div", { className: "grid grid-cols-2 gap-3", children: portalFloats.map((portal) => {
                                    const verified = !!verifiedPortals[portal.id];
                                    return (_jsxs("div", { onClick: () => togglePortalVerify(portal.id), className: `p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${verified
                                            ? "border-emerald-500 bg-emerald-50/50 text-slate-900"
                                            : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"}`, children: [_jsxs("div", { children: [_jsx("span", { className: "font-bold text-sm block", children: portal.name }), _jsxs("span", { className: "text-xs text-slate-500", children: ["Expected Float: ", _jsxs("strong", { children: ["\u20B9", (Number(portal.expectedBalancePaisa) / 100).toFixed(2)] })] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-xs font-medium text-slate-500", children: verified ? "Verified ✓" : "Tap to verify" }), _jsx("input", { type: "checkbox", checked: verified, readOnly: true, className: "w-4 h-4 text-emerald-600 rounded cursor-pointer" })] })] }, portal.id));
                                }) })] }), _jsxs("div", { className: "pt-4 border-t border-slate-200 flex items-center justify-between", children: [_jsx("p", { className: "text-xs text-slate-500 max-w-md", children: "Locking the day records physical note counts, journals any shortage/overage variance, and freezes the business date for auditing." }), _jsx("button", { type: "button", onClick: handleLock, className: "px-6 py-3 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-sm shadow-lg transition-all cursor-pointer flex items-center gap-2", children: _jsx("span", { children: "\uD83D\uDD12 Lock Day & Generate Report" }) })] })] })] }));
};
