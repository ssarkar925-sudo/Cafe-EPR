import { createClient } from "@/lib/supabase/server";
import type { SaiActor, SaiGoal, SaiGoalPriority, SaiGoalStatus, SaiMission, SaiMissionStatus } from "./types";

const GOAL_TRANSITIONS: Record<SaiGoalStatus, SaiGoalStatus[]> = {
  active: ["paused", "completed", "cancelled", "failed"],
  paused: ["active", "cancelled", "failed"],
  completed: [],
  cancelled: [],
  failed: ["active"],
};
const MISSION_TRANSITIONS: Record<SaiMissionStatus, SaiMissionStatus[]> = {
  queued: ["running", "waiting_approval", "blocked", "cancelled"],
  running: ["waiting_approval", "blocked", "completed", "failed", "cancelled"],
  waiting_approval: ["running", "blocked", "cancelled"],
  blocked: ["queued", "running", "cancelled"],
  failed: ["queued", "cancelled"],
  completed: [],
  cancelled: [],
};

export async function listSaiGoals(actor: SaiActor, status?: SaiGoalStatus): Promise<SaiGoal[]> {
  const supabase = await createClient();
  let query = supabase.from("sai_goals").select("*").eq("business_id", actor.businessId).eq("actor_user_id", actor.userId)
    .order("updated_at", { ascending: false }).limit(100);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw new Error(`SAI_GOALS_READ_FAILED: ${error.message}`);
  return (data ?? []).map((row) => rowToGoal(row as Record<string, unknown>, actor));
}

export async function createSaiGoal(actor: SaiActor, input: {
  title: string; objective: string; priority?: SaiGoalPriority; target?: Record<string, unknown>;
  successCriteria?: unknown[]; context?: Record<string, unknown>; nextAction?: string; dueAt?: string | null;
}): Promise<SaiGoal> {
  const title = input.title.trim(), objective = input.objective.trim();
  if (!title || !objective) throw new Error("SAI_GOAL_TITLE_AND_OBJECTIVE_REQUIRED");
  if (title.length > 200) throw new Error("SAI_GOAL_TITLE_TOO_LONG");
  if (objective.length > 4000) throw new Error("SAI_GOAL_OBJECTIVE_TOO_LONG");
  const supabase = await createClient();
  const { data, error } = await supabase.from("sai_goals").insert({
    business_id: actor.businessId, actor_user_id: actor.userId, title, objective, status: "active",
    priority: input.priority ?? "normal", target: input.target ?? {}, success_criteria: input.successCriteria ?? [],
    context: input.context ?? {}, next_action: input.nextAction?.trim() || null, due_at: input.dueAt ?? null,
  }).select("*").single();
  if (error) throw new Error(`SAI_GOAL_CREATE_FAILED: ${error.message}`);
  return rowToGoal(data as Record<string, unknown>, actor);
}

export async function updateSaiGoal(actor: SaiActor, goalId: string, patch: {
  title?: string; objective?: string; status?: SaiGoalStatus; priority?: SaiGoalPriority;
  target?: Record<string, unknown>; successCriteria?: unknown[]; context?: Record<string, unknown>;
  nextAction?: string | null; dueAt?: string | null;
}): Promise<SaiGoal> {
  const supabase = await createClient();
  const { data: existing, error: lookupError } = await supabase.from("sai_goals").select("*")
    .eq("goal_id", goalId).eq("business_id", actor.businessId).eq("actor_user_id", actor.userId).maybeSingle();
  if (lookupError) throw new Error(`SAI_GOAL_READ_FAILED: ${lookupError.message}`);
  if (!existing) throw new Error("SAI_GOAL_NOT_FOUND");
  const current = rowToGoal(existing as Record<string, unknown>, actor), nextStatus = patch.status ?? current.status;
  if (nextStatus !== current.status && !GOAL_TRANSITIONS[current.status].includes(nextStatus)) throw new Error(`SAI_GOAL_INVALID_TRANSITION:${current.status}->${nextStatus}`);
  const title = patch.title?.trim(), objective = patch.objective?.trim();
  if (title !== undefined && !title) throw new Error("SAI_GOAL_TITLE_REQUIRED");
  if (objective !== undefined && !objective) throw new Error("SAI_GOAL_OBJECTIVE_REQUIRED");

  const update: Record<string, unknown> = {
    ...(title !== undefined ? { title } : {}), ...(objective !== undefined ? { objective } : {}),
    ...(patch.status ? { status: patch.status } : {}), ...(patch.priority ? { priority: patch.priority } : {}),
    ...(patch.target !== undefined ? { target: patch.target } : {}),
    ...(patch.successCriteria !== undefined ? { success_criteria: patch.successCriteria } : {}),
    ...(patch.context !== undefined ? { context: patch.context } : {}),
    ...(patch.nextAction !== undefined ? { next_action: patch.nextAction?.trim() || null } : {}),
    ...(patch.dueAt !== undefined ? { due_at: patch.dueAt } : {}),
    ...(nextStatus === "completed" ? { completed_at: new Date().toISOString() } : {}),
  };
  const { data, error } = await supabase.from("sai_goals").update(update)
    .eq("goal_id", goalId).eq("business_id", actor.businessId).eq("actor_user_id", actor.userId).select("*").single();
  if (error) throw new Error(`SAI_GOAL_UPDATE_FAILED: ${error.message}`);
  return rowToGoal(data as Record<string, unknown>, actor);
}

export async function listSaiMissions(actor: SaiActor, options: { goalId?: string; status?: SaiMissionStatus } = {}): Promise<SaiMission[]> {
  const supabase = await createClient();
  let query = supabase.from("sai_missions").select("*").eq("business_id", actor.businessId).eq("actor_user_id", actor.userId)
    .order("updated_at", { ascending: false }).limit(100);
  if (options.goalId) query = query.eq("goal_id", options.goalId);
  if (options.status) query = query.eq("status", options.status);
  const { data, error } = await query;
  if (error) throw new Error(`SAI_MISSIONS_READ_FAILED: ${error.message}`);
  return (data ?? []).map((row) => rowToMission(row as Record<string, unknown>, actor));
}

export async function createSaiMission(actor: SaiActor, input: { goalId: string; title: string; plan?: Record<string, unknown> }): Promise<SaiMission> {
  const title = input.title.trim();
  if (!input.goalId || !title) throw new Error("SAI_MISSION_GOAL_AND_TITLE_REQUIRED");
  if (title.length > 200) throw new Error("SAI_MISSION_TITLE_TOO_LONG");
  const supabase = await createClient();
  const { data: goal, error: goalError } = await supabase.from("sai_goals").select("goal_id,status,business_id,actor_user_id")
    .eq("goal_id", input.goalId).eq("business_id", actor.businessId).eq("actor_user_id", actor.userId).maybeSingle();
  if (goalError) throw new Error(`SAI_GOAL_READ_FAILED: ${goalError.message}`);
  if (!goal) throw new Error("SAI_GOAL_NOT_FOUND");
  if (goal.status !== "active") throw new Error("SAI_GOAL_NOT_ACTIVE");
  const { data, error } = await supabase.from("sai_missions").insert({
    goal_id: input.goalId, business_id: actor.businessId, actor_user_id: actor.userId, title, status: "queued",
    plan: input.plan ?? {}, current_step: 0, attempt_count: 0, result: {},
  }).select("*").single();
  if (error) throw new Error(`SAI_MISSION_CREATE_FAILED: ${error.message}`);
  return rowToMission(data as Record<string, unknown>, actor);
}

export async function updateSaiMission(actor: SaiActor, missionId: string, patch: {
  status?: SaiMissionStatus; currentStep?: number; attemptCount?: number; blockedReason?: string | null; result?: Record<string, unknown>;
}): Promise<SaiMission> {
  if (patch.currentStep !== undefined && (!Number.isInteger(patch.currentStep) || patch.currentStep < 0)) throw new Error("SAI_MISSION_CURRENT_STEP_INVALID");
  if (patch.attemptCount !== undefined && (!Number.isInteger(patch.attemptCount) || patch.attemptCount < 0)) throw new Error("SAI_MISSION_ATTEMPT_COUNT_INVALID");
  const supabase = await createClient();
  const { data: existing, error: lookupError } = await supabase.from("sai_missions").select("*")
    .eq("mission_id", missionId).eq("business_id", actor.businessId).eq("actor_user_id", actor.userId).maybeSingle();
  if (lookupError) throw new Error(`SAI_MISSION_READ_FAILED: ${lookupError.message}`);
  if (!existing) throw new Error("SAI_MISSION_NOT_FOUND");
  const current = rowToMission(existing as Record<string, unknown>, actor), nextStatus = patch.status ?? current.status;
  if (nextStatus !== current.status && !MISSION_TRANSITIONS[current.status].includes(nextStatus)) throw new Error(`SAI_MISSION_INVALID_TRANSITION:${current.status}->${nextStatus}`);
  const update: Record<string, unknown> = {
    ...(patch.status ? { status: patch.status } : {}), ...(patch.currentStep !== undefined ? { current_step: patch.currentStep } : {}),
    ...(patch.attemptCount !== undefined ? { attempt_count: patch.attemptCount } : {}),
    ...(patch.blockedReason !== undefined ? { blocked_reason: patch.blockedReason?.trim() || null } : {}),
    ...(patch.result !== undefined ? { result: patch.result } : {}),
    ...(nextStatus === "completed" || nextStatus === "cancelled" ? { completed_at: new Date().toISOString() } : {}),
  };
  const { data, error } = await supabase.from("sai_missions").update(update)
    .eq("mission_id", missionId).eq("business_id", actor.businessId).eq("actor_user_id", actor.userId).select("*").single();
  if (error) throw new Error(`SAI_MISSION_UPDATE_FAILED: ${error.message}`);
  return rowToMission(data as Record<string, unknown>, actor);
}

export async function getSaiGoalSnapshot(actor: SaiActor): Promise<{ activeGoals: number; activeMissions: number; goals: SaiGoal[]; missions: SaiMission[] }> {
  const [goals, missions] = await Promise.all([listSaiGoals(actor, "active"), listSaiMissions(actor)]);
  const activeMissions = missions.filter((mission) => ["queued","running","waiting_approval","blocked"].includes(mission.status)).length;
  return { activeGoals: goals.length, activeMissions, goals, missions };
}

function rowToGoal(row: Record<string, unknown>, actor: SaiActor): SaiGoal {
  return { goalId: String(row.goal_id), actor, title: String(row.title ?? ""), objective: String(row.objective ?? ""),
    status: row.status as SaiGoalStatus, priority: row.priority as SaiGoalPriority, target: isRecord(row.target) ? row.target : {},
    successCriteria: Array.isArray(row.success_criteria) ? row.success_criteria : [], context: isRecord(row.context) ? row.context : {},
    nextAction: row.next_action ? String(row.next_action) : undefined, dueAt: row.due_at ? String(row.due_at) : undefined,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at), completedAt: row.completed_at ? String(row.completed_at) : undefined };
}
function rowToMission(row: Record<string, unknown>, actor: SaiActor): SaiMission {
  return { missionId: String(row.mission_id), goalId: String(row.goal_id), actor, title: String(row.title ?? ""),
    status: row.status as SaiMissionStatus, plan: isRecord(row.plan) ? row.plan : {}, currentStep: Number(row.current_step ?? 0),
    attemptCount: Number(row.attempt_count ?? 0), blockedReason: row.blocked_reason ? String(row.blocked_reason) : undefined,
    result: isRecord(row.result) ? row.result : {}, createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    completedAt: row.completed_at ? String(row.completed_at) : undefined };
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }