import { buildSaiCommand, executeSaiCommand } from "./command";
import { persistSaiCommandStep, updateSaiCommand } from "./persistence";
import { verifySaiCommand } from "./verification";
import type { SaiActor, SaiCapabilityResult, SaiPlan, SaiPlanStep } from "./types";

export type SaiPlanExecutionResult = {
  results: SaiCapabilityResult[];
  blockedSteps: string[];
};

export async function executeSaiPlan(
  plan: SaiPlan,
  actor: SaiActor,
  approvalId?: string,
): Promise<SaiPlanExecutionResult> {
  if (!plan.validation || plan.version !== 1) throw new Error("SAI_PLAN_NOT_VALIDATED");

  const results: SaiCapabilityResult[] = [];
  const blockedSteps: string[] = [];
  const completedSteps = new Set<string>();

  for (const [stepIndex, step] of plan.steps.entries()) {
    const dependencyBlocked = step.dependsOn.some((dependency) => !completedSteps.has(dependency));
    if (dependencyBlocked) {
      const result = {
        ok: false,
        error: "SAI_PLAN_DEPENDENCY_BLOCKED",
        output: { stepId: step.stepId, dependsOn: step.dependsOn },
      };
      results.push(result);
      blockedSteps.push(step.stepId);
      continue;
    }

    const command = await buildSaiCommand({
      actor,
      capability: step.capability,
      payload: step.input,
      risk: step.risk,
    });

    await persistSaiCommandStep({
      commandId: command.commandId,
      stepIndex,
      capability: step.capability,
      input: step.input,
      status: "planned",
    });

    const result = await executeSaiCommand(command, approvalId);
    results.push(result);

    if (result.error === "OWNER_APPROVAL_REQUIRED") {
      blockedSteps.push(step.stepId);
      continue;
    }

    const verification = await verifySaiCommand(command, result);
    const verified = verification.status === "verified" || verification.status === "not_applicable";
    await updateSaiCommand(command.commandId, {
      status: verified ? "verified" : "failed",
      verification: verification.status,
      error: verification.reason ?? (verification.status === "failed" ? result.error : null),
    });

    await persistSaiCommandStep({
      commandId: command.commandId,
      stepIndex,
      capability: step.capability,
      input: step.input,
      status: verified ? "verified" : "failed",
      completedAt: new Date().toISOString(),
      error: verification.reason ?? null,
    });

    if (verified) completedSteps.add(step.stepId);
    else blockedSteps.push(step.stepId);
  }

  return { results, blockedSteps };
}

export function canRunPlanStep(step: SaiPlanStep, completedStepIds: ReadonlySet<string>): boolean {
  return step.dependsOn.every((dependency) => completedStepIds.has(dependency));
}
