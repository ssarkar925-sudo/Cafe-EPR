import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const NL = String.fromCharCode(10);
const SHARED_IMPORT = 'import UnifiedSettlementPanel from "@/components/business/unified-settlement-panel";';
const MARKER = "UNIFIED_SETTLEMENT_RENDER_V5";

function ensureImport(source) {
  if (source.includes(SHARED_IMPORT)) return source;
  const lines = source.split(NL);
  let lastImport = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].startsWith("import ")) lastImport = i;
  }
  if (lastImport === -1) return `${SHARED_IMPORT}${NL}${source}`;
  lines.splice(lastImport + 1, 0, SHARED_IMPORT);
  return lines.join(NL);
}

function findMatchingDivClose(source, openIndex, fileName) {
  const token = /<\/?div\b[^>]*>/g;
  token.lastIndex = openIndex;
  let depth = 0;
  let seenOpen = false;
  let match;
  while ((match = token.exec(source)) !== null) {
    const text = match[0];
    if (text.startsWith("</")) {
      if (!seenOpen) continue;
      depth -= 1;
      if (depth === 0) return { index: match.index, length: text.length };
      continue;
    }
    if (/\/\s*>$/.test(text)) continue;
    depth += 1;
    seenOpen = true;
  }
  throw new Error(`[unified-settlement] unmatched <div> in ${fileName}`);
}

function findFollowingDiv(source, marker, fileName) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) throw new Error(`[unified-settlement] marker not found in ${fileName}: ${marker}`);
  const window = source.slice(markerIndex + marker.length, markerIndex + marker.length + 1200);
  const open = /<div\b[^>]*>/.exec(window);
  if (!open) throw new Error(`[unified-settlement] settlement wrapper <div> not found after marker in ${fileName}`);
  const openIndex = markerIndex + marker.length + open.index;
  const close = findMatchingDivClose(source, openIndex, fileName);
  return { openIndex, close };
}

function replaceRightColumn(source, marker, replacement, fileName) {
  const { openIndex, close } = findFollowingDiv(source, marker, fileName);
  return source.slice(0, openIndex) + replacement + source.slice(close.index + close.length);
}

function transform(filePath, marker, replacement) {
  const abs = path.join(ROOT, filePath);
  let source = fs.readFileSync(abs, "utf8");
  if (source.includes(MARKER)) return false;
  source = ensureImport(source);
  source = replaceRightColumn(source, marker, replacement, filePath);
  fs.writeFileSync(abs, source, "utf8");
  return true;
}

function panel(props) {
  return [
    `        {/* ${MARKER} */}`,
    "        <UnifiedSettlementPanel",
    ...props,
    "        />",
    "",
  ].join(NL);
}

const gpReplacement = panel([
  '          serviceLabel="Google Play Recharge"',
  '          targetLabel="Customer Mobile"',
  '          targetValue={customerMobile ? "+91 " + customerMobile : "Enter mobile number"}',
  '          contextLabel="Region"',
  "          contextValue={activeRegion.name}",
  '          amountLabel="Recharge Denomination"',
  "          baseAmount={rechargeAmount}",
  "          customerFee={custFee}",
  "          customerTotal={totalCustomerDebit}",
  "          customerCollected={customerCollectionAmount}",
  "          customerDue={customerDueAmount}",
  "          customerPayMethod={customerPayMethod}",
  "          setCustomerPayMethod={setCustomerPayMethod}",
  "          partialPayment={partialPayment}",
  "          setPartialPayment={setPartialPayment}",
  "          customerPaidNow={customerPaidNow}",
  "          setCustomerPaidNow={setCustomerPaidNow}",
  "          customerPaymentAllocations={customerPaymentAllocations}",
  "          setCustomerPaymentAllocations={setCustomerPaymentAllocations}",
  "          customerPaymentAccount={instruments.find((i) => i.id === customerPayInstId) ?? null}",
  "          fundingInstId={fundingInstId}",
  "          setFundingInstId={setFundingInstId}",
  "          fundingInstruments={validFundingInstruments}",
  "          selectedFundingAccount={selectedFundingAccount}",
  "          providerCost={netProviderCost}",
  "          commission={commissionEarned}",
  '          commissionLabel={"Margin " + commissionResolution.label}',
  "          netProfit={netOperatorIncome}",
  "          onSubmit={handleCompleteRecharge}",
  "          submitting={submitting}",
  "          canSubmit={rechargeAmount > 0 && !!fundingInstId}",
  '          submitLabel="Complete Recharge"',
  '          validationHint="Customer collection, provider cost, funding debit and margin are reconciled before posting."',
]);

const rechargeReplacement = panel([
  '          serviceLabel={selectedOperatorCode ? (allOperators.find((o) => o.code === selectedOperatorCode)?.name || "Mobile") + " Recharge" : "Mobile Recharge"}',
  '          targetLabel="Target Mobile"',
  '          targetValue={mobileNumber ? "+91 " + mobileNumber : "Enter mobile number"}',
  '          contextLabel="Circle"',
  "          contextValue={selectedCircle}",
  '          amountLabel="Recharge Amount"',
  "          baseAmount={rechargeAmount}",
  "          customerFee={custFee}",
  "          customerTotal={totalCustomerDebit}",
  "          customerCollected={customerCollectionAmount}",
  "          customerDue={customerDueAmount}",
  "          customerPayMethod={customerPayMethod}",
  "          setCustomerPayMethod={setCustomerPayMethod}",
  "          partialPayment={partialPayment}",
  "          setPartialPayment={setPartialPayment}",
  "          customerPaidNow={customerPaidNow}",
  "          setCustomerPaidNow={setCustomerPaidNow}",
  "          customerPaymentAllocations={customerPaymentAllocations}",
  "          setCustomerPaymentAllocations={setCustomerPaymentAllocations}",
  "          customerPaymentAccount={instruments.find((i) => i.id === customerPayInstId) ?? null}",
  "          fundingInstId={fundingInstId}",
  "          setFundingInstId={setFundingInstId}",
  "          fundingInstruments={validFundingInstruments}",
  "          selectedFundingAccount={selectedFundingAccount}",
  "          providerCost={netProviderCost}",
  "          commission={commissionEarned}",
  '          commissionLabel={"Commission / Margin " + commissionCalculation.percent + "%"}',
  "          netProfit={netOperatorIncome}",
  "          onSubmit={handleCompleteRecharge}",
  "          submitting={submitting}",
  "          canSubmit={rechargeAmount > 0 && mobileNumber.length === 10 && !!selectedOperatorCode && !!fundingInstId}",
  '          submitLabel="Complete Recharge"',
  '          validationHint="Select operator, enter a valid target number and confirm the funding account before settlement."',
]);

const utilityReplacement = panel([
  '          serviceLabel={selectedBiller?.shortName || selectedBiller?.name || currentCategory.name}',
  "          targetLabel={currentCategory.idLabel}",
  '          targetValue={consumerId || "Enter consumer identifier"}',
  '          contextLabel="Category"',
  "          contextValue={currentCategory.name}",
  '          amountLabel="Bill Amount"',
  "          baseAmount={billAmount}",
  "          customerFee={custFee}",
  "          customerTotal={totalCustomerDebit}",
  "          customerCollected={customerCollectionAmount}",
  "          customerDue={customerDueAmount}",
  "          customerPayMethod={customerPayMethod}",
  "          setCustomerPayMethod={setCustomerPayMethod}",
  "          partialPayment={partialPayment}",
  "          setPartialPayment={setPartialPayment}",
  "          customerPaidNow={customerPaidNow}",
  "          setCustomerPaidNow={setCustomerPaidNow}",
  "          customerPaymentAccount={selectedCustomerPaymentAccount}",
  "          fundingInstId={fundingInstId}",
  "          setFundingInstId={setFundingInstId}",
  "          fundingInstruments={validFundingInstruments}",
  "          selectedFundingAccount={selectedFundingAccount}",
  "          providerCost={netProviderCost}",
  "          commission={commissionEarned}",
  '          commissionLabel={"Commission / Margin " + commissionResolution.label}',
  "          netProfit={netOperatorIncome}",
  "          onSubmit={handleCompletePayment}",
  "          submitting={submitting}",
  "          canSubmit={billAmount > 0 && !!consumerId.trim() && (billersForCategory.length === 0 || !!selectedBillerId) && !!fundingInstId}",
  '          submitLabel="Pay Bill"',
  '          validationHint={fetchedBill ? "Verified bill " + fetchedBill.billNumber + " is ready for settlement." : "Enter the consumer identifier and verify the bill where the biller requires a fetch."}',
]);

const changed = [
  transform(
    "components/business/google-play-workspace.tsx",
    "{/* Right Column: Funding & Settlement Summary */}",
    gpReplacement,
  ),
  transform(
    "components/business/recharge-workspace.tsx",
    "{/* RIGHT: Order Summary & Settlement Panel */}",
    rechargeReplacement,
  ),
  transform(
    "components/business/utility-bill-workspace.tsx",
    "{/* RIGHT: Order Summary & Settlement Panel */}",
    utilityReplacement,
  ),
].filter(Boolean).length;

console.log(`[unified-settlement] applied to ${changed}/3 workspace source file(s).`);
