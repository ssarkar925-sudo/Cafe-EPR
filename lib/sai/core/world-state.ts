import { createClient } from "@/lib/supabase/server";
import type { SaiActor, SaiEvent, SaiAttentionItem, SaiWorldState } from "./types";

const recentEvents: SaiEvent[] = [];
const MAX_LOCAL_EVENTS = 500;
const MAX_DURABLE_EVENT_IDS = 50;

export function recordSaiEvent(event: SaiEvent): void {
  recentEvents.push(event);
  if (recentEvents.length > MAX_LOCAL_EVENTS) {
    recentEvents.splice(0, recentEvents.length - MAX_LOCAL_EVENTS);
  }
}

export function getSaiWorldState(route?: string): SaiWorldState {
  return {
    observedAt: new Date().toISOString(),
    route,
    activeModule: getActiveModule(route),
    attention: [],
    facts: {
      recentEventCount: recentEvents.length,
      durable: false,
    },
  };
}

export async function loadSaiWorldState(actor: SaiActor, route?: string): Promise<SaiWorldState> {
  const supabase = await createClient();
  const [stateResult, attentionResult] = await Promise.all([
    supabase
      .from("sai_world_state")
      .select(
        "route,active_module,customer,transaction,facts,recent_event_ids,last_event_id,last_event_type,last_entity_id,last_event_occurred_at,version,observed_at"
      )
      .eq("business_id", actor.businessId)
      .eq("actor_user_id", actor.userId)
      .maybeSingle(),
    supabase
      .from("sai_attention")
      .select("attention_id,type,severity,title,detail,evidence_ids")
      .eq("actor_user_id", actor.userId)
      .in("status", ["open", "acknowledged"])
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (stateResult.error) {
    throw new Error(`SAI_WORLD_STATE_READ_FAILED: ${stateResult.error.message}`);
  }
  if (attentionResult.error) {
    throw new Error(`SAI_WORLD_ATTENTION_READ_FAILED: ${attentionResult.error.message}`);
  }

  const row = stateResult.data as Record<string, unknown> | null;
  const facts = isRecord(row?.facts) ? row.facts : {};
  const version = Number(row?.version ?? 0);
  const localCount = recentEvents.length;
  const attention = ((attentionResult.data ?? []) as Array<Record<string, unknown>>).map(toAttentionItem);

  return {
    observedAt: String(row?.observed_at ?? new Date().toISOString()),
    route: route ?? (row?.route ? String(row.route) : undefined),
    activeModule:
      getActiveModule(route) ??
      (row?.active_module ? String(row.active_module) : undefined),
    customer: isRecord(row?.customer) ? row.customer : null,
    transaction: isRecord(row?.transaction) ? row.transaction : null,
    attention,
    facts: {
      ...facts,
      durable: Boolean(row),
      worldStateVersion: version,
      recentEventCount: Math.max(Number(facts.recentEventCount ?? 0), localCount),
      recentDurableEventCount: Array.isArray(row?.recent_event_ids)
        ? row.recent_event_ids.length
        : 0,
      lastEventId: row?.last_event_id ?? facts.lastEventId ?? null,
      lastEventType: row?.last_event_type ?? facts.lastEventType ?? null,
      lastEntityId: row?.last_entity_id ?? facts.lastEntityId ?? null,
      lastEventOccurredAt: row?.last_event_occurred_at ?? facts.lastEventOccurredAt ?? null,
    },
  };
}

export async function projectSaiEventToWorldState(event: SaiEvent): Promise<void> {
  if (!event.actor?.userId || !event.actor.businessId) return;

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("sai_world_state")
    .select(
      "route,active_module,customer,transaction,facts,recent_event_ids,last_event_id,last_event_type,last_entity_id,last_event_occurred_at,version,observed_at"
    )
    .eq("business_id", event.actor.businessId)
    .eq("actor_user_id", event.actor.userId)
    .maybeSingle();

  if (readError) {
    throw new Error(`SAI_WORLD_STATE_READ_FAILED: ${readError.message}`);
  }

  const row = current as Record<string, unknown> | null;
  const currentFacts = isRecord(row?.facts) ? row.facts : {};
  const currentEventIds = Array.isArray(row?.recent_event_ids)
    ? row.recent_event_ids.map(String)
    : [];
  const recentEventIds = [...new Set([...currentEventIds, event.eventId])].slice(-MAX_DURABLE_EVENT_IDS);
  const version = Number(row?.version ?? 0) + 1;
  const now = new Date().toISOString();

  const nextFacts: Record<string, unknown> = {
    ...currentFacts,
    durable: true,
    worldStateVersion: version,
    recentEventCount: Math.max(Number(currentFacts.recentEventCount ?? 0) + 1, recentEventIds.length),
    lastEventId: event.eventId,
    lastEventType: event.type,
    lastEntityId: event.entityId ?? null,
    lastEventOccurredAt: event.occurredAt,
  };

  let transaction = isRecord(row?.transaction) ? row.transaction : null;
  if (event.type === "sale.created") {
    transaction = {
      type: "sale",
      saleId: event.payload.saleId ?? event.entityId ?? null,
      invoiceNumber: event.payload.invoiceNumber ?? null,
      totalAmount: event.payload.totalAmount ?? null,
      paymentStatus: event.payload.paymentStatus ?? null,
      observedAt: event.occurredAt,
      sourceEventId: event.eventId,
    };
  }

  const { error } = await supabase.from("sai_world_state").upsert(
    {
      business_id: event.actor.businessId,
      actor_user_id: event.actor.userId,
      route: row?.route ?? null,
      active_module: row?.active_module ?? null,
      customer: isRecord(row?.customer) ? row.customer : null,
      transaction,
      facts: nextFacts,
      recent_event_ids: recentEventIds,
      last_event_id: event.eventId,
      last_event_type: event.type,
      last_entity_id: event.entityId ?? null,
      last_event_occurred_at: event.occurredAt,
      version,
      observed_at: now,
      updated_at: now,
    },
    { onConflict: "business_id,actor_user_id" }
  );

  if (error) {
    throw new Error(`SAI_WORLD_STATE_WRITE_FAILED: ${error.message}`);
  }
}

export function getRecentSaiEvents(limit = 50): SaiEvent[] {
  return recentEvents.slice(-Math.max(1, Math.min(limit, MAX_LOCAL_EVENTS)));
}

function getActiveModule(route?: string): string | undefined {
  const segment = route?.split("?")[0]?.split("/").filter(Boolean)[0];
  return segment || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toAttentionItem(row: Record<string, unknown>): SaiAttentionItem {
  const severity = row.severity === "critical" || row.severity === "warning" ? row.severity : "info";
  const evidenceIds = Array.isArray(row.evidence_ids) ? row.evidence_ids.map(String) : [];
  return {
    id: String(row.attention_id),
    type: String(row.type ?? "attention"),
    severity,
    title: String(row.title ?? "SAI attention"),
    detail: row.detail ? String(row.detail) : undefined,
    evidenceIds,
  };
}
