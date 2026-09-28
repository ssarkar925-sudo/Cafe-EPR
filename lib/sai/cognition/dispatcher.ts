import { captureSaiEventEvidence } from "@/lib/sai/core/evidence";
import { persistSaiEvent } from "@/lib/sai/core/persistence";
import { projectSaiEventToWorldState, recordSaiEvent } from "@/lib/sai/core/world-state";
import type { SaiEvent } from "@/lib/sai/core/types";

type EventHandler = (event: SaiEvent) => Promise<void>;

const handlers = new Map<string, Set<EventHandler>>();

export function subscribeSaiEvent(type: string, handler: EventHandler): () => void {
  const set = handlers.get(type) ?? new Set<EventHandler>();
  set.add(handler);
  handlers.set(type, set);
  return () => set.delete(handler);
}

export async function dispatchSaiEvent(event: SaiEvent): Promise<void> {
  const eventWithEvidence = await captureSaiEventEvidence(event);
  const persisted = await persistSaiEvent(eventWithEvidence);
  recordSaiEvent(eventWithEvidence);

  if (!persisted.inserted) return;

  // The durable event ledger is authoritative. World-state projection is a recoverable
  // read model, so a projection outage must not block downstream SAI handlers.
  try {
    await projectSaiEventToWorldState(eventWithEvidence);
  } catch (error) {
    console.error("SAI_WORLD_STATE_PROJECTION_FAILED", {
      eventId: eventWithEvidence.eventId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const matching = [...(handlers.get(eventWithEvidence.type) ?? []), ...(handlers.get("*") ?? [])];
  await Promise.allSettled(matching.map((handler) => handler(eventWithEvidence)));
}
