import { buildSaiCommand, executeSaiCommand } from "./command";
import { createSaiEvidence, captureSaiPlanEvidence } from "./evidence";
import { persistSaiCommandStep, updateSaiCommand } from "./persistence";
import { verifySaiCommand } from "./verification";
import { createSaiTraceId, recordSaiTrace } from "./trace";
import { getSaiCapability } from "./capabilities";
import { simulateSaiPlan } from "./simulation";
import type { SaiActor, SaiCapabilityResult, SaiPlan, SaiPlanStep, SaiExecutionMode } from "./types";
import { recoverSaiCommandFailure } from "./recovery-manager";

export type SaiPlanExecutionResult = { results: SaiCapabilityResult[]; blockedSteps: string[]; traceId: string };

export async function executeSaiPlan(
  plan: SaiPlan,
  actor: SaiActor,
  approvalId?: string,
  traceId = createSaiTraceId("plan"),
  mode: SaiExecutionMode = "operator",
): Promise<SaiPlanExecutionResult> {
  if (!plan.validation || plan.version !== 1) throw new Error("SAI_PLAN_NOT_VALIDATED");
  const planTrace = await recordSaiTrace({
    traceId, actor, sequenceNo: 10, phase: "PLAN", eventType: "plan.execution.started", status: "started",
    operation: "execute_plan", planId: plan.planId, message: "Plan execution started",
    data: { stepCount: plan.steps.length, requiresApproval: plan.requiresApproval, mode },
  });
  const planEvidence = await captureSaiPlanEvidence(plan, actor);
  const requiresSimulation = mode === "background" || plan.steps.some(step => {
    const capability = getSaiCapability(step.capability);
    return step.risk !== "read" || Boolean(capability?.mutates);
  });
  if (requiresSimulation) {
    const simulation = await simulateSaiPlan({ actor, plan, mode });
    await recordSaiTrace({
      traceId,
      actor,
      parentSpanId: planTrace.spanId,
      sequenceNo: 20,
      phase: "REASON",
      eventType: "plan.simulation",
      status: simulation.status === "safe" ? "completed" : "blocked",
      operation: "execute_plan",
      planId: plan.planId,
      message: simulation.status === "safe"
        ? "Digital Twin simulation found no blocking contradiction"
        : "Digital Twin simulation blocked execution due to contradiction",
      data: {
        simulationId: simulation.simulationId,
        status: simulation.status,
        baselineHash: simulation.baselineHash,
        contradictionCount: simulation.contradictions.length,
      },
      evidenceIds: simulation.evidenceIds,
    });
    if (simulation.status !== "safe") {
      const results = simulation.contradictions.map(item => ({
        ok: false,
        error: "SAI_CONTRADICTION_DETECTED",
        output: {
          contradictionId: item.contradictionId,
          contradictionType: item.contradictionType,
          severity: item.severity,
          detail: item.detail,
          entityKey: item.entityKey ?? null,
        },
        evidenceIds: item.evidenceIds,
      }));
      const blockedSteps = [...new Set(simulation.contradictions.map(item => item.stepId).filter((id): id is string => Boolean(id)))];
      await recordSaiTrace({
        traceId,
        actor,
        parentSpanId: planTrace.spanId,
        sequenceNo: 999,
        phase: "VERIFY",
        eventType: "plan.execution.summary",
        status: "blocked",
        operation: "execute_plan",
        planId: plan.planId,
        message: "Execution stopped before command execution because simulation detected a contradiction",
        data: { resultCount: results.length, blockedSteps, simulationId: simulation.simulationId },
        evidenceIds: simulation.evidenceIds,
      });
      return { traceId, results, blockedSteps };
    }
  }
  const results: SaiCapabilityResult[] = [];
  const blockedSteps: string[] = [];
  const completedSteps = new Set<string>();

  for (const [stepIndex, step] of plan.steps.entries()) {
    const decisionEvidence = await createSaiEvidence({
      evidenceId: "decision:" + plan.planId + ":" + step.stepId, actor,
      sourceType: "sai.execution.decision", sourceRef: plan.planId,
      subject: { type: "command_step", id: plan.planId + ":" + step.stepId, relation: "explains" },
      parentEvidenceIds: [planEvidence.evidenceId],
      data: { planId: plan.planId, stepId: step.stepId, capability: step.capability, risk: step.risk, dependsOn: step.dependsOn, mode },
    });
    const dependencyBlocked = step.dependsOn.some(d => !completedSteps.has(d));
    const decisionTrace = await recordSaiTrace({
      traceId, actor, parentSpanId: planTrace.spanId, sequenceNo: 100 + stepIndex * 10,
      phase: "DECIDE", eventType: "step.decision", status: dependencyBlocked ? "blocked" : "completed",
      operation: "execute_plan", planId: plan.planId, stepId: step.stepId,
      message: dependencyBlocked ? "Step blocked by an unmet dependency" : "Step selected for execution",
      data: { capability: step.capability, risk: step.risk, dependsOn: step.dependsOn, mode }, evidenceIds: [decisionEvidence.evidenceId],
    });

    if (dependencyBlocked) {
      const result = { ok: false, error: "SAI_PLAN_DEPENDENCY_BLOCKED", output: { stepId: step.stepId, dependsOn: step.dependsOn } };
      results.push(result); blockedSteps.push(step.stepId);
      await recordSaiTrace({
        traceId, actor, parentSpanId: decisionTrace.spanId, sequenceNo: 104 + stepIndex * 10,
        phase: "EXECUTE", eventType: "step.blocked", status: "blocked", operation: "execute_plan",
        planId: plan.planId, stepId: step.stepId, message: "Step execution blocked by dependency",
        data: { dependsOn: step.dependsOn }, evidenceIds: [decisionEvidence.evidenceId],
      });
      await createSaiEvidence({
        evidenceId: "result:" + plan.planId + ":" + step.stepId + ":blocked", actor,
        sourceType: "sai.execution.blocked", sourceRef: plan.planId + ":" + step.stepId,
        subject: { type: "command_step", id: plan.planId + ":" + step.stepId, relation: "caused_by" },
        parentEvidenceIds: [decisionEvidence.evidenceId], data: result.output ?? {},
      });
      continue;
    }

    const command = await buildSaiCommand({ actor, capability: step.capability, payload: step.input, risk: step.risk });
    await recordSaiTrace({
      traceId, actor, parentSpanId: decisionTrace.spanId, sequenceNo: 101 + stepIndex * 10,
      phase: "EXECUTE", eventType: "command.planned", status: "started", operation: "execute_plan",
      planId: plan.planId, commandId: command.commandId, stepId: step.stepId,
      message: "Authorized command prepared", data: { capability: command.capability, risk: command.risk, mode },
    });
    await createSaiEvidence({
      evidenceId: "command:" + command.commandId, actor, sourceType: "sai.command.planned", sourceRef: command.commandId,
      subject: { type: "command", id: command.commandId, relation: "supports" }, parentEvidenceIds: [decisionEvidence.evidenceId],
      data: { commandId: command.commandId, capability: command.capability, risk: command.risk, idempotencyKey: command.idempotencyKey, mode },
    });
    await persistSaiCommandStep({ commandId: command.commandId, stepIndex, capability: step.capability, input: step.input, status: "planned" });

    const initialResult = await executeSaiCommand(command, approvalId, mode);
    const recovery = !initialResult.ok
      ? await recoverSaiCommandFailure({
          actor,
          command,
          result: initialResult,
          mode,
          approvalId,
          attemptNumber: 1,
        })
      : null;
    const result = recovery?.result ?? initialResult;

    if (recovery) {
      await recordSaiTrace({
        traceId,
        actor,
        parentSpanId: decisionTrace.spanId,
        sequenceNo: 102 + stepIndex * 10,
        phase: "EXECUTE",
        eventType: "command.recovery",
        status: recovery.recovered ? "completed" : recovery.decision.action === "approval" ? "blocked" : "failed",
        operation: "execute_plan",
        planId: plan.planId,
        commandId: command.commandId,
        stepId: step.stepId,
        message: recovery.recovered
          ? "Command recovered after a bounded recovery attempt"
          : "Command recovery decision recorded",
        data: {
          initialError: initialResult.error ?? null,
          category: recovery.decision.category,
          action: recovery.decision.action,
          attemptNumber: recovery.decision.attemptNumber,
          maxAttempts: recovery.decision.maxAttempts,
          safe: recovery.decision.safe,
          recovered: recovery.recovered,
          approvalId: approvalId ?? null,
          mode,
          reason: recovery.decision.reason,
        },
        evidenceIds: result.evidenceIds ?? [],
      });
    }

    const resultTrace = await recordSaiTrace({
      traceId, actor, parentSpanId: decisionTrace.spanId, sequenceNo: 102 + stepIndex * 10,
      phase: "EXECUTE", eventType: "command.result", status: result.ok ? "completed" : "failed", operation: "execute_plan",
      planId: plan.planId, commandId: command.commandId, stepId: step.stepId,
      message: result.ok
        ? (recovery ? "Command recovered successfully" : "Command completed")
        : (result.error || "Command failed"),
      data: {
        ok: result.ok,
        initialOk: initialResult.ok,
        error: result.error ?? null,
        mode,
        output: result.output ?? {},
        recovery: recovery
          ? {
              category: recovery.decision.category,
              action: recovery.decision.action,
              attemptNumber: recovery.decision.attemptNumber,
              maxAttempts: recovery.decision.maxAttempts,
              safe: recovery.decision.safe,
              recovered: recovery.recovered,
              reason: recovery.decision.reason,
            }
          : null,
      }, evidenceIds: result.evidenceIds ?? [],
    });
    const resultEvidence = await createSaiEvidence({
      evidenceId: "command-result:" + command.commandId + ":" + stepIndex, actor, sourceType: "sai.command.result", sourceRef: command.commandId,
      subject: { type: "command_result", id: command.commandId + ":" + stepIndex, relation: "supports" },
      parentEvidenceIds: ["command:" + command.commandId, decisionEvidence.evidenceId, ...(result.evidenceIds ?? [])],
      data: { commandId: command.commandId, stepIndex, ok: result.ok, output: result.output ?? {}, error: result.error ?? null, evidenceIds: result.evidenceIds ?? [], mode },
      confidence: result.ok ? 1 : 0,
    });

    if (result.error === "OWNER_APPROVAL_REQUIRED") {
      blockedSteps.push(step.stepId);
      await recordSaiTrace({
        traceId, actor, parentSpanId: resultTrace.spanId, sequenceNo: 103 + stepIndex * 10, phase: "VERIFY",
        eventType: "approval.gate", status: "blocked", operation: "execute_plan",
        planId: plan.planId, commandId: command.commandId, stepId: step.stepId,
        message: "Owner approval is required before execution can continue",
        data: { approvalRequired: true, status: "pending_approval", mode }, evidenceIds: [resultEvidence.evidenceId],
      });
      await createSaiEvidence({
        evidenceId: "verification:" + command.commandId + ":" + stepIndex + ":approval", actor,
        sourceType: "sai.verification.approval_gate", sourceRef: command.commandId,
        subject: { type: "verification", id: command.commandId + ":" + stepIndex + ":approval", relation: "verifies" },
        parentEvidenceIds: [resultEvidence.evidenceId], data: { status: "pending_approval", approvalRequired: true, mode },
      });
      continue;
    }

    const verification = await verifySaiCommand(command, result);
    await recordSaiTrace({
      traceId, actor, parentSpanId: resultTrace.spanId, sequenceNo: 103 + stepIndex * 10, phase: "VERIFY",
      eventType: "command.verification", status: verification.status === "failed" ? "failed" : "completed",
      operation: "execute_plan", planId: plan.planId, commandId: command.commandId, stepId: step.stepId,
      message: verification.reason || "Command verification completed",
      data: { status: verification.status, reason: verification.reason ?? null, mode }, evidenceIds: verification.evidenceIds ?? [],
    });
    const verified = verification.status === "verified" || verification.status === "not_applicable";
    await createSaiEvidence({
      evidenceId: "verification:" + command.commandId + ":" + stepIndex, actor, sourceType: "sai.verification", sourceRef: command.commandId,
      subject: { type: "verification", id: command.commandId + ":" + stepIndex, relation: "verifies" },
      parentEvidenceIds: [resultEvidence.evidenceId, ...(verification.evidenceIds ?? [])],
      data: { commandId: command.commandId, stepIndex, status: verification.status, reason: verification.reason ?? null, resultOk: result.ok, evidenceIds: verification.evidenceIds ?? [], mode },
      confidence: verified ? 1 : 0,
    });
    await updateSaiCommand(command.commandId, { status: verified ? "verified" : "failed", verification: verification.status, error: verification.reason ?? (verification.status === "failed" ? result.error : null) });
    await persistSaiCommandStep({
      commandId: command.commandId, stepIndex, capability: step.capability, input: step.input,
      status: verified ? "verified" : "failed", completedAt: new Date().toISOString(), error: verification.reason ?? null,
    });
    if (verified) completedSteps.add(step.stepId); else blockedSteps.push(step.stepId);
  }

  await recordSaiTrace({
    traceId, actor, parentSpanId: planTrace.spanId, sequenceNo: 999, phase: "VERIFY",
    eventType: "plan.execution.summary", status: blockedSteps.length ? "blocked" : "completed",
    operation: "execute_plan", planId: plan.planId,
    message: blockedSteps.length ? "Plan execution completed with blocked steps" : "Plan execution completed",
    data: { resultCount: results.length, blockedSteps, mode }, evidenceIds: results.flatMap(r => r.evidenceIds ?? []),
  });
  return { traceId, results, blockedSteps };
}

export function canRunPlanStep(step: SaiPlanStep, completedStepIds: ReadonlySet<string>): boolean {
  return step.dependsOn.every(dependency => completedStepIds.has(dependency));
}
