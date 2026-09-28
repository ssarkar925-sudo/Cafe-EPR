import { buildSaiCommand, executeSaiCommand } from "./command";
import { createSaiEvidence, captureSaiPlanEvidence } from "./evidence";
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

  const planEvidence = await captureSaiPlanEvidence(plan, actor);
  const results: SaiCapabilityResult[] = [];
  const blockedSteps: string[] = [];
  const completedSteps = new Set<string>();

  for (const [stepIndex, step] of plan.steps.entries()) {
    const decisionEvidence = await createSaiEvidence({
      evidenceId: `decision:${plan.planId}:${step.stepId}`,
      actor,
      sourceType: "sai.execution.decision",
      sourceRef: plan.planId,
      subject: { type: "command_step", id: `${plan.planId}:${step.stepId}`, relation: "explains" },
      parentEvidenceIds: [planEvidence.evidenceId],
      data: {
        planId: plan.planId,
        stepId: step.stepId,
        capability: step.capability,
        risk: step.risk,
        dependsOn: step.dependsOn,
      },
    });

    const dependencyBlocked = step.dependsOn.some((dependency) => !completedSteps.has(dependency));
    if (dependencyBlocked) {
      const result = {
        ok: false,
        error: "SAI_PLAN_DEPENDENCY_BLOCKED",
        output: { stepId: step.stepId, dependsOn: step.dependsOn },
      };
      results.push(result);
      blockedSteps.push(step.stepId);
      await createSaiEvidence({
        evidenceId: `result:${plan.planId}:${step.stepId}:blocked`,
        actor,
        sourceType: "sai.execution.blocked",
        sourceRef: `${plan.planId}:${step.stepId}`,
        subject: { type: "command_step", id: `${plan.planId}:${step.stepId}`, relation: "caused_by" },
        parentEvidenceIds: [decisionEvidence.evidenceId],
        data: result.output ?? {},
      });
      continue;
    }

    const command = await buildSaiCommand({
      actor,
      capability: step.capability,
      payload: step.input,
      risk: step.risk,
    });

    await createSaiEvidence({
      evidenceId: `command:${command.commandId}`,
      actor,
      sourceType: "sai.command.planned",
      sourceRef: command.commandId,
      subject: { type: "command", id: command.commandId, relation: "supports" },
      parentEvidenceIds: [decisionEvidence.evidenceId],
      data: {
        commandId: command.commandId,
        capability: command.capability,
        risk: command.risk,
        idempotencyKey: command.idempotencyKey,
      },
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

    const resultEvidence = await createSaiEvidence({
      evidenceId: `command-result:${command.commandId}:${stepIndex}`,
      actor,
      sourceType: "sai.command.result",
      sourceRef: command.commandId,
      subject: { type: "command_result", id: `${command.commandId}:${stepIndex}`, relation: "supports" },
      parentEvidenceIds: [
        `command:${command.commandId}`,
        decisionEvidence.evidenceId,
        ...(result.evidenceIds ?? []),
      ],
      data: {
        commandId: command.commandId,
        stepIndex,
        ok: result.ok,
        output: result.output ?? {},
        error: result.error ?? null,
        evidenceIds: result.evidenceIds ?? [],
      },
      confidence: result.ok ? 1 : 0,
    });

    if (result.error === "OWNER_APPROVAL_REQUIRED") {
      blockedSteps.push(step.stepId);
      await createSaiEvidence({
        evidenceId: `verification:${command.commandId}:${stepIndex}:approval`,
        actor,
        sourceType: "sai.verification.approval_gate",
        sourceRef: command.commandId,
        subject: { type: "verification", id: `${command.commandId}:${stepIndex}:approval`, relation: "verifies" },
        parentEvidenceIds: [resultEvidence.evidenceId],
        data: { status: "pending_approval", approvalRequired: true },
      });
      continue;
    }

    const verification = await verifySaiCommand(command, result);
    const verified = verification.status === "verified" || verification.status === "not_applicable";

    const verificationEvidence = await createSaiEvidence({
      evidenceId: `verification:${command.commandId}:${stepIndex}`,
      actor,
      sourceType: "sai.verification",
      sourceRef: command.commandId,
      subject: { type: "verification", id: `${command.commandId}:${stepIndex}`, relation: "verifies" },
      parentEvidenceIds: [resultEvidence.evidenceId, ...(verification.evidenceIds ?? [])],
      data: {
        commandId: command.commandId,
        stepIndex,
        status: verification.status,
        reason: verification.reason ?? null,
        resultOk: result.ok,
        evidenceIds: verification.evidenceIds ?? [],
      },
      confidence: verified ? 1 : 0,
    });

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

    if (verified) {
      completedSteps.add(step.stepId);
    } else {
      blockedSteps.push(step.stepId);
    }

    void verificationEvidence;
  }

  return { results, blockedSteps };
}

export function canRunPlanStep(step: SaiPlanStep, completedStepIds: ReadonlySet<string>): boolean {
  return step.dependsOn.every((dependency) => completedStepIds.has(dependency));
}
