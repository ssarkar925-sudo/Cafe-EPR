import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const NL = String.fromCharCode(10);
const SHARED_IMPORT = 'import UnifiedSettlementPanel from "@/components/business/unified-settlement-panel";';
const HISTORY_STYLE_IMPORT = 'import "@/components/business/unified-settlement-panel.module.css";';
const MARKER = "UNIFIED_SETTLEMENT_RENDER_V3";

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
  throw new Error(`[unified-settlement] could not find matching </div> in ${fileName}`);
}

function findSettlementColumnOpen(source, marker, historyMarker, fileName) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) throw new Error(`[unified-settlement] settlement marker not found in ${fileName}: ${marker}`);
  const historyIndex = source.indexOf(historyMarker, markerIndex);
  if (historyIndex === -1) throw new Error(`[unified-settlement] history marker not found in ${fileName}: ${historyMarker}`);

  // The settlement marker is inside the right column. Find every preceding <div>
  // whose matching close occurs before the history section. The right-column wrapper
  // is the nearest such closing div to the history marker; this survives changes in
  // Tailwind classes made by other prebuild repair scripts.
  const windowStart = Math.max(0, markerIndex - 9000);
  const prefix = source.slice(windowStart, markerIndex);
  const candidates = [];
  const openRe = /<div\b[^>]*>/g;
  let match;
  while ((match = openRe.exec(prefix)) !== null) {
    const openIndex = windowStart + match.index;
    try {
      const close = findMatchingDivClose(source, openIndex, fileName);
      if (close.index > markerIndex && close.index < historyIndex) {
        candidates.push({ openIndex, closeIndex: close.index });
      }
    } catch {
      // Ignore unmatched candidates here; JSX comments/expressions and other repair
      // layers may create div-like fragments outside the actual enclosing column.
    }
  }

  if (candidates.length === 0) {
    throw new Error(`[unified-settlement] no enclosing settlement column found in ${fileName} before history section`);
  }

  candidates.sort((a, b) => b.closeIndex - a.closeIndex);
  return candidates[0].openIndex;
}

function replaceRightColumn(source, marker, historyMarker, replacement, fileName) {
  const markerIndex = source.indexOf(marker);
  const historyIndex = source.indexOf(historyMarker, markerIndex);
  const openIndex = findSettlementColumnOpen(source, marker, historyMarker, fileName);
  const close = findMatchingDivClose(source, openIndex, fileName);
  if (close.index >= historyIndex) {
    throw new Error(`[unified-settlement] selected settlement column crosses history section in ${fileName}`);
  }
  return source.slice(0, openIndex) + replacement + source.slice(close.index + close.length);
}

function transform(filePath, marker, historyMarker, replacement) {
  const abs = path.join(ROOT, filePath);
  let source = fs.readFileSync(abs, "utf8");
  if (source.includes(MARKER)) {
    if (!source.includes(HISTORY_STYLE_IMPORT)) source = ensureImport(source);
    fs.writeFileSync(abs, source, "utf8");
    return false;
  }
  source = ensureImport(source);
  source = replaceRightColumn(source, marker, historyMarker, replacement, filePath);
  fs.writeFileSync(abs, source, "utf8");
  return true;
}

function panel(props) {
  return [
    `      {/* ${MARKER} */}`,
    "      <UnifiedSettlementPanel",
    ...props,
    "      />",
    "",
  ].join(NL);
}

const gpReplacement = panel([
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
]);

const rechargeReplacement = panel([
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
]);

const utilityReplacement = panel([
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
]);

const changed = [
  transform(
    "components/business/google-play-workspace.tsx",
    "{/* Right Column: Funding & Settlement Summary */}",
    "{/* Google Play Recharge History Section */}",
    gpReplacement,
  ),
  transform(
    "components/business/recharge-workspace.tsx",
    "{/* RIGHT: Order Summary & Settlement Panel */}",
    "{/* 4. TRANSACTION HISTORY CONSOLE */}",
    rechargeReplacement,
  ),
  transform(
    "components/business/utility-bill-workspace.tsx",
    "{/* RIGHT: Order Summary & Settlement Panel */}",
    "{/* 4. TRANSACTION HISTORY CONSOLE */}",
    utilityReplacement,
  ),
].filter(Boolean).length;

console.log(`[unified-settlement] applied to ${changed}/3 workspace source file(s).`);
