import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const file = path.join(ROOT, "components", "pos", "pos-shell.tsx");
const source = fs.readFileSync(file, "utf8");

const importAnchor = 'import { createClient } from "@/lib/supabase/client";\n';
const importLine = 'import styles from "./pos-refinements.module.css";\n';
const legacyRoot = '<div className="fixed inset-0 z-[100] flex h-[100dvh] min-h-0 w-screen flex-col overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-white">';
const styledRoot = '<div className={`${styles.root} fixed inset-0 z-[100] flex h-[100dvh] min-h-0 w-screen flex-col overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-white`}>";

let next = source;
let changed = false;

if (!next.includes(importLine)) {
  if (!next.includes(importAnchor)) {
    console.error("POS refinement: import anchor not found; refusing unsafe patch");
    process.exit(1);
  }
  next = next.replace(importAnchor, `${importAnchor}${importLine}`);
  changed = true;
}

if (!next.includes(`${styles.root}`)) {
  if (!next.includes(legacyRoot)) {
    console.error("POS refinement: root anchor not found; refusing unsafe patch");
    process.exit(1);
  }
  next = next.replace(legacyRoot, legacyRoot.replace('<div className="', '<div className={`${styles.root} ').replace('">', '`}>'));
  changed = true;
}

if (changed) {
  fs.writeFileSync(file, next, "utf8");
  console.log("POS refinement: applied");
} else {
  console.log("POS refinement: already applied");
}
