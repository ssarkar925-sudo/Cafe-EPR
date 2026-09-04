import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TrialBalanceClient from "@/components/finance/trial-balance-client";

export const dynamic = "force-dynamic";

type Account = {
  id: string;
  code: string;
  name: string;
  account_type: string;
  is_active: boolean;
};

type JournalLine = {
  account_id: string;
  debit: number | string | null;
  credit: number | string | null;
  journal_entries?: { status?: string | null } | null;
};

export default async function TrialBalancePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: accounts } = await supabase
    .from("accounting_accounts")
    .select("id, code, name, account_type, is_active")
    .order("code");

  const { data: lines } = await supabase
    .from("journal_lines")
    .select("account_id, debit, credit, journal_entries!inner(status)")
    .eq("journal_entries.status", "posted");

  return (
    <TrialBalanceClient
      accounts={(accounts ?? []) as Account[]}
      journalLines={(lines ?? []) as JournalLine[]}
    />
  );
}
