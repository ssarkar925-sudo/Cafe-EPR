import fs from "node:fs";

// This repair used brittle source-text matching and could fail production builds when
// the Bill Payment component layout changed. The reconciliation/history UI is now
// maintained in source, so the build hook must be non-destructive and non-blocking.
const path = "components/business/bill-payment-hub.tsx";
if (!fs.existsSync(path)) {
  throw new Error(`Required Bill Payment source file not found: ${path}`);
}

console.log("Bill payment split display repair: source-managed; build hook skipped safely.");
