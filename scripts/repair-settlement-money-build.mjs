import fs from "node:fs";

function patch(file, transform, label) {
  const before = fs.readFileSync(file, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`${label}: no change made; source anchor may have moved`);
  fs.writeFileSync(file, after);
}

// Keep all currency rendering finite and consistently formatted.
patch("lib/format.ts", (text) => {
  const re = /export function inr\(n: number \| string\) \{[\s\S]*?\n\}/;
  if (!re.test(text)) throw new Error("inr() function not found");
  return text.replace(re, `export function inr(n: number | string) {
  const raw = typeof n === "string" ? n.replace(/,/g, "").trim() : n;
  const value = Number(raw);
  if (!Number.isFinite(value)) return "₹0.00";

  return (
    "₹" +
    value.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}`);
}, "format currency");

// Quick settlement presets must actually populate the amount field. The modal remains mounted
// while closed, so state initialized only once can otherwise retain a previous/blank amount.
patch("components/finance/settlement-form-modal.tsx", (text) => {
  const anchor = `  // Reset source & dest when type changes\n  useEffect(() => {\n    setSourceId("");\n    setDestId("");\n    setAvailableBalance(null);\n    setError("");\n  }, [type]);\n`;
  if (!text.includes(anchor)) throw new Error("settlement modal type reset anchor not found");
  if (text.includes("Sync parent-provided presets with the persistent modal instance")) return text;
  const effect = `${anchor}\n  // Sync parent-provided presets with the persistent modal instance.\n  useEffect(() => {\n    if (!open) return;\n    setType(initialType ?? "aeps_to_bank");\n    setAmount(\n      initialAmount !== undefined && initialAmount !== null && initialAmount !== ""\n        ? String(initialAmount)\n        : ""\n    );\n  }, [open, initialType, initialAmount]);\n`;
  return text.replace(anchor, effect);
}, "settlement preset sync");

// Account-level available balances must include instrument-linked settlement legs. The old logic
// only read cash_entries, while the settlement RPC records the authoritative movement in settlements.
patch("components/finance/settlement-form-modal.tsx", (text) => {
  const old = `          const { data: ces } = await supabase\n            .from("cash_entries")\n            .select("direction, amount")\n            .eq("instrument_id", sourceId)\n            .gte("entry_date", seedDate);\n\n          const flow = (ces ?? []).reduce((acc, c) => acc + (c.direction === "in" ? Number(c.amount) : -Number(c.amount)), 0);\n          const accountBal = openingBal + flow;\n          setAvailableBalance(Math.max(0, Math.round(accountBal * 100) / 100));`;
  const newer = `          const [{ data: ces }, { data: setts }] = await Promise.all([\n            supabase\n              .from("cash_entries")\n              .select("direction, amount")\n              .eq("instrument_id", sourceId)\n              .gte("entry_date", seedDate),\n            supabase\n              .from("settlements")\n              .select("amount, source_instrument_id, dest_instrument_id")\n              .gte("settlement_date", seedDate)\n              .eq("status", "success"),\n          ]);\n\n          const cashFlow = (ces ?? []).reduce(\n            (acc, c) => acc + (c.direction === "in" ? Number(c.amount || 0) : -Number(c.amount || 0)),\n            0\n          );\n          const settlementFlow = (setts ?? []).reduce((acc, st: any) => {\n            const inflow = st.dest_instrument_id === sourceId ? Number(st.amount || 0) : 0;\n            const outflow = st.source_instrument_id === sourceId ? Number(st.amount || 0) : 0;\n            return acc + inflow - outflow;\n          }, 0);\n          const accountBal = openingBal + cashFlow + settlementFlow;\n          setAvailableBalance(Math.max(0, Math.round(accountBal * 100) / 100));`;
  if (!text.includes(old)) return text;
  return text.replace(old, newer);
}, "instrument settlement balance");

// The create_settlement RPC is already the canonical atomic ledger writer. Remove the browser-side
// cash_entries duplication because it can create extra bank legs and make dashboard balances disagree
// with the settlement journal.
patch("components/finance/settlements-client.tsx", (text) => {
  const re = /\n    const sType = payload\.p_settlement_type;\n    const sId = \(data as any\)\?\.id;\n    if \(sId\) \{[\s\S]*?\n    \}\n\n    logAudit\(\{/;
  if (!re.test(text)) throw new Error("browser-side settlement cash leg block not found");
  return text.replace(re, "\n    logAudit({");
}, "remove settlement cash duplication");

// Never carry a prior preset into a fresh settlement form.
patch("components/finance/settlements-client.tsx", (text) => {
  const old = `    setShowForm(false);\n    showToast("success", \`Settlement \${(data as any)?.settlement_number} recorded\`);`;
  const newer = `    setShowForm(false);\n    setFormPreset(null);\n    showToast("success", \`Settlement \${(data as any)?.settlement_number} recorded\`);`;
  if (!text.includes(old)) throw new Error("settlement save close anchor not found");
  return text.replace(old, newer);
}, "clear settlement preset after save");

// New Settlement should always start clean; quick presets provide their own type/amount.
patch("components/finance/settlements-client.tsx", (text) => {
  const old = `              onClick={() => setShowForm(true)}`;
  const newer = `              onClick={() => {\n                setFormPreset(null);\n                setShowForm(true);\n              }}`;
  if (!text.includes(old)) throw new Error("new settlement button anchor not found");
  return text.replace(old, newer, 1);
}, "reset new settlement form");
