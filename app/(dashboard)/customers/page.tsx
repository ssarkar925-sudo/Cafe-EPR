import { createClient } from "@/lib/supabase/server";
import CustomersClient from "@/components/customers/customers-client";
import CustomersOpsStrip from "@/components/customers/customers-ops-strip";

export const dynamic = "force-dynamic";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const search = q?.trim() ?? "";

  // Show the complete customer directory on first open.
  // When a query is present, keep the existing server-side search behavior.
  let customerQuery = supabase
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (search.length > 0) {
    customerQuery = customerQuery.or(
      `name.ilike.%${search}%,phone.ilike.%${search}%,code.ilike.%${search}%,email.ilike.%${search}%`
    );
  }

  const { data: customers } = await customerQuery;
  const rows = (customers ?? []) as any[];

  return (
    <div className="space-y-4">
      <CustomersOpsStrip customers={rows} />
      <CustomersClient initialCustomers={rows} />
    </div>
  );
}
