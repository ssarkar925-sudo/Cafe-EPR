import fs from "node:fs";
import path from "node:path";

// Keep this prebuild guard deliberately simple: it normalizes the generated
// reconciliation repair script before Node executes the next prebuild step.
const target = path.join(process.cwd(), "scripts/repair-reconciliation-root-build.mjs");
let source = fs.readFileSync(target, "utf8");

const lines = source.split("\n");
let changed = false;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("canonicalSource:") && lines[i].includes("payment_instruments.current_balance")) {
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
  console.log("repair-build-script-syntax: normalized reconciliation repair script");
} else {
  console.log("repair-build-script-syntax: reconciliation repair script already normalized");
}
