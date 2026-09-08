import fs from "node:fs";

const path = "components/finance/settlement-form-modal.tsx";
let source = fs.readFileSync(path, "utf8");

// PaymentInstrument uses `balance` in the client-side type. The repayment
// build patch must not reference an undeclared `current_balance` property.
const before = source;
source = source.replace(/c\.current_balance/g, "c.balance");

if (source !== before) {
  fs.writeFileSync(path, source);
  console.log("Normalized credit-card repayment balance field to PaymentInstrument.balance.");
}
