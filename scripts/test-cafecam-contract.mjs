import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const files=["cafecam/native/CafeCAM.sln","cafecam/native/CafeCamMediaSource/CafeCamMediaSource.vcxproj","cafecam/native/CafeCamManager/CafeCamManager.vcxproj","cafecam/native/include/CafeCamShared.h","cafecam/scripts/Install-CafeCAM.ps1","cafecam/scripts/Uninstall-CafeCAM.ps1","app/(dashboard)/cafecam/page.tsx","electron/cafecam.js",".github/workflows/cafecam-windows.yml"];
for(const f of files)if(!fs.existsSync(path.join(root,f)))throw new Error("Missing: "+f);
const main=fs.readFileSync(path.join(root,"electron/main.js"),"utf8"),pre=fs.readFileSync(path.join(root,"electron/preload.js"),"utf8");
for(const m of ["cafecam-status","cafecam-install-synthetic","cafecam-install-wrapper","cafecam-remove"])if(!main.includes(m))throw new Error("IPC missing: "+m);
for(const m of ["getCafeCamStatus","installCafeCamSynthetic","installCafeCamWrapper","removeCafeCam"])if(!pre.includes(m))throw new Error("Preload missing: "+m);
console.log("CafeCAM contract checks passed.");
