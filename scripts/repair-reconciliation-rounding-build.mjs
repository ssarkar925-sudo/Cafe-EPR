import fs from "node:fs";
import path from "node:path";

const file = path.resolve("components/finance/reconciliation-client.tsx");
let source = fs.readFileSync(file, "utf8");

if (!source.includes("const roundMoney = (value: number) => Math.round(value * 100) / 100;")) {
  const anchors = [
    '  // ROOT ACCOUNTING RULE: reconciliation uses canonical instrument balances + same-day cash entries exactly once.',
    '  // ROOT ACCOUNTING RULE: reconciliation math comes from the canonical instrument ledger only.'
  ];
  const anchor = anchors.find((candidate) => source.includes(candidate));
  if (!anchor) throw new Error("reconciliation rounding repair: root reconciliation block not found");
  source = source.replace(anchor, '  const roundMoney = (value: number) => Math.round(value * 100) / 100;\n' + anchor);
  fs.writeFileSync(file, source);
  console.log("Reconciliation rounding helper added.");
} else {
  console.log("Reconciliation rounding helper: already applied.");
}
