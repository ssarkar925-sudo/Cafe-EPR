import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  {
    rules: {
      // These React Compiler diagnostics are not safe to apply wholesale to this
      // established application yet. Keep the build strict on TypeScript and
      // conventional ESLint rules while allowing existing render-time patterns.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react/no-unescaped-entities": "off",
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  globalIgnores([".next/**", "node_modules/**", "scripts/**", "dist/**"]),
]);
