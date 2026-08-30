import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import MasterClient from "@/components/business/master-client";

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

  return (
    <MasterClient
      title="UPI Merchant QRs"
      desc="Shop UPI QR codes used for UPI cash-out transfers."
      table="upi_merchant_qrs"
      fields={[
        { key: "display_name", label: "Display Name", required: true, placeholder: "Shop Main QR" },
        { key: "upi_id", label: "UPI ID", required: true, placeholder: "shop@sbi" },
      ]}
      rows={(data ?? []) as any}
      usage={usage}
    />
  );
}
