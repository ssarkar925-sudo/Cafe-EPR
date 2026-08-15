import { createClient } from "@/lib/supabase/server";
import LedgerClient from "@/components/finance/ledger-client";

export const dynamic = "force-dynamic";

export default async function LedgerPage() {
  const supabase = await createClient();

  const { data: customers } = await supabase
    .from("customers")
    .select("id, name, code, balance")
    .eq("is_active", true)
    .order("name");

  return <LedgerClient customers={(customers ?? []) as any} />;
}
