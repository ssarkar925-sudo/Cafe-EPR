import fs from "node:fs";

const path = "components/finance/settlement-form-modal.tsx";
let source = fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const original = source;
function replaceOnce(needle, replacement, label) {
  if (!source.includes(needle)) throw new Error(`Credit-card repayment patch anchor missing: ${label}`);
  source = source.replace(needle, replacement);
}

replaceOnce(
  '  { value: "bank_to_wallet", label: "Bank Account → Digital Wallet (Wallet Load)", from: "bank", to: "wallet", icon: "wallet", grad: "from-emerald-500 to-teal-600", desc: "Load digital wallet float (Rupepro, CSC Wallet) from bank balance." },\n',
  '  { value: "bank_to_wallet", label: "Bank Account → Digital Wallet (Wallet Load)", from: "bank", to: "wallet", icon: "wallet", grad: "from-emerald-500 to-teal-600", desc: "Load digital wallet float (Rupepro, CSC Wallet) from bank balance." },\n' +
  '  { value: "bank_to_credit_card", label: "Bank Account → Credit Card Repayment", from: "bank", to: "credit_card", icon: "card", grad: "from-indigo-500 to-blue-600", desc: "Repay a credit card from a selected bank account. This reduces card utilization; it is not an expense." },\n' +
  '  { value: "cash_to_credit_card", label: "Cash → Credit Card Repayment", from: "cash", to: "credit_card", icon: "card", grad: "from-slate-600 to-slate-800", desc: "Repay a credit card from the physical cash drawer. This is a liability settlement, not an expense." },\n',
  "route catalog"
);
replaceOnce('  upi_qr: "UPI QR",\n};', '  upi_qr: "UPI QR",\n  credit_card: "Credit Card Liability",\n};', "pool label");
replaceOnce(
  '  const bankAccounts = loadedAccounts.filter((i) => i.type === "bank" || i.type === "debit_card");\n  const wallets = loadedAccounts.filter((i) => i.type === "wallet");\n  const cashAccounts = loadedAccounts.filter((i) => i.type === "cash");',
  '  const bankAccounts = loadedAccounts.filter((i) => i.type === "bank" || i.type === "debit_card");\n  const sourceBankAccounts = loadedAccounts.filter((i) => i.type === "bank");\n  const creditCardAccounts = loadedAccounts.filter((i) => i.type === "credit_card");\n  const wallets = loadedAccounts.filter((i) => i.type === "wallet");\n  const cashAccounts = loadedAccounts.filter((i) => i.type === "cash");',
  "repayment account collections"
);
replaceOnce('  const isSourceBank = type === "bank_to_dmt" || type === "bank_withdrawal" || type === "bank_to_wallet";', '  const isSourceBank = type === "bank_to_dmt" || type === "bank_withdrawal" || type === "bank_to_wallet" || type === "bank_to_credit_card";', "bank repayment source flag");
replaceOnce('  const isSourceCash = type === "add_cash_to_bank" || type === "cash_adjustment";', '  const isSourceCash = type === "add_cash_to_bank" || type === "cash_adjustment" || type === "cash_to_credit_card";', "cash repayment source flag");
replaceOnce(
  '  const isDestDmtPortal = type === "bank_to_dmt" || type === "wallet_to_dmt";\n  const isDestCash = type === "bank_withdrawal" || type === "cash_adjustment";',
  '  const isDestDmtPortal = type === "bank_to_dmt" || type === "wallet_to_dmt";\n  const isDestCreditCard = type === "bank_to_credit_card" || type === "cash_to_credit_card";\n  const isDestCash = type === "bank_withdrawal" || type === "cash_adjustment";',
  "credit card destination flag"
);
replaceOnce('          if (isSourceBank || isSourceWallet) return loadedAccounts.find((i) => i.id === sourceId);', '          if (isSourceBank || isSourceWallet || isSourceCash) return loadedAccounts.find((i) => i.id === sourceId);', "repayment source balance resolver");
replaceOnce(
  '    } else if (isSourceBank) {\n      if (!sourceId) return setError("Please select the Source Bank Account debited.");\n      const b = bankAccounts.find((x) => x.id === sourceId);\n      sourceLabel = b ? `Bank: ${b.name}` : "Bank Account";\n    } else if (isSourceWallet) {',
  '    } else if (isSourceBank) {\n      if (!sourceId) return setError("Please select the Source Bank Account debited.");\n      const b = sourceBankAccounts.find((x) => x.id === sourceId);\n      if (!b) return setError("The selected funding account must be an active bank account.");\n      sourceLabel = `Bank: ${b.name}`;\n    } else if (isSourceCash) {\n      if (!sourceId) return setError("Please select the Cash Drawer funding account.");\n      const c = cashAccounts.find((x) => x.id === sourceId);\n      if (!c) return setError("The selected funding account must be the active Cash Drawer.");\n      sourceLabel = `Cash: ${c.name}`;\n    } else if (isSourceWallet) {',
  "repayment source validation"
);
replaceOnce(
  '    } else if (isDestDmtPortal) {',
  '    } else if (isDestCreditCard) {\n      if (!destId) return setError("Please select the Credit Card being repaid.");\n      const c = creditCardAccounts.find((x) => x.id === destId);\n      if (!c) return setError("Please select an active credit card as the repayment destination.");\n      destLabel = `Credit Card: ${c.name}`;\n      destInstrumentId = c.id;\n    } else if (isDestDmtPortal) {',
  "repayment destination validation"
);
replaceOnce(
  '                    ...bankAccounts.map((b) => ({\n                      value: b.id,\n                      label: `🏦 ${b.name}${b.details?.account_number ? ` (••••${String(b.details.account_number).slice(-4)})` : ""}`,\n                    })),',
  '                    ...sourceBankAccounts.map((b) => ({\n                      value: b.id,\n                      label: `🏦 ${b.name}${b.details?.account_number ? ` (••••${String(b.details.account_number).slice(-4)})` : ""}`,\n                    })),',
  "repayment bank selector options"
);
const creditCardJsx = [
  '            {isDestCreditCard && (', '              <div>',
  '                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">',
  '                  Credit Card to Repay *', '                </label>', '                <SearchableSelect',
  '                  value={destId}', '                  onChange={(v) => setDestId(v)}', '                  options={[',
  '                    { value: "", label: "Select Credit Card..." },', '                    ...creditCardAccounts.map((c) => ({',
  '                      value: c.id,',
  '                      label: "💳 " + c.name + (Number.isFinite(Number(c.balance ?? c.details?.available_credit)) ? " (Avail. ₹" + Number(c.balance ?? c.details?.available_credit).toLocaleString("en-IN", { minimumFractionDigits: 2 }) + ")" : ""),',
  '                    })),', '                  ]}', '                  placeholder="Choose Credit Card to Repay..."', '                  showClear={false}', '                />',
  '                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">',
  '                  Repayment increases available credit and reduces utilization. It does not create an operating expense.',
  '                </p>', '              </div>', '            )}', ''
].join("\n");
replaceOnce('            {isDestBank && (', creditCardJsx + '            {isDestBank && (', "repayment credit card selector");

replaceOnce(
  '    if (sourceLabel && destLabel) {',
  '    if (type === "bank_to_credit_card") routingTag = "[BANK → CREDIT CARD REPAYMENT]";\n    else if (type === "cash_to_credit_card") routingTag = "[CASH → CREDIT CARD REPAYMENT]";\n    else if (sourceLabel && destLabel) {',
  "repayment routing tag"
);

if (source === original) throw new Error("Credit-card repayment patch made no changes");
fs.writeFileSync(path, source);
console.log("Patched settlement UI with safe credit-card repayment routes after cash-routing repair.");
