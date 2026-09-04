import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "app", "(dashboard)", "finance", "accounts", "page.tsx");
if (!fs.existsSync(file)) {
  console.warn("Finance account type patch skipped: file not found");
  process.exit(0);
}

let source = fs.readFileSync(file, "utf8");
const replacements = [
  ['  ["dmt", "DMT Float"],', '  ["dmt_portal", "DMT Float"],'],
  ['  ["aeps", "AEPS Float"],', '  ["aeps_portal", "AEPS Float"],'],
];
let changed = false;
for (const [from, to] of replacements) {
  if (source.includes(from)) {
    source = source.replace(from, to);
    changed = true;
  }
}
if (changed) {
  fs.writeFileSync(file, source);
  console.log("Finance account type patch applied");
} else {
  console.log("Finance account type patch already applied");
}
