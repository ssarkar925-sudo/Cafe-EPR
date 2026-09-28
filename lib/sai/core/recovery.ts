import { createClient } from "@/lib/supabase/server";
import { resolveSaiAttention } from "./attention";
import { persistSaiEvidence, persistSaiEvent } from "./persistence";
import type { SaiActor, SaiEvent } from "./types";

export type SaiRecoveryStatus = "succeeded" | "failed" | "blocked";

export type SaiRecoveryResult = {
  status: SaiRecoveryStatus;
  recoveryId?: string;
  attemptNumber?: number;
  evidenceId?: string;
  reason?: string;
};

const MAX_AUTOMATIC_ATTEMPTS = 1;

export async function recoverSaiAttention(input: {
  actor: SaiActor;
  attentionId: string;
  sourceRef: string;
  strategy: "retry_verification" | "manual_recheck";
  verify: () => Promise<{ ok: boolean; reason?: string; checks?: unknown; evidence?: unknown }>;
}): Promise<SaiRecoveryResult> {
  const supabase = await createClient();

  const { data: prior, error: priorError } = await supabase
    .from("sai_recovery_attempts")
    .select("recovery_id,attempt_number,status")
    .eq("attention_id", input.attentionId)
    .eq("actor_user_id", input.actor.userId)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (priorError) throw new Error(`SAI_RECOVERY_READ_FAILED: ${priorError.message}`);

  const nextAttempt = (prior?.attempt_number ?? 0) + 1;
  if (input.strategy === "retry_verification" && nextAttempt > MAX_AUTOMATIC_ATTEMPTS) {
    return { status: "blocked", attemptNumber: nextAttempt, reason: "Automatic recovery attempt limit reached." };
  }

  const recoveryId = crypto.randomUUID();
  const { error: insertError } = await supabase.from("sai_recovery_attempts").insert({
    recovery_id: recoveryId,
    attention_id: input.attentionId,
    business_id: input.actor.businessId,
    actor_user_id: input.actor.userId,
    attempt_number: nextAttempt,
    strategy: input.strategy,
    status: "planned",
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return { status: "blocked", attemptNumber: nextAttempt, reason: "Recovery attempt already exists; duplicate execution blocked." };
    }
    throw new Error(`SAI_RECOVERY_CREATE_FAILED: ${insertError.message}`);
  }

  await supabase.from("sai_recovery_attempts")
    .update({ status: "executing" })
    .eq("recovery_id", recoveryId)
    .eq("actor_user_id", input.actor.userId);

  let verified: { ok: boolean; reason?: string; checks?: unknown; evidence?: unknown };
  try {
    verified = await input.verify();
  } catch (error) {
    verified = {
      ok: false,
      reason: error instanceof Error ? error.message : "Recovery verification threw an unknown error.",
    };
  }

  const evidenceId = `sai-recovery:${recoveryId}`;
  await persistSaiEvidence({
    evidenceId,
    actor: input.actor,
    sourceType: "sai.recovery.verification",
    sourceRef: input.sourceRef,
    observedAt: new Date().toISOString(),
    data: { recoveryId, attentionId: input.attentionId, attemptNumber: nextAttempt, strategy: input.strategy, ok: verified.ok, reason: verified.reason ?? null, checks: verified.checks ?? null, evidence: verified.evidence ?? null },
    confidence: verified.ok ? 1 : 0,
  });

  const traceEvent: SaiEvent = {
    eventId: `sai.recovery:${recoveryId}`,
    type: "sai.recovery.completed",
    occurredAt: new Date().toISOString(),
    actor: input.actor,
    entityId: input.sourceRef,
    payload: {
      recoveryId,
      attentionId: input.attentionId,
      attemptNumber: nextAttempt,
      strategy: input.strategy,
      status: verified.ok ? "succeeded" : "failed",
      reason: verified.reason ?? null,
    },
    evidenceIds: [evidenceId],
  };
  await persistSaiEvent(traceEvent);

  const finalStatus: SaiRecoveryStatus = verified.ok ? "succeeded" : "failed";
  const { error: updateError } = await supabase.from("sai_recovery_attempts").update({
    status: finalStatus,
    reason: verified.reason ?? null,
    result: { ok: verified.ok, checks: verified.checks ?? null, evidence: verified.evidence ?? null },
    evidence_ids: [evidenceId],
    completed_at: new Date().toISOString(),
  }).eq("recovery_id", recoveryId).eq("actor_user_id", input.actor.userId);
  if (updateError) throw new Error(`SAI_RECOVERY_UPDATE_FAILED: ${updateError.message}`);

  if (verified.ok) {
    await resolveSaiAttention(input.attentionId, "SAI safely re-verified the authoritative state after the transient observation failure.");
    return { status: "succeeded", recoveryId, attemptNumber: nextAttempt, evidenceId };
  }

  await supabase.from("sai_attention").update({
    diagnosis_status: "diagnosed",
    recommended_action: "manual_check",
    auto_recovery_allowed: false,
  }).eq("attention_id", input.attentionId).eq("actor_user_id", input.actor.userId);

  return { status: "failed", recoveryId, attemptNumber: nextAttempt, evidenceId, reason: verified.reason ?? "Recovery verification failed." };
}
