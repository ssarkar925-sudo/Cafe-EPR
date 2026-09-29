import fs from "node:fs";

const source = fs.readFileSync("electron/main.js", "utf8");
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

console.log("CafeERP Electron microphone permission regression tests");
check(source.includes("setPermissionRequestHandler"), "Electron registers a permission request handler");
check(source.includes("setPermissionCheckHandler"), "Electron registers a permission check handler");
check(source.includes('permission === "media"'), "Electron explicitly handles media permission requests");
check(source.includes("isCafeErpOrigin"), "Media permission is origin restricted");
check(source.includes("callback(true)"), "CafeERP media permission is allowed by the native wrapper");
check(source.includes("callback(false)"), "Other origins/permissions remain denied");
check(source.includes("configureMediaPermissions();"), "Media permissions are configured before the window loads");
check(source.includes("APP_URL"), "Permission scope follows the configured CafeERP app origin");

console.log(`\n${passed} passed / ${failed} failed`);
process.exitCode = failed ? 1 : 0;
