import fs from "node:fs";

const path = "components/finance/settlement-form-modal.tsx";
let source = fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

function replaceOnce(search, replacement, label) {
  if (!source.includes(search)) {
    if (source.includes(label)) return;
    throw new Error(`${label}: anchor not found`);
  }
  source = source.replace(search, replacement);
}

// Cash is a real accounting instrument. Cash-origin and cash-destination settlement types
// must therefore carry a concrete payment_instruments UUID just like bank/wallet/portal routes.
replaceOnce(
  `  const wallets = loadedAccounts.filter((i) => i.type === "wallet");\n`,
  `  const wallets = loadedAccounts.filter((i) => i.type === "wallet");\n  const cashAccounts = loadedAccounts.filter((i) => i.type === "cash");\n`,
  "settlement cash instrument catalog"
);

replaceOnce(
  `  const isSourceWallet = type === "wallet_to_dmt" || type === "wallet_to_bank";\n\n  // Determine what dest selector is needed\n`,
  `  const isSourceWallet = type === "wallet_to_dmt" || type === "wallet_to_bank";\n  const isSourceCash = type === "add_cash_to_bank" || type === "cash_adjustment";\n\n  // Determine what dest selector is needed\n`,
  "settlement cash source type"
);

replaceOnce(
  `  const isDestWallet = type === "upi_qr_to_wallet" || type === "bank_to_wallet";\n  const isDestDmtPortal = type === "bank_to_dmt" || type === "wallet_to_dmt";\n\n  // Dynamic Current Available Balance Calculation for Selected Source`,
  `  const isDestWallet = type === "upi_qr_to_wallet" || type === "bank_to_wallet";\n  const isDestDmtPortal = type === "bank_to_dmt" || type === "wallet_to_dmt";\n  const isDestCash = type === "bank_withdrawal" || type === "cash_adjustment";\n\n  // Cash routes use the system cash instrument by default. The selector remains editable when\n  // more than one active cash instrument exists, but the normal single-drawer case is zero-click.\n  useEffect(() => {\n    if (!open || cashAccounts.length === 0) return;\n    const defaultCashId = cashAccounts[0].id;\n    if (isSourceCash && !sourceId) setSourceId(defaultCashId);\n    if (isDestCash && !destId) setDestId(defaultCashId);\n  }, [open, cashAccounts, isSourceCash, isDestCash, sourceId, destId]);\n\n  // Dynamic Current Available Balance Calculation for Selected Source`,
  "settlement cash route defaults"
);

replaceOnce(
  `            {isSourceWallet && (\n              <div>\n                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">\n                  Source Digital Wallet *\n                </label>\n                <SearchableSelect\n                  value={sourceId}\n                  onChange={(v) => setSourceId(v)}\n                  options={[\n                    { value: "", label: "Select Digital Wallet..." },\n                    ...wallets.map((w) => ({ value: w.id, label: `👛 ${w.name}` })),\n                  ]}\n                  placeholder="Choose Source Wallet..."\n                  showClear={false}\n                />\n              </div>\n            )}\n\n            {/* Destination Selector */}\n`,
  `            {isSourceWallet && (\n              <div>\n                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">\n                  Source Digital Wallet *\n                </label>\n                <SearchableSelect\n                  value={sourceId}\n                  onChange={(v) => setSourceId(v)}\n                  options={[\n                    { value: "", label: "Select Digital Wallet..." },\n                    ...wallets.map((w) => ({ value: w.id, label: `👛 ${w.name}` })),\n                  ]}\n                  placeholder="Choose Source Wallet..."\n                  showClear={false}\n                />\n              </div>\n            )}\n\n            {isSourceCash && (\n              <div>\n                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">\n                  Source Cash Drawer *\n                </label>\n                <SearchableSelect\n                  value={sourceId}\n                  onChange={(v) => setSourceId(v)}\n                  options={[\n                    { value: "", label: "Select Cash Drawer..." },\n                    ...cashAccounts.map((c) => ({ value: c.id, label: `💵 ${c.name}` })),\n                  ]}\n                  placeholder="Choose Source Cash Drawer..."\n                  showClear={false}\n                />\n              </div>\n            )}\n\n            {/* Destination Selector */}\n`,
  "settlement cash source selector"
);

replaceOnce(
  `            {isDestDmtPortal && (\n              <div>\n                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">\n                  Destination DMT Portal *\n                </label>\n                <SearchableSelect\n                  value={destId}\n                  onChange={(v) => setDestId(v)}\n                  options={[\n                    { value: "", label: "Select DMT Portal..." },\n                    ...dmtPortals.map((p) => ({ value: p.id, label: `🏢 ${p.name}` })),\n                  ]}\n                  placeholder="Choose DMT Portal..."\n                  showClear={false}\n                />\n              </div>\n            )}\n          </div>\n`,
  `            {isDestDmtPortal && (\n              <div>\n                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">\n                  Destination DMT Portal *\n                </label>\n                <SearchableSelect\n                  value={destId}\n                  onChange={(v) => setDestId(v)}\n                  options={[\n                    { value: "", label: "Select DMT Portal..." },\n                    ...dmtPortals.map((p) => ({ value: p.id, label: `🏢 ${p.name}` })),\n                  ]}\n                  placeholder="Choose DMT Portal..."\n                  showClear={false}\n                />\n              </div>\n            )}\n\n            {isDestCash && (\n              <div>\n                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">\n                  Destination Cash Drawer *\n                </label>\n                <SearchableSelect\n                  value={destId}\n                  onChange={(v) => setDestId(v)}\n                  options={[\n                    { value: "", label: "Select Cash Drawer..." },\n                    ...cashAccounts.map((c) => ({ value: c.id, label: `💵 ${c.name}` })),\n                  ]}\n                  placeholder="Choose Destination Cash Drawer..."\n                  showClear={false}\n                />\n              </div>\n            )}\n          </div>\n`,
  "settlement cash destination selector"
);

replaceOnce(
  `    } else if (isSourceWallet) {\n      if (!sourceId) return setError("Please select the Digital Wallet debited.");\n      const w = wallets.find((x) => x.id === sourceId);\n      sourceLabel = w ? `Wallet: ${w.name}` : "Digital Wallet";\n    }\n\n    // Mandatory Destination Validation & Instrument Resolution\n`,
  `    } else if (isSourceWallet) {\n      if (!sourceId) return setError("Please select the Digital Wallet debited.");\n      const w = wallets.find((x) => x.id === sourceId);\n      sourceLabel = w ? `Wallet: ${w.name}` : "Digital Wallet";\n    } else if (isSourceCash) {\n      if (!sourceId) return setError("Please select the Source Cash Drawer.");\n      const c = cashAccounts.find((x) => x.id === sourceId);\n      sourceLabel = c ? `Cash: ${c.name}` : "Cash Drawer";\n    }\n\n    // Mandatory Destination Validation & Instrument Resolution\n`,
  "settlement cash source submission"
);

replaceOnce(
  `    } else if (isDestDmtPortal) {\n      if (!destId) return setError("Please select the DMT Portal receiving float.");\n      const p = loadedPortals.find((x) => x.id === destId || x.payment_instrument_id === destId);\n      destLabel = p ? `DMT: ${p.name}` : "DMT Portal";\n      destInstrumentId = p?.payment_instrument_id || loadedAccounts.find(\n        (i) => i.id === destId || (\n          (i.type === "dmt_portal" || i.type === "dmt") && (\n            i.name.toLowerCase().includes((p?.name || "").toLowerCase()) || (p?.name || "").toLowerCase().includes(i.name.toLowerCase())\n          )\n        )\n      )?.id || destId;\n    }\n\n    // Auto-generate routing remarks\n`,
  `    } else if (isDestDmtPortal) {\n      if (!destId) return setError("Please select the DMT Portal receiving float.");\n      const p = loadedPortals.find((x) => x.id === destId || x.payment_instrument_id === destId);\n      destLabel = p ? `DMT: ${p.name}` : "DMT Portal";\n      destInstrumentId = p?.payment_instrument_id || loadedAccounts.find(\n        (i) => i.id === destId || (\n          (i.type === "dmt_portal" || i.type === "dmt") && (\n            i.name.toLowerCase().includes((p?.name || "").toLowerCase()) || (p?.name || "").toLowerCase().includes(i.name.toLowerCase())\n          )\n        )\n      )?.id || destId;\n    } else if (isDestCash) {\n      if (!destId) return setError("Please select the Destination Cash Drawer.");\n      const c = cashAccounts.find((x) => x.id === destId);\n      destLabel = c ? `Cash: ${c.name}` : "Cash Drawer";\n    }\n\n    // Auto-generate routing remarks\n`,
  "settlement cash destination submission"
);

replaceOnce(
  `    onSave({\n      p_settlement_type: type,\n`,
  `    if (isAdjustment) {\n      // Cash adjustment is a same-instrument movement. The direction determines whether the\n      // physical count adds to or removes from the selected cash drawer.\n      destInstrumentId = sourceInstrumentId;\n    }\n\n    onSave({\n      p_settlement_type: type,\n`,
  "settlement cash adjustment same instrument"
);

replaceOnce(
  `    if (!text.includes("Settlement cash route defaults")) return text;\n`,
  `    if (!text.includes("Settlement cash route defaults")) return text;\n`,
  "settlement cash route defaults marker"
);

fs.writeFileSync(path, source);
console.log("Settlement cash routing repair applied: concrete cash source/destination instruments are selected and submitted for all cash settlement types.");
