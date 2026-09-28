import { registerSaiCapability } from "@/lib/sai/core/capabilities";
import type { SaiCapabilityResult } from "@/lib/sai/core/types";

export function registerBusinessObserveCapability(): void {
  try {
    registerSaiCapability({
      id: "business.observe",
      description: "Observe current CafeERP business context without mutating financial state.",
      risk: "read",
      requiresApproval: false,
      execute: async (_input): Promise<SaiCapabilityResult> => ({
        ok: true,
        output: {
          observed: true,
          source: "cafeerp-domain",
          note: "Business observation capability is connected; domain-specific queries are added by module adapters.",
        },
      }),
    });
  } catch {
    // Idempotent module initialization.
  }
}

registerBusinessObserveCapability();