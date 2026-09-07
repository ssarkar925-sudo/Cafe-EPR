import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://tvxehxnvuwojjbhysajp.supabase.co";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_u5-0p1SChKVIyI5qjPnMhg_bhrbzytQ";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  const dates = ["2026-09-05", "2026-09-06"];
  console.log("Checking records for dates:", dates);

  // 1. Transactions (AEPS, DMT, UPI, Recharge, Bill Payment)
  const { data: txns, error: txnErr } = await supabase
    .from("transactions")
    .select("*")
    .in("transaction_date", dates)
    .order("created_at", { ascending: false });

  console.log("\n--- TRANSACTIONS ---");
  if (txnErr) console.error("Error fetching transactions:", txnErr.message);
  else console.log(`Count: ${txns.length}`);

  // 2. Invoices (Retail POS)
  const { data: invs, error: invErr } = await supabase
    .from("invoices")
    .select("*, invoice_items(*), payments(*)")
    .in("invoice_date", dates)
    .order("created_at", { ascending: false });

  console.log("\n--- INVOICES ---");
  if (invErr) console.error("Error fetching invoices:", invErr.message);
  else console.log(`Count: ${invs.length}`);

  // 3. Quick Sales
  const { data: quick, error: quickErr } = await supabase
    .from("quick_sales")
    .select("*")
    .in("sale_date", dates)
    .order("created_at", { ascending: false });

  console.log("\n--- QUICK SALES ---");
  if (quickErr) console.error("Error fetching quick sales:", quickErr.message);
  else console.log(`Count: ${quick.length}`);

  // 4. Cash Entries (Cashbook)
  const { data: cash, error: cashErr } = await supabase
    .from("cash_entries")
    .select("*, payment_instruments(name, type)")
    .in("entry_date", dates)
    .order("created_at", { ascending: false });

  console.log("\n--- CASH ENTRIES ---");
  if (cashErr) console.error("Error fetching cash entries:", cashErr.message);
  else console.log(`Count: ${cash.length}`);

  // 5. Settlements
  const { data: setts, error: settErr } = await supabase
    .from("settlements")
    .select("*")
    .in("settlement_date", dates)
    .order("created_at", { ascending: false });

  console.log("\n--- SETTLEMENTS ---");
  if (settErr) console.error("Error fetching settlements:", settErr.message);
  else console.log(`Count: ${setts.length}`);

  // 6. Expenses
  const { data: exps, error: expErr } = await supabase
    .from("expenses")
    .select("*")
    .in("expense_date", dates)
    .order("created_at", { ascending: false });

  console.log("\n--- EXPENSES ---");
  if (expErr) console.error("Error fetching expenses:", expErr.message);
  else console.log(`Count: ${exps.length}`);

  // 7. Double-entry Journal Entries
  const { data: journals, error: jourErr } = await supabase
    .from("journal_entries")
    .select("*, journal_lines(*, accounting_accounts(*))")
    .in("entry_date", dates)
    .order("created_at", { ascending: false });

  console.log("\n--- JOURNAL ENTRIES ---");
  if (jourErr) console.error("Error fetching journal entries:", jourErr.message);
  else console.log(`Count: ${journals ? journals.length : 0}`);

  // Summary by date
  console.log("\n================ SUMMARY ================");
  for (const d of dates) {
    const tCount = (txns || []).filter(x => x.transaction_date === d).length;
    const iCount = (invs || []).filter(x => x.invoice_date === d).length;
    const qCount = (quick || []).filter(x => x.sale_date === d).length;
    const cCount = (cash || []).filter(x => x.entry_date === d).length;
    const sCount = (setts || []).filter(x => x.settlement_date === d).length;
    const eCount = (exps || []).filter(x => x.expense_date === d).length;
    const jCount = (journals || []).filter(x => x.entry_date === d).length;
    console.log(`Date: ${d}`);
    console.log(`  Transactions (Services): ${tCount}`);
    console.log(`  Invoices (POS):          ${iCount}`);
    console.log(`  Quick Sales:             ${qCount}`);
    console.log(`  Cash Entries (Cashbook): ${cCount}`);
    console.log(`  Settlements:             ${sCount}`);
    console.log(`  Expenses:                ${eCount}`);
    console.log(`  Journal Entries:         ${jCount}`);
  }

  // Also check all distinct dates available in database just in case dates are formatted differently or there are recent dates
  const { data: recentDates } = await supabase
    .from("cash_entries")
    .select("entry_date")
    .order("entry_date", { ascending: false })
    .limit(30);

  const distinctCashDates = [...new Set((recentDates || []).map(r => r.entry_date))];
  console.log("\nMost recent dates in cash_entries:", distinctCashDates.slice(0, 10));

  const { data: recentTxnDates } = await supabase
    .from("transactions")
    .select("transaction_date")
    .order("transaction_date", { ascending: false })
    .limit(30);

  const distinctTxnDates = [...new Set((recentTxnDates || []).map(r => r.transaction_date))];
  console.log("Most recent dates in transactions:", distinctTxnDates.slice(0, 10));
}

run().catch(console.error);
