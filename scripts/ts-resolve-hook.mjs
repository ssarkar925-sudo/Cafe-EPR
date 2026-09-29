import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

/**
 * Test-only ESM resolve hook.
 *
 * Production code imports sibling modules extensionless (`../../gst`),
 * which Next.js/Turbopack resolve natively. Plain Node requires an explicit
 * extension, so when the importer is a TypeScript source file we probe for
 * a matching `.ts` file and redirect to it (Node ≥22 strips types natively).
 *
 * Used via: node --import ./scripts/ts-test-hooks.mjs <test-script>
 * Never bundled into the application; Cloudflare/Workers unaffected.
 */
export async function resolve(specifier, context, next) {
  try {
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      typeof context.parentURL === "string" &&
      context.parentURL.endsWith(".ts")
    ) {
      const parentPath = fileURLToPath(context.parentURL);
      const base = path.resolve(path.dirname(parentPath), specifier);
      for (const candidate of [`${base}.ts`, path.join(base, "index.ts")]) {
        if (candidate.endsWith(".ts") && existsSync(candidate)) {
          return { url: pathToFileURL(candidate).href, shortCircuit: true };
        }
      }
    }
  } catch {
    // Fall through to default resolution on any hook failure.
  }
  return next(specifier, context);
}
