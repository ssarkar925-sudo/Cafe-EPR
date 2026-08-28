import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import Link from "next/link";
import CatalogOpsStrip from "@/components/catalog/catalog-ops-strip";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");
  const supabase = await createClient();
  const [{ data: products }, { data: services }] = await Promise.all([
    supabase.from("products").select("id,name,stock_qty,stock_quantity,reorder_level,cost_price,sale_price,gst_rate,is_active").limit(500),
    supabase.from("services").select("id,name,sale_price,gst_rate,is_active,is_quick_favorite").limit(500),
  ]);
  const p = (products ?? []) as any[]; const s = (services ?? []) as any[];
  return <div className="space-y-6"><CatalogOpsStrip products={p} services={s} /><div className="grid gap-4 md:grid-cols-2"><Link href="/catalog/products" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md dark:border-white/10 dark:bg-slate-900"><div className="text-xs font-bold uppercase tracking-wider text-blue-600">Inventory catalog</div><h1 className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">Products →</h1><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Manage pricing, stock, GST, HSN, categories and product availability.</p></Link><Link href="/catalog/services" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md dark:border-white/10 dark:bg-slate-900"><div className="text-xs font-bold uppercase tracking-wider text-violet-600">Service catalog</div><h1 className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">Services →</h1><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Manage service pricing, GST/SAC and quick-favorite counter access.</p></Link></div></div>;
}
