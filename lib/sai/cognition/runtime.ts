import "@/lib/sai/capabilities/business-observe";
import { startSaiPosWorker } from "@/lib/sai/capabilities/pos-worker";
import { buildSaiCommand, executeSaiCommand } from "@/lib/sai/core/command";
import { persistSaiCommandStep, updateSaiCommand } from "@/lib/sai/core/persistence";
import { verifySaiCommand } from "@/lib/sai/core/verification";
import { getSaiWorldState } from "@/lib/sai/core/world-state";
import type { SaiActor, SaiCapabilityResult, SaiEvent } from "@/lib/sai/core/types";
import { planSaiInstruction } from "./planner";

startSaiPosWorker();

export async function runSaiInstruction(input: {
  instruction: string;
  actor: SaiActor;
  route?: string;
}): Promise<{ plan: ReturnType<typeof planSaiInstruction>; results: SaiCapabilityResult[] }> {
  const world = getSaiWorldState(input.route);
  const plan = planSaiInstruction({ instruction: input.instruction, world });
  const results: SaiCapabilityResult[] = [];

  for (const [stepIndex, step] of plan.steps.entries()) {
    const command = await buildSaiCommand({
      actor: input.actor, capability: step.capability, payload: step.input, risk: step.risk,
    });

    await persistSaiCommandStep({
      commandId: command.commandId, stepIndex, capability: step.capability, input: step.input, status: "planned",
    });

    const result = await executeSaiCommand(command);
    results.push(result);

    if (result.error === "OWNER_APPROVAL_REQUIRED") {
      continue;
    }

    const verification = await verifySaiCommand(command, result);
    const verificationStatus = verification.status;
    await updateSaiCommand(command.commandId, {
      status: verificationStatus === "failed" ? "failed" : "verified",
      verification: verificationStatus,
      error: verification.reason ?? (verificationStatus === "failed" ? result.error : null),
    });

    await persistSaiCommandStep({
      commandId: command.commandId,
      stepIndex,
      capability: step.capability,
      input: step.input,
      status: verificationStatus === "failed" ? "failed" : "verified",
      completedAt: new Date().toISOString(),
      error: verification.reason ?? null,
    });
  }

  return { plan, results };
}

export async function observeSaiEvent(event: SaiEvent): Promise<void> {
  const { dispatchSaiEvent } = await import("./dispatcher");
  await dispatchSaiEvent(event);
}
