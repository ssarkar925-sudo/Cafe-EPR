import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envLines = fs.readFileSync("E:/CafeERP/.env", "utf8").split("\n");
const env = {};
for (const line of envLines) {
  const match = line.match(/^\s*([\w_]+)\s*=\s*(.*)?\s*$/);
  if (match) env[match[1]] = (match[2] || "").trim().replace(/^["']|["']$/g, "");
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function main() {
  const { data, error } = await supabase.from("bill_payment_commission_config").select("*");
  console.log("Data:", data);
  console.log("Error:", error?.message);
}

main();
