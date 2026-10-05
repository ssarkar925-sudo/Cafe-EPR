/**
 * packages/ui/src/day-close-wizard.tsx
 * The 5-Minute Nightly Day-Close & Reconciliation Wizard.
 * Cash Denomination Counter, Variance Audit, and Portal Float Verification.
 */

import React, { useState } from "react";

export interface PortalFloatSnapshot {
  id: string;
  name: string;
  expectedBalancePaisa: bigint;
}

export interface DayCloseWizardProps {
  businessDate: string; // 'YYYY-MM-DD'
  openingCashPaisa: bigint;
  computedCashInPaisa: bigint;
  computedCashOutPaisa: bigint;
  expectedCashPaisa: bigint; // opening + in - out
  portalFloats: PortalFloatSnapshot[];
  onLockDay: (payload: {
    businessDate: string;
    countedDenominations: { value: number; count: number; subtotalPaisa: bigint }[];
    actualCountedCashPaisa: bigint;
    variancePaisa: bigint;
    verifiedPortalIds: string[];
  }) => void;
}

const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1] as const;

export const DayCloseWizard: React.FC<DayCloseWizardProps> = ({
  businessDate,
  openingCashPaisa,
  computedCashInPaisa,
  computedCashOutPaisa,
  expectedCashPaisa,
  portalFloats,
  onLockDay,
}) => {
  const [counts, setCounts] = useState<Record<number, number>>({
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

  const [verifiedPortals, setVerifiedPortals] = useState<Record<string, boolean>>({});

  // Compute total counted cash
  let totalCountedPaisa = 0n;
  for (const d of DENOMINATIONS) {
    const c = counts[d] || 0;
    totalCountedPaisa += BigInt(d) * BigInt(c) * 100n;
  }

  const variancePaisa = totalCountedPaisa - expectedCashPaisa;
  const isExactMatch = variancePaisa === 0n;
  const isShortage = variancePaisa < 0n;

  const handleCountChange = (denom: number, valueStr: string) => {
    const val = parseInt(valueStr || "0", 10);
    setCounts((prev) => ({ ...prev, [denom]: Math.max(0, isNaN(val) ? 0 : val) }));
  };

  const togglePortalVerify = (id: string) => {
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

  return (
    <div className="w-full max-w-4xl mx-auto bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900 px-6 py-5 text-white flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Nightly Day-Close Wizard</h2>
          <p className="text-xs text-slate-400">Business Date: {businessDate}</p>
        </div>
        <div className="bg-slate-800 px-4 py-2 rounded-xl text-right">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">Expected In Drawer</span>
          <span className="text-xl font-black text-amber-400">
            ₹{(Number(expectedCashPaisa) / 100).toFixed(2)}
          </span>
        </div>
      </div>

      <div className="p-6 space-y-8">
        {/* STEP 1: NOTE DENOMINATION COUNTER */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Step 1: Count Physical Cash Drawer Notes
            </h3>
            <span className="text-xs text-slate-500 font-medium">Enter quantity of each bill</span>
          </div>

          <div className="grid grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
            {DENOMINATIONS.map((d) => {
              const c = counts[d] || 0;
              const subtotal = d * c;
              return (
                <div key={d} className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200 shadow-xs">
                  <span className="font-bold text-slate-700 text-sm w-14">₹{d}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">x</span>
                    <input
                      type="number"
                      min="0"
                      value={counts[d] || ""}
                      placeholder="0"
                      onChange={(e) => handleCountChange(d, e.target.value)}
                      className="w-16 p-1 text-center font-bold text-sm border border-slate-300 rounded focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-500 w-16 text-right">
                    = ₹{subtotal}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* STEP 2: CASH DRAWER RECONCILIATION SUMMARY */}
        <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">
            Step 2: Cash Reconciliation Audit
          </h3>

          <div className="grid grid-cols-4 gap-4 text-center mb-6">
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[10px] text-slate-400 font-semibold block uppercase">Opening Cash</span>
              <span className="text-base font-bold text-slate-800">
                ₹{(Number(openingCashPaisa) / 100).toFixed(2)}
              </span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[10px] text-slate-400 font-semibold block uppercase">+ Cash Inward</span>
              <span className="text-base font-bold text-emerald-600">
                +₹{(Number(computedCashInPaisa) / 100).toFixed(2)}
              </span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[10px] text-slate-400 font-semibold block uppercase">- Cash Outward</span>
              <span className="text-base font-bold text-rose-600">
                -₹{(Number(computedCashOutPaisa) / 100).toFixed(2)}
              </span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[10px] text-slate-400 font-semibold block uppercase">= Expected In Drawer</span>
              <span className="text-base font-bold text-indigo-600">
                ₹{(Number(expectedCashPaisa) / 100).toFixed(2)}
              </span>
            </div>
          </div>

          {/* AUDIT VERDICT BANNER */}
          <div
            className={`p-4 rounded-xl border flex items-center justify-between ${
              isExactMatch
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : isShortage
                ? "bg-rose-50 border-rose-200 text-rose-900"
                : "bg-amber-50 border-amber-200 text-amber-900"
            }`}
          >
            <div>
              <span className="font-bold text-sm block">
                {isExactMatch
                  ? "🎉 PERFECT CASH MATCH!"
                  : isShortage
                  ? "⚠️ CASH SHORTAGE DETECTED"
                  : "ℹ️ CASH OVERAGE DETECTED"}
              </span>
              <span className="text-xs opacity-80">
                Counted: ₹{(Number(totalCountedPaisa) / 100).toFixed(2)} | Expected: ₹
                {(Number(expectedCashPaisa) / 100).toFixed(2)}
              </span>
            </div>

            <div className="text-right">
              <span className="text-xs uppercase font-semibold block">Variance</span>
              <span className="text-xl font-black">
                {isShortage ? "-" : "+"}₹{(Number(variancePaisa < 0n ? -variancePaisa : variancePaisa) / 100).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* STEP 3: PORTAL FLOAT VERIFICATION CHECKLIST */}
        <div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">
            Step 3: Portal & Digital Wallet Balances
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {portalFloats.map((portal) => {
              const verified = !!verifiedPortals[portal.id];
              return (
                <div
                  key={portal.id}
                  onClick={() => togglePortalVerify(portal.id)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    verified
                      ? "border-emerald-500 bg-emerald-50/50 text-slate-900"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <div>
                    <span className="font-bold text-sm block">{portal.name}</span>
                    <span className="text-xs text-slate-500">
                      Expected Float: <strong>₹{(Number(portal.expectedBalancePaisa) / 100).toFixed(2)}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500">
                      {verified ? "Verified ✓" : "Tap to verify"}
                    </span>
                    <input
                      type="checkbox"
                      checked={verified}
                      readOnly
                      className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* STEP 4: LOCK & SUBMIT */}
        <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
          <p className="text-xs text-slate-500 max-w-md">
            Locking the day records physical note counts, journals any shortage/overage variance, and freezes the business date for auditing.
          </p>
          <button
            type="button"
            onClick={handleLock}
            className="px-6 py-3 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-sm shadow-lg transition-all cursor-pointer flex items-center gap-2"
          >
            <span>🔒 Lock Day & Generate Report</span>
          </button>
        </div>
      </div>
    </div>
  );
};
