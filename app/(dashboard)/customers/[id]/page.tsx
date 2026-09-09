import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CustomerProfile from "@/components/customers/customer-profile";
import CustomerPaymentQuickAction from "@/components/customers/customer-payment-quick-action";

export const dynamic = "force-dynamic";

export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  let user = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data?.user) user = data.user;
  } catch {
    user = null;
  }
  if (!user) redirect("/login");

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .single();
  if (!customer) notFound();

  return (
    <>
      <CustomerProfile customer={customer as any} />
      <CustomerPaymentQuickAction
        customer={{
          id: customer.id,
          name: customer.name,
          balance: customer.balance,
        }}
      />
    </>
  );
}
