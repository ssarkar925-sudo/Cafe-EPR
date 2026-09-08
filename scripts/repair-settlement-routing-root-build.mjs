import fs from "node:fs";
import path from "node:path";

const file = path.resolve("components/finance/settlement-form-modal.tsx");
let source = fs.readFileSync(file, "utf8");
const anchor = '{ value: "aeps_to_bank", label: "AEPS Portal → Bank Account", from: "aeps", to: "bank", icon: "aeps", grad: "from-blue-500 to-indigo-600", desc: "Settle AEPS portal balance (CSC, EzeePay, Spice Money, PayNearby) into bank account." },';
const addition = anchor + '\n  { value: "bank_to_aeps", label: "Bank Account → AEPS Portal", from: "bank", to: "aeps", icon: "aeps", grad: "from-indigo-500 to-blue-600", desc: "Load AEPS portal float from a bank account." },';
if (!source.includes('value: "bank_to_aeps"')) {
  if (!source.includes(anchor)) throw new Error("settlement-form-modal.tsx: AEPS settlement anchor not found");
  source = source.replace(anchor, addition);
}

source = source.replace(
  '  const isSourceBank = type === "bank_to_dmt" || type === "bank_withdrawal" || type === "bank_to_wallet";',
  '  const isSourceBank = type === "bank_to_dmt" || type === "bank_withdrawal" || type === "bank_to_wallet" || type === "bank_to_aeps";'
);
source = source.replace(
  '  const isDestBank = type === "aeps_to_bank" || type === "upi_qr_to_bank" || type === "wallet_to_bank" || type === "add_cash_to_bank";',
  '  const isDestBank = type === "aeps_to_bank" || type === "upi_qr_to_bank" || type === "wallet_to_bank" || type === "add_cash_to_bank";'
);
const isDestAepsAnchor = '  const isDestDmtPortal = type === "bank_to_dmt" || type === "wallet_to_dmt";';
if (source.includes(isDestAepsAnchor) && !source.includes('const isDestAepsPortal')) {
  source = source.replace(isDestAepsAnchor, isDestAepsAnchor + '\n  const isDestAepsPortal = type === "bank_to_aeps";');
}

fs.writeFileSync(file, source);
console.log("Settlement UI now exposes canonical Bank -> AEPS routing.");
