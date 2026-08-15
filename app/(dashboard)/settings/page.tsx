import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import SettingsClient from "@/components/settings/settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin"])) redirect("/dashboard");

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: settings }, { data: profile }] = await Promise.all([
    supabase.from("settings").select("*").single(),
    user
      ? supabase
          .from("profiles")
          .select("full_name, role")
          .eq("id", user.id)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <SettingsClient
      initial={(settings ?? null) as any}
      userEmail={user?.email || ""}
      userName={profile?.full_name || user?.email || ""}
    />
  );
}
