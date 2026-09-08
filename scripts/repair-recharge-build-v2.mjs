import fs from "node:fs";

const path = "components/business/recharge-workspace.tsx";
let source = fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

// The previous recharge repair script accidentally used .join("\\n"), which wrote
// literal backslash-n sequences into the TypeScript source and caused a production
// compile error. Repair only that generated handler block, preserving all other code.
const start = source.indexOf("  async function handleCompleteRecharge() {");
const end = source.indexOf("\n  // Reversal Execution", start);

if (start >= 0 && end > start) {
  const block = source.slice(start, end);
  if (block.includes("\\n")) {
    source = source.slice(0, start) + block.replace(/\\n/g, "\n") + source.slice(end);
    console.log("Normalized literal escaped newlines in recharge handler.");
  }
}

fs.writeFileSync(path, source);
