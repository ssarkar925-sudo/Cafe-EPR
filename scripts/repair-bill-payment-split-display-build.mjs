import fs from "node:fs";

const path = "components/business/bill-payment-hub.tsx";
let source = fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const helperMarker = "function getCustomerPaymentAllocationsForEdit";
if (!source.includes(helperMarker)) {
  const marker = "function fmtDate(d?: string | null) {";
  const helper = `function getCustomerPaymentAllocationsForEdit(txn: Txn | null): Array<{ method: string; amount: number; instrument_id?: string | null }> {\n  const raw = (txn as any)?.customer_payment_allocations;\n  if (!Array.isArray(raw)) return [];\n  return raw\n    .filter((item: any) => Number(item?.amount) > 0)\n    .map((item: any) => ({\n      method: String(item?.method || "cash"),\n      amount: Number(item?.amount || 0),\n      instrument_id: item?.instrument_id || null,\n    }));\n}\n\n`;
  if (!source.includes(marker)) throw new Error("Bill payment helper insertion marker not found");
  source = source.replace(marker, helper + marker);
}

const derivedMarker = "  const editCustomerPaymentAllocations = useMemo(() => getCustomerPaymentAllocationsForEdit(editTxn), [editTxn]);";
if (!source.includes(derivedMarker)) {
  const marker = "  // Populate Complete Edit Form when a transaction is opened for editing";
  const injected = `  const editCustomerPaymentAllocations = useMemo(() => getCustomerPaymentAllocationsForEdit(editTxn), [editTxn]);\n  const hasEditCustomerSplit = editCustomerPaymentAllocations.length > 1;\n  const editCustomerCollectedTotal = editCustomerPaymentAllocations.reduce((sum, item) => sum + Number(item.amount || 0), 0);\n  const viewCustomerPaymentAllocations = useMemo(() => getCustomerPaymentAllocationsForEdit(viewTxn), [viewTxn]);\n  const hasViewCustomerSplit = viewCustomerPaymentAllocations.length > 1;\n  const viewCustomerCollectedTotal = viewCustomerPaymentAllocations.reduce((sum, item) => sum + Number(item.amount || 0), 0);\n\n${marker}`;
  if (!source.includes(marker)) throw new Error("Bill payment derived-state marker not found");
  source = source.replace(marker, injected);
}

const rowMarker = "                      const netMargin = fee + comm;";
if (!source.includes("const rowPaymentAllocations = getCustomerPaymentAllocationsForEdit(t);") && source.includes(rowMarker)) {
  source = source.replace(rowMarker, `${rowMarker}\n                      const rowPaymentAllocations = getCustomerPaymentAllocationsForEdit(t);`);
}

const editCustomerStart = "                  <select\n                    value={editPayMethod}";
if (!source.includes("This transaction has split customer collection") && source.includes(editCustomerStart)) {
  const start = source.indexOf(editCustomerStart);
  const endMarker = "                </div>\n\n                {/* Zone 2: Shop Funding Account */}";
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error("Bill payment edit payment-zone end marker not found");
  const replacement = `                  {hasEditCustomerSplit ? (\n                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-500/30 dark:bg-blue-950/20">\n                      <div className="flex items-center justify-between text-xs font-black uppercase tracking-wide text-blue-700 dark:text-blue-300">\n                        <span>Split Customer Collection</span>\n                        <span>{inr(editCustomerCollectedTotal)}</span>\n                      </div>\n                      <div className="mt-2 space-y-2">\n                        {editCustomerPaymentAllocations.map((item, index) => {\n                          const instrument = activeInstruments.find((a) => a.id === item.instrument_id);\n                          const method = item.method.replace(/_/g, " ").toUpperCase();\n                          return (\n                            <div key={\`${item.instrument_id || item.method}-${index}\`} className="flex items-center justify-between rounded-lg border border-blue-100 bg-white px-3 py-2 dark:border-white/10 dark:bg-slate-900">\n                              <div>\n                                <div className="text-sm font-bold text-slate-800 dark:text-white">{instrument?.name || method}</div>\n                                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{method}</div>\n                              </div>\n                              <div className="text-sm font-black text-slate-900 dark:text-white">{inr(item.amount)}</div>\n                            </div>\n                          );\n                        })}\n                      </div>\n                      <div className="mt-2 border-t border-blue-200 pt-2 text-[10px] font-semibold text-blue-700 dark:border-blue-500/30 dark:text-blue-300">\n                        Exact collection is preserved during reconciliation.\n                      </div>\n                    </div>\n                  ) : (\n                    <>\n                      <select\n                        value={editPayMethod}\n                        onChange={(e) => setEditPayMethod(e.target.value)}\n                        className="w-full rounded-xl border border-slate-200 bg-white p-2.5 font-semibold uppercase dark:border-white/10 dark:bg-slate-800 dark:text-white"\n                      >\n                        <option value="cash">💵 Cash Collection</option>\n                        <option value="upi">📱 UPI / QR Scan</option>\n                        <option value="bank">🏦 Bank Transfer</option>\n                        <option value="wallet">👛 Wallet Balance</option>\n                        <option value="credit_card">💳 Credit Card</option>\n                        <option value="due">📒 Khata (Customer Due)</option>\n                      </select>\n                      <span className="block text-[10px] text-slate-500">\n                        Collected: <strong>{inr((Number(editAmount) || 0) + (Number(editServiceFee) || 0))}</strong>\n                      </span>\n                    </>\n                  )}`;
  source = source.slice(0, start) + replacement + source.slice(end);
}

const viewCustomerStart = "                <div className=\"flex justify-between\">\n                  <span>Customer Collection:</span>";
if (!source.includes("hasViewCustomerSplit ?") && source.includes(viewCustomerStart)) {
  const start = source.indexOf(viewCustomerStart);
  const endMarker = "                <div className=\"flex justify-between\">\n                  <span>Provider Float Debit:</span>";
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error("Bill payment view collection end marker not found");
  const replacement = `                <div className="flex justify-between gap-4">\n                  <span>Customer Collection:</span>\n                  {hasViewCustomerSplit ? (\n                    <div className="text-right font-bold">\n                      <span className="block">SPLIT · {inr(viewCustomerCollectedTotal)}</span>\n                      <span className="block text-[11px] font-semibold text-slate-500">\n                        {viewCustomerPaymentAllocations.map((item) => `${inr(item.amount)} ${item.method.replace(/_/g, " ").toUpperCase()}`).join(" + ")}\n                      </span>\n                    </div>\n                  ) : (\n                    <span className="font-bold">\n                      {inr((Number(viewTxn.amount) || 0) + (Number(viewTxn.service_fee) || 0))} via {\n                        (viewTxn.customer_pay_method || "Cash").toUpperCase()\n                      }\n                    </span>\n                  )}\n                </div>\n`;
  source = source.slice(0, start) + replacement + source.slice(end);
}

const paymentCellExpr = "{t.customer_pay_method || \"CASH\"}";
if (!source.includes("rowPaymentAllocations.length > 1") && source.includes(paymentCellExpr)) {
  const exprPos = source.indexOf(paymentCellExpr);
  const tdStart = source.lastIndexOf('<td className="px-4 py-3.5 whitespace-nowrap">', exprPos);
  const tdEnd = source.indexOf("</td>", exprPos);
  if (tdStart < 0 || tdEnd < 0) throw new Error("Bill payment history payment cell not found");
  const replacement = `<td className="px-4 py-3.5 whitespace-nowrap">\n                            <span className="inline-flex rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700 dark:bg-white/10 dark:text-slate-300">\n                              {rowPaymentAllocations.length > 1 ? `SPLIT (${rowPaymentAllocations.length})` : (t.customer_pay_method || "CASH")}\n                            </span>\n                            {rowPaymentAllocations.length > 1 && (\n                              <span className="mt-1 block text-[9px] font-semibold text-slate-400">\n                                {rowPaymentAllocations.map((item) => `${inr(item.amount)} ${item.method.replace(/_/g, " ").toUpperCase()}`).join(" + ")}\n                              </span>\n                            )}\n                          </td>`;
  source = source.slice(0, tdStart) + replacement + source.slice(tdEnd + 5);
}

fs.writeFileSync(path, source);
console.log("Bill payment split display repair applied: history and reconciliation show exact customer payment allocations.");
