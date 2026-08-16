import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import SettingsClient from "@/components/settings/settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin"])) redirect("/dashboard");

  const supabase = await createClient();
  const { data: settings } = await supabase.from("settings").select("*").single();

  return <SettingsClient initial={(settings ?? null) as any} />;
}
