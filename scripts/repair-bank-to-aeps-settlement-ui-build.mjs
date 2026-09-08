import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "components/finance/settlement-form-modal.tsx");
let source = fs.readFileSync(target, "utf8");
let changed = false;

function ensureNotPresent(marker, label) {
  if (source.includes(marker)) {
    return false;
  }
  return true;
}

// 1) Add the Bank → AEPS settlement type exactly once.
if (ensureNotPresent('value: "bank_to_aeps"', "settlement type")) {
  const typeAnchor = /(^\s*\{\s*value:\s*"aeps_to_bank"[^\n]*\n)/m;
  const match = source.match(typeAnchor);
  if (!match) throw new Error("repair-bank-to-aeps-settlement-ui-build: AEPS→Bank type anchor not found");
  source = source.replace(typeAnchor, `${match[1]}  { value: "bank_to_aeps", label: "Bank Account → AEPS Portal", from: "bank", to: "aeps", icon: "aeps", grad: "from-indigo-500 to-blue-600", desc: "Load AEPS float from a selected bank account into an AEPS portal/account." },\n`);
  changed = true;
}

// 2) Ensure bank is a valid source for Bank → AEPS, regardless of earlier build-time edits.
if (!source.includes('type === "bank_to_aeps";')) {
  const sourcePattern = /const isSourceBank\s*=\s*([^;\n]+);/m;
  const match = source.match(sourcePattern);
  if (!match) throw new Error("repair-bank-to-aeps-settlement-ui-build: source-bank declaration not found");
  let expr = match[1];
  if (!expr.includes('type === "bank_to_aeps"')) {
    expr = `${expr} || type === "bank_to_aeps"`;
    source = source.replace(sourcePattern, `const isSourceBank = ${expr};`);
    changed = true;
  }
}

// 3) Add the AEPS destination selector flag.
if (!source.includes('const isDestAeps = type === "bank_to_aeps";')) {
  const destPattern = /const isDestDmtPortal\s*=\s*([^;\n]+);/m;
  const match = source.match(destPattern);
  if (!match) throw new Error("repair-bank-to-aeps-settlement-ui-build: destination routing flags not found");
  source = source.replace(destPattern, `${match[0]}\n  const isDestAeps = type === "bank_to_aeps";`);
  changed = true;
}

// 4) Resolve the AEPS destination to its payment instrument in the save path.
if (!source.includes('Please select the Destination AEPS Portal.')) {
  const walletBlock = /else if \(isDestWallet\) \{[\s\S]*?\n\s*\} else if \(isDestDmtPortal\) \{/m;
  const match = source.match(walletBlock);
  if (!match) throw new Error("repair-bank-to-aeps-settlement-ui-build: destination save anchor not found");
  const existing = match[0];
  const injected = existing.replace(
    /\n\s*\} else if \(isDestDmtPortal\) \{\s*$/,
    `\n    } else if (isDestAeps) {\n      if (!destId) return setError("Please select the Destination AEPS Portal.");\n      const p = loadedPortals.find((x) => x.id === destId || x.payment_instrument_id === destId);\n      destLabel = p ? \`AEPS: \${p.name}\` : "AEPS Portal";\n      destInstrumentId = p?.payment_instrument_id || loadedAccounts.find(\n        (i) => i.id === destId || (\n          (i.type === "aeps_portal" || i.type === "aeps") &&\n          ((i.name || "").toLowerCase().includes((p?.name || "").toLowerCase()) ||\n            (p?.name || "").toLowerCase().includes((i.name || "").toLowerCase()))\n        )\n      )?.id || destId;\n    } else if (isDestDmtPortal) {`
  );
  source = source.replace(existing, injected);
  changed = true;
}

// 5) Add the destination selector UI immediately before the wallet selector.
if (!source.includes("Destination AEPS Portal *")) {
  const walletUi = /\{isDestWallet\s*&&\s*\(\s*<div>/m;
  if (!walletUi.test(source)) throw new Error("repair-bank-to-aeps-settlement-ui-build: destination wallet UI anchor not found");
  const aepsUi = `{isDestAeps && (\n              <div>\n                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">\n                  Destination AEPS Portal *\n                </label>\n                <SearchableSelect\n                  value={destId}\n                  onChange={(v) => setDestId(v)}\n                  options={[\n                    { value: "", label: "Select AEPS Portal..." },\n                    ...aepsPortals.map((p) => ({ value: p.id, label: \`🏢 \${p.name}\` })),\n                  ]}\n                  placeholder="Choose Destination AEPS Portal..."\n                  showClear={false}\n                />\n              </div>\n            )}\n\n            `;
  source = source.replace(walletUi, aepsUi + source.match(walletUi)[0]);
  changed = true;
}

if (changed) {
  fs.writeFileSync(target, source);
  console.log("repair-bank-to-aeps-settlement-ui-build: Bank → AEPS UI repaired idempotently");
} else {
  console.log("repair-bank-to-aeps-settlement-ui-build: Bank → AEPS UI already present");
}
