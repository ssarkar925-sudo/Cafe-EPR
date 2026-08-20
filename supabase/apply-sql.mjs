// Applies one or more .sql files to the Supabase Postgres database.
//
// Usage:
//   DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres" \
//     node supabase/apply-sql.mjs supabase/hardening.sql
//
// Multiple files run in the order given. Runs each statement via a single
// implicit transaction block so a failure rolls everything back.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "Missing DATABASE_URL. Set it to your Supabase direct/transaction pool connection string."
  );
  process.exit(1);
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: node supabase/apply-sql.mjs <file.sql> [more.sql ...]");
  process.exit(1);
}

// Split on statement-ending semicolons at end of line (ignores ones inside
// plpgsql bodies, which end with $$; not ; followed by a newline).
function splitStatements(sql) {
  const out = [];
  let buf = "";
  let inDollar = false;
  let dollarTag = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (!inDollar) {
      if (ch === "$") {
        const m = sql.slice(i).match(/^\$[A-Za-z_0-9]*\$/);
        if (m) {
          inDollar = true;
          dollarTag = m[0];
        }
      }
      buf += ch;
      if (ch === ";" && (next === "\n" || next === "\r" || next === undefined)) {
        out.push(buf.trim());
        buf = "";
        i++;
        while (i < sql.length && (sql[i] === "\n" || sql[i] === "\r")) i++;
        i--;
      }
    } else {
      buf += ch;
      if (sql.startsWith(dollarTag, i)) {
        buf += dollarTag.slice(1);
        i += dollarTag.length - 1;
        inDollar = false;
        dollarTag = null;
      }
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter((s) => s && !/^\s*--/.test(s));
}

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  for (const f of files) {
    const sql = readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8");
    const stmts = splitStatements(sql);
    console.log(`Applying ${f} (${stmts.length} statements)...`);
    await client.query("begin");
    try {
      for (const s of stmts) {
        await client.query(s);
      }
      await client.query("commit");
      console.log(`OK ${f}`);
    } catch (err) {
      await client.query("rollback");
      console.error(`FAILED ${f}:`, err.message);
      process.exit(1);
    }
  }
  console.log("All files applied.");
} catch (err) {
  console.error("Connection error:", err.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}