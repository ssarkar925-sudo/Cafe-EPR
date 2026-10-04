/**
 * packages/ui/tests/ui-exports.test.mjs
 * Verification of React UI Component exports.
 */

import assert from "node:assert/strict";
import {
  InwardPaymentModal,
  OutwardPaymentModal,
  ContraTransferModal,
  DayCloseWizard,
} from "../dist/index.js";

console.log("▶ Running UI Components Export Integrity Tests...\n");

assert.equal(typeof InwardPaymentModal, "function", "InwardPaymentModal must be a React component function");
assert.equal(typeof OutwardPaymentModal, "function", "OutwardPaymentModal must be a React component function");
assert.equal(typeof ContraTransferModal, "function", "ContraTransferModal must be a React component function");
assert.equal(typeof DayCloseWizard, "function", "DayCloseWizard must be a React component function");

console.log("✔ InwardPaymentModal component verified.");
console.log("✔ OutwardPaymentModal component verified.");
console.log("✔ ContraTransferModal component verified.");
console.log("✔ DayCloseWizard component verified.");

console.log("\n=======================================================");
console.log("🎉 ALL UI COMPONENT EXPORT TESTS PASSED 100%!");
console.log("=======================================================\n");
