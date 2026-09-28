import { createClient } from "@/lib/supabase/server";
import { compileSaiMissionPlan } from "@/lib/sai/cognition/plan-compiler";
import { executeSaiPlan } from "./executor";
import { createSaiTraceId, recordSaiTrace } from "./trace";
import type { SaiActor, SaiMission, SaiCapabilityResult } from "./types";

const BLOCKING_ERRORS = new Set([
  "AUTONOMY_POLICY_NOT_CONFIGURED",
  "AUTONOMY_DISABLED",
  "AUTONOMY_QUIET_HOURS",
  "AUTONOMY_BUDGET_EXHAUSTED",
  "SAI_PLAN_DEPENDENCY_BLOCKED",
]);

const APPROVAL_ERROR = "OWNER_APPROVAL_REQUIRED";

function missionRow(row: Record<string, unknown>, actor: SaiActor): SaiMission {
  return {
    missionId: String(row.mission_id),
    goalId: String(row.goal_id),
    actor,
    title: String(row.title ?? ""),
    status: row.status as SaiMission["status"],
    plan: typeof row.plan === "object" && row.plan !== null && !Array.isArray(row.plan) ? row.plan as Record<string, unknown> : {},
    currentStep: Number(row.current_step ?? 0),
    attemptCount: Number(row.attempt_count ?? 0),
    blockedReason: row.blocked_reason ? String(row.blocked_reason) : undefined,
    result: typeof row.result === "object" && row.result !== null && !Array.isArray(row.result) ? row.result as Record<string, unknown> : {},
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
  };
}

async function loadMission(actor: SaiActor, missionId: string): Promise<SaiMission> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("sai_missions").select("*")
    .eq("mission_id", missionId).eq("business_id", actor.businessId).eq("actor_user_id", actor.userId).maybeSingle();
  if (error) throw new Error("SAI_MISSION_READ_FAILED: " + error.message);
  if (!data) throw new Error("SAI_MISSION_NOT_FOUND");
  return missionRow(data as Record<string, unknown>, actor);
}

async function claimMission(actor: SaiActor, mission: SaiMission): Promise<SaiMission | null> {
  if (!["queued", "waiting_approval"].includes(mission.status)) return null;
  if (mission.status === "waiting_approval" && !mission.result.pendingApprovalId) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.from("sai_missions").update({
    status: "running",
    attempt_count: mission.attemptCount + 1,
    updated_at: new Date().toISOString(),
  })
    .eq("mission_id", mission.missionId)
    .eq("business_id", actor.businessId)
    .eq("actor_user_id", actor.userId)
    .in("status", ["queued", "waiting_approval"])
    .select("*")
    .maybeSingle();

  if (error) throw new Error("SAI_MISSION_CLAIM_FAILED: " + error.message);
  return data ? missionRow(data as Record<string, unknown>, actor) : null;
}

async function findNextQueuedMission(actor: SaiActor): Promise<SaiMission | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("sai_missions").select("*")
    .eq("business_id", actor.businessId).eq("actor_user_id", actor.userId).eq("status", "queued")
    .order("updated_at", { ascending: true }).limit(1).maybeSingle();
  if (error) throw new Error("SAI_MISSION_QUEUE_READ_FAILED: " + error.message);
  return data ? missionRow(data as Record<string, unknown>, actor) : null;
}

async function persistMissionStatus(actor: SaiActor, missionId: string, status: SaiMission["status"], currentStep: number, result: Record<string, unknown>, blockedReason?: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("sai_missions").update({
    status,
    current_step: currentStep,
    result,
    blocked_reason: blockedReason ?? null,
    completed_at: status === "completed" || status === "cancelled" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("mission_id", missionId).eq("business_id", actor.businessId).eq("actor_user_id", actor.userId);
  if (error) throw new Error("SAI_MISSION_STATUS_WRITE_FAILED: " + error.message);
}

export async function runSaiMission(actor: SaiActor, missionId: string, approvalId?: string): Promise<{
  mission: SaiMission;
  traceId: string;
  plan: Awaited<ReturnType<typeof compileSaiMissionPlan>>;
  results: SaiCapabilityResult[];
  blockedSteps: string[];
}> {
  const requested = await loadMission(actor, missionId);
  if (requested.status === "completed" || requested.status === "cancelled" || requested.status === "failed") {
    throw new Error("SAI_MISSION_NOT_RUNNABLE");
  }
  if (requested.status === "waiting_approval" && !approvalId) {
    throw new Error("SAI_MISSION_APPROVAL_ID_REQUIRED");
  }

  const claimed = await claimMission(actor, requested);
  if (!claimed) throw new Error("SAI_MISSION_CLAIM_LOST");

  const traceId = createSaiTraceId("mission");
  await recordSaiTrace({
    traceId,
    actor,
    sequenceNo: 0,
    phase: "OBSERVE",
    eventType: "mission.claimed",
    status: "started",
    operation: "run_mission",
    missionId: claimed.missionId,
    goalId: claimed.goalId,
    message: "Queued SAI mission claimed for background execution",
    data: { attemptCount: claimed.attemptCount, status: claimed.status },
  });

  try {
    const plan = await compileSaiMissionPlan(actor, claimed.missionId);
    await recordSaiTrace({
      traceId,
      actor,
      sequenceNo: 1,
      phase: "PLAN",
      eventType: "mission.plan.compiled",
      status: "completed",
      operation: "run_mission",
      planId: plan.planId,
      missionId: claimed.missionId,
      goalId: claimed.goalId,
      message: "Mission plan compiled and validated",
      data: { stepCount: plan.steps.length, requiresApproval: plan.requiresApproval },
    });

    const execution = await executeSaiPlan(
      plan,
      actor,
      approvalId,
      traceId,
      "background",
    );

    const firstBlockedIndex = execution.results.findIndex(result => !result.ok);
    const approvalBlocked = execution.results.some(result => result.error === APPROVAL_ERROR);
    const policyBlocked = execution.results.some(result => typeof result.error === "string" && BLOCKING_ERRORS.has(result.error));
    const otherFailure = execution.results.some(result => !result.ok && result.error !== APPROVAL_ERROR && !BLOCKING_ERRORS.has(result.error ?? ""));
    const status: SaiMission["status"] =
      approvalBlocked ? "waiting_approval" :
      otherFailure ? "failed" :
      policyBlocked || execution.blockedSteps.length > 0 ? "blocked" :
      "completed";
    const currentStep = firstBlockedIndex >= 0 ? firstBlockedIndex : plan.steps.length;
    const blockedReason = approvalBlocked
      ? "OWNER_APPROVAL_REQUIRED"
      : execution.results.find(result => !result.ok)?.error;
    const result = {
      traceId,
      planId: plan.planId,
      resultCount: execution.results.length,
      blockedSteps: execution.blockedSteps,
      results: execution.results.map(item => ({
        ok: item.ok,
        error: item.error,
        output: item.output ?? {},
        evidenceIds: item.evidenceIds ?? [],
      })),
    };

    await persistMissionStatus(actor, claimed.missionId, status, currentStep, result, blockedReason);
    await recordSaiTrace({
      traceId,
      actor,
      sequenceNo: 1000,
      phase: "REMEMBER",
      eventType: "mission.completed",
      status: status === "completed" ? "completed" : status === "failed" ? "failed" : "blocked",
      operation: "run_mission",
      planId: plan.planId,
      missionId: claimed.missionId,
      goalId: claimed.goalId,
      message: "Mission outcome persisted",
      data: { status, currentStep, blockedSteps: execution.blockedSteps, blockedReason: blockedReason ?? null },
      evidenceIds: execution.results.flatMap(item => item.evidenceIds ?? []),
    });

    return {
      mission: await loadMission(actor, claimed.missionId),
      traceId,
      plan,
      results: execution.results,
      blockedSteps: execution.blockedSteps,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await persistMissionStatus(actor, claimed.missionId, "failed", claimed.currentStep, { traceId, error: message }, message);
    await recordSaiTrace({
      traceId,
      actor,
      sequenceNo: 1000,
      phase: "EXECUTE",
      eventType: "mission.failed",
      status: "failed",
      operation: "run_mission",
      missionId: claimed.missionId,
      goalId: claimed.goalId,
      message,
      data: { error: message },
    }).catch(() => undefined);
    throw error;
  }
}

export async function runNextSaiMission(actor: SaiActor, approvalId?: string): Promise<{
  mission: SaiMission;
  traceId: string;
  plan: Awaited<ReturnType<typeof compileSaiMissionPlan>>;
  results: SaiCapabilityResult[];
  blockedSteps: string[];
} | null> {
  const next = await findNextQueuedMission(actor);
  if (!next) return null;
  return runSaiMission(actor, next.missionId, approvalId);
}
