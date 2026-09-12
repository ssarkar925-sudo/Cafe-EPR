import fs from "node:fs";
import path from "node:path";

const legacyPath = path.resolve("components/pos/pos-client.tsx");
const canonicalPath = path.resolve("components/pos/pos-shell.tsx");

if (fs.existsSync(legacyPath)) {
  console.log("Financial test POS path: legacy pos-client.tsx exists; no repair needed.");
  process.exit(0);
}

if (!fs.existsSync(canonicalPath)) {
  console.error("Financial test POS path: canonical pos-shell.tsx is missing; refusing unsafe repair.");
  process.exit(1);
}

fs.symlinkSync("pos-shell.tsx", legacyPath);
console.log("Financial test POS path: mapped legacy pos-client.tsx checks to canonical pos-shell.tsx.");
