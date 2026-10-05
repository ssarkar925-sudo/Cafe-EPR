/**
 * packages/hardware/tests/escpos-builder.test.mjs
 * Verification of ESC/POS bytecode generation for 58mm and 80mm thermal receipts.
 */

import assert from "node:assert/strict";
import { EscPosBuilder } from "../dist/index.js";

console.log("▶ Running ESC/POS Bytecode Thermal Receipt Tests...\n");

const receiptSample = {
  shopName: "SARKAR COMMUNICATION",
  addressLines: ["Station Road, Rampurhat", "Near Bus Stand"],
  phone: "9876543210",
  invoiceNumber: "INV-2026-001",
  dateTime: "2026-10-04 10:30 AM",
  customerName: "Rahul Kumar",
  customerPhone: "9123456789",
  items: [
    { name: "Photocopy (B&W)", qty: 10, ratePaisa: 200n, totalPaisa: 2000n }, // 10 x ₹2 = ₹20
    { name: "Color Printout", qty: 2, ratePaisa: 1000n, totalPaisa: 2000n },   // 2 x ₹10 = ₹20
    { name: "Spiral Lamination", qty: 1, ratePaisa: 5000n, totalPaisa: 5000n },// 1 x ₹50 = ₹50
  ],
  subtotalPaisa: 9000n, // ₹90.00
  discountPaisa: 1000n, // ₹10.00 discount
  grandTotalPaisa: 8000n, // ₹80.00
  paymentBreakdown: [
    { method: "CASH", amountPaisa: 3000n },
    { method: "UPI", amountPaisa: 5000n, details: "PhonePe QR" },
  ],
  footerMessage: "Thank you! Visit again.",
};

// 1. Generate 58mm receipt
{
  const bytes58 = EscPosBuilder.buildReceipt(receiptSample, 58);
  assert(bytes58 instanceof Uint8Array);
  assert(bytes58.length > 100, "Receipt byte buffer should contain meaningful print commands");
  // Check init bytes (ESC @ -> 0x1B, 0x40)
  assert.equal(bytes58[0], 0x1b);
  assert.equal(bytes58[1], 0x40);
  // Check cut command at the end (GS V 65 0 -> 0x1D, 0x56, 0x41, 0x00)
  const cutIndex = bytes58.length - 4;
  assert.equal(bytes58[cutIndex], 0x1d);
  assert.equal(bytes58[cutIndex + 1], 0x56);
  assert.equal(bytes58[cutIndex + 2], 0x41);
  assert.equal(bytes58[cutIndex + 3], 0x00);
  console.log(`✔ 58mm Thermal Receipt generated successfully (${bytes58.length} bytes).`);
}

// 2. Generate 80mm receipt
{
  const bytes80 = EscPosBuilder.buildReceipt(receiptSample, 80);
  assert(bytes80 instanceof Uint8Array);
  assert(bytes80.length > 100);
  console.log(`✔ 80mm Thermal Receipt generated successfully (${bytes80.length} bytes).`);
}

console.log("\n=======================================================");
console.log("🎉 ALL HARDWARE ESC/POS PRINTING TESTS PASSED 100%!");
console.log("=======================================================\n");
