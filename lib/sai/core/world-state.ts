import type { SaiEvent, SaiWorldState } from "./types";

const recentEvents: SaiEvent[] = [];

export function recordSaiEvent(event: SaiEvent): void {
  recentEvents.push(event);
  if (recentEvents.length > 500) recentEvents.splice(0, recentEvents.length - 500);
}

export function getSaiWorldState(route?: string): SaiWorldState {
  return {
    observedAt: new Date().toISOString(),
    route,
    attention: [],
    facts: { recentEventCount: recentEvents.length },
  };
}

export function getRecentSaiEvents(limit = 50): SaiEvent[] {
  return recentEvents.slice(-Math.max(1, Math.min(limit, 500)));
}