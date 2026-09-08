import fs from "node:fs";
import path from "node:path";

const file = path.resolve("app/(dashboard)/finance/accounts/page.tsx");
let source = fs.readFileSync(file, "utf8");

const oldSelect = '.select("id, name, type, is_active, opening_balance, details, created_at")';
const newSelect = '.select("id, name, type, is_active, opening_balance, current_balance, details, created_at")';

if (source.includes(oldSelect)) {
  source = source.replace(oldSelect, newSelect);
} else if (!source.includes(newSelect)) {
  throw new Error("finance/accounts/page.tsx: payment instrument select marker not found");
}

fs.writeFileSync(file, source);
console.log("Patched Finance Accounts to load payment_instruments.current_balance as canonical position.");
