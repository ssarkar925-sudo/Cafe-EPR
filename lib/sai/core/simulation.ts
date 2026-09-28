import { createClient } from "@/lib/supabase/server";
import { createSaiEvidence, hashSaiEvidence } from "./evidence";
import { getSaiCapability } from "./capabilities";
import { loadSaiWorldState } from "./world-state";
import type {
  SaiActor, SaiCapability, SaiPlan, SaiPlanStep, SaiContradiction, SaiExecutionMode,
  SaiSimulationEffect, SaiSimulationResult,
} from "./types";

const RISK_ORDER = ["read", "low", "medium", "high", "critical"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (!isRecord(value)) return JSON.stringify(value);
  return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + stable(value[key])).join(",") + "}";
}

function deepEqual(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}

function isConsequential(step: SaiPlanStep, capability: SaiCapability & { mutates?: boolean }): boolean {
  return capability.risk !== "read" || step.risk !== "read" || Boolean(capability.mutates);
}

function extractBaselineEntities(facts: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const value = facts.entities;
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => isRecord(item)) as Array<[string, Record<string, unknown>]>,
  );
}

function contradiction(
  planId: string,
  stepId: string | undefined,
  type: SaiContradiction["contradictionType"],
  severity: SaiContradiction["severity"],
  detail: string,
  expected: Record<string, unknown>,
  observed: Record<string, unknown>,
  entityKey?: string,
): SaiContradiction {
  return {
    contradictionId: crypto.randomUUID(),
    planId,
    stepId,
    contradictionType: type,
    severity,
    entityKey,
    expected,
    observed,
    detail,
    evidenceIds: [],
    status: "open",
    createdAt: new Date().toISOString(),
  };
}

export async function detectSaiContradictions(input: {
  plan: SaiPlan;
  baseline: Awaited<ReturnType<typeof loadSaiWorldState>>;
  effects: Array<{ step: SaiPlanStep; capability: SaiCapability; effect: SaiSimulationEffect }>;
}): Promise<SaiContradiction[]> {
  const contradictions: SaiContradiction[] = [];
  const entities = extractBaselineEntities(input.baseline.facts);
  const seenPatches = new Map<string, { stepId: string; patch: Record<string, unknown> }>();

  for (const item of input.effects) {
    const effect = item.effect;
    const entityKey = effect.entityKey?.trim();
    const patch = effect.patch ?? {};

    if (entityKey) {
      const prior = seenPatches.get(entityKey);
      if (prior) {
        for (const [key, value] of Object.entries(patch)) {
          if (key in prior.patch && !deepEqual(prior.patch[key], value)) {
            contradictions.push(contradiction(
              input.plan.planId,
              item.step.stepId,
              "patch_conflict",
              "blocking",
              `Conflicting simulated values for ${entityKey}.${key} between ${prior.stepId} and ${item.step.stepId}.`,
              { value: prior.patch[key], stepId: prior.stepId },
              { value, stepId: item.step.stepId },
              entityKey,
            ));
          }
        }
      }
      seenPatches.set(entityKey, { stepId: item.step.stepId, patch: { ...(seenPatches.get(entityKey)?.patch ?? {}), ...patch } });

      if (effect.expected && entities[entityKey] && !deepEqual(effect.expected, entities[entityKey])) {
        contradictions.push(contradiction(
          input.plan.planId,
          item.step.stepId,
          "baseline_mismatch",
          item.step.risk === "critical" ? "critical" : "blocking",
          `Simulated baseline for ${entityKey} does not match the latest SAI world state.`,
          effect.expected,
          entities[entityKey],
          entityKey,
        ));
      }
    }
  }

  return contradictions;
}

async function persistSimulation(
  actor: SaiActor,
  result: SaiSimulationResult,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("sai_simulations").insert({
    simulation_id: result.simulationId,
    business_id: actor.businessId,
    actor_user_id: actor.userId,
    plan_id: result.planId,
    mode: result.mode,
    status: result.status,
    baseline_hash: result.baselineHash,
    predicted_state: result.predictedState,
    contradictions: result.contradictions,
    evidence_ids: result.evidenceIds,
    step_count: result.stepCount,
    created_at: result.createdAt,
  });
  if (error) throw new Error("SAI_SIMULATION_PERSIST_FAILED: " + error.message);
}

async function persistContradictions(actor: SaiActor, simulationId: string, contradictions: SaiContradiction[]): Promise<SaiContradiction[]> {
  if (!contradictions.length) return [];
  const supabase = await createClient();
  const rows = contradictions.map(item => ({
    contradiction_id: item.contradictionId,
    business_id: actor.businessId,
    actor_user_id: actor.userId,
    simulation_id: simulationId,
    plan_id: item.planId,
    step_id: item.stepId ?? null,
    contradiction_type: item.contradictionType,
    severity: item.severity,
    entity_key: item.entityKey ?? null,
    expected: item.expected,
    observed: item.observed,
    detail: item.detail,
    evidence_ids: item.evidenceIds,
    status: item.status,
    created_at: item.createdAt,
  }));
  const { error } = await supabase.from("sai_contradictions").insert(rows);
  if (error) throw new Error("SAI_CONTRADICTION_PERSIST_FAILED: " + error.message);
  return contradictions;
}

export async function simulateSaiPlan(input: {
  actor: SaiActor;
  plan: SaiPlan;
  mode?: SaiExecutionMode;
}): Promise<SaiSimulationResult> {
  if (!input.plan.validation || input.plan.version !== 1) throw new Error("SAI_PLAN_NOT_VALIDATED");
  const mode = input.mode ?? "operator";
  const baseline = await loadSaiWorldState(input.actor);
  const baselineHash = await hashSaiEvidence({
    worldStateVersion: baseline.facts.worldStateVersion ?? 0,
    transaction: baseline.transaction,
    customer: baseline.customer,
    facts: baseline.facts,
  });
  const simulationId = crypto.randomUUID();
  const effects: Array<{ step: SaiPlanStep; capability: SaiCapability; effect: SaiSimulationEffect }> = [];
  const predictedEntities = extractBaselineEntities(baseline.facts);
  const unsupported: SaiContradiction[] = [];

  for (const step of input.plan.steps) {
    const capability = getSaiCapability(step.capability);
    if (!capability) throw new Error("SAI_SIMULATION_UNKNOWN_CAPABILITY:" + step.capability);

    if (isConsequential(step, capability) && !capability.simulate) {
      unsupported.push(contradiction(
        input.plan.planId,
        step.stepId,
        "unsupported_simulation",
        "blocking",
        `Capability ${capability.id} has no simulation contract; consequential execution is refused.`,
        { simulationRequired: true },
        { capability: capability.id },
      ));
      continue;
    }

    let effect: SaiSimulationEffect;
    try {
      effect = capability.simulate
        ? await capability.simulate(step.input, { plan: input.plan, step, actor: input.actor, mode, now: new Date().toISOString(), baseline })
        : { predictedOutput: { simulated: true } };
    } catch (error) {
      unsupported.push(contradiction(
        input.plan.planId,
        step.stepId,
        "unsupported_simulation",
        "blocking",
        error instanceof Error ? error.message : "Simulation contract failed.",
        { simulationAvailable: true },
        { error: String(error) },
      ));
      continue;
    }
    effects.push({ step, capability, effect });
    if (effect.entityKey && effect.patch) {
      predictedEntities[effect.entityKey] = { ...(predictedEntities[effect.entityKey] ?? {}), ...effect.patch };
    }
  }

  const contradictions = [
    ...unsupported,
    ...(await detectSaiContradictions({ plan: input.plan, baseline, effects })),
  ];
  const evidence = await createSaiEvidence({
    evidenceId: "simulation:" + simulationId,
    actor: input.actor,
    sourceType: "sai.simulation",
    sourceRef: input.plan.planId,
    data: {
      simulationId,
      planId: input.plan.planId,
      mode,
      baselineHash,
      predictedState: { entities: predictedEntities },
      contradictions: contradictions.map(item => ({
        contradictionId: item.contradictionId,
        stepId: item.stepId,
        type: item.contradictionType,
        severity: item.severity,
        detail: item.detail,
      })),
    },
    confidence: contradictions.length ? 0.1 : 0.9,
  });

  const status = contradictions.some(item => item.severity === "critical" || item.severity === "blocking")
    ? "contradiction"
    : "safe";
  const result: SaiSimulationResult = {
    simulationId,
    planId: input.plan.planId,
    mode,
    status,
    baselineHash,
    predictedState: { entities: predictedEntities, stepEffects: effects.map(item => ({ stepId: item.step.stepId, capability: item.capability.id, effect: item.effect })) },
    contradictions,
    stepCount: input.plan.steps.length,
    evidenceIds: [evidence.evidenceId],
    createdAt: evidence.observedAt,
  };
  await persistContradictions(input.actor, simulationId, contradictions.map(item => ({ ...item, evidenceIds: [evidence.evidenceId] })));
  result.contradictions = contradictions.map(item => ({ ...item, evidenceIds: [evidence.evidenceId], simulationId }));
  await persistSimulation(input.actor, result);
  return result;
}

export async function listSaiContradictions(actor: SaiActor, limit = 50): Promise<SaiContradiction[]> {
  const safeLimit = Math.max(1, Math.min(100, limit));
  const supabase = await createClient();
  const { data, error } = await supabase.from("sai_contradictions").select("*")
    .eq("actor_user_id", actor.userId).eq("business_id", actor.businessId)
    .eq("status", "open").order("created_at", { ascending: false }).limit(safeLimit);
  if (error) throw new Error("SAI_CONTRADICTIONS_READ_FAILED: " + error.message);
  return (data ?? []).map(row => ({
    contradictionId: String(row.contradiction_id),
    simulationId: row.simulation_id ? String(row.simulation_id) : undefined,
    planId: String(row.plan_id),
    stepId: row.step_id ? String(row.step_id) : undefined,
    contradictionType: row.contradiction_type,
    severity: row.severity,
    entityKey: row.entity_key ? String(row.entity_key) : undefined,
    expected: isRecord(row.expected) ? row.expected : {},
    observed: isRecord(row.observed) ? row.observed : {},
    detail: String(row.detail),
    evidenceIds: Array.isArray(row.evidence_ids) ? row.evidence_ids.map(String) : [],
    status: row.status,
    createdAt: String(row.created_at),
  }));
}
