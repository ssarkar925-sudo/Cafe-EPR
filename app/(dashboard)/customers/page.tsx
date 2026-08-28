import { createClient } from "@/lib/supabase/server";
import CustomersClient from "@/components/customers/customers-client";
import CustomersOpsStrip from "@/components/customers/customers-ops-strip";

export const dynamic = "force-dynamic";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const supabase = await createClient();
  let query = supabase.from("customers").select("*").order("created_at", { ascending: false }).limit(500);
  if (q) query = query.ilike("name", `%${q}%`);
  const { data: customers } = await query;
  const rows = (customers ?? []) as any[];
  return <div className="space-y-4"><CustomersOpsStrip customers={rows} /><CustomersClient initialCustomers={rows} /></div>;
}
