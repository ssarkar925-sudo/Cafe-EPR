import fs from "node:fs";

const path = "components/business/upi-workspace.tsx";
let source = fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const metricsOld = `        if (t.fee_source === "customer_paid_extra") {\n          totalCashOut += amt;\n        } else {\n          totalCashOut += Math.max(0, amt - fee);\n        }`;
const metricsNew = `        // The linked cashbook leg is authoritative for actual cash handed out.\n        // Older UPI rows can have fee_source=\"cut_from_withdrawal\" even when the\n        // persisted cash payout was the full transaction amount (with the fee\n        // collected separately). Prefer the recorded cash_out value over inference.\n        const recordedCashOut = Number((t as any).cash_out) || 0;\n        if (recordedCashOut > 0) {\n          totalCashOut += recordedCashOut;\n        } else if (t.fee_source === "customer_paid_extra") {\n          totalCashOut += amt;\n        } else {\n          totalCashOut += Math.max(0, amt - fee);\n        }`;

if (source.includes(metricsOld) && !source.includes("const recordedCashOut = Number((t as any).cash_out) || 0;")) {
  source = source.replace(metricsOld, metricsNew);
}

const csvOld = `      Number(t.fee_source === "customer_paid_extra" ? t.amount : Math.max(0, Number(t.amount) - Number(t.service_fee || 0))),`;
const csvNew = `      Number((t as any).cash_out) > 0\n        ? Number((t as any).cash_out)\n        : Number(t.fee_source === "customer_paid_extra" ? t.amount : Math.max(0, Number(t.amount) - Number(t.service_fee || 0))),`;
if (source.includes(csvOld) && !source.includes("Number((t as any).cash_out) > 0")) {
  source = source.replace(csvOld, csvNew);
}

fs.writeFileSync(path, source);
console.log("UPI display repair applied: actual recorded cash-out legs are used for dashboard totals and CSV export.");
