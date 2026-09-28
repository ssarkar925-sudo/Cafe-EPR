import { createClient } from "@/lib/supabase/server";
import { getSaiCapability } from "@/lib/sai/core/capabilities";
import type { SaiActor, SaiPlan, SaiPlanStep, SaiRiskLevel } from "@/lib/sai/core/types";

const RISK_ORDER: SaiRiskLevel[] = ["read", "low", "medium", "high", "critical"];
const MAX_PLAN_STEPS = 20;

type RawStep = {
  stepId?: string;
  capability: string;
  input: Record<string, unknown>;
  risk: SaiRiskLevel;
  dependsOn?: string[];
};

export function compileSaiPlan(input: {
  source: "instruction" | "goal" | "mission";
  goal: string;
  steps: RawStep[];
  requiresApproval?: boolean;
}): SaiPlan {
  const goal = input.goal.trim();
  if (!goal) throw new Error("SAI_PLAN_GOAL_REQUIRED");
  if (input.steps.length > MAX_PLAN_STEPS) throw new Error("SAI_PLAN_TOO_MANY_STEPS");

  const used = new Set<string>();
  const steps: SaiPlanStep[] = input.steps.map((step, index) => {
    if (!step.capability?.trim()) throw new Error(`SAI_PLAN_CAPABILITY_REQUIRED:${index}`);
    if (!isRecord(step.input)) throw new Error(`SAI_PLAN_INPUT_INVALID:${index}`);

    const capability = getSaiCapability(step.capability);
    if (!capability) throw new Error(`SAI_PLAN_UNKNOWN_CAPABILITY:${step.capability}`);

    const stepId = step.stepId?.trim() || `step-${index + 1}`;
    if (used.has(stepId)) throw new Error(`SAI_PLAN_DUPLICATE_STEP:${stepId}`);
    used.add(stepId);

    const capabilityRisk = capability.risk;
    const requestedRiskIndex = RISK_ORDER.indexOf(step.risk);
    const capabilityRiskIndex = RISK_ORDER.indexOf(capabilityRisk);
    if (requestedRiskIndex < 0) throw new Error(`SAI_PLAN_INVALID_RISK:${stepId}`);

    const risk = RISK_ORDER[Math.max(requestedRiskIndex, capabilityRiskIndex)];
    const dependsOn = [...new Set(step.dependsOn ?? [])];
    for (const dependency of dependsOn) {
      if (dependency === stepId || !used.has(dependency)) {
        throw new Error(`SAI_PLAN_INVALID_DEPENDENCY:${stepId}:${dependency}`);
      }
    }

    return { stepId, capability: capability.id, input: step.input, risk, dependsOn };
  });

  const requiresApproval = Boolean(input.requiresApproval) || steps.some((step) => {
    const capability = getSaiCapability(step.capability);
    return RISK_ORDER.indexOf(step.risk) >= RISK_ORDER.indexOf("high") || Boolean(capability?.requiresApproval);
  });

  return {
    planId: crypto.randomUUID(),
    version: 1,
    compiledAt: new Date().toISOString(),
    source: input.source,
    goal,
    steps,
    requiresApproval,
    validation: "validated",
  };
}

export async function compileSaiMissionPlan(actor: SaiActor, missionId: string): Promise<SaiPlan> {
  const supabase = await createClient();

  const { data: mission, error: missionError } = await supabase
    .from("sai_missions")
    .select("mission_id,goal_id,status,plan,business_id,actor_user_id")
    .eq("mission_id", missionId)
    .eq("business_id", actor.businessId)
    .eq("actor_user_id", actor.userId)
    .maybeSingle();

  if (missionError) throw new Error(`SAI_MISSION_READ_FAILED: ${missionError.message}`);
  if (!mission) throw new Error("SAI_MISSION_NOT_FOUND");
  if (mission.status === "completed" || mission.status === "cancelled") {
    throw new Error("SAI_MISSION_NOT_EDITABLE");
  }

  const { data: goal, error: goalError } = await supabase
    .from("sai_goals")
    .select("goal_id,status,objective")
    .eq("goal_id", mission.goal_id)
    .eq("business_id", actor.businessId)
    .eq("actor_user_id", actor.userId)
    .maybeSingle();

  if (goalError) throw new Error(`SAI_GOAL_READ_FAILED: ${goalError.message}`);
  if (!goal) throw new Error("SAI_GOAL_NOT_FOUND");
  if (goal.status !== "active") throw new Error("SAI_GOAL_NOT_ACTIVE");

  const existingPlan = isRecord(mission.plan) ? mission.plan : {};
  const rawSteps = Array.isArray(existingPlan.steps) ? existingPlan.steps : [];

  const steps: RawStep[] = rawSteps.map((step, index) => {
    if (!isRecord(step)) throw new Error(`SAI_PLAN_STEP_INVALID:${index}`);

    const dependsOn = Array.isArray(step.dependsOn)
      ? step.dependsOn.filter((value): value is string => typeof value === "string")
      : [];

    return {
      stepId: typeof step.stepId === "string" ? step.stepId : undefined,
      capability: typeof step.capability === "string" ? step.capability : "",
      input: isRecord(step.input) ? step.input : {},
      risk: typeof step.risk === "string" ? step.risk as SaiRiskLevel : "read",
      dependsOn,
    };
  });

  const goalText =
    typeof existingPlan.goal === "string" && existingPlan.goal.trim()
      ? existingPlan.goal
      : String(goal.objective ?? missionId);

  const compiled = compileSaiPlan({
    source: "mission",
    goal: goalText,
    steps,
    requiresApproval: existingPlan.requiresApproval === true,
  });

  const { error: updateError } = await supabase
    .from("sai_missions")
    .update({ plan: compiled })
    .eq("mission_id", missionId)
    .eq("business_id", actor.businessId)
    .eq("actor_user_id", actor.userId);

  if (updateError) throw new Error(`SAI_MISSION_PLAN_WRITE_FAILED: ${updateError.message}`);

  return compiled;
}

export function planRisk(plan: SaiPlan): SaiRiskLevel {
  return plan.steps.reduce<SaiRiskLevel>((risk, step) =>
    RISK_ORDER.indexOf(step.risk) > RISK_ORDER.indexOf(risk) ? step.risk : risk, "read");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
