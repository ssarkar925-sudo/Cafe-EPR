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

console.log("Production safety hardening patches applied.");
