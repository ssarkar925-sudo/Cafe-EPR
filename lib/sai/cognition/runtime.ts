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
}): Promise<{
  traceId: string;
  plan: ReturnType<typeof planSaiInstruction>;
  results: SaiCapabilityResult[];
  blockedSteps: string[];
}> {
  const traceId = createSaiTraceId("instruction");
  try {
    const start = await recordSaiTrace({
      traceId,
      actor: input.actor,
      sequenceNo: 0,
      phase: "OBSERVE",
      eventType: "instruction.received",
      status: "started",
      operation: "run_instruction",
      message: "SAI instruction received",
      data: { route: input.route ?? null, instructionLength: input.instruction.length },
    });

    const world = await loadSaiWorldState(input.actor, input.route);

    await recordSaiTrace({
      traceId,
      actor: input.actor,
      parentSpanId: start.spanId,
      sequenceNo: 1,
      phase: "OBSERVE",
      eventType: "world.loaded",
      status: "completed",
      operation: "run_instruction",
      message: "Current SAI world state loaded",
      data: { route: input.route ?? null },
    });
    await recordSaiTrace({
      traceId,
      actor: input.actor,
      parentSpanId: start.spanId,
      sequenceNo: 2,
      phase: "UNDERSTAND",
      eventType: "instruction.understood",
      status: "completed",
      operation: "run_instruction",
      message: "Instruction normalized for planning",
      data: { instructionLength: input.instruction.length },
    });
    await recordSaiTrace({
      traceId,
      actor: input.actor,
      parentSpanId: start.spanId,
      sequenceNo: 3,
      phase: "IDENTIFY",
      eventType: "context.identified",
      status: "completed",
      operation: "run_instruction",
      message: "Relevant route context identified",
      data: { route: input.route ?? null },
    });

    const plan = planSaiInstruction({ instruction: input.instruction, world });

    await recordSaiTrace({
      traceId,
      actor: input.actor,
      parentSpanId: start.spanId,
      sequenceNo: 4,
      phase: "REASON",
      eventType: "instruction.reasoned",
      status: "completed",
      operation: "run_instruction",
      planId: plan.planId,
      message: "Instruction mapped to a typed SAI plan",
      data: { stepCount: plan.steps.length, requiresApproval: plan.requiresApproval },
    });
    await recordSaiTrace({
      traceId,
      actor: input.actor,
      parentSpanId: start.spanId,
      sequenceNo: 5,
      phase: "PLAN",
      eventType: "plan.ready",
      status: "completed",
      operation: "run_instruction",
      planId: plan.planId,
      message: "Validated plan ready for execution",
      data: { stepCount: plan.steps.length, requiresApproval: plan.requiresApproval },
    });

    const execution = await executeSaiPlan(plan, input.actor, input.approvalId, traceId);

    await recordSaiTrace({
      traceId,
      actor: input.actor,
      parentSpanId: start.spanId,
      sequenceNo: 6,
      phase: "VERIFY",
      eventType: "instruction.execution.summary",
      status: execution.blockedSteps.length ? "blocked" : "completed",
      operation: "run_instruction",
      planId: plan.planId,
      message: execution.blockedSteps.length ? "Execution completed with blocked steps" : "Execution completed",
      data: { resultCount: execution.results.length, blockedSteps: execution.blockedSteps },
      evidenceIds: execution.results.flatMap(result => result.evidenceIds ?? []),
    });

    await recordSaiTrace({
      traceId,
      actor: input.actor,
      parentSpanId: start.spanId,
      sequenceNo: 7,
      phase: "REMEMBER",
      eventType: "trace.persisted",
      status: "completed",
      operation: "run_instruction",
      planId: plan.planId,
      message: "Execution trace persisted for later review",
      data: { evidenceCount: execution.results.reduce((n, r) => n + (r.evidenceIds?.length ?? 0), 0) },
    });

    return { traceId, plan, ...execution };
  } catch (error) {
    await recordSaiTrace({
      traceId,
      actor: input.actor,
      sequenceNo: 998,
      phase: "EXECUTE",
      eventType: "instruction.failed",
      status: "failed",
      operation: "run_instruction",
      message: error instanceof Error ? error.message : "SAI instruction failed",
      data: { error: error instanceof Error ? error.message : String(error) },
    }).catch(() => undefined);
    throw error;
  }
}

export async function observeSaiEvent(event: SaiEvent): Promise<void> {
  const { dispatchSaiEvent } = await import("./dispatcher");
  await dispatchSaiEvent(event);
}
