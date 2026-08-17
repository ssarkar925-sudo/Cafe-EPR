import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import MasterClient from "@/components/business/master-client";

export const dynamic = "force-dynamic";

export default async function BrandsPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();
  const { data } = await supabase.from("brands").select("*").order("name");

  return (
    <MasterClient
      title="Brands"
      desc="Brand master data used to organise catalogue products."
      table="brands"
      fields={[
        { key: "name", label: "Brand name", required: true, placeholder: "e.g. Coca-Cola" },
        { key: "code", label: "Code", placeholder: "Optional short code" },
      ]}
      rows={(data ?? []) as any}
    />
  );
}