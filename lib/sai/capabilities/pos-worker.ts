import { subscribeSaiEvent } from "@/lib/sai/cognition/dispatcher";
import { handlePosSaleCreated } from "./pos-observe";
import type { SaiEvent } from "@/lib/sai/core/types";

let started = false;

export function startSaiPosWorker(): void {
  if (started) return;
  started = true;

  subscribeSaiEvent("sale.created", async (event: SaiEvent) => {
    const result = await handlePosSaleCreated(event);
    if (!result.ok) {
      // The event remains recorded in SAI world state; callers can surface this as attention.
      return;
    }
    // Verification is deliberately separate from observation.
    // A future POS domain adapter will reread the authoritative sale state here.
  });
}