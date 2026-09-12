import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const file = path.join(ROOT, "components", "pos", "pos-shell.tsx");
const source = fs.readFileSync(file, "utf8");

const importAnchor = 'import { createClient } from "@/lib/supabase/client";\n';
const importLine = 'import styles from "./pos-refinements.module.css";\n';
const operationsImport = 'import PosOperations from "./pos-operations";\n';
const legacyRoot = '<div className="fixed inset-0 z-[100] flex h-[100dvh] min-h-0 w-screen flex-col overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-white">';
const styledRoot = '<div className={`${styles.root} fixed inset-0 z-[100] flex h-[100dvh] min-h-0 w-screen flex-col overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-white`}>'.replace('`};', '');
const legacyButton = '<button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300" aria-label="More POS actions">\n            …\n          </button>';
const operationsButton = `<PosOperations
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
    console.error("POS refinement: import anchor not found; refusing unsafe patch");
    process.exit(1);
  }
  next = next.replace(importAnchor, `${importAnchor}${importLine}`);
  changed = true;
}

if (!next.includes("styles.root")) {
  if (!next.includes(legacyRoot)) {
    console.error("POS refinement: root anchor not found; refusing unsafe patch");
    process.exit(1);
  }
  next = next.replace(legacyRoot, styledRoot);
  changed = true;
}

if (!next.includes(operationsImport)) {
  if (!next.includes(importAnchor)) {
    console.error("POS operations: import anchor not found; refusing unsafe patch");
    process.exit(1);
  }
  next = next.replace(importAnchor, `${importAnchor}${operationsImport}`);
  changed = true;
}

if (!next.includes("<PosOperations")) {
  if (!next.includes(legacyButton)) {
    console.error("POS operations: header button anchor not found; refusing unsafe patch");
    process.exit(1);
  }
  next = next.replace(legacyButton, operationsButton);
  changed = true;
}

if (changed) {
  fs.writeFileSync(file, next, "utf8");
  console.log("POS refinement + operations integration: applied");
} else {
  console.log("POS refinement + operations integration: already applied");
}
