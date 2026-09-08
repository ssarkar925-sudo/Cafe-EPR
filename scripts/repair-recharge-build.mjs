import fs from "node:fs";

const path = "components/business/recharge-workspace.tsx";
let source = fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

// Persist one idempotency key per user submission. It is cleared only after a successful commit,
// so a lost network response can safely be retried without creating a duplicate recharge.
const submittingMarker = '  const [submitting, setSubmitting] = useState(false);';
const keyRefLine = '  const rechargeIdempotencyKeyRef = useRef<string>("");';
if (source.includes(submittingMarker) && !source.includes(keyRefLine)) {
  source = source.replace(submittingMarker, `${submittingMarker}\n${keyRefLine}`);
}

const startMarker = "      const todayIso = new Date().toISOString();";
const endMarker = "      // 7. Update UI State & Open Celebration Receipt";

if (source.includes(startMarker) && source.includes(endMarker)) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);

  const replacement = `      const todayIso = new Date().toISOString();
      const todayDate = todayIso.slice(0, 10);

      // Resolve provider metadata locally; the database is authoritative for commission/cost.
      const matchedDbProvider = providers.find(
        (p) =>
          p.id === selectedOperatorCode ||
          p.name.toLowerCase().includes(selectedOperatorCode.toLowerCase())
      );
      const operatorName = allOperators.find((o) => o.code === selectedOperatorCode)?.name || "Mobile Recharge";

      const allocations = customerPaymentAllocations
        .filter((row) => Number(row.amount) > 0)
        .map((row) => ({
          method: row.method,
          amount: Number(row.amount),
          instrument_id: row.instrument_id || null,
        }));

      const idempotencyKey = rechargeIdempotencyKeyRef.current ||
        \`recharge:\${todayIso}:\${cleanMobile}:\${rechargeAmount}:\${crypto.randomUUID()}\`;
      rechargeIdempotencyKeyRef.current = idempotencyKey;

      // All recharge financial writes cross the SECURITY DEFINER/idempotent RPC boundary.
      const { data: newTxn, error: txnErr } = await supabase.rpc("create_recharge", {
        p_provider_id: matchedDbProvider?.id || null,
        p_transaction_date: todayDate,
        p_transaction_timestamp: todayIso,
        p_customer_id: selectedCustomerId || null,
        p_customer_mobile: cleanMobile,
        p_reference: reference.trim() || null,
        p_remarks: remarks.trim() || \`Recharge \${cleanMobile} (\${operatorName})\`,
        p_status: "success",
        p_amount: rechargeAmount,
        p_service_fee: custFee,
        p_customer_pay_method: customerPayMethod,
        p_pay_from_instrument_id: fundingInstId,
        p_pay_from_method: selectedFundingAccount.type,
        p_customer_collected_amount: customerCollectionAmount,
        p_customer_due_amount: customerDueAmount,
        p_customer_collection_allocations: allocations,
        p_idempotency_key: idempotencyKey,
      });

      if (txnErr) {
        showToast("error", txnErr.message);
        setSubmitting(false);
        return;
      }

      const nextNum = newTxn?.transaction_number || "RCH-NEW";

`;

  source = source.slice(0, start) + replacement + source.slice(end);
}

// The canonical recharge RPC owns all cash_entries/customer-ledger/expense writes.
const reverseStartMarker = "      // Offset cash entries";
const reverseEndMarker = "      setTransactions((prev) =>";
if (source.includes(reverseStartMarker) && source.includes(reverseEndMarker)) {
  const start = source.indexOf(reverseStartMarker);
  const end = source.indexOf(reverseEndMarker);
  const replacement = "      // reverse_business_txn atomically reverses every stored money leg and any outstanding Khata due.\n";
  source = source.slice(0, start) + replacement + source.slice(end);
}

// Build repair must be idempotent even if another prebuild repair has already inserted a
// reversal handler. Keep the first public handler name and disambiguate any later duplicate.
const reverseSignature = "async function handleReverse()";
let firstReverse = source.indexOf(reverseSignature);
if (firstReverse >= 0) {
  let searchFrom = firstReverse + reverseSignature.length;
  while (true) {
    const duplicate = source.indexOf(reverseSignature, searchFrom);
    if (duplicate < 0) break;
    source = source.slice(0, duplicate) + "async function handleReverseDuplicate()" + source.slice(duplicate + reverseSignature.length);
    searchFrom = duplicate + "async function handleReverseDuplicate()".length;
  }
}

// Clear the idempotency key only after the success path reaches the existing form-reset block.
const allocationReset = "      setCustomerPaymentAllocations([]);";
if (source.includes(allocationReset) && !source.includes(`${allocationReset}\n      rechargeIdempotencyKeyRef.current = \"\";`)) {
  source = source.replace(allocationReset, `${allocationReset}\n      rechargeIdempotencyKeyRef.current = \"\";`);
}

fs.writeFileSync(path, source);
console.log("Recharge build repair applied: canonical atomic create_recharge RPC, idempotency, transaction number, duplicate-handler protection, and atomic reversal are enforced.");
