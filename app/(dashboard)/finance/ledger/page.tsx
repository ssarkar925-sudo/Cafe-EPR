import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import LedgerClient from "@/components/finance/ledger-client";

export const dynamic = "force-dynamic";

export default async function LedgerPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();

  const { data: customers } = await supabase
    .from("customers")
    .select("id, name, code, balance, phone")
    .eq("is_active", true)
    .order("name");

  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading ledger…</div>}>
      <LedgerClient customers={(customers ?? []) as any} />
    </Suspense>
  );
}
