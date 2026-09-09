import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const NL = "\n";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function write(rel, source) {
  fs.writeFileSync(path.join(ROOT, rel), source, "utf8");
}

function replaceOnce(rel, marker, oldText, newText) {
  let source = read(rel);
  if (source.includes(marker)) return false;
  if (!source.includes(oldText)) {
    throw new Error(`[khata-due] expected source pattern not found in ${rel}`);
  }
  source = source.replace(oldText, newText);
  write(rel, source);
  return true;
}

function insertBeforeExact(rel, marker, anchor, insertion) {
  let source = read(rel);
  if (source.includes(marker)) return false;
  const index = source.indexOf(anchor);
  if (index === -1) throw new Error(`[khata-due] anchor not found in ${rel}`);
  source = source.slice(0, index) + insertion + source.slice(index);
  write(rel, source);
  return true;
}

function patchItemBrowser() {
  const rel = "components/pos/item-browser.tsx";
  let source = read(rel);
  let changed = false;

  if (!source.includes("  khata: {")) {
    const objectAnchor = "\n};\n\nexport type Category";
    const index = source.indexOf(objectAnchor);
    if (index === -1) throw new Error(`[khata-due] METHOD_BTN object end not found in ${rel}`);
    const khata = [
      "  khata: {",
      '    label: "Khata / Due",',
      '    active: "bg-amber-600 text-white ring-2 ring-amber-500 shadow-md shadow-amber-500/25 scale-[1.02] font-black",',
      '    idle: "bg-amber-50/80 text-amber-900 border border-amber-200/80 hover:bg-amber-100 dark:bg-amber-950/40 dark:border-amber-900/40 dark:text-amber-300 font-bold",',
      "  },",
      "",
    ].join(NL);
    source = source.slice(0, index + 1) + khata + source.slice(index + 1);
    changed = true;
  }

  if (!source.includes("  khata: [],")) {
    const oldText = '  credit: ["credit_card"],\n};';
    const newText = '  credit: ["credit_card"],\n  khata: [],\n};';
    if (!source.includes(oldText)) throw new Error(`[khata-due] METHOD_ACCOUNT_TYPES end not found in ${rel}`);
    source = source.replace(oldText, newText);
    changed = true;
  }

  if (!source.includes('normalized === "khata"')) {
    const oldText = '  return INSTRUMENT_TYPES.find((t) => t.value === normalized)?.label ?? method;';
    const newText = '  if (normalized === "khata") return "Khata / Due";\n  return INSTRUMENT_TYPES.find((t) => t.value === normalized)?.label ?? method;';
    if (!source.includes(oldText)) throw new Error(`[khata-due] instrumentLabel return not found in ${rel}`);
    source = source.replace(oldText, newText);
    changed = true;
  }

  if (changed) write(rel, source);
  return changed;
}

function patchPosClient() {
  const rel = "components/pos/pos-client.tsx";
  let source = read(rel);
  let changed = false;

  const methodOld = `    return enabledMethods && enabledMethods.length > 0 ? all.filter((m) => enabledMethods.includes(m)) : all;`;
  const methodNew = `    const configured = enabledMethods && enabledMethods.length > 0 ? all.filter((m) => enabledMethods.includes(m)) : all;\n    return Array.from(new Set([...configured, "khata"]));`;
  if (!source.includes("return Array.from(new Set([...configured, \"khata\"]));")) {
    if (!source.includes(methodOld)) throw new Error(`[khata-due] POS methodList pattern not found in ${rel}`);
    source = source.replace(methodOld, methodNew);
    changed = true;
  }

  const quickOld = `  function quickMethod(m: string) {\n    const types = METHOD_ACCOUNT_TYPES[m] ?? [m];`;
  const quickNew = `  function quickMethod(m: string) {\n    if (m === "khata") {\n      setPayments([{ instrument_id: "", method: "khata", amount: "0" }]);\n      return;\n    }\n    const types = METHOD_ACCOUNT_TYPES[m] ?? [m];`;
  if (!source.includes('setPayments([{ instrument_id: "", method: "khata", amount: "0" }]);')) {
    if (!source.includes(quickOld)) throw new Error(`[khata-due] POS quickMethod pattern not found in ${rel}`);
    source = source.replace(quickOld, quickNew);
    changed = true;
  }

  const fillOld = `  function fillExact() {\n    setPayments((prev) => [{ instrument_id: prev[0].instrument_id, method: prev[0].method, amount: Math.max(0, total - advanceUsed).toFixed(2) }]);\n  }`;
  const fillNew = `  function fillExact() {\n    if (activeMethod === "khata") return;\n    setPayments((prev) => [{ instrument_id: prev[0].instrument_id, method: prev[0].method, amount: Math.max(0, total - advanceUsed).toFixed(2) }]);\n  }`;
  if (!source.includes('if (activeMethod === "khata") return;')) {
    if (!source.includes(fillOld)) throw new Error(`[khata-due] POS fillExact pattern not found in ${rel}`);
    source = source.replace(fillOld, fillNew);
    changed = true;
  }

  const autoFillOld = `prev.length === 1 && (prev[0].amount === "" || Number(prev[0].amount) === 0)`;
  const autoFillNew = `prev.length === 1 && prev[0].method !== "khata" && (prev[0].amount === "" || Number(prev[0].amount) === 0)`;
  if (!source.includes("prev[0].method !== \"khata\"")) {
    if (!source.includes(autoFillOld)) throw new Error(`[khata-due] POS auto-fill pattern not found in ${rel}`);
    source = source.replace(autoFillOld, autoFillNew);
    changed = true;
  }

  const completeOld = `    if (total > 0 && paid + advanceUsed <= 0) {\n      setError("Enter a payment amount");\n      return;\n    }`;
  const completeNew = `    const khataOnly = activeMethod === "khata";\n    if (total > 0 && paid + advanceUsed <= 0 && !khataOnly) {\n      setError("Enter a payment amount");\n      return;\n    }\n    if (khataOnly && !customerId) {\n      setError("Select a customer to post this sale to Khata / Due.");\n      return;\n    }`;
  if (!source.includes("const khataOnly = activeMethod === \"khata\";")) {
    if (!source.includes(completeOld)) throw new Error(`[khata-due] POS completeSale validation pattern not found in ${rel}`);
    source = source.replace(completeOld, completeNew);
    changed = true;
  }

  const paymentMarker = `                    {/* Payment Row */}`;
  if (!source.includes("/* KHATA_DUE_PAYMENT_ROW_V1 */")) {
    const paymentStart = source.indexOf(paymentMarker);
    if (paymentStart === -1) throw new Error(`[khata-due] POS payment row marker not found in ${rel}`);
    const paymentEndAnchor = `                    ))}\n                  </div>`;
    const paymentEnd = source.indexOf(paymentEndAnchor, paymentStart);
    if (paymentEnd === -1) throw new Error(`[khata-due] POS payment row end not found in ${rel}`);
    const replacement = [
      "                    {/* KHATA_DUE_PAYMENT_ROW_V1 */}",
      "                    {payments.map((p, i) => (",
      "                      <div key={i} className=\"flex gap-2\">",
      "                        {p.method === \"khata\" ? (",
      "                          <div className=\"flex w-full items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/30\">",
      "                            <div>",
      "                              <p className=\"text-xs font-black text-amber-900 dark:text-amber-200\">Khata / Due</p>",
      "                              <p className=\"text-[10px] font-semibold text-amber-700 dark:text-amber-300\">No payment collected now · added to customer ledger</p>",
      "                            </div>",
      "                            <span className=\"rounded-lg bg-white px-2 py-1 text-[10px] font-black text-amber-700 ring-1 ring-amber-200 dark:bg-slate-900 dark:text-amber-300 dark:ring-amber-900/50\">0 received</span>",
      "                          </div>",
      "                        ) : (",
      "                          <>",
      "                            <InstrumentSelect",
      "                              instruments={instruments}",
      "                              pick={p}",
      "                              onChange={(x) => setPaymentInstrument(i, x)}",
      "                              enabled={accountFilter}",
      "                              className=\"w-36\"",
      "                            />",
      "                            <input",
      "                              type=\"number\"",
      "                              value={p.amount}",
      "                              onChange={(e) => setPaymentAmount(i, e.target.value)}",
      "                              placeholder=\"Amount\"",
      "                              className={inputClass}",
      "                            />",
      "                          </>",
      "                        )}",
      "                      </div>",
      "                    ))}",
      "                  </div>",
    ].join(NL);
    source = source.slice(0, paymentStart) + replacement + source.slice(paymentEnd + paymentEndAnchor.length);
    changed = true;
  }

  const tenderAnchor = `                    </div>\n\n                    {/* KHATA_DUE_PAYMENT_ROW_V1 */}`;
  if (!source.includes("/* KHATA_DUE_INFO_V1 */")) {
    const idx = source.indexOf(tenderAnchor);
    if (idx === -1) throw new Error(`[khata-due] POS Khata info insertion anchor not found in ${rel}`);
    const info = [
      `                    {/* KHATA_DUE_INFO_V1 */}`,
      `                    {activeMethod === "khata" && (`,
      `                      <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900/50 dark:bg-amber-950/30">`,
      `                        {selectedCustomer ? (`,
      `                          <div className="flex items-center justify-between gap-3">`,
      `                            <div className="min-w-0">`,
      `                              <p className="truncate text-xs font-black text-amber-900 dark:text-amber-200">Customer Khata · {selectedCustomer.name}</p>`,
      `                              <p className="mt-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">Current balance {inr(custBalance)} · New due {inr(invoiceDue)} · After sale {inr(custBalance + invoiceDue)}</p>`,
      `                            </div>`,
      `                            <span className="shrink-0 rounded-full bg-amber-600 px-2 py-1 text-[10px] font-black text-white">DUE</span>`,
      `                          </div>`,
      `                        ) : (`,
      `                          <p className="text-xs font-bold text-amber-800 dark:text-amber-200">Select a customer above before using Khata / Due.</p>`,
      `                        )}`,
      `                      </div>`,
      `                    )}`,
      "",
    ].join(NL);
    source = source.slice(0, idx) + info + source.slice(idx);
    changed = true;
  }

  if (changed) write(rel, source);
  return changed;
}

function patchQuickSale() {
  const rel = "components/pos/quick-sale.tsx";
  let source = read(rel);
  let changed = false;

  const selectionAnchor = `  const insufficient = paid > 0 && paid < total;`;
  if (!source.includes("const khataBalance = selectedCustomer")) {
    if (!source.includes(selectionAnchor)) throw new Error(`[khata-due] Quick Sale totals anchor not found in ${rel}`);
    const addition = `${selectionAnchor}\n  const selectedCustomer = customers.find((c) => c.id === customerId);\n  const khataBalance = selectedCustomer ? Number(selectedCustomer.balance) || 0 : 0;`;
    source = source.replace(selectionAnchor, addition);
    changed = true;
  }

  const methodOld = `    if (enabledMethods && enabledMethods.length > 0) return all.filter((m) => enabledMethods.includes(m));\n    return all;`;
  const methodNew = `    const configured = enabledMethods && enabledMethods.length > 0 ? all.filter((m) => enabledMethods.includes(m)) : all;\n    return Array.from(new Set([...configured, "khata"]));`;
  if (!source.includes("return Array.from(new Set([...configured, \"khata\"]));")) {
    if (!source.includes(methodOld)) throw new Error(`[khata-due] Quick Sale methodList pattern not found in ${rel}`);
    source = source.replace(methodOld, methodNew);
    changed = true;
  }

  const quickOld = `  function quickMethod(m: string) {\n    const types = METHOD_ACCOUNT_TYPES[m] ?? [m];`;
  const quickNew = `  function quickMethod(m: string) {\n    if (m === "khata") {\n      setPayments([{ instrument_id: "", method: "khata", amount: "0" }]);\n      return;\n    }\n    const types = METHOD_ACCOUNT_TYPES[m] ?? [m];`;
  if (!source.includes('setPayments([{ instrument_id: "", method: "khata", amount: "0" }]);')) {
    if (!source.includes(quickOld)) throw new Error(`[khata-due] Quick Sale quickMethod pattern not found in ${rel}`);
    source = source.replace(quickOld, quickNew);
    changed = true;
  }

  const recordOld = `    if (paid <= 0) {\n      setError("Enter the amount received.");\n      return;\n    }`;
  const recordNew = `    const khataOnly = activeMethod === "khata";\n    if (paid <= 0 && !khataOnly) {\n      setError("Enter the amount received.");\n      return;\n    }\n    if (khataOnly && !customerId) {\n      setError("Select a customer to post this sale to Khata / Due.");\n      return;\n    }`;
  if (!source.includes("const khataOnly = activeMethod === \"khata\";")) {
    if (!source.includes(recordOld)) throw new Error(`[khata-due] Quick Sale record validation pattern not found in ${rel}`);
    source = source.replace(recordOld, recordNew);
    changed = true;
  }

  const fillOld = `  function fillExact() {\n    setPayments((prev) => {`;
  const fillNew = `  function fillExact() {\n    if (activeMethod === "khata") return;\n    setPayments((prev) => {`;
  if (!source.includes('if (activeMethod === "khata") return;')) {
    if (!source.includes(fillOld)) throw new Error(`[khata-due] Quick Sale fillExact pattern not found in ${rel}`);
    source = source.replace(fillOld, fillNew);
    changed = true;
  }

  const paymentMarker = `                <div className="space-y-2">`;
  if (!source.includes("/* KHATA_DUE_PAYMENT_ROW_V1 */")) {
    const paymentStart = source.indexOf(paymentMarker);
    if (paymentStart === -1) throw new Error(`[khata-due] Quick Sale payment block not found in ${rel}`);
    const endAnchor = `                </div>\n\n                <div className="mt-2 flex items-center justify-between gap-2">`;
    const paymentEnd = source.indexOf(endAnchor, paymentStart);
    if (paymentEnd === -1) throw new Error(`[khata-due] Quick Sale payment block end not found in ${rel}`);
    const replacement = [
      `                {/* KHATA_DUE_PAYMENT_ROW_V1 */}`,
      `                <div className="space-y-2">`,
      `                  {payments.map((p, i) => (`,
      `                    <div key={i} className="flex items-center gap-2">`,
      `                      {p.method === "khata" ? (`,
      `                        <div className="flex w-full items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/30">`,
      `                          <div>`,
      `                            <p className="text-xs font-black text-amber-900 dark:text-amber-200">Khata / Due</p>`,
      `                            <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">No payment collected now · added to customer ledger</p>`,
      `                          </div>`,
      `                          <span className="rounded-lg bg-white px-2 py-1 text-[10px] font-black text-amber-700 ring-1 ring-amber-200 dark:bg-slate-900 dark:text-amber-300 dark:ring-amber-900/50">0 received</span>`,
      `                        </div>`,
      `                      ) : (`,
      `                        <>`,
      `                          <InstrumentSelect`,
      `                            instruments={instrumentList}`,
      `                            pick={p}`,
      `                            onChange={(pick) => setPaymentInstrument(i, pick)}`,
      `                            enabled={accountFilter}`,
      `                            className="w-36 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-500"`,
      `                          />`,
      `                          <input`,
      `                            ref={payments.length === 1 ? payRef : undefined}`,
      `                            type="number"`,
      `                            min="0"`,
      `                            step="0.01"`,
      `                            value={p.amount}`,
      `                            onChange={(e) => setPaymentAmount(i, e.target.value)}`,
      `                            placeholder={payments.length === 1 ? "Amount received" : "Amount"}`,
      `                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500"`,
      `                          />`,
      `                          {payments.length > 1 && (`,
      `                            <button`,
      `                              onClick={() => setPayments((prev) => prev.filter((_, j) => j !== i))}`,
      `                              className="text-xs text-slate-400 hover:text-rose-600"`,
      `                            >`,
      `                              ✕`,
      `                            </button>`,
      `                          )}`,
      `                        </>`,
      `                      )}`,
      `                    </div>`,
      `                  ))}`,
      `                </div>`,
      `\n                <div className="mt-2 flex items-center justify-between gap-2">`,
    ].join(NL);
    source = source.slice(0, paymentStart) + replacement + source.slice(paymentEnd + endAnchor.length);
    changed = true;
  }

  const infoAnchor = `                <div className="space-y-2">\n                  {payments.map((p, i) => (`;
  if (!source.includes("/* KHATA_DUE_INFO_V1 */")) {
    const idx = source.indexOf(infoAnchor);
    if (idx === -1) throw new Error(`[khata-due] Quick Sale Khata info insertion anchor not found in ${rel}`);
    const info = [
      `                {/* KHATA_DUE_INFO_V1 */}`,
      `                {activeMethod === "khata" && (`,
      `                  <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900/50 dark:bg-amber-950/30">`,
      `                    {selectedCustomer ? (`,
      `                      <div className="flex items-center justify-between gap-3">`,
      `                        <div className="min-w-0">`,
      `                          <p className="truncate text-xs font-black text-amber-900 dark:text-amber-200">Customer Khata · {selectedCustomer.name}</p>`,
      `                          <p className="mt-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">Current balance {inr(khataBalance)} · New due {inr(due)} · After sale {inr(khataBalance + due)}</p>`,
      `                        </div>`,
      `                        <span className="shrink-0 rounded-full bg-amber-600 px-2 py-1 text-[10px] font-black text-white">DUE</span>`,
      `                      </div>`,
      `                    ) : (`,
      `                      <p className="text-xs font-bold text-amber-800 dark:text-amber-200">Select a customer above before using Khata / Due.</p>`,
      `                    )}`,
      `                  </div>`,
      `                )}`,
      "",
    ].join(NL);
    source = source.slice(0, idx) + info + source.slice(idx);
    changed = true;
  }

  if (changed) write(rel, source);
  return changed;
}

const changed = [patchItemBrowser(), patchPosClient(), patchQuickSale()].some(Boolean);
console.log(changed ? "repair-pos-khata-due-build: applied Khata / Due POS patch" : "repair-pos-khata-due-build: Khata / Due patch already applied");
