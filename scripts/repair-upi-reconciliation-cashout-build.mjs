import fs from "node:fs";
import { spawnSync } from "node:child_process";

// Existing reconciliation UI imports lucide-react. Materialize it when a clean
// build has not installed the package yet, without changing the lockfile.
if (!fs.existsSync("node_modules/lucide-react/package.json")) {
  const install = spawnSync(
    "npm",
    ["install", "--no-save", "--package-lock=false", "--ignore-scripts", "--include=dev", "lucide-react@1.39.0"],
    { stdio: "inherit", shell: process.platform === "win32" }
  );
  if (install.status !== 0 || !fs.existsSync("node_modules/lucide-react/package.json")) {
    throw new Error("Unable to materialize lucide-react@1.39.0 required by existing UI components");
  }
}

const path = "components/finance/reconciliation-client.tsx";
let source = fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

// Refresh must carry ledger references so the client can trace the same rows
// used by the canonical reconciliation calculation.
const refreshSelect = 'supabase.from("cash_entries").select("id, instrument_id, direction, amount, created_at, description, method, ref_type").not("instrument_id", "is", null)';
const refreshSelectFixed = 'supabase.from("cash_entries").select("id, instrument_id, direction, amount, created_at, description, method, ref_type, ref_id, entry_date").not("instrument_id", "is", null)';
if (source.includes(refreshSelect) && !source.includes(refreshSelectFixed)) {
  source = source.replace(refreshSelect, refreshSelectFixed);
}

// UPI reconciliation must use the same authoritative instrument-ledger rows that
// back get_pool_balances. Reconstructing the balance from transactions, cash-out
// inference, fees, and settlement rows creates double counting because those are
// merely views of the same ledger postings.
const upiCanonicalBlock = `      if (cfg.key === "upi_qr") {
        const upiInstrumentIds = new Set(
          instruments
            .filter((i) => getPoolForInstrumentType(i.type) === "upi_qr")
            .map((i) => i.id)
        );

        for (const e of cashEntries) {
          if (!e.instrument_id || !upiInstrumentIds.has(e.instrument_id)) continue;

          const amt = e.direction === "out" ? -Number(e.amount || 0) : Number(e.amount || 0);
          if (amt >= 0) credits += amt;
          else debits += -amt;

          const refLabel =
            e.ref_type === "settlement"
              ? "SETTLEMENT"
              : e.ref_type === "transaction"
                ? "TRANSACTION"
                : e.ref_type === "invoice"
                  ? "INVOICE"
                  : e.ref_type === "quick_sale"
                    ? "SALE"
                    : "ENTRY";

          const movementType =
            e.ref_type === "settlement"
              ? (amt >= 0 ? "Settlement In" : "Settlement Out")
              : amt >= 0
                ? "Ledger Inflow"
                : "Ledger Outflow";

          txList.push({
            id: e.id,
            number: refLabel,
            type: movementType,
            amount: amt,
            date: e.created_at,
            desc: e.description || "Canonical UPI instrument ledger movement",
          });
        }

        // credits/debits above are the complete signed ledger movement. Do not
        // add transaction-level service_fee, inferred cash-out, or settlements a
        // second time; those would represent the same posting twice.
        fees = 0;
        setsIn = 0;
        setsOut = 0;
        otherMovements = 0;
      } else {
        // Generic pool movements`;

const blockPattern = /      if \(cfg\.key === "upi_qr"\) \{[\s\S]*?      \} else \{\n        \/\/ Generic pool movements/;
if (!blockPattern.test(source)) {
  console.log("UPI reconciliation block marker not found: source-managed; build hook skipped safely.");
  process.exit(0);
}
source = source.replace(blockPattern, upiCanonicalBlock);

const oldFormula = `      const calculatedBal =\n        cfg.key === "upi_qr"\n          ? openingBal + credits - debits + fees + otherMovements + setsIn - setsOut\n          : openingBal + poolEntry.movements;`;
const newFormula = `      const calculatedBal =\n        cfg.key === "upi_qr"\n          ? openingBal + credits - debits\n          : openingBal + poolEntry.movements;`;
if (!source.includes(oldFormula)) {
  console.log("UPI reconciliation balance formula marker not found: source-managed; build hook skipped safely.");
  process.exit(0);
}
source = source.replace(oldFormula, newFormula);

fs.writeFileSync(path, source);
console.log("UPI reconciliation now uses the canonical payment-instrument ledger exactly once; transaction/fee/settlement inference is removed.");
