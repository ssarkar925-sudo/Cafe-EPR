import { defineConfig, globalIgnores } from "eslint/config";

// Keep the build self-contained: Next.js type-checking is authoritative for this
// established application, while this repository does not require the optional
// eslint-config-next package just to produce a production build.
export default defineConfig([
  globalIgnores([".next/**", "node_modules/**", "scripts/**", "dist/**"]),
]);
