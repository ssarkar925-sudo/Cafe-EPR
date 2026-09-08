import fs from "node:fs";

const path = "components/finance/reconciliation-client.tsx";
let source = fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const refreshSelect = 'supabase.from("cash_entries").select("id, instrument_id, direction, amount, created_at, description, method, ref_type").not("instrument_id", "is", null)';
const refreshSelectFixed = 'supabase.from("cash_entries").select("id, instrument_id, direction, amount, created_at, description, method, ref_type, ref_id, entry_date").not("instrument_id", "is", null)';
if (source.includes(refreshSelect) && !source.includes(refreshSelectFixed)) {
  source = source.replace(refreshSelect, refreshSelectFixed);
}

const txBlockMarker = '        for (const t of transactions) {\n          const pCredit = Number(t.pool_credit) || 0;\n          const pOut = Number(t.pool_out) || 0;\n          const uFee = Number(t.upi_fee) || 0;\n          let used = false;';
const txBlockReplacement = `        for (const t of transactions) {
          const pCredit = Number(t.pool_credit) || 0;
          const pOut = Number(t.pool_out) || 0;
          const uFee = Number(t.upi_fee) || 0;
          let used = false;

          // UPI Cash Out transactions can have pool_out=0 in the transaction row,
          // while the authoritative cash payout is posted to cash_entries against
          // the same transaction. Reconcile that linked cash leg as a UPI outflow.
          const linkedCashOut = cashEntries
            .filter((e) => e.ref_type === "transaction" && e.ref_id === t.id)
            .filter((e) => {
              if (e.direction !== "out") return false;
              const inst = e.instrument_id ? instruments.find((i) => i.id === e.instrument_id) : undefined;
              return (getPoolForInstrumentType(inst?.type) ?? getPoolForMethod(e.method)) === "cash";
            })
            .reduce((sum, e) => sum + Number(e.amount || 0), 0);
          const inferredCashOut = t.service_type === "upi" && pOut <= 0 ? linkedCashOut : 0;`;

if (!source.includes("const inferredCashOut = t.service_type === \"upi\"")) {
  if (!source.includes(txBlockMarker)) throw new Error("UPI reconciliation transaction block marker not found");
  source = source.replace(txBlockMarker, txBlockReplacement);
}

const outflowMarker = `          if (pOut > 0 && (t.pool_credit_type === "upi_qr" || t.service_type === "upi")) {\n            debits += pOut;\n            used = true;\n            txList.push({\n              id: t.id,\n              number: t.transaction_number || "TXN",\n              type: "Outflow",\n              amount: -pOut,\n              date: t.created_at,\n              desc: "UPI payout / settlement",\n            });\n          }\n\n`;
const outflowReplacement = outflowMarker + `          if (inferredCashOut > 0) {\n            debits += inferredCashOut;\n            used = true;\n            txList.push({\n              id: t.id + "-cashout",\n              number: t.transaction_number || "TXN",\n              type: "Cash Out",\n              amount: -inferredCashOut,\n              date: t.created_at,\n              desc: "Customer cash disbursement linked to UPI receipt",\n            });\n          }\n\n`;
if (!source.includes('type: "Cash Out"') && source.includes(outflowMarker)) {
  source = source.replace(outflowMarker, outflowReplacement);
}

const feeMarker = '          if (uFee > 0 || (t.fee_source === "upi" && Number(t.service_fee) > 0)) {';
const feeReplacement = '          if (uFee > 0 || (t.service_type === "upi" && Number(t.service_fee) > 0) || (t.fee_source === "upi" && Number(t.service_fee) > 0)) {';
if (source.includes(feeMarker) && !source.includes('t.service_type === "upi" && Number(t.service_fee) > 0')) {
  source = source.replace(feeMarker, feeReplacement);
}

fs.writeFileSync(path, source);
console.log("UPI reconciliation repair applied: linked cash-out legs and UPI service fees are included in UPI pool reconciliation.");
