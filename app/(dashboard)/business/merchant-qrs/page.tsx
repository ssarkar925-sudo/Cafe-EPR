import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import MerchantQrsShell from "@/components/business/merchant-qrs-shell";

export const dynamic = "force-dynamic";

export default async function MerchantQrsPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();
  const [{ data }, { data: txnRows }] = await Promise.all([
    supabase.from("upi_merchant_qrs").select("*").order("display_name"),
    supabase.from("transactions").select("merchant_qr_id").eq("service_type", "upi"),
  ]);

  const usage: Record<string, number> = {};
  for (const t of (txnRows ?? []) as { merchant_qr_id: string | null }[]) {
    if (t.merchant_qr_id) usage[t.merchant_qr_id] = (usage[t.merchant_qr_id] ?? 0) + 1;
  }

  return <MerchantQrsShell rows={(data ?? []) as any[]} usage={usage} />;
}
