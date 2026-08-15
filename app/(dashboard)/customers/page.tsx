import { createClient } from "@/lib/supabase/server";
import CustomersClient from "@/components/customers/customers-client";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (q) query = query.ilike("name", `%${q}%`);

  const { data: customers } = await query;

  return <CustomersClient initialCustomers={(customers ?? []) as any} />;
}
