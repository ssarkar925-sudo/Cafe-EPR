import fs from "node:fs";
import path from "node:path";

function patch(filePath, replacements) {
  const file = path.resolve(filePath);
  let source = fs.readFileSync(file, "utf8");
  for (const [from, to] of replacements) {
    if (!source.includes(from)) throw new Error(`${filePath}: expected source fragment not found`);
    source = source.replace(from, to);
  }
  fs.writeFileSync(file, source);
}

// P&L must consume posted journals only. journal_lines by themselves can include
// draft/unposted entries and would inflate revenue/expense balances.
patch("app/(dashboard)/reports/profit-loss/page.tsx", [
  [
    '    .from("journal_lines")\n    .select("debit,credit,account_id,accounting_accounts!inner(code,name,account_type)")\n    .in("accounting_accounts.code", accountIds.length ? accountIds : ["__none__"]);',
    '    .from("journal_lines")\n    .select("debit,credit,account_id,accounting_accounts!inner(code,name,account_type),journal_entries!inner(status)")\n    .eq("journal_entries.status", "posted")\n    .in("accounting_accounts.code", accountIds.length ? accountIds : ["__none__"]);',
  ],
]);

// Income report: POS invoices represent taxable operating revenue plus tax liability.
// Do not treat the GST-inclusive invoice total as income. Pass taxable revenue and expose
// the gross tax separately in the source row for future reporting extensions.
patch("app/(dashboard)/reports/income/page.tsx", [
  [
    '      .select("id, invoice_number, invoice_date, total, status, created_at")',
    '      .select("id, invoice_number, invoice_date, total, total_taxable_value, total_cgst, total_sgst, total_igst, status, created_at")',
  ],
  [
    '    amount: Number(i.total) || 0,\n    service_fee: 0,\n    portal_charge: 0,\n    portal_commission: 0,',
    '    amount: Number(i.total_taxable_value ?? i.total) || 0,\n    service_fee: 0,\n    portal_charge: 0,\n    portal_commission: 0,',
  ],
]);

console.log("Financial reporting root repairs applied: posted-only P&L GL and GST-exclusive POS income.");
