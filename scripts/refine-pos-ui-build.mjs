import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const posFile = path.join(ROOT, "components", "pos", "pos-shell.tsx");
const shellFile = path.join(ROOT, "components", "dashboard-shell.tsx");

let pos = fs.readFileSync(posFile, "utf8");
let shell = fs.readFileSync(shellFile, "utf8");
let changed = false;

const fixedRoot = '<div className={`${styles.root} fixed inset-0 z-[100] flex h-[100dvh] min-h-0 w-screen flex-col overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-white`}>'.replace('`};', '');
const containedRoot = '<div className={`${styles.root} absolute inset-0 z-[100] flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-white`}>'.replace('`};', '');

if (pos.includes(fixedRoot)) {
  pos = pos.replace(fixedRoot, containedRoot);
  changed = true;
} else if (pos.includes(containedRoot)) {
  // already contained
} else {
  const generic = '<div className={`${styles.root} fixed inset-0 z-[100]';
  if (pos.includes(generic)) {
    pos = pos.replace('fixed inset-0 z-[100]', 'absolute inset-0 z-[100]').replace('w-screen', 'w-full');
    changed = true;
  } else if (!pos.includes('absolute inset-0 z-[100]')) {
    console.error("POS containment: root anchor not found; refusing unsafe patch");
    process.exit(1);
  }
}

const legacyPosContent = '<div className={`erp-page-content ${isPos ? "h-[100dvh] min-h-0 p-0 overflow-hidden" : "min-h-[calc(100vh-4rem)] p-4 sm:p-5 lg:px-6 lg:pt-0 pb-24 lg:pb-6"}`>';
const containedPosContent = '<div className={`erp-page-content ${isPos ? "relative h-[100dvh] min-h-0 p-0 overflow-hidden" : "min-h-[calc(100vh-4rem)] p-4 sm:p-5 lg:px-6 lg:pt-0 pb-24 lg:pb-6"}`>';

if (shell.includes(legacyPosContent)) {
  shell = shell.replace(legacyPosContent, containedPosContent);
  changed = true;
} else if (!shell.includes(containedPosContent)) {
  console.error("POS containment: dashboard POS content anchor not found; refusing unsafe patch");
  process.exit(1);
}

if (changed) {
  fs.writeFileSync(posFile, pos, "utf8");
  fs.writeFileSync(shellFile, shell, "utf8");
  console.log("POS containment: applied");
} else {
  console.log("POS containment: already applied");
}
