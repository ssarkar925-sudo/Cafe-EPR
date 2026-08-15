import { createClient } from "@/lib/supabase/server";
import CashbookClient from "@/components/finance/cashbook-client";

export const dynamic = "force-dynamic";

export default async function CashbookPage() {
  const supabase = await createClient();

  const { data: entries } = await supabase
    .from("cash_entries")
    .select("*")
    .order("entry_date", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1000);

  return <CashbookClient initialEntries={(entries ?? []) as any} />;
}
