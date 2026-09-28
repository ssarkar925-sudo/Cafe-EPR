import "@/lib/sai/capabilities/business-observe";
import { startSaiPosWorker } from "@/lib/sai/capabilities/pos-worker";
import { executeSaiPlan } from "@/lib/sai/core/executor";
import { createSaiTraceId, recordSaiTrace } from "@/lib/sai/core/trace";
import { loadSaiWorldState } from "@/lib/sai/core/world-state";
import type { SaiActor, SaiCapabilityResult, SaiEvent } from "@/lib/sai/core/types";
import { planSaiInstruction } from "./planner";

startSaiPosWorker();

export async function runSaiInstruction(input: {
  instruction: string;
  actor: SaiActor;
  route?: string;
  approvalId?: string;
}): Promise<{ plan: ReturnType<typeof planSaiInstruction>; results: SaiCapabilityResult[]; blockedSteps: string[] }> {
  const world = await loadSaiWorldState(input.actor, input.route);
  const plan = planSaiInstruction({ instruction: input.instruction, world });
  const execution = await executeSaiPlan(plan, input.actor, input.approvalId);
  return { plan, ...execution };
}

export async function observeSaiEvent(event: SaiEvent): Promise<void> {
  const { dispatchSaiEvent } = await import("./dispatcher");
  await dispatchSaiEvent(event);
}
