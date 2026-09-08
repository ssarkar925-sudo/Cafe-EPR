import { redirect } from "next/navigation";
import { getUserRole, hasRole } from "@/lib/authz";
import CafeAIAgent from "@/components/ai/cafe-ai-agent";
import AIMemoryPanel from "@/components/ai/ai-memory-panel";
import AIBusinessWatcher from "@/components/ai/ai-business-watcher";
import AIWhatsAppBridge from "@/components/ai/ai-whatsapp-bridge";
import AISelfHealingBridge from "@/components/ai/ai-self-healing-bridge";
import AICommandCenter from "@/components/ai/ai-command-center";

export const dynamic = "force-dynamic";

export default async function CafeAIAgentPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "staff"])) redirect("/dashboard");
  return (
    <div className="space-y-6">
      <AIWhatsAppBridge />
      <AICommandCenter />
      <AISelfHealingBridge />
      <CafeAIAgent />
      <AIBusinessWatcher />
      <AIMemoryPanel />
    </div>
  );
}
