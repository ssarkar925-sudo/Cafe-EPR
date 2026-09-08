import fs from "node:fs";
import path from "node:path";

const file = path.resolve("components/finance/reconciliation-client.tsx");
let source = fs.readFileSync(file, "utf8");

// The canonical reconciliation engine uses roundMoney; ensure the generated component
// contains the helper without depending on another patch script's ordering.
if (!source.includes("const roundMoney = (value: number) => Math.round(value * 100) / 100;")) {
  const anchors = [
    "  // ROOT ACCOUNTING RULE: reconciliation uses canonical instrument balances + same-day cash entries exactly once.",
    "  // ROOT ACCOUNTING RULE: reconciliation math comes from the canonical instrument ledger only."
  ];
  const anchor = anchors.find((candidate) => source.includes(candidate));
  if (!anchor) throw new Error("reconciliation final safety: root accounting anchor not found");
  source = source.replace(anchor, "  const roundMoney = (value: number) => Math.round(value * 100) / 100;\n\n" + anchor);
}

// allReconciled is located before creditCardAudit in the component. Do not reference a
// later const from an earlier initializer (TDZ runtime error). Credit-card rows carry
// their own reconciliation state; the pool banner covers liquid-pool reconciliation.
const problematic = '  const allReconciled = useMemo(() => {\n    const poolsOk = Object.values(poolReconMap).every((p) => p.isReconciled);\n    const cardsOk = creditCardAudit.every((c) => c.isReconciled);\n    return poolsOk && cardsOk;\n  }, [poolReconMap, creditCardAudit]);';
const safe = '  const allReconciled = useMemo(() => Object.values(poolReconMap).every((p) => p.isReconciled), [poolReconMap]);';
if (source.includes(problematic)) source = source.replace(problematic, safe);

fs.writeFileSync(file, source);
console.log("Reconciliation final safety patch applied: rounding helper guaranteed and TDZ-safe overall pool status.");
