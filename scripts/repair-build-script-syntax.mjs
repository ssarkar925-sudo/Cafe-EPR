import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "scripts/repair-reconciliation-root-build.mjs");
let source = fs.readFileSync(target, "utf8");

// The reconciliation build-repair script itself contains a generated template literal.
// Normalize that one generated source line to plain string concatenation before Node parses it.
const lines = source.split("\n");
let changed = false;
for (let i = 0; i < lines.length; i++) {
  if (
    lines[i].includes("canonicalSource:") &&
    lines[i].includes("payment_instruments.current_balance")
  ) {
    const fixed = '        canonicalSource: "payment_instruments.current_balance + cash_entries (" + asOf + ")",';
    if (lines[i] !== fixed) {
      lines[i] = fixed;
      changed = true;
    }
    break;
  }
}

if (changed) {
  fs.writeFileSync(target, lines.join("\n"));
  console.log("repair-build-script-syntax: repaired reconciliation build-script template syntax");
} else {
  console.log("repair-build-script-syntax: reconciliation build script already clean");
}
