import fs from "node:fs";

const source = fs.readFileSync("components/sai/sai-background-layer.tsx", "utf8");
let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

console.log("SAI floating popup regression tests");
check(source.includes('className="fixed bottom-20 right-4 z-[80]'), "SAI panel is positioned as a floating popup");
check(source.includes('aria-modal="false"'), "SAI popup is not a full-screen modal");
check(!source.includes("fixed inset-0 z-[80]"), "SAI no longer creates a full-screen modal wrapper");
check(!source.includes("backdrop-blur-[1px]"), "SAI does not blur the underlying ERP page");
check(!source.includes("bg-slate-950/10 backdrop-blur"), "SAI does not dim/blank the underlying ERP page");
check(source.includes('role="dialog"'), "SAI popup retains dialog semantics");
check(source.includes('onClick={() => setOpen(false)}'), "SAI close control remains available");

console.log(`\n${passed} passed / ${failed} failed`);
process.exitCode = failed ? 1 : 0;
