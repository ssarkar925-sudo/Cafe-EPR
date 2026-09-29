import { register } from "node:module";

/** Test-only entrypoint: registers the TS resolve hook for fixture tests. */
register("./ts-resolve-hook.mjs", import.meta.url);
