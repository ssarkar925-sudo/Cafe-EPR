import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const posFile = path.join(ROOT, "components", "pos", "pos-shell.tsx");

let pos = fs.readFileSync(posFile, "utf8");
let changed = false;

function replaceOnce(label, from, to) {
  if (pos.includes(to) && !pos.includes(from)) return;
  if (!pos.includes(from)) {
    console.error(`POS visual alignment: anchor not found for ${label}`);
    process.exit(1);
  }
  pos = pos.replace(from, to);
  changed = true;
}

replaceOnce(
  "root",
  '<div className="absolute inset-0 z-[100] flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-white">',
  '<div className="absolute inset-0 z-[100] flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-slate-50 p-3 text-slate-900 dark:bg-slate-950 dark:text-white">',
);

const legacyHeader = `<header className="flex h-14 shrink-0 items-center border-b border-slate-200 bg-white px-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
            <ShoppingCart className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-black">{shopName || "CafeERP"}</span>
              <span className="text-slate-300">/</span>
              <span className="text-sm font-extrabold text-blue-600 dark:text-blue-400">POS</span>
            </div>
          </div>
          <span className="hidden h-5 w-px bg-slate-200 sm:block dark:bg-white/10" />
          <div className="hidden items-center gap-2 text-[10px] font-bold text-slate-500 sm:flex dark:text-slate-400">
            <span>Register 01</span>
            <span>Operator: {operatorName || "Operator"}</span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-700 sm:flex dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Online
          </span>
          <button
            type="button"
            onClick={resetBill}
            className="h-8 rounded-lg bg-blue-600 px-3.5 text-[10px] font-black text-white shadow-sm hover:bg-blue-700"
          >
            + New Bill <span className="ml-1 opacity-70">F2</span>
          </button>
          <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300" aria-label="More POS actions">
            …
          </button>
        </div>
      </header>`;

const modernHeader = `<header className="flex h-16 shrink-0 items-center justify-between rounded-[22px] border border-slate-200/80 bg-white/95 px-4 shadow-md shadow-slate-900/5 backdrop-blur-2xl ring-1 ring-black/5 dark:border-white/10 dark:bg-slate-900/95 dark:shadow-black/20 dark:ring-white/10">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/20">
            <ShoppingCart className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">
              <span>CAFÉ ERP</span>
              <span>/</span>
              <span>1. SALES HUB</span>
              <span>/</span>
              <span className="text-blue-600 dark:text-blue-400">POS BILLING</span>
            </div>
            <h1 className="text-base font-extrabold text-slate-900 dark:text-white">POS Billing</h1>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-700 sm:flex dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Online
          </span>
          <button type="button" onClick={resetBill} className="flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 text-[10px] font-black text-white shadow-sm shadow-blue-500/20 transition hover:bg-blue-700">
            + New Bill <kbd className="rounded bg-blue-700 px-1 py-0.5 text-[9px] font-black">F2</kbd>
          </button>
          <button type="button" className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300" aria-label="More POS actions">
            …
          </button>
        </div>
      </header>`;

replaceOnce("module header", legacyHeader, modernHeader);

replaceOnce(
  "category strip",
  '<nav className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-white/10 dark:bg-slate-900">',
  '<nav className="mt-2 flex h-11 shrink-0 items-center gap-1 overflow-x-auto rounded-[18px] border border-slate-200/80 bg-white px-3 shadow-sm shadow-slate-900/5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-white/10 dark:bg-slate-900">',
);

replaceOnce(
  "workspace",
  '<main className="grid min-h-0 flex-1 [grid-template-columns:minmax(0,1fr)_390px] max-[1100px]:[grid-template-columns:minmax(0,1fr)_350px] max-[860px]:[grid-template-columns:minmax(0,1fr)_330px]">',
  '<main className="mt-2 grid min-h-0 flex-1 gap-3 [grid-template-columns:minmax(0,1fr)_360px] max-[1100px]:[grid-template-columns:minmax(0,1fr)_340px] max-[860px]:[grid-template-columns:minmax(0,1fr)_320px]">',
);

replaceOnce(
  "item panel",
  '<section className="flex min-h-0 flex-col border-r border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-950">',
  '<section className="flex min-h-0 flex-col overflow-hidden rounded-[18px] border border-slate-200/80 bg-white shadow-sm shadow-slate-900/5 dark:border-white/10 dark:bg-slate-900">',
);

replaceOnce(
  "item toolbar",
  '<div className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 dark:border-white/10 dark:bg-slate-900">',
  '<div className="flex h-11 shrink-0 items-center gap-2 border-b border-slate-200/80 bg-white px-3 dark:border-white/10 dark:bg-slate-900">',
);

replaceOnce(
  "item search",
  'className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-12 text-[10px] font-semibold outline-none focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-slate-950 dark:focus:bg-slate-900"',
  'className="h-8 w-full rounded-xl border border-slate-200/80 bg-slate-50 pl-8 pr-12 text-[10px] font-semibold outline-none transition focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-slate-950 dark:focus:bg-slate-900"',
);

replaceOnce(
  "item header",
  '<div className="flex h-9 shrink-0 items-center border-b border-slate-200 bg-slate-50 px-4 text-[8px] font-black uppercase tracking-wider text-slate-400 dark:border-white/10 dark:bg-slate-950">',
  '<div className="flex h-9 shrink-0 items-center border-b border-slate-200/80 bg-slate-50 px-4 text-[8px] font-black uppercase tracking-wider text-slate-400 dark:border-white/10 dark:bg-slate-950/70">',
);

replaceOnce(
  "item rows",
  'className={`group flex min-h-[46px] items-center border-b border-slate-100 px-4 text-[10px] dark:border-white/5 ${outOfStock ? "opacity-45" : "hover:bg-blue-50/50 dark:hover:bg-white/[0.025]"}`}',
  'className={`group flex min-h-[44px] items-center border-b border-slate-100 px-4 text-[10px] transition-colors dark:border-white/5 ${outOfStock ? "opacity-45" : "hover:bg-slate-50 dark:hover:bg-white/[0.025]"}`}',
);

replaceOnce(
  "bill panel",
  '<aside className="min-h-0 overflow-hidden bg-white dark:bg-slate-900">',
  '<aside className="min-h-0 overflow-hidden rounded-[18px] border border-slate-200/80 bg-white shadow-md shadow-slate-900/5 dark:border-white/10 dark:bg-slate-900 dark:shadow-black/15">',
);

replaceOnce(
  "bill header",
  '<div className="flex min-h-[54px] shrink-0 items-center justify-between border-b border-slate-200 px-3.5 dark:border-white/10">',
  '<div className="flex min-h-[54px] shrink-0 items-center justify-between border-b border-slate-200/80 px-3.5 dark:border-white/10">',
);

replaceOnce(
  "customer section",
  '<div className="shrink-0 border-b border-slate-200 px-3.5 py-2.5 dark:border-white/10">',
  '<div className="shrink-0 border-b border-slate-200/80 px-3.5 py-2.5 dark:border-white/10">',
);

replaceOnce(
  "customer search",
  'className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-2 text-[10px] font-semibold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-slate-950"',
  'className="h-8 w-full rounded-xl border border-slate-200/80 bg-slate-50 pl-8 pr-2 text-[10px] font-semibold outline-none transition focus:border-blue-500 dark:border-white/10 dark:bg-slate-950"',
);

replaceOnce(
  "bill item rows",
  'className="flex min-h-[48px] items-center border-b border-slate-100 dark:border-white/5"',
  'className="flex min-h-[44px] items-center border-b border-slate-100 dark:border-white/5"',
);

replaceOnce(
  "payment footer",
  '<div className="shrink-0 border-t border-slate-200 bg-slate-50 px-3.5 pb-3 pt-2.5 dark:border-white/10 dark:bg-slate-950">',
  '<div className="shrink-0 border-t border-slate-200/80 bg-slate-50 px-3.5 pb-3 pt-2.5 dark:border-white/10 dark:bg-slate-950/70">',
);

replaceOnce(
  "complete button",
  'className="mt-2 flex h-11 w-full items-center justify-center rounded-lg bg-blue-600 text-[10px] font-black uppercase tracking-wide text-white shadow-md shadow-blue-500/15 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"',
  'className="mt-2 flex h-10 w-full items-center justify-center rounded-xl bg-blue-600 text-[10px] font-black uppercase tracking-wide text-white shadow-md shadow-blue-500/15 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"',
);

if (changed) {
  fs.writeFileSync(posFile, pos, "utf8");
  console.log("POS visual alignment: applied");
} else {
  console.log("POS visual alignment: already applied");
}
