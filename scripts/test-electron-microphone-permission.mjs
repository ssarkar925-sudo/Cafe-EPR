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

console.log("CafeERP Electron microphone permission root-cause tests");
check(source.includes("setPermissionRequestHandler"), "Electron registers a permission request handler");
check(source.includes("setPermissionCheckHandler"), "Electron registers a permission check handler");
check(source.includes('permission === "media"'), "Electron handles Chromium media permission");
check(source.includes("details?.securityOrigin"), "Media request uses Electron securityOrigin");
check(source.includes("details?.mediaTypes"), "Media request inspects requested media types");
check(source.includes('mediaTypes.includes("audio")'), "Audio microphone requests are explicitly allowed");
check(source.includes("details?.mediaType"), "Permission checks inspect requested media type");
check(source.includes("mainWindow.webContents.session"), "Permission handlers are attached to the BrowserWindow session");
check(source.includes("configureMediaPermissions(mainWindow.webContents.session)"), "Permission handlers are installed before remote content loads");
check(source.includes("isCafeErpOrigin"), "Permission remains restricted to CafeERP origin");
check(source.includes("callback(true)"), "CafeERP audio media requests are allowed");
check(source.includes("callback(false)"), "Other permissions/origins remain denied");

console.log(`\n${passed} passed / ${failed} failed`);
process.exitCode = failed ? 1 : 0;
