import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const file = path.join(ROOT, "components", "pos", "pos-shell.tsx");
const source = fs.readFileSync(file, "utf8");

const importAnchor = 'import { createClient } from "@/lib/supabase/client";\n';
const importLine = 'import PosOperations from "./pos-operations";\n';
const legacyButton = '<button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300" aria-label="More POS actions">\n            …\n          </button>';
const replacement = `<PosOperations
            cart={cart}
            total={total}
            discount={discount}
            customerId={customerId}
            customerName={selectedCustomer?.name ?? "Walk-in Customer"}
            paymentChoice={paymentChoice}
            cashReceived={cashReceived}
            splitRows={splitRows}
            supabase={supabase}
            onRestore={(draft) => {
              setCart(draft.cart);
              setCustomerId(draft.customerId);
              setCustomerSearch("");
              setCustomerOpen(false);
              setDiscount(draft.discount);
              setPaymentChoice(draft.paymentChoice as PaymentChoice);
              setCashReceived(draft.cashReceived);
              setSplitRows(draft.splitRows);
              setError(null);
              setSuccess(null);
            }}
            onReset={resetBill}
          />`;

let next = source;
let changed = false;

if (!next.includes(importLine)) {
  if (!next.includes(importAnchor)) {
    console.error("POS operations: import anchor not found; refusing unsafe patch");
    process.exit(1);
  }
  next = next.replace(importAnchor, `${importAnchor}${importLine}`);
  changed = true;
}

if (!next.includes("<PosOperations")) {
  if (!next.includes(legacyButton)) {
    console.error("POS operations: header button anchor not found; refusing unsafe patch");
    process.exit(1);
  }
  next = next.replace(legacyButton, replacement);
  changed = true;
}

if (changed) {
  fs.writeFileSync(file, next, "utf8");
  console.log("POS operations: applied");
} else {
  console.log("POS operations: already applied");
}
