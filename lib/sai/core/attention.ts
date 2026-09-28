import { createClient } from "@/lib/supabase/server";
import type { SaiActor, SaiAttentionItem } from "./types";

export type SaiAttentionSeverity = SaiAttentionItem["severity"];
export type SaiRankableAttention = SaiAttentionItem & { createdAt?: string; diagnosisStatus?: string };

const SEVERITY_SCORE: Record<SaiAttentionSeverity, number> = { critical: 100, warning: 60, info: 20 };

export function rankSaiAttention(items: SaiRankableAttention[]): Array<SaiRankableAttention & { priorityScore: number }> {
  const now = Date.now();
  return items.map(item => {
    const ageHours = item.createdAt ? Math.max(0, (now - new Date(item.createdAt).getTime()) / 3600000) : 999;
    const recencyScore = item.createdAt ? Math.max(0, 20 - Math.min(20, ageHours)) : 0;
    const evidenceScore = Math.min(10, item.evidenceIds.length * 2);
    const diagnosisScore = item.diagnosisStatus === "diagnosed" ? 5 : item.diagnosisStatus === "recovery_ready" ? 8 : 0;
    return { ...item, priorityScore: SEVERITY_SCORE[item.severity] + recencyScore + evidenceScore + diagnosisScore };
  }).sort((a, b) => b.priorityScore - a.priorityScore);
}

export async function createSaiAttention(input: {
  actor: SaiActor; type: string; severity: SaiAttentionSeverity; title: string; detail?: string;
  evidenceIds?: string[]; sourceType?: string; sourceRef?: string;
}): Promise<SaiAttentionItem> {
  const id = crypto.randomUUID();
  const item: SaiAttentionItem = { id, type: input.type, severity: input.severity, title: input.title, detail: input.detail, evidenceIds: input.evidenceIds ?? [] };
  const supabase = await createClient();
  const { error } = await supabase.from("sai_attention").insert({
    attention_id: id, business_id: input.actor.businessId, actor_user_id: input.actor.userId, type: input.type,
    severity: input.severity, title: input.title, detail: input.detail ?? null, evidence_ids: input.evidenceIds ?? [],
    source_type: input.sourceType ?? null, source_ref: input.sourceRef ?? null, status: "open",
  });
  if (error) throw new Error(`SAI_ATTENTION_CREATE_FAILED: ${error.message}`);
  return item;
}

export async function resolveSaiAttention(attentionId: string, resolution: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("sai_attention").update({ status: "resolved", resolution, resolved_at: new Date().toISOString() }).eq("attention_id", attentionId);
  if (error) throw new Error(`SAI_ATTENTION_RESOLVE_FAILED: ${error.message}`);
}