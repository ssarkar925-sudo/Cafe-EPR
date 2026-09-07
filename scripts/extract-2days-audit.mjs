import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Function to get service role key dynamically from Supabase API using management token
async function getServiceKey() {
  const tok = 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjEwYjMwYWUwLTg0ZTktNDMwYy04NjhjLTMxMmIwZGFhOTNlZiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2FsdC5zdXBhYmFzZS5pby9hdXRoL3YxIiwic3ViIjoiNzlhY2M1OGMtMDQ4ZC00ZDNkLWFkODgtZDM4NjMyMTQyYmEzIiwiYXVkIjoiYXV0aGVudGljYXRlZCIsImV4cCI6MTc4ODcwMTQ3NSwiaWF0IjoxNzg4Njk5Njc1LCJlbWFpbCI6InNzYXJrYXI5MjVAZ21haWwuY29tIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJnaXRodWIiLCJwcm92aWRlcnMiOlsiZ2l0aHViIl19LCJ1c2VyX21ldGFkYXRhIjp7ImF2YXRhcl91cmwiOiJodHRwczovL2F2YXRhcnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvMjI5Njk4ODIwP3Y9NCIsImVtYWlsIjoic3NhcmthcjkyNUBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiaXNzIjoiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbSIsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwicHJlZmVycmVkX3VzZXJuYW1lIjoic3NhcmthcjkyNS1zdWRvIiwicHJvdmlkZXJfaWQiOiIyMjk2OTg4MjAiLCJzdWIiOiIyMjk2OTg4MjAiLCJ1c2VyX25hbWUiOiJzc2Fya2FyOTI1LXN1ZG8ifSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJvYXV0aCIsInRpbWVzdGFtcCI6MTc4ODA4MzM1OH1dLCJzZXNzaW9uX2lkIjoiN2EzNTQ1NDYtNDMzNC00ZDRmLWFlZWMtMWVjODc3OGEwNDhmIiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.fZ4woYeGVs3tJilx2cto2gcUgd5CyMrwsZhA3HyyppppJmcPTG62ODEjPcEtuF9WBncZl3vGl5WQFQeMxh5eGIlVc1sGnbG26kbIKotmMM_41o44R3sgrSXduQw-6iCvRIQz9T3aGoeWifB1tonafdRt-IWCgAwygoavWvciEuHszxH1UNjzyohnJcILtz50BcINUtuv0nsbxYrfCybtIPDO6rMXYiyE-swbwfY4ci8zkcdj6nXsrNyF_dl0ZT7imPveKRDq4S-CtgUtFDa_hzGCkFJo50w-c3po_w5r0erPRephwPwJNThXCXNfGlQMx4rc5dQJKkO3IzDaW_J29w';
  const r = await fetch('https://api.supabase.com/v1/projects/tvxehxnvuwojjbhysajp/api-keys', {
    headers: { Authorization: 'Bearer ' + tok }
  });
  if (!r.ok) throw new Error("Failed to get API keys: " + r.statusText);
  const keys = await r.json();
  const serviceKey = keys.find(k => k.name === 'service_role')?.api_key;
  if (!serviceKey) throw new Error("Service key not found");
  return serviceKey;
}

async function main() {
  const serviceKey = await getServiceKey();
  const SUPABASE_URL = "https://tvxehxnvuwojjbhysajp.supabase.co";
  const supabase = createClient(SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const dates = ["2026-09-05", "2026-09-06"];
  console.log("Extracting all financial data for dates:", dates);

  // 1. Transactions
  const { data: txns, error: txnErr } = await supabase
    .from("transactions")
    .select("*, banks:aeps_banks(name), portals:aeps_portals(name), qrs:upi_merchant_qrs(display_name), providers:recharge_providers(name)")
    .in("transaction_date", dates)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });

  // 2. Invoices & Items & Payments
  const { data: invs, error: invErr } = await supabase
    .from("invoices")
    .select("*, invoice_items(*), payments(*), customers(name, phone)")
    .in("invoice_date", dates)
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false });

  // 3. Quick Sales
  const { data: quick, error: quickErr } = await supabase
    .from("quick_sales")
    .select("*, customers(name, phone)")
    .in("sale_date", dates)
    .order("sale_date", { ascending: false })
    .order("created_at", { ascending: false });

  // 4. Cash Entries
  const { data: cash, error: cashErr } = await supabase
    .from("cash_entries")
    .select("*, payment_instruments(name, type)")
    .in("entry_date", dates)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });

  // 5. Settlements
  const { data: setts, error: settErr } = await supabase
    .from("settlements")
    .select("*")
    .in("settlement_date", dates)
    .order("settlement_date", { ascending: false });

  // 6. Expenses
  const { data: exps, error: expErr } = await supabase
    .from("expenses")
    .select("*")
    .in("expense_date", dates)
    .order("expense_date", { ascending: false });

  // 7. General Journal Entries
  const { data: journals, error: jourErr } = await supabase
    .from("journal_entries")
    .select("*, journal_lines(*, accounting_accounts(code, name, account_type))")
    .in("entry_date", dates)
    .order("entry_date", { ascending: false });

  // 8. Day Close Registers
  const { data: closes, error: closeErr } = await supabase
    .from("day_close_register")
    .select("*")
    .in("close_date", dates);

  // 9. Payment Instruments Live Balances
  const { data: instruments } = await supabase
    .from("payment_instruments")
    .select("*")
    .order("type");

  // 10. RPC Pool Balances
  const { data: poolBalances } = await supabase.rpc("get_pool_balances");

  // 11. RPC PnL
  const { data: pnlToday } = await supabase.rpc("get_pnl", { p_from: "2026-09-06", p_to: "2026-09-06" });
  const { data: pnlYesterday } = await supabase.rpc("get_pnl", { p_from: "2026-09-05", p_to: "2026-09-05" });
  const { data: pnlCombined } = await supabase.rpc("get_pnl", { p_from: "2026-09-05", p_to: "2026-09-06" });

  // 12. Run Self Audit
  const { data: selfAudit } = await supabase.rpc("run_canonical_self_audit", { p_triggered_by: "financial_audit_last2days" });

  const result = {
    dates,
    counts: {
      transactions: txns?.length || 0,
      invoices: invs?.length || 0,
      quick_sales: quick?.length || 0,
      cash_entries: cash?.length || 0,
      settlements: setts?.length || 0,
      expenses: exps?.length || 0,
      journal_entries: journals?.length || 0,
      day_closes: closes?.length || 0,
      payment_instruments: instruments?.length || 0,
    },
    txns: txns || [],
    invoices: invs || [],
    quick_sales: quick || [],
    cash_entries: cash || [],
    settlements: setts || [],
    expenses: exps || [],
    journal_entries: journals || [],
    day_closes: closes || [],
    payment_instruments: instruments || [],
    poolBalances: poolBalances || {},
    pnl: {
      yesterday: pnlYesterday,
      today: pnlToday,
      combined: pnlCombined,
    },
    selfAudit: selfAudit || {},
  };

  const outPath = "C:/Users/SAIKAT/.gemini/antigravity/brain/189ee853-cdbb-4831-96ae-282c7d3134c4/scratch/extracted-financial-data.json";
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

  console.log("Extraction complete!");
  console.log("Summary of counts for 2026-09-05 & 2026-09-06:");
  console.log(result.counts);
}

main().catch(console.error);
