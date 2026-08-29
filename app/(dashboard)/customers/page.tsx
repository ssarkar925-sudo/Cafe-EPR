import { createClient } from "@/lib/supabase/server";
import CustomersClient from "@/components/customers/customers-client";
import CustomersOpsStrip from "@/components/customers/customers-ops-strip";

export const dynamic = "force-dynamic";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const search = q?.trim() ?? "";

  // Customer List is intentionally empty until the user searches.
  // This avoids loading/showing the complete customer database on first open.
  let rows: any[] = [];
  if (search.length > 0) {
    const { data: customers } = await supabase
      .from("customers")
      .select("*")
      .or(`name.ilike.%${search}%,phone.ilike.%${search}%,code.ilike.%${search}%,email.ilike.%${search}%`)
      .order("created_at", { ascending: false })
      .limit(500);
    rows = (customers ?? []) as any[];
  }

  return (
    <div className="space-y-4">
      <CustomersOpsStrip customers={rows} />
      <CustomersClient initialCustomers={rows} />
    </div>
  );
}
