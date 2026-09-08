import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "scripts/repair-reconciliation-root-build.mjs");
let source = fs.readFileSync(target, "utf8");

const bad = "        canonicalSource: \\`payment_instruments.current_balance + cash_entries (\\${asOf})\\`,";
const good = "        canonicalSource: \"payment_instruments.current_balance + cash_entries (\" + asOf + \")\",";

if (source.includes(bad)) {
  source = source.replace(bad, good);
  fs.writeFileSync(target, source);
  console.log("repair-build-script-syntax: repaired reconciliation build-script template syntax");
} else {
  console.log("repair-build-script-syntax: reconciliation build script already clean");
}
