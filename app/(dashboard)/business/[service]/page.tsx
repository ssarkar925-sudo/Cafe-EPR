import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import BusinessClient from "@/components/business/business-client";

export const dynamic = "force-dynamic";

const SERVICES: Record<string, string> = {
  aeps: "AEPS",
  dmt: "DMT",
  upi: "UPI",
};

export default async function BusinessServicePage({
  params,
}: {
  params: Promise<{ service: string }>;
}) {
  const { service } = await params;
  if (!SERVICES[service]) redirect("/dashboard");

  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();

  const [{ data: transactions }, { data: customers }] = await Promise.all([
    supabase
      .from("transactions")
      .select("*, profiles(full_name)")
      .eq("service_type", service)
      .order("transaction_date", { ascending: false })
      .limit(300),
    supabase
      .from("customers")
      .select("id, name, code")
      .eq("is_active", true)
      .order("name")
      .limit(300),
  ]);

  return (
    <BusinessClient
      service={service}
      label={SERVICES[service]}
      initialTransactions={(transactions ?? []) as any}
      initialCustomers={(customers ?? []) as any}
    />
  );
}
