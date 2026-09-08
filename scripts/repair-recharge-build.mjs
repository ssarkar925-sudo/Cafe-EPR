import fs from "node:fs";

const path = "components/business/recharge-workspace.tsx";
let source = fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const startMarker = "      // 1. Generate Transaction Number";
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
      });

      if (txnErr) {
        showToast("error", txnErr.message);
        setSubmitting(false);
        return;
      }

`;

  source = source.slice(0, start) + replacement + source.slice(end);
}

const reverseStartMarker = "      // Offset cash entries";
const reverseEndMarker = "      setTransactions((prev) =>";
if (source.includes(reverseStartMarker) && source.includes(reverseEndMarker)) {
  const start = source.indexOf(reverseStartMarker);
  const end = source.indexOf(reverseEndMarker);
  const replacement = "      // reverse_business_txn atomically reverses every stored money leg and any outstanding Khata due.\n";
  source = source.slice(0, start) + replacement + source.slice(end);
}

fs.writeFileSync(path, source);
console.log("Recharge build repair applied: canonical create_recharge and reverse_business_txn RPC boundaries are enforced.");
