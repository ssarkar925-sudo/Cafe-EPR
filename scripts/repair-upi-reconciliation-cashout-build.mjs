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
let changed = false;

// Refresh must carry ledger references so the client can trace the same rows
// used by the canonical reconciliation calculation.
const refreshSelect = 'supabase.from("cash_entries").select("id, instrument_id, direction, amount, created_at, description, method, ref_type").not("instrument_id", "is", null)';
const refreshSelectFixed = 'supabase.from("cash_entries").select("id, instrument_id, direction, amount, created_at, description, method, ref_type, ref_id, entry_date").not("instrument_id", "is", null)';
if (source.includes(refreshSelect) && !source.includes(refreshSelectFixed)) {
  source = source.replace(refreshSelect, refreshSelectFixed);
  changed = true;
}

// Older builds used a text marker around the UPI-specific reconstruction block.
// The reconciliation component is now source-managed and already uses the
// canonical payment-instrument ledger directly. In that newer form there is no
// legacy marker to replace, so the repair must be safely idempotent instead of
// failing the entire production build.
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
if (blockPattern.test(source)) {
  source = source.replace(blockPattern, upiCanonicalBlock);
  changed = true;
} else {
  const canonicalLedgerMarker = 'const ledgerNet = credits - debits;';
  const canonicalSourceMarker = 'canonicalSource: "payment_instruments.current_balance + cash_entries ("';
  if (!source.includes(canonicalLedgerMarker) || !source.includes(canonicalSourceMarker)) {
    throw new Error("UPI reconciliation structure not recognized; refusing an unsafe blind rewrite");
  }
  console.log("UPI reconciliation source is already canonical; legacy block repair skipped safely.");
}

// Older builds explicitly added UPI fees/settlement inference on top of the
// instrument ledger. The current source-managed implementation already computes
// the balance as opening + canonical ledger net, so only replace the legacy
// formula when it is actually present.
const oldFormula = `      const calculatedBal =
        cfg.key === "upi_qr"
          ? openingBal + credits - debits + fees + otherMovements + setsIn - setsOut
          : openingBal + poolEntry.movements;`;
const newFormula = `      const calculatedBal =
        cfg.key === "upi_qr"
          ? openingBal + credits - debits
          : openingBal + poolEntry.movements;`;
if (source.includes(oldFormula)) {
  source = source.replace(oldFormula, newFormula);
  changed = true;
} else if (!source.includes(newFormula)) {
  const canonicalCalculatedMarker = `const calculatedBal = roundMoney(openingBal + ledgerNet);`;
  if (!source.includes(canonicalCalculatedMarker)) {
    throw new Error("UPI reconciliation balance formula not recognized; refusing an unsafe blind rewrite");
  }
  console.log("UPI reconciliation balance formula is already canonical; legacy formula repair skipped safely.");
}

if (changed) fs.writeFileSync(path, source);
console.log("UPI reconciliation build repair completed safely.");
