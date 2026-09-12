import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const posFile = path.join(ROOT, "components", "pos", "pos-shell.tsx");
const opsFile = path.join(ROOT, "components", "pos", "pos-operations.tsx");

let pos = fs.readFileSync(posFile, "utf8");
let ops = fs.readFileSync(opsFile, "utf8");
const originalPos = pos;
const originalOps = ops;

function replaceOnce(source, label, from, to) {
  if (source.includes(to) && !source.includes(from)) return source;
  if (!source.includes(from)) {
    console.log(`[pos-reference] ${label}: anchor not found; skipping`);
    return source;
  }
  console.log(`[pos-reference] ${label}: applied`);
  return source.replace(from, to);
}

pos = replaceOnce(
  pos,
  "root",
  'className="absolute inset-0 z-[100] flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-slate-50 p-3 text-slate-900 dark:bg-slate-950 dark:text-white"',
  'className="cafeerp-pos-reference absolute inset-0 z-[100] flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-white"',
);

// Match the reference POS identity/header exactly: ERP breadcrumb, POS title,
// helper line, centered barcode search and compact online state.
const oldTitleBlock = `            <div className="min-w-0">\n            <div className="flex items-center gap-1.5">\n              <span className="truncate text-sm font-black">{shopName || "CafeERP"}</span>\n              <span className="text-slate-300">/</span>\n              <span className="text-sm font-extrabold text-blue-600 dark:text-blue-400">POS</span>\n            </div>\n          </div>`;
const newTitleBlock = `            <div className="min-w-0">\n            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">\n              <span>Café ERP</span>\n              <span>/</span>\n              <span>1. SALES HUB</span>\n              <span>/</span>\n              <span className="font-extrabold text-blue-600 dark:text-blue-400">POS BILLING</span>\n            </div>\n            <div className="text-base font-extrabold text-slate-900 dark:text-white">POS Billing</div>\n            <div className="text-[10px] font-semibold text-slate-400">Scan, search or select items to add to your bill</div>\n          </div>`;
pos = replaceOnce(pos, "header title", oldTitleBlock, newTitleBlock);

if (!pos.includes('data-pos-header-search="reference"')) {
  const anchor = '        <div className="ml-auto flex items-center gap-2">';
  const search = `        <div data-pos-header-search="reference" className="mx-5 hidden min-w-0 flex-1 max-w-[520px] lg:flex">\n          <div className="relative w-full">\n            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />\n            <input\n              value={search}\n              onChange={(event) => setSearch(event.target.value)}\n              placeholder="Search / Scan barcode (F4)"\n              className="h-10 w-full rounded-xl border border-slate-200/90 bg-slate-50 pl-10 pr-14 text-xs font-semibold text-slate-700 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200 dark:focus:bg-slate-900"\n            />\n            <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-[9px] font-black text-slate-500 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300">F4</kbd>\n          </div>\n        </div>\n\n${anchor}`;
  if (pos.includes(anchor)) pos = pos.replace(anchor, search);
}

pos = replaceOnce(
  pos,
  "workspace columns",
  '[grid-template-columns:minmax(0,1fr)_360px] max-[1100px]:[grid-template-columns:minmax(0,1fr)_340px] max-[860px]:[grid-template-columns:minmax(0,1fr)_320px]',
  '[grid-template-columns:minmax(0,1fr)_430px] max-[1200px]:[grid-template-columns:minmax(0,1fr)_390px] max-[1000px]:[grid-template-columns:minmax(0,1fr)_350px] max-[860px]:[grid-template-columns:minmax(0,1fr)_320px]',
);

// Give every catalog row the same visible Add + overflow affordance as the reference.
const oldAddWrap = `                  <span className="flex w-[8%] justify-end">\n                    <button\n                      type="button"\n                      disabled={outOfStock}\n                      onClick={() => addItem(item)}\n                      className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-white shadow-sm hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-800"\n                      aria-label={\`Add \${item.name}\`}\n                    >\n                      <Plus className="h-3.5 w-3.5" />\n                    </button>\n                  </span>`;
const newAddWrap = `                  <span className="flex w-[12%] items-center justify-end gap-2">\n                    <button\n                      type="button"\n                      disabled={outOfStock}\n                      onClick={() => addItem(item)}\n                      className="flex h-8 min-w-[74px] items-center justify-center gap-1 rounded-lg bg-blue-600 px-2.5 text-[10px] font-black text-white shadow-sm shadow-blue-500/15 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"\n                      aria-label={\`Add \${item.name}\`}\n                    >\n                      <Plus className="h-3.5 w-3.5" />\n                      <span>Add</span>\n                    </button>\n                    <button type="button" aria-label={\`More actions for \${item.name}\`} className="flex h-7 w-5 items-center justify-center text-base font-black text-slate-400 hover:text-blue-600">⋮</button>\n                  </span>`;
pos = replaceOnce(pos, "catalog row actions", oldAddWrap, newAddWrap);

if (!pos.includes('data-pos-customer-action="reference"')) {
  const anchor = '              <PosOperations';
  const controls = `              <div data-pos-customer-action="reference" className="flex items-center gap-1.5">\n                <button type="button" onClick={() => { setCustomerOpen(true); window.setTimeout(() => customerSearchRef.current?.focus(), 0); }} className="flex h-9 items-center gap-1.5 rounded-xl border border-blue-100 bg-blue-50 px-3 text-[10px] font-black text-blue-700 hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-500/10 dark:text-blue-300">\n                  <CircleUserRound className="h-3.5 w-3.5" />\n                  <span className="hidden xl:inline">{selectedCustomer ? selectedCustomer.name : "Select Customer"}</span>\n                </button>\n                <button type="button" onClick={resetBill} className="flex h-9 items-center gap-1.5 rounded-xl border border-blue-100 bg-blue-50 px-3 text-[10px] font-black text-blue-700 hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-500/10 dark:text-blue-300">\n                  <Plus className="h-3.5 w-3.5" />\n                  <span>New</span>\n                </button>\n              </div>\n${anchor}`;
  if (pos.includes(anchor)) pos = pos.replace(anchor, controls);
}

pos = replaceOnce(
  pos,
  "customer picker",
  '<div className="shrink-0 border-b border-slate-200/80 px-3.5 py-2.5 dark:border-white/10">',
  '<div className={`pos-customer-picker shrink-0 overflow-hidden border-b border-slate-200/80 px-3.5 transition-[max-height,padding] duration-150 dark:border-white/10 ${customerOpen || selectedCustomer ? "max-h-24 py-2.5" : "max-h-0 border-b-0 py-0"}`}>',
);

if (!pos.includes('data-pos-money-out="reference"')) {
  const anchor = '              <button\n                type="button"\n                disabled={!cart.length || busy}\n                onClick={() => void completeSale()}';
  const moneyOut = `              <button\n                type="button"\n                data-pos-money-out="reference"\n                onClick={() => window.dispatchEvent(new CustomEvent("cafeerp:open-money-out"))}\n                className="mt-1.5 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 text-[10px] font-black uppercase tracking-wide text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-950/50"\n              >\n                <span className="text-sm">↘</span>\n                Money Out\n              </button>\n\n${anchor}`;
  if (pos.includes(anchor)) pos = pos.replace(anchor, moneyOut);
}

if (!ops.includes('cafeerp:open-money-out')) {
  const anchor = '  useEffect(() => {\n    if (!message) return;';
  const listener = `  useEffect(() => {\n    function openFromCheckout() {\n      setMenuOpen(false);\n      setMoneyOutAmount("");\n      setMoneyOutCategory("general");\n      setMoneyOutNote("");\n      setMoneyOutSource("");\n      setMoneyOutOpen(true);\n    }\n    window.addEventListener("cafeerp:open-money-out", openFromCheckout);\n    return () => window.removeEventListener("cafeerp:open-money-out", openFromCheckout);\n  }, []);\n\n${anchor}`;
  if (ops.includes(anchor)) ops = ops.replace(anchor, listener);
}

const styleMarker = "/* CafeERP POS reference design */";
if (!pos.includes(styleMarker)) {
  const rootAnchor = "      {success && (";
  const styles = `      <style dangerouslySetInnerHTML={{ __html: \`\n        ${styleMarker}\n        .cafeerp-pos-reference { padding: 0 !important; gap: 0 !important; }\n        .cafeerp-pos-reference > header { height: 74px !important; min-height: 74px !important; border-radius: 0 !important; border-width: 0 0 1px !important; padding-left: 18px !important; padding-right: 18px !important; box-shadow: 0 1px 10px rgba(15,23,42,.04) !important; }\n        .cafeerp-pos-reference > nav { margin-top: 10px !important; margin-left: 14px !important; margin-right: 14px !important; height: 48px !important; border-radius: 16px !important; border: 1px solid rgba(226,232,240,.9) !important; box-shadow: 0 2px 10px rgba(15,23,42,.04) !important; }\n        .cafeerp-pos-reference > main { margin: 10px 14px 14px !important; gap: 10px !important; }\n        .cafeerp-pos-reference > main > section, .cafeerp-pos-reference > main > aside { border-radius: 18px !important; border: 1px solid rgba(226,232,240,.9) !important; box-shadow: 0 2px 12px rgba(15,23,42,.05) !important; }\n        .cafeerp-pos-reference > main > section > div:first-child { height: 52px !important; padding-left: 12px !important; padding-right: 12px !important; }\n        .cafeerp-pos-reference > main > section > div:nth-child(2) { height: 38px !important; }\n        .cafeerp-pos-reference > main > section > div:nth-child(3) > div { min-height: 48px !important; }\n        .cafeerp-pos-reference > main > aside > div > div:first-child { min-height: 86px !important; flex-wrap: wrap !important; align-content: center !important; row-gap: 5px !important; }\n        .cafeerp-pos-reference > main > aside > div > div:first-child > div:first-child { flex: 1 1 auto !important; }\n        .cafeerp-pos-reference [data-pos-customer-action=\"reference\"] { margin-left: 0 !important; order: 2 !important; }\n        .cafeerp-pos-reference [data-pos-customer-action=\"reference\"] + div { order: 2 !important; }\n        .cafeerp-pos-reference > main > aside > div > div:first-child > button { order: 1 !important; margin-left: auto !important; }\n        .cafeerp-pos-reference [data-pos-header-search=\"reference\"] input { font-size: 12px !important; }\n        .cafeerp-pos-reference [data-pos-money-out=\"reference\"] { flex-shrink: 0; }\n      \` }} />\n\n${rootAnchor}`;
  if (pos.includes(rootAnchor)) pos = pos.replace(rootAnchor, styles);
}

const posChanged = pos !== originalPos;
const opsChanged = ops !== originalOps;
if (posChanged) fs.writeFileSync(posFile, pos, "utf8");
if (opsChanged) fs.writeFileSync(opsFile, ops, "utf8");

console.log(`[pos-reference] completed${posChanged ? " with POS changes" : "; POS already aligned"}${opsChanged ? " and Money Out event wiring" : ""}.`);
