import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function patchFile(rel, replacements) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) return;
  let text = fs.readFileSync(file, "utf8");
  let changed = false;
  for (const [from, to] of replacements) {
    if (!text.includes(from)) continue;
    const next = text.split(from).join(to);
    if (next !== text) changed = true;
    text = next;
  }
  if (changed) fs.writeFileSync(file, text);
}

function patchBetween(rel, startMarker, endMarker, replacement) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) return;
  let text = fs.readFileSync(file, "utf8");
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end < start) return;
  const next = text.slice(0, start) + replacement + text.slice(end);
  if (next !== text) fs.writeFileSync(file, next);
}

// Never display fabricated financial balances when the live pool is unavailable.
patchFile("components/business/upi-workspace.tsx", [
  ["if (!livePool) return 9011;", "if (!livePool) return 0;"],
  ["shop_name: \"SC Communications\",", "shop_name: \"Business\","],
]);

// The canonical create_business_txn RPC already writes the cashbook entries atomically.
// Remove the legacy client-side duplicate cashbook writes from UPI.
{
  const rel = "components/business/upi-workspace.tsx";
  const file = path.join(root, rel);
  if (fs.existsSync(file)) {
    let text = fs.readFileSync(file, "utf8");
    const start = text.indexOf("      // Synchronize Cashbook Entries\n");
    const end = text.indexOf("      logAudit({\n", start);
    if (start >= 0 && end > start) {
      text = text.slice(0, start) + text.slice(end);
      fs.writeFileSync(file, text);
    }
  }
}

// Never invent a credit-card limit. Unconfigured cards must surface as such.
{
  const rel = "lib/finance/account-balances.ts";
  const file = path.join(root, rel);
  if (fs.existsSync(file)) {
    let text = fs.readFileSync(file, "utf8");
    text = text.replace(
      "creditLimit = money(inst.details?.credit_limit || (opening > 0 ? opening : 50000));",
      "creditLimit = money(inst.details?.credit_limit ?? 0);"
    );
    text = text.replace(
      "statusLabel = `Available: ₹${availableCredit.toLocaleString(\"en-IN\", { minimumFractionDigits: 2 })}`;\n      statusVariant = \"credit_limit\";",
      "statusLabel = creditLimit > 0\n        ? `Available: ₹${availableCredit.toLocaleString(\"en-IN\", { minimumFractionDigits: 2 })}`\n        : \"⚠ Credit limit not configured\";\n      statusVariant = \"credit_limit\";"
    );
    fs.writeFileSync(file, text);
  }
}

// A fresh business must never show sample recharge plans as real catalog data.
patchFile("components/business/recharge-workspace-live.tsx", [
  ["const [catalogPlans, setCatalogPlans] = useState<PlanItem[]>(SAMPLE_PLANS);", "const [catalogPlans, setCatalogPlans] = useState<PlanItem[]>([]);"],
]);

// WhatsApp is opt-in: defaults and missing local settings never silently enable sends.
patchFile("lib/whatsapp-shared.ts", [
  ["  auto_send_pos: true,", "  auto_send_pos: false,"],
  ["  auto_send_quick: true,", "  auto_send_quick: false,"],
  ["  auto_send_payment: true,", "  auto_send_payment: false,"],
  ["  auto_send_due_reminder: true,", "  auto_send_due_reminder: false,"],
  ["  auto_send_document_ready: true,", "  auto_send_document_ready: false,"],
  ["  auto_send_aeps: true,", "  auto_send_aeps: false,"],
  ["  auto_send_dmt: true,", "  auto_send_dmt: false,"],
  ["  auto_send_recharge: true,", "  auto_send_recharge: false,"],
  ["  auto_send_financial_alerts: true,", "  auto_send_financial_alerts: false,"],
]);
patchFile("lib/whatsapp.ts", [
  ["parsed.auto_send_pos ?? parsed.automations?.auto_send_pos ?? true", "parsed.auto_send_pos ?? parsed.automations?.auto_send_pos ?? false"],
  ["parsed.auto_send_business ?? parsed.automations?.auto_send_aeps ?? true", "parsed.auto_send_business ?? parsed.automations?.auto_send_aeps ?? false"],
]);

// Financial ledger: the database RPC is the only mutation path. Never fall back to
// independent customer/invoice/cash writes from the browser.
patchFile("components/finance/ledger-client.tsx", [
  [
    ".select(\"id, invoice_number, total, paid, due, status, invoice_date\")",
    ".select(\"id, invoice_number, total, paid, due, status, invoice_date, due_date\")",
  ],
  [
    "const invDate = new Date(inv.invoice_date || \"\").getTime();",
    "const invDate = new Date(inv.due_date || inv.invoice_date || \"\").getTime();",
  ],
  [
    "const closing = filtered.length ? Number(filtered[0].balance_after) : Number(selected?.balance ?? 0);",
    "const closing = Number(selected?.balance ?? 0);",
  ],
]);

patchBetween(
  "components/finance/ledger-client.tsx",
  "    let { error } = await supabase.rpc(\"adjust_customer_ledger\", {\n",
  "    setPayBusy(false);\n    if (error) {\n",
  "    const { error } = await supabase.rpc(\"record_customer_payment_atomic\", {\n      p_customer_id: customerId,\n      p_entry_date: payDate,\n      p_amount: amt,\n      p_method: payMethod,\n      p_description: payRemarks.trim() || `Payment received via ${payMethod.toUpperCase()}`,\n    });\n\n"
);

// Manual customer adjustments also use the protected database RPC only.
patchBetween(
  "components/finance/ledger-client.tsx",
  "    let { error } = await supabase.rpc(\"adjust_customer_ledger\", {\n",
  "    setAdjustBusy(false);\n    if (error) {\n",
  "    const { error } = await supabase.rpc(\"adjust_customer_ledger\", {\n      p_customer_id: customerId,\n      p_entry_date: adjustDate,\n      p_type: \"adjustment\",\n      p_direction: adjustDirection,\n      p_amount: amt,\n      p_method: \"cash\",\n      p_description: desc,\n    });\n\n"
);

// Settlement creation already posts its complete money trail through the canonical
// RPC and settlement trigger. Remove browser-created duplicate bank cash legs.
patchBetween(
  "components/finance/settlements-client.tsx",
  "    const sType = payload.p_settlement_type;\n",
  "\n    logAudit({\n",
  ""
);

// Reversal is an accounting event. Never delete its original cash/journal evidence.
patchFile("components/finance/settlements-client.tsx", [
  [
    "\n    await supabase.from(\"cash_entries\").delete().eq(\"ref_type\", \"settlement\").eq(\"ref_id\", reverseTarget.id);\n",
    "\n",
  ],
  [
    "Current available balances across physical cash drawer, bank accounts, and channel floats (Derived from opening positions and ledger movements — NOT settlement transactions).",
    "Current available balances across physical cash drawer, bank accounts, and channel floats (Derived from canonical payment-instrument and cash-entry balances).",
  ],
]);

console.log("Production safety and financial integrity patches applied.");
