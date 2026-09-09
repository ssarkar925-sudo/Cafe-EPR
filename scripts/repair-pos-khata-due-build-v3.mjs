import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "scripts/repair-pos-khata-due-build-v2.mjs");
let source = fs.readFileSync(file, "utf8");

const oldText = '  credit: ["credit_card"],\\n};';
const newText = '  credit_card: ["credit_card"],\\n};';

if (source.includes(oldText)) {
  source = source.replace(oldText, newText);
  fs.writeFileSync(file, source, "utf8");
  console.log("repair-pos-khata-due-build-v3: normalized credit payment key");
} else {
  console.log("repair-pos-khata-due-build-v3: credit payment key already normalized");
}
