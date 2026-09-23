import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
let failures = 0;
const check = (name, ok) => ok ? console.log("PASS " + name) : (failures++, console.log("FAIL " + name));

const migration = "greenfield/migrations/V1_015__returns_refunds.sql";
const contracts = read("lib/v1/v1-contracts.ts");
const rpc = read("lib/v1/v1-rpc.ts");
const proxy = read("app/api/pos/financial-rpc/route.ts");
const sql = read(migration);

check("migration exists", existsSync(join(root, migration)));
check("approved proportional rule documented", read("docs/architecture/v1-returns-refunds-mini-spec.md").includes("proportional allocation"));
check("return documents", sql.includes("CREATE TABLE public.return_documents"));
check("return lines", sql.includes("CREATE TABLE public.return_lines"));
check("return lot trace", sql.includes("CREATE TABLE public.return_line_lots"));
check("refund records", sql.includes("CREATE TABLE public.refund_records"));
check("khata and cash only", sql.includes("khata_credit") && sql.includes("cash"));
check("partial quantity guard", sql.includes("Return qty exceeds remaining returnable qty"));
check("row locking", sql.includes("FOR UPDATE"));
check("original lot restoration", sql.includes("original_invoice_line_lot_id") && sql.includes("qty_remaining = l.qty_remaining + v_take"));
check("damaged quarantine", sql.includes("v_rl.disposition = 'damaged'") && sql.includes("'quarantined'"));
check("expired return quarantine", sql.includes("l.expiry_date <= CURRENT_DATE"));
check("approval request", sql.includes("public.request_approval("));
check("approval consumed gate", sql.includes("a.status = 'consumed'") && sql.includes("a.action = 'return_refund'"));
check("cash instrument validation", sql.includes("pi.itype = 'cash'"));
check("instrument account mapping", sql.includes("instrument_account_map"));
check("return journal source", sql.includes("'return'"));
check("sales reversal", sql.includes("'4000'") && sql.includes("'1300'"));
check("FIFO COGS reversal", sql.includes("'1200'") && sql.includes("'5000'"));
check("idempotent request", sql.includes("idempotency_begin('request_return'"));
check("idempotent execute", sql.includes("idempotency_begin('execute_return'"));
check("idempotent cancel", sql.includes("idempotency_begin('cancel_return'"));
check("locked period delegated to post_journal", sql.includes("public.post_journal("));
check("audit linkage", sql.includes("public.append_audit("));
check("posted return immutable by RPC contract", sql.includes("Only requested or rejected returns can be cancelled"));
check("journal source type contract", contracts.includes('| "return"'));
check("return parameter contract", contracts.includes("V1RequestReturnParams"));
check("return RPC allowlist", rpc.includes('"request_return"') && rpc.includes('"execute_return"') && rpc.includes('"cancel_return"'));
check("return RPC proxy allowlist", proxy.includes('"request_return"') && proxy.includes('"execute_return"') && proxy.includes('"cancel_return"'));
check("return RPC idempotency set", rpc.includes('"request_return"') && rpc.includes('"execute_return"') && rpc.includes('"cancel_return"'));
check("no legacy return RPC", !sql.includes("process_return"));
check("no payment claim refund", !sql.match(/INSERT INTO public\.payment_claims[\s\S]{0,5000}refund/));
check("no GST computation", !/CGST|SGST|IGST|tax_amount|gst_amount/i.test(sql));

if (failures) {
  console.log("V1_RETURNS_REFUNDS_CONTRACT_FAILED (" + failures + ")");
  process.exit(1);
}
console.log("V1_RETURNS_REFUNDS_CONTRACT_PASSED");
