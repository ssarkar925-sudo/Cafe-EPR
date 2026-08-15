import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import MasterClient from "@/components/business/master-client";

export const dynamic = "force-dynamic";

export default async function BanksPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();
  const { data } = await supabase.from("aeps_banks").select("*").order("name");

  return (
    <MasterClient
      title="AEPS Banks"
      desc="Banks used for AEPS cash withdrawals."
      table="aeps_banks"
      fields={[
        { key: "name", label: "Bank Name", required: true, placeholder: "State Bank of India" },
        { key: "code", label: "Code", placeholder: "SBI" },
      ]}
      rows={(data ?? []) as any}
    />
  );
}
