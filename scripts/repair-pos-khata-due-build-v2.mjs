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

function patchItemBrowser() {
  const rel = "components/pos/item-browser.tsx";
  let source = read(rel);
  let changed = false;

  if (!source.includes("  khata: {")) {
    const anchor = "\n};\n\nexport type Category";
    const index = source.indexOf(anchor);
    if (index === -1) throw new Error(`[khata-due] METHOD_BTN end not found in ${rel}`);
    const insert = [
      "  khata: {",
      '    label: "Khata / Due",',
      '    active: "bg-amber-600 text-white ring-2 ring-amber-500 shadow-md shadow-amber-500/25 scale-[1.02] font-black",',
      '    idle: "bg-amber-50/80 text-amber-900 border border-amber-200/80 hover:bg-amber-100 dark:bg-amber-950/40 dark:border-amber-900/40 dark:text-amber-300 font-bold",',
      "  },",
      "",
    ].join(NL);
    source = source.slice(0, index + 1) + insert + source.slice(index + 1);
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

  if (!source.includes('return Array.from(new Set([...configured, "khata"]));')) {
    const oldText = '    return enabledMethods && enabledMethods.length > 0 ? all.filter((m) => enabledMethods.includes(m)) : all;';
    const newText = '    const configured = enabledMethods && enabledMethods.length > 0 ? all.filter((m) => enabledMethods.includes(m)) : all;\n    return Array.from(new Set([...configured, "khata"]));';
    if (!source.includes(oldText)) throw new Error(`[khata-due] POS methodList not found in ${rel}`);
    source = source.replace(oldText, newText);
    changed = true;
  }

  if (!source.includes('setPayments([{ instrument_id: "", method: "khata", amount: "0" }]);')) {
    const oldText = '  function quickMethod(m: string) {\n    const types = METHOD_ACCOUNT_TYPES[m] ?? [m];';
    const newText = '  function quickMethod(m: string) {\n    if (m === "khata") {\n      setPayments([{ instrument_id: "", method: "khata", amount: "0" }]);\n      return;\n    }\n    const types = METHOD_ACCOUNT_TYPES[m] ?? [m];';
    if (!source.includes(oldText)) throw new Error(`[khata-due] POS quickMethod not found in ${rel}`);
    source = source.replace(oldText, newText);
    changed = true;
  }

  if (!source.includes('if (activeMethod === "khata") return;')) {
    const oldText = '  function fillExact() {\n    setPayments((prev) => [{ instrument_id: prev[0].instrument_id, method: prev[0].method, amount: Math.max(0, total - advanceUsed).toFixed(2) }]);\n  }';
    const newText = '  function fillExact() {\n    if (activeMethod === "khata") return;\n    setPayments((prev) => [{ instrument_id: prev[0].instrument_id, method: prev[0].method, amount: Math.max(0, total - advanceUsed).toFixed(2) }]);\n  }';
    if (!source.includes(oldText)) throw new Error(`[khata-due] POS fillExact not found in ${rel}`);
    source = source.replace(oldText, newText);
    changed = true;
  }

  if (!source.includes('prev[0].method !== "khata"')) {
    const oldText = 'prev.length === 1 && (prev[0].amount === "" || Number(prev[0].amount) === 0)';
    const newText = 'prev.length === 1 && prev[0].method !== "khata" && (prev[0].amount === "" || Number(prev[0].amount) === 0)';
    if (!source.includes(oldText)) throw new Error(`[khata-due] POS payment auto-fill not found in ${rel}`);
    source = source.replace(oldText, newText);
    changed = true;
  }

  if (!source.includes('const khataOnly = activeMethod === "khata";')) {
    const oldText = '    if (total > 0 && paid + advanceUsed <= 0) {\n      setError("Enter a payment amount");\n      return;\n    }';
    const newText = '    const khataOnly = activeMethod === "khata";\n    if (total > 0 && paid + advanceUsed <= 0 && !khataOnly) {\n      setError("Enter a payment amount");\n      return;\n    }\n    if (khataOnly && !customerId) {\n      setError("Select a customer to post this sale to Khata / Due.");\n      return;\n    }';
    if (!source.includes(oldText)) throw new Error(`[khata-due] POS completeSale validation not found in ${rel}`);
    source = source.replace(oldText, newText);
    changed = true;
  }

  if (!source.includes("/* KHATA_DUE_PAYMENT_ROW_V2 */")) {
    const marker = "                    {/* Payment Row */}";
    const paymentStart = source.indexOf(marker);
    if (paymentStart === -1) throw new Error(`[khata-due] POS payment row marker not found in ${rel}`);
    const endAnchor = "                    ))}\n                  </div>";
    const paymentEnd = source.indexOf(endAnchor, paymentStart);
    if (paymentEnd === -1) throw new Error(`[khata-due] POS payment row end not found in ${rel}`);
    const replacement = [
      "                    {/* KHATA_DUE_PAYMENT_ROW_V2 */}",
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
    source = source.slice(0, paymentStart) + replacement + source.slice(paymentEnd + endAnchor.length);
    changed = true;

    const infoMarker = "                    {/* KHATA_DUE_PAYMENT_ROW_V2 */}";
    const infoIndex = source.indexOf(infoMarker);
    const info = [
      "                    {/* KHATA_DUE_INFO_V2 */}",
      "                    {activeMethod === \"khata\" && (",
      "                      <div className=\"mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900/50 dark:bg-amber-950/30\">",
      "                        {selectedCustomer ? (",
      "                          <div className=\"flex items-center justify-between gap-3\">",
      "                            <div className=\"min-w-0\">",
      "                              <p className=\"truncate text-xs font-black text-amber-900 dark:text-amber-200\">Customer Khata · {selectedCustomer.name}</p>",
      "                              <p className=\"mt-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300\">Current balance {inr(custBalance)} · New due {inr(invoiceDue)} · After sale {inr(custBalance + invoiceDue)}</p>",
      "                            </div>",
      "                            <span className=\"shrink-0 rounded-full bg-amber-600 px-2 py-1 text-[10px] font-black text-white\">DUE</span>",
      "                          </div>",
      "                        ) : (",
      "                          <p className=\"text-xs font-bold text-amber-800 dark:text-amber-200\">Select a customer above before using Khata / Due.</p>",
      "                        )}",
      "                      </div>",
      "                    )}",
      "",
    ].join(NL);
    if (infoIndex === -1) throw new Error(`[khata-due] POS info marker not found in ${rel}`);
    source = source.slice(0, infoIndex) + info + source.slice(infoIndex);
    changed = true;
  }

  if (changed) write(rel, source);
  return changed;
}

function patchQuickSale() {
  const rel = "components/pos/quick-sale.tsx";
  let source = read(rel);
  let changed = false;

  if (!source.includes("const khataBalance = selectedCustomer")) {
    const anchor = `  const insufficient = paid > 0 && paid < total;`;
    const replacement = `${anchor}${NL}  const selectedCustomer = customers.find((c) => c.id === customerId);${NL}  const khataBalance = selectedCustomer ? Number(selectedCustomer.balance) || 0 : 0;`;
    if (!source.includes(anchor)) throw new Error(`[khata-due] Quick Sale totals anchor not found in ${rel}`);
    source = source.replace(anchor, replacement);
    changed = true;
  }

  if (!source.includes('return Array.from(new Set([...configured, "khata"]));')) {
    const oldText = '    if (enabledMethods && enabledMethods.length > 0) return all.filter((m) => enabledMethods.includes(m));\n    return all;';
    const newText = '    const configured = enabledMethods && enabledMethods.length > 0 ? all.filter((m) => enabledMethods.includes(m)) : all;\n    return Array.from(new Set([...configured, "khata"]));';
    if (!source.includes(oldText)) throw new Error(`[khata-due] Quick Sale methodList not found in ${rel}`);
    source = source.replace(oldText, newText);
    changed = true;
  }

  if (!source.includes('setPayments([{ instrument_id: "", method: "khata", amount: "0" }]);')) {
    const oldText = '  function quickMethod(m: string) {\n    const types = METHOD_ACCOUNT_TYPES[m] ?? [m];';
    const newText = '  function quickMethod(m: string) {\n    if (m === "khata") {\n      setPayments([{ instrument_id: "", method: "khata", amount: "0" }]);\n      return;\n    }\n    const types = METHOD_ACCOUNT_TYPES[m] ?? [m];';
    if (!source.includes(oldText)) throw new Error(`[khata-due] Quick Sale quickMethod not found in ${rel}`);
    source = source.replace(oldText, newText);
    changed = true;
  }

  if (!source.includes('const khataOnly = activeMethod === "khata";')) {
    const oldText = '    if (paid <= 0) {\n      setError("Enter the amount received.");\n      return;\n    }';
    const newText = '    const khataOnly = activeMethod === "khata";\n    if (paid <= 0 && !khataOnly) {\n      setError("Enter the amount received.");\n      return;\n    }\n    if (khataOnly && !customerId) {\n      setError("Select a customer to post this sale to Khata / Due.");\n      return;\n    }';
    if (!source.includes(oldText)) throw new Error(`[khata-due] Quick Sale record validation not found in ${rel}`);
    source = source.replace(oldText, newText);
    changed = true;
  }

  if (!source.includes('if (activeMethod === "khata") return;')) {
    const oldText = '  function fillExact() {\n    setPayments((prev) => {';
    const newText = '  function fillExact() {\n    if (activeMethod === "khata") return;\n    setPayments((prev) => {';
    if (!source.includes(oldText)) throw new Error(`[khata-due] Quick Sale fillExact not found in ${rel}`);
    source = source.replace(oldText, newText);
    changed = true;
  }

  if (!source.includes("/* KHATA_DUE_PAYMENT_ROW_V2 */")) {
    const paymentMarker = `                <div className=\"space-y-2\">\n                  {payments.map((p, i) => (`;
    const paymentStart = source.indexOf(paymentMarker);
    if (paymentStart === -1) throw new Error(`[khata-due] Quick Sale payment block not found in ${rel}`);
    const endAnchor = `                </div>\n\n                <div className=\"mt-2 flex items-center justify-between gap-2\">`;
    const paymentEnd = source.indexOf(endAnchor, paymentStart);
    if (paymentEnd === -1) throw new Error(`[khata-due] Quick Sale payment block end not found in ${rel}`);
    const replacement = [
      `                {/* KHATA_DUE_PAYMENT_ROW_V2 */}`,
      `                <div className=\"space-y-2\">`,
      `                  {payments.map((p, i) => (`,
      `                    <div key={i} className=\"flex items-center gap-2\">`,
      `                      {p.method === \"khata\" ? (`,
      `                        <div className=\"flex w-full items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/30\">`,
      `                          <div>`,
      `                            <p className=\"text-xs font-black text-amber-900 dark:text-amber-200\">Khata / Due</p>`,
      `                            <p className=\"text-[10px] font-semibold text-amber-700 dark:text-amber-300\">No payment collected now · added to customer ledger</p>`,
      `                          </div>`,
      `                          <span className=\"rounded-lg bg-white px-2 py-1 text-[10px] font-black text-amber-700 ring-1 ring-amber-200 dark:bg-slate-900 dark:text-amber-300 dark:ring-amber-900/50\">0 received</span>`,
      `                        </div>`,
      `                      ) : (`,
      `                        <>`,
      `                          <InstrumentSelect`,
      `                            instruments={instrumentList}`,
      `                            pick={p}`,
      `                            onChange={(pick) => setPaymentInstrument(i, pick)}`,
      `                            enabled={accountFilter}`,
      `                            className=\"w-36 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-500\"`,
      `                          />`,
      `                          <input`,
      `                            ref={payments.length === 1 ? payRef : undefined}`,
      `                            type=\"number\"`,
      `                            min=\"0\"`,
      `                            step=\"0.01\"`,
      `                            value={p.amount}`,
      `                            onChange={(e) => setPaymentAmount(i, e.target.value)}`,
      `                            placeholder={payments.length === 1 ? \"Amount received\" : \"Amount\"}`, 
      `                            className=\"w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500\"`,
      `                          />`,
      `                          {payments.length > 1 && (`,
      `                            <button`,
      `                              onClick={() => setPayments((prev) => prev.filter((_, j) => j !== i))}`, 
      `                              className=\"text-xs text-slate-400 hover:text-rose-600\"`,
      `                            >`,
      `                              ✕`,
      `                            </button>`,
      `                          )}`,
      `                        </>`,
      `                      )}`,
      `                    </div>`,
      `                  ))}`,
      `                </div>`,
      "",
    ].join(NL);
    source = source.slice(0, paymentStart) + replacement + source.slice(paymentEnd + endAnchor.length);

    const infoMarker = `                {/* KHATA_DUE_PAYMENT_ROW_V2 */}`;
    const infoIndex = source.indexOf(infoMarker);
    if (infoIndex === -1) throw new Error(`[khata-due] Quick Sale info marker not found in ${rel}`);
    const info = [
      `                {/* KHATA_DUE_INFO_V2 */}`,
      `                {activeMethod === \"khata\" && (`,
      `                  <div className=\"mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900/50 dark:bg-amber-950/30\">`,
      `                    {selectedCustomer ? (`,
      `                      <div className=\"flex items-center justify-between gap-3\">`,
      `                        <div className=\"min-w-0\">`,
      `                          <p className=\"truncate text-xs font-black text-amber-900 dark:text-amber-200\">Customer Khata · {selectedCustomer.name}</p>`,
      `                          <p className=\"mt-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300\">Current balance {inr(khataBalance)} · New due {inr(due)} · After sale {inr(khataBalance + due)}</p>`,
      `                        </div>`,
      `                        <span className=\"shrink-0 rounded-full bg-amber-600 px-2 py-1 text-[10px] font-black text-white\">DUE</span>`,
      `                      </div>`,
      `                    ) : (`,
      `                      <p className=\"text-xs font-bold text-amber-800 dark:text-amber-200\">Select a customer above before using Khata / Due.</p>`,
      `                    )}`,
      `                  </div>`,
      `                )}`,
      "",
    ].join(NL);
    source = source.slice(0, infoIndex) + info + source.slice(infoIndex);
    changed = true;
  }

  if (changed) write(rel, source);
  return changed;
}

const changed = [patchItemBrowser(), patchPosClient(), patchQuickSale()].some(Boolean);
console.log(changed ? "repair-pos-khata-due-build-v2: applied" : "repair-pos-khata-due-build-v2: already applied");
