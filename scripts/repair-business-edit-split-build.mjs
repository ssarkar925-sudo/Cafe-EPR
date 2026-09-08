import fs from "node:fs";

const path = "components/business/business-form-modal.tsx";
let source = fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const splitMarker = "const hasSplitCustomerCollection = customerPaymentAllocations.length > 1;";
const selectedCustomerMarker = "  const selectedCustomer = customers.find((c) => c.id === form.customer_id);";
if (!source.includes(splitMarker) && source.includes(selectedCustomerMarker)) {
  const injected = `  const customerPaymentAllocations = Array.isArray((initial as any)?.customer_payment_allocations)\n    ? (initial as any).customer_payment_allocations.filter((x: any) => Number(x?.amount) > 0)\n    : [];\n  const hasSplitCustomerCollection = customerPaymentAllocations.length > 1;\n\n${selectedCustomerMarker}`;
  source = source.replace(selectedCustomerMarker, injected);
}

if (!source.includes("Split Customer Collection") && source.includes("value={form.customer_pay_method}")) {
  const valuePos = source.indexOf("value={form.customer_pay_method}");
  const componentStart = source.lastIndexOf("<SearchableSelect", valuePos);
  let componentEnd = source.indexOf("/>", valuePos);
  if (componentStart >= 0 && componentEnd >= 0 && componentEnd > componentStart) {
    componentEnd += 2;
    const original = source.slice(componentStart, componentEnd);
    const replacement = `{hasSplitCustomerCollection ? (\n      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">\n        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-blue-700">\n          <span>Split Customer Collection</span>\n          <span>{inr(customerPaymentAllocations.reduce((s: number, x: any) => s + Number(x.amount || 0), 0))}</span>\n        </div>\n        <div className="mt-2 space-y-2">\n          {customerPaymentAllocations.map((item: any, index: number) => {\n            const instrument = loadedPaymentAccounts.find((a: any) => a.id === item.instrument_id);\n            const method = String(item.method || "payment").replace(/_/g, " ").toUpperCase();\n            return (\n              <div key={\`${item.instrument_id || item.method || "payment"}-${index}\`} className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-3 py-2">\n                <div>\n                  <div className="text-sm font-semibold text-slate-800">{instrument?.name || method}</div>\n                  <div className="text-[11px] uppercase tracking-wide text-slate-500">{method}</div>\n                </div>\n                <div className="text-sm font-bold text-slate-900">{inr(Number(item.amount || 0))}</div>\n              </div>\n            );\n          })}\n        </div>\n        <div className="mt-2 flex items-center justify-between border-t border-blue-200 pt-2 text-sm font-semibold text-slate-800">\n          <span>Customer collected</span>\n          <span>{inr(customerPaymentAllocations.reduce((s: number, x: any) => s + Number(x.amount || 0), 0))}</span>\n        </div>\n      </div>\n    ) : (\n      ${original}\n    )}`;
    source = source.slice(0, componentStart) + replacement + source.slice(componentEnd);
  } else {
    throw new Error("Could not locate customer payment selector for split-collection display repair");
  }
}

if (!source.includes("Split collection amount cannot be changed here") && source.includes("async function submit()")) {
  const submitMarker = "  async function submit() {";
  const guard = `  async function submit() {\n    const existingSplit = Array.isArray((initial as any)?.customer_payment_allocations)\n      ? (initial as any).customer_payment_allocations.filter((x: any) => Number(x?.amount) > 0)\n      : [];\n    if (initial && existingSplit.length > 1) {\n      const originalCollected = existingSplit.reduce((sum: number, x: any) => sum + Number(x?.amount || 0), 0);\n      const requestedCollected = Number(form.amount || 0) + Number(form.service_fee || 0);\n      if (Math.abs(originalCollected - requestedCollected) > 0.005 && form.status === "success") {\n        return setError("Split collection amount cannot be changed here. Open the payment collection editor to change Cash / UPI / Card allocations.");\n      }\n    }`;
  source = source.replace(submitMarker, guard);
}

fs.writeFileSync(path, source);
console.log("Business edit split repair applied: show exact customer payment allocations and protect them during reconciliation.");
