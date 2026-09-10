// Cloudflare/OpenNext deployment dependency verification.
// This file intentionally contains no application logic; it ensures the
// Cloudflare adapter is explicitly represented in the repository deployment path.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
try {
  require.resolve("@opennextjs/cloudflare/package.json");
  console.log("[cloudflare] @opennextjs/cloudflare is installed.");
} catch {
  console.error("[cloudflare] @opennextjs/cloudflare is missing.");
  process.exit(1);
}
