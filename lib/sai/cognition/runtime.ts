import "@/lib/sai/capabilities/business-observe";
import { startSaiPosWorker } from "@/lib/sai/capabilities/pos-worker";

startSaiPosWorker();
import { buildSaiCommand } from "@/lib/sai/core/command";
import { getSaiWorldState } from "@/lib/sai/core/world-state";
import type { SaiActor, SaiCapabilityResult, SaiEvent } from "@/lib/sai/core/types";
import { planSaiInstruction } from "./planner";

export async function runSaiInstruction(input: {
  instruction: string;
  actor: SaiActor;
  route?: string;
}): Promise<{ plan: ReturnType<typeof planSaiInstruction>; results: SaiCapabilityResult[] }> {
  const world = getSaiWorldState(input.route);
  const plan = planSaiInstruction({ instruction: input.instruction, world });
  const results: SaiCapabilityResult[] = [];

  for (const step of plan.steps) {
    const command = await buildSaiCommand({
      actor: input.actor,
      capability: step.capability,
      payload: step.input,
      risk: step.risk,
    });
    const { executeSaiCommand } = await import("@/lib/sai/core/command");
    results.push(await executeSaiCommand(command));
  }

  return { plan, results };
}

export async function observeSaiEvent(event: SaiEvent): Promise<void> {
  const { dispatchSaiEvent } = await import("./dispatcher");
  await dispatchSaiEvent(event);
}