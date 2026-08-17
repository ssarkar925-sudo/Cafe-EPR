const pg = require("C:\\Users\\SAIKAT\\Documents\\sccomm-web\\node_modules\\pg");
const fs = require("fs");
const { Client } = pg;
const base = "C:\\Users\\SAIKAT\\Documents\\sccomm-web\\supabase\\";
const sql = ["payment-accounts.sql", "catalog-masters.sql"]
  .map((f) => fs.readFileSync(base + f, "utf8"))
  .join("\n\n");
const client = new Client({ connectionString: "postgresql://postgres.tvxehxnvuwojjbhysajp:Saikat925sana@aws-0-ap-south-1.pooler.supabase.com:5432/postgres" });
(async () => {
  await client.connect();
  await client.query(sql);
  const inst = await client.query(
    "select column_name from information_schema.columns where table_schema='public' and table_name='payment_instruments' and column_name in ('details','opening_balance') order by column_name"
  );
  console.log("payment_instruments.details/opening_balance:", inst.rows.map((r) => r.column_name).join(", "));
  const br = await client.query("select count(*)::int as n from brands");
  console.log("brands rows:", br.rows[0].n);
  const un = await client.query("select count(*)::int as n from units");
  console.log("units rows:", un.rows[0].n);
  await client.query("notify pgrst, 'reload schema'");
  console.log("schema reloaded");
  await client.end();
})().catch(async (e) => { console.error(e.message); await client.end(); process.exit(1); });