import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const NL = String.fromCharCode(10);
const SHARED_IMPORT = 'import UnifiedSettlementPanel from "@/components/business/unified-settlement-panel";';
const HISTORY_STYLE_IMPORT = 'import "@/components/business/unified-settlement-panel.module.css";';
const MARKER = "UNIFIED_SETTLEMENT_RENDER_V1";

function replaceBetweenMarkers(source, startNeedle, endNeedle, replacement, fileName) {
  const start = source.indexOf(startNeedle);
  if (start === -1) throw new Error(`[unified-settlement] start marker not found in ${fileName}: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start);
  if (end === -1) throw new Error(`[unified-settlement] end marker not found in ${fileName}: ${endNeedle}`);
  return source.slice(0, start) + replacement + source.slice(end);
}

function ensureImport(source) {
  const imports = [SHARED_IMPORT, HISTORY_STYLE_IMPORT].filter((statement) => !source.includes(statement));
  if (imports.length === 0) return source;
  const lines = source.split(NL);
  let lastImport = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].startsWith("import ")) lastImport = i;
  }
  if (lastImport === -1) return `${imports.join(NL)}${NL}${source}`;
  lines.splice(lastImport + 1, 0, ...imports);
  return lines.join(NL);
}

function transform(filePath, startNeedle, endNeedle, replacement) {
  const abs = path.join(ROOT, filePath);
  let source = fs.readFileSync(abs, "utf8");
  if (source.includes(MARKER)) {
    if (!source.includes(HISTORY_STYLE_IMPORT)) source = ensureImport(source);
    fs.writeFileSync(abs, source, "utf8");
    return false;
  }
  source = ensureImport(source);
  source = replaceBetweenMarkers(source, startNeedle, endNeedle, replacement, filePath);
  fs.writeFileSync(abs, source, "utf8");
  return true;
}

const gpReplacement = [
  `      {/* ${MARKER} */}`,
  "      <UnifiedSettlementPanel",
  '        serviceLabel="Google Play Recharge"',
  '        targetLabel="Customer Mobile"',
  '        targetValue={customerMobile ? "+91 " + customerMobile : "Enter mobile number"}',
  '        contextLabel="Region"',
  "        contextValue={activeRegion.name}",
  '        amountLabel="Recharge Denomination"',
  "        baseAmount={rechargeAmount}",
  "        customerFee={custFee}",
  "        customerTotal={totalCustomerDebit}",
  "        customerCollected={customerCollectionAmount}",
  "        customerDue={customerDueAmount}",
  "        customerPayMethod={customerPayMethod}",
  "        setCustomerPayMethod={setCustomerPayMethod}",
  "        partialPayment={partialPayment}",
  "        setPartialPayment={setPartialPayment}",
  "        customerPaidNow={customerPaidNow}",
  "        setCustomerPaidNow={setCustomerPaidNow}",
  "        customerPaymentAllocations={customerPaymentAllocations}",
  "        setCustomerPaymentAllocations={setCustomerPaymentAllocations}",
  "        customerPaymentAccount={instruments.find((i) => i.id === customerPayInstId) ?? null}",
  "        fundingInstId={fundingInstId}",
  "        setFundingInstId={setFundingInstId}",
  "        fundingInstruments={validFundingInstruments}",
  "        selectedFundingAccount={selectedFundingAccount}",
  "        providerCost={netProviderCost}",
  "        commission={commissionEarned}",
  '        commissionLabel={"Margin " + commissionResolution.label}',
  "        netProfit={netOperatorIncome}",
  "        onSubmit={handleCompleteRecharge}",
  "        submitting={submitting}",
  "        canSubmit={rechargeAmount > 0 && !!fundingInstId}",
  '        submitLabel="Complete Recharge"',
  '        validationHint="Customer collection, provider cost, funding debit and margin are reconciled before posting."',
  "      />",
  "",
].join(NL);

const rechargeReplacement = [
  `      {/* ${MARKER} */}`,
  "      <UnifiedSettlementPanel",
  '        serviceLabel={selectedOperatorCode ? (allOperators.find((o) => o.code === selectedOperatorCode)?.name || "Mobile") + " Recharge" : "Mobile Recharge"}',
  '        targetLabel="Target Mobile"',
  '        targetValue={mobileNumber ? "+91 " + mobileNumber : "Enter mobile number"}',
  '        contextLabel="Circle"',
  "        contextValue={selectedCircle}",
  '        amountLabel="Recharge Amount"',
  "        baseAmount={rechargeAmount}",
  "        customerFee={custFee}",
  "        customerTotal={totalCustomerDebit}",
  "        customerCollected={customerCollectionAmount}",
  "        customerDue={customerDueAmount}",
  "        customerPayMethod={customerPayMethod}",
  "        setCustomerPayMethod={setCustomerPayMethod}",
  "        partialPayment={partialPayment}",
  "        setPartialPayment={setPartialPayment}",
  "        customerPaidNow={customerPaidNow}",
  "        setCustomerPaidNow={setCustomerPaidNow}",
  "        customerPaymentAllocations={customerPaymentAllocations}",
  "        setCustomerPaymentAllocations={setCustomerPaymentAllocations}",
  "        customerPaymentAccount={instruments.find((i) => i.id === customerPayInstId) ?? null}",
  "        fundingInstId={fundingInstId}",
  "        setFundingInstId={setFundingInstId}",
  "        fundingInstruments={validFundingInstruments}",
  "        selectedFundingAccount={selectedFundingAccount}",
  "        providerCost={netProviderCost}",
  "        commission={commissionEarned}",
  '        commissionLabel={"Commission / Margin " + commissionCalculation.percent + "%"}',
  "        netProfit={netOperatorIncome}",
  "        onSubmit={handleCompleteRecharge}",
  "        submitting={submitting}",
  "        canSubmit={rechargeAmount > 0 && mobileNumber.length === 10 && !!selectedOperatorCode && !!fundingInstId}",
  '        submitLabel="Complete Recharge"',
  '        validationHint="Select operator, enter a valid target number and confirm the funding account before settlement."',
  "      />",
  "",
].join(NL);

const utilityReplacement = [
  `      {/* ${MARKER} */}`,
  "      <UnifiedSettlementPanel",
  '        serviceLabel={selectedBiller?.shortName || selectedBiller?.name || currentCategory.name}',
  "        targetLabel={currentCategory.idLabel}",
  '        targetValue={consumerId || "Enter consumer identifier"}',
  '        contextLabel="Category"',
  "        contextValue={currentCategory.name}",
  '        amountLabel="Bill Amount"',
  "        baseAmount={billAmount}",
  "        customerFee={custFee}",
  "        customerTotal={totalCustomerDebit}",
  "        customerCollected={customerCollectionAmount}",
  "        customerDue={customerDueAmount}",
  "        customerPayMethod={customerPayMethod}",
  "        setCustomerPayMethod={setCustomerPayMethod}",
  "        partialPayment={partialPayment}",
  "        setPartialPayment={setPartialPayment}",
  "        customerPaidNow={customerPaidNow}",
  "        setCustomerPaidNow={setCustomerPaidNow}",
  "        customerPaymentAllocations={customerPaymentAllocations}",
  "        setCustomerPaymentAllocations={setCustomerPaymentAllocations}",
  "        customerPaymentAccount={selectedCustomerPaymentAccount}",
  "        fundingInstId={fundingInstId}",
  "        setFundingInstId={setFundingInstId}",
  "        fundingInstruments={validFundingInstruments}",
  "        selectedFundingAccount={selectedFundingAccount}",
  "        providerCost={netProviderCost}",
  "        commission={commissionEarned}",
  '        commissionLabel={"Commission / Margin " + commissionResolution.label}',
  "        netProfit={netOperatorIncome}",
  "        onSubmit={handleCompletePayment}",
  "        submitting={submitting}",
  "        canSubmit={billAmount > 0 && !!consumerId.trim() && (billersForCategory.length === 0 || !!selectedBillerId) && !!fundingInstId}",
  '        submitLabel="Pay Bill"',
  '        validationHint={fetchedBill ? "Verified bill " + fetchedBill.billNumber + " is ready for settlement." : "Enter the consumer identifier and verify the bill where the biller requires a fetch."}',
  "      />",
  "",
].join(NL);

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
  console.log(`[unified-settlement] ${changed}/3 workspaces changed; existing markers were preserved.`);
}
console.log(`[unified-settlement] applied to ${changed} workspace file(s).`);
