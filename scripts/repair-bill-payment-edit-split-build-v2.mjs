import fs from "node:fs";

const path = "components/business/bill-payment-hub.tsx";
let source = fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

function replaceOnce(needle, replacement, label) {
  if (!source.includes(needle)) throw new Error(`Bill payment split edit patch anchor not found: ${label}`);
  source = source.replace(needle, replacement);
}

if (!source.includes("from \"@/components/business/multi-payment-collection\"")) {
  replaceOnce(
    'import CommissionEditModal from "@/components/business/commission-edit-modal";\n',
    'import CommissionEditModal from "@/components/business/commission-edit-modal";\nimport MultiPaymentCollection, { type PaymentAllocation } from "@/components/business/multi-payment-collection";\n',
    "MultiPaymentCollection import"
  );
}

const helperMarker = 'function fmtDate(d?: string | null) {';
if (!source.includes("function normalizeEditPaymentAllocations")) {
  const helper = `function normalizeEditPaymentAllocations(txn: Txn | null): PaymentAllocation[] {\n  if (!txn) return [];\n  const raw = Array.isArray((txn as any).customer_payment_allocations)\n    ? (txn as any).customer_payment_allocations\n    : [];\n  const mapped = raw\n    .filter((item: any) => Number(item?.amount) > 0)\n    .map((item: any) => {\n      const rawMethod = String(item?.method || "cash").toLowerCase();\n      const method = rawMethod === "credit_card" || rawMethod === "debit_card" ? "card" : rawMethod === "qr" || rawMethod === "upi_qr" ? "upi" : rawMethod;\n      return {\n        method: ["cash", "upi", "bank", "wallet", "card"].includes(method) ? method : "cash",\n        amount: Number(item?.amount || 0).toFixed(2),\n        instrument_id: item?.instrument_id || null,\n      } as PaymentAllocation;\n    });\n  if (mapped.length > 0) return mapped;\n\n  const total = Math.max(0, Number(txn.amount || 0) + Number(txn.service_fee || 0));\n  const due = Math.max(0, Number((txn as any).customer_due_amount || 0));\n  if (String(txn.customer_pay_method || "").toLowerCase() === "due" && due >= total - 0.005) return [];\n  if (total <= 0) return [];\n\n  const methodRaw = String(txn.customer_pay_method || "cash").toLowerCase();\n  const method = methodRaw === "credit_card" || methodRaw === "debit_card" ? "card" : methodRaw === "qr" || methodRaw === "upi_qr" ? "upi" : methodRaw;\n  return [{\n    method: ["cash", "upi", "bank", "wallet", "card"].includes(method) ? method : "cash",\n    amount: total.toFixed(2),\n    instrument_id: (txn as any).customer_collection_instrument_id || null,\n  }];\n}\n\n`;
  replaceOnce(helperMarker, helper + helperMarker, "allocation helper");
}

if (!source.includes("const [editPaymentAllocations")) {
  replaceOnce(
    '  const [editPayMethod, setEditPayMethod] = useState<string>("cash");\n',
    '  const [editPayMethod, setEditPayMethod] = useState<string>("cash");\n  const [editPaymentAllocations, setEditPaymentAllocations] = useState<PaymentAllocation[]>([]);\n',
    "allocation state"
  );
}

const populateMarker = '      setEditPayMethod(editTxn.customer_pay_method || "cash");\n';
if (!source.includes("setEditPaymentAllocations(normalizeEditPaymentAllocations(editTxn));")) {
  replaceOnce(
    populateMarker,
    populateMarker + '      setEditPaymentAllocations(normalizeEditPaymentAllocations(editTxn));\n',
    "allocation hydration"
  );
}

const saveAmountMarker = '      const parsedProviderCost = Math.max(0, parsedAmount - parsedComm);\n      const totalCustomerPaid = parsedAmount + parsedFee;\n';
if (!source.includes("const allocationsForSave =")) {
  const replacement = `      const parsedProviderCost = Math.max(0, parsedAmount - parsedComm);\n      const totalCustomerPaid = parsedAmount + parsedFee;\n      const allocationsForSave = editPayMethod === "due"\n        ? []\n        : (editPaymentAllocations.length > 0 ? editPaymentAllocations : normalizeEditPaymentAllocations(editTxn));\n      const collectedFromAllocations = allocationsForSave.reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0);\n      if (editStatus === "success") {\n        if (editPayMethod !== "due" && allocationsForSave.length === 0) {\n          showToast("error", "Add at least one customer payment method or choose Khata Due.");\n          return;\n        }\n        if (editPayMethod !== "due" && Math.abs(collectedFromAllocations - totalCustomerPaid) > 0.005) {\n          const remaining = Math.max(0, totalCustomerPaid - collectedFromAllocations);\n          showToast("error", \`Customer split must total \${totalCustomerPaid.toFixed(2)}. Remaining ₹\${remaining.toFixed(2)}.\`);\n          setEditValidationErr(\`Customer payment split totals \${collectedFromAllocations.toFixed(2)}, but the customer total is \${totalCustomerPaid.toFixed(2)}.\`);\n          return;\n        }\n      }\n`;
  replaceOnce(saveAmountMarker, replacement, "allocation validation");
}

const rpcMarker = '      const { data: updatedTxnData, error: rpcErr } = await supabase.rpc("edit_bill_payment", {';
if (!source.includes('supabase.rpc("edit_bill_payment_with_allocations"')) {
  replaceOnce(
    rpcMarker,
    '      const { data: updatedTxnData, error: rpcErr } = await supabase.rpc("edit_bill_payment_with_allocations", {',
    "allocation RPC name"
  );
}

const rpcArgsMarker = '        p_customer_pay_method: editPayMethod,\n        p_funding_instrument_id: editFundingInstId || null,\n        p_status: editStatus,\n        p_remarks: editRemarks.trim() || null,\n      });';
if (!source.includes("p_customer_payment_allocations: allocationsForSave")) {
  replaceOnce(
    rpcArgsMarker,
    '        p_customer_pay_method: editPayMethod === "due" ? "due" : (allocationsForSave[0]?.method || editPayMethod),\n        p_funding_instrument_id: editFundingInstId || null,\n        p_status: editStatus,\n        p_remarks: editRemarks.trim() || null,\n        p_customer_payment_allocations: allocationsForSave,\n        p_idempotency_key: crypto.randomUUID(),\n      });',
    "allocation RPC arguments"
  );
}

const editCustomerStart = `                  <select\n                    value={editPayMethod}\n                    onChange={(e) => setEditPayMethod(e.target.value)}\n                    className="w-full rounded-xl border border-slate-200 bg-white p-2.5 font-semibold uppercase dark:border-white/10 dark:bg-slate-800 dark:text-white"\n                  >\n                    <option value="cash">💵 Cash Collection</option>\n                    <option value="upi">📱 UPI / QR Scan</option>\n                    <option value="bank">🏦 Bank Transfer</option>\n                    <option value="wallet">👛 Wallet Balance</option>\n                    <option value="credit_card">💳 Credit Card</option>\n                    <option value="due">📒 Khata (Customer Due)</option>\n                  </select>\n                  <span className="block text-[10px] text-slate-500">\n                    Collected: <strong>{inr((Number(editAmount) || 0) + (Number(editServiceFee) || 0))}</strong>\n                  </span>`;
if (!source.includes("Collection Mode") && source.includes(editCustomerStart)) {
  const replacement = `{/* Collection Mode: keep full Khata Due available while enabling multi-method collection. */}\n                  <div className="space-y-2">\n                    <label className="block text-xs font-bold text-blue-700 dark:text-blue-400">Customer Collection Mode</label>\n                    <select\n                      value={editPayMethod === "due" ? "due" : "split"}\n                      onChange={(e) => {\n                        if (e.target.value === "due") {\n                          setEditPayMethod("due");\n                        } else {\n                          const rows = editPaymentAllocations.length > 0\n                            ? editPaymentAllocations\n                            : normalizeEditPaymentAllocations(editTxn);\n                          const total = Math.max(0, Number(editAmount) || 0) + Math.max(0, Number(editServiceFee) || 0);\n                          const nextRows = rows.length > 0\n                            ? rows\n                            : [{ method: "cash" as PaymentAllocation["method"], amount: total.toFixed(2), instrument_id: null }];\n                          setEditPaymentAllocations(nextRows);\n                          setEditPayMethod(nextRows[0]?.method || "cash");\n                        }\n                      }}\n                      className="w-full rounded-xl border border-slate-200 bg-white p-2.5 font-semibold dark:border-white/10 dark:bg-slate-800 dark:text-white"\n                    >\n                      <option value="split">💳 Cash / UPI / Bank / Wallet / Card</option>\n                      <option value="due">📒 Full Amount on Khata Due</option>\n                    </select>\n                  </div>\n\n                  {editPayMethod === "due" ? (\n                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-300">\n                      The complete customer total of <strong>{inr((Number(editAmount) || 0) + (Number(editServiceFee) || 0))}</strong> will remain as Khata Due.\n                    </div>\n                  ) : (\n                    <MultiPaymentCollection\n                      key={editTxn.id}\n                      totalDue={(Number(editAmount) || 0) + (Number(editServiceFee) || 0)}\n                      mode="customer"\n                      initialMethod={(normalizeEditPaymentAllocations(editTxn)[0]?.method || "cash") as PaymentAllocation["method"]}\n                      initialAllocations={normalizeEditPaymentAllocations(editTxn)}\n                      onChange={(allocations) => {\n                        setEditPaymentAllocations(allocations);\n                        if (allocations[0]?.method) setEditPayMethod(allocations[0].method);\n                      }}\n                      disabled={editing}\n                    />\n                  )}`;
  source = source.replace(editCustomerStart, replacement);
}

fs.writeFileSync(path, source);
console.log("Bill payment edit split-payment UI and atomic reconciliation RPC patch applied.");
