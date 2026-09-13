import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const packageRoot = resolve("node_modules/lucide-react/dist/esm/icons");
const source = resolve(packageRoot, "building-2.mjs");
const target = resolve(packageRoot, "building-complex.mjs");

// lucide-react 1.41.0 can publish the renamed BuildingComplex barrel export
// without the corresponding ESM file. Keep the dependency pinned while making
// installs deterministic until the upstream package contains the file.
if (!existsSync(source)) {
  console.warn("[lucide-compat] building-2.mjs is not present; no compatibility patch applied.");
  process.exit(0);
}

if (!existsSync(target)) {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  console.log("[lucide-compat] restored missing building-complex.mjs from building-2.mjs");
}
