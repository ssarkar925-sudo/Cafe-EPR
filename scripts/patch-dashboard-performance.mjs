import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "app", "(dashboard)", "dashboard", "page.tsx");

if (!fs.existsSync(file)) {
  console.warn("Dashboard performance patch skipped: file not found");
  process.exit(0);
}

let source = fs.readFileSync(file, "utf8");

const replacements = [
  [
    'import { getUserRole } from "@/lib/authz";\n',
    "",
  ],
  [
    '    { data: { user } },\n    role,\n    settingsRes,\n    poolBalancesRes,',
    '    { data: { user } },\n    settingsRes,\n    profileRes,\n    poolBalancesRes,',
  ],
  [
    '    supabase.auth.getUser().catch(() => ({ data: { user: null }, error: null })),\n    getUserRole(),\n    supabase.from("settings").select("shop_name, gstin, currency_symbol").single(),\n    supabase.rpc("get_pool_balances"),',
    '    supabase.auth.getUser().catch(() => ({ data: { user: null }, error: null })),\n    supabase.from("settings").select("shop_name, gstin, currency_symbol").single(),\n    supabase.from("profiles").select("full_name, avatar_url, role").eq("id", user?.id || "").single(),\n    supabase.rpc("get_pool_balances"),',
  ],
  [
    '  const profile = user\n    ? (await supabase.from("profiles").select("full_name, avatar_url, role").eq("id", user.id).single()).data\n    : null;\n\n  const userRole = (role || profile?.role || "admin") as "admin" | "manager" | "staff";',
    '  const profile = profileRes.data || null;\n  const userRole = (profile?.role || "admin") as "admin" | "manager" | "staff";',
  ],
];

let changed = false;
for (const [from, to] of replacements) {
  if (source.includes(from)) {
    source = source.replace(from, to);
    changed = true;
  }
}

if (source.includes('import { getUserRole } from "@/lib/authz";') || source.includes('    role,\n') || source.includes('    getUserRole(),\n')) {
  throw new Error("Dashboard performance patch incomplete: duplicate auth/profile calls remain");
}

if (changed) {
  fs.writeFileSync(file, source);
  console.log("Dashboard performance patch applied");
} else {
  console.log("Dashboard performance patch already applied");
}
