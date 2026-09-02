import { redirect } from "next/navigation";
import { getUserRole, hasRole } from "@/lib/authz";
import CafeAIAgent from "@/components/ai/cafe-ai-agent";

export const dynamic = "force-dynamic";

export default async function CafeAIAgentPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "staff"])) redirect("/dashboard");
  return <CafeAIAgent />;
}
