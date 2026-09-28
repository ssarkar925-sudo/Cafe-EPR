import { createClient } from "@/lib/supabase/server";
import type { SaiActor, SaiTracePhase, SaiTraceRecord, SaiTraceStatus } from "./types";

export const SAI_TRACE_PHASES: SaiTracePhase[] = [
  "OBSERVE", "UNDERSTAND", "IDENTIFY", "RETRIEVE", "REASON", "PLAN",
  "DECIDE", "EXECUTE", "VERIFY", "LEARN", "REMEMBER",
];

const SAI_TRACE_STATUSES: SaiTraceStatus[] = ["started", "completed", "blocked", "failed", "skipped"];

function rowToTrace(row: Record<string, unknown>, actor: SaiActor): SaiTraceRecord {
  return {
    spanId: String(row.span_id),
    traceId: String(row.trace_id),
    parentSpanId: row.parent_span_id ? String(row.parent_span_id) : undefined,
    actor,
    sequenceNo: Number(row.sequence_no),
    phase: row.phase as SaiTracePhase,
    eventType: String(row.event_type),
    status: row.status as SaiTraceStatus,
    operation: String(row.operation),
    planId: row.plan_id ? String(row.plan_id) : undefined,
    missionId: row.mission_id ? String(row.mission_id) : undefined,
    goalId: row.goal_id ? String(row.goal_id) : undefined,
    commandId: row.command_id ? String(row.command_id) : undefined,
    stepId: row.step_id ? String(row.step_id) : undefined,
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    durationMs: row.duration_ms == null ? undefined : Number(row.duration_ms),
    message: row.message ? String(row.message) : undefined,
    data: (row.data as Record<string, unknown>) ?? {},
    evidenceIds: Array.isArray(row.evidence_ids)
      ? row.evidence_ids.filter((id): id is string => typeof id === "string")
      : [],
  };
}

export function createSaiTraceId(operation = "run"): string {
  return "sai:" + operation + ":" + crypto.randomUUID();
}

export async function recordSaiTrace(input: {
  traceId: string;
  actor: SaiActor;
  sequenceNo: number;
  phase: SaiTracePhase;
  eventType: string;
  status: SaiTraceStatus;
  operation: string;
  parentSpanId?: string;
  planId?: string;
  missionId?: string;
  goalId?: string;
  commandId?: string;
  stepId?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  message?: string;
  data?: Record<string, unknown>;
  evidenceIds?: string[];
}): Promise<SaiTraceRecord> {
  if (!input.traceId.trim()) throw new Error("SAI_TRACE_ID_REQUIRED");
  if (!input.actor.userId || !input.actor.businessId) throw new Error("SAI_TRACE_ACTOR_REQUIRED");
  if (!Number.isInteger(input.sequenceNo) || input.sequenceNo < 0) throw new Error("SAI_TRACE_SEQUENCE_INVALID");
  if (!SAI_TRACE_PHASES.includes(input.phase)) throw new Error("SAI_TRACE_PHASE_INVALID");
  if (!SAI_TRACE_STATUSES.includes(input.status)) throw new Error("SAI_TRACE_STATUS_INVALID");
  if (!input.eventType.trim()) throw new Error("SAI_TRACE_EVENT_TYPE_REQUIRED");
  if (!input.operation.trim()) throw new Error("SAI_TRACE_OPERATION_REQUIRED");

  const startedAt = input.startedAt ?? new Date().toISOString();
  const completedAt = input.completedAt;
  const durationMs = input.durationMs ?? (
    completedAt ? Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime()) : undefined
  );
  const row = {
    span_id: crypto.randomUUID(),
    trace_id: input.traceId,
    parent_span_id: input.parentSpanId ?? null,
    business_id: input.actor.businessId,
    actor_user_id: input.actor.userId,
    sequence_no: input.sequenceNo,
    phase: input.phase,
    event_type: input.eventType,
    status: input.status,
    operation: input.operation,
    plan_id: input.planId ?? null,
    mission_id: input.missionId ?? null,
    goal_id: input.goalId ?? null,
    command_id: input.commandId ?? null,
    step_id: input.stepId ?? null,
    started_at: startedAt,
    completed_at: completedAt ?? null,
    duration_ms: durationMs ?? null,
    message: input.message ?? null,
    data: input.data ?? {},
    evidence_ids: input.evidenceIds ?? [],
  };

  const supabase = await createClient();
  const { error } = await supabase.from("sai_execution_traces").insert(row);
  if (error) {
    if (error.code !== "23505") throw new Error("SAI_TRACE_PERSIST_FAILED: " + error.message);
    const { data, error: readError } = await supabase
      .from("sai_execution_traces")
      .select("*")
      .eq("actor_user_id", input.actor.userId)
      .eq("business_id", input.actor.businessId)
      .eq("trace_id", input.traceId)
      .eq("sequence_no", input.sequenceNo)
      .maybeSingle();
    if (readError || !data) throw new Error("SAI_TRACE_IDEMPOTENCY_READ_FAILED: " + (readError?.message ?? "trace span not found"));
    return rowToTrace(data, input.actor);
  }
  return rowToTrace(row, input.actor);
}

export async function getSaiTrace(actor: SaiActor, traceId: string, limit = 200): Promise<SaiTraceRecord[]> {
  const safeLimit = Math.max(1, Math.min(500, limit));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sai_execution_traces").select("*")
    .eq("actor_user_id", actor.userId).eq("business_id", actor.businessId)
    .eq("trace_id", traceId).order("sequence_no", { ascending: true }).limit(safeLimit);
  if (error) throw new Error("SAI_TRACE_READ_FAILED: " + error.message);
  return (data ?? []).map(row => rowToTrace(row, actor));
}

export async function getRecentSaiTraces(actor: SaiActor, limit = 20): Promise<SaiTraceRecord[]> {
  const safeLimit = Math.max(1, Math.min(50, limit));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sai_execution_traces").select("*")
    .eq("actor_user_id", actor.userId).eq("business_id", actor.businessId)
    .eq("sequence_no", 0).order("created_at", { ascending: false }).limit(safeLimit);
  if (error) throw new Error("SAI_TRACE_READ_FAILED: " + error.message);
  return (data ?? []).map(row => rowToTrace(row, actor));
}
