import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const state = JSON.parse(fs.readFileSync(".ai-portal-state/erp-storage-state.json", "utf8"));
const cookie = state.cookies?.find((c) => c.name.includes("auth-token"));
let parsedToken = null;
if (cookie) {
  let val = cookie.value;
  if (val.startsWith("base64-")) val = Buffer.from(val.replace("base64-", ""), "base64").toString("utf8");
  parsedToken = JSON.parse(decodeURIComponent(val));
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://tvxehxnvuwojjbhysajp.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_u5-0p1SChKVIyI5qjPnMhg_bhrbzytQ";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  console.log("Attempting session refresh with refresh_token...");
  const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession({
    refresh_token: parsedToken.refresh_token,
  });

  if (refreshErr) {
    console.error("Refresh failed:", refreshErr.message);
    return;
  }

  const session = refreshData.session;
  console.log("✅ Authenticated successfully as:", session.user.email);

  // Authenticated client
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    },
  });

  const dates = ["2026-09-05", "2026-09-06"];

  // 1. Transactions (AEPS, DMT, UPI, Recharge, Bill Payment)
  const { data: txns, error: txnErr } = await client
    .from("transactions")
    .select("*, banks:aeps_banks(name), portals:aeps_portals(name), qrs:upi_merchant_qrs(display_name), providers:recharge_providers(name)")
    .in("transaction_date", dates)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });
  console.log("\n--- TRANSACTIONS (SERVICES) ---");
  console.log("Count:", txns ? txns.length : 0, txnErr ? txnErr.message : "OK");
  if (txns && txns.length > 0) {
    console.log(JSON.stringify(txns, null, 2));
  }

  // 2. Invoices (POS Sales)
  const { data: invs, error: invErr } = await client
    .from("invoices")
    .select("*, invoice_items(*), payments(*), customers(name, phone)")
    .in("invoice_date", dates)
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false });
  console.log("\n--- INVOICES (POS) ---");
  console.log("Count:", invs ? invs.length : 0, invErr ? invErr.message : "OK");
  if (invs && invs.length > 0) {
    console.log(JSON.stringify(invs, null, 2));
  }

  // 3. Quick Sales
  const { data: quick, error: quickErr } = await client
    .from("quick_sales")
    .select("*, customers(name, phone)")
    .in("sale_date", dates)
    .order("sale_date", { ascending: false })
    .order("created_at", { ascending: false });
  console.log("\n--- QUICK SALES ---");
  console.log("Count:", quick ? quick.length : 0, quickErr ? quickErr.message : "OK");
  if (quick && quick.length > 0) {
    console.log(JSON.stringify(quick, null, 2));
  }

  // 4. Cash Entries (Cashbook)
  const { data: cash, error: cashErr } = await client
    .from("cash_entries")
    .select("*, payment_instruments(name, type)")
    .in("entry_date", dates)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });
  console.log("\n--- CASH ENTRIES (CASHBOOK) ---");
  console.log("Count:", cash ? cash.length : 0, cashErr ? cashErr.message : "OK");
  if (cash && cash.length > 0) {
    console.log(JSON.stringify(cash, null, 2));
  }

  // 5. Settlements
  const { data: setts, error: settErr } = await client
    .from("settlements")
    .select("*")
    .in("settlement_date", dates)
    .order("settlement_date", { ascending: false });
  console.log("\n--- SETTLEMENTS ---");
  console.log("Count:", setts ? setts.length : 0, settErr ? settErr.message : "OK");
  if (setts && setts.length > 0) {
    console.log(JSON.stringify(setts, null, 2));
  }

  // 6. Expenses
  const { data: exps, error: expErr } = await client
    .from("expenses")
    .select("*")
    .in("expense_date", dates)
    .order("expense_date", { ascending: false });
  console.log("\n--- EXPENSES ---");
  console.log("Count:", exps ? exps.length : 0, expErr ? expErr.message : "OK");
  if (exps && exps.length > 0) {
    console.log(JSON.stringify(exps, null, 2));
  }

  // 7. Double-entry Journal Entries
  const { data: journals, error: jourErr } = await client
    .from("journal_entries")
    .select("*, journal_lines(*, accounting_accounts(code, name, account_type))")
    .in("entry_date", dates)
    .order("entry_date", { ascending: false });
  console.log("\n--- JOURNAL ENTRIES ---");
  console.log("Count:", journals ? journals.length : 0, jourErr ? jourErr.message : "OK");

  // 8. Day Close Registers
  const { data: closes, error: closeErr } = await client
    .from("day_close_register")
    .select("*")
    .in("close_date", dates);
  console.log("\n--- DAY CLOSE REGISTERS ---");
  console.log("Count:", closes ? closes.length : 0, closeErr ? closeErr.message : "OK");
  if (closes && closes.length > 0) {
    console.log(JSON.stringify(closes, null, 2));
  }

  // 9. Summary and distinct recent dates
  const { data: recentTxns } = await client
    .from("transactions")
    .select("transaction_date")
    .order("transaction_date", { ascending: false })
    .limit(20);
  console.log("\nRecent transaction dates in DB:", [...new Set(recentTxns?.map(r => r.transaction_date))]);

  const { data: recentInvs } = await client
    .from("invoices")
    .select("invoice_date")
    .order("invoice_date", { ascending: false })
    .limit(20);
  console.log("Recent invoice dates in DB:", [...new Set(recentInvs?.map(r => r.invoice_date))]);

  const { data: recentCash } = await client
    .from("cash_entries")
    .select("entry_date")
    .order("entry_date", { ascending: false })
    .limit(20);
  console.log("Recent cash entry dates in DB:", [...new Set(recentCash?.map(r => r.entry_date))]);
}

main().catch(console.error);
