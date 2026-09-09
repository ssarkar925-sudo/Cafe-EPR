import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "scripts/repair-pos-khata-due-build-v2.mjs");
let source = fs.readFileSync(file, "utf8");

// Keep the legacy v2 repair idempotent against the actual payment-key naming
// used by item-browser.tsx. The previous v3 patch looked for a literal \\n
// sequence instead of the newline embedded in the JS string and therefore
// never reached the failing guard.
const oldBlock = `    const oldText = '  credit: ["credit_card"],\\n};';
    const newText = '  credit: ["credit_card"],\\n  khata: [],\\n};';
    if (!source.includes(oldText)) throw new Error(\`[khata-due] METHOD_ACCOUNT_TYPES end not found in \${rel}\`);`;

const newBlock = `    const oldText = '  credit: ["credit_card"],\\n};';
    const newText = '  credit: ["credit_card"],\\n  khata: [],\\n};';
    if (!source.includes(oldText)) {
      const alreadyNormalized = source.includes('  credit_card: ["credit_card"],\\n};');
      if (!alreadyNormalized) throw new Error(\`[khata-due] METHOD_ACCOUNT_TYPES end not found in \${rel}\`);
    } else {
      source = source.replace(oldText, newText);
    }`;

if (source.includes(oldBlock)) {
  source = source.replace(oldBlock, newBlock);
  fs.writeFileSync(file, source, "utf8");
  console.log("repair-pos-khata-due-build-v3: made v2 METHOD_ACCOUNT_TYPES guard compatible");
} else {
  console.log("repair-pos-khata-due-build-v3: v2 guard already normalized");
}
