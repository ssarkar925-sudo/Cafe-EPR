import { redirect } from "next/navigation";
import { getUserRole } from "@/lib/authz";
import AILearningControlCenter from "@/components/ai/ai-learning-control-center";

export const dynamic = "force-dynamic";

export default async function AILearningControlPage() {
  const role = await getUserRole();
  if (role !== "admin") redirect("/ai-agent");
  return <AILearningControlCenter />;
}
