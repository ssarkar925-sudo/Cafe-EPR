import { getSaiCapability } from "@/lib/sai/core/capabilities";
import type { SaiPlan, SaiRiskLevel, SaiWorldState } from "@/lib/sai/core/types";

const READ_PATTERNS = [
  /what is/i, /show/i, /check/i, /status/i, /how much/i, /কত/, /দেখাও/, /কি আছে/, /क्या/, /बताओ/,
];

export function planSaiInstruction(input: {
  instruction: string;
  world: SaiWorldState;
}): SaiPlan {
  const text = input.instruction.trim();
  const isRead = READ_PATTERNS.some((pattern) => pattern.test(text));

  if (isRead) {
    const capability = getSaiCapability("business.observe");
    return {
      goal: text,
      steps: capability ? [{ capability: capability.id, input: { instruction: text }, risk: capability.risk }] : [],
      requiresApproval: false,
    };
  }

  return {
    goal: text,
    steps: [],
    requiresApproval: true,
  };
}

export function planRisk(plan: SaiPlan): SaiRiskLevel {
  return plan.steps.reduce<SaiRiskLevel>((risk, step) => {
    const order: SaiRiskLevel[] = ["read", "low", "medium", "high", "critical"];
    return order.indexOf(step.risk) > order.indexOf(risk) ? step.risk : risk;
  }, "read");
}