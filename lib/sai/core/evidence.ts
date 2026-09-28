import { createClient } from "@/lib/supabase/server";
import { persistSaiEvidence } from "./persistence";
import type {
  SaiActor,
  SaiEvidenceLink,
  SaiEvidenceRecord,
  SaiEvidenceRelation,
  SaiEvidenceSubjectType,
  SaiEvent,
  SaiPlan,
} from "./types";

const SUBJECT_TYPES: SaiEvidenceSubjectType[] = [
  "event",
  "plan",
  "goal",
  "mission",
  "command",
  "command_step",
  "command_result",
  "verification",
  "attention",
  "evidence",
];

const RELATIONS: SaiEvidenceRelation[] = ["supports", "derived_from", "verifies", "caused_by", "explains"];

export async function hashSaiEvidence(data: Record<string, unknown>): Promise<string> {
  const canonical = stableStringify(data);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSaiEvidence(input: {
  evidenceId: string;
  actor?: SaiActor;
  sourceType: string;
  sourceRef?: string;
  subject?: { type: SaiEvidenceSubjectType; id: string; relation: SaiEvidenceRelation };
  parentEvidenceIds?: string[];
  data: Record<string, unknown>;
  confidence?: number;
}): Promise<SaiEvidenceRecord> {
  if (!input.evidenceId.trim()) throw new Error("SAI_EVIDENCE_ID_REQUIRED");
  if (!input.sourceType.trim()) throw new Error("SAI_EVIDENCE_SOURCE_REQUIRED");
  const observedAt = new Date().toISOString();
  const contentHash = await hashSaiEvidence(input.data);

  await persistSaiEvidence({
    evidenceId: input.evidenceId,
    actor: input.actor,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    observedAt,
    contentHash,
    data: input.data,
    confidence: input.confidence,
  });

  if (input.subject) {
    await linkSaiEvidence(input.actor, {
      evidenceId: input.evidenceId,
      subjectType: input.subject.type,
      subjectId: input.subject.id,
      relation: input.subject.relation,
    });
  }

  for (const parentEvidenceId of [...new Set(input.parentEvidenceIds ?? [])]) {
    if (!parentEvidenceId || parentEvidenceId === input.evidenceId) continue;
    await linkSaiEvidence(input.actor, {
      evidenceId: input.evidenceId,
      subjectType: "evidence",
      subjectId: parentEvidenceId,
      relation: "derived_from",
    });
  }

  return {
    evidenceId: input.evidenceId,
    actor: input.actor,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    observedAt,
    contentHash,
    data: input.data,
    confidence: input.confidence,
  };
}

export async function linkSaiEvidence(
  actor: SaiActor | undefined,
  input: SaiEvidenceLink,
): Promise<void> {
  if (!actor?.userId || !actor.businessId) return;
  if (!SUBJECT_TYPES.includes(input.subjectType)) throw new Error("SAI_EVIDENCE_SUBJECT_TYPE_INVALID");
  if (!RELATIONS.includes(input.relation)) throw new Error("SAI_EVIDENCE_RELATION_INVALID");

  const supabase = await createClient();
  const { error } = await supabase.from("sai_evidence_links").upsert(
    {
      business_id: actor.businessId,
      actor_user_id: actor.userId,
      evidence_id: input.evidenceId,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      relation: input.relation,
      created_at: input.createdAt || new Date().toISOString(),
    },
    { onConflict: "actor_user_id,evidence_id,subject_type,subject_id,relation" },
  );
  if (error) throw new Error(`SAI_EVIDENCE_LINK_FAILED: ${error.message}`);
}

export async function captureSaiEventEvidence(event: SaiEvent): Promise<SaiEvent> {
  const evidenceId = `event:${event.eventId}`;
  await createSaiEvidence({
    evidenceId,
    actor: event.actor,
    sourceType: `sai.event.${event.type}`,
    sourceRef: event.entityId ?? event.eventId,
    subject: { type: "event", id: event.eventId, relation: "supports" },
    data: {
      eventId: event.eventId,
      type: event.type,
      occurredAt: event.occurredAt,
      entityId: event.entityId ?? null,
      payload: event.payload,
    },
  });
  return {
    ...event,
    evidenceIds: [...new Set([...(event.evidenceIds ?? []), evidenceId])],
  };
}

export async function captureSaiPlanEvidence(plan: SaiPlan, actor: SaiActor): Promise<SaiEvidenceRecord> {
  return createSaiEvidence({
    evidenceId: `plan:${plan.planId}`,
    actor,
    sourceType: "sai.plan.compilation",
    sourceRef: plan.planId,
    subject: { type: "plan", id: plan.planId, relation: "explains" },
    data: {
      planId: plan.planId,
      version: plan.version,
      source: plan.source,
      goal: plan.goal,
      requiresApproval: plan.requiresApproval,
      steps: plan.steps.map((step) => ({
        stepId: step.stepId,
        capability: step.capability,
        risk: step.risk,
        dependsOn: step.dependsOn,
      })),
    },
  });
}

export async function getSaiEvidenceTrace(
  actor: SaiActor,
  subjectType: SaiEvidenceSubjectType,
  subjectId: string,
  limit = 100,
): Promise<Array<SaiEvidenceLink & { evidence: SaiEvidenceRecord | null }>> {
  if (!SUBJECT_TYPES.includes(subjectType)) throw new Error("SAI_EVIDENCE_SUBJECT_TYPE_INVALID");

  const supabase = await createClient();
  const { data: links, error: linkError } = await supabase
    .from("sai_evidence_links")
    .select("evidence_id,subject_type,subject_id,relation,created_at")
    .eq("business_id", actor.businessId)
    .eq("actor_user_id", actor.userId)
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 100)));

  if (linkError) throw new Error(`SAI_EVIDENCE_TRACE_READ_FAILED: ${linkError.message}`);
  const rows = (links ?? []) as Array<Record<string, unknown>>;
  const evidenceIds = [...new Set(rows.map((row) => String(row.evidence_id)))];
  if (!evidenceIds.length) return [];

  const { data: evidenceRows, error: evidenceError } = await supabase
    .from("sai_evidence")
    .select("evidence_id,business_id,source_type,source_ref,observed_at,content_hash,data,confidence")
    .eq("business_id", actor.businessId)
    .in("evidence_id", evidenceIds);

  if (evidenceError) throw new Error(`SAI_EVIDENCE_READ_FAILED: ${evidenceError.message}`);
  const evidenceMap = new Map(
    (evidenceRows ?? []).map((row) => [
      String(row.evidence_id),
      {
        evidenceId: String(row.evidence_id),
        actor: { userId: actor.userId, businessId: actor.businessId },
        sourceType: String(row.source_type),
        sourceRef: row.source_ref ? String(row.source_ref) : undefined,
        observedAt: String(row.observed_at),
        contentHash: String(row.content_hash ?? ""),
        data: isRecord(row.data) ? row.data : {},
        confidence: row.confidence === null || row.confidence === undefined ? undefined : Number(row.confidence),
      } satisfies SaiEvidenceRecord,
    ]),
  );

  return rows.map((row) => ({
    evidenceId: String(row.evidence_id),
    subjectType: String(row.subject_type) as SaiEvidenceSubjectType,
    subjectId: String(row.subject_id),
    relation: String(row.relation) as SaiEvidenceRelation,
    createdAt: String(row.created_at),
    evidence: evidenceMap.get(String(row.evidence_id)) ?? null,
  }));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(",")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
