// Resolve-hook for plain-Node tests so TypeScript sources using the `@/`
// tsconfig path alias can be imported directly (Node 24 strips types natively).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function withExtension(absPath) {
  if (path.extname(absPath)) return absPath;
  for (const candidate of [`${absPath}.ts`, `${absPath}.tsx`, path.join(absPath, "index.ts")]) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return `${absPath}.ts`;
}

export function resolve(specifier, context, nextResolve) {
  if (specifier === "@" || specifier.startsWith("@/")) {
    const rel = specifier === "@" ? "" : specifier.slice(2);
    return nextResolve(pathToFileURL(withExtension(path.join(repoRoot, rel))).href, context);
  }
  return nextResolve(specifier, context);
}
