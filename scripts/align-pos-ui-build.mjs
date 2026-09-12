import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const posFile = path.join(ROOT, "components", "pos", "pos-shell.tsx");

let pos = fs.readFileSync(posFile, "utf8");
let changed = false;

function replaceOnce(label, from, to) {
  if (pos.includes(to) && !pos.includes(from)) return;
  if (!pos.includes(from)) {
    console.log(`POS visual alignment: ${label} already aligned; skipping`);
    return;
  }
  pos = pos.replace(from, to);
  changed = true;
}

replaceOnce(
  "root",
  '<div className="absolute inset-0 z-[100] flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-white">',
  '<div className="absolute inset-0 z-[100] flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-slate-50 p-3 text-slate-900 dark:bg-slate-950 dark:text-white">',
);

replaceOnce(
  "module header",
  '<header className="flex h-12 shrink-0 items-center border-b border-slate-200 bg-white px-4 shadow-sm dark:border-white/10 dark:bg-slate-900">',
  '<header className="flex h-16 shrink-0 items-center justify-between rounded-[22px] border border-slate-200/80 bg-white/95 px-4 shadow-md shadow-slate-900/5 backdrop-blur-2xl ring-1 ring-black/5 dark:border-white/10 dark:bg-slate-900/95 dark:shadow-black/20 dark:ring-white/10">',
);

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

// Put the operational actions beside Current Bill instead of hiding them
// behind the old three-dot header control. The existing PosOperations
// component owns hold/recall/today's sale plus the financial Money Out flow.
if (!pos.includes('import PosOperations from "./pos-operations";')) {
  const importAnchor = 'import { createClient } from "@/lib/supabase/client";';
  if (!pos.includes(importAnchor)) {
    console.error("POS actions: Supabase import anchor not found; refusing unsafe patch");
    process.exit(1);
  }
  pos = pos.replace(importAnchor, `${importAnchor}\nimport PosOperations from "./pos-operations";`);
  changed = true;
}

const oldHeaderMore = '<button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300" aria-label="More POS actions">\n            …\n          </button>';
if (pos.includes(oldHeaderMore)) {
  pos = pos.replace(oldHeaderMore, "");
  changed = true;
}

const clearButton = '<button type="button" onClick={resetBill} className="rounded-md px-2 py-1 text-[9px] font-black text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10">Clear</button>';
const operationsBlock = `<PosOperations\n                cart={cart}\n                total={total}\n                discount={discount}\n                customerId={customerId}\n                customerName={selectedCustomer?.name ?? ""}\n                paymentChoice={paymentChoice}\n                cashReceived={cashReceived}\n                splitRows={splitRows}\n                instruments={instruments}\n                supabase={supabase}\n                onRestore={(draft) => {\n                  setCart(draft.cart);\n                  setDiscount(draft.discount);\n                  setCustomerId(draft.customerId);\n                  setCustomerSearch("");\n                  setCustomerOpen(false);\n                  setPaymentChoice(draft.paymentChoice as PaymentChoice);\n                  setCashReceived(draft.cashReceived);\n                  setSplitRows(draft.splitRows);\n                  setError(null);\n                  setSuccess(null);\n                }}\n                onReset={resetBill}\n              />`;
if (!pos.includes("<PosOperations")) {
  if (!pos.includes(clearButton)) {
    console.error("POS actions: Current Bill clear button anchor not found; refusing unsafe patch");
    process.exit(1);
  }
  pos = pos.replace(clearButton, `${operationsBlock}\n              ${clearButton}`);
  changed = true;
}

if (changed) {
  fs.writeFileSync(posFile, pos, "utf8");
  console.log("POS visual alignment/actions: applied");
} else {
  console.log("POS visual alignment/actions: already applied");
}
