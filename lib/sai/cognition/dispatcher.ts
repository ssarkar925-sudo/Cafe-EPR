import { recordSaiEvent } from "@/lib/sai/core/world-state";
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
  recordSaiEvent(event);
  const matching = [...(handlers.get(event.type) ?? []), ...(handlers.get("*") ?? [])];
  await Promise.allSettled(matching.map((handler) => handler(event)));
}