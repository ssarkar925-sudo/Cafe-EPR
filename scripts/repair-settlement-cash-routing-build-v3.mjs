import fs from "node:fs";

const path = "components/finance/settlement-form-modal.tsx";
let source = fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

if (source.includes("isSourceCash")) {
  console.log("Settlement cash routing repair: already applied");
  process.exit(0);
}

function patch(search, replacement, label) {
  if (source.includes(replacement)) return;
  if (!source.includes(search)) throw new Error(`${label}: anchor not found`);
  source = source.replace(search, replacement);
}

patch(
  '  const wallets = loadedAccounts.filter((i) => i.type === "wallet");\n',
  '  const wallets = loadedAccounts.filter((i) => i.type === "wallet");\n  const cashAccounts = loadedAccounts.filter((i) => i.type === "cash");\n',
  "cash instrument catalog"
);

patch(
  '  const isSourceWallet = type === "wallet_to_dmt" || type === "wallet_to_bank";\n\n  // Determine what dest selector is needed\n',
  '  const isSourceWallet = type === "wallet_to_dmt" || type === "wallet_to_bank";\n  const isSourceCash = type === "add_cash_to_bank" || type === "cash_adjustment";\n\n  // Determine what dest selector is needed\n',
  "cash source type"
);

patch(
  '  const isDestWallet = type === "upi_qr_to_wallet" || type === "bank_to_wallet";\n  const isDestDmtPortal = type === "bank_to_dmt" || type === "wallet_to_dmt";\n\n  // Dynamic Current Available Balance Calculation',
  '  const isDestWallet = type === "upi_qr_to_wallet" || type === "bank_to_wallet";\n  const isDestDmtPortal = type === "bank_to_dmt" || type === "wallet_to_dmt";\n  const isDestCash = type === "bank_withdrawal" || type === "cash_adjustment";\n\n  // Cash routes resolve to the canonical payment_instruments cash row by default.\n  useEffect(() => {\n    if (!open || cashAccounts.length === 0) return;\n    const defaultCashId = cashAccounts[0].id;\n    if (isSourceCash && !sourceId) setSourceId(defaultCashId);\n    if (isDestCash && !destId) setDestId(defaultCashId);\n  }, [open, cashAccounts, isSourceCash, isDestCash, sourceId, destId]);\n\n  // Dynamic Current Available Balance Calculation',
  "cash route defaults"
);

patch(
  '            {/* Destination Selector */}\n',
  `            {isSourceCash && (\n              <div>\n                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">\n                  Source Cash Drawer *\n                </label>\n                <SearchableSelect\n                  value={sourceId}\n                  onChange={(v) => setSourceId(v)}\n                  options={[\n                    { value: "", label: "Select Cash Drawer..." },\n                    ...cashAccounts.map((c) => ({ value: c.id, label: "💵 " + c.name })),\n                  ]}\n                  placeholder="Choose Source Cash Drawer..."\n                  showClear={false}\n                />\n              </div>\n            )}\n\n            {/* Destination Selector */}\n`,
  "cash source selector"
);

patch(
  '          </div>\n\n          {/* Current Available Balance & Quick Fill Helper */}\n',
  `            {isDestCash && (\n              <div>\n                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">\n                  Destination Cash Drawer *\n                </label>\n                <SearchableSelect\n                  value={destId}\n                  onChange={(v) => setDestId(v)}\n                  options={[\n                    { value: "", label: "Select Cash Drawer..." },\n                    ...cashAccounts.map((c) => ({ value: c.id, label: "💵 " + c.name })),\n                  ]}\n                  placeholder="Choose Destination Cash Drawer..."\n                  showClear={false}\n                />\n              </div>\n            )}\n          </div>\n\n          {/* Current Available Balance & Quick Fill Helper */}\n`,
  "cash destination selector"
);

patch(
  '    } else if (isSourceWallet) {\n      if (!sourceId) return setError("Please select the Digital Wallet debited.");\n      const w = wallets.find((x) => x.id === sourceId);\n      sourceLabel = w ? `Wallet: ${w.name}` : "Digital Wallet";\n    }\n\n    // Mandatory Destination Validation & Instrument Resolution\n',
  '    } else if (isSourceWallet) {\n      if (!sourceId) return setError("Please select the Digital Wallet debited.");\n      const w = wallets.find((x) => x.id === sourceId);\n      sourceLabel = w ? `Wallet: ${w.name}` : "Digital Wallet";\n    } else if (isSourceCash) {\n      if (!sourceId) return setError("Please select the Source Cash Drawer.");\n      const c = cashAccounts.find((x) => x.id === sourceId);\n      sourceLabel = c ? "Cash: " + c.name : "Cash Drawer";\n    }\n\n    // Mandatory Destination Validation & Instrument Resolution\n',
  "cash source validation"
);

patch(
  '    } else if (isDestDmtPortal) {\n      if (!destId) return setError("Please select the DMT Portal receiving float.");\n      const p = loadedPortals.find((x) => x.id === destId || x.payment_instrument_id === destId);\n      destLabel = p ? `DMT: ${p.name}` : "DMT Portal";\n      destInstrumentId = p?.payment_instrument_id || loadedAccounts.find(\n        (i) => i.id === destId || (\n          (i.type === "dmt_portal" || i.type === "dmt") && (\n            i.name.toLowerCase().includes((p?.name || "").toLowerCase()) || (p?.name || "").toLowerCase().includes(i.name.toLowerCase())\n          )\n        )\n      )?.id || destId;\n    }\n\n    // Auto-generate routing remarks\n',
  '    } else if (isDestDmtPortal) {\n      if (!destId) return setError("Please select the DMT Portal receiving float.");\n      const p = loadedPortals.find((x) => x.id === destId || x.payment_instrument_id === destId);\n      destLabel = p ? `DMT: ${p.name}` : "DMT Portal";\n      destInstrumentId = p?.payment_instrument_id || loadedAccounts.find(\n        (i) => i.id === destId || (\n          (i.type === "dmt_portal" || i.type === "dmt") && (\n            i.name.toLowerCase().includes((p?.name || "").toLowerCase()) || (p?.name || "").toLowerCase().includes(i.name.toLowerCase())\n          )\n        )\n      )?.id || destId;\n    } else if (isDestCash) {\n      if (!destId) return setError("Please select the Destination Cash Drawer.");\n      const c = cashAccounts.find((x) => x.id === destId);\n      destLabel = c ? "Cash: " + c.name : "Cash Drawer";\n    }\n\n    // Auto-generate routing remarks\n',
  "cash destination validation"
);

patch(
  '    onSave({\n      p_settlement_type: type,\n',
  '    if (isAdjustment) {\n      destInstrumentId = sourceInstrumentId;\n    }\n\n    onSave({\n      p_settlement_type: type,\n',
  "cash adjustment same instrument"
);

fs.writeFileSync(path, source);
console.log("Settlement cash routing repair applied: concrete cash source and destination instruments are resolved and submitted.");
