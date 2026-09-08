import fs from "node:fs";

const path = "components/business/upi-workspace.tsx";
let source = fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

// The database now treats merchant_qr_id as the source of truth for UPI funding.
// Pass the same QR-linked instrument explicitly from the UI as well, so the client
// and server use one deterministic account for collection/reconciliation.
const old = `        p_pay_from_instrument_id: null,\n        p_pay_from_method: null,`;
const replacement = `        p_pay_from_instrument_id: qrs.find((q) => q.id === formQrId)?.payment_instrument_id || null,\n        p_pay_from_method: liveInstruments.find((i) => i.id === (qrs.find((q) => q.id === formQrId)?.payment_instrument_id || \"\"))?.type || \"upi_qr\",`;

if (source.includes(old) && !source.includes("qrs.find((q) => q.id === formQrId)?.payment_instrument_id")) {
  source = source.replace(old, replacement);
}

fs.writeFileSync(path, source);
console.log("UPI UI repair applied: selected Merchant QR now supplies its linked payment instrument to the server.");
