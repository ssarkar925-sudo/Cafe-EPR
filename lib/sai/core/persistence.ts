import { createClient } from "@/lib/supabase/server";
import type { SaiActor, SaiCapabilityResult, SaiCommand, SaiEvent } from "./types";

export async function persistSaiEvent(event: SaiEvent): Promise<{ inserted: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.from("sai_events").insert({
    event_id: event.eventId, business_id: event.actor?.businessId ?? null, event_type: event.type,
    occurred_at: event.occurredAt, actor_user_id: event.actor?.userId ?? null, entity_id: event.entityId ?? null,
    payload: event.payload, evidence_ids: event.evidenceIds ?? [],
  });
  if (!error) return { inserted: true };
  if (error.code !== "23505") throw new Error(`SAI_EVENT_PERSIST_FAILED: ${error.message}`);
  return { inserted: false };
}

export async function persistSaiCommand(command: SaiCommand): Promise<{ command: SaiCommand; inserted: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.from("sai_commands").insert({
    command_id: command.commandId, idempotency_key: command.idempotencyKey, business_id: command.actor.businessId,
    actor_user_id: command.actor.userId, capability: command.capability, payload: command.payload, risk: command.risk,
    approval_id: command.approvalId ?? null, status: command.status, verification: command.verification,
    created_at: command.createdAt, updated_at: command.updatedAt,
  });
  if (!error) return { command, inserted: true };
  if (error.code !== "23505") throw new Error(`SAI_COMMAND_PERSIST_FAILED: ${error.message}`);
  const { data, error: readError } = await supabase.from("sai_commands").select("*").eq("idempotency_key", command.idempotencyKey).maybeSingle();
  if (readError || !data) throw new Error(`SAI_COMMAND_IDEMPOTENCY_READ_FAILED: ${readError?.message ?? "command not found"}`);
  return { command: rowToCommand(data), inserted: false };
}

export async function updateSaiCommand(commandId: string, patch: Partial<Pick<SaiCommand, "status" | "verification" | "approvalId">> & { error?: string | null }): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("sai_commands").update({
    ...(patch.status ? { status: patch.status } : {}), ...(patch.verification ? { verification: patch.verification } : {}),
    ...(patch.approvalId !== undefined ? { approval_id: patch.approvalId ?? null } : {}),
    ...(patch.error !== undefined ? { error: patch.error } : {}),
  }).eq("command_id", commandId);
  if (error) throw new Error(`SAI_COMMAND_UPDATE_FAILED: ${error.message}`);
}

export async function persistSaiCommandStep(input: {
  commandId: string; stepIndex: number; capability: string; input: Record<string, unknown>;
  status: "planned" | "executing" | "executed" | "verified" | "failed" | "cancelled";
  startedAt?: string; completedAt?: string; error?: string | null;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("sai_command_steps").upsert({
    command_id: input.commandId, step_index: input.stepIndex, capability: input.capability, input: input.input,
    status: input.status, started_at: input.startedAt ?? null, completed_at: input.completedAt ?? null, error: input.error ?? null,
  }, { onConflict: "command_id,step_index" });
  if (error) throw new Error(`SAI_COMMAND_STEP_PERSIST_FAILED: ${error.message}`);
}

export async function persistSaiCommandResult(command: SaiCommand, result: SaiCapabilityResult, stepIndex?: number): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("sai_command_results").insert({
    command_id: command.commandId, step_index: stepIndex ?? null, ok: result.ok, output: result.output ?? {},
    error: result.error ?? null, evidence_ids: result.evidenceIds ?? [],
  });
  if (error) throw new Error(`SAI_COMMAND_RESULT_PERSIST_FAILED: ${error.message}`);
}

export async function getSaiCommandResult(commandId: string): Promise<SaiCapabilityResult | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("sai_command_results").select("ok,output,error,evidence_ids")
    .eq("command_id", commandId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`SAI_COMMAND_RESULT_READ_FAILED: ${error.message}`);
  if (!data) return null;
  return { ok: Boolean(data.ok), output: (data.output as Record<string, unknown>) ?? {}, error: data.error ?? undefined, evidenceIds: data.evidence_ids ?? [] };
}

export async function persistSaiEvidence(input: {
  evidenceId: string; actor?: SaiActor; sourceType: string; sourceRef?: string; observedAt?: string;
  contentHash?: string; data: Record<string, unknown>; confidence?: number;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("sai_evidence").insert({
    evidence_id: input.evidenceId, business_id: input.actor?.businessId ?? null, source_type: input.sourceType,
    source_ref: input.sourceRef ?? null, observed_at: input.observedAt ?? new Date().toISOString(),
    content_hash: input.contentHash ?? null, data: input.data, confidence: input.confidence ?? null,
  });
  if (error && error.code !== "23505") throw new Error(`SAI_EVIDENCE_PERSIST_FAILED: ${error.message}`);
}

function rowToCommand(row: Record<string, unknown>): SaiCommand {
  return {
    commandId: String(row.command_id), idempotencyKey: String(row.idempotency_key),
    actor: { userId: String(row.actor_user_id), businessId: String(row.business_id) },
    capability: String(row.capability), payload: (row.payload as Record<string, unknown>) ?? {},
    risk: row.risk as SaiCommand["risk"], approvalId: row.approval_id ? String(row.approval_id) : undefined,
    status: row.status as SaiCommand["status"], verification: row.verification as SaiCommand["verification"],
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}
