import fs from "node:fs";

const path = "components/business/dmt-workspace.tsx";
let source = fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const validation = /  \/\/ (?:Strict Form Validation Guard|Form Validation Guard: beneficiary bank\/account\/IFSC\/UPI are optional)[\s\S]*?\n  \/\/ Current Active Lifecycle Step/;
const replacement = `  // Form Validation Guard: beneficiary bank/account/IFSC/UPI are optional.\n  // Amount, reference and settlement routing remain required.\n  const isFormValid = useMemo(() => {\n    if (numAmount <= 0) return false;\n    if (numCharge < 0 || numFee < 0 || numComm < 0) return false;\n    if (!reference.trim() || reference.trim().length < 6) return false;\n    if (senderMobile.trim() && senderMobile.trim().replace(/\\\\D/g, "").length !== 10) return false;\n    if (paidFrom === "portal" && !selectedPortalId) return false;\n    if (paidFrom === "bank" && !selectedBankInstrumentId) return false;\n    if (customerPayMethod === "due" && !selectedCustomerId) return false;\n    if (customerDueAmount > 0 && !selectedCustomerId) return false;\n    return true;\n  }, [\n    numAmount,\n    numCharge,\n    numFee,\n    numComm,\n    reference,\n    senderMobile,\n    paidFrom,\n    selectedPortalId,\n    selectedBankInstrumentId,\n    customerPayMethod,\n    customerDueAmount,\n    selectedCustomerId,\n  ]);\n\n  // Current Active Lifecycle Step`;

if (validation.test(source)) {
  source = source.replace(validation, replacement);
}

const step = /  const currentStep = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[selectedCustomerId, senderName, senderMobile, transferMethod, beneficiaryAccount, beneficiaryBank, beneficiaryIfsc, upiId, numAmount\]\);/;
const stepReplacement = `  const currentStep = useMemo(() => {\n    if (!selectedCustomerId && !senderName.trim() && !senderMobile.trim()) return 1;\n    if (numAmount <= 0) return 4;\n    return 5;\n  }, [selectedCustomerId, senderName, senderMobile, numAmount]);`;
if (step.test(source)) {
  source = source.replace(step, stepReplacement);
}

const exactReplacements = [
  ["Beneficiary Bank <span className=\"text-rose-500\">*</span>", "Beneficiary Bank"],
  ["Account Number <span className=\"text-rose-500\">*</span>", "Account Number"],
  ["Bank IFSC Code <span className=\"text-rose-500\">*</span>", "Bank IFSC Code"],
  ["Beneficiary UPI ID (VPA) <span className=\"text-rose-500\">*</span>", "Beneficiary UPI ID (VPA)"],
];
for (const [from, to] of exactReplacements) source = source.replace(from, to);

source = source.replace(/(value=\{beneficiaryAccount\}[\s\S]*?placeholder=\"Enter account number\")/m, (block) => block.replace(/required\s*/g, ""));
source = source.replace(/(value=\{beneficiaryIfsc\}[\s\S]*?placeholder=\"e\.g\. SBIN0001234\")/m, (block) => block.replace(/required\s*/g, ""));
source = source.replace(/(value=\{upiId\}[\s\S]*?placeholder=\"e\.g\. username@oksbi or 9876543210@paytm\")/m, (block) => block.replace(/required\s*/g, ""));

// The database canonical multi-collection RPC accepts the 31-argument contract only.
// Strip legacy customer_* arguments and send the collection split through JSONB allocations.
const rpcStart = '      const res = await supabase.rpc("create_dmt_business_txn_multi_collection", {';
const rpcEnd = '      if (res.error) throw res.error;';
const rpcStartAt = source.indexOf(rpcStart);
const rpcEndAt = source.indexOf(rpcEnd, rpcStartAt);
if (rpcStartAt >= 0 && rpcEndAt > rpcStartAt) {
  const rpcReplacement = `      const baseAllocations = customerPaymentAllocations\n        .filter((row) => Number(row.amount) > 0)\n        .map((row) => ({ method: row.method, amount: Number(row.amount) }));\n      const allocations = baseAllocations.length > 0\n        ? baseAllocations\n        : customerCollectionAmount > 0 && customerPayMethod !== "due"\n          ? [{ method: customerPayMethod, amount: Number(customerCollectionAmount) }]\n          : [];\n\n      const res = await supabase.rpc("create_dmt_business_txn_multi_collection", {\n        p_service_type: "dmt",\n        p_transaction_date: dateStr,\n        p_transaction_timestamp: nowIso,\n        p_customer_id: selectedCustomerId || null,\n        p_customer_mobile: senderMobile.trim() || null,\n        p_reference: reference.trim(),\n        p_remarks: remarks.trim() || null,\n        p_status: "success",\n        p_bank_id: matchedBeneficiaryBank?.id || null,\n        p_portal_id: paidFrom === "portal" ? selectedPortalId : null,\n        p_merchant_qr_id: null,\n        p_aadhaar_last4: null,\n        p_transfer_method: transferMethod,\n        p_sender_name: senderName.trim() || "Walk-in Sender",\n        p_sender_mobile: senderMobile.trim() || null,\n        p_beneficiary_name: beneficiaryName.trim() || null,\n        p_beneficiary_mobile: beneficiaryMobile.trim() || null,\n        p_beneficiary_bank: beneficiaryBank.trim() || null,\n        p_beneficiary_ifsc: beneficiaryIfsc.trim().toUpperCase() || null,\n        p_beneficiary_account: beneficiaryAccount.trim() || null,\n        p_upi_id: transferMethod === "upi" ? upiId.trim() : null,\n        p_amount: numAmount,\n        p_service_fee: numFee,\n        p_portal_commission: numComm,\n        p_fee_source: null,\n        p_paid_from: paidFrom,\n        p_pay_from_instrument_id: paidFrom === "bank" ? selectedBankInstrumentId || null : null,\n        p_pay_from_method: paidFrom,\n        p_receiver_name: receiverName.trim() || null,\n        p_portal_charge: numCharge,\n        p_customer_collection_allocations: allocations,\n      });\n\n      if (res.error) throw res.error;`;
  const rpcEndAfter = rpcEndAt + rpcEnd.length;
  source = source.slice(0, rpcStartAt) + rpcReplacement + source.slice(rpcEndAfter);
}

fs.writeFileSync(path, source);

const enhancerPath = "components/business/dmt-self-beneficiary-enhancer.tsx";
let enhancer = fs.readFileSync(enhancerPath, "utf8");
enhancer = enhancer.replace(
  "observer.observe(document.body, { subtree: true, childList: true, characterData: true });",
  "observer.observe(document.body, { subtree: true, childList: true });"
);
fs.writeFileSync(enhancerPath, enhancer);

console.log("DMT build repair applied: canonical multi-collection RPC payload and optional beneficiary fields enforced.");
