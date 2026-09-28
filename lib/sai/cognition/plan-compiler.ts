import { getSaiCapability } from "@/lib/sai/core/capabilities";
import { saiCommandRequiresApproval } from "@/lib/sai/core/policy";
import type { SaiPlan, SaiPlanStep, SaiRiskLevel } from "@/lib/sai/core/types";

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

export function planRisk(plan: SaiPlan): SaiRiskLevel {
  return plan.steps.reduce<SaiRiskLevel>((risk, step) =>
    RISK_ORDER.indexOf(step.risk) > RISK_ORDER.indexOf(risk) ? step.risk : risk, "read");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
