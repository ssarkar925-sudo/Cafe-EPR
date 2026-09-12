import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const posFile = path.join(ROOT, "components", "pos", "pos-shell.tsx");
const shellFile = path.join(ROOT, "components", "dashboard-shell.tsx");

let pos = fs.readFileSync(posFile, "utf8");
let shell = fs.readFileSync(shellFile, "utf8");
let changed = false;

const fixedRoot = '<div className="fixed inset-0 z-[100] flex h-[100dvh] min-h-0 w-screen flex-col overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-white">';
const containedRoot = '<div className="absolute inset-0 z-[100] flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-white">';

if (pos.includes(fixedRoot)) {
  pos = pos.replace(fixedRoot, containedRoot);
  changed = true;
} else if (!pos.includes(containedRoot)) {
  const genericRoot = /<div className="fixed inset-0 z-\[100\]([^>]*)>/;
  if (genericRoot.test(pos)) {
    pos = pos.replace(genericRoot, (match, rest) => {
      const normalized = String(rest).replace(/\bw-screen\b/g, "w-full");
      return `<div className="absolute inset-0 z-[100]${normalized}>`;
    });
    changed = true;
  } else if (!pos.includes('absolute inset-0 z-[100]')) {
    console.error("POS containment: root anchor not found; refusing unsafe patch");
    process.exit(1);
  }
}

const legacyPosContent = '<div className={`erp-page-content ${isPos ? "h-[100dvh] min-h-0 p-0 overflow-hidden" : "min-h-[calc(100vh-4rem)] p-4 sm:p-5 lg:px-6 lg:pt-0 pb-24 lg:pb-6"}`}>';
const containedPosContent = legacyPosContent.replace(
  'h-[100dvh] min-h-0 p-0 overflow-hidden',
  'relative h-[100dvh] min-h-0 p-0 overflow-hidden',
);

if (shell.includes(legacyPosContent)) {
  shell = shell.replace(legacyPosContent, containedPosContent);
  changed = true;
} else if (!shell.includes(containedPosContent)) {
  console.error("POS containment: dashboard POS content anchor not found; refusing unsafe patch");
  process.exit(1);
}

const legacySidebarOverride = /\s*\{isPos && \(\s*<style dangerouslySetInnerHTML=\{\{ __html: `\s*@media \(min-width: 1024px\) \{\s*\.erp-workspace\.is-pos \.erp-page-content > \* \{\s*left: var\(--erp-sidebar-offset\) !important;\s*right: 0 !important;\s*\}\s*\}\s*` \}\} \/>\s*\)\}/m;
if (legacySidebarOverride.test(shell)) {
  shell = shell.replace(legacySidebarOverride, "");
  changed = true;
}

const legacyHeader = '      <header className="flex h-14 shrink-0 items-center border-b border-slate-200 bg-white px-4 shadow-sm dark:border-white/10 dark:bg-slate-900">';
const modernHeader = '      <header className="flex h-12 shrink-0 items-center border-b border-slate-200/80 bg-white/95 px-4 shadow-[0_1px_8px_rgba(15,23,42,0.04)] backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/95">';
if (pos.includes(legacyHeader)) {
  pos = pos.replace(legacyHeader, modernHeader);
  changed = true;
}

const headerMeta = /\n          <span className="hidden h-5 w-px bg-slate-200 sm:block dark:bg-white\/10" \/>\n          <div className="hidden items-center gap-2 text-\[10px\] font-bold text-slate-500 sm:flex dark:text-slate-400">\n            <span>Register 01<\/span>\n            <span>Operator: \{operatorName \|\| "Operator"\}<\/span>\n          <\/div>/m;
if (headerMeta.test(pos)) {
  pos = pos.replace(headerMeta, "");
  changed = true;
}

const newBillButton = /\n          <button\n            type="button"\n            onClick=\{resetBill\}\n            className="h-8 rounded-lg bg-blue-600 px-3\.5 text-\[10px\] font-black text-white shadow-sm hover:bg-blue-700"\n          >\n            \+ New Bill <span className="ml-1 opacity-70">F2<\/span>\n          <\/button>/m;
if (newBillButton.test(pos)) {
  pos = pos.replace(newBillButton, "");
  changed = true;
}

const headerLeft = '        <div className="flex min-w-0 items-center gap-4">';
const modernHeaderLeft = '        <div className="flex min-w-0 items-center gap-3">';
if (pos.includes(headerLeft)) {
  pos = pos.replace(headerLeft, modernHeaderLeft);
  changed = true;
}

const logo = '          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">';
const modernLogo = '          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/20">';
if (pos.includes(logo)) {
  pos = pos.replace(logo, modernLogo);
  changed = true;
}

const titleWrap = '            <div className="flex items-center gap-2">';
const modernTitleWrap = '            <div className="flex items-center gap-1.5">';
if (pos.includes(titleWrap)) {
  pos = pos.replace(titleWrap, modernTitleWrap);
  changed = true;
}

if (changed) {
  fs.writeFileSync(posFile, pos, "utf8");
  fs.writeFileSync(shellFile, shell, "utf8");
  console.log("POS containment/header refinement: applied");
} else {
  console.log("POS containment/header refinement: already applied");
}