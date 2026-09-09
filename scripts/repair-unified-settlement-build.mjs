import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SHARED_IMPORT = 'import UnifiedSettlementPanel from "@/components/business/unified-settlement-panel";';
const MARKER = "UNIFIED_SETTLEMENT_RENDER_V1";

function replaceBetweenMarkers(source, startNeedle, endNeedle, replacement, fileName) {
  const start = source.indexOf(startNeedle);
  if (start === -1) throw new Error(`[unified-settlement] start marker not found in ${fileName}: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start);
  if (end === -1) throw new Error(`[unified-settlement] end marker not found in ${fileName}: ${endNeedle}`);
  return source.slice(0, start) + replacement + source.slice(end);
}

function ensureImport(source) {
  if (source.includes(SHARED_IMPORT)) return source;
  const lines = source.split("\n");
  let lastImport = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].startsWith("import ")) lastImport = i;
  }
  if (lastImport === -1) return `${SHARED_IMPORT}\n${source}`;
  lines.splice(lastImport + 1, 0, SHARED_IMPORT);
  return lines.join("\n");
}

function transform(filePath, startNeedle, endNeedle, replacement) {
  const abs = path.join(ROOT, filePath);
  let source = fs.readFileSync(abs, "utf8");
  if (source.includes(MARKER)) return false;

  source = ensureImport(source);
  source = replaceBetweenMarkers(source, startNeedle, endNeedle, replacement, filePath);
  fs.writeFileSync(abs, source, "utf8");
  return true;
}

const gpReplacement = `      {/* ${MARKER} */}\n      <UnifiedSettlementPanel\n        serviceLabel="Google Play Recharge"\n        targetLabel="Customer Mobile"\n        targetValue={customerMobile ? \`+91 \${customerMobile}\` : "Enter mobile number"}\n        contextLabel="Region"\n        contextValue={activeRegion.name}\n        amountLabel="Recharge Denomination"\n        baseAmount={rechargeAmount}\n        customerFee={custFee}\n        customerTotal={totalCustomerDebit}\n        customerCollected={customerCollectionAmount}\n        customerDue={customerDueAmount}\n        customerPayMethod={customerPayMethod}\n        setCustomerPayMethod={setCustomerPayMethod}\n        partialPayment={partialPayment}\n        setPartialPayment={setPartialPayment}\n        customerPaidNow={customerPaidNow}\n        setCustomerPaidNow={setCustomerPaidNow}\n        customerPaymentAllocations={customerPaymentAllocations}\n        setCustomerPaymentAllocations={setCustomerPaymentAllocations}\n        customerPaymentAccount={instruments.find((i) => i.id === customerPayInstId) ?? null}\n        fundingInstId={fundingInstId}\n        setFundingInstId={setFundingInstId}\n        fundingInstruments={validFundingInstruments}\n        selectedFundingAccount={selectedFundingAccount}\n        providerCost={netProviderCost}\n        commission={commissionEarned}\n        commissionLabel={\`Margin \${commissionResolution.label}\`}\n        netProfit={netOperatorIncome}\n        onSubmit={handleCompleteRecharge}\n        submitting={submitting}\n        canSubmit={rechargeAmount > 0 && !!fundingInstId}\n        submitLabel="Complete Recharge"\n        validationHint="Customer collection, provider cost, funding debit and margin are reconciled before posting."\n      />\n\n`;

const rechargeReplacement = `      {/* ${MARKER} */}\n      <UnifiedSettlementPanel\n        serviceLabel={selectedOperatorCode ? \\`\${allOperators.find((o) => o.code === selectedOperatorCode)?.name || "Mobile"} Recharge\\` : "Mobile Recharge"}\n        targetLabel="Target Mobile"\n        targetValue={mobileNumber ? \`+91 \${mobileNumber}\` : "Enter mobile number"}\n        contextLabel="Circle"\n        contextValue={selectedCircle}\n        amountLabel="Recharge Amount"\n        baseAmount={rechargeAmount}\n        customerFee={custFee}\n        customerTotal={totalCustomerDebit}\n        customerCollected={customerCollectionAmount}\n        customerDue={customerDueAmount}\n        customerPayMethod={customerPayMethod}\n        setCustomerPayMethod={setCustomerPayMethod}\n        partialPayment={partialPayment}\n        setPartialPayment={setPartialPayment}\n        customerPaidNow={customerPaidNow}\n        setCustomerPaidNow={setCustomerPaidNow}\n        customerPaymentAllocations={customerPaymentAllocations}\n        setCustomerPaymentAllocations={setCustomerPaymentAllocations}\n        customerPaymentAccount={instruments.find((i) => i.id === customerPayInstId) ?? null}\n        fundingInstId={fundingInstId}\n        setFundingInstId={setFundingInstId}\n        fundingInstruments={validFundingInstruments}\n        selectedFundingAccount={selectedFundingAccount}\n        providerCost={netProviderCost}\n        commission={commissionEarned}\n        commissionLabel={\`Commission / Margin \${commissionCalculation.percent}%\`}\n        netProfit={netOperatorIncome}\n        onSubmit={handleCompleteRecharge}\n        submitting={submitting}\n        canSubmit={rechargeAmount > 0 && mobileNumber.length === 10 && !!selectedOperatorCode && !!fundingInstId}\n        submitLabel="Complete Recharge"\n        validationHint="Select operator, enter a valid target number and confirm the funding account before settlement."\n      />\n\n`;

const utilityReplacement = `      {/* ${MARKER} */}\n      <UnifiedSettlementPanel\n        serviceLabel={selectedBiller?.shortName || selectedBiller?.name || currentCategory.name}\n        targetLabel={currentCategory.idLabel}\n        targetValue={consumerId || "Enter consumer identifier"}\n        contextLabel="Category"\n        contextValue={currentCategory.name}\n        amountLabel="Bill Amount"\n        baseAmount={billAmount}\n        customerFee={custFee}\n        customerTotal={totalCustomerDebit}\n        customerCollected={customerCollectionAmount}\n        customerDue={customerDueAmount}\n        customerPayMethod={customerPayMethod}\n        setCustomerPayMethod={setCustomerPayMethod}\n        partialPayment={partialPayment}\n        setPartialPayment={setPartialPayment}\n        customerPaidNow={customerPaidNow}\n        setCustomerPaidNow={setCustomerPaidNow}\n        customerPaymentAllocations={customerPaymentAllocations}\n        setCustomerPaymentAllocations={setCustomerPaymentAllocations}\n        customerPaymentAccount={selectedCustomerPaymentAccount}\n        fundingInstId={fundingInstId}\n        setFundingInstId={setFundingInstId}\n        fundingInstruments={validFundingInstruments}\n        selectedFundingAccount={selectedFundingAccount}\n        providerCost={netProviderCost}\n        commission={commissionEarned}\n        commissionLabel={\`Commission / Margin \${commissionResolution.label}\`}\n        netProfit={netOperatorIncome}\n        onSubmit={handleCompletePayment}\n        submitting={submitting}\n        canSubmit={billAmount > 0 && !!consumerId.trim() && (billersForCategory.length === 0 || !!selectedBillerId) && !!fundingInstId}\n        submitLabel="Pay Bill"\n        validationHint={fetchedBill ? \`Verified bill \${fetchedBill.billNumber} is ready for settlement.\` : "Enter the consumer identifier and verify the bill where the biller requires a fetch."}\n      />\n\n`;

const results = [];
results.push(transform(
  "components/business/google-play-workspace.tsx",
  "/* Right Column: Funding & Settlement Summary */",
  "/* Google Play Recharge History Section */",
  gpReplacement,
));
results.push(transform(
  "components/business/recharge-workspace.tsx",
  "/* RIGHT: Order Summary & Settlement Panel */",
  "/* 4. TRANSACTION HISTORY CONSOLE */",
  rechargeReplacement,
));
results.push(transform(
  "components/business/utility-bill-workspace.tsx",
  "/* RIGHT: Order Summary & Settlement Panel */",
  "/* 4. TRANSACTION HISTORY CONSOLE */",
  utilityReplacement,
));

const changed = results.filter(Boolean).length;
if (changed !== 3) {
  console.log(`[unified-settlement] ${changed}/3 workspaces already transformed.`);
}
console.log(`[unified-settlement] applied to ${changed} workspace file(s).`);
