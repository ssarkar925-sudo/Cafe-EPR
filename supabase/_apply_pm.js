const pg = require("C:\\Users\\SAIKAT\\Documents\\sccomm-web\\node_modules\\pg");
const fs = require("fs");
const { Client } = pg;
const sql = fs.readFileSync("C:\\Users\\SAIKAT\\Documents\\sccomm-web\\supabase\\payment-methods.sql", "utf8");
const client = new Client({ connectionString: "postgresql://postgres.tvxehxnvuwojjbhysajp:Saikat925sana@aws-0-ap-south-1.pooler.supabase.com:5432/postgres" });
(async () => {
  await client.connect();
  await client.query(sql);
  const pm = await client.query("select method, label, is_active, sort_order from payment_methods order by sort_order");
  console.log("payment_methods:", pm.rows.map(r => `${r.label}(${r.method})`).join(", "));
  const cust = await client.query("select column_name from information_schema.columns where table_schema='public' and table_name='customers' and column_name='customer_type'");
  console.log("customers.customer_type:", cust.rows.length ? "ok" : "MISSING");
  const st = await client.query("select column_name from information_schema.columns where table_schema='public' and table_name='settings' and column_name in ('gstin','tax_rate')");
  console.log("settings.gstin/tax_rate:", st.rows.map(r=>r.column_name).join(", "));
  await client.query("notify pgrst, 'reload schema'");
  console.log("schema reloaded");
  await client.end();
})().catch(async e => { console.error(e.message); await client.end(); process.exit(1); });
