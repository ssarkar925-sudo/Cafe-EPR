import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "components/finance/settlement-form-modal.tsx");
let source = fs.readFileSync(target, "utf8");
let changed = false;

function replaceOnce(from, to, label) {
  if (source.includes(to)) return;
  if (!source.includes(from)) {
    throw new Error(`repair-bank-to-aeps-settlement-ui-build: anchor not found for ${label}`);
  }
  source = source.replace(from, to);
  changed = true;
}

replaceOnce(
  '  { value: "aeps_to_bank", label: "AEPS Portal → Bank Account", from: "aeps", to: "bank", icon: "aeps", grad: "from-blue-500 to-indigo-600", desc: "Settle AEPS portal balance (CSC, EzeePay, Spice Money, PayNearby) into bank account." },\n',
  '  { value: "aeps_to_bank", label: "AEPS Portal → Bank Account", from: "aeps", to: "bank", icon: "aeps", grad: "from-blue-500 to-indigo-600", desc: "Settle AEPS portal balance (CSC, EzeePay, Spice Money, PayNearby) into bank account." },\n  { value: "bank_to_aeps", label: "Bank Account → AEPS Portal", from: "bank", to: "aeps", icon: "aeps", grad: "from-indigo-500 to-blue-600", desc: "Load AEPS float from a selected bank account into an AEPS portal/account." },\n',
  "settlement type"
);

replaceOnce(
  '  const isSourceBank = type === "bank_to_dmt" || type === "bank_withdrawal" || type === "bank_to_wallet";\n',
  '  const isSourceBank = type === "bank_to_dmt" || type === "bank_withdrawal" || type === "bank_to_wallet" || type === "bank_to_aeps";\n',
  "source bank selector"
);

replaceOnce(
  '  const isDestDmtPortal = type === "bank_to_dmt" || type === "wallet_to_dmt";\n',
  '  const isDestDmtPortal = type === "bank_to_dmt" || type === "wallet_to_dmt";\n  const isDestAeps = type === "bank_to_aeps";\n',
  "destination AEPS selector flag"
);

replaceOnce(
  '    } else if (isDestWallet) {\n      if (!destId) return setError("Please select the Destination Digital Wallet.");\n      const w = wallets.find((x) => x.id === destId);\n      destLabel = w ? `Wallet: ${w.name}` : "Digital Wallet";\n    } else if (isDestDmtPortal) {\n',
  '    } else if (isDestWallet) {\n      if (!destId) return setError("Please select the Destination Digital Wallet.");\n      const w = wallets.find((x) => x.id === destId);\n      destLabel = w ? `Wallet: ${w.name}` : "Digital Wallet";\n    } else if (isDestAeps) {\n      if (!destId) return setError("Please select the Destination AEPS Portal.");\n      const p = loadedPortals.find((x) => x.id === destId || x.payment_instrument_id === destId);\n      destLabel = p ? `AEPS: ${p.name}` : "AEPS Portal";\n      destInstrumentId = p?.payment_instrument_id || loadedAccounts.find(\n        (i) => i.id === destId || (\n          (i.type === "aeps_portal" || i.type === "aeps") &&\n          ((i.name || "").toLowerCase().includes((p?.name || "").toLowerCase()) ||\n            (p?.name || "").toLowerCase().includes((i.name || "").toLowerCase()))\n        )\n      )?.id || destId;\n    } else if (isDestDmtPortal) {\n',
  "destination AEPS resolution"
);

replaceOnce(
  '            {isDestWallet && (\n              <div>\n',
  '            {isDestAeps && (\n              <div>\n                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">\n                  Destination AEPS Portal *\n                </label>\n                <SearchableSelect\n                  value={destId}\n                  onChange={(v) => setDestId(v)}\n                  options={[\n                    { value: "", label: "Select AEPS Portal..." },\n                    ...aepsPortals.map((p) => ({ value: p.id, label: `🏢 ${p.name}` })),\n                  ]}\n                  placeholder="Choose Destination AEPS Portal..."\n                  showClear={false}\n                />\n              </div>\n            )}\n\n            {isDestWallet && (\n              <div>\n',
  "destination AEPS UI"
);

if (changed) {
  fs.writeFileSync(target, source);
  console.log("repair-bank-to-aeps-settlement-ui-build: Bank → AEPS UI repaired");
} else {
  console.log("repair-bank-to-aeps-settlement-ui-build: Bank → AEPS UI already present");
}
