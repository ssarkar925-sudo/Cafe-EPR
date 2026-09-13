import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const file = path.join(ROOT, "components", "pos", "pos-shell.tsx");
const source = fs.readFileSync(file, "utf8");

const legacy = '      const result = (data ?? {}) as Partial<SuccessState>;';
const fixed = '      const result = (data ?? {}) as Partial<SuccessState> & { invoice_number?: string | null };';

if (source.includes(fixed)) {
  console.log("POS checkout result typing: already repaired");
  process.exit(0);
}

if (!source.includes(legacy)) {
  console.error("POS checkout result typing: expected anchor not found; refusing unsafe patch");
  process.exit(1);
}

fs.writeFileSync(file, source.replace(legacy, fixed), "utf8");
console.log("POS checkout result typing: repaired");
