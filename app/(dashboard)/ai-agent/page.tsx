import { redirect } from "next/navigation";
import { getUserRole, hasRole } from "@/lib/authz";
import SAIControlRoom from "@/components/sai/sai-control-room";

export const dynamic = "force-dynamic";

export default async function SAIControlRoomPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "staff"])) redirect("/dashboard");
  return <SAIControlRoom />;
}
