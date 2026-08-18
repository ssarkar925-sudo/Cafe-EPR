import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import StaffClient from "@/components/staff/staff-client";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin"])) redirect("/dashboard");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: users } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active, avatar_url")
    .order("created_at", { ascending: false });

  return (
    <StaffClient
      initialUsers={(users ?? []) as any}
      currentUserId={user?.id ?? ""}
    />
  );
}
