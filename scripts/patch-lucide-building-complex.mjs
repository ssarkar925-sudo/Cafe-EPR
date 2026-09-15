import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const packageRoot = resolve("node_modules/lucide-react/dist/esm/icons");
const source = resolve(packageRoot, "building-2.mjs");
const target = resolve(packageRoot, "building-complex.mjs");

// lucide-react 1.41.0 can publish the renamed BuildingComplex barrel export
// without the corresponding ESM file. Keep the dependency pinned while making
// installs deterministic until the upstream package contains the file.
if (!existsSync(source)) {
  console.warn("[lucide-compat] building-2.mjs is not present; no compatibility patch applied.");
} else if (!existsSync(target)) {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  console.log("[lucide-compat] restored missing building-complex.mjs from building-2.mjs");
}

// Safety repair for the POS customer panel. A prior automated source rewrite
// left one extra closing div at the end of the customer reference section,
// which makes the TSX parser fail before Next.js can build the application.
// Keep this narrowly scoped and idempotent so clean installs remain safe.
const posShell = resolve("components/pos/pos-shell.tsx");
if (existsSync(posShell)) {
  const lines = readFileSync(posShell, "utf8").split(/\r?\n/);
  const matches = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.includes('data-pos-customer-action="reference"'));

  if (matches.length === 1) {
    const { line, index } = matches[0];
    const expected = "</div></div></div>";
    if (line.trimEnd().endsWith(expected)) {
      lines[index] = line.trimEnd().slice(0, -"</div>".length);
      writeFileSync(posShell, lines.join("\n"), "utf8");
      console.log("[pos-compat] removed extra customer-section closing div");
    }
  }
}
