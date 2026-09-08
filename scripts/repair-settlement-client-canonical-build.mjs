import fs from "node:fs";
import path from "node:path";

const file = path.resolve("components/finance/settlements-client.tsx");
let source = fs.readFileSync(file, "utf8");

// create_settlement() already posts both source and destination cash_entry legs via
// trg_sync_settlement_instrument_movements. Remove the legacy client-side second write
// path, which can otherwise create duplicate/uninstrumented bank/cash legs.
const startMarker = "    const sType = payload.p_settlement_type;";
const endMarker = "\n\n    logAudit({";
const start = source.indexOf(startMarker);
const end = start >= 0 ? source.indexOf(endMarker, start) : -1;
if (start < 0 || end < 0) throw new Error("settlements-client.tsx: legacy manual settlement cash-entry block not found");
source = source.slice(0, start) + "    const sType = payload.p_settlement_type;\n    const sId = (data as any)?.id;\n    const sNum = (data as any)?.settlement_number;" + source.slice(end);

fs.writeFileSync(file, source);
console.log("Settlement client now relies on canonical settlement cash-entry trigger; duplicate client writes removed.");
