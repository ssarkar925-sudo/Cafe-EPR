import { redirect } from "next/navigation";
import { getUserRole, hasRole } from "@/lib/authz";
import CafeAIAgent from "@/components/ai/cafe-ai-agent";
import AIMemoryPanel from "@/components/ai/ai-memory-panel";

export const dynamic = "force-dynamic";

export default async function CafeAIAgentPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "staff"])) redirect("/dashboard");
  return (
    <div className="space-y-6">
      <CafeAIAgent />
      <AIMemoryPanel />
    </div>
  );
}
