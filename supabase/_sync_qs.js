const fs = require("fs");
const path = require("path");

const dir = __dirname;
const qs = fs.readFileSync(path.join(dir, "quick-sales.sql"), "utf8");
const addExpense = qs.slice(qs.indexOf("-- Extend add_expense"));

// pos.sql: replace from module marker to EOF with full canonical content
const pos = fs.readFileSync(path.join(dir, "pos.sql"), "utf8");
const posMarker = "-- Quick Sale module (canonical: supabase/quick-sales.sql)";
const posIdx = pos.indexOf(posMarker);
if (posIdx < 0) throw new Error("pos.sql marker not found");
fs.writeFileSync(path.join(dir, "pos.sql"), pos.slice(0, posIdx) + qs);
console.log("pos.sql synced");

// schema.sql: replace from module marker to EOF with full canonical content
const schema = fs.readFileSync(path.join(dir, "schema.sql"), "utf8");
const schemaIdx = schema.indexOf(posMarker);
if (schemaIdx < 0) throw new Error("schema.sql marker not found");
fs.writeFileSync(path.join(dir, "schema.sql"), schema.slice(0, schemaIdx) + qs);
console.log("schema.sql synced");

// finance.sql: replace the old 5-arg add_expense block with the new one
const finance = fs.readFileSync(path.join(dir, "finance.sql"), "utf8");
const fmStart = finance.indexOf("-- Add an expense + cash book entry atomically");
if (fmStart < 0) throw new Error("finance.sql add_expense marker not found");
const fmEnd = finance.indexOf("\n$$;", fmStart);
if (fmEnd < 0) throw new Error("finance.sql add_expense end not found");
fs.writeFileSync(
  path.join(dir, "finance.sql"),
  finance.slice(0, fmStart) + addExpense.trimEnd() + "\n" + finance.slice(fmEnd + 4)
);
console.log("finance.sql synced");