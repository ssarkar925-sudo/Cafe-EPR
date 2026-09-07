import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const rawEnv = dotenv.parse(fs.readFileSync(".vercel/.env.preview.local"));
const SUPABASE_URL = (rawEnv.NEXT_PUBLIC_SUPABASE_URL || "https://tvxehxnvuwojjbhysajp.supabase.co").replace(/^["']|["']$/g, "").trim();
const SERVICE_KEY = (rawEnv.SUPABASE_SERVICE_ROLE_KEY || "").replace(/^["']|["']$/g, "").trim();

console.log("Connecting to Supabase at:", SUPABASE_URL);

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const dates = ["2026-09-05", "2026-09-06"];
  console.log("Querying Supabase database for dates:", dates);

  // 1. Transactions (AEPS, DMT, UPI, Recharge, Bill Payment)
  const { data: txns, error: txnErr } = await supabase
    .from("transactions")
    .select("*, banks:aeps_banks(name), portals:aeps_portals(name), qrs:upi_merchant_qrs(display_name), providers:recharge_providers(name)")
    .in("transaction_date", dates)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });

  console.log("\n=======================================================");
  console.log(`1. TRANSACTIONS (DIGITAL & BANK SERVICES) — Count: ${txns?.length || 0}`);
  if (txnErr) console.error("Error:", txnErr);
  else {
    txns?.forEach(t => {
      console.log(`[${t.transaction_date}] #${t.transaction_number || t.id} | Type: ${t.service_type} | Mode: ${t.payment_mode || 'N/A'} | Amount: ₹${t.amount} | Fee: ₹${t.service_fee || 0} | Portal Chg: ₹${t.portal_charge || 0} | Portal Comm: ₹${t.portal_commission || 0} | Status: ${t.status} | Customer: ${t.customer_mobile || 'N/A'}`);
    });
  }

  // 2. Invoices (Retail POS Sales)
  const { data: invs, error: invErr } = await supabase
    .from("invoices")
    .select("*, invoice_items(*), payments(*), customers(name, phone)")
    .in("invoice_date", dates)
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false });

  console.log("\n=======================================================");
  console.log(`2. INVOICES (RETAIL POS BILLING) — Count: ${invs?.length || 0}`);
  if (invErr) console.error("Error:", invErr);
  else {
    invs?.forEach(inv => {
      console.log(`[${inv.invoice_date}] ${inv.invoice_number} | Total: ₹${inv.total} | Paid: ₹${inv.paid} | Due: ₹${inv.due} | Status: ${inv.status} | Customer: ${inv.customers?.name || 'Walk-in'} | Items: ${inv.invoice_items?.length || 0} | Payments: ${inv.payments?.map(p => `${p.method}:₹${p.amount}`).join(', ') || 'None'}`);
    });
  }

  // 3. Quick Sales (Fast POS Sales)
  const { data: quick, error: quickErr } = await supabase
    .from("quick_sales")
    .select("*, customers(name, phone)")
    .in("sale_date", dates)
    .order("sale_date", { ascending: false })
    .order("created_at", { ascending: false });

  console.log("\n=======================================================");
  console.log(`3. QUICK SALES (COUNTER FAST SALES) — Count: ${quick?.length || 0}`);
  if (quickErr) console.error("Error:", quickErr);
  else {
    quick?.forEach(q => {
      console.log(`[${q.sale_date}] ${q.sale_number || q.id} | Item: ${q.item_name} | Amount: ₹${q.amount} | Cost: ₹${q.cost || 0} | Status: ${q.status}`);
    });
  }

  // 4. Cash Entries (Cashbook Ledger)
  const { data: cash, error: cashErr } = await supabase
    .from("cash_entries")
    .select("*, payment_instruments(name, type)")
    .in("entry_date", dates)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });

  console.log("\n=======================================================");
  console.log(`4. CASH ENTRIES (CASHBOOK MOVEMENT) — Count: ${cash?.length || 0}`);
  if (cashErr) console.error("Error:", cashErr);
  else {
    cash?.forEach(c => {
      console.log(`[${c.entry_date}] ${c.direction.toUpperCase()} ₹${c.amount} | Method: ${c.method} | Instrument: ${c.payment_instruments?.name || 'N/A'} | RefType: ${c.ref_type || 'N/A'} | RefId: ${c.ref_id || 'N/A'} | Desc: ${c.description}`);
    });
  }

  // 5. Settlements (Inter-Account Transfers)
  const { data: setts, error: settErr } = await supabase
    .from("settlements")
    .select("*")
    .in("settlement_date", dates)
    .order("settlement_date", { ascending: false });

  console.log("\n=======================================================");
  console.log(`5. SETTLEMENTS (POOL & ACCOUNT TRANSFERS) — Count: ${setts?.length || 0}`);
  if (settErr) console.error("Error:", settErr);
  else {
    setts?.forEach(s => {
      console.log(`[${s.settlement_date}] ${s.settlement_number || s.id} | ${s.from_pool} -> ${s.to_pool} | Amount: ₹${s.amount} | Status: ${s.status} | Note: ${s.remarks || s.reference}`);
    });
  }

  // 6. Expenses
  const { data: exps, error: expErr } = await supabase
    .from("expenses")
    .select("*")
    .in("expense_date", dates)
    .order("expense_date", { ascending: false });

  console.log("\n=======================================================");
  console.log(`6. EXPENSES (SHOP OVERHEADS) — Count: ${exps?.length || 0}`);
  if (expErr) console.error("Error:", expErr);
  else {
    exps?.forEach(e => {
      console.log(`[${e.expense_date}] Category: ${e.category} | Amount: ₹${e.amount} | Status: ${e.status} | Note: ${e.note || 'N/A'}`);
    });
  }

  // 7. Double-entry Journal Entries
  const { data: journals, error: jourErr } = await supabase
    .from("journal_entries")
    .select("*, journal_lines(*, accounting_accounts(code, name, account_type))")
    .in("entry_date", dates)
    .order("entry_date", { ascending: false });

  console.log("\n=======================================================");
  console.log(`7. GENERAL JOURNAL ENTRIES (DOUBLE-ENTRY) — Count: ${journals?.length || 0}`);
  if (jourErr) console.error("Error:", jourErr);
  else {
    journals?.forEach(j => {
      const dr = j.journal_lines?.reduce((s, l) => s + Number(l.debit || 0), 0);
      const cr = j.journal_lines?.reduce((s, l) => s + Number(l.credit || 0), 0);
      console.log(`[${j.entry_date}] ${j.entry_number} | Source: ${j.source_type} (${j.source_id}) | Dr: ₹${dr} | Cr: ₹${cr} | Diff: ₹${Math.abs(dr - cr)} | Desc: ${j.description}`);
      j.journal_lines?.forEach(l => {
        console.log(`    Line ${l.line_no}: ${l.accounting_accounts?.code} (${l.accounting_accounts?.name}) -> Dr: ₹${l.debit || 0}, Cr: ₹${l.credit || 0}`);
      });
    });
  }

  // 8. Day Close Register
  const { data: dayCloses, error: dcErr } = await supabase
    .from("day_close_register")
    .select("*")
    .in("close_date", dates);

  console.log("\n=======================================================");
  console.log(`8. DAY CLOSE REGISTERS — Count: ${dayCloses?.length || 0}`);
  if (dcErr) console.error("Error:", dcErr);
  else {
    dayCloses?.forEach(dc => {
      console.log(`[${dc.close_date}] Expected Cash: ₹${dc.expected_cash} | Actual Cash: ₹${dc.actual_cash} | Difference: ₹${dc.difference} | Status: ${dc.status}`);
    });
  }

  // 9. Payment Instruments (Current live balances in DB)
  const { data: instruments } = await supabase
    .from("payment_instruments")
    .select("*")
    .order("type");
  console.log("\n=======================================================");
  console.log(`9. PAYMENT INSTRUMENTS (LIVE BALANCES IN DB) — Count: ${instruments?.length || 0}`);
  instruments?.forEach(i => {
    console.log(`${i.name} (${i.type}): Live Balance = ₹${i.balance} (Opening: ₹${i.opening_balance})`);
  });

  // 10. RPC Pool Balances & PnL
  const { data: poolBal } = await supabase.rpc("get_pool_balances");
  console.log("\n=======================================================");
  console.log("10. RPC POOL BALANCES:", poolBal);

  const { data: pnlToday } = await supabase.rpc("get_pnl", { p_from: "2026-09-06", p_to: "2026-09-06" });
  console.log("\n11. RPC PNL TODAY (2026-09-06):", pnlToday);

  const { data: pnlYesterday } = await supabase.rpc("get_pnl", { p_from: "2026-09-05", p_to: "2026-09-05" });
  console.log("\n12. RPC PNL YESTERDAY (2026-09-05):", pnlYesterday);

  // 13. All recent dates across all tables to see when transactions exist
  const { data: allDatesTxn } = await supabase.from("transactions").select("transaction_date").order("transaction_date", { ascending: false }).limit(50);
  console.log("\n13. ALL RECENT DATES IN TRANSACTIONS:", [...new Set(allDatesTxn?.map(x => x.transaction_date))]);

  const { data: allDatesInv } = await supabase.from("invoices").select("invoice_date").order("invoice_date", { ascending: false }).limit(50);
  console.log("14. ALL RECENT DATES IN INVOICES:", [...new Set(allDatesInv?.map(x => x.invoice_date))]);

  const { data: allDatesCash } = await supabase.from("cash_entries").select("entry_date").order("entry_date", { ascending: false }).limit(50);
  console.log("15. ALL RECENT DATES IN CASH ENTRIES:", [...new Set(allDatesCash?.map(x => x.entry_date))]);

  const { data: allDatesQS } = await supabase.from("quick_sales").select("sale_date").order("sale_date", { ascending: false }).limit(50);
  console.log("16. ALL RECENT DATES IN QUICK SALES:", [...new Set(allDatesQS?.map(x => x.sale_date))]);
}

main().catch(console.error);
