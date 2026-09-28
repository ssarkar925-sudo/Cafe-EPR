import { createClient } from "@/lib/supabase/server";
import type { SaiActor, SaiAttentionItem } from "./types";

export type SaiAttentionSeverity = SaiAttentionItem["severity"];

export async function createSaiAttention(input: {
  actor: SaiActor;
  type: string;
  severity: SaiAttentionSeverity;
  title: string;
  detail?: string;
  evidenceIds?: string[];
  sourceType?: string;
  sourceRef?: string;
}): Promise<SaiAttentionItem> {
  const id = crypto.randomUUID();
  const item: SaiAttentionItem = {
    id,
    type: input.type,
    severity: input.severity,
    title: input.title,
    detail: input.detail,
    evidenceIds: input.evidenceIds ?? [],
  };
  const supabase = await createClient();
  const { error } = await supabase.from("sai_attention").insert({
    attention_id: id,
    business_id: input.actor.businessId,
    actor_user_id: input.actor.userId,
    type: input.type,
    severity: input.severity,
    title: input.title,
    detail: input.detail ?? null,
    evidence_ids: input.evidenceIds ?? [],
    source_type: input.sourceType ?? null,
    source_ref: input.sourceRef ?? null,
    status: "open",
  });
  if (error) throw new Error(`SAI_ATTENTION_CREATE_FAILED: ${error.message}`);
  return item;
}

export async function resolveSaiAttention(attentionId: string, resolution: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("sai_attention").update({
    status: "resolved",
    resolution,
    resolved_at: new Date().toISOString(),
  }).eq("attention_id", attentionId);
  if (error) throw new Error(`SAI_ATTENTION_RESOLVE_FAILED: ${error.message}`);
}
