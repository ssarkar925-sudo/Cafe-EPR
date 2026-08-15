import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import Sidebar from "@/components/sidebar";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: settings }] = await Promise.all([
    supabase.from("profiles").select("full_name, role").eq("id", user.id).single(),
    supabase.from("settings").select("shop_name, logo_url").single(),
  ]);

  const role = await getUserRole();

  return (
    <div className="min-h-screen">
      <Sidebar
        name={profile?.full_name || user.email || ""}
        email={user.email || ""}
        role={role ?? "staff"}
        shopName={settings?.shop_name || "SCC OMM Cafe ERP"}
        logoUrl={settings?.logo_url || null}
      />
      <main className="lg:pl-64">{children}</main>
    </div>
  );
}
