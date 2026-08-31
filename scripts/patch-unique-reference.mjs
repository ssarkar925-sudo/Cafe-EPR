import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "components/business/utility-bill-workspace.tsx");
let source = fs.readFileSync(file, "utf8");

const oldLine = '        reference: reference.trim() || consumerId.trim(),';
const newLine = '        reference: `${reference.trim() || consumerId.trim()}-${nextNum}`,'';

if (source.includes(oldLine)) {
  source = source.replace(oldLine, newLine, 1);
  fs.writeFileSync(file, source, "utf8");
  console.log("Unique bill-payment reference patch applied.");
} else if (source.includes('reference: `${reference.trim() || consumerId.trim()}-${nextNum}`,') ) {
  console.log("Unique bill-payment reference is already patched.");
} else {
  throw new Error("Bill-payment reference anchor not found.");
}
