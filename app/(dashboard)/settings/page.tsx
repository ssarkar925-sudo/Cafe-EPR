import { redirect } from "next/navigation";
import { getUserRole, hasRole } from "@/lib/authz";
import SystemSettingsClient from "@/components/settings/system-settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin"])) redirect("/dashboard");
  return <SystemSettingsClient />;
}
