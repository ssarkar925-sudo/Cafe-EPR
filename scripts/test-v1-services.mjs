/**
 * V1 Services (record-only AEPS/DMT/UPI/Recharge/BBPS) contract test —
 * STATIC ONLY.
 *
 * Verifies, without touching any database, the 40 static checks: routes
 * exist with session/role gates, record_service_txn through the V1 RPC
 * wrapper, frozen G5 field sets, last-4 validation, frozen-keys-only
 * details, optional linked claim per contract, no new tables, no provider
 * APIs/credentials/webhooks/settlement, no GST/WAC/legacy, explicit
 * processing/success/error states, record-only wording with no
 * provider-success claims, reverse_service_txn exposure with back-office
 * restriction and no invented reason, idempotency, and no
 * offline/thermal/returns work.
 *
 * Run: node scripts/test-v1-services.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const HUB = "app/v1/services/page.tsx";
const FORM = "app/v1/services/service-form.tsx";
const REVERSE = "app/v1/services/reverse-action.tsx";
const LIST = "app/v1/services/recent-list.tsx";
const PAGES = {
  aeps: "app/v1/services/aeps/page.tsx",
  dmt: "app/v1/services/dmt/page.tsx",
  upi: "app/v1/services/upi/page.tsx",
  recharge: "app/v1/services/recharge/page.tsx",
  bbps: "app/v1/services/bbps/page.tsx",
};

// --- 1-8. routes + gates ------------------------------------------------------------------
check("1. services route exists", existsSync(join(root, HUB)));
for (const [t, p] of Object.entries(PAGES)) {
  check(`${1 + ["aeps", "dmt", "upi", "recharge", "bbps"].indexOf(t)}. ${t.toUpperCase()} route exists`, existsSync(join(root, p)));
}
const hub = read(HUB);
for (const [file, src] of [[HUB, hub], ...Object.entries(PAGES).map(([t, p]) => [p, read(p)])]) {
  const gated =
    src.includes("getV1SessionContext") && src.includes("requireV1BackOffice") && src.includes("V1Forbidden");
  check(`7/8. session guard + back-office gate: ${file}`, gated);
}

const form = read(FORM);
const reverse = read(REVERSE);
const list = read(LIST);
const svcFiles = [HUB, FORM, REVERSE, LIST, ...Object.values(PAGES)].map((f) => [f, read(f)]);
const codeOnly = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"))
    .join("\n");
const svcCode = svcFiles.map(([f, src]) => codeOnly(src)).join("\n");

// --- 9-11. submission path ----------------------------------------------------------------------
check("9. record_service_txn used", form.includes('callV1Mutation<Success>("record_service_txn"'));
check("10. record_service_txn goes through V1 RPC wrapper", form.includes('from "@/lib/v1/v1-rpc"'));
check(
  "11. no direct service_transactions writes",
  !/\.(insert|update|delete|upsert)\s*\(/.test(svcCode),
);

// --- 12-18. frozen field contracts -----------------------------------------------------------------------
const frozen = {
  aeps: ["aadhaar_last4", "aeps_txn_type", "bank_ref", "portal_ref"],
  dmt: ["sender_name", "sender_mobile", "beneficiary_name", "beneficiary_mobile", "beneficiary_bank", "beneficiary_ifsc", "beneficiary_account", "transfer_method"],
  upi: ["upi_id", "merchant_qr_ref"],
  recharge: ["provider_ref", "receiver_number", "plan_ref"],
  bbps: ["biller_ref", "consumer_number", "bill_amount"],
};
for (const [t, keys] of Object.entries(frozen)) {
  const n = { aeps: 12, dmt: 13, upi: 14, recharge: 15, bbps: 16 }[t];
  check(`${n}. ${t.toUpperCase()} fields match G5 frozen contract`, keys.every((k) => form.includes(`"${k}"`)));
}
check("17. Aadhaar last-4 validation preserved", form.includes("^[0-9]{4}$"));
check("18. unknown JSON fields not introduced by UI", form.includes("for (const f of fields)") && form.includes("Frozen keys only"));

// --- 19-20. linked claim ---------------------------------------------------------------------------------------------
check(
  "19. optional linked claim uses existing contract only",
  form.includes("p_collect_method") && form.includes("p_collect_instrument_id") && form.includes("or neither"),
);
check("20. no new payments table", !/CREATE TABLE|payment_claims/.test(svcCode));

// --- 21-24. no provider surface --------------------------------------------------------------------------------------------------
// Descriptions may disclaim provider work ("No X ..."); only
// non-negated occurrences fail.
const nonNegated = (rx) =>
  svcCode.split("\n").filter((line) => rx.test(line) && !/no\b|not\b|never|without|none\b|neither/i.test(line));
const providerBad = nonNegated(/\bfetch\(|axios|provider.*api|api.*provider/i);
check("21. no provider APIs", providerBad.length === 0, providerBad.join("; "));
check("22. no provider credentials", !/credential|secret|api[_-]?key|token/i.test(svcCode));
check("23. no webhook", !/webhook/i.test(svcCode));
const settleBad = nonNegated(/settlement/i);
check("24. no settlement portal", settleBad.length === 0, settleBad.join("; "));

// --- 25-27. dormant boundaries ------------------------------------------------------------------------------------------------------------
check("25. no GST calculation", !/GST/i.test(svcCode));
check("26. no WAC", !/WAC/.test(svcCode));
check("27. no legacy service workflow", !/quick_sale|process_return|legacy|cash_entries/.test(svcCode));

// --- 28-32. states + wording -------------------------------------------------------------------------------------------------------------------
check("28. explicit processing state", form.includes("Recording…") && form.includes("disabled={busy}"));
check("29. explicit success state", form.includes("Service transaction recorded."));
check("30. explicit error state", form.includes('role="alert"'));
check("31. record-only wording exists", /record-only/i.test(form) && /local record only/i.test(form) && form.includes("Service transaction recorded."));
check(
  "32. provider-success wording absent",
  !/successful|transfer complete|bill paid|payment confirmed/i.test(svcCode),
);

// --- 33-35. reversal -----------------------------------------------------------------------------------------------------------------------------------
check("33. reversal uses reverse_service_txn if exposed", reverse.includes('"reverse_service_txn"'));
check("34. reversal remains back-office restricted", reverse.includes("back-office") && Object.values(PAGES).every((p) => read(p).includes("requireV1BackOffice")));
check("35. no invented reversal reason", reverse.includes("takes no reason") && !/p_reason/.test(codeOnly(reverse)));

// --- 36-37. idempotency -----------------------------------------------------------------------------------------------------------------------------------------
check("36. idempotency preserved", form.includes("p_idempotency_key: key"));
check("37. duplicate submission protected", form.includes("if (busy) return") && form.includes("setKey(newKey())"));

// --- 38-40. out-of-scope absences ---------------------------------------------------------------------------------------------------------------------------------------
check("38. no offline queue", !/sync_flush|sync_acknowledge|outbox|offline/i.test(svcCode));
check("39. no thermal implementation", !/printThermal|window\.print|UNSYNCED|thermal/i.test(svcCode));
check("40. no returns/refunds", !/process_return|refund|cancel_invoice|edit_invoice/i.test(svcCode));
check("40b. no account selection", !/account_code|chart_of_accounts/i.test(svcCode));

if (failures > 0) {
  console.log(`V1_SERVICES_CONTRACT_FAILED (${failures})`);
  process.exit(1);
}
console.log("V1_SERVICES_CONTRACT_PASSED");
