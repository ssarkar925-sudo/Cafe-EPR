import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import MasterClient from "@/components/business/master-client";

export const dynamic = "force-dynamic";

export default async function UnitsPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();
  const { data } = await supabase.from("units").select("*").order("name");

  return (
    <MasterClient
      title="Units"
      desc="Units of measure used across the catalogue."
      table="units"
      fields={[
        { key: "name", label: "Unit name", required: true, placeholder: "e.g. Piece, Pack, Kg" },
        { key: "code", label: "Short code", placeholder: "e.g. pc, pkt, kg" },
      ]}
      rows={(data ?? []) as any}
    />
  );
}