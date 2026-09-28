import { redirect } from "next/navigation";
import { getUserRole, hasRole } from "@/lib/authz";
import AIMissionControlStudio from "@/components/ai/ai-mission-control-studio";

export const dynamic = "force-dynamic";

export default async function CafeAIAgentPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "staff"])) redirect("/dashboard");
  return <AIMissionControlStudio />;
}
