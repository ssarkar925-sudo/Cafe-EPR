import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import DashboardShell from "@/components/dashboard-shell";
import SessionGuard from "@/components/session-guard";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: settings }] = await Promise.all([
    supabase.from("profiles").select("full_name, role, is_active, avatar_url").eq("id", user.id).single(),
    supabase.from("settings").select("shop_name, logo_url").single(),
  ]);

  const role = (profile?.role as string) ?? "staff";

  if (profile && profile.is_active === false) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-slate-900">
            Account deactivated
          </h1>
          <p className="mt-2 text-sm text-slate-500">Contact the shop admin.</p>
          <form action="/logout" method="post" className="mt-4">
            <button
              type="submit"
              className="rounded-lg bg-[#0f172a] px-4 py-2 text-sm text-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <>
      <SessionGuard />
      <DashboardShell
        name={profile?.full_name || user.email || ""}
        email={user.email || ""}
        role={role ?? "staff"}
        shopName={settings?.shop_name || "Cafe ERP"}
        logoUrl={settings?.logo_url || null}
        avatarUrl={profile?.avatar_url || null}
        userId={user.id}
      >
        {children}
      </DashboardShell>
    </>
  );
}
